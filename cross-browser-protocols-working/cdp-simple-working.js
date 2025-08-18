/**
 * システムのChromeを使用した実動作CDP実装
 * 外部依存なしで動作する最小構成
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

class SimpleCDPController {
  constructor() {
    this.browserProcess = null;
    this.ws = null;
    this.messageId = 0;
    this.pendingMessages = new Map();
    this.targetId = null;
    this.sessionId = null;
  }

  async launch() {
    console.log('CDP: システムのChromeを起動中...');
    
    // システムのChromeを探す
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
      '/usr/bin/google-chrome', // Linux
      '/usr/bin/chromium-browser', // Ubuntu
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Windows
    ];
    
    let chromePath = null;
    for (const path of chromePaths) {
      if (fs.existsSync(path)) {
        chromePath = path;
        break;
      }
    }
    
    if (!chromePath) {
      throw new Error('Chrome/Chromiumが見つかりません');
    }
    
    console.log(`CDP: ${chromePath} を使用`);
    
    // Chromeを起動（CDPサーバー付き）
    this.browserProcess = spawn(chromePath, [
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

    this.browserProcess.on('error', (err) => {
      console.error('ブラウザ起動エラー:', err);
    });

    // ブラウザの起動を待つ
    await this.waitForCDP();
    
    // CDPエンドポイントを取得
    const wsEndpoint = await this.getCDPEndpoint();
    console.log('CDP: WebSocketエンドポイント取得成功');
    
    // WebSocket接続を確立
    this.ws = new WebSocket(wsEndpoint);
    
    return new Promise((resolve, reject) => {
      this.ws.on('open', () => {
        console.log('CDP: WebSocket接続成功！');
        this.setupMessageHandler();
        resolve();
      });
      
      this.ws.on('error', reject);
    });
  }

  setupMessageHandler() {
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (process.env.DEBUG_PROTOCOL) {
        console.log('CDP receive:', JSON.stringify(message, null, 2));
      }
      
      if (message.id && this.pendingMessages.has(message.id)) {
        const resolve = this.pendingMessages.get(message.id);
        this.pendingMessages.delete(message.id);
        resolve(message);
      }
    });
  }

  async sendCommand(method, params = {}) {
    const id = ++this.messageId;
    const message = { id, method, params };
    
    if (this.sessionId && method !== 'Target.attachToTarget' && method !== 'Target.createTarget') {
      message.sessionId = this.sessionId;
    }
    
    if (process.env.DEBUG_PROTOCOL) {
      console.log('CDP send:', JSON.stringify(message, null, 2));
    }
    
    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, resolve);
      this.ws.send(JSON.stringify(message));
      
      // タイムアウト設定
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error(`Command timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async waitForCDP() {
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await this.httpGet('http://localhost:9222/json/version');
        if (response) return;
      } catch (e) {
        // まだ起動していない
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('CDPサーバーの起動タイムアウト');
  }

  async getCDPEndpoint() {
    const response = await this.httpGet('http://localhost:9222/json/version');
    const data = JSON.parse(response);
    return data.webSocketDebuggerUrl;
  }

  httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  async createNewPage() {
    // 新しいターゲット（タブ）を作成
    const response = await this.sendCommand('Target.createTarget', { 
      url: 'about:blank' 
    });
    this.targetId = response.result.targetId;
    
    // ターゲットにアタッチ
    const attachResponse = await this.sendCommand('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true
    });
    this.sessionId = attachResponse.result.sessionId;
    
    // 必要な機能を有効化
    await this.sendCommand('Page.enable');
    await this.sendCommand('Runtime.enable');
    
    console.log('CDP: 新しいページを作成しました');
  }

  async navigateToPage(url) {
    console.log(`CDP: ${url} に移動中...`);
    
    // Page.navigateコマンドでページに移動
    const response = await this.sendCommand('Page.navigate', { url });
    
    // ページ読み込み完了を待つ
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`CDP: ページ移動完了 (frameId: ${response.result.frameId})`);
    return response;
  }

  async getPageTitle() {
    // JavaScriptを実行してタイトルを取得
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    });
    
    const title = result.result.result.value;
    console.log(`CDP: ページタイトル = "${title}"`);
    return title;
  }

  async takeScreenshot() {
    // スクリーンショットを取得
    const response = await this.sendCommand('Page.captureScreenshot', {
      format: 'png'
    });
    
    const screenshotData = response.result.data;
    console.log('CDP: スクリーンショットを取得しました');
    return Buffer.from(screenshotData, 'base64');
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.browserProcess) {
      this.browserProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!this.browserProcess.killed) {
        this.browserProcess.kill('SIGKILL');
      }
    }
    
    console.log('CDP: ブラウザを終了しました');
  }
}

// デモ実行
async function demonstrateSimpleCDP() {
  const controller = new SimpleCDPController();
  
  try {
    console.log('=== Simple CDP (Chrome DevTools Protocol) 実動作デモ ===');
    console.log('');
    
    // ブラウザ起動とCDP接続
    await controller.launch();
    
    // 新しいページを作成
    await controller.createNewPage();
    
    // example.comに移動
    await controller.navigateToPage('https://example.com');
    
    // タイトルを取得
    const title = await controller.getPageTitle();
    
    // スクリーンショットを保存
    const screenshot = await controller.takeScreenshot();
    const screenshotPath = path.join(__dirname, 'simple-cdp-screenshot.png');
    fs.writeFileSync(screenshotPath, screenshot);
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

module.exports = { SimpleCDPController, demonstrateSimpleCDP };

// 直接実行された場合
if (require.main === module) {
  demonstrateSimpleCDP().catch(console.error);
}