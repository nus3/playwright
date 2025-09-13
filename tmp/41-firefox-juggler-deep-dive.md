# Firefox Jugglerプロトコルの深掘り調査

## 概要

Jugglerは、PlaywrightがFirefoxを自動化するために独自開発したプロトコルです。Chrome DevTools Protocol (CDP)やWebKit WebInspectorとは異なり、完全にPlaywrightチーム主導で設計・実装されています。

## Jugglerプロトコルの基本構造

### プロトコルコマンドの例

```javascript
// Browser関連
Browser.enable
Browser.getInfo
Browser.createBrowserContext
Browser.setInitScripts
Browser.setDownloadOptions
Browser.setDefaultViewport
Browser.setColorScheme
Browser.newPage

// Page関連
Page.setInitScripts
Page.navigate
Page.evaluate
```

### 実際の通信例（DEBUG=pw:protocol）

```
SEND ► {"method":"Browser.enable","params":{"attachToDefaultContext":false,"userPrefs":[]},"id":1}
◀ RECV {"id":1}

SEND ► {"method":"Browser.newPage","params":{"browserContextId":"..."},"id":11}
◀ RECV {"id":11,"result":{"targetId":"..."}}
```

## Firefoxパッチの構造

### ディレクトリ構成

```
browser_patches/firefox/
├── juggler/
│   ├── components/         # XPCOMコンポーネント
│   │   └── Juggler.js      # メインエントリーポイント
│   ├── pipe/               # プロセス間通信
│   │   ├── nsRemoteDebuggingPipe.cpp  # C++パイプ実装
│   │   └── nsRemoteDebuggingPipe.h
│   ├── protocol/           # プロトコル実装
│   │   ├── Dispatcher.js   # コマンドディスパッチャー
│   │   └── BrowserHandler.js  # ブラウザコマンドハンドラー
│   ├── content/            # コンテンツスクリプト
│   │   └── JugglerFrameChild.jsm
│   ├── NetworkObserver.js  # ネットワーク監視
│   └── TargetRegistry.js   # ターゲット（ページ）管理
├── patches/                # Firefoxソースへのパッチ
└── preferences/            # Firefox設定
```

## パイプ通信の仕組み

### 1. C++レベルのパイプ実装

`nsRemoteDebuggingPipe.cpp`でstdio（ファイルディスクリプタ3と4）を使用した双方向通信を実装：

```cpp
// Unix/Linux環境
const int readFD = 3;   // 読み込み用
const int writeFD = 4;  // 書き込み用

// Windows環境
// 環境変数PW_PIPE_READ/PW_PIPE_WRITEから取得
HANDLE readHandle;
HANDLE writeHandle;
```

### 2. JavaScriptレベルの接続

`Juggler.js`でパイプクライアントを初期化：

```javascript
const pipe = Cc['@mozilla.org/juggler/remotedebuggingpipe;1']
  .getService(Ci.nsIRemoteDebuggingPipe);

const connection = {
  receiveMessage(message) {
    // メッセージ受信処理
  },
  send(message) {
    pipe.sendMessage(message);
  }
};

pipe.init(connection);
```

### 3. Playwright側の起動引数

```javascript
// firefox.ts
firefoxArguments.push('-juggler-pipe');  // パイプモードを有効化
```

## コマンドフロー

### 1. Playwright → Firefox

1. **Playwright側**: `FFSession.send()`でコマンド送信
2. **FFConnection**: `_rawSend()`でprotocolLoggerを通してログ出力
3. **Transport**: stdioパイプ経由でFirefoxプロセスへ送信
4. **Firefox側**: `nsRemoteDebuggingPipe`がメッセージ受信
5. **Juggler.js**: `connection.receiveMessage()`でJavaScriptレイヤーへ
6. **Dispatcher**: コマンドを適切なハンドラーへルーティング
7. **Handler**: 実際の処理を実行

### 2. Firefox → Playwright

1. **Firefox側**: イベント発生（例：ページロード完了）
2. **Handler**: イベントをJSONメッセージとして構築
3. **Connection**: `pipe.sendMessage()`で送信
4. **nsRemoteDebuggingPipe**: stdioパイプへ書き込み
5. **Playwright側**: Transport経由で受信
6. **FFConnection**: `_onMessage()`でprotocolLoggerを通してログ出力
7. **FFSession**: 適切なイベントリスナーへ通知

## Jugglerの特徴

### 1. Playwrightに特化した設計

- CDPやWebInspectorと異なり、Playwrightの要求に完全に最適化
- 不要な機能を持たず、必要最小限のAPIセット
- Playwright固有の機能（例：`__playwright_utility_world__`）をネイティブサポート

### 2. JSWindowActorの活用

```javascript
ActorManagerParent.addJSWindowActors({
  JugglerFrame: {
    parent: {
      esModuleURI: 'chrome://juggler/content/JugglerFrameParent.jsm',
    },
    child: {
      esModuleURI: 'chrome://juggler/content/content/JugglerFrameChild.jsm',
      events: {
        DOMWindowCreated: {},
        DOMDocElementInserted: {},
        DOMContentLoaded: {},
      },
    },
    allFrames: true,
  },
});
```

各フレームに対してJugglerFrameActorを生成し、DOMイベントを監視。

### 3. マルチコンテキスト対応

```javascript
Browser.createBrowserContext({
  removeOnDetach: true
})
```

ブラウザコンテキスト（プロファイル）を動的に作成・削除可能。

## 主要コンポーネント

### BrowserHandler

ブラウザレベルのコマンドを処理：
- `Browser.enable`: Juggler有効化
- `Browser.newPage`: 新規ページ作成
- `Browser.setDefaultViewport`: ビューポート設定
- `Browser.setColorScheme`: カラースキーム設定

### PageHandler

ページレベルのコマンドを処理：
- `Page.navigate`: URLへナビゲート
- `Page.evaluate`: JavaScript実行
- `Page.screenshot`: スクリーンショット取得

### NetworkObserver

ネットワークイベントを監視：
- リクエスト/レスポンスの監視
- インターセプト機能
- キャッシュ制御

### TargetRegistry

ページ（ターゲット）のライフサイクル管理：
- ページの作成/破棄を追跡
- ページIDとセッションの関連付け
- イベントの配信

## DEBUG=pw:protocolの動作原理

前回調査（`tmp/40-debug-protocol-logging-mechanism.md`）で判明した仕組みがJugglerでも同様に動作：

1. `helper.debugProtocolLogger()`でprotocolLoggerを作成
2. `FFConnection`の`_rawSend()`と`_onMessage()`でログ出力
3. 送信時は`SEND ►`、受信時は`◀ RECV`のプレフィックス付き

## まとめ

Jugglerは以下の点で革新的：

1. **独自プロトコル**: ブラウザベンダー提供のプロトコルに依存せず、Playwright専用に設計
2. **パイプ通信**: WebSocketではなくstdioパイプを使用し、高速・安定した通信
3. **深いFirefox統合**: XPCOMコンポーネントとして実装され、Firefoxの内部APIに直接アクセス
4. **効率的な設計**: Playwrightに必要な機能のみを実装し、オーバーヘッドを最小化

この設計により、PlaywrightはFirefoxに対してCDPを使うChromiumと同等のパフォーマンスと機能を実現しています。