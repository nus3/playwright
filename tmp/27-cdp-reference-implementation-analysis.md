# CDP実装の参考コード分析

## 調査目的
`cross-browser-protocols-working/cdp-simple-working.js`がどのPlaywright内部実装を参考にしているかを特定する

## 🎯 発見した参考実装

### 1. 核心ファイル群

| ファイル | 役割 | cdp-simple-working.jsとの対応 |
|----------|------|--------------------------------|
| **crConnection.ts** | CDP接続とセッション管理 | WebSocket通信と`sendCommand`の実装 |
| **crPage.ts** | ページ操作の実装 | `navigateToPage`, `takeScreenshot`の実装 |
| **chromium.ts** | ブラウザー起動とCDP接続 | `launch`メソッドと接続確立処理 |
| **crBrowser.ts** | ブラウザーとターゲット管理 | Targetの作成とアタッチ処理 |

## 🔍 具体的な参考箇所

### A. WebSocket接続管理 (`crConnection.ts`)

#### Playwright内部の実装
```typescript
// crConnection.ts:62-70
_rawSend(sessionId: string, method: string, params: any): number {
  const id = ++this._lastId;
  const message: ProtocolRequest = { id, method, params };
  if (sessionId)
    message.sessionId = sessionId;
  this._protocolLogger('send', message);
  this._transport.send(message);
  return id;
}
```

#### cdp-simple-working.jsでの簡略実装
```javascript
// cdp-simple-working.js:93-116
const sendCommand = async (method, params = {}) => {
  const id = ++messageId;
  const message = { id, method, params };
  
  if (sessionId && method !== 'Target.attachToTarget' && method !== 'Target.createTarget') {
    message.sessionId = sessionId;
  }
  
  return new Promise((resolve, reject) => {
    pendingMessages.set(id, resolve);
    ws.send(JSON.stringify(message));
    // timeout処理...
  });
};
```

### B. ページナビゲーション (`crPage.ts`)

#### Playwright内部の実装
```typescript
// crPage.ts:579
async _navigate(frame: frames.Frame, url: string, referrer: string | undefined): Promise<frames.GotoResult> {
  const response = await this._client.send('Page.navigate', { url, referrer, frameId: frame._id, referrerPolicy: 'unsafeUrl' });
  if (response.errorText)
    throw new frames.NavigationAbortedError(response.loaderId, `${response.errorText} at ${url}`);
  return { newDocumentId: response.loaderId };
}
```

#### cdp-simple-working.jsでの簡略実装
```javascript
// cdp-simple-working.js:181-190
const navigateToPage = async (url) => {
  console.log(`CDP: ${url} に移動中...`);
  
  const response = await sendCommand('Page.navigate', { url });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`CDP: ページ移動完了 (frameId: ${response.result.frameId})`);
  return response;
};
```

### C. ターゲット管理 (`crBrowser.ts`, `crConnection.ts`)

#### Playwright内部のターゲット作成
```typescript
// crBrowser.ts:115-119
const { browserContextId } = await this._session.send('Target.createBrowserContext', {
  disposeOnDetach: true,
  proxyServer: proxy ? proxy.server : undefined,
  proxyBypassList,
});
```

#### cdp-simple-working.jsでのターゲット作成
```javascript
// cdp-simple-working.js:163-178
const createNewPage = async () => {
  const response = await sendCommand('Target.createTarget', {
    url: 'about:blank'
  });
  targetId = response.result.targetId;

  const attachResponse = await sendCommand('Target.attachToTarget', {
    targetId: targetId,
    flatten: true
  });
  sessionId = attachResponse.result.sessionId;

  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  
  console.log('CDP: 新しいページを作成しました');
};
```

## 🎭 実装パターンの違い

### 1. 構造の差

| 項目 | Playwright内部 | cdp-simple-working.js |
|------|----------------|------------------------|
| **アーキテクチャ** | Class-based OOP | 関数ファクトリパターン |
| **Session管理** | CRSession class | 単純なglobal変数 |
| **エラーハンドリング** | ProtocolError class | Promise reject |
| **型安全性** | 完全TypeScript | 型なしJavaScript |

### 2. 機能の差

#### Playwright内部：完全な機能
- 複数セッション管理 (`_sessions` Map)
- フレーム階層管理 (`_sessionForFrame`)
- エラー復旧機構 (`_sendMayFail`)
- プロトコルロギング (`_protocolLogger`)

#### cdp-simple-working.js：最小実装
- 単一セッション (`sessionId`変数)
- 基本的なメッセージ送受信のみ
- シンプルなタイムアウト処理
- デバッグ用プロトコルログ出力

## 🏗️ 実装の洗練度比較

### セッション管理の複雑さ

#### Playwright内部 (crConnection.ts:142-152)
```typescript
async send<T extends keyof Protocol.CommandParameters>(
  method: T,
  params?: Protocol.CommandParameters[T]
): Promise<Protocol.CommandReturnValues[T]> {
  if (this._crashed || this._closed || this._connection._closed || this._connection._browserDisconnectedLogs)
    throw new ProtocolError(this._crashed ? 'crashed' : 'closed', undefined, this._connection._browserDisconnectedLogs);
  const id = this._connection._rawSend(this._sessionId, method, params);
  return new Promise((resolve, reject) => {
    this._callbacks.set(id, { resolve, reject, error: new ProtocolError('error', method) });
  });
}
```

#### cdp-simple-working.js（簡略版）
```javascript
const sendCommand = async (method, params = {}) => {
  // 基本的な状態チェックなし
  const id = ++messageId;
  const message = { id, method, params };
  
  return new Promise((resolve, reject) => {
    pendingMessages.set(id, resolve);
    ws.send(JSON.stringify(message));
    setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Command timeout: ${method}`));
      }
    }, 10000);
  });
};
```

## 🎪 カンファレンス発表での価値

### 1. 実装の抽象化レベル
- **本格実装**：複数セッション、エラー復旧、型安全性
- **学習版実装**：本質的な部分のみ、理解しやすい

### 2. Playwrightの設計思想
- **本格実装**：堅牢性とプロダクション品質を重視
- **学習版実装**：プロトコルの本質を理解することに集中

### 3. 実演での効果
- 同じことを実現するのに必要な実装量の違い
- Playwrightが隠蔽してくれる複雑さの可視化
- 「統一API」の価値の具体的証明

## 📊 参考実装マッピング表

| cdp-simple-working.js機能 | Playwright参考実装 | ファイル:行番号 |
|----------------------------|-------------------|----------------|
| `getChromeExecutablePath` | registry.findExecutable | chromium.ts:124 |
| `waitForCDP` | WebSocketTransport.connect | chromium.ts:94 |
| `sendCommand` | CRSession.send | crConnection.ts:142 |
| `createNewPage` | Target.createTarget | crBrowser.ts:115 |
| `navigateToPage` | Page.navigate | crPage.ts:579 |
| `getPageTitle` | Runtime.evaluate | crPage.ts:～ |
| `takeScreenshot` | Page.captureScreenshot | crPage.ts:～ |

## 💡 実装学習のポイント

1. **プロトコルの本質理解**：cdp-simple-working.jsは複雑な機能を排除して、CDPの基本メカニズムに集中
2. **Production vs Learning**：Playwright内部は堅牢性を重視、学習実装はシンプルさを重視
3. **抽象化の価値**：Playwrightの価値は複雑なプロトコル詳細を隠蔽することにある

Playwrightの`page.goto()`一つの裏で、これほど複雑で堅牢な実装が動いていることがよく理解できました。