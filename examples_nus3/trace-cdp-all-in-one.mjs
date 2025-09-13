#!/usr/bin/env node
/**
 * CDP (Chrome DevTools Protocol) トレース - オールインワン版
 *
 * 使用方法:
 *   node examples_nus3/trace-cdp-all-in-one.mjs
 *
 * このスクリプト1つで：
 * 1. ブラウザを起動
 * 2. CDPコマンドをトレース（環境変数DEBUG=pw:protocolを自動設定）
 * 3. 整形して表示
 *
 * 実行すると別プロセスで自分自身を起動し、ログをパースします。
 */

import playwright from '../packages/playwright-core/index.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const { chromium } = playwright;

// このスクリプト自身のパス
const __filename = fileURLToPath(import.meta.url);

// モード判定（環境変数で制御）
const isChildProcess = process.env.CDP_TRACE_CHILD === 'true';

// 子プロセスとして実行される場合（実際のブラウザ操作）
if (isChildProcess) {
  async function runBrowser() {
    console.log('=== ブラウザ起動 ===\n');

    const browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();
    await page.goto('https://playwright.dev');
    await page.waitForTimeout(3000);
    await browser.close();

    console.log('\n=== ブラウザ終了 ===');
  }

  runBrowser().catch(console.error);

} else {
  // 親プロセスとして実行される場合（ログパース）

  console.log('🔍 CDP Command Tracer (All-in-One)\n');
  console.log('=' .repeat(60) + '\n');
  console.log('ブラウザを起動して https://playwright.dev にアクセスします...\n');

  // 子プロセスとして自分自身を起動
  const child = spawn('node', [__filename], {
    env: {
      ...process.env,
      DEBUG: 'pw:protocol',
      CDP_TRACE_CHILD: 'true'
    },
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let commandCounter = 0;
  const cdpCommands = [];
  const domains = {};

  // stderrからCDPログをパース
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
            cdpCommands.push(data.method);

            // ドメイン集計
            const domain = data.method.split('.')[0];
            domains[domain] = (domains[domain] || 0) + 1;

            // 重要なコマンドを表示
            const important = [
              'Browser.getVersion',
              'Target.setAutoAttach',
              'Target.createTarget',
              'Target.createBrowserContext',
              'Page.enable',
              'Page.navigate',
              'Page.getFrameTree',
              'Runtime.enable',
              'Runtime.evaluate',
              'Network.enable'
            ];

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
                if (data.method === 'Page.navigate') {
                  console.log(`             • url: "${data.params.url}"`);
                  if (data.params.referrer) console.log(`             • referrer: "${data.params.referrer}"`);
                  if (data.params.frameId) console.log(`             • frameId: "${data.params.frameId}"`);
                } else if (data.method === 'Target.createTarget') {
                  console.log(`             • url: "${data.params.url}"`);
                  if (data.params.browserContextId) console.log(`             • browserContextId: "${data.params.browserContextId}"`);
                } else if (data.method === 'Runtime.evaluate') {
                  const expr = data.params.expression.substring(0, 80).replace(/\n/g, ' ');
                  console.log(`             • expression: "${expr}${data.params.expression.length > 80 ? '...' : ''}"`);
                  if (data.params.returnByValue !== undefined) console.log(`             • returnByValue: ${data.params.returnByValue}`);
                  if (data.params.awaitPromise !== undefined) console.log(`             • awaitPromise: ${data.params.awaitPromise}`);
                } else if (data.method === 'Target.setAutoAttach') {
                  console.log(`             • autoAttach: ${data.params.autoAttach}`);
                  console.log(`             • waitForDebuggerOnStart: ${data.params.waitForDebuggerOnStart}`);
                  if (data.params.flatten !== undefined) console.log(`             • flatten: ${data.params.flatten}`);
                } else if (data.method === 'Page.enable') {
                  // Page.enable は通常パラメータなし
                  console.log(`             (no parameters)`);
                } else if (data.method === 'Network.enable') {
                  if (data.params.maxTotalBufferSize) console.log(`             • maxTotalBufferSize: ${data.params.maxTotalBufferSize}`);
                  if (data.params.maxResourceBufferSize) console.log(`             • maxResourceBufferSize: ${data.params.maxResourceBufferSize}`);
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
    console.log(`Total CDP commands: ${commandCounter}`);

    if (Object.keys(domains).length > 0) {
      console.log('\nBy domain:');
      Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([domain, count]) => {
          const percentage = Math.round((count / commandCounter) * 100);
          const bar = '█'.repeat(Math.min(20, Math.ceil(count / 2)));
          console.log(`  ${domain.padEnd(15)} ${String(count).padStart(3)} (${String(percentage).padStart(2)}%) ${bar}`);
        });
    }

    // 主要なフロー確認
    console.log('\n🔄 Key CDP Flow:');
    const keyFlow = {
      'Browser.getVersion': 'ブラウザバージョン取得',
      'Target.setAutoAttach': '自動アタッチ設定',
      'Target.createTarget': '新規ページ作成',
      'Page.navigate': 'URLナビゲーション',
      'Page.enable': 'Pageドメイン有効化'
    };

    Object.entries(keyFlow).forEach(([method, desc]) => {
      if (cdpCommands.includes(method)) {
        console.log(`  ✓ ${method} - ${desc}`);
      }
    });

    console.log('\n✅ Complete');
    console.log('\n💡 Chrome DevTools Protocol (CDP) が使用されています');
    console.log('   詳細: https://chromedevtools.github.io/devtools-protocol/');

    process.exit(code);
  });
}
