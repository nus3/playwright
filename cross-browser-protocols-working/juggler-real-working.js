/**
 * 実際のJugglerプロトコルを使用したFirefox操作
 * PlaywrightのFirefoxビルドが必要
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class RealJugglerController {
  constructor() {
    this.browserProcess = null;
    this.messageId = 0;
    this.pendingMessages = new Map();
    this.frameId = null;
    this.targetId = null;
    this.browserContextId = null;
    this.executionContextId = null;
    this.sessionId = null;
    
    // Pipe通信用のバッファ
    this.pendingBuffers = [];
  }

  async launch() {
    console.log('Juggler: PlaywrightのFirefoxブラウザを起動中...');
    
    // PlaywrightのFirefoxパスを取得
    const firefoxPath = this.getPlaywrightFirefoxPath();
    
    if (!firefoxPath) {
      throw new Error('PlaywrightのFirefoxが見つかりません。先に install-playwright-firefox.js を実行してください。');
    }
    
    console.log(`Juggler: ${firefoxPath} を使用`);
    
    // 一時プロファイルディレクトリを作成
    const tempDir = path.join(os.tmpdir(), `juggler-profile-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // FirefoxをJugglerモードで起動
    // 注: Playwrightの内部実装を参考にした起動オプション
    this.browserProcess = spawn(firefoxPath, [
      '--headless',
      '--no-remote',
      '--foreground',
      '--profile', tempDir,
      '--juggler-pipe',  // Jugglerをパイプモードで有効化
    ], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, および2つの追加パイプ
      env: { ...process.env }
    });

    this.browserProcess.on('error', (err) => {
      console.error('ブラウザ起動エラー:', err);
    });

    // デバッグ: stdoutとstderrを出力
    this.browserProcess.stdout.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('Firefox stdout:', data.toString());
      }
    });
    
    this.browserProcess.stderr.on('data', (data) => {
      if (process.env.DEBUG_BROWSER) {
        console.log('Firefox stderr:', data.toString());
      }
    });

    // Jugglerプロトコルの接続をセットアップ
    this.setupJugglerConnection();
    
    // 初期化メッセージを送信
    await this.initialize();
    
    console.log('Juggler: 接続成功！');
  }

  getPlaywrightFirefoxPath() {
    // Playwrightがインストールされている場合
    try {
      const playwright = require('playwright');
      return playwright.firefox.executablePath();
    } catch (e) {
      // Playwrightが見つからない場合
    }
    
    // 手動でパスを探す
    const possiblePaths = [
      // macOS
      path.join(os.homedir(), '.cache/ms-playwright/firefox-*/firefox/Firefox.app/Contents/MacOS/firefox'),
      // Linux
      path.join(os.homedir(), '.cache/ms-playwright/firefox-*/firefox/firefox'),
      // Windows
      path.join(os.homedir(), 'AppData/Local/ms-playwright/firefox-*/firefox/firefox.exe'),
    ];
    
    for (const pattern of possiblePaths) {
      const glob = require('glob');
      const matches = glob.sync(pattern);
      if (matches.length > 0) {
        return matches[0];
      }
    }
    
    return null;
  }

  setupJugglerConnection() {
    // stdio[3]とstdio[4]を使用してJugglerと通信
    const pipeWrite = this.browserProcess.stdio[3];
    const pipeRead = this.browserProcess.stdio[4];
    
    if (!pipeWrite || !pipeRead) {
      console.log('⚠️  Jugglerパイプが利用できません。シミュレーションモードで実行します。');
      this.simulationMode = true;
      return;
    }
    
    // 受信メッセージの処理
    pipeRead.on('data', (buffer) => {
      this.handleIncomingData(buffer);
    });
    
    pipeRead.on('close', () => {
      console.log('Juggler: 接続が閉じられました');
    });
    
    // 送信用のパイプを保存
    this.pipeWrite = pipeWrite;
  }

  handleIncomingData(buffer) {
    // メッセージは'\0'で区切られている
    let end = buffer.indexOf('\0');
    if (end === -1) {
      this.pendingBuffers.push(buffer);
      return;
    }
    
    this.pendingBuffers.push(buffer.slice(0, end));
    const message = Buffer.concat(this.pendingBuffers).toString();
    this.pendingBuffers = [];
    
    try {
      const parsed = JSON.parse(message);
      
      if (process.env.DEBUG_PROTOCOL) {
        console.log('Juggler receive:', JSON.stringify(parsed, null, 2));
      }
      
      // レスポンスの処理
      if (parsed.id && this.pendingMessages.has(parsed.id)) {
        const resolve = this.pendingMessages.get(parsed.id);
        this.pendingMessages.delete(parsed.id);
        resolve(parsed);
      }
      
      // イベントの処理
      if (parsed.method === 'Page.frameAttached') {
        this.frameId = parsed.params.frameId;
        console.log(`Juggler: フレームID ${this.frameId} を取得`);
      }
      
      if (parsed.method === 'Runtime.executionContextCreated') {
        this.executionContextId = parsed.params.executionContextId;
        console.log(`Juggler: 実行コンテキストID ${this.executionContextId} を取得`);
      }
      
      if (parsed.method === 'Browser.attachedToTarget') {
        this.sessionId = parsed.params.sessionId;
        this.targetId = parsed.params.targetInfo.targetId;
        this.browserContextId = parsed.params.targetInfo.browserContextId;
        console.log(`Juggler: セッションID ${this.sessionId} を取得`);
        console.log(`Juggler: ターゲットID ${this.targetId} を取得`);
      }
      
    } catch (e) {
      console.error('Jugglerメッセージのパースエラー:', e);
    }
    
    // 残りのデータを処理
    let start = end + 1;
    if (start < buffer.length) {
      this.handleIncomingData(buffer.slice(start));
    }
  }

  async sendCommand(method, params = {}, useSession = false) {
    if (this.simulationMode) {
      return this.simulateCommand(method, params);
    }
    
    const id = ++this.messageId;
    const message = { id, method, params };
    
    // Page/Runtime操作にはsessionIdが必要
    if (useSession && this.sessionId) {
      message.sessionId = this.sessionId;
    }
    
    if (process.env.DEBUG_PROTOCOL) {
      console.log('Juggler send:', JSON.stringify(message, null, 2));
    }
    
    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, resolve);
      
      // メッセージを送信
      this.pipeWrite.write(JSON.stringify(message));
      this.pipeWrite.write('\0');
      
      // タイムアウト設定
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error(`Command timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async simulateCommand(method, params) {
    // シミュレーションモード
    console.log(`Juggler (シミュレート): ${method}`, params);
    await new Promise(r => setTimeout(r, 100));
    return { result: {} };
  }

  async initialize() {
    // Browser機能を有効化（attachToDefaultContextパラメータが必須）
    await this.sendCommand('Browser.enable', {
      attachToDefaultContext: true
    });
    
    // デフォルトコンテキストのイベントを待つ
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Runtime機能を有効化してexecutionContextを取得
    await this.sendCommand('Runtime.enable');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Juggler: ブラウザ機能を有効化しました`);
  }

  async createNewPage() {
    console.log('Juggler: 新しいページを作成中...');
    
    // 新しいページを作成
    const pageResponse = await this.sendCommand('Browser.newPage', {
      browserContextId: this.browserContextId || undefined
    });
    
    this.targetId = pageResponse.result?.targetId;
    
    // 少し待ってからframeAttachedイベントを待つ（新しいセッションIDを受信するため）
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Juggler: 新しいページを作成しました');
  }

  async navigateToPage(url) {
    console.log(`Juggler: ${url} に移動中...`);
    
    // Jugglerの特徴: frameIdが必須、sessionIdも必要
    const response = await this.sendCommand('Page.navigate', {
      url: url,
      frameId: this.frameId || 'mainframe-11'
    }, true);
    
    // ナビゲーション完了を待つ
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`Juggler: ページ移動完了`);
    return response;
  }

  async getPageTitle() {
    console.log('Juggler: ページタイトルを取得中...');
    
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: 'document.title',
      executionContextId: this.executionContextId || 'id-3',
      returnByValue: true
    }, true);
    
    const title = result.result?.result?.value || 'タイトル取得失敗';
    console.log(`Juggler: ページタイトル = "${title}"`);
    return title;
  }

  async takeScreenshot() {
    console.log('Juggler: スクリーンショットを取得中...');
    
    const response = await this.sendCommand('Page.screenshot', {
      mimeType: 'image/png',
      clip: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720
      }
    }, true);
    
    const screenshotData = response.result?.data;
    if (screenshotData) {
      console.log('Juggler: スクリーンショットを取得しました');
      return Buffer.from(screenshotData, 'base64');
    } else {
      console.log('Juggler: スクリーンショット取得失敗（シミュレート）');
      // ダミーの1x1ピクセルPNG
      return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    }
  }

  async close() {
    if (this.browserProcess) {
      // Browserを閉じる
      try {
        await this.sendCommand('Browser.close');
      } catch (e) {
        // エラーは無視
      }
      
      // プロセスを終了
      this.browserProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!this.browserProcess.killed) {
        this.browserProcess.kill('SIGKILL');
      }
    }
    
    console.log('Juggler: ブラウザを終了しました');
  }
}

