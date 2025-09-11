# Playwright ユーザー向け API エントリーポイント分析

## 概要
Playwrightのユーザー向けAPI（`playwright.chromium`、`playwright.firefox`、`playwright.webkit`）がどこで定義・エクスポートされ、どのようにユーザーに公開されるかを調査した結果をまとめる。

## 主要な発見

### 1. パッケージ構成と依存関係
```
packages/playwright/
├── index.js         → require('playwright-core')
├── index.d.ts       → export * from 'playwright-core'
└── package.json     → メインのPlaywrightパッケージ

packages/playwright-core/
├── index.js         → require('./lib/inprocess')
├── index.d.ts       → export * from './types/types'
├── src/
│   ├── inprocess.ts       → createInProcessPlaywright()を呼び出し
│   └── inProcessFactory.ts → 実際のAPI作成ロジック
└── types/types.d.ts → TypeScript定義
```

### 2. APIエントリーポイントの流れ

#### 2.1 ユーザーの視点
```javascript
const { chromium, firefox, webkit } = require('playwright');
// または
import { chromium, firefox, webkit } from 'playwright';
```

#### 2.2 内部の流れ
1. **packages/playwright** → **packages/playwright-core** への参照
2. **playwright-core/index.js** → **./lib/inprocess** への参照
3. **src/inprocess.ts** → `createInProcessPlaywright()` 関数呼び出し
4. **src/inProcessFactory.ts** → 実際のPlaywrightオブジェクト構築

### 3. createInProcessPlaywright 関数の重要な処理

#### 3.1 ファイル: `src/inProcessFactory.ts`
```typescript
export function createInProcessPlaywright(): PlaywrightAPI {
  // 1. サーバー側Playwrightオブジェクトを作成
  const playwright = createPlaywright({ 
    sdkLanguage: (process.env.PW_LANG_NAME as Language | undefined) || 'javascript' 
  });
  
  // 2. クライアント-サーバー間の通信チャネル設定
  const clientConnection = new Connection(nodePlatform);
  const dispatcherConnection = new DispatcherConnection(true /* local */);
  
  // 3. 双方向メッセージディスパッチの設定
  dispatcherConnection.onmessage = message => clientConnection.dispatch(message);
  clientConnection.onmessage = message => dispatcherConnection.dispatch(message);
  
  // 4. Playwrightディスパッチャーの初期化
  const rootScope = new RootDispatcher(dispatcherConnection);
  new PlaywrightDispatcher(rootScope, playwright);
  
  // 5. クライアント側APIオブジェクトの取得
  const playwrightAPI = clientConnection.getObjectWithKnownName('Playwright') as PlaywrightAPI;
  
  // 6. ★重要★ 各ブラウザタイプにサーバーランチャーを設定
  playwrightAPI.chromium._serverLauncher = new BrowserServerLauncherImpl('chromium');
  playwrightAPI.firefox._serverLauncher = new BrowserServerLauncherImpl('firefox');
  playwrightAPI.webkit._serverLauncher = new BrowserServerLauncherImpl('webkit');
  playwrightAPI._android._serverLauncher = new AndroidServerLauncherImpl();
  playwrightAPI._bidiChromium._serverLauncher = new BrowserServerLauncherImpl('_bidiChromium');
  playwrightAPI._bidiFirefox._serverLauncher = new BrowserServerLauncherImpl('_bidiFirefox');
  
  return playwrightAPI;
}
```

### 4. Playwright クライアント側クラス

#### 4.1 ファイル: `src/client/playwright.ts`
```typescript
export class Playwright extends ChannelOwner<channels.PlaywrightChannel> {
  readonly chromium: BrowserType;    // ★ユーザーが使用する chromium オブジェクト
  readonly firefox: BrowserType;     // ★ユーザーが使用する firefox オブジェクト
  readonly webkit: BrowserType;      // ★ユーザーが使用する webkit オブジェクト
  
  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.PlaywrightInitializer) {
    super(parent, type, guid, initializer);
    
    // 各ブラウザタイプの初期化
    this.chromium = BrowserType.from(initializer.chromium);
    this.chromium._playwright = this;
    this.firefox = BrowserType.from(initializer.firefox);
    this.firefox._playwright = this;
    this.webkit = BrowserType.from(initializer.webkit);
    this.webkit._playwright = this;
  }
}
```

### 5. BrowserType クラス（各ブラウザの実装）

#### 5.1 ファイル: `src/client/browserType.ts`
```typescript
export class BrowserType extends ChannelOwner<channels.BrowserTypeChannel> implements api.BrowserType {
  _serverLauncher?: BrowserServerLauncher;  // inProcessFactory.tsで設定される
  
  async launch(options: LaunchOptions = {}): Promise<Browser> {
    // オプションの設定とバリデーション
    const launchOptions: channels.BrowserTypeLaunchParams = { /* ... */ };
    
    // ★重要★ チャネル経由でブラウザを起動
    const browser = Browser.from((await this._channel.launch(launchOptions)).browser);
    browser._connectToBrowserType(this, options, logger);
    return browser;
  }
}
```

### 6. TypeScript型定義

#### 6.1 ファイル: `packages/playwright-core/types/types.d.ts`
```typescript
// トップレベルエクスポート
export const chromium: BrowserType;  // "This object can be used to launch or connect to Chromium"
export const firefox: BrowserType;   // "This object can be used to launch or connect to Firefox"  
export const webkit: BrowserType;    // "This object can be used to launch or connect to WebKit"

export interface BrowserType<Unused = {}> {
  launch(options?: LaunchOptions): Promise<Browser>;
  launchServer(options?: LaunchServerOptions): Promise<BrowserServer>;
  launchPersistentContext(userDataDir: string, options?: LaunchPersistentContextOptions): Promise<BrowserContext>;
  connect(wsEndpoint: string, options?: ConnectOptions): Promise<Browser>;
  connectOverCDP(endpointURL: string, options?: ConnectOverCDPOptions): Promise<Browser>;
  executablePath(): string;
  name(): string;
}
```

## まとめ

### アーキテクチャの特徴
1. **レイヤー構造**: `packages/playwright` → `packages/playwright-core` → 実装
2. **通信アーキテクチャ**: クライアント-サーバー間でチャネル通信を使用
3. **統一インターフェース**: すべてのブラウザが `BrowserType` インターフェースを実装
4. **プロセス内実行**: `createInProcessPlaywright()` でシングルプロセス内で完結

### ユーザーAPIの流れ
1. ユーザーが `playwright.chromium.launch()` を呼び出し
2. `BrowserType.launch()` メソッドが実行
3. `this._channel.launch()` でチャネル通信経由でサーバー側に要求
4. サーバー側で実際のブラウザ起動処理が実行
5. `Browser` オブジェクトがクライアント側に返される

この構造により、ユーザーは統一されたAPIで異なるブラウザを同じように操作できる。