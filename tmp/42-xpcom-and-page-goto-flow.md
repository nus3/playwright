# XPCOMとpage.goto()の詳細フロー解説

## XPCOMとは

XPCOM (Cross Platform Component Object Model) は、Firefoxの中核となるコンポーネントシステムです。

### XPCOMの特徴

1. **クロスプラットフォーム**: Windows、macOS、Linuxで同じコードが動作
2. **言語非依存**: C++、JavaScript、Rustなど複数の言語から利用可能
3. **コンポーネント指向**: インターフェースを通じて機能を公開
4. **動的ロード**: 必要に応じてコンポーネントを読み込み

### JugglerのXPCOMコンポーネント登録

```javascript
// components.conf
{
    "cid": "{f7a74a33-e2ab-422d-b022-4fb213dd2639}",  // Component ID
    "contract_ids": ["@mozilla.org/remote/juggler;1"],  // Contract ID
    "categories": {
        "command-line-handler": "m-remote",  // コマンドライン処理
        "profile-after-change": "Juggler",    // プロファイル初期化後に起動
    },
    "esModule": "chrome://juggler/content/components/Juggler.js",
    "constructor": "JugglerFactory",
}
```

これにより、Firefoxの起動時に自動的にJugglerコンポーネントが登録され、`-juggler-pipe`フラグで有効化されます。

## page.goto('https://playwright.dev')の完全なフロー

### ステップ1: Playwright側でのコマンド生成

```javascript
// examples_nus3/test-firefox-raw.mjs
await page.goto('https://playwright.dev');
```

### ステップ2: Page.navigateコマンドへの変換

```typescript
// packages/playwright-core/src/server/firefox/ffPage.ts:327-329
async navigateFrame(frame: frames.Frame, url: string, referer: string | undefined): Promise<frames.GotoResult> {
  const response = await this._session.send('Page.navigate', { 
    url, 
    referer, 
    frameId: frame._id 
  });
  return { newDocumentId: response.navigationId || undefined };
}
```

### ステップ3: プロトコルメッセージの送信

```typescript
// packages/playwright-core/src/server/firefox/ffConnection.ts:69-71
_rawSend(message: ProtocolRequest) {
  this._protocolLogger('send', message);  // DEBUG=pw:protocolでログ出力
  this._transport.send(message);           // stdioパイプへ送信
}
```

実際のメッセージ:
```json
{
  "method": "Page.navigate",
  "params": {
    "url": "https://playwright.dev/",
    "frameId": "mainframe-9"
  },
  "id": 13,
  "sessionId": "ac4520ca-9a35-4aee-b74b-87de20be7c15"
}
```

### ステップ4: Firefoxプロセスでの受信

```cpp
// browser_patches/firefox/juggler/pipe/nsRemoteDebuggingPipe.cpp
// Unix/Linux: ファイルディスクリプタ3から読み込み
const int readFD = 3;
size_t ReadBytes(void* buffer, size_t size, bool exact_size) {
    int sizeRead = read(readFD, static_cast<char*>(buffer) + bytesRead, 
                       size - bytesRead);
    // ...
}
```

### ステップ5: JavaScriptレイヤーへの配信

```javascript
// browser_patches/firefox/juggler/components/Juggler.js:117-122
const connection = {
  receiveMessage(message) {
    if (this.onmessage)
      this.onmessage({ data: message });  // Dispatcherへ
  },
};
```

### ステップ6: Dispatcherによるルーティング

```javascript
// browser_patches/firefox/juggler/protocol/Dispatcher.js
// メッセージを解析し、適切なハンドラーへルーティング
// sessionIdから対応するPageHandlerを特定
// Page.navigateメソッドを呼び出し
```

### ステップ7: PageHandlerでの処理

