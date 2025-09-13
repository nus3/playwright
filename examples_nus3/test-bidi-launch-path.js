// BiDiプロトコルの起動パスを理解するデモ

console.log('=== BiDiプロトコルの起動パスの理解 ===\n');

console.log('1. 通常のブラウザとBiDiブラウザは別のBrowserTypeクラス：');
console.log('   playwright.chromium       → Chromium クラス');
console.log('   playwright._bidiChromium  → BidiChromium クラス（別クラス！）');
console.log('   playwright.firefox        → Firefox クラス');
console.log('   playwright._bidiFirefox   → BidiFirefox クラス（別クラス！）\n');

console.log('2. 起動時の流れ：');
console.log(`
通常のChromium起動:
  playwright.chromium.launch()
    ↓
  Chromium._launchProcess()
    ↓
  通信プロトコル選択（CDP via Pipe or WebSocket）

BiDi Chromium起動:
  playwright._bidiChromium.launch()
    ↓
  BidiChromium._launchProcess()  ← 同じ_launchProcessだが別クラス
    ↓
  通信プロトコル選択（BiDi over CDP via WebSocket のみ）
`);

console.log('3. _launchProcess内での違い：\n');

console.log('【Chromium._launchProcess】');
console.log('  supportsPipeTransport() → true');
console.log('  → Pipe通信 or WebSocket通信を選択可能\n');

console.log('【BidiChromium._launchProcess】');
console.log('  supportsPipeTransport() → false （オーバーライド）');
console.log('  → WebSocket通信のみ（BiDi over CDPのため）\n');

console.log('4. コードでの実装（bidiChromium.ts:92-94）：');
console.log(`
override supportsPipeTransport(): boolean {
  return false;  // Pipe通信を無効化
}
`);

console.log('5. connectToTransportの違い：\n');

console.log('【通常のChromium】');
console.log('  CRBrowser.connect() → CDP直接接続\n');

console.log('【BidiChromium】');
console.log('  bidiOverCdp.connectBidiOverCdp() → CDP上にBiDiレイヤー追加');
console.log('  BidiBrowser.connect() → BiDiプロトコルで接続\n');

console.log('=== まとめ ===\n');
console.log('✗ _launchProcess内でBiDiプロトコルを選択するわけではない');
console.log('✓ 最初から別のBrowserTypeクラス（BidiChromium/BidiFirefox）を使用');
console.log('✓ 各クラスがsupportsPipeTransport()やconnectToTransport()をオーバーライド');
console.log('✓ プロトコルの選択は「どのBrowserTypeを使うか」で決まる\n');

// 実際に確認
async function verifyBidiImplementation() {
  const playwright = require('../packages/playwright-core/types/types');

  console.log('=== 実際のオブジェクトで確認 ===\n');

  // クラス名の確認
  console.log('playwright.chromium のクラス:', playwright.chromium.constructor.name);
  console.log('playwright._bidiChromium のクラス:', playwright._bidiChromium?.constructor.name || 'undefined');

  // 同じlaunchメソッドでも実装が異なる
  console.log('\nlaunchメソッドの実装:');
  console.log('chromium.launch === _bidiChromium.launch?',
    playwright.chromium.launch === playwright._bidiChromium?.launch);

  // プロトタイプチェーンの確認
  if (playwright._bidiChromium) {
    console.log('\nプロトタイプチェーン:');
    console.log('_bidiChromium instanceof BrowserType?',
      Object.getPrototypeOf(Object.getPrototypeOf(playwright._bidiChromium)).constructor.name);
  }
}

verifyBidiImplementation().catch(console.error);
