// PlaywrightのプログラマティックAPIを直接使用するサンプル

const { chromium, firefox, webkit } = require('./packages/playwright-core');

async function testBrowserLaunch() {
  console.log('=== Chromiumの起動テスト ===');

  // 1. ブラウザを起動
  const browser = await chromium.launch({
    headless: false,  // ヘッドレスモードで起動（CLIでの実行用）
  });

  console.log('Browser launched:', browser.constructor.name);
  console.log('Browser version:', browser.version());

  // 2. コンテキストとページを作成
  const context = await browser.newContext();
  const page = await context.newPage();

  // 3. ページにアクセス
  await page.goto('https://playwright.dev');
  console.log('Page title:', await page.title());

  // 4. 少し待機（確認用）
  await page.waitForTimeout(3000);

  // 5. ブラウザを閉じる
  await browser.close();
  console.log('Browser closed');
}

async function testCommunicationModes() {
  console.log('\n=== 通信方式の指定テスト ===');

  // 1. デフォルト（Pipe通信）
  // console.log('\n1. デフォルト起動（Pipe通信）:');
  // const browser1 = await chromium.launch({
  //   headless: true,
  // });
  // console.log('  - 起動成功（Pipe通信使用）');
  // await browser1.close();

  // 2. CDPポート指定（WebSocket通信）
  console.log('\n2. CDPポート指定（WebSocket通信）:');
  const browser2 = await chromium.launch({
    headless: false,
    args: ['--remote-debugging-port=9222']  // CDPポートを明示的に指定
  });
  console.log('  - 起動成功（WebSocket通信使用、ポート9222）');

  const context = await browser2.newContext();
  const page = await context.newPage();

  // 3. ページにアクセス
  await page.goto('https://playwright.dev');
  // await browser2.close();

  // 3. cdpPortオプションを使用（WebSocket通信）
  // console.log('\n3. cdpPortオプション使用（WebSocket通信）:');
  // try {
  //   const browser3 = await chromium.launch({
  //     headless: true,
  //     // cdpPort: 0  // ランダムポートでCDP有効化（内部オプション）
  //     // 注: cdpPortは型定義には含まれていないが、内部的に使用可能
  //     args: ['--remote-debugging-port=0']  // 代替方法
  //   });
  //   console.log('  - 起動成功（WebSocket通信使用、ランダムポート）');
  //   await browser3.close();
  // } catch (error) {
  //   console.log('  - エラー:', error.message);
  // }

  // console.log('\n通信方式の確認方法:');
  // console.log('  - デフォルトはPipe通信（--remote-debugging-pipe）');
  // console.log('  - --remote-debugging-port指定時はWebSocket通信');
  // console.log('  - DEBUG=pw:protocol環境変数でプロトコル通信を確認可能');
}

async function inspectPlaywrightObject() {
  console.log('\n=== Playwrightオブジェクトの構造を確認 ===');

  // playwright-coreから直接インポート
  const playwright = require('./packages/playwright-core');

  console.log('playwright object keys:', Object.keys(playwright));
  console.log('chromium type:', typeof playwright.chromium);
  console.log('chromium constructor:', playwright.chromium.constructor.name);

  // 各ブラウザタイプのメソッドを確認
  console.log('\nchromium methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(playwright.chromium)));

  // _serverLauncherの存在確認（内部実装）
  console.log('\n_serverLauncher exists?', '_serverLauncher' in playwright.chromium);
}

async function traceInternalFlow() {
  console.log('\n=== 内部フローのトレース ===');

  const playwright = require('./packages/playwright-core');

  // launch時の内部処理を観察するため、簡単なログを仕込む
  const originalLaunch = playwright.chromium.launch;
  playwright.chromium.launch = async function(...args) {
    console.log('launch() called with args:', args[0]);
    const result = await originalLaunch.apply(this, args);
    console.log('launch() returned:', result.constructor.name);
    return result;
  };

  // 実際に起動してみる
  const browser = await playwright.chromium.launch({ headless: true });
  await browser.close();
}

// 実行
(async () => {
  try {
    // await inspectPlaywrightObject();
    // await testBrowserLaunch();
    await testCommunicationModes();
    // await traceInternalFlow();
  } catch (error) {
    console.error('Error:', error);
  }
})();
