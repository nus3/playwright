# Playwright クロスブラウザプロトコル 実動作版

Playwrightが各ブラウザで使用する3つの異なるプロトコルを実際に動作させるデモです。

## 概要

このプロジェクトは、Playwrightが各ブラウザで使用する3つの異なるプロトコルを実際に動作させ、ブラウザを操作します：

- **Chrome**: CDP (Chrome DevTools Protocol) - 実際のChromeブラウザを操作
- **Firefox**: Juggler (Playwright独自) - PlaywrightのFirefoxビルドを操作  
- **Safari**: 拡張WebInspectorプロトコル - PlaywrightのWebKitビルドを操作

## 必須要件

### 1. Node.js
```bash
node --version  # v14以上
```

### 2. Playwrightブラウザのインストール
```bash
# Playwrightプロジェクトのルートで実行
cd ..
npx playwright install

# または、この npm script で確認
npm run install-browsers
```

### 3. ブラウザインストール確認
```bash
npm run check-browsers
```

## 実行方法

### 全プロトコルのデモ実行
```bash
npm run demo
```

### 個別プロトコルの実行
```bash
npm run cdp          # CDP (Chromium)
npm run juggler      # Juggler (Firefox)  
npm run webinspector # WebInspector (WebKit)
```

### ダイレクト実行（個別ファイル）
```bash
npm run cdp-direct
npm run juggler-direct
npm run webinspector-direct
```

### デバッグモード
```bash
npm run debug        # プロトコルメッセージを表示
npm run debug-browser # ブラウザログを表示
```

## ファイル構成

```
cross-browser-protocols-working/
├── all-browsers-demo.js         # 統合デモ実行
├── cdp-simple-working.js        # CDP実装（実動作版）
├── juggler-real-working.js      # Juggler実装（実動作版）
├── webinspector-webkit-real.js  # WebInspector実装（実動作版）
├── install-playwright-firefox.js # Firefox自動インストール
├── package.json                # npm scripts
└── README.md                   # このファイル
```

## 各プロトコルの実装詳細

### 1. CDP (Chrome) - cdp-simple-working.js

**プロトコル:**
- Chrome DevTools Protocol (CDP)
- WebSocket通信

**実行内容:**
1. システムのChromeを`--remote-debugging-port=9222`で起動
2. WebSocket経由でCDPに接続
3. `Page.navigate` → `Runtime.evaluate` → `Page.captureScreenshot`

**生成ファイル:** `simple-cdp-screenshot.png`

### 2. Juggler (Firefox) - juggler-real-working.js

**プロトコル:**
- Juggler (Playwright独自プロトコル)
- Pipe通信

**実行内容:**
1. PlaywrightのFirefoxを`--juggler-pipe`で起動
2. stdio[3]/stdio[4]パイプ通信でJugglerに接続
3. セッション管理 + `Page.navigate` + frameId → `Runtime.evaluate` → `Page.screenshot`

**生成ファイル:** `juggler-real-screenshot.png`

### 3. WebInspector (Safari) - webinspector-webkit-real.js

**プロトコル:**
- WebInspector Protocol (Playwright拡張版)
- Pipe通信

**実行内容:**
1. PlaywrightのWebKitを起動
2. パイプ通信でWebInspectorに接続
3. `Playwright.navigate` → `Runtime.evaluate` → `Playwright.screenshot`

**生成ファイル:** `webinspector-screenshot.png`

## 実行例

```bash
$ npm run demo

╔════════════════════════════════════════════════════════╗
║  Playwright クロスブラウザプロトコル 実動作デモ       ║
╚════════════════════════════════════════════════════════╝

🚀 1. CDP (Chrome DevTools Protocol) デモ開始
─────────────────────────────────────────────────────────
CDP: Chromiumブラウザを起動中...
CDP: WebSocketエンドポイント: ws://localhost:9222/...
CDP: 接続成功！
CDP: 新しいページを作成しました
CDP: https://example.com に移動中...
CDP: ページ移動完了
CDP: ページタイトル = "Example Domain"
CDP: スクリーンショットを取得しました

=== CDP デモ完了 ===
✅ 取得したタイトル: Example Domain
✅ スクリーンショット: cdp-screenshot.png

🦊 2. Juggler (Firefox独自プロトコル) デモ開始
─────────────────────────────────────────────────────────
# ... 同様にJuggler実行

🍎 3. WebInspector (WebKit拡張版) デモ開始
─────────────────────────────────────────────────────────
# ... 同様にWebInspector実行

╔════════════════════════════════════════════════════════╗
║               デモ実行結果サマリー                     ║
╚════════════════════════════════════════════════════════╝

┌─────────────────┬─────────┬──────────────────────────┐
│ プロトコル      │ 状態    │ 取得タイトル             │
├─────────────────┼─────────┼──────────────────────────┤
│ 🚀 CDP          │ ✅ 成功 │ Example Domain           │
│ 🦊 Juggler      │ ✅ 成功 │ Example Domain           │
│ 🍎 WebInspector │ ✅ 成功 │ Example Domain           │
└─────────────────┴─────────┴──────────────────────────┘

📸 生成されたスクリーンショット:
  ✅ cdp-screenshot.png (45KB)
  ✅ juggler-screenshot.png (42KB)
  ✅ webinspector-screenshot.png (43KB)
```

## トラブルシューティング

### ブラウザが見つからないエラー
```bash
# Playwrightブラウザを再インストール
npm run install-browsers

# インストール状況を確認
npm run check-browsers
```

### ポート競合エラー（CDP）
```bash
# 使用中のプロセスを確認
lsof -i :9222

# プロセスを終了
kill -9 <PID>
```

### 権限エラー（Linux）
```bash
# 必要に応じて sandbox を無効化（セキュリティ注意）
export CHROME_ARGS="--no-sandbox"
```

## 技術的詳細

### プロトコルメッセージの例

**CDP:**
```json
{
  "id": 1,
  "method": "Page.navigate",
  "params": { "url": "https://example.com" }
}
```

**Juggler:**
```json
{
  "id": 1,
  "method": "Page.navigate", 
  "params": {
    "url": "https://example.com",
    "frameId": "frame_main_1"
  }
}
```

**WebInspector:**
```json
{
  "id": 1,
  "method": "Playwright.navigate",
  "params": {
    "url": "https://example.com",
    "pageProxyId": "page_proxy_1",
    "frameId": "main_frame_1"
  }
}
```

## Playwrightとの違い

このデモは教育目的で、Playwrightの内部実装を直接使用しています。実際のPlaywrightは：

1. **高レベルAPI**: `page.goto()` などの統一API
2. **エラーハンドリング**: 堅牢なエラー処理とリトライ
3. **最適化**: パフォーマンス最適化と安定性向上
4. **機能の完全性**: 全ブラウザ機能の完全サポート

## ライセンス

Apache License 2.0 - Playwrightプロジェクトに準拠