# ProtocolRequestの構造とブラウザ固有プロトコルの関係

## 重要な発見：ProtocolRequestは共通の「型」、中身は各ブラウザ固有

あなたの疑問は正しく、`ProtocolRequest`型は**全ブラウザ共通の構造**ですが、その**中身（method名とparams）は各ブラウザ固有**です。

## ProtocolRequest型の定義（transport.ts）

```typescript
export type ProtocolRequest = {
  id: number;           // メッセージID（共通）
  method: string;       // メソッド名（ブラウザ固有）
  params: any;          // パラメータ（ブラウザ固有）
  sessionId?: string;   // セッションID（CDP/WebInspectorで使用）
};
```

## 各ブラウザの`Protocol`型定義は別々

### 1. Chromium（chromium/protocol.d.ts）
```typescript
import type { Protocol } from './protocol';  // CDPの定義
// 例: Protocol.Page.navigate, Protocol.Runtime.evaluate
```

### 2. Firefox（firefox/protocol.d.ts）
```typescript
import type { Protocol } from './protocol';  // Jugglerの定義
// 独自のコマンド体系
```

### 3. WebKit（webkit/protocol.d.ts）
```typescript
import type { Protocol } from './protocol';  // WebInspectorの定義
// Safari独自のプロトコル
```

## 実際のコード例

### CRSession.send（Chromium）
```typescript
async send<T extends keyof Protocol.CommandParameters>(
  method: T,  // CDP固有のメソッド名
  params?: Protocol.CommandParameters[T]
): Promise<Protocol.CommandReturnValues[T]> {
  const id = this._connection._rawSend(this._sessionId, method, params);
  // ↑ ここでProtocolRequest型に変換される
}
```

### FFSession.send（Firefox）
```typescript
async send<T extends keyof Protocol.CommandParameters>(
  method: T,  // Juggler固有のメソッド名
  params?: Protocol.CommandParameters[T]
): Promise<Protocol.CommandReturnValues[T]> {
  const id = this._connection.nextMessageId();
  this._rawSend({ method, params, id });  // ProtocolRequest型
}
```

## なぜ混乱するのか

1. **型名が同じ**: 各ブラウザで`Protocol`という名前を使用
2. **構造が同じ**: `{ id, method, params }`という構造は共通
3. **インポートパスが似ている**: `'./protocol'`からインポート

しかし実際は：
- `chromium/protocol.d.ts`: CDPの定義
- `firefox/protocol.d.ts`: Jugglerの定義
- `webkit/protocol.d.ts`: WebInspectorの定義

## 具体例：Page.navigateの違い

### Chromium（CDP）
```typescript
session.send('Page.navigate', { 
  url: 'https://example.com' 
});
```

### Firefox（Juggler）
```typescript
session.send('Page.navigate', { 
  url: 'https://example.com',
  referrer: '',      // Juggler固有
  frameId: '...'     // Juggler固有
});
```

### WebKit（WebInspector）
```typescript
session.send('Page.navigate', { 
  url: 'https://example.com'
  // pageProxyIdで管理される
});
```

## Transport層の役割

`ConnectionTransport`インターフェースは、この**ProtocolRequest型のメッセージを送るだけ**：

```typescript
interface ConnectionTransport {
  send(s: ProtocolRequest): void;  // 型は同じ、中身が違う
  close(): void;
  onmessage?: (message: ProtocolResponse) => void;
  onclose?: (reason?: string) => void;
}
```

PipeTransportもWebSocketTransportも、この共通型を送信するだけで、**中身の解釈は各ブラウザのConnection層**が行います。

## まとめ

- **ProtocolRequest型**: 全ブラウザ共通の「封筒」
- **method/params**: ブラウザ固有の「手紙の内容」
- **各Protocol型定義**: ブラウザごとに完全に異なる
- **Transport層**: 封筒を運ぶだけ（中身は知らない）
- **Connection層**: 各ブラウザ固有の手紙を書く/読む

これがPlaywrightがクロスブラウザ対応を実現する巧妙な設計です！