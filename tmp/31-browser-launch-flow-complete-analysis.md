# Playwrightの実行からブラウザ接続までの完全フロー解析

## 概要
ユーザーが`npx playwright test`コマンドや`playwright.chromium.launch()`を実行してから、実際にブラウザプロセスが起動し、接続が確立されるまでの完全なフローを解析しました。

## 1. CLIコマンドからのエントリーポイント

### 1.1 npx playwright testからの実行フロー

```
npx playwright test
  ↓
packages/playwright/cli.js (#!/usr/bin/env node)
  ↓ require('./lib/program')
packages/playwright/src/program.ts
  ↓ addTestCommand() → runTests()
packages/playwright/src/runner/runner.ts
  ↓ Runner.runAllTests()
packages/playwright/src/runner/tasks.ts
  ↓ createRunTestsTasks()
```

**主要な処理の流れ**：
1. `cli.js` - package.jsonのbinで定義されたエントリーポイント
2. `program.ts:58-65` - testコマンドのアクション定義
3. `program.ts:166-225` - runTests()でconfig読み込みとRunner起動
4. `runner.ts:72-96` - タスクの作成と実行

### 1.2 テストフィクスチャでのブラウザ起動

`packages/playwright/src/index.ts:101-127` - browserフィクスチャ定義

```typescript
browser: [async ({ playwright, browserName, _browserOptions, connectOptions }, use, testInfo) => {
  // browserNameに基づいてブラウザを選択
  if (!['chromium', 'firefox', 'webkit'].includes(browserName))
    throw new Error(`Unexpected browserName "${browserName}"`);
    
  // playwright[browserName].launch()を実行
  const browser = await playwright[browserName].launch();
  await use(browser);
  await browser.close({ reason: 'Test ended.' });
}, { scope: 'worker', timeout: 0 }]
```

### 1.3 タスク実行からフィクスチャ初期化までの詳細フロー

**Runner.runAllTests()からbrowserフィクスチャまでの接続**：

1. **タスクの作成と実行** (`runner.ts:94-96`)
   ```typescript
   ...createRunTestsTasks(config),
   const status = await runTasks(new TestRun(config, reporter), tasks, ...)
   ```

2. **createRunTestsTask内でDispatcherを実行** (`tasks.ts:355-383`)
   ```typescript
   function createRunTestsTask() {
     // ...
     await dispatcher!.run(phaseTestGroups, extraEnvByProjectId);
   }
   ```

3. **Dispatcherがワーカープロセスを起動** (`dispatcher.ts:138-150`)
   - `WorkerHost`インスタンスを作成
   - `workerMain.js`をサブプロセスとして起動
   - IPCでテストグループを送信

4. **WorkerHostがテストグループを送信** (`workerHost.ts:78-80`)
   ```typescript
   runTestGroup(runPayload: RunPayload) {
     this.sendMessageNoReply({ method: 'runTestGroup', params: runPayload });
   }
   ```
   
   **TestGroupとは** (`testGroups.ts:19-25`)：
   ```typescript
   export type TestGroup = {
     workerHash: string;      // ワーカーの識別子（同じワーカーで実行可能なテストをグループ化）
     requireFile: string;     // テストファイルのパス
     repeatEachIndex: number; // repeatEachの繰り返しインデックス
     projectId: string;       // プロジェクトID
     tests: TestCase[];       // このグループに含まれるテストケースの配列
   };
   ```
   
   テストグループは、同じワーカープロセスで実行可能なテストをまとめたもので、以下の条件でグループ化されます：
   - 同じプロジェクトに属する
   - 同じワーカーフィクスチャを使用する
   - 同じrepeatEachIndexを持つ
   - 同じテストファイルに属する（または並列実行可能）

5. **WorkerMainでテスト実行** (`workerMain.ts:209-232`)
   ```typescript
   async runTestGroup(runPayload: RunPayload) {
     const fileSuite = await loadTestFile(runPayload.file, ...);
     await this._runTest(tests[i], entry.retry, tests[i + 1]);
   }
   ```

6. **テスト実行時にフィクスチャをセットアップ** (`workerMain.ts:362`)
   ```typescript
   // Before Hooks内でフィクスチャを解決
   testFunctionParams = await this._fixtureRunner.resolveParametersForFunction(
     test.fn, testInfo, 'test', { type: 'test' }
   );
   ```

7. **FixtureRunnerがbrowserフィクスチャを初期化**
   - テスト関数の引数を解析
   - 必要なフィクスチャ（`browser`、`page`等）を依存関係順に解決
   - `browser`フィクスチャが要求された場合、上記1.2のフィクスチャ定義が実行される

