# CDP (Chrome DevTools Protocol) トレース

PlaywrightがChromiumに送信するCDPコマンドを確認するツールです。

## ファイル

- `trace-cdp-all-in-one.mjs` - オールインワン版（1ファイルで完結）

## 使い方

```bash
node examples_nus3/trace-cdp-all-in-one.mjs
```

このコマンド1つで：
1. ブラウザが起動（headless: false）
2. https://playwright.dev にアクセス
3. CDPコマンドを整形して表示
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

### 3. 生のCDPログを確認
```bash
DEBUG=pw:protocol node examples_nus3/trace-cdp.mjs 2>&1 | grep "SEND"
```

## 主要なCDPコマンド

| コマンド | 説明 |
|---------|------|
| `Browser.getVersion` | ブラウザバージョン取得 |
| `Target.setAutoAttach` | 新規ターゲットの自動アタッチ設定 |
| `Target.createTarget` | 新しいタブ/ページ作成 |
| `Page.navigate` | URLへナビゲート |
| `Page.enable` | Pageドメインを有効化 |
| `Runtime.evaluate` | JavaScript実行 |
| `DOM.getDocument` | DOMツリー取得 |
| `Network.enable` | ネットワーク監視を有効化 |

## 確認ポイント

1. **Playwrightは確実にCDPを使用**: Chrome DevTools Protocolコマンドが送信されている
2. **Pipe通信がデフォルト**: `--remote-debugging-pipe`による高速通信
3. **ドメイン別の役割分担**: Page、Target、Runtime、Network等でコマンドが分類されている