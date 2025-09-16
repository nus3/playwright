#!/usr/bin/env node
/**
 * BiDi (WebDriver BiDi) Protocol トレース - Firefox版
 *
 * 使用方法:
 *   node examples_nus3/trace-bidi-firefox.mjs
 *
 * このスクリプト1つで：
 * 1. Firefoxを起動
 * 2. BiDiコマンドをトレース（環境変数DEBUG=pw:protocolを自動設定）
 * 3. 整形して表示
 *
 * 実行すると別プロセスで自分自身を起動し、ログをパースします。
 */

import playwright from '../packages/playwright-core/index.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { importantCommands } from './important-commands.mjs';

const { _bidiFirefox, firefox } = playwright;

// このスクリプト自身のパス
const __filename = fileURLToPath(import.meta.url);

// モード判定（環境変数で制御）
const isChildProcess = process.env.BIDI_TRACE_CHILD === 'true';

// 子プロセスとして実行される場合（実際のブラウザ操作）
if (isChildProcess) {
  async function runBrowser() {
    console.log('=== Firefox 起動 (BiDi Protocol) ===\n');

    // _bidiFirefox でexecutablePathを指定して起動
    const browser = await _bidiFirefox.launch({
      headless: false,
      // 通常のfirefoxから実行ファイルパスを取得して使用
      executablePath: firefox.executablePath()
    });

    const page = await browser.newPage();
    await page.goto('https://example.com');
    await page.waitForTimeout(3000);
    await browser.close();

    console.log('\n=== Firefox 終了 ===');
  }

  runBrowser().catch(console.error);

} else {
  // 親プロセスとして実行される場合（ログパース）

  console.log('🔍 BiDi Protocol Tracer - Firefox\n');
  console.log('=' .repeat(60) + '\n');
  console.log('Firefoxを起動して https://example.com にアクセスします...\n');

  // 子プロセスとして自分自身を起動
  const child = spawn('node', [__filename], {
    env: {
      ...process.env,
      DEBUG: 'pw:protocol',
      BIDI_TRACE_CHILD: 'true'
    },
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let commandCounter = 0;
  const bidiCommands = [];
  const modules = {};

  // stderrからBiDiログをパース
  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');

    for (const line of lines) {
      // SEND行をパース
      const sendMatch = line.match(/pw:protocol\s+SEND\s+►\s+(.+)/);
      if (sendMatch) {
        try {
          const data = JSON.parse(sendMatch[1]);
          if (data.method) {
            commandCounter++;
            bidiCommands.push(data.method);

            // モジュール集計
            const module = data.method.split('.')[0];
            modules[module] = (modules[module] || 0) + 1;

            // 共通ファイルからインポートした重要コマンドリストを使用
            const important = importantCommands;

            if (important.includes(data.method)) {
              // メソッド名を表示
              console.log(`\n📤 [${String(commandCounter).padStart(3)}] ${data.method}`);

              // id を表示
              if (data.id) {
                console.log(`         ├─ id: ${data.id}`);
              }

              // params（引数）を整形して表示
              if (data.params && Object.keys(data.params).length > 0) {
                console.log(`         └─ params:`);

                // 特定のメソッドに応じてパラメータを見やすく表示
                if (data.method === 'browsingContext.navigate') {
                  console.log(`             • url: "${data.params.url}"`);
                  if (data.params.context) console.log(`             • context: "${data.params.context}"`);
                  if (data.params.wait) console.log(`             • wait: "${data.params.wait}"`);
                } else if (data.method === 'browsingContext.create') {
                  console.log(`             • type: "${data.params.type}"`);
                  if (data.params.userContext) console.log(`             • userContext: "${data.params.userContext}"`);
                  if (data.params.referenceContext) console.log(`             • referenceContext: "${data.params.referenceContext}"`);
                } else if (data.method === 'script.evaluate') {
                  const expr = data.params.expression?.substring(0, 80).replace(/\n/g, ' ');
                  console.log(`             • expression: "${expr}${data.params.expression?.length > 80 ? '...' : ''}"`);
                  if (data.params.target) console.log(`             • target: ${JSON.stringify(data.params.target)}`);
                  if (data.params.awaitPromise !== undefined) console.log(`             • awaitPromise: ${data.params.awaitPromise}`);
                } else if (data.method === 'script.callFunction') {
                  const func = data.params.functionDeclaration?.substring(0, 80).replace(/\n/g, ' ');
                  console.log(`             • functionDeclaration: "${func}${data.params.functionDeclaration?.length > 80 ? '...' : ''}"`);
                  if (data.params.target) console.log(`             • target: ${JSON.stringify(data.params.target)}`);
                  if (data.params.arguments) console.log(`             • arguments: ${data.params.arguments.length} items`);
                } else if (data.method === 'session.new') {
                  if (data.params.capabilities) {
                    console.log(`             • capabilities:`);
                    if (data.params.capabilities.alwaysMatch) {
                      const caps = data.params.capabilities.alwaysMatch;
                      if (caps.acceptInsecureCerts !== undefined) console.log(`               - acceptInsecureCerts: ${caps.acceptInsecureCerts}`);
                      if (caps.proxy) console.log(`               - proxy: ${JSON.stringify(caps.proxy)}`);
                      if (caps.webSocketUrl !== undefined) console.log(`               - webSocketUrl: ${caps.webSocketUrl}`);
                    }
                  }
                } else if (data.method === 'session.subscribe') {
                  if (data.params.events) {
                    console.log(`             • events: [${data.params.events.join(', ')}]`);
                  }
                  if (data.params.contexts) {
                    console.log(`             • contexts: [${data.params.contexts.join(', ')}]`);
                  }
                } else if (data.method === 'browsingContext.setViewport') {
                  if (data.params.viewport) {
                    console.log(`             • viewport: ${data.params.viewport.width}x${data.params.viewport.height}`);
                  }
                  if (data.params.devicePixelRatio) console.log(`             • devicePixelRatio: ${data.params.devicePixelRatio}`);
                  if (data.params.context) console.log(`             • context: "${data.params.context}"`);
                } else {
                  // その他のコマンドは最初の3つのパラメータを表示
                  const paramKeys = Object.keys(data.params).slice(0, 3);
                  paramKeys.forEach(key => {
                    const value = data.params[key];
                    const displayValue = typeof value === 'string'
                      ? `"${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`
                      : JSON.stringify(value);
                    console.log(`             • ${key}: ${displayValue}`);
                  });
                  if (Object.keys(data.params).length > 3) {
                    console.log(`             • ... (${Object.keys(data.params).length - 3} more)`);
                  }
                }
              } else if (data.params === undefined || Object.keys(data.params).length === 0) {
                console.log(`         └─ params: (none)`);
              }
            }
          }
        } catch (e) {
          // パースエラーは無視
        }
      }
    }
  });

  // stdoutから通常のログを表示（フィルタリング）
  child.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('===')) {
      process.stdout.write(output);
    }
  });

  // プロセス終了時にサマリー表示
  child.on('close', (code) => {
    console.log('\n' + '=' .repeat(60));
    console.log('\n📊 Summary\n');
    console.log(`Total BiDi commands: ${commandCounter}`);

    if (Object.keys(modules).length > 0) {
      console.log('\nBy module:');
      Object.entries(modules)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([module, count]) => {
          const percentage = Math.round((count / commandCounter) * 100);
          const bar = '█'.repeat(Math.min(20, Math.ceil(count / 2)));
          console.log(`  ${module.padEnd(15)} ${String(count).padStart(3)} (${String(percentage).padStart(2)}%) ${bar}`);
        });
    }

    // 主要なフロー確認
    console.log('\n🔄 Key BiDi Flow:');
    const keyFlow = {
      'session.new': 'セッション作成',
      'session.subscribe': 'イベント購読',
      'browsingContext.create': '新規コンテキスト作成',
      'browsingContext.navigate': 'URLナビゲーション',
      'script.evaluate': 'スクリプト実行',
      'browser.close': 'ブラウザ終了'
    };

    Object.entries(keyFlow).forEach(([method, desc]) => {
      if (bidiCommands.includes(method)) {
        console.log(`  ✓ ${method} - ${desc}`);
      }
    });

    console.log('\n✅ Complete');
    console.log('\n💡 WebDriver BiDi Protocol が使用されています');
    console.log('   Firefox はネイティブで BiDi をサポートしています');
    console.log('   詳細: https://w3c.github.io/webdriver-bidi/');

    process.exit(code);
  });
}