### 1.4 フィクスチャ解決メカニズムの詳細

**フィクスチャの登録と解決の仕組み**：

1. **フィクスチャ定義の登録** (`packages/playwright/src/index.ts`)
   ```typescript
   // rootTestType (_baseTest) から拡張
   export const _baseTest: TestType<{}, {}> = rootTestType.test;
   
   // playwrightFixturesでbrowserフィクスチャなどを定義
   const playwrightFixtures: Fixtures<PlaywrightTestArgs & PlaywrightTestOptions, ...> = {
     browser: [async ({ playwright, browserName, ... }, use) => { ... }, { scope: 'worker' }],
     // その他のフィクスチャ定義...
   };
   
   // test.extendで新しいTestTypeを作成
   export const test = _baseTest.extend<...>(playwrightFixtures);
   ```

2. **test.extend()の内部処理** (`packages/playwright/src/common/testType.ts:293-298`)
   ```typescript
   private _extend(location: Location, fixtures: Fixtures) {
     const fixturesWithLocation: FixturesWithLocation = { fixtures, location };
     // 新しいTestTypeImplインスタンスを作成（既存のフィクスチャと新しいフィクスチャを結合）
     return new TestTypeImpl([...this.fixtures, fixturesWithLocation]).test;
   }
   ```

3. **FixturePoolによるフィクスチャ管理** (`packages/playwright/src/common/fixtures.ts:75-100`)
   - 各フィクスチャはFixtureRegistrationとして登録される
   - 名前、スコープ（test/worker）、依存関係、実行関数などを保持
   - FixturePoolが全フィクスチャの依存関係グラフを管理

4. **resolveParametersForFunction()の処理フロー** (`packages/playwright/src/worker/fixtureRunner.ts:222-259`)
   ```typescript
   async resolveParametersForFunction(fn: Function, testInfo, autoFixtures, runnable) {
     const collector = new Set<FixtureRegistration>();
     
     // Step 1: 自動フィクスチャを収集
     for (const registration of this.pool!.autoFixtures()) { ... }
     
     // Step 2: 関数の引数から必要なフィクスチャ名を抽出
     const names = getRequiredFixtureNames(fn);  // fixtureParameterNames()を使用
     
     // Step 3: 必要なフィクスチャを依存関係順に収集
     for (const name of names)
       this._collectFixturesInSetupOrder(this.pool!.resolve(name)!, collector);
     
     // Step 4: 各フィクスチャをセットアップ
     for (const registration of collector)
       await this._setupFixtureForRegistration(registration, testInfo, runnable);
     
     // Step 5: パラメータオブジェクトを作成して返す
     const params = {};
     for (const name of names) {
       const fixture = this.instanceForId.get(registration.id);
       params[name] = fixture.value;
     }
     return params;
   }
   ```

5. **fixtureParameterNames()による引数解析** (`packages/playwright/src/common/fixtures.ts:260-295`)
   ```typescript
   export function fixtureParameterNames(fn: Function, location, onError): string[] {
     // 関数の文字列表現から引数を抽出
     const text = filterOutComments(fn.toString());
     const match = text.match(/(?:async)?(?:\s+function)?[^(]*\(([^)]*)/);
     
     // オブジェクト分割構文から個々のフィクスチャ名を抽出
     // 例: ({ browser, page }) => ... から ["browser", "page"]を取得
     const props = splitByComma(firstParam.substring(1, firstParam.length - 1));
     return props;
   }
   ```

6. **Fixtureインスタンスのセットアップ** (`packages/playwright/src/worker/fixtureRunner.ts:63-76`)
   ```typescript
   async setup(testInfo: TestInfoImpl, runnable) {
     // フィクスチャが関数の場合、実行して値を取得
     if (typeof this.registration.fn === 'function') {
       // 依存フィクスチャを解決してパラメータとして渡す
       const params = {};
       for (const name of this.registration.deps) {
         const dep = this.runner.instanceForId.get(registration.id);
         params[name] = dep.value;
       }
       // フィクスチャ関数を実行
       await this.registration.fn(params, useFunc, info);
     } else {
       // 固定値の場合はそのまま設定
       this.value = this.registration.fn;
     }
   }
   ```

この仕組みにより、テスト関数が`({ browser }) => { ... }`のような形式で記述されている場合、FixtureRunnerは自動的に：
1. 関数シグネチャから`browser`フィクスチャが必要であることを検出
2. FixturePoolから`browser`フィクスチャの定義を取得
3. 依存関係（`playwright`など）を先に解決
4. `browser`フィクスチャの関数を実行して値を取得
5. テスト関数に`{ browser: ... }`として渡す

