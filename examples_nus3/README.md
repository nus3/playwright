# ブラウザプロトコルトレーサー

Playwright が各ブラウザに送信するプロトコルコマンドを確認するツール群です。

## ファイル

- `trace-cdp-all-in-one.mjs` - Chromium CDP トレーサー
- `trace-firefox-juggler.mjs` - Firefox Juggler トレーサー
- `trace-webkit-inspector.mjs` - WebKit WebInspector トレーサー

## 使い方

### Chromium (CDP)

```bash
node examples_nus3/trace-cdp-all-in-one.mjs
```

### Firefox (Juggler)

```bash
node examples_nus3/trace-firefox-juggler.mjs
```

### WebKit (WebInspector)

```bash
node examples_nus3/trace-webkit-inspector.mjs
```

各コマンドで：

1. ブラウザが起動（headless: false）
2. https://playwright.dev にアクセス
3. プロトコルコマンドを整形して表示
4. サマリーを出力

出力例：

```
🔍 CDP Command Viewer

============================================================

📤 [  1] Browser.getVersion
📤 [  2] Target.setAutoAttach
         └─ autoAttach: true, waitForDebugger: true
📤 [  5] Target.createTarget
         └─ URL: about:blank
📤 [ 21] Page.navigate
         └─ URL: https://playwright.dev/
```

## 生のプロトコルログ確認

### Chromium (CDP)

```bash
DEBUG=pw:protocol node examples_nus3/test-cdp-raw.mjs
```

### Firefox (Juggler)

```bash
DEBUG=pw:protocol node examples_nus3/test-firefox-raw.mjs
```

### WebKit (WebInspector)

```bash
DEBUG=pw:protocol node examples_nus3/test-webkit-raw.mjs
```

特定のログだけを見たい場合：

```bash
# SENDのみ
node examples_nus3/test-cdp-raw.mjs 2>&1 | grep "SEND"

# RECVのみ
node examples_nus3/test-cdp-raw.mjs 2>&1 | grep "RECV"
```

## 主要な CDP コマンド

| コマンド               | 説明                             |
| ---------------------- | -------------------------------- |
| `Browser.getVersion`   | ブラウザバージョン取得           |
| `Target.setAutoAttach` | 新規ターゲットの自動アタッチ設定 |
| `Target.createTarget`  | 新しいタブ/ページ作成            |
| `Page.navigate`        | URL へナビゲート                 |
| `Page.enable`          | Page ドメインを有効化            |
| `Runtime.evaluate`     | JavaScript 実行                  |
| `DOM.getDocument`      | DOM ツリー取得                   |
| `Network.enable`       | ネットワーク監視を有効化         |

## 確認ポイント

1. **Playwright は確実に CDP を使用**: Chrome DevTools Protocol コマンドが送信されている
2. **Pipe 通信がデフォルト**: `--remote-debugging-pipe`による高速通信
3. **ドメイン別の役割分担**: Page、Target、Runtime、Network 等でコマンドが分類されている
