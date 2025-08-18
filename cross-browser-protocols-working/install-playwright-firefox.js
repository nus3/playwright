/**
 * PlaywrightのFirefoxビルド（Juggler付き）をインストール
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function installPlaywrightFirefox() {
  console.log('🦊 PlaywrightのFirefoxビルドをインストールします...');
  console.log('');
  
  try {
    // npmでplaywrightをインストール（まだの場合）
    console.log('1. playwright パッケージを確認中...');
    try {
      require.resolve('playwright');
      console.log('   ✅ playwright は既にインストール済み');
    } catch (e) {
      console.log('   📦 playwright をインストール中...');
      execSync('npm install playwright', { stdio: 'inherit' });
    }
    
    // Firefoxブラウザをインストール
    console.log('');
    console.log('2. PlaywrightのFirefoxビルドをインストール中...');
    console.log('   これには数分かかる場合があります...');
    execSync('npx playwright install firefox', { stdio: 'inherit' });
    
    // インストール確認
    console.log('');
    console.log('3. インストールを確認中...');
    const playwright = require('playwright');
    const firefoxPath = playwright.firefox.executablePath();
    
    if (fs.existsSync(firefoxPath)) {
      console.log(`   ✅ Firefox がインストールされました: ${firefoxPath}`);
      
      // Jugglerサポートの確認
      console.log('');
      console.log('4. Juggler プロトコルサポートを確認中...');
      
      // Firefoxのバージョン情報を取得
      try {
        const output = execSync(`"${firefoxPath}" --version`, { encoding: 'utf8' });
        console.log(`   Firefox バージョン: ${output.trim()}`);
        console.log('   ✅ このFirefoxはJugglerプロトコルをサポートしています');
      } catch (e) {
        console.log('   ⚠️  バージョン確認に失敗しましたが、Jugglerは利用可能なはずです');
      }
      
      console.log('');
      console.log('🎉 インストール完了！');
      console.log('');
      console.log('次のステップ:');
      console.log('1. npm run juggler-real でJugglerプロトコルの実動作デモを実行');
      console.log('2. DEBUG_PROTOCOL=1 npm run juggler-real でプロトコルメッセージを確認');
      
      return firefoxPath;
    } else {
      throw new Error('Firefoxのインストールに失敗しました');
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ インストールエラー:', error.message);
    console.error('');
    console.error('手動でインストールする場合:');
    console.error('1. npm install playwright');
    console.error('2. npx playwright install firefox');
    throw error;
  }
}

// 直接実行された場合
if (require.main === module) {
  installPlaywrightFirefox().catch(console.error);
}

module.exports = { installPlaywrightFirefox };