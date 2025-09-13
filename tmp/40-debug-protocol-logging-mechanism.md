# DEBUG=pw:protocol によるログ出力の仕組み

## 概要

PlaywrightではDEBUG環境変数を使用してプロトコルレベルのログを出力できます。`DEBUG=pw:protocol`を設定すると、Playwrightとブラウザ間で送受信されるすべてのコマンドとレスポンスを確認できます。

## 実装の全体像

```
DEBUG=pw:protocol
    ↓
debug ライブラリ (npm パッケージ)
    ↓
debugLogger (debugLogger.ts)
    ↓
helper.debugProtocolLogger() (helper.ts)
    ↓
各ブラウザのConnection クラス
```

## 主要コンポーネント

### 1. debugライブラリ (npm package)

- PlaywrightはNode.jsの標準的なデバッグライブラリ`debug`を使用
- `packages/playwright-core/bundles/utils/src/utilsBundleImpl.ts`でインポート
- 環境変数`DEBUG`の値に基づいて、特定の名前空間のログ出力を制御

### 2. debugLogger.ts

場所: `packages/playwright-core/src/server/utils/debugLogger.ts`

```typescript
class DebugLogger {
  log(name: LogName, message: string | Error | object) {
    let cachedDebugger = this._debuggers.get(name);
    if (!cachedDebugger) {
      cachedDebugger = debug(`pw:${name}`);  // pw:protocol という名前空間を作成
      this._debuggers.set(name, cachedDebugger);
      (cachedDebugger as any).color = debugLoggerColorMap[name] || 0;
    }
    cachedDebugger(message);
  }

  isEnabled(name: LogName) {
    return debug.enabled(`pw:${name}`);  // DEBUG環境変数にpw:protocolが含まれているかチェック
  }
}
```

主要な役割:
- `pw:`プレフィックスを自動的に付与
- カラーコード管理（protocol は 34 = 緑色）
- デバッガーインスタンスのキャッシュ

### 3. helper.debugProtocolLogger()

場所: `packages/playwright-core/src/server/helper.ts:83-94`

```typescript
static debugProtocolLogger(protocolLogger?: types.ProtocolLogger): types.ProtocolLogger {
  return (direction: 'send' | 'receive', message: object) => {
    if (protocolLogger)
      protocolLogger(direction, message);
    if (debugLogger.isEnabled('protocol')) {
      let text = JSON.stringify(message);
      if (text.length > MAX_LOG_LENGTH)
        text = text.substring(0, MAX_LOG_LENGTH / 2) + ' <<<<<( LOG TRUNCATED )>>>>> ' + 
              text.substring(text.length - MAX_LOG_LENGTH / 2);
      debugLogger.log('protocol', (direction === 'send' ? 'SEND ► ' : '◀ RECV ') + text);
    }
  };
}
```

主要な機能:
- プロトコルメッセージをJSON文字列化
- 送信/受信の方向を視覚的に表示（SEND ► / ◀ RECV）
- 長いメッセージの自動トランケート（MAX_LOG_LENGTHで制御）

### 4. 各ブラウザのConnectionクラス

#### Chromium (CRConnection)
場所: `packages/playwright-core/src/server/chromium/crConnection.ts`

```typescript
// メッセージ送信時
_rawSend(sessionId: string, method: string, params: any): number {
  const id = ++this._lastId;
  const message: ProtocolRequest = { id, method, params };
  if (sessionId)
    message.sessionId = sessionId;
  this._protocolLogger('send', message);  // ここでログ出力
  this._transport.send(message);
  return id;
}

// メッセージ受信時
async _onMessage(message: ProtocolResponse) {
  this._protocolLogger('receive', message);  // ここでログ出力
  // ...
}
```

#### Firefox (FFConnection)
場所: `packages/playwright-core/src/server/firefox/ffConnection.ts`

```typescript
_rawSend(message: ProtocolRequest) {
  this._protocolLogger('send', message);
  this._transport.send(message);
}

async _onMessage(message: ProtocolResponse) {
  this._protocolLogger('receive', message);
  // ...
}
```

#### WebKit (WKConnection)
場所: `packages/playwright-core/src/server/webkit/wkConnection.ts`

```typescript
rawSend(message: ProtocolRequest) {
  this._protocolLogger('send', message);
  this._transport.send(message);
}

private _dispatchMessage(message: ProtocolResponse) {
  this._protocolLogger('receive', message);
  // ...
}
```

## ブラウザごとの初期化

各ブラウザは起動時に`helper.debugProtocolLogger()`を呼び出してprotocolLoggerを作成します。

### Chromium
`packages/playwright-core/src/server/chromium/chromium.ts:104`
```typescript
const browserOptions: BrowserOptions = {
  // ...
  protocolLogger: helper.debugProtocolLogger(),
  // ...
};
```

### Firefox & WebKit
同様の方法でprotocolLoggerを設定

## 出力フォーマット

```
# 送信時
pw:protocol SEND ► {"id":1,"method":"Browser.getVersion","params":{}}

# 受信時  
pw:protocol ◀ RECV {"id":1,"result":{"product":"Chrome/128.0.6613.18","revision":"...","userAgent":"..."}}
```

## デバッグ出力の制御

### 基本的な使用方法
```bash
DEBUG=pw:protocol node your-script.js
```

### 複数の名前空間を有効化
```bash
DEBUG=pw:protocol,pw:api node your-script.js
```

### ファイルへの出力
```bash
DEBUG_FILE=debug.log DEBUG=pw:protocol node your-script.js
```

## その他の設定

### MAX_LOG_LENGTH
- 環境変数`MAX_LOG_LENGTH`で最大ログ長を制御
- デフォルトは無制限（Infinity）
- 長いメッセージは中央部分がトランケートされる

### カラーコード
debugLogger.tsで定義されているカラーマップ:
- `protocol`: 34 (緑)
- `api`: 45 (シアン)
- `browser`: 0 (リセット)
- `error`: 160 (赤)
- など

## まとめ

`DEBUG=pw:protocol`の仕組みは以下の流れで動作します：

1. 環境変数`DEBUG`に`pw:protocol`が設定される
2. debugライブラリがこの設定を検知
3. 各ブラウザのConnectionクラスがメッセージ送受信時にprotocolLoggerを呼び出す
4. helper.debugProtocolLogger()がメッセージをフォーマット
5. debugLogger.log()を通じてdebugライブラリがコンソールに出力

この仕組みにより、Playwrightは統一されたインターフェースで全ブラウザのプロトコルログを出力できます。