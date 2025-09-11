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
    await inspectPlaywrightObject();
    await testBrowserLaunch();
    await traceInternalFlow();
  } catch (error) {
    console.error('Error:', error);
  }
})();
