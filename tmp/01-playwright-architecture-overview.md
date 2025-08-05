# Playwrightのアーキテクチャ概要

## ディレクトリ構造

```
playwright/
├── packages/
│   ├── playwright-core/    # コアライブラリ
│   │   └── src/
│   │       ├── server/     # サーバー側実装
│   │       │   ├── chromium/   # Chromium固有
│   │       │   ├── firefox/    # Firefox固有
│   │       │   └── webkit/     # WebKit固有
│   │       └── client/     # クライアント側API
│   └── protocol/          # プロトコル定義
└── browser_patches/       # ブラウザパッチ
    ├── firefox/          # Firefox用パッチ（Juggler）
    └── webkit/           # WebKit用パッチ
```

## 主要コンポーネント

1. **BrowserType** (抽象クラス)
   - 各ブラウザの起動・接続を管理
   - `packages/playwright-core/src/server/browserType.ts`

2. **Browser実装**
   - Chromium: `CRBrowser`
   - Firefox: `FFBrowser`
   - WebKit: `WKBrowser`

3. **Page実装**
   - 各ブラウザごとにPageDelegateを実装
   - 共通のPageクラスがDelegateパターンでブラウザ固有処理を委譲

## プロトコル

- **Chromium**: Chrome DevTools Protocol (CDP)を使用
- **Firefox**: Jugglerプロトコル（Playwright独自）
- **WebKit**: WebInspectorプロトコルの拡張版

## ブラウザパッチ

- Firefox: Jugglerアドオンを組み込み
- WebKit: 独自のPlaywrightエンベッダーを使用