このように、CLIから始まったフローは、タスク実行→ワーカー起動→テスト実行→フィクスチャ解決という流れを経て、最終的にbrowserフィクスチャの初期化（`playwright[browserName].launch()`）に到達します。

## 2. プログラマティックAPIのエントリーポイント

### 2.1 パッケージ構造
```
packages/playwright-core/index.js
  ↓ require('./lib/inprocess')
packages/playwright-core/src/inProcessFactory.ts
  ↓ createInProcessPlaywright()
```

### 2.2 Playwrightオブジェクトの初期化
`createInProcessPlaywright()`で以下が実行される：

1. **サーバー側Playwrightオブジェクト作成**
   - `packages/playwright-core/src/server/playwright.ts:54-75`
   - Chromium、Firefox、WebKitの各BrowserTypeインスタンスが作成される

2. **クライアント-サーバー間通信の設定**
   - `inProcessFactory.ts:28-34`
   - DispatcherConnectionとConnectionで双方向通信を確立

3. **各ブラウザタイプへのサーバーランチャー設定**
   - `inProcessFactory.ts:41-46`
   ```typescript
   playwrightAPI.chromium._serverLauncher = new BrowserServerLauncherImpl('chromium');
   playwrightAPI.firefox._serverLauncher = new BrowserServerLauncherImpl('firefox');
   playwrightAPI.webkit._serverLauncher = new BrowserServerLauncherImpl('webkit');
   ```

## 3. ブラウザタイプの判定と選択メカニズム

### 3.1 ブラウザタイプの事前決定
ユーザーがアクセスする時点で既にブラウザタイプは決定済み：
- `playwright.chromium` → Chromiumクラスのインスタンス
- `playwright.firefox` → Firefoxクラスのインスタンス
- `playwright.webkit` → WebKitクラスのインスタンス

### 3.2 各ブラウザクラスの定義場所
- **Chromium**: `packages/playwright-core/src/server/chromium/chromium.ts:54`
- **Firefox**: `packages/playwright-core/src/server/firefox/firefox.ts:35`
- **WebKit**: `packages/playwright-core/src/server/webkit/webkit.ts:32`

これらは全て`BrowserType`基底クラスを継承している。

## 4. launch()メソッドの実装フロー

### 4.1 クライアント側
`packages/playwright-core/src/client/browserType.ts:66-84`

```typescript
async launch(options: LaunchOptions = {}): Promise<Browser> {
  // オプションの準備
  const launchOptions: channels.BrowserTypeLaunchParams = {
    ...options,
    env: options.env ? envObjectToArray(options.env) : undefined,
    timeout: new TimeoutSettings(this._platform).launchTimeout(options),
  };
  
  // チャネル経由でサーバー側のlaunchを呼び出し
  const browser = Browser.from((await this._channel.launch(launchOptions)).browser);
  browser._connectToBrowserType(this, options, logger);
  return browser;
}
```

### 4.2 サーバー側
`packages/playwright-core/src/server/browserType.ts:68-74`

```typescript
async launch(progress: Progress, options: types.LaunchOptions, protocolLogger?: types.ProtocolLogger): Promise<Browser> {
  options = this._validateLaunchOptions(options);
  return this._innerLaunchWithRetries(progress, options, undefined, helper.debugProtocolLogger(protocolLogger));
}
```

## 5. ブラウザプロセスの起動処理

### 5.1 プロセス起動の流れ
`packages/playwright-core/src/server/browserType.ts:110-148` (_innerLaunch)

1. **起動準備**
   - `_prepareToLaunch()`でブラウザ実行可能ファイルのパスと引数を準備
   - 一時ディレクトリやユーザーデータディレクトリの作成

2. **プロセス起動**
   - `_launchProcess()`内で`launchProcess()`を呼び出し（browserType.ts:213-242）
   - 各ブラウザ固有の引数を`defaultArgs()`で生成

3. **ブラウザ固有の起動引数**
   - **Chromium**: CDPポート指定、ヘッドレスモードなど
   - **Firefox**: `-juggler-pipe`で標準入出力パイプ通信を指定（firefox.ts:88）
   - **WebKit**: `--inspector-pipe`でインスペクタパイプ通信を指定（webkit.ts:68）

### 5.2 接続の待機
`waitForReadyState()`で各ブラウザからの準備完了シグナルを待つ：
- **Firefox**: "Juggler listening to the pipe"メッセージ（firefox.ts:100）
- **Chromium/WebKit**: WebSocketエンドポイントの取得

