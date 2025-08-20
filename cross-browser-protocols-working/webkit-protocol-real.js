/**
 * PlaywrightのWebKit内部プロトコルを直接実装
 * Playwright.*名前空間のコマンドを使用した実動作デモ
 */

import { spawn } from 'child_process';
import { promises as fs, existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

// WebKit用プロトコル制御
function createWebKitProtocolController() {
  let browserProcess = null;
  let messageId = 0;
  const pendingMessages = new Map();
  let pageProxyId = null;
  let browserContextId = null;
  let frameId = null;
  const messageBuffers = [];

  const getWebKitPath = () => {
    const playwrightCache = path.join(
      os.homedir(),
      'Library/Caches/ms-playwright'
    );
    
    if (!existsSync(playwrightCache)) return null;
    
    const dirs = readdirSync(playwrightCache);
    const webkitDir = dirs.find(d => d.startsWith('webkit-'));
    if (!webkitDir) return null;
    
    const webkitMacPath = path.join(playwrightCache, webkitDir, 'pw_run.sh');
    if (existsSync(webkitMacPath)) return webkitMacPath;
    
    return null;
  };

  const setupProtocolHandlers = () => {
    // stdio[3]からプロトコルメッセージを受信
    browserProcess.stdio[3].on('data', (data) => {
      messageBuffers.push(data);
      processMessages();
    });
  };

  const processMessages = () => {
    if (messageBuffers.length === 0) return;
    
    const buffer = Buffer.concat(messageBuffers);
    messageBuffers.length = 0;
    
    // メッセージは改行で区切られている
    const messages = buffer.toString().split('\n').filter(line => line.trim());
    
    for (const messageStr of messages) {
      try {
        const message = JSON.parse(messageStr);
        
        if (process.env.DEBUG_PROTOCOL) {
          console.log('WebKit Recv:', JSON.stringify(message));
        }
        
        // イベント処理
        if (message.method === 'Playwright.pageProxyCreated') {
          pageProxyId = message.params.pageProxyId;
          console.log(`WebKit: pageProxyId取得: ${pageProxyId}`);
        }
        
        if (message.method === 'Page.frameNavigated') {
          frameId = message.params.frame?.id || frameId;
          if (frameId) {
            console.log(`WebKit: frameId取得: ${frameId}`);
          }
        }
        
        // レスポンス処理
        if (message.id && pendingMessages.has(message.id)) {
          const { resolve, reject } = pendingMessages.get(message.id);
          pendingMessages.delete(message.id);
          
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result || message);
          }
        }
      } catch (e) {
        // パース失敗は無視（部分的なメッセージの可能性）
      }
    }
  };

  const sendCommand = async (method, params = {}) => {
    const id = ++messageId;
    const message = { id, method, params };
    
    if (process.env.DEBUG_PROTOCOL) {
      console.log('WebKit Send:', JSON.stringify(message));
    }
    
    return new Promise((resolve, reject) => {
      pendingMessages.set(id, { resolve, reject });
      
      // stdio[4]にプロトコルメッセージを送信
      const messageStr = JSON.stringify(message) + '\n';
      browserProcess.stdio[4].write(messageStr);
      
      // タイムアウト設定
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error(`コマンドタイムアウト: ${method}`));
        }
      }, 30000);
    });
  };

  const launch = async () => {
    console.log('WebKit Protocol: ブラウザを起動中...');
    
    const webkitPath = getWebKitPath();
    if (!webkitPath) {
      throw new Error('WebKitが見つかりません。npx playwright install webkit を実行してください。');
    }
    
    console.log(`WebKit Protocol: ${webkitPath} を使用`);
    
    // WebKitを起動（Playwrightプロトコル有効）
    browserProcess = spawn(webkitPath, [
      '--inspector-pipe',  // パイプ経由のプロトコル通信
      '--headless',
      '--no-startup-window'
    ], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    browserProcess.on('error', (err) => {
      console.error('ブラウザ起動エラー:', err);
    });

    browserProcess.stdout.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('WebKit stdout:', data.toString());
      }
    });
    
    browserProcess.stderr.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('WebKit stderr:', data.toString());
      }
    });

    setupProtocolHandlers();
    
    // Playwright拡張プロトコルを有効化
    await sendCommand('Playwright.enable');
    
    console.log('WebKit Protocol: 接続成功！');
  };

  const createPage = async () => {
    console.log('WebKit Protocol: 新しいページを作成中...');
    
    // 1. ブラウザコンテキストを作成
    const contextResult = await sendCommand('Playwright.createContext', {
      // プロキシ設定も可能
      // proxyServer: 'http://proxy.example.com:8080',
      // proxyBypassList: 'localhost'
    });
    browserContextId = contextResult.browserContextId;
    console.log(`WebKit Protocol: コンテキスト作成: ${browserContextId}`);
    
    // 2. ページを作成
    const pageResult = await sendCommand('Playwright.createPage', {
      browserContextId
    });
    pageProxyId = pageResult.pageProxyId;
    console.log(`WebKit Protocol: ページ作成: ${pageProxyId}`);
    
    // フレームIDの取得を待つ
    await new Promise(r => setTimeout(r, 1000));
    
    // デフォルトのフレームIDを設定
    if (!frameId) {
      frameId = 'main-frame';
    }
    
    return pageProxyId;
  };

  const navigateToPage = async (url) => {
    console.log(`WebKit Protocol: ${url} に移動中...`);
    
    if (!pageProxyId) {
      throw new Error('pageProxyIdが設定されていません');
    }
    
    // Playwright.navigateコマンドを使用
    const response = await sendCommand('Playwright.navigate', {
      url,
      pageProxyId,
      frameId: frameId || undefined,
      referrer: undefined
    });
    
    console.log(`WebKit Protocol: ナビゲーション開始 (loaderId: ${response.loaderId})`);
    
    // ページ読み込み完了を待つ
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('WebKit Protocol: ページ移動完了');
    return response;
  };

  const takeScreenshot = async () => {
    console.log('WebKit Protocol: スクリーンショットを取得中...');
    
    if (!pageProxyId) {
      throw new Error('pageProxyIdが設定されていません');
    }
    
    // Playwright.takePageScreenshotコマンドを使用
    const response = await sendCommand('Playwright.takePageScreenshot', {
      pageProxyId,
      mimeType: 'image/png',
      fullPage: false,
      clip: undefined
    });
    
    console.log('WebKit Protocol: スクリーンショット取得成功');
    return Buffer.from(response.data, 'base64');
  };

  const setGeolocation = async (latitude, longitude) => {
    console.log(`WebKit Protocol: 位置情報を設定: ${latitude}, ${longitude}`);
    
    await sendCommand('Playwright.setGeolocationOverride', {
      browserContextId,
      geolocation: {
        latitude,
        longitude,
        accuracy: 100
      }
    });
  };

  const setCookies = async (cookies) => {
    console.log('WebKit Protocol: Cookieを設定中...');
    
    await sendCommand('Playwright.setCookies', {
      browserContextId,
      cookies
    });
  };

  const close = async () => {
    if (browserProcess) {
      try {
        await sendCommand('Playwright.close');
      } catch (e) {
        // 接続が既に閉じている可能性
      }
      
      browserProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!browserProcess.killed) {
        browserProcess.kill('SIGKILL');
      }
    }
    
    console.log('WebKit Protocol: ブラウザを終了しました');
  };

  return {
    launch,
    createPage,
    navigateToPage,
    takeScreenshot,
    setGeolocation,
    setCookies,
    close
  };
}

