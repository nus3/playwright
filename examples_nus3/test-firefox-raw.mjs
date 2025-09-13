#!/usr/bin/env node
/**
 * Firefox Juggler 生ログ確認用
 */

import playwright from '../packages/playwright-core/index.js';
const { firefox } = playwright;

process.env.DEBUG = 'pw:protocol';

async function test() {
  console.log('Starting Firefox...');

  const browser = await firefox.launch({
    headless: false
  });

  const page = await browser.newPage();
  await page.goto('https://playwright.dev');
  await page.waitForTimeout(2000);
  // await browser.close();

  console.log('Done');
}

test().catch(console.error);