## 6. 接続確立（WebSocket/Pipe）

### 6.1 通信方式の選択
`packages/playwright-core/src/server/browserType.ts:268-273`

```typescript
if (options.cdpPort !== undefined || !this.supportsPipeTransport()) {
  transport = await WebSocketTransport.connect(progress, wsEndpoint!);
} else {
  const stdio = launchedProcess.stdio as unknown as [...];
  transport = new PipeTransport(stdio[3], stdio[4]);
}
```

### 6.2 ブラウザ別の通信方式
- **Chromium**: 
  - デフォルトでWebSocket（CDP）
  - Pipe通信もサポート

- **Firefox**: 
  - Pipe通信（stdio[3]とstdio[4]）
  - Jugglerプロトコルを使用

- **WebKit**: 
  - Pipe通信
  - WebInspectorプロトコルを使用

### 6.3 ブラウザオブジェクトの作成
`connectToTransport()`メソッドで、各ブラウザ固有のBrowserオブジェクトを作成：
- **Chromium**: `CRBrowser.connect()` (chromium.ts)
- **Firefox**: `FFBrowser.connect()` (firefox.ts:41)
- **WebKit**: `WKBrowser.connect()` (webkit.ts:37)

## 7. 完全なフロー図

### 7.1 CLIからのテスト実行フロー

```
npx playwright test
    ↓
cli.js → program.ts → runTests()
    ↓
Runner.runAllTests()
    ↓
テストファイルのロード
    ↓
browserフィクスチャ (src/index.ts:101)
    ↓
playwright[browserName].launch()
    ↓
（以下、プログラマティックAPIと同じフロー）
```

### 7.2 プログラマティックAPIフロー

```
ユーザー: playwright.chromium.launch()
    ↓
[クライアント側]
BrowserType.launch() (client/browserType.ts:66)
    ↓ Channel通信
[サーバー側]
BrowserType.launch() (server/browserType.ts:68)
    ↓
_innerLaunch() (server/browserType.ts:110)
    ↓
_launchProcess() (server/browserType.ts:198)
    ├─ _prepareToLaunch() : 実行ファイルと引数の準備
    ├─ launchProcess() : プロセス起動
    └─ waitForReadyState() : 準備完了待機
    ↓
[通信方式の選択]
├─ WebSocketTransport (Chromium/CDPモード)
└─ PipeTransport (Firefox/WebKit/ChromiumのPipeモード)
    ↓
connectToTransport() : ブラウザ固有の実装
├─ Chromium → CRBrowser
├─ Firefox → FFBrowser
└─ WebKit → WKBrowser
    ↓
ブラウザオブジェクトをクライアントに返却
```

## 8. 重要な実装ポイント

### 8.1 ポリモーフィズムの活用
- `BrowserType`基底クラスで共通インターフェースを定義
- 各ブラウザ固有の実装は派生クラスでオーバーライド
  - `defaultArgs()`: 起動引数の生成
  - `connectToTransport()`: ブラウザ接続の確立
  - `attemptToGracefullyCloseBrowser()`: 終了処理

### 8.2 条件分岐の最小化
- ブラウザタイプの判定は初期化時に一度だけ
- 以降はポリモーフィズムで処理を分岐
- 通信方式の選択（WebSocket/Pipe）のみ実行時判定

### 8.3 抽象化レイヤー
- `ConnectionTransport`インターフェースで通信方式を抽象化
- `Browser`基底クラスで各ブラウザの差異を吸収
- クライアント-サーバー間のChannel通信で実装を分離

## まとめ

Playwrightのブラウザ起動には2つの主要なエントリーポイントがあります：

1. **CLIからのテスト実行** (`npx playwright test`)
   - `cli.js` → `program.ts` → `Runner` → テストフィクスチャでブラウザ起動
   - browserフィクスチャが`playwright[browserName].launch()`を呼び出し

2. **プログラマティックAPI** (`playwright.chromium.launch()`)
   - 直接BrowserTypeのlaunchメソッドを呼び出し

どちらの場合も、最終的には同じ内部実装に到達します。初期化時にブラウザタイプごとのインスタンスを作成し、以降はポリモーフィズムを活用して処理を分岐しています。これにより、ユーザーAPIレベルでは統一されたインターフェースを保ちながら、内部では各ブラウザに最適化された実装を使用できる設計になっています。

通信層では、WebSocketとPipeの2つの方式を抽象化し、ブラウザや環境に応じて最適な方式を選択する柔軟な設計が採用されています。