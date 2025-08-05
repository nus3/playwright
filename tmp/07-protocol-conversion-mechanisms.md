# プロトコル変換と統一メカニズム

## 各ブラウザのプロトコル特徴

### 1. Chromium - CDP (Chrome DevTools Protocol)
- **成熟度**: 最も成熟したブラウザプロトコル
- **構造**: 複数ドメイン（Page、Input、Runtime、Network等）
- **メッセージ形式**: JSONベース

**スクリーンショット例:**
```typescript
// CDP
Page.captureScreenshot({
  format?: "jpeg"|"png"|"webp",
  quality?: number,
  clip?: Viewport,
  fromSurface?: boolean,
  captureBeyondViewport?: boolean
})
```

### 2. Firefox - Juggler Protocol
- **特徴**: Playwright専用に開発された独自プロトコル
- **場所**: `browser_patches/firefox/juggler/`
- **ライセンス**: Mozilla Public License

**スクリーンショット例:**
```typescript
// Juggler
Page.screenshot({
  mimeType: "image/png"|"image/jpeg",
  clip: Clip,
  quality?: number,
  omitDeviceScaleFactor?: boolean
})
```

### 3. WebKit - 拡張WebInspector Protocol
- **ベース**: Safari/WebKitのWebInspectorプロトコル
- **拡張**: 独自の`Playwright`ドメインを追加
- **特徴**: 複数の座標系サポート

**スクリーンショット例:**
```typescript
// WebKit
Page.snapshotRect({
  x: number, y: number, width: number, height: number,
  coordinateSystem: "Viewport"|"Page",
  omitDeviceScaleFactor?: boolean
})
```

## Playwrightの統一メカニズム

### PageDelegateパターン
```typescript
// 統一インターフェース
interface PageDelegate {
  takeScreenshot(
    progress: Progress, 
    format: string, 
    documentRect?: Rect, 
    viewportRect?: Rect, 
    quality?: number, 
    fitsViewport: boolean, 
    scale: 'css'|'device'
  ): Promise<Buffer>;
  
  navigateFrame(
    frame: Frame, 
    url: string, 
    referrer?: string
  ): Promise<GotoResult>;
}
```

### 各ブラウザの実装
```typescript
// Chromium実装
export class CRPage implements PageDelegate {
  async takeScreenshot(...args): Promise<Buffer> {
    // CDPの Page.captureScreenshot を呼び出し
    const result = await this._client.send('Page.captureScreenshot', {
      format, quality, clip, ...
    });
    return Buffer.from(result.data, 'base64');
  }
}

// Firefox実装
export class FFPage implements PageDelegate {
  async takeScreenshot(...args): Promise<Buffer> {
    // JugglerのPage.screenshotを呼び出し
    const result = await this._session.send('Page.screenshot', {
      mimeType, clip, quality, ...
    });
    return Buffer.from(result.data, 'base64');
  }
}

// WebKit実装
export class WKPage implements PageDelegate {
  async takeScreenshot(...args): Promise<Buffer> {
    // WebKitのPage.snapshotRectを呼び出し
    const result = await this._session.send('Page.snapshotRect', {
      x, y, width, height, coordinateSystem, ...
    });
    return Buffer.from(result.data, 'base64');
  }
}
```

## 主要な違いと変換処理

### 1. ナビゲーション
**Chromium:**
```typescript
const response = await this._client.send('Page.navigate', { 
  url, referrer, frameId: frame._id, referrerPolicy: 'unsafeUrl' 
});
```

**Firefox:**
```typescript
const response = await this._session.send('Page.navigate', { 
  url, referer, frameId: frame._id 
});
```

**WebKit:**
```typescript
const result = await this._pageProxySession.connection.browserSession.send('Playwright.navigate', { 
  url, pageProxyId, frameId: frame._id, referrer 
});
```

### 2. マウスイベント
各ブラウザで微妙に異なるパラメータ名や値を統一：

**統一処理例:**
```typescript
// 共通のマウスイベント処理
class RawMouseImpl {
  async click(x: number, y: number, options: ClickOptions) {
    // 各ブラウザ固有の実装に変換
    if (this.isChromeDebugger) {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: 'left', clickCount: 1
      });
    } else if (this.isFirefox) {
      await this._session.send('Page.dispatchMouseEvent', {
        type: 'mousedown', x, y, button: 0, buttons: 1
      });
    }
  }
}
```

### 3. 座標系の統一
各ブラウザの異なる座標系を統一：

- **Chromium**: CSS pixels基準
- **Firefox**: デバイス非依存ピクセル  
- **WebKit**: ViewportとPageの両座標系

**統一処理:**
```typescript
// scale パラメータで統一制御
takeScreenshot(scale: 'css' | 'device') {
  // 各ブラウザの座標系に適切に変換
}
```

## 重要な発見

1. **プロトコルの抽象化**: PageDelegateパターンで各ブラウザの違いを吸収
2. **パラメータの正規化**: 異なるパラメータ名・形式を内部で変換
3. **戻り値の統一**: 各ブラウザの異なる戻り値を共通形式に変換
4. **エラーハンドリング**: ブラウザ固有のエラーを統一されたエラー形式に変換

これにより、開発者は単一のAPIで全ブラウザを制御可能になっている。