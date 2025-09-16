#!/usr/bin/env node
/**
 * Firefox Juggler Protocol トレース
 *
 * 使用方法:
 *   node examples_nus3/trace-firefox-juggler.mjs
 *
 * FirefoxのJugglerプロトコル（Playwright独自）のコマンドをトレースします。
 */

import playwright from '../packages/playwright-core/index.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { importantCommands } from './important-commands.mjs';

const { firefox } = playwright;

// このスクリプト自身のパス
const __filename = fileURLToPath(import.meta.url);

// モード判定（環境変数で制御）
const isChildProcess = process.env.FIREFOX_TRACE_CHILD === 'true';

// 子プロセスとして実行される場合（実際のブラウザ操作）
if (isChildProcess) {
  async function runBrowser() {
    console.log('=== Firefox起動 ===\n');

    const browser = await firefox.launch({
      headless: false
    });

    const page = await browser.newPage();
    await page.goto('https://example.com');
    await page.waitForTimeout(3000);
    await browser.close();

    console.log('\n=== Firefox終了 ===');
  }

  runBrowser().catch(console.error);

} else {
  // 親プロセスとして実行される場合（ログパース）

  console.log('🦊 Firefox Juggler Protocol Tracer\n');
  console.log('=' .repeat(60) + '\n');
  console.log('Firefoxを起動して https://example.com にアクセスします...\n');
  console.log('📝 Jugglerは、Playwrightが独自開発したFirefox用プロトコルです\n');

  // 子プロセスとして自分自身を起動
  const child = spawn('node', [__filename], {
    env: {
      ...process.env,
      DEBUG: 'pw:protocol',
      FIREFOX_TRACE_CHILD: 'true'
    },
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let commandCounter = 0;
  const jugglerCommands = [];
  const domains = {};

  // stderrからJugglerログをパース
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
            jugglerCommands.push(data.method);

            // ドメイン集計
            const domain = data.method.split('.')[0];
            domains[domain] = (domains[domain] || 0) + 1;

            // 共通ファイルからインポートした重要コマンドリストを使用
            const important = importantCommands;

            if (important.includes(data.method) || 
                data.method.startsWith('Browser.') ||
                data.method.startsWith('Page.')) {
              
              // メソッド名を表示
              console.log(`\n🦊 [${String(commandCounter).padStart(3)}] ${data.method}`);

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
                } else if (data.method === 'Browser.newPage') {
                  if (data.params.browserContextId) console.log(`             • browserContextId: "${data.params.browserContextId}"`);
                } else if (data.method === 'Runtime.evaluate') {
                  const expr = data.params.expression?.substring(0, 80).replace(/\n/g, ' ');
                  if (expr) console.log(`             • expression: "${expr}${data.params.expression.length > 80 ? '...' : ''}"`);
                  if (data.params.returnByValue !== undefined) console.log(`             • returnByValue: ${data.params.returnByValue}`);
                } else if (data.method === 'Page.setViewport') {
                  console.log(`             • viewport: ${data.params.viewport?.width}x${data.params.viewport?.height}`);
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
    console.log(`Total Juggler commands: ${commandCounter}`);

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

    // Juggler特有のフロー確認
    console.log('\n🔄 Key Juggler Flow:');
    const keyFlow = {
      'Browser.enable': 'ブラウザ有効化',
      'Browser.newPage': '新規ページ作成',
      'Page.enable': 'Pageドメイン有効化',
      'Page.navigate': 'URLナビゲーション',
      'Runtime.evaluate': 'JavaScript実行'
    };

    Object.entries(keyFlow).forEach(([method, desc]) => {
      if (jugglerCommands.includes(method)) {
        console.log(`  ✓ ${method} - ${desc}`);
      }
    });

    console.log('\n✅ Complete');
    console.log('\n💡 Juggler Protocol はPlaywrightがFirefox用に独自開発したプロトコルです');
    console.log('   CDPとは異なる独自のコマンド体系を持っています');

    process.exit(code);
  });
}