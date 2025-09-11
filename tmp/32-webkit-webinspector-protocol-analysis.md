# Safari WebKit実装の詳細解析 - WebInspectorプロトコル

## 概要
PlaywrightがSafari/WebKitブラウザを制御するための実装について、WebInspectorプロトコルの詳細と、Safari特有のpageProxyId概念を調査しました。

## 1. WebKitブラウザの起動プロセス

### 1.1 起動時の引数
`packages/playwright-core/src/server/webkit/webkit.ts:61-99`

```typescript
override defaultArgs(options: types.LaunchOptions, isPersistent: boolean, userDataDir: string): string[] {
  const webkitArguments = ['--inspector-pipe'];  // Pipe通信を使用
  
  if (headless)
    webkitArguments.push('--headless');
  
  // その他のオプション...
  return webkitArguments;
}
```

**重要なポイント**：
- `--inspector-pipe`: WebInspectorプロトコルをstdio pipeで通信
- ChromiumのCDPやFirefoxのJugglerとは異なる独自プロトコル

### 1.2 接続の確立
`packages/playwright-core/src/server/webkit/webkit.ts:37-39`

```typescript
override connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<WKBrowser> {
  return WKBrowser.connect(this.attribution.playwright, transport, options);
}
```

## 2. WebInspectorプロトコルの実装構造

### 2.1 プロトコル定義
`packages/playwright-core/src/server/webkit/protocol.d.ts`

WebInspectorプロトコルの型定義ファイル。標準的なWeb Inspector APIに加えて、Playwright専用の拡張が含まれています。

### 2.2 通信レイヤー
`packages/playwright-core/src/server/webkit/wkConnection.ts`

#### 基本構造
```typescript
export class WKConnection {
  private readonly _transport: ConnectionTransport;
  readonly browserSession: WKSession;
  
  constructor(transport: ConnectionTransport, ...) {
    this.browserSession = new WKSession(this, '', (message: any) => {
      this.rawSend(message);
    });
  }
}
```

#### メッセージディスパッチ
```typescript
private _dispatchMessage(message: ProtocolResponse) {
  if (message.pageProxyId) {
    // pageProxyIdを持つメッセージは特別処理
    const payload: PageProxyMessageReceivedPayload = { 
      message: message, 
      pageProxyId: message.pageProxyId 
    };
    this.browserSession.dispatchMessage({ 
      method: kPageProxyMessageReceived, 
      params: payload 
    });
    return;
  }
  // 通常のメッセージ処理
  this.browserSession.dispatchMessage(message);
}
```

## 3. Safari特有のpageProxyId概念

### 3.1 pageProxyIdとは
`packages/playwright-core/src/server/webkit/protocol.d.ts:7260-7262`

```typescript
/**
 * Id of WebPageProxy.
 */
export type PageProxyID = string;
```

**WebPageProxy**は、WebKitアーキテクチャにおけるページの代理オブジェクトです。
- 各ページ（タブ）に一意のIDが割り当てられる
- ブラウザプロセスとWebコンテンツプロセス間の通信を仲介
- Playwrightはこれを使用してページを識別・制御

### 3.2 pageProxyIdの使用箇所

#### ページの作成
`packages/playwright-core/src/server/webkit/wkBrowser.ts:151-171`

```typescript
_onPageProxyCreated(event: Protocol.Playwright.pageProxyCreatedPayload) {
  const pageProxyId = event.pageProxyId;
  
  // pageProxyIdを使用してセッションを作成
  const pageProxySession = new WKSession(this._connection, pageProxyId, (message: any) => {
    this._connection.rawSend({ ...message, pageProxyId });
  });
  
  const wkPage = new WKPage(context, pageProxySession, opener || null);
  this._wkPages.set(pageProxyId, wkPage);  // pageProxyIdで管理
}
```

#### ページの破棄
`packages/playwright-core/src/server/webkit/wkBrowser.ts:173-180`

```typescript
_onPageProxyDestroyed(event: Protocol.Playwright.pageProxyDestroyedPayload) {
  const pageProxyId = event.pageProxyId;
  const wkPage = this._wkPages.get(pageProxyId);
  if (!wkPage) return;
  this._wkPages.delete(pageProxyId);
  wkPage.didClose();
}
```

#### ナビゲーション
`packages/playwright-core/src/server/webkit/wkPage.ts:516-518`

```typescript
const pageProxyId = this._pageProxySession.sessionId;
const result = await this._pageProxySession.connection.browserSession.send(
  'Playwright.navigate', 
  { url, pageProxyId, frameId: frame._id, referrer }
);
```

### 3.3 pageProxyIdによるメッセージルーティング

WebKitの特徴的な仕組みとして、pageProxyIdを使ったメッセージルーティングがあります：

1. **メッセージ送信時**: pageProxyIdをメッセージに付加
2. **メッセージ受信時**: pageProxyIdで対象ページを特定
3. **セッション管理**: 各ページが独自のWKSessionを持つ

## 4. WebKitパッチの内容

### 4.1 Playwrightドメインの追加
`browser_patches/webkit/patches/bootstrap.diff`

WebKitのソースコードにPlaywright専用のプロトコルドメインを追加：

```diff
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Playwright.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Screencast.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Dialog.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Emulation.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Input.json
```

これらは標準のWebInspectorには存在しない、Playwright専用の拡張機能です。

### 4.2 追加されたプロトコルドメイン

- **Playwright**: ブラウザ全体の制御（ページ作成、コンテキスト管理など）
- **Screencast**: 画面録画機能
- **Dialog**: ダイアログ制御
- **Emulation**: デバイスエミュレーション
- **Input**: 入力イベントのエミュレーション

## 5. ChromiumやFirefoxとの違い

### 5.1 プロトコルの違い

| ブラウザ | プロトコル | ベース |
|---------|-----------|--------|
| Chromium | CDP (Chrome DevTools Protocol) | 標準プロトコル |
| Firefox | Juggler | Playwright独自 |
| WebKit | WebInspector + 拡張 | 標準 + Playwright拡張 |

### 5.2 通信方式

すべてPipe通信をサポートしていますが、実装が異なります：

- **Chromium**: WebSocketまたはPipe
- **Firefox**: `-juggler-pipe`でstdio pipe
- **WebKit**: `--inspector-pipe`でstdio pipe

### 5.3 ページ識別

- **Chromium**: targetId
- **Firefox**: browsingContextId
- **WebKit**: pageProxyId

## 6. 実装の特徴

### 6.1 WebPageProxyの利点
- WebKitのネイティブアーキテクチャと一致
- プロセス分離モデルに適合
- 効率的なメッセージルーティング

### 6.2 拡張性
- 標準のWebInspectorプロトコルを基盤
- Playwright専用の拡張を追加
- 将来的な機能追加が容易

### 6.3 統一APIの実現
- pageProxyIdを内部で使用
- 外部APIではPageオブジェクトとして抽象化
- ユーザーは実装の違いを意識しない

## まとめ

WebKitの実装は、標準のWebInspectorプロトコルをベースに、Playwright専用の拡張を加えた設計になっています。pageProxyIdという概念を使用してページを管理し、WebKitのネイティブアーキテクチャと整合性を保ちながら、Playwrightの統一APIを実現しています。

ChromiumのCDPやFirefoxのJugglerとは異なるアプローチながら、最終的にはすべて同じPlaywright APIとして統一されており、ユーザーは内部の違いを意識することなく、同じコードで3つのブラウザを制御できます。