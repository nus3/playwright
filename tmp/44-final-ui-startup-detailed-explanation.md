# final-ui-startupイベントで実行される処理の詳細

## final-ui-startupとは

`final-ui-startup`は、Firefoxの起動シーケンスの中で、**初期アプリケーションウィンドウが開かれた後**に発火するイベントです。これは、FirefoxのUIが完全に初期化され、ブラウザが操作可能になったタイミングを示します。

## 実行される処理の詳細（Juggler.js:93-149）

### 1. TargetRegistryとNetworkObserverの初期化（96-97行目）

```javascript
const targetRegistry = new TargetRegistry();
new NetworkObserver(targetRegistry);
```

- **TargetRegistry**: ブラウザのタブ（ターゲット）を管理するレジストリ
- **NetworkObserver**: ネットワークリクエスト/レスポンスを監視するオブザーバー

### 2. ヘッドレスモード用のスタイルシート読み込み（99-106行目）

```javascript
const loadStyleSheet = () => {
  if (Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo).isHeadless) {
    // hidden-scrollbars.cssを読み込み
    // ヘッドレスモードでスクロールバーを隠す
    const uri = ioService.newURI('chrome://juggler/content/content/hidden-scrollbars.css', null, null);
    styleSheetService.loadAndRegisterSheet(uri, styleSheetService.AGENT_SHEET);
  }
};
```

ヘッドレスモードの場合、スクロールバーを非表示にするCSSを適用します。

### 3. Hidden Windowの強制作成（108-112行目）

```javascript
// Force create hidden window here, otherwise its creation later closes the web socket!
if (Services.appShell.hasHiddenWindow) {
  Services.appShell.hiddenDOMWindow;
}
```

macOSでは、後でhidden windowが作成されるとWebSocketが閉じる問題があるため、ここで事前に作成します。

### 4. パイプ（nsRemoteDebuggingPipe）の取得と初期化（116-137行目）

```javascript
// C++で実装されたパイプコンポーネントを取得
const pipe = Cc['@mozilla.org/juggler/remotedebuggingpipe;1']
  .getService(Ci.nsIRemoteDebuggingPipe);

// JavaScriptのconnectionオブジェクトを作成
const connection = {
  // パイプからメッセージを受信したときの処理
  receiveMessage(message) {
    if (this.onmessage)
      this.onmessage({ data: message });  // Dispatcherに転送
  },
  
  // パイプが切断されたときの処理
  disconnected() {
    if (browserHandler)
      browserHandler['Browser.close']();  // ブラウザを閉じる
  },
  
  // メッセージ送信処理
  send(message) {
    if (pipeStopped) return;
    pipe.sendMessage(message);  // C++パイプに送信
  },
};

// パイプを初期化（connectionをC++側に渡す）
pipe.init(connection);
```

これが**Playwrightとの通信チャネル**の確立です。

### 5. DispatcherとBrowserHandlerの作成（138-146行目）

```javascript
// コマンドディスパッチャーを作成
const dispatcher = new Dispatcher(connection);

// ブラウザ全体を制御するハンドラーを作成
browserHandler = new BrowserHandler(
  dispatcher.rootSession(), 
  dispatcher, 
  targetRegistry, 
  browserStartupFinishedPromise,
  () => {
    // クリーンアップ処理
    if (this._silent)
      Services.startup.exitLastWindowClosingSurvivalArea();
    connection.onclose();
    pipe.stop();
    pipeStopped = true;
  }
);

// ルートセッションにBrowserHandlerを設定
dispatcher.rootSession().setHandler(browserHandler);
```

- **Dispatcher**: Playwrightからのコマンドを適切なハンドラーにルーティング
- **BrowserHandler**: Browser.*コマンド（Browser.newPage、Browser.closeなど）を処理

### 6. 最終処理（147-148行目）

```javascript
loadStyleSheet();  // スタイルシートを適用
dump(`\nJuggler listening to the pipe\n`);  // コンソールに出力
```

## 実行タイミングの重要性

`final-ui-startup`が選ばれている理由：

1. **UIの準備完了**: Firefoxのウィンドウとすべての基本UIコンポーネントが初期化済み
2. **XPCOMサービス利用可能**: すべての必要なサービスが起動済み
3. **早すぎず遅すぎない**: 
   - 早すぎると必要なコンポーネントが未初期化
   - 遅すぎるとユーザーの待ち時間が増える

## データフロー

```
Playwright
    ↓ (stdio pipe)
nsRemoteDebuggingPipe (C++)
    ↓ (receiveMessage)
connection (JavaScript)
    ↓ (onmessage)
Dispatcher
    ↓ (ルーティング)
BrowserHandler / PageHandler
    ↓ (Firefox内部API呼び出し)
Firefox Browser
```

## まとめ

`final-ui-startup`では、Jugglerの**コア機能がすべて初期化**されます：

1. **通信チャネル確立**: Playwrightとの双方向通信パイプ
2. **コマンド処理体制構築**: Dispatcher→Handler体制
3. **監視システム起動**: TargetRegistry、NetworkObserver
4. **UI調整**: ヘッドレスモード対応

この時点で、Firefoxは完全にPlaywrightの制御下に入り、自動化の準備が整います。