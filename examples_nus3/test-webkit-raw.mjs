#!/usr/bin/env node
/**
 * WebKit プロトコル生ログ確認用
 */

import playwright from '../packages/playwright-core/index.js';
const { webkit } = playwright;

process.env.DEBUG = 'pw:protocol';

async function test() {
  console.log('Starting WebKit...');

  const browser = await webkit.launch({
    headless: false
  });

  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.waitForTimeout(2000);
  await browser.close();

  console.log('Done');
}

test().catch(console.error);
