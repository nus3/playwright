/**
 * Chrome DevTools Protocol (CDP) を使用したChrome操作の実動作版
 * 実際のシステムChromeに接続してブラウザを操作
 */

import WebSocket from 'ws';
import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

// CDP制御用の状態管理
function createCDPController() {
  let browserProcess = null;
  let ws = null;
  let sessionId = null;
  let targetId = null;
  let messageId = 0;
  const pendingMessages = new Map();

  const getChromeExecutablePath = () => {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];

    return paths.find(p => existsSync(p));
  };

  const httpGet = (url) => {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET'
      };

      const req = (urlObj.protocol === 'https:'
        ? import('https').then(m => m.default)
        : import('http').then(m => m.default)
      ).then(http => {
        const request = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        request.on('error', reject);
        request.end();
      });
    });
  };

  const waitForCDP = async () => {
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await httpGet('http://localhost:9222/json/version');
        if (response) return;
      } catch (e) {
        // まだ起動していない
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('CDPサーバーの起動タイムアウト');
  };

  const getCDPEndpoint = async () => {
    const response = await httpGet('http://localhost:9222/json/version');
    const data = JSON.parse(response);
    return data.webSocketDebuggerUrl;
  };

  const setupMessageHandler = () => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (process.env.DEBUG_PROTOCOL) {
        console.log('CDP receive:', JSON.stringify(message, null, 2));
      }

      if (message.id && pendingMessages.has(message.id)) {
        const resolve = pendingMessages.get(message.id);
        pendingMessages.delete(message.id);
        resolve(message);
      }
    });
  };

  const sendCommand = async (method, params = {}) => {
    const id = ++messageId;
    const message = { id, method, params };

    if (sessionId && method !== 'Target.attachToTarget' && method !== 'Target.createTarget') {
      message.sessionId = sessionId;
    }

    if (process.env.DEBUG_PROTOCOL) {
      console.log('CDP send:', JSON.stringify(message, null, 2));
    }

    return new Promise((resolve, reject) => {
      pendingMessages.set(id, resolve);
      ws.send(JSON.stringify(message));

      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error(`Command timeout: ${method}`));
        }
      }, 10000);
    });
  };

  const launch = async () => {
    console.log('CDP: システムのChromeを起動中...');

    const chromeExecutable = getChromeExecutablePath();
    if (!chromeExecutable) {
      throw new Error('Google Chromeが見つかりません。Chromeをインストールしてください。');
    }

    console.log(`CDP: ${chromeExecutable} を使用`);

    browserProcess = spawn(chromeExecutable, [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--remote-debugging-port=9222',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-features=PaintHolding',
      '--disable-extensions'
    ], {
      stdio: 'pipe'
    });

    browserProcess.on('error', (err) => {
      console.error('ブラウザ起動エラー:', err);
    });

    await waitForCDP();

    const wsEndpoint = await getCDPEndpoint();
    console.log('CDP: WebSocketエンドポイント取得成功');

    ws = new WebSocket(wsEndpoint);

    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('CDP: WebSocket接続成功！');
        setupMessageHandler();
        resolve();
      });

      ws.on('error', reject);
    });
  };

  const createNewPage = async () => {
    const response = await sendCommand('Target.createTarget', {
      url: 'about:blank'
    });
    targetId = response.result.targetId;

    const attachResponse = await sendCommand('Target.attachToTarget', {
      targetId: targetId,
      flatten: true
    });
    sessionId = attachResponse.result.sessionId;

    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');

    console.log('CDP: 新しいページを作成しました');
  };

  const navigateToPage = async (url) => {
    console.log(`CDP: ${url} に移動中...`);

    const response = await sendCommand('Page.navigate', { url });

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`CDP: ページ移動完了 (frameId: ${response.result.frameId})`);
    return response;
  };

  const getPageTitle = async () => {
    const result = await sendCommand('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    });

    const title = result.result.result.value;
    console.log(`CDP: ページタイトル = "${title}"`);
    return title;
  };

  const takeScreenshot = async () => {
    const response = await sendCommand('Page.captureScreenshot', {
      format: 'png'
    });

    const screenshotData = response.result.data;
    console.log('CDP: スクリーンショットを取得しました');
    return Buffer.from(screenshotData, 'base64');
  };

  const close = async () => {
    if (ws) {
      ws.close();
    }

    if (browserProcess) {
      browserProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!browserProcess.killed) {
        browserProcess.kill('SIGKILL');
      }
    }

    console.log('CDP: ブラウザを終了しました');
  };

  return {
    launch,
    createNewPage,
    navigateToPage,
    getPageTitle,
    takeScreenshot,
    close
  };
}

// デモ実行関数
export async function demonstrateSimpleCDP() {
  const controller = createCDPController();

  try {
    console.log('=== Simple CDP (Chrome DevTools Protocol) 実動作デモ ===');
    console.log('');

    await controller.launch();

    await controller.createNewPage();

    await controller.navigateToPage('https://example.com');

    const title = await controller.getPageTitle();

    const screenshot = await controller.takeScreenshot();
    const screenshotPath = path.join(process.cwd(), 'simple-cdp-screenshot.png');
    await fs.writeFile(screenshotPath, screenshot);
    console.log(`CDP: スクリーンショットを保存: ${screenshotPath}`);

    console.log('');
    console.log('=== Simple CDP デモ完了 ===');
    console.log(`✅ 取得したタイトル: ${title}`);
    console.log(`✅ スクリーンショット: simple-cdp-screenshot.png`);
    console.log('');
    console.log('💡 プロトコルメッセージを確認するには:');
    console.log('   DEBUG_PROTOCOL=1 node cdp-simple-working.js');

  } catch (error) {
    console.error('❌ Simple CDPデモエラー:', error.message);
    throw error;
  } finally {
    await controller.close();
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateSimpleCDP().catch(console.error);
}
