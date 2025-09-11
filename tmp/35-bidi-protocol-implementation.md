# BiDi（WebDriver BiDi）プロトコルの実装

## 概要
PlaywrightはWebDriver BiDiプロトコルもサポートしています。これは実験的な機能として、内部APIで提供されています。

## BiDiプロトコルとは

**WebDriver BiDi**（Bidirectional）は、W3Cが策定している新しいブラウザ自動化プロトコルです：
- WebDriverとCDP（Chrome DevTools Protocol）の良いところを統合
- 双方向通信をサポート
- クロスブラウザで統一されたプロトコル（将来的に）

## Playwrightでの実装

### 1. BiDi対応ブラウザタイプ

Playwrightには内部的に2つのBiDiブラウザタイプが存在します：

```typescript
// packages/playwright-core/src/server/playwright.ts:68-69
this._bidiChromium = new BidiChromium(this);
this._bidiFirefox = new BidiFirefox(this);
```

### 2. アクセス方法

これらは公開APIではなく、内部APIとして実装されています：

```javascript
const playwright = require('playwright-core');

// 内部API（アンダースコア付き）
playwright._bidiChromium  // BiDi over CDP for Chromium
playwright._bidiFirefox   // Native BiDi for Firefox
```

### 3. BidiChromium（BiDi over CDP）

**実装場所**: `packages/playwright-core/src/server/bidi/bidiChromium.ts`

```typescript
override async connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<BidiBrowser> {
  // Chrome doesn't support Bidi, we create Bidi over CDP which is used by Chrome driver.
  const bidiTransport = await require('./bidiOverCdp').connectBidiOverCdp(transport);
  return BidiBrowser.connect(this.attribution.playwright, bidiTransport, options);
}

override supportsPipeTransport(): boolean {
  return false;  // WebSocketのみサポート
}
```

**特徴**：
- ChromiumはネイティブのBiDiをサポートしていない
- CDP上にBiDiプロトコルを実装（bidiOverCdp）
- ChromeDriverと同じアプローチ
- Pipe通信はサポートせず、WebSocketのみ

### 4. BidiFirefox（ネイティブBiDi）

**実装場所**: `packages/playwright-core/src/server/bidi/bidiFirefox.ts`

```typescript
override async connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<BidiBrowser> {
  return BidiBrowser.connect(this.attribution.playwright, transport, options);
}

override supportsPipeTransport(): boolean {
  return false;  // WebSocketのみサポート
}
```

**特徴**：
- FirefoxはネイティブでBiDiプロトコルをサポート
- 直接BiDi通信が可能
- Pipe通信はサポートせず、WebSocketのみ

### 5. 起動引数の違い

**BidiChromium**:
```typescript
// bidiChromium.ts:99
chromeArguments.push('--remote-debugging-port=0');
```
CDPポートを開いて、その上にBiDiを実装

**BidiFirefox**:
```typescript
// bidiFirefox.ts:104-105
firefoxArguments.push('-remote-debugging-port', String(kDebugPort));
firefoxArguments.push('-remote-allow-origins', '*');
```
FirefoxのリモートデバッグポートでBiDi通信

## 通信アーキテクチャ

### 通常のブラウザ起動との違い

```
通常のChromium:
  Playwright → CDP → Chromium

BiDi Chromium:
  Playwright → BiDi → CDP → Chromium
            (エミュレート)

通常のFirefox:
  Playwright → Juggler → Firefox

BiDi Firefox:
  Playwright → BiDi → Firefox
            (ネイティブ)
```

## 使用例（実験的）

```javascript
// 注意：これは内部APIなので、本番環境では使用しないでください
const { _bidiChromium, _bidiFirefox } = require('playwright-core');

// BiDi over CDP (Chromium)
const chromiumBrowser = await _bidiChromium.launch();

// Native BiDi (Firefox)
const firefoxBrowser = await _bidiFirefox.launch();
```

## なぜBiDiプロトコル？

### 利点：
1. **標準化**: W3C標準として、すべてのブラウザで同じプロトコル
2. **双方向通信**: イベントドリブンなアーキテクチャ
3. **将来性**: 各ブラウザベンダーが共同で開発

### 現状：
- まだ実験的段階
- Firefoxが最も進んだ実装
- Chromiumは部分的なサポート
- WebKitは未対応

## Playwrightでの位置づけ

1. **メインプロトコル**（安定版）:
   - Chromium: CDP
   - Firefox: Juggler
   - WebKit: WebInspector

2. **実験的プロトコル**（内部API）:
   - _bidiChromium: BiDi over CDP
   - _bidiFirefox: Native BiDi

3. **将来の展望**:
   - すべてのブラウザがBiDiをネイティブサポート
   - Playwrightの内部実装を統一
   - クロスブラウザの差異を最小化

## まとめ

BiDiプロトコルのサポートは、Playwrightが将来のブラウザ自動化標準に備えた先進的な実装です。現在は内部APIとして実験的に提供されていますが、将来的にはメインのプロトコルとして採用される可能性があります。