// デモ実行関数
export async function demonstrateWebKitProtocol() {
  const controller = createWebKitProtocolController();
  
  try {
    console.log('=== WebKit Playwright Protocol 実動作デモ ===');
    console.log('');
    console.log('📝 Playwright.*名前空間のコマンドを直接使用');
    console.log('  - Playwright.createContext: コンテキスト作成');
    console.log('  - Playwright.createPage: ページ作成');
    console.log('  - Playwright.navigate: ナビゲーション');
    console.log('  - Playwright.takePageScreenshot: スクリーンショット');
    console.log('');
    
    await controller.launch();
    
    await controller.createPage();
    
    // 位置情報を設定（東京）
    await controller.setGeolocation(35.6762, 139.6503);
    
    // Cookieを設定
    await controller.setCookies([
      {
        name: 'test-cookie',
        value: 'webkit-protocol-demo',
        domain: '.example.com',
        path: '/',
        expires: Date.now() + 3600000,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ]);
    
    await controller.navigateToPage('https://example.com');
    
    const screenshot = await controller.takeScreenshot();
    const screenshotPath = path.join(process.cwd(), 'webkit-protocol-screenshot.png');
    await fs.writeFile(screenshotPath, screenshot);
    console.log(`WebKit Protocol: スクリーンショットを保存: ${screenshotPath}`);
    
    console.log('');
    console.log('=== WebKit Protocol デモ完了 ===');
    console.log('✅ Playwright.createContext でコンテキスト作成');
    console.log('✅ Playwright.createPage でページ作成');
    console.log('✅ Playwright.setGeolocationOverride で位置情報設定');
    console.log('✅ Playwright.setCookies でCookie設定');
    console.log('✅ Playwright.navigate でページ遷移');
    console.log('✅ Playwright.takePageScreenshot でスクリーンショット取得');
    console.log('');
    console.log('🔍 プロトコルの特徴:');
    console.log('  1. pageProxyId による2段階のページ管理');
    console.log('  2. frameId が必須パラメータ');
    console.log('  3. stdio経由のパイプ通信');
    console.log('  4. 標準WebInspectorにない豊富な機能');
    
  } catch (error) {
    console.error('❌ WebKit Protocolデモエラー:', error.message);
    
    if (error.message.includes('タイムアウト')) {
      console.log('');
      console.log('💡 WebKitの内部プロトコルは複雑です');
      console.log('   実際の動作にはPlaywrightのソースコードレベルの理解が必要');
    }
    
    throw error;
  } finally {
    await controller.close();
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateWebKitProtocol().catch(console.error);
}