```javascript
// browser_patches/firefox/juggler/protocol/PageHandler.js:388-427
async ['Page.navigate']({frameId, url, referer}) {
  // 1. 対象のBrowsingContextを取得
  const browsingContext = this._pageTarget.frameIdToBrowsingContext(frameId);
  
  // 2. URLの検証
  const uri = NetUtil.newURI(url);
  
  // 3. 同一ドキュメント内ナビゲーションかチェック
  sameDocumentNavigation = browsingContext.currentURI && 
                          uri.hasRef && 
                          uri.equalsExceptRef(browsingContext.currentURI);
  
  // 4. リファラー情報の設定
  if (referer) {
    referrerURI = NetUtil.newURI(referer);
    referrerInfo = new ReferrerInfo(Ci.nsIReferrerInfo.UNSAFE_URL, true, referrerURI);
  }
  
  // 5. ナビゲーション開始の監視設定
  const unsubscribe = helper.addObserver((browsingContext, topic, loadIdentifier) => {
    navigationId = helper.toProtocolNavigationId(loadIdentifier);
  }, 'juggler-navigation-started-browser');
  
  // 6. 実際のナビゲーション実行（Firefoxの内部API呼び出し）
  browsingContext.loadURI(Services.io.newURI(url), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_IS_LINK,
    referrerInfo,
    hasValidUserGestureActivation: true,  // ユーザー操作として扱う
  });
  
  return { navigationId: sameDocumentNavigation ? null : navigationId };
}
```

### ステップ8: Firefoxの内部処理

`browsingContext.loadURI()`は、Firefoxの内部APIで実際のナビゲーションを開始：

1. **ネットワークリクエスト**: HTTPSリクエストを送信
2. **レスポンス処理**: HTMLを受信
3. **DOMパース**: HTMLをパースしてDOMツリーを構築
4. **レンダリング**: ページを描画

### ステップ9: イベントの通知

ナビゲーション中に発生するイベント：

```javascript
// ナビゲーション開始
{"method":"Page.navigationStarted","params":{"frameId":"mainframe-9","navigationId":"nav-25"}}

// ネットワークリクエスト
{"method":"Network.requestWillBeSent","params":{"url":"https://playwright.dev/","requestId":"9"}}

// レスポンス受信
{"method":"Network.responseReceived","params":{"requestId":"9","status":200}}

// DOM構築完了
{"method":"Page.navigationCommitted","params":{"frameId":"mainframe-9","url":"https://playwright.dev/"}}

// ページロード完了
{"method":"Page.eventFired","params":{"frameId":"mainframe-9","name":"load"}}
```

### ステップ10: Playwrightへの結果返却

```typescript
// FFConnection._onMessage()でレスポンス受信
// FFSession.send()のPromiseが解決
// page.goto()が完了
```

## 重要なFirefox内部オブジェクト

### BrowsingContext
- Firefoxのタブやiframeを表現する内部オブジェクト
- ナビゲーション、セキュリティ、履歴管理を担当
- `loadURI()`メソッドで実際のページ遷移を実行

### Services
Firefoxの各種サービスへのアクセスポイント：
- `Services.io`: ネットワークI/O
- `Services.scriptSecurityManager`: セキュリティ管理
- `Services.obs`: オブザーバーサービス（イベント監視）

### nsIWebNavigation
ナビゲーション関連の定数とインターフェース：
- `LOAD_FLAGS_IS_LINK`: リンククリックとして扱う
- `hasValidUserGestureActivation`: ユーザー操作として扱う（ポップアップブロック回避など）

## まとめ

1. **XPCOM**により、JugglerはFirefoxの深い部分に統合される
2. **stdioパイプ**で高速な双方向通信を実現
3. **BrowsingContext.loadURI()**がFirefoxの実際のナビゲーションAPIを呼び出す
4. **イベント監視**により、ナビゲーションの各段階をPlaywrightに通知
5. **システムプリンシパル**により、通常のWebページではアクセスできない権限で操作

この仕組みにより、PlaywrightはFirefoxを完全に制御し、ユーザーの操作と同等の動作を実現しています。