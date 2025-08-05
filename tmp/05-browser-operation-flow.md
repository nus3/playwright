# Playwrightのブラウザ操作フロー

## 基本的なアーキテクチャ

### クライアント・サーバー分離
```
ユーザーコード → クライアントAPI → Channel通信 → サーバー側実装 → ブラウザ
```

## 主要な処理フロー

### 1. ブラウザ起動 (playwright.chromium.launch())

**クライアント側:**
```typescript
// client/playwright.ts
class Playwright {
  chromium: BrowserType
}

// client/browserType.ts
class BrowserType {
  async launch(options?: LaunchOptions): Promise<Browser> {
    return this._channel.launch(launchOptions);
  }
}
```

**サーバー側:**
```typescript
// dispatchers/browserTypeDispatcher.ts
class BrowserTypeDispatcher {
  async launch(params: BrowserTypeLaunchParams): Promise<BrowserChannel> {
    const browser = await this._object.launch(progress, params);
  }
}

// server/browserType.ts
abstract class BrowserType {
  async launch(progress: Progress, options: LaunchOptions): Promise<Browser> {
    return this._innerLaunch(progress, options);
  }
}
```

### 2. ページ作成 (browser.newPage())

**クライアント側:**
```typescript
// client/browser.ts
class Browser {
  async newPage(options?: BrowserContextOptions): Promise<Page> {
    const context = await this.newContext(options);
    const page = await context.newPage();
    return page;
  }
}
```

### 3. ナビゲーション (page.goto())

**クライアント側:**
```typescript
// client/page.ts
class Page {
  async goto(url: string, options?: GotoOptions): Promise<Response | null> {
    return this._mainFrame.goto(url, options);
  }
}

// client/frame.ts
class Frame {
  async goto(url: string, options?: GotoOptions): Promise<Response | null> {
    return this._channel.goto({ url, ...options });
  }
}
```

## Channel通信の仕組み

- `@protocol/channels` で定義されたインターフェース
- 型安全な双方向通信
- JSON-RPCライクなプロトコル

## 次に調査すべきポイント

1. 各ブラウザ固有の実装がどこで分岐するか
2. プロトコル（CDP、Juggler、WebInspector）の違いをどう吸収しているか
3. ConnectionTransportの実装詳細