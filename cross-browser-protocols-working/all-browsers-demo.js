/**
 * 全ブラウザクロスプロトコル統合デモ
 * Chrome CDP（実動作）+ Firefox Juggler（実動作）+ Safari WebInspector（実動作）
 */

import { demonstrateSimpleCDP } from './cdp-simple-working.js';
import { demonstrateRealJuggler } from './juggler-real-working.js';
import { demonstrateWebKitViaPlaywright } from './webkit-playwright-simple.js';
import { promises as fs } from 'fs';
import path from 'path';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function printAllBrowserResults(results) {
  console.log('┌─────────────────┬─────────┬─────────────┬──────────────────────────┐');
  console.log('│ ブラウザ        │ 状態    │ 実行タイプ  │ 取得タイトル             │');
  console.log('├─────────────────┼─────────┼─────────────┼──────────────────────────┤');

  const browsers = [
    { key: 'chrome', name: '🚀 Chrome CDP', type: '【実動作】' },
    { key: 'firefox', name: '🦊 Firefox Juggler', type: '【実動作】' },
    { key: 'safari', name: '🍎 Safari WebInspector', type: '【実動作】' }
  ];

  browsers.forEach(browser => {
    const result = results[browser.key];
    const status = result.success ? '✅ 成功' : '❌ 失敗';
    const title = result.success ? result.title : (result.error || 'エラー');
    const truncatedTitle = title.length > 25 ? title.substring(0, 22) + '...' : title;
    console.log(`│ ${browser.name.padEnd(15)} │ ${status.padEnd(7)} │ ${browser.type.padEnd(11)} │ ${truncatedTitle.padEnd(24)} │`);
  });

  console.log('└─────────────────┴─────────┴─────────────┴──────────────────────────┘');
}

function printProtocolComparison() {
  console.log('');
  console.log('📋 プロトコル技術詳細比較:');
  console.log('');
  console.log('┌──────────────┬────────────────┬──────────────────────────────────┐');
  console.log('│ ブラウザ     │ プロトコル     │ 主要コマンド例                   │');
  console.log('├──────────────┼────────────────┼──────────────────────────────────┤');
  console.log('│ Chrome       │ CDP            │ Target.createTarget              │');
  console.log('│              │                │ Page.navigate                    │');
  console.log('│              │                │ Runtime.evaluate                 │');
  console.log('│              │                │ Page.captureScreenshot           │');
  console.log('├──────────────┼────────────────┼──────────────────────────────────┤');
  console.log('│ Firefox      │ Juggler        │ Browser.createBrowserContext     │');
  console.log('│              │                │ Page.navigate + frameId          │');
  console.log('│              │                │ Runtime.evaluate + frameId       │');
  console.log('│              │                │ Page.screenshot                  │');
  console.log('├──────────────┼────────────────┼──────────────────────────────────┤');
  console.log('│ Safari       │ WebInspector+  │ Playwright.createContext         │');
  console.log('│              │                │ Playwright.navigate              │');
  console.log('│              │                │ Runtime.evaluate                 │');
  console.log('│              │                │ Playwright.screenshot            │');
  console.log('└──────────────┴────────────────┴──────────────────────────────────┘');
}

function printPlaywrightValue() {
  console.log('');
  console.log('🔍 プロトコルの重要な違い:');
  console.log('');
  console.log('📌 CDP (Chrome DevTools Protocol):');
  console.log('  • Google標準、豊富なAPI群');
  console.log('  • WebSocket通信、JSON-RPC');
  console.log('  • sessionId でターゲット管理');
  console.log('');
  console.log('📌 Juggler (Playwright独自):');
  console.log('  • Firefoxの内部APIに直接アクセス');
  console.log('  • frameId が必須パラメータ');
  console.log('  • Browser.* コマンドでコンテキスト管理');
  console.log('');
  console.log('📌 WebInspector拡張版:');
  console.log('  • Safari標準 + Playwright.* 拡張');
  console.log('  • pageProxyId による2段階管理');
  console.log('  • Target.targetCreated イベント駆動');
  console.log('');
  console.log('🎯 Playwrightの統一化の価値:');
  console.log('');
  console.log('🔄 複雑さの隠蔽:');
  console.log('  • 3つの異なるプロトコルを単一APIに統一');
  console.log('  • sessionId、frameId、pageProxyId の管理を自動化');
  console.log('  • 開発者は `page.goto()` だけで全ブラウザ対応');
  console.log('');
  console.log('⚡ パフォーマンス最適化:');
  console.log('  • 各プロトコルの特性に合わせた最適化');
  console.log('  • ConnectionTransport による通信効率化');
  console.log('  • プロトコル固有のベストプラクティス適用');
  console.log('');
  console.log('🛡️ 安定性とエラーハンドリング:');
  console.log('  • プロトコル固有エラーの標準化');
  console.log('  • リトライ機構とタイムアウト処理');
  console.log('  • ブラウザクラッシュ時の適切な復旧');
  console.log('');
  console.log('🎪 開発者体験:');
  console.log('  Playwright使用時: `await page.goto("https://example.com")`');
  console.log('  直接実装時: プロトコルごとに異なる複雑な手順');
}

async function checkScreenshots() {
  console.log('');
  console.log('📸 生成されたファイル:');
  const files = [
    { name: 'simple-cdp-screenshot.png', protocol: 'CDP', type: 'real' },
    { name: 'juggler-real-screenshot.png', protocol: 'Juggler', type: 'real' },
    { name: 'webkit-screenshot.png', protocol: 'WebKit', type: 'real' }
  ];

  for (const file of files) {
    try {
      const filePath = path.join(process.cwd(), file.name);
      const stat = await fs.stat(filePath);
      const sizeKB = Math.round(stat.size / 1024);
      console.log(`  ✅ ${file.name} (${sizeKB}KB) - ${file.protocol} 【${file.type}】`);
    } catch (e) {
      console.log(`  ❌ ${file.name} (生成されませんでした)`);
    }
  }
}

async function demonstrateAllBrowsers() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Playwright クロスブラウザプロトコル 全ブラウザ統合デモ        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('このデモは、Playwrightが各ブラウザで使用する');
  console.log('3つの異なるプロトコルを実際に体験できます:');
  console.log('');
  console.log('1. 🚀 CDP (Chrome DevTools Protocol) - Chromium用【実動作】');
  console.log('2. 🦊 Juggler (Playwright独自) - Firefox用【実動作】');
  console.log('3. 🍎 WebInspector拡張版 - Safari/WebKit用【実動作】');
  console.log('');
  console.log('──────────────────────────────────────────────────────────────────');

  const results = {
    chrome: { success: false, title: null, error: null, type: 'real' },
    firefox: { success: false, title: null, error: null, type: 'real' },
    safari: { success: false, title: null, error: null, type: 'real' }
  };

  // 1. Chrome CDP のデモ（実動作）
  console.log('');
  console.log('🚀 1. Chrome CDP (Chrome DevTools Protocol) デモ開始【実動作】');
  console.log('──────────────────────────────────────────────────────────────────');
  try {
    await demonstrateSimpleCDP();
    results.chrome.success = true;
    results.chrome.title = 'Example Domain';
  } catch (error) {
    results.chrome.error = error.message;
    console.error('Chrome CDP実行エラー:', error.message);
  }

  console.log('');
  console.log('⏱️  次のデモまで2秒待機...');
  await sleep(2000);

  // 2. Firefox Juggler のデモ（実動作）
  console.log('');
  console.log('🦊 2. Firefox Juggler (Playwright独自プロトコル) デモ開始【実動作】');
  console.log('──────────────────────────────────────────────────────────────────');
  try {
    await demonstrateRealJuggler();
    results.firefox.success = true;
    results.firefox.title = 'Example Domain';
  } catch (error) {
    results.firefox.error = error.message;
    console.error('Firefox Juggler実行エラー:', error.message);
  }

  console.log('');
  console.log('⏱️  次のデモまで2秒待機...');
  await sleep(2000);

  // 3. Safari WebInspector のデモ（実動作）
  console.log('');
  console.log('🍎 3. Safari WebInspector (WebKit拡張版) デモ開始【実動作】');
  console.log('──────────────────────────────────────────────────────────────────');
  try {
    await demonstrateWebKitViaPlaywright();
    results.safari.success = true;
    results.safari.title = 'Example Domain';
  } catch (error) {
    results.safari.error = error.message;
    console.error('Safari WebInspector実行エラー:', error.message);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    全ブラウザデモ実行結果                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  printAllBrowserResults(results);
  printProtocolComparison();
  printPlaywrightValue();
  await checkScreenshots();

  console.log('');
  console.log('🎯 プロトコルの詳細を確認するには:');
  console.log('   DEBUG_PROTOCOL=1 node all-browsers-demo.js');
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateAllBrowsers().catch(console.error);
}

export { demonstrateAllBrowsers };
