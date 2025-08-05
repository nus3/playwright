# ブラウザ抽象化レイヤーの仕組み

## 抽象化の階層

### 1. BrowserTypeレベル
```typescript
// 抽象基底クラス
export abstract class BrowserType {
  abstract connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<Browser>;
  abstract defaultArgs(options: types.LaunchOptions, isPersistent: boolean, userDataDir: string): string[];
  abstract attemptToGracefullyCloseBrowser(transport: ConnectionTransport): void;
}
```

各ブラウザごとの実装:
- `Chromium extends BrowserType`
- `Firefox extends BrowserType`
- `WebKit extends BrowserType`

### 2. Browserレベル
```typescript
export abstract class Browser {
  abstract doCreateNewContext(options: types.BrowserContextOptions): Promise<BrowserContext>;
  abstract contexts(): BrowserContext[];
  abstract isConnected(): boolean;
  abstract version(): string;
}
```

### 3. Pageレベル
```typescript
export interface PageDelegate {
  // 共通インターフェース
  readonly rawMouse: input.RawMouse;
  readonly rawKeyboard: input.RawKeyboard;
  reload(): Promise<void>;
  goBack(): Promise<boolean>;
  // ... 他の共通メソッド
}
```

## 通信プロトコルの抽象化

### ConnectionTransportインターフェース
```typescript
export interface ConnectionTransport {
  send(message: ProtocolRequest): void;
  close(): void;
}
```

各ブラウザが異なるプロトコルを使用:
- **Chromium**: CDP (Chrome DevTools Protocol)
- **Firefox**: Juggler Protocol
- **WebKit**: Modified WebInspector Protocol

## チャンネルベースの通信

Playwrightは内部的にチャンネルベースの通信を使用:
- クライアント ↔ サーバー間の通信を統一
- プロトコルの違いを吸収
- `packages/protocol/src/channels.d.ts`で定義