# 各ブラウザ固有の実装詳細

## Chromium (Chrome/Edge)

### 起動引数
```typescript
// chromium.ts
defaultArgs(): string[] {
  const chromeArguments = [
    '--user-data-dir=${userDataDir}',
    '--remote-debugging-pipe',  // または --remote-debugging-port
    '--no-startup-window',
    // ... 他の引数
  ];
}
```

### 特徴
- Chrome DevTools Protocol (CDP) をネイティブサポート
- 追加のパッチ不要
- `--remote-debugging-pipe` で通信

## Firefox

### 起動引数
```typescript
// firefox.ts
defaultArgs(): string[] {
  const firefoxArguments = [
    '-no-remote',
    '-headless',  // ヘッドレスモード時
    '-profile', userDataDir,
    '-juggler-pipe',  // Juggler通信用
    // ... 他の引数
  ];
}
```

### Jugglerプロトコル
- Playwright独自のプロトコル
- `browser_patches/firefox/juggler/` に実装
- Firefoxの内部APIを公開するアドオン

### パッチの内容
- `JugglerFrameParent.jsm`: 親フレーム制御
- `PageAgent.js`: ページ操作API
- `NetworkObserver.js`: ネットワーク監視
- `screencast/`: スクリーンキャスト機能

## WebKit (Safari)

### 起動引数
```typescript
// webkit.ts
defaultArgs(): string[] {
  const webkitArguments = [
    '--inspector-pipe',
    '--headless',  // ヘッドレスモード時
    '--user-data-dir=${userDataDir}',
    // プロキシ設定（プラットフォーム別）
    process.platform === 'darwin' ? '--proxy=${proxy.server}' : '--curl-proxy=${proxy.server}',
  ];
}
```

### 特徴
- WebInspectorプロトコルの拡張版を使用
- カスタムエンベッダー（Playwright.app）を使用
- プラットフォーム別の実装（Mac/Linux/Windows）

### パッチの内容
- `embedder/Playwright/`: カスタムブラウザアプリケーション
- Mac: Objective-C実装
- Windows: Win32 API実装

## 共通の課題と対応

### 1. イベント同期
- 各ブラウザのイベントタイミングの違いを吸収
- 例: Firefoxの非同期CSPエラー対応

### 2. 座標系の違い
- CSS座標 vs デバイス座標の変換
- ビューポートサイズの計算方法の統一

### 3. 機能サポートの差異
- PDF生成: Chromiumのみ
- カバレッジ: Chromiumのみ
- 各ブラウザの制限事項を適切に処理