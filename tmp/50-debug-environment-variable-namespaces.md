# DEBUG環境変数で使用可能なpw:名前空間の一覧

PlaywrightではDEBUG環境変数に`pw:`プレフィックスを付けた名前空間を指定することで、様々なレベルのデバッグログを出力できます。

## 利用可能な名前空間一覧

`packages/playwright-core/src/server/utils/debugLogger.ts`の`debugLoggerColorMap`で定義されている名前空間：

| 名前空間 | カラーコード | 色 | 用途 |
|---------|------------|---|------|
| `pw:api` | 45 | シアン | PlaywrightのAPI呼び出しのトレース |
| `pw:protocol` | 34 | 緑 | ブラウザとのプロトコル通信（CDP/Juggler/WebInspector） |
| `pw:install` | 34 | 緑 | ブラウザのインストール・ダウンロード処理 |
| `pw:download` | 34 | 緑 | ファイルダウンロード処理 |
| `pw:browser` | 0 | リセット（デフォルト） | ブラウザプロセス関連（ffmpeg等） |
| `pw:socks` | 92 | 紫 | SOCKSプロキシの通信ログ |
| `pw:client-certificates` | 92 | 紫 | クライアント証明書関連 |
| `pw:error` | 160 | 赤 | エラーログ |
| `pw:channel` | 33 | 青 | チャンネル通信 |
| `pw:server` | 45 | シアン | Playwrightサーバーの動作ログ |
| `pw:server:channel` | 34 | 緑 | サーバーのチャンネル通信 |
| `pw:server:metadata` | 33 | 青 | サーバーのメタデータ |
| `pw:recorder` | 45 | シアン | レコーダー機能関連 |

## 各名前空間の詳細

### pw:api
**用途**: PlaywrightのAPIメソッド呼び出しとその結果をトレース
**出力例**:
```
pw:api   navigated to "https://example.com"
pw:api   "load" event fired
pw:api   "networkidle" event fired
pw:api   finding element using the selector "button"
```

### pw:protocol
**用途**: ブラウザとのプロトコルレベル通信をトレース（CDP、Juggler、WebInspector）
**出力例**:
```
pw:protocol SEND ► {"id":1,"method":"Browser.getVersion","params":{}}
pw:protocol ◀ RECV {"id":1,"result":{"product":"Chrome/128.0.6613.18"}}
```

### pw:install / pw:download
**用途**: ブラウザのインストールやダウンロード処理の進捗
**出力例**:
```
pw:install downloading Firefox - attempt #1
pw:install running download:
pw:install -- from url: https://playwright.azureedge.net/...
pw:install -- to location: /tmp/playwright-download-firefox.zip
pw:install SUCCESS installing Firefox
```

### pw:browser
**用途**: ブラウザプロセスやffmpeg等の外部プロセス関連のログ
**出力例**:
```
pw:browser Closing stdin...
pw:browser ffmpeg finished input.
pw:browser ffmpeg onkill exitCode=0 signal=null
```

### pw:socks
**用途**: SOCKSプロキシ経由の接続ログ
**出力例**:
```
pw:socks [uid123] => request example.com:443
pw:socks [uid123] <= connected to network 192.168.1.1:443
pw:socks [uid123] <= browser socket closed
```

### pw:server
**用途**: Playwrightサーバーの動作状態（接続、切断、モード切り替え等）
**出力例**:
```
pw:server Server started at Mon Sep 16 2025
pw:server [1] serving connection: /ws
pw:server [1] engaged launch mode for "chromium"
pw:server [1] started socks proxy on port 12345
pw:server [1] disconnected. error: undefined
pw:server [1] finished cleanup
```

## 使用方法

### 基本的な使用
```bash
# 単一の名前空間
DEBUG=pw:protocol node your-script.js

# 複数の名前空間を同時に有効化
DEBUG=pw:protocol,pw:api node your-script.js

# すべてのpw:名前空間を有効化
DEBUG=pw:* node your-script.js

# pw:serverで始まるすべての名前空間
DEBUG=pw:server* node your-script.js
```

### ファイルへの出力
```bash
# ログをファイルに保存
DEBUG_FILE=debug.log DEBUG=pw:protocol node your-script.js

# 標準エラー出力をファイルにリダイレクト
DEBUG=pw:protocol node your-script.js 2> debug.log
```

### 環境変数での設定
```bash
# 環境変数として設定
export DEBUG=pw:protocol
node your-script.js

# Windows (PowerShell)
$env:DEBUG="pw:protocol"
node your-script.js

# Windows (cmd)
set DEBUG=pw:protocol
node your-script.js
```

## その他の設定

### MAX_LOG_LENGTH
プロトコルログの最大長を制御（デフォルトは無制限）
```bash
MAX_LOG_LENGTH=1000 DEBUG=pw:protocol node your-script.js
```

### debugライブラリの追加オプション
- `DEBUG_COLORS=false`: カラー出力を無効化
- `DEBUG_FD=3`: ファイルディスクリプタを変更
- `DEBUG_HIDE_DATE=true`: タイムスタンプを非表示

## 実装の仕組み

1. Node.jsの`debug`パッケージを使用
2. `packages/playwright-core/src/server/utils/debugLogger.ts`の`DebugLogger`クラスが管理
3. 各名前空間に自動的に`pw:`プレフィックスを付与
4. カラーコードは`debugLoggerColorMap`で定義
5. 各ブラウザのConnectionクラスやサーバーコンポーネントが適切な箇所でログ出力

## よく使う組み合わせ

```bash
# プロトコルとAPI呼び出しを同時にデバッグ
DEBUG=pw:protocol,pw:api node your-script.js

# サーバーモードの完全なデバッグ
DEBUG=pw:server*,pw:protocol node your-script.js

# インストール問題のトラブルシューティング
DEBUG=pw:install,pw:download npm install playwright
```