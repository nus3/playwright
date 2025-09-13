# ブラウザ固有のプロトコルと接続クラスの詳細

## 重要な発見：Playwrightは各ブラウザごとに異なるプロトコルを使用

あなたの観察は正しいです！`crConnection.ts`は**Chromium専用**であり、各ブラウザは独自の接続クラスとプロトコルを持っています。

## ブラウザごとの構成

### 1. Chromium（Chrome/Edge）
- **接続クラス**: `CRConnection` (`chromium/crConnection.ts`)
- **ブラウザクラス**: `CRBrowser` (`chromium/crBrowser.ts`)
- **プロトコル**: Chrome DevTools Protocol (CDP)
- **通信方式**: Pipe（デフォルト）またはWebSocket
- **コマンド例**: `Page.navigate`, `Runtime.evaluate`

### 2. Firefox
- **接続クラス**: `FFConnection` (`firefox/ffConnection.ts`)
- **ブラウザクラス**: `FFBrowser` (`firefox/ffBrowser.ts`)
- **プロトコル**: Juggler（Playwright独自開発）
- **通信方式**: Pipeのみ
- **コマンド例**: 独自のコマンド体系

### 3. WebKit（Safari）
- **接続クラス**: `WKConnection` (`webkit/wkConnection.ts`)
- **ブラウザクラス**: `WKBrowser` (`webkit/wkBrowser.ts`)
- **プロトコル**: WebInspector Protocol
- **通信方式**: Pipeのみ
- **特徴**: `pageProxyId`を使用したページ管理

## 各接続クラスの送信メソッド比較

### CRConnection（Chromium）
```typescript
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

### FFConnection（Firefox）
```typescript
_rawSend(message: ProtocolRequest) {
  this._protocolLogger('send', message);
  this._transport.send(message);
}
```

### WKConnection（WebKit）
```typescript
rawSend(message: ProtocolRequest) {
  this._protocolLogger('send', message);
  this._transport.send(message);
}
```

## 共通インターフェースによる抽象化

すべての接続クラスは`ConnectionTransport`インターフェースを使用しますが、**送信するコマンドの内容は各ブラウザ固有**です。

```typescript
interface ConnectionTransport {
  send(s: ProtocolRequest): void;
  close(): void;
  onmessage?: (message: ProtocolResponse) => void;
  onclose?: (reason?: string) => void;
}
```

## プロトコルメッセージの基本構造（共通）

```typescript
type ProtocolRequest = {
  id: number;
  method: string;      // ブラウザごとに異なるメソッド名
  params: any;         // ブラウザごとに異なるパラメータ
  sessionId?: string;  // CDPとWebInspectorで使用
};
```

## なぜ統一的に見えるのか

1. **Transport層は共通**: PipeTransportとWebSocketTransportは全ブラウザで共有
2. **メッセージ形式は統一**: JSON形式で`{ id, method, params }`構造
3. **Browser層で抽象化**: `Browser`基底クラスが共通APIを提供

## 実際のコマンドの違い（例：ページナビゲーション）

### Chromium (CDP)
```javascript
session.send('Page.navigate', { url: 'https://example.com' })
```

### Firefox (Juggler)
```javascript
session.send('Page.navigate', { url: 'https://example.com', frameId: ... })
// Jugglerは独自のパラメータ構造を持つ
```

### WebKit (WebInspector)
```javascript
session.send('Page.navigate', { url: 'https://example.com' })
// pageProxyIdによる管理が追加される
```

## まとめ

- **質問への回答**: PipeとWebSocketの違いは**Chromium内**での通信方式の違い
- **クロスブラウザ対応**: 各ブラウザは**完全に異なるプロトコル**を使用
- **統一的なAPI**: Playwrightが上位層で抽象化し、開発者には統一APIを提供
- **`crConnection.ts`**: Chromium専用であり、統一的ではない

これがPlaywrightのクロスブラウザサポートの核心部分です！