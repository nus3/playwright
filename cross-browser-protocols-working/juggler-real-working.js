/**
 * 実際のJugglerプロトコルを使用したFirefox操作
 * PlaywrightのFirefoxビルドが必要
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Juggler制御用の状態管理
function createJugglerController() {
  let browserProcess = null;
  let messageId = 0;
  const pendingMessages = new Map();
  let frameId = null;
  let targetId = null;
  let browserContextId = null;
  let executionContextId = null;
  let sessionId = null;
  const pendingBuffers = [];

  const getPlaywrightFirefoxPath = () => {
    // Playwrightがインストールされている場合
    try {
      const playwright = require('playwright');
      return playwright.firefox.executablePath();
    } catch (e) {
      // Playwrightが見つからない場合
    }
    
    // 手動でパスを探す
    const playwrightCache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
    
    if (require('fs').existsSync(playwrightCache)) {
      const dirs = require('fs').readdirSync(playwrightCache);
      const firefoxDir = dirs.find(d => d.startsWith('firefox-'));
      if (firefoxDir) {
        const firefoxMacPath = path.join(playwrightCache, firefoxDir, 'firefox/Nightly.app/Contents/MacOS/firefox');
        const firefoxLinuxPath = path.join(playwrightCache, firefoxDir, 'firefox/firefox');
        const firefoxWinPath = path.join(playwrightCache, firefoxDir, 'firefox/firefox.exe');
        
        if (require('fs').existsSync(firefoxMacPath)) return firefoxMacPath;
        if (require('fs').existsSync(firefoxLinuxPath)) return firefoxLinuxPath;
        if (require('fs').existsSync(firefoxWinPath)) return firefoxWinPath;
      }
    }
    
    return null;
  };

  const setupJugglerConnection = () => {
    // パイプfd:3（読み取り）からJugglerメッセージを受信
    browserProcess.stdio[3].on('data', (data) => {
      pendingBuffers.push(data);
      processJugglerMessages();
    });
  };

  const processJugglerMessages = () => {
    if (pendingBuffers.length === 0) return;
    
    const buffer = Buffer.concat(pendingBuffers);
    pendingBuffers.length = 0;
    
    const messages = buffer.toString().split('\n').filter(line => line.trim());
    
    for (const messageStr of messages) {
      try {
        const message = JSON.parse(messageStr);
        
        if (process.env.DEBUG_PROTOCOL) {
          console.log('Juggler Recv:', JSON.stringify(message));
        }
        
        if (message.sessionId && !sessionId) {
          sessionId = message.sessionId;
          console.log(`Juggler: セッションID ${sessionId} を取得`);
        }
        
        if (message.method === 'Target.targetCreated') {
          targetId = message.params.targetId;
          console.log(`Juggler: ターゲットID ${targetId} を取得`);
        }
        
        if (message.method === 'Runtime.executionContextCreated') {
          if (!executionContextId) {
            executionContextId = message.params.context.id;
            console.log(`Juggler: 実行コンテキストID ${executionContextId} を取得`);
          } else {
            console.log(`Juggler: 実行コンテキストID ${message.params.context.id} を取得`);
          }
        }
        
        if (message.method === 'Page.frameAttached' || message.method === 'Page.frameNavigated') {
          if (!frameId) {
            frameId = message.params.frameId || message.params.frame?.frameId;
            if (frameId) {
              console.log(`Juggler: フレームID ${frameId} を取得`);
            }
          }
        }
        
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
        console.warn('Juggler メッセージ解析エラー:', e.message);
      }
    }
  };

  const sendJugglerCommand = async (method, params = {}) => {
    const id = ++messageId;
    const message = { id, method, params };
    
    if (process.env.DEBUG_PROTOCOL) {
      console.log('Juggler Send:', JSON.stringify(message));
    }
    
    return new Promise((resolve, reject) => {
      pendingMessages.set(id, { resolve, reject });
      
      const messageStr = JSON.stringify(message) + '\n';
      browserProcess.stdio[4].write(messageStr);
      
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error(`コマンドタイムアウト: ${method}`));
        }
      }, 30000);
    });
  };

  const initialize = async () => {
    // Jugglerプロトコルの初期化
    await sendJugglerCommand('Browser.enable');
    await sendJugglerCommand('Target.setDiscoverTargets', { discover: true });
    
    // しばらく待って、初期のイベントを受信
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Juggler: ブラウザ機能を有効化しました');
  };

  const launch = async () => {
    console.log('Juggler: PlaywrightのFirefoxブラウザを起動中...');
    
    const firefoxPath = getPlaywrightFirefoxPath();
    
    if (!firefoxPath) {
      throw new Error('PlaywrightのFirefoxが見つかりません。先に install-playwright-firefox.js を実行してください。');
    }
    
    console.log(`Juggler: ${firefoxPath} を使用`);
    
    const tempDir = path.join(os.tmpdir(), `juggler-profile-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    browserProcess = spawn(firefoxPath, [
      '--headless',
      '--no-remote',
      '--foreground',
      '--profile', tempDir,
      '--juggler-pipe',
    ], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    browserProcess.on('error', (err) => {
      console.error('ブラウザ起動エラー:', err);
    });

    browserProcess.stdout.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('Firefox stdout:', data.toString());
      }
    });
    
    browserProcess.stderr.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('Firefox stderr:', data.toString());
      }
    });

    setupJugglerConnection();
    
    await initialize();
    
    console.log('Juggler: 接続成功！');
  };

  const createNewPage = async () => {
    console.log('Juggler: 新しいページを作成中...');
    
    const contextResult = await sendJugglerCommand('Browser.createBrowserContext', {
      removeOnDetach: true
    });
    browserContextId = contextResult.browserContextId;
    
    const pageResult = await sendJugglerCommand('Browser.newPage', {
      browserContextId: browserContextId
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Juggler: 新しいページを作成しました');
    return pageResult;
  };

  const navigateToPage = async (url) => {
    console.log(`Juggler: ${url} に移動中...`);
    
    if (!frameId) {
      throw new Error('frameIdが設定されていません');
    }
    
    const response = await sendJugglerCommand('Page.navigate', {
      frameId: frameId,
      url: url
    });
    
    await new Promise(r => setTimeout(r, 3000));
    
    console.log(`Juggler: ページ移動完了`);
    return response;
  };

  const getPageTitle = async () => {
    console.log('Juggler: ページタイトルを取得中...');
    
    if (!frameId || !executionContextId) {
      throw new Error('frameIdまたはexecutionContextIdが設定されていません');
    }
    
    try {
      const result = await sendJugglerCommand('Runtime.evaluate', {
        frameId: frameId,
        expression: 'document.title',
        returnByValue: true
      });
      
      const title = result.result?.value || 'タイトル取得失敗';
      console.log(`Juggler: ページタイトル = "${title}"`);
      return title;
    } catch (error) {
      console.log(`Juggler: ページタイトル = "タイトル取得失敗"`);
      return 'タイトル取得失敗';
    }
  };

  const takeScreenshot = async () => {
    console.log('Juggler: スクリーンショットを取得中...');
    
    const response = await sendJugglerCommand('Page.screenshot', {
      mimeType: 'image/png',
      fullPage: false
    });
    
    console.log('Juggler: スクリーンショットを取得しました');
    return Buffer.from(response.data, 'base64');
  };

  const close = async () => {
    browserProcess?.stdio[3]?.removeAllListeners();
    browserProcess?.stdio[4]?.removeAllListeners();
    
    if (browserProcess) {
      try {
        await sendJugglerCommand('Browser.close');
      } catch (e) {
        // 接続が既に閉じている可能性
      }
      
      browserProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!browserProcess.killed) {
        browserProcess.kill('SIGKILL');
      }
      
      console.log('Juggler: 接続が閉じられました');
    }
    
    console.log('Juggler: ブラウザを終了しました');
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
export async function demonstrateRealJuggler() {
  const controller = createJugglerController();
  
  try {
    console.log('=== Real Juggler Protocol (Firefox) 実動作デモ ===');
    console.log('');
    console.log('📝 注意: PlaywrightのFirefoxビルドが必要です');
    console.log('   インストール: node install-playwright-firefox.js');
    console.log('');
    
    await controller.launch();
    
    await controller.createNewPage();
    
    await controller.navigateToPage('https://example.com');
    
    const title = await controller.getPageTitle();
    
    const screenshot = await controller.takeScreenshot();
    const screenshotPath = path.join(process.cwd(), 'juggler-real-screenshot.png');
    await fs.writeFile(screenshotPath, screenshot);
    console.log(`Juggler: スクリーンショットを保存: ${screenshotPath}`);
    
    console.log('');
    console.log('=== Real Juggler デモ完了 ===');
    console.log(`✅ 取得したタイトル: ${title}`);
    console.log(`✅ スクリーンショット: juggler-real-screenshot.png`);
    console.log('');
    console.log('🔍 Jugglerプロトコルの特徴:');
    console.log('  • Firefoxの内部APIに直接アクセス');
    console.log('  • frameId が必須パラメータ');
    console.log('  • Pipe通信（stdio）を使用');
    console.log('  • Browser.* コマンドでコンテキスト管理');
    console.log('');
    console.log('💡 プロトコルメッセージを確認するには:');
    console.log('   DEBUG_PROTOCOL=1 node juggler-real-working.js');
    
  } catch (error) {
    console.error('❌ Real Jugglerデモエラー:', error.message);
    
    if (error.message.includes('PlaywrightのFirefox')) {
      console.log('');
      console.log('💡 PlaywrightのFirefoxをインストールしてください:');
      console.log('   node install-playwright-firefox.js');
      console.log('   または: npx playwright install firefox');
    }
    
    throw error;
  } finally {
    await controller.close();
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRealJuggler().catch(console.error);
}