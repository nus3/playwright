# 次回セッションの調査タスク

## 📋 まだ質問できていない内容

### 1. ブラウザ種類別の実装ディレクトリの使い分け

`packages/playwright-core/src/server`を見ると、様々な種類のブラウザがディレクトリごとに定義されていそうでした。これらのディレクトリに定義されたブラウザごとの実装が使われるのはどの箇所でしょうか？実際にブラウザの種類ごとに条件分岐している箇所があるのでしょうか。

**調査対象ディレクトリ**:
- `chromium/`
- `firefox/` 
- `webkit/`
- `bidi/` (bidiChromium, bidiFirefox)
- `android/`

### 2. Playwrightの実行からブラウザ接続までの完全フロー

実際にPlaywrightでChrome、Firefox、Safariを操作するとなった場合に、playwrightの実行から、ブラウザの判定、実際に各ブラウザへ接続するまでの既存実装の流れを一からまとめてください。

**調査ポイント**:
- ユーザーが`playwright.chromium.launch()`を実行
- どこでブラウザ種類が判定されるのか
- どこで対応する実装クラス（Chromium、Firefox、WebKit）が選択されるのか
- 実際の接続確立までの処理フロー

### 3. PipeTransportのStream実装詳細

Firefoxで使われるPipeTransportではプロセス間通信にNode.jsのWritableStreamとReadableStreamを使っているという認識であってますか？

**確認事項**:
- `PipeTransport`コンストラクタの引数
- `stdio[3]`, `stdio[4]`の型
- Node.jsのstream interfaceとの関係
- 実際のデータ送受信の仕組み

## 🎯 次回の作業開始ポイント

### Step 1: 前回の調査内容を確認
- `tmp/29-firefox-juggler-implementation-deep-dive.md`を読み返す
- Jugglerプロトコルの既存実装を再確認

### Step 2: Safari WebKit実装の調査（残タスク）
- WebKitブラウザーの起動と接続プロセス
- WebInspectorプロトコルの実装
- Safari特有の`pageProxyId`概念の詳細

### Step 3: ブラウザ選択機構の調査
- `playwright.chromium`、`playwright.firefox`、`playwright.webkit`の実装
- ブラウザType登録とインスタンス作成の仕組み
- 条件分岐とポリモーフィズムの使い分け

## 📚 参考資料

### 既存の調査文書
- `tmp/26-final-implementation-status.md` - 全体実装状況
- `tmp/27-cdp-reference-implementation-analysis.md` - Chrome CDP実装
- `tmp/28-firefox-juggler-stdio-pipe-analysis.md` - Firefox stdio pipe通信
- `tmp/29-firefox-juggler-implementation-deep-dive.md` - Juggler実装完全解析

### 重要なファイル
- `packages/playwright-core/src/server/browserType.ts` - 基本クラス
- `packages/playwright-core/src/server/chromium/chromium.ts` - Chrome実装
- `packages/playwright-core/src/server/firefox/firefox.ts` - Firefox実装
- `packages/playwright-core/src/server/webkit/webkit.ts` - Safari実装
- `packages/playwright-core/src/server/pipeTransport.ts` - stdio pipe通信
- `packages/playwright-core/src/server/transport.ts` - WebSocket通信

## 🎪 調査の最終目標

Playwrightがどのようにして3つの異なるブラウザ（Chrome、Firefox、Safari）を統一されたAPIで制御しているかの完全な理解を得る。

特に：
1. **ブラウザ判定と実装選択の仕組み**
2. **各ブラウザ固有のプロトコル実装**
3. **統一API下での差異の吸収方法**
4. **通信層の実装詳細**

## 👋 今回のセッション完了

ChromeのCDPとFirefoxのJugglerプロトコルの実装詳細が理解できました。
次回セッションでは、上記の残タスクから継続していきます。

お疲れさまでした！