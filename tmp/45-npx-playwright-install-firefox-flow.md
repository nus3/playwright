# npx playwright install firefox の動作詳細

## 実行時に起きること

`npx playwright install firefox`を実行すると、以下の処理が行われます：

## 1. コマンドの解析と実行

### エントリーポイント
`packages/playwright-core/src/cli/program.ts:195-264`

```typescript
program
    .command('install [browser...]')
    .action(async function(args: string[], options) {
      // ...
      const executables = checkBrowsersToInstall(args, options);  // ['firefox']
      await registry.install(executables, forceReinstall);
    });
```

## 2. ダウンロードURL の決定

### プラットフォーム別のURL
`packages/playwright-core/src/server/registry/index.ts:220-249`

macOS ARM64の場合：
```
builds/firefox/%s/firefox-mac-arm64.zip
```

実際のURL例：
```
https://playwright.azureedge.net/builds/firefox/1463/firefox-mac-arm64.zip
```

ダウンロード元（CDNミラー）：
1. `https://cdn.playwright.dev/dbazure/download/playwright`
2. `https://playwright.download.prss.microsoft.com/dbazure/download/playwright`  
3. `https://cdn.playwright.dev`

## 3. ビルド済みFirefoxのダウンロードと展開

### Registry.install()の処理
`packages/playwright-core/src/server/registry/index.ts:1034-1082`

```typescript
async install(executablesToInstall: Executable[], forceReinstall: boolean) {
  // 1. ロックファイルで排他制御
  releaseLock = await lockfile.lock(registryDirectory, {...});
  
  // 2. 古いブラウザの削除（PLAYWRIGHT_SKIP_BROWSER_GCがfalseの場合）
  await this._validateInstallationCache(linksDir);
  
  // 3. ブラウザのダウンロードと展開
  for (const executable of executables) {
    await this._downloadExecutable(executable, forceReinstall);
  }
}
```

### ダウンロード先
```
~/Library/Caches/ms-playwright/firefox-1463/
├── firefox/
│   ├── Nightly.app/
│   │   └── Contents/
│   │       └── MacOS/
│   │           └── firefox  # 実行ファイル
│   └── ...
```

## 4. 重要なポイント：パッチは事前適用済み

### Playwrightが配布するFirefoxの特徴

**ダウンロードされるFirefoxは、すでにJugglerパッチが適用されビルド済みのバイナリです。**

1. **事前ビルド**: Playwrightチームが以下を実施
   - Mozilla Firefoxのソースコードを取得
   - Jugglerパッチ（`browser_patches/firefox/patches/bootstrap.diff`）を適用
   - 各プラットフォーム向けにビルド
   - CDNにアップロード

2. **パッチの内容**:
   - Jugglerコンポーネントの追加
   - `-juggler-pipe`フラグのサポート
   - パイプ通信（stdio 3/4）の実装
   - その他の自動化サポート

3. **ソースコードのベース**:
   ```bash
   # browser_patches/firefox/UPSTREAM_CONFIG.sh
   REMOTE_URL="https://github.com/mozilla-firefox/firefox"
   BASE_BRANCH="release"
   BASE_REVISION="00656c9425c51ee035578ca6ebebe13c755b0375"
   ```

## 5. ブラウザの起動

Firefoxが起動される際、自動的に以下のフラグが付与されます：

```javascript
// packages/playwright-core/src/server/firefox/firefox.ts:88
firefoxArguments.push('-juggler-pipe');
```

これにより：
1. Jugglerコンポーネントが有効化
2. stdio(FD3/4)でのパイプ通信が確立
3. Playwrightとの双方向通信が可能に

## 6. ディレクトリ構造

インストール後の構造：
```
~/Library/Caches/ms-playwright/
├── .links/
│   └── <sha1_of_package_path>  # パッケージへのリンク
├── firefox-1463/
│   └── firefox/
│       ├── Nightly.app/        # macOS
│       ├── firefox/            # Linux
│       └── firefox.exe         # Windows
└── __dirlock                   # ロックファイル
```

## まとめ

`npx playwright install firefox`の処理フロー：

1. **コマンド解析**: CLIがinstallコマンドを処理
2. **プラットフォーム判定**: OS/アーキテクチャを検出
3. **ダウンロード**: CDNから**パッチ適用済み**Firefoxをダウンロード
4. **展開**: `~/Library/Caches/ms-playwright/`に展開
5. **リンク作成**: パッケージとの関連付け
6. **準備完了**: `-juggler-pipe`フラグで起動可能に

**重要な発見**：
- ユーザーのマシンでパッチ適用やビルドは行われない
- すべてのパッチは事前にPlaywrightチームによって適用済み
- ダウンロードするのは完全にビルド済みのバイナリ
- 通常のFirefoxとは異なる特別なビルド