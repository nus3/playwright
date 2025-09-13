## その他

以下の記載から手元での確認もできそう？

```md
## 2. プログラマティック API のエントリーポイント

### 2.1 パッケージ構造

packages/playwright-core/index.js
↓ require('./lib/inprocess')
packages/playwright-core/src/inProcessFactory.ts
↓ createInProcessPlaywright()

### 2.2 Playwright オブジェクトの初期化

`createInProcessPlaywright()`で以下が実行される：

1. **サーバー側 Playwright オブジェクト作成**

   - `packages/playwright-core/src/server/playwright.ts:54-75`
   - Chromium、Firefox、WebKit の各 BrowserType インスタンスが作成される

2. **クライアント-サーバー間通信の設定**

   - `inProcessFactory.ts:28-34`
   - DispatcherConnection と Connection で双方向通信を確立

3. **各ブラウザタイプへのサーバーランチャー設定**
   - `inProcessFactory.ts:41-46`

`playwrightAPI.chromium._serverLauncher = new BrowserServerLauncherImpl('chromium');`
`playwrightAPI.firefox._serverLauncher = new BrowserServerLauncherImpl('firefox');`
`playwrightAPI.webkit._serverLauncher = new BrowserServerLauncherImpl('webkit');`
```

`node test-programmatic-api.js`で試せるようにしてくれた

---

mac ですでに Chrome をインストールしていた場合、以下のようなコマンドで Chrome を起動できる？
`Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`

test-programmatic-api.js の実装を見ると CDP で実際に Chromium を起動するのを確認できる
