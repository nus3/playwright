# Playwright の BiDi プロトコル実装の共通性について

## 調査結果サマリー

**結論: Firefox と Chromium で BiDi プロトコルの実装は同じものを利用しています。**

## 実装の詳細

### 1. 共通の BidiBrowser クラス

Firefox と Chromium の両方で、同じ `BidiBrowser` クラスを使用しています。

**Firefox の実装 (bidiFirefox.ts:45-46)**
```typescript
override async connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<BidiBrowser> {
  return BidiBrowser.connect(this.attribution.playwright, transport, options);
}
```

**Chromium の実装 (bidiChromium.ts:40-47)**
```typescript
override async connectToTransport(transport: ConnectionTransport, options: BrowserOptions, browserLogsCollector: RecentLogsCollector): Promise<BidiBrowser> {
  // Chrome doesn't support Bidi, we create Bidi over CDP which is used by Chrome driver.
  // bidiOverCdp depends on chromium-bidi which we only have in devDependencies, so
  // we load bidiOverCdp dynamically.
  const bidiTransport = await require('./bidiOverCdp').connectBidiOverCdp(transport);
  (transport as any)[kBidiOverCdpWrapper] = bidiTransport;
  try {
    return BidiBrowser.connect(this.attribution.playwright, bidiTransport, options);
  }
  // ...エラー処理
}
```

### 2. 共通のコンポーネント

両ブラウザで以下のコンポーネントが共通して使用されています：

- **BidiBrowser** (`packages/playwright-core/src/server/bidi/bidiBrowser.ts`)
  - BiDi プロトコルでのブラウザ操作の基本実装
  
- **BidiBrowserContext** (`packages/playwright-core/src/server/bidi/bidiBrowser.ts:180`)
  - ブラウザコンテキストの管理
  
- **BidiPage** (`packages/playwright-core/src/server/bidi/bidiPage.ts:40`)
  - ページ操作の実装
  
- **BidiConnection** (`packages/playwright-core/src/server/bidi/bidiConnection.ts`)
  - BiDi プロトコルの通信層

### 3. 主な違い

#### Chromium の特殊対応
Chromium は BiDi プロトコルをネイティブサポートしていないため、**BiDi over CDP** という仕組みを使用：

```typescript
// bidiChromium.ts:44
const bidiTransport = await require('./bidiOverCdp').connectBidiOverCdp(transport);
```

これは CDP (Chrome DevTools Protocol) の上に BiDi プロトコルをエミュレートする層を追加しています。

#### Firefox のネイティブサポート
Firefox は BiDi プロトコルをネイティブサポートしているため、直接接続が可能：

```typescript
// bidiFirefox.ts:114
const match = message.match(/WebDriver BiDi listening on (ws:\/\/.*)$/);
```

### 4. 起動時の違い

**Firefox:**
- WebDriver BiDi のエンドポイントを直接提供
- `--remote-debugging-port=0` オプションで起動

**Chromium:**
- CDP エンドポイントを取得してから BiDi over CDP で変換
- 同じく `--remote-debugging-port=0` オプションで起動

## まとめ

Playwright は BiDi プロトコルの実装において、以下の設計を採用しています：

1. **共通実装の最大化**: BidiBrowser、BidiBrowserContext、BidiPage などのコアコンポーネントは完全に共通
2. **差分の吸収**: ブラウザ固有の違いは BidiFirefox/BidiChromium クラスで吸収
3. **プロトコル変換**: Chromium では CDP から BiDi への変換層（bidiOverCdp）を利用

この設計により、BiDi プロトコルのコマンドやイベント処理のロジックを一度実装するだけで、両ブラウザで動作させることが可能になっています。