# ConnectionTransportの仕組み

## ConnectionTransportインターフェース

```typescript
export interface ConnectionTransport {
  send(s: ProtocolRequest): void;
  close(): void;
  onmessage?: (message: ProtocolResponse) => void,
  onclose?: (reason?: string) => void,
}
```

Playwrightはこのインターフェースで各ブラウザとの通信を抽象化している。

## Transport実装の種類

### 1. WebSocketTransport
- **用途**: CDP (Chrome DevTools Protocol) over WebSocket
- **対象**: Chromium系ブラウザ（Chrome, Edge）
- **特徴**:
  - JSON-RPC over WebSocket
  - リダイレクト対応
  - Happy Eyeballs（デュアルスタック）対応

### 2. PipeTransport
- **用途**: プロセス間通信（stdin/stdout）
- **対象**: 全ブラウザ（起動時の通信）
- **特徴**:
  - ヌル文字（\0）区切りでメッセージを分割
  - 同期的なメッセージ処理

## 各ブラウザの接続方法

### Chromium (CRConnection)
```typescript
// chromium/crConnection.ts
export class CRConnection {
  constructor(parent: SdkObject, transport: ConnectionTransport, 
              protocolLogger: ProtocolLogger, browserLogsCollector: RecentLogsCollector) {
    this._transport = transport;
    this._transport.onmessage = this._onMessage.bind(this);
    this._transport.onclose = this._onClose.bind(this);
  }
  
  _rawSend(sessionId: string, method: string, params: any): number {
    const message: ProtocolRequest = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this._transport.send(message);
  }
}
```

**接続フロー**:
1. ブラウザ起動時に `--remote-debugging-pipe` または `--remote-debugging-port` を指定
2. PipeTransport（pipe）またはWebSocketTransport（port）で接続
3. CDP（Chrome DevTools Protocol）でメッセージ交換

### Firefox (FFConnection)
```typescript
// firefox/ffConnection.ts
export class FFConnection {
  constructor(transport: ConnectionTransport, protocolLogger: ProtocolLogger, 
              browserLogsCollector: RecentLogsCollector) {
    this._transport = transport;
    this._transport.onmessage = this._dispatchMessage.bind(this);
    this._transport.onclose = this._onTransportClose.bind(this);
  }
}
```

**接続フロー**:
1. ブラウザ起動時に `-juggler-pipe` を指定
2. PipeTransportで接続
3. Jugglerプロトコル（Playwright独自）でメッセージ交換

### WebKit (WKConnection)
```typescript
// webkit/wkConnection.ts
export class WKConnection {
  constructor(transport: ConnectionTransport, onDisconnect: () => void,
              protocolLogger: ProtocolLogger, browserLogsCollector: RecentLogsCollector) {
    this._transport = transport;
    this._transport.onmessage = this._dispatchMessage.bind(this);
    this._transport.onclose = this._onClose.bind(this);
  }
}
```

**接続フロー**:
1. ブラウザ起動時に `--inspector-pipe` を指定
2. PipeTransportで接続
3. 拡張されたWebInspectorプロトコルでメッセージ交換

## 共通パターン

1. **Transport抽象化**: すべてのブラウザがConnectionTransportインターフェースを使用
2. **メッセージルーティング**: 各接続クラスがTransportからのメッセージを適切なセッションに配信
3. **プロトコルロギング**: 統一されたログ機能
4. **エラーハンドリング**: Transport層での接続エラーを上位層に伝播

## プロトコルの違いを吸収する仕組み

各ブラウザの接続クラス（CRConnection、FFConnection、WKConnection）が：
1. ブラウザ固有のプロトコル詳細を隠蔽
2. 統一されたセッション管理を提供
3. Playwrightの上位レイヤーに一貫したインターフェースを提供