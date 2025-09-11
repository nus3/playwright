# Playwrightのクライアント-サーバーアーキテクチャ解説

## 概要
Playwrightにおける「クライアント」と「サーバー」は、**両方とも同じNode.jsプロセス内**で動作する内部アーキテクチャの層を指します。ブラウザとの関係ではありません。

## アーキテクチャの全体像

```
┌─────────────────────────────────────────────────────┐
│           あなたのNode.jsプロセス                      │
│                                                      │
│  ┌────────────────────────────────────────────┐     │
│  │     クライアント層 (Client Layer)            │     │
│  │  packages/playwright-core/src/client/       │     │
│  │                                             │     │
│  │  - BrowserType (ユーザーが使うAPI)          │     │
│  │  - Browser                                  │     │
│  │  - Page                                     │     │
│  │  - playwright.chromium.launch() など        │     │
│  └────────────────────────────────────────────┘     │
│                       ↓↑                             │
│              Channel/Dispatcher通信                   │
│              (同一プロセス内のメッセージパッシング)        │
│                       ↓↑                             │
│  ┌────────────────────────────────────────────┐     │
│  │     サーバー層 (Server Layer)               │     │
│  │  packages/playwright-core/src/server/       │     │
│  │                                             │     │
│  │  - Chromium (実際のブラウザ制御)            │     │
│  │  - Firefox                                  │     │
│  │  - WebKit                                   │     │
│  │  - BrowserType (基底クラス)                 │     │
│  └────────────────────────────────────────────┘     │
│                       ↓↑                             │
│              WebSocket/Pipe通信                       │
└───────────────────────│─────────────────────────────┘
                        │
    ┌───────────────────▼────────────────────┐
    │     Chromiumブラウザプロセス (子プロセス)  │
    │                                        │
    │  - 実際のブラウザインスタンス             │
    │  - CDP/Juggler/WebInspectorで通信      │
    └────────────────────────────────────────┘
```

## 各層の役割

### 1. クライアント層 (Client Layer)
**場所**: `packages/playwright-core/src/client/`

**役割**:
- ユーザーが直接操作するAPIを提供
- メソッド呼び出しをChannelメッセージに変換
- サーバーからの応答を適切なオブジェクトにラップ

**主要クラス**:
- `BrowserType` - launch()などのメソッドを提供
- `Browser` - newContext()などのメソッドを提供
- `Page` - goto()、click()などのメソッドを提供

### 2. サーバー層 (Server Layer)
**場所**: `packages/playwright-core/src/server/`

**役割**:
- 実際のブラウザプロセスの起動と管理
- ブラウザとの通信プロトコルの実装
- クライアントからのリクエストを実際の操作に変換

**主要クラス**:
- `Chromium` - Chromium固有の実装
- `Firefox` - Firefox固有の実装（Juggler使用）
- `WebKit` - WebKit固有の実装（WebInspector使用）

### 3. Channel/Dispatcher通信層
**場所**: `packages/playwright-core/src/server/dispatchers/` と `packages/playwright-core/src/client/`

**役割**:
- クライアント層とサーバー層の間でメッセージをやり取り
- 非同期通信の管理
- オブジェクトのシリアライズ/デシリアライズ

## 具体的な実装例

### クライアント側 (`client/browserType.ts:66-84`)
```typescript
async launch(options: LaunchOptions = {}): Promise<Browser> {
  // Channelを通じてサーバー側のlaunchメソッドを呼び出す
  const browser = Browser.from((await this._channel.launch(launchOptions)).browser);
  return browser;
}
```

### サーバー側 (`server/browserType.ts:68-74`)
```typescript
async launch(progress: Progress, options: types.LaunchOptions): Promise<Browser> {
  // 実際にブラウザプロセスを起動
  return this._innerLaunchWithRetries(progress, options, ...);
}
```

### InProcessFactoryの役割 (`inProcessFactory.ts`)
```typescript
export function createInProcessPlaywright(): PlaywrightImpl {
  // 1. サーバー側のPlaywrightオブジェクトを作成
  const playwright = createPlaywright({ isInternal: true });
  
  // 2. DispatcherConnectionを作成（サーバー側）
  const dispatcherConnection = new DispatcherConnection(...);
  
  // 3. Connectionを作成（クライアント側）
  const connection = new Connection(...);
  
  // 4. 両者を接続
  dispatcherConnection.onmessage = message => connection.dispatch(message);
  connection.onmessage = message => dispatcherConnection.dispatch(message);
  
  // 5. クライアント側のPlaywrightオブジェクトを返す
  return connection.getObject('Playwright');
}
```

## よくある誤解

### ❌ 誤解: クライアント = ブラウザ、サーバー = Node.js
実際には両方ともNode.jsプロセス内の層です。

### ✅ 正解: 
- **クライアント層** = ユーザー向けAPI（Node.js内）
- **サーバー層** = ブラウザ制御実装（Node.js内）
- **ブラウザ** = 別の子プロセス

## なぜこのアーキテクチャ？

1. **抽象化**: ユーザーAPIと実装を分離
2. **拡張性**: 新しいブラウザの追加が容易
3. **テスタビリティ**: 各層を独立してテスト可能
4. **将来性**: リモート実行への拡張が可能（実際にplaywright-clientパッケージが存在）

## まとめ

Playwrightの「クライアント-サーバー」アーキテクチャは、同一Node.jsプロセス内での責務分離パターンです。これにより、きれいなAPIと柔軟な実装を両立しています。実際のブラウザは、このNode.jsプロセスから起動される別の子プロセスとして動作します。