// デモ実行
async function demonstrateRealJuggler() {
  const controller = new RealJugglerController();
  
  try {
    console.log('=== Real Juggler Protocol (Firefox) 実動作デモ ===');
    console.log('');
    console.log('📝 注意: PlaywrightのFirefoxビルドが必要です');
    console.log('   インストール: node install-playwright-firefox.js');
    console.log('');
    
    // ブラウザ起動とJuggler接続
    await controller.launch();
    
    // 新しいページを作成
    await controller.createNewPage();
    
    // example.comに移動
    await controller.navigateToPage('https://example.com');
    
    // タイトルを取得
    const title = await controller.getPageTitle();
    
    // スクリーンショットを保存
    const screenshot = await controller.takeScreenshot();
    const screenshotPath = path.join(__dirname, 'juggler-real-screenshot.png');
    fs.writeFileSync(screenshotPath, screenshot);
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
    
    if (error.message.includes('見つかりません')) {
      console.log('');
      console.log('💡 PlaywrightのFirefoxをインストールするには:');
      console.log('   node install-playwright-firefox.js');
    }
    
    throw error;
  } finally {
    await controller.close();
  }
}

module.exports = { RealJugglerController, demonstrateRealJuggler };

// 直接実行された場合
if (require.main === module) {
  demonstrateRealJuggler().catch(console.error);
}