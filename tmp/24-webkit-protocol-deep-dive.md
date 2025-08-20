# PlaywrightのWebKit内部プロトコル完全解析

## 発見: Playwright拡張プロトコルの実態

PlaywrightはWebKitに対して、**標準のWebInspectorプロトコルを大幅に拡張した独自プロトコル**を使用しています。

## 1. Playwright名前空間のコマンド一覧

### コア制御コマンド
```typescript
// ブラウザ制御
Playwright.enable()              // Playwright機能を有効化
Playwright.disable()             // Playwright機能を無効化
Playwright.close()               // ブラウザを閉じる
Playwright.getInfo()             // ブラウザ情報取得

// コンテキスト管理
Playwright.createContext({ proxyServer?, proxyBypassList? })
Playwright.deleteContext({ browserContextId })

// ページ管理
Playwright.createPage({ browserContextId })
Playwright.navigate({ url, pageProxyId, frameId, referrer? })
```

### ページ操作コマンド
```typescript
// スクリーンショット
Playwright.takePageScreenshot({ 
  pageProxyId, 
  mimeType?, 
  fullPage?, 
  clip? 
})

// ズーム制御
Playwright.setPageZoomFactor({ pageProxyId, zoomFactor })

// ファイルアクセス
Playwright.grantFileReadAccess({ browserContextId, files })
```

### Cookie管理
```typescript
Playwright.getAllCookies({ browserContextId })
Playwright.setCookies({ browserContextId, cookies })
Playwright.deleteAllCookies({ browserContextId })
```

### ダウンロード制御
```typescript
Playwright.setDownloadBehavior({ 
  behavior: "allow" | "deny" | "allowAndName",
  downloadPath? 
})
Playwright.cancelDownload({ uuid })
```

### 環境設定
```typescript
Playwright.setGeolocationOverride({ browserContextId, geolocation })
Playwright.setLanguages({ browserContextId, languages })
Playwright.setIgnoreCertificateErrors({ browserContextId, ignore })
Playwright.clearMemoryCache({ browserContextId })
```

## 2. イベント（WebKitからの通知）

```typescript
// ページライフサイクル
Playwright.pageProxyCreated      // ページプロキシ作成
Playwright.pageProxyDestroyed    // ページプロキシ破棄
Playwright.provisionalLoadFailed // 仮読み込み失敗
Playwright.windowOpen            // 新しいウィンドウ

// ダウンロード
Playwright.downloadCreated       // ダウンロード開始
Playwright.downloadFilenameSuggested // ファイル名提案
Playwright.downloadFinished      // ダウンロード完了

// スクリーンキャスト
Playwright.screencastFinished    // 録画完了
```

## 3. 実際のプロトコル使用例

### ナビゲーション（wkPage.ts:506）
```typescript
async navigateFrame(frame: frames.Frame, url: string, referrer: string | undefined) {
  const pageProxyId = this._pageProxySession.sessionId;
  const result = await this._pageProxySession.connection.browserSession.send(
    'Playwright.navigate', 
    { 
      url, 
      pageProxyId,     // ページプロキシID（WebKit特有）
      frameId: frame._id,  // フレームID
      referrer 
    }
  );
  return { newDocumentId: result.loaderId };
}
```

### コンテキスト作成（wkBrowser.ts:93）
```typescript
async doCreateNewContext(options: types.BrowserContextOptions) {
  const { browserContextId } = await this._browserSession.send(
    'Playwright.createContext', 
    createOptions
  );
  // ...
}
```

### ページ作成の流れ
```typescript
// 1. コンテキスト作成
const { browserContextId } = await send('Playwright.createContext');

// 2. ページ作成
const { pageProxyId } = await send('Playwright.createPage', { 
  browserContextId 
});

// 3. ナビゲーション
await send('Playwright.navigate', { 
  url: 'https://example.com',
  pageProxyId,
  frameId: 'main-frame-1'
});
```

## 4. プロトコルの特徴

### WebKit特有の概念

1. **PageProxy**
   - WebKitのプロセス分離アーキテクチャの一部
   - UIプロセスとWebプロセス間の橋渡し
   - `pageProxyId`で識別

2. **二段階のセッション管理**
   ```
   BrowserSession (ブラウザ全体)
   └── PageProxySession (各ページ)
       └── PageSession (実際のページ内容)
   ```

3. **Frame必須**
   - すべてのナビゲーションにframeIdが必要
   - メインフレームも明示的に指定

### 標準WebInspectorとの違い

| 機能 | 標準WebInspector | Playwright拡張 |
|------|-----------------|---------------|
| ナビゲーション | `Page.navigate({ url })` | `Playwright.navigate({ url, pageProxyId, frameId })` |
| スクリーンショット | `Page.captureScreenshot()` | `Playwright.takePageScreenshot({ pageProxyId })` |
| コンテキスト管理 | なし | `Playwright.createContext()` |
| プロキシ設定 | なし | コンテキスト作成時に設定可能 |

## 5. 通信方式

### PipeTransport（stdio）
```typescript
// WebKitプロセス起動
spawn(webkitPath, [
  '--inspector-pipe',  // パイプモード有効化
  '--headless'
], {
  stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
  //                                  ↑      ↑
  //                              stdin(3) stdout(4)
});

// 双方向通信
new PipeTransport(
  browserProcess.stdio[3],  // プロトコル入力
  browserProcess.stdio[4]   // プロトコル出力
);
```

## 6. 実装の階層

```
playwright API (page.goto)
    ↓
WKPage (navigateFrame)
    ↓
WKConnection (send)
    ↓
PipeTransport (stdio通信)
    ↓
WebKit Process (pw_run.sh)
```

## 7. デバッグ方法

### プロトコルメッセージの確認
```javascript
// protocolLoggerを設定
new WKConnection(transport, onDisconnect, 
  (direction, message) => {
    console.log(`WebInspector ${direction}:`, JSON.stringify(message));
  }
);
```

### 実際のメッセージ例
```json
// 送信
{
  "id": 1,
  "method": "Playwright.navigate",
  "params": {
    "url": "https://example.com",
    "pageProxyId": "page-proxy-1",
    "frameId": "main-frame-1"
  }
}

// 受信
{
  "id": 1,
  "result": {
    "loaderId": "loader-123"
  }
}
```

## 結論

PlaywrightのWebKit実装は：

1. **独自プロトコル**: `Playwright.*`名前空間の専用コマンド群
2. **PageProxy概念**: WebKit特有のプロセス分離を反映
3. **stdio通信**: WebSocketではなくパイプ経由
4. **完全な制御**: コンテキスト、プロキシ、言語設定など

これにより、標準WebInspectorでは不可能な高度な制御を実現しています。

## カンファレンス発表への活用

この調査により、以下の点を具体的に説明できます：

- **なぜPlaywrightが必要か**: 標準プロトコルの限界
- **どのように実装されているか**: 各ブラウザへの独自拡張
- **統一APIの価値**: 3つの異なるプロトコルを隠蔽

特にWebKitの`Playwright.navigate`と、CDPの`Page.navigate`、Jugglerの`Page.navigate`の違いを実例で示すことで、Playwrightの技術的複雑さと価値を効果的に伝えられます。