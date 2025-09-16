#!/usr/bin/env node
/**
 * Chromium CDP 生ログ確認用
 */

import playwright from '../packages/playwright-core/index.js';
const { chromium } = playwright;

process.env.DEBUG = 'pw:protocol';

async function test() {
  console.log('Starting Chromium...');
  
  const browser = await chromium.launch({
    headless: false
  });
  
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.waitForTimeout(2000);
  await browser.close();
  
  console.log('Done');
}

test().catch(console.error);