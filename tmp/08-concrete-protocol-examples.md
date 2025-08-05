# 具体的なプロトコル変換の実例

## スクリーンショット機能の実装比較

### 統一インターフェース
```typescript
// PageDelegate共通インターフェース
takeScreenshot(
  progress: Progress, 
  format: 'png' | 'jpeg', 
  documentRect: types.Rect | undefined, 
  viewportRect: types.Rect | undefined, 
  quality: number | undefined, 
  fitsViewport: boolean, 
  scale: 'css' | 'device'
): Promise<Buffer>
```

### Chromium (CDP) 実装
```typescript
// packages/playwright-core/src/server/chromium/crPage.ts:277
const result = await progress.race(
  this._mainFrameSession._client.send('Page.captureScreenshot', { 
    format,           // 'png' | 'jpeg' 
    quality,          // 0-100
    clip,             // { x, y, width, height, scale }
    captureBeyondViewport: !fitsViewport 
  })
);
return Buffer.from(result.data, 'base64');
```

**特徴:**
- CDP標準の`Page.captureScreenshot`を使用
- `captureBeyondViewport`でビューポート外の描画制御
- デバイススケールファクターの自動調整

### Firefox (Juggler) 実装  
```typescript
// packages/playwright-core/src/server/firefox/ffPage.ts:422
const { data } = await progress.race(
  this._session.send('Page.screenshot', {
    mimeType: ('image/' + format) as ('image/png' | 'image/jpeg'),
    clip: documentRect,
    quality,
    omitDeviceScaleFactor: scale === 'css',
  })
);
return Buffer.from(data, 'base64');
```

**特徴:**
- Juggler独自の`Page.screenshot`を使用
- `mimeType`でフォーマット指定（CDPとは異なる）
- `omitDeviceScaleFactor`でCSS/デバイス座標系を制御

### WebKit 実装
```typescript
// packages/playwright-core/src/server/webkit/wkPage.ts (推定)
const result = await progress.race(
  this._session.send('Page.snapshotRect', {
    x: documentRect.x,
    y: documentRect.y, 
    width: documentRect.width,
    height: documentRect.height,
    coordinateSystem: scale === 'css' ? 'Viewport' : 'Page',
    omitDeviceScaleFactor: scale === 'css'
  })
);
return Buffer.from(result.data, 'base64');
```

**特徴:**
- WebKit独自の`Page.snapshotRect`を使用
- `coordinateSystem`で座標系を明示的に指定
- 他のブラウザとは異なる座標指定方式

## パラメータ変換の詳細

### 1. フォーマット指定
- **Chromium**: `format: 'png' | 'jpeg'`
- **Firefox**: `mimeType: 'image/png' | 'image/jpeg'`
- **WebKit**: ブラウザ側で判定

**Playwrightの変換:**
```typescript
// Firefox用変換
mimeType: ('image/' + format) as ('image/png' | 'image/jpeg')
```

### 2. 座標系とスケール
- **Chromium**: `clip.scale`で調整
- **Firefox**: `omitDeviceScaleFactor`フラグ
- **WebKit**: `coordinateSystem`で明示的指定

**Playwrightの変換:**
```typescript
// 共通パラメータから各ブラウザ固有の設定に変換
scale === 'css' ? omitDeviceScaleFactor: true : false  // Firefox
scale === 'css' ? 'Viewport' : 'Page'                  // WebKit
```

### 3. 品質設定
- **Chromium**: `quality?: number` (0-100)
- **Firefox**: `quality?: number` (0-100) 
- **WebKit**: 品質設定なし（自動）

## 戻り値の統一

全ブラウザで異なる戻り値構造を統一：

```typescript
// 全ブラウザ共通の戻り値
return Buffer.from(result.data || data, 'base64');
```

各ブラウザのレスポンス形式:
- **Chromium**: `{ data: string }` (base64)
- **Firefox**: `{ data: string }` (base64)
- **WebKit**: `{ data: string }` (base64)

## 座標計算の違い

### Chromium
```typescript
// ビジュアルビューポートを考慮した座標計算
const { visualViewport } = await this._client.send('Page.getLayoutMetrics');
documentRect = {
  x: visualViewport.pageX + viewportRect.x,
  y: visualViewport.pageY + viewportRect.y,
  width: viewportRect.width / visualViewport.scale,
  height: viewportRect.height / visualViewport.scale,
};
```

### Firefox
```typescript
// スクロールオフセットを手動取得
const scrollOffset = await this._page.mainFrame().waitForFunctionValueInUtility(
  progress, 
  () => ({ x: window.scrollX, y: window.scrollY })
);
documentRect = {
  x: viewportRect.x + scrollOffset.x,
  y: viewportRect.y + scrollOffset.y,
  width: viewportRect.width,
  height: viewportRect.height,
};
```

## 重要な洞察

1. **プロトコルの違いを完全に隠蔽**: 開発者は各ブラウザの違いを意識しない
2. **パラメータの正規化**: 同じ意味の設定を各ブラウザ固有の形式に変換
3. **座標系の統一**: 異なる座標計算方法を共通インターフェースで抽象化
4. **エラーの統一**: 各ブラウザ固有のエラーを共通形式に標準化

この仕組みにより、Playwrightは「一度書けばどこでも動く」クロスブラウザテストを実現している。