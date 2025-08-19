/**
 * Playwright経由でWebKitを操作する実動作デモ
 * WebKitの内部プロトコルの特殊性を実証
 */

import { webkit } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

export async function demonstrateWebKitViaPlaywright() {
  console.log('=== WebKit (Safari) 実動作デモ ===');
  console.log('');
  console.log('📝 PlaywrightのWebKitは独自の内部プロトコルを使用');
  console.log('   CDPやJugglerとは異なり、直接的なプロトコルアクセスは制限されています');
  console.log('');
  
  let browser = null;
  
  try {
    // WebKitブラウザを起動
    console.log('WebKit: ブラウザを起動中...');
    browser = await webkit.launch({
      headless: true
    });
    
    // 新しいコンテキストとページを作成
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log('WebKit: 新しいページを作成しました');
    
    // example.comに移動
    console.log('WebKit: example.comに移動中...');
    await page.goto('https://example.com');
    console.log('WebKit: ページ移動完了');
    
    // タイトルを取得
    const title = await page.title();
    console.log(`WebKit: ページタイトル = "${title}"`);
    
    // JavaScriptを実行（evaluateを使用）
    const jsResult = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        userAgent: navigator.userAgent
      };
    });
    console.log('WebKit: JavaScript実行結果:');
    console.log(`  - タイトル: ${jsResult.title}`);
    console.log(`  - URL: ${jsResult.url}`);
    console.log(`  - UserAgent: ${jsResult.userAgent.substring(0, 50)}...`);
    
    // スクリーンショットを取得
    const screenshot = await page.screenshot();
    const screenshotPath = path.join(process.cwd(), 'webkit-screenshot.png');
    await fs.writeFile(screenshotPath, screenshot);
    console.log(`WebKit: スクリーンショットを保存: ${screenshotPath}`);
    
    console.log('');
    console.log('=== WebKit デモ完了 ===');
    console.log(`✅ 取得したタイトル: ${title}`);
    console.log(`✅ スクリーンショット: webkit-screenshot.png`);
    console.log('');
    console.log('🔍 WebKitの特徴:');
    console.log('  1. CDPSessionは利用不可（Chromium専用）');
    console.log('  2. 内部的にはWebInspectorプロトコルベース');
    console.log('  3. Playwrightが独自の抽象化レイヤーを提供');
    console.log('  4. Safariと同じWebKitエンジンを使用');
    
  } catch (error) {
    console.error('❌ WebKitデモエラー:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('');
      console.log('WebKit: ブラウザを終了しました');
    }
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateWebKitViaPlaywright().catch(console.error);
}