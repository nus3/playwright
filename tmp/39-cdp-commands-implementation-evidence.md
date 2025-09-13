# ChromiumとPlaywright間のCDPコマンドやり取りの証拠

## 実装箇所とCDPコマンドの具体例

### 1. ブラウザ起動時の最初のCDPコマンド（crBrowser.ts:70）
```typescript
const version = await session.send('Browser.getVersion');
```
→ **CDPコマンド**: `Browser.getVersion` - ブラウザのバージョン情報を取得

### 2. ターゲット自動アタッチ設定（crBrowser.ts:77）
```typescript
await session.send('Target.setAutoAttach', { 
  autoAttach: true, 
  waitForDebuggerOnStart: true, 
  flatten: true 
});
```
→ **CDPコマンド**: `Target.setAutoAttach` - 新しいタブやフレームを自動的に監視

### 3. ページナビゲーション（crPage.ts:579）
```typescript
async _navigate(frame: frames.Frame, url: string, referrer: string | undefined): Promise<frames.GotoResult> {
  const response = await this._client.send('Page.navigate', { 
    url, 
    referrer, 
    frameId: frame._id, 
    referrerPolicy: 'unsafeUrl' 
  });
  // ...
}
```
→ **CDPコマンド**: `Page.navigate` - 指定URLへページ遷移

### 4. JavaScript実行（crExecutionContext.ts:39, 50）
```typescript
// JSON評価
const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.evaluate', {
  expression,
  contextId: this._contextId,
  returnByValue: true
});

// ハンドル評価
const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.evaluate', {
  expression,
  contextId: this._contextId,
  returnByValue: false
});
```
→ **CDPコマンド**: `Runtime.evaluate` - JavaScript式を実行

### 5. 新しいページ作成（crBrowser.ts:374）
```typescript
const { targetId } = await this._browser._session.send('Target.createTarget', { 
  url: 'about:blank', 
  browserContextId: this._browserContextId 
});
```
→ **CDPコマンド**: `Target.createTarget` - 新しいタブ/ウィンドウを作成

### 6. 履歴ナビゲーション（crPage.ts:219）
```typescript
await this._mainFrameSession._client.send('Page.navigateToHistoryEntry', { 
  entryId: entry.id 
});
```
→ **CDPコマンド**: `Page.navigateToHistoryEntry` - 履歴の特定エントリーへ移動

## CDPプロトコル定義の証拠

`chromium/protocol.d.ts`には、Chrome DevTools Protocolの完全な型定義があります：

```typescript
export module Protocol {
  export module Browser {
    export interface getVersionParameters {}
    export interface getVersionReturnValue {
      protocolVersion: string;
      product: string;
      revision: string;
      userAgent: string;
      jsVersion: string;
    }
  }
  
  export module Page {
    export interface navigateParameters {
      url: string;
      referrer?: string;
      transitionType?: TransitionType;
      frameId?: FrameId;
      referrerPolicy?: ReferrerPolicy;
    }
    export interface navigateReturnValue {
      frameId: FrameId;
      loaderId?: LoaderId;
      errorText?: string;
    }
  }
  
  export module Runtime {
    export interface evaluateParameters {
      expression: string;
      objectGroup?: string;
      includeCommandLineAPI?: boolean;
      silent?: boolean;
      contextId?: ExecutionContextId;
      returnByValue?: boolean;
      // ...
    }
  }
}
```

## デバッグ方法

### 1. プロトコルログを有効化
```bash
DEBUG=pw:protocol node test.js
```

### 2. CDPポートを指定して外部ツールで確認
```javascript
await chromium.launch({
  args: ['--remote-debugging-port=9222']
});
```
Chrome DevToolsでlocalhost:9222にアクセスすると、実際のCDPコマンドを確認できます。

### 3. ProtocolLoggerの実装（crConnection.ts）
```typescript
this._protocolLogger('send', message);  // 送信時
this._protocolLogger('receive', message);  // 受信時
```

## まとめ

- **確実にCDPを使用**: `Browser.getVersion`、`Page.navigate`、`Runtime.evaluate`など
- **プロトコル定義**: `chromium/protocol.d.ts`に22,000行以上のCDP型定義
- **session.send()**: すべてのCDPコマンドはこのメソッドを通じて送信
- **型安全**: TypeScriptの型システムでCDPコマンドとパラメータを厳密に管理