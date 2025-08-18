# Playwright本体コード参照ガイド - 最小実装で参考にした箇所

## 作成日時
2025-08-18

## 目的
最小実装を作成する際に参考にしたPlaywright本体のコード箇所をまとめ、後から本体コードを読む際のガイドとする。

## 1. プロトコル通信の基盤実装

### ConnectionTransport インターフェース
**ファイル**: `/packages/playwright-core/src/server/transport.ts`
- **行数**: 56-61行目
- **参考にした内容**: 
  - プロトコル通信の統一インターフェース定義
  - `ProtocolRequest`と`ProtocolResponse`の型定義
  - WebSocketとPipeの共通インターフェース

```typescript
// transport.ts:38-54
export type ProtocolRequest = {
  id: number;
  method: string;
  params: any;
  sessionId?: string;
};

export type ProtocolResponse = {
  id?: number;
  method?: string;
  sessionId?: string;
  error?: { message: string; data: any; code?: number };
  params?: any;
  result?: any;
  pageProxyId?: string;
  browserContextId?: string;
};
```

### WebSocketTransport 実装
**ファイル**: `/packages/playwright-core/src/server/transport.ts`
- **行数**: 69-204行目
- **参考にした内容**:
  - WebSocket接続の確立方法
  - メッセージ送受信の実装パターン
  - JSON-RPCメッセージのハンドリング

### PipeTransport 実装
**ファイル**: `/packages/playwright-core/src/server/pipeTransport.ts`
- **行数**: 23-94行目
- **参考にした内容**:
  - パイプ通信の実装方法
  - メッセージのバッファリング処理
  - '\0'区切りのメッセージパース

## 2. CDP (Chromium) 実装の参照箇所

### CRPage クラス
**ファイル**: `/packages/playwright-core/src/server/chromium/crPage.ts`
- **行数**: 57-100行目（クラス定義）
- **参考にした内容**:
  - CDPセッション管理
  - Chromium固有の初期化処理

### CDP navigate実装
**ファイル**: `/packages/playwright-core/src/server/chromium/crPage.ts`
- **検索キーワード**: `client.send('Page.navigate'`
- **具体的なコマンド**:
```typescript
// ナビゲーション実装の参考箇所
const response = await this._client.send('Page.navigate', { 
  url, 
  referrer, 
  frameId: frame._id, 
  referrerPolicy: 'unsafeUrl' 
});
```

### CDP Runtime.evaluate実装
**ファイル**: `/packages/playwright-core/src/server/chromium/crExecutionContext.ts`
- **参考にした内容**:
  - `Runtime.evaluate`の使用方法
  - JavaScript実行とレスポンス処理

## 3. Juggler (Firefox) 実装の参照箇所

### FFPage クラス
**ファイル**: `/packages/playwright-core/src/server/firefox/ffPage.ts`
- **行数**: 43-100行目（クラス定義とイベントリスナー）
- **参考にした内容**:
  - Juggler固有のセッション管理
  - Firefox専用イベントハンドラー

### Juggler navigate実装
**ファイル**: `/packages/playwright-core/src/server/firefox/ffPage.ts`
- **検索キーワード**: `session.send('Page.navigate'`
- **具体的なコマンド**:
```typescript
// Jugglerのナビゲーション実装
const response = await this._session.send('Page.navigate', { 
  url, 
  referer, 
  frameId: frame._id 
});
```

### Jugglerプロトコル定義
**ファイル**: `/packages/playwright-core/src/server/firefox/protocol.d.ts`
- **参考にした内容**:
  - Jugglerプロトコルのメソッド一覧
  - パラメータ型定義

### Juggler実装本体（ブラウザパッチ）
**ディレクトリ**: `/browser_patches/firefox/juggler/`
- **主要ファイル**:
  - `content/PageAgent.js` - ページ操作の実装
  - `content/Runtime.js` - JavaScript実行環境
  - `content/FrameTree.js` - フレーム管理

## 4. WebInspector (WebKit) 実装の参照箇所

### WKPage クラス
**ファイル**: `/packages/playwright-core/src/server/webkit/wkPage.ts`
- **行数**: 55-100行目（クラス定義）
- **参考にした内容**:
  - pageProxySessionの管理
  - WebKit固有の初期化処理

### WebInspector navigate実装
**ファイル**: `/packages/playwright-core/src/server/webkit/wkPage.ts`
- **検索キーワード**: `browserSession.send('Playwright.navigate'`
- **具体的なコマンド**:
```typescript
// WebInspectorのナビゲーション実装
const result = await this._pageProxySession.connection.browserSession.send(
  'Playwright.navigate', 
  { 
    url, 
    pageProxyId, 
    frameId: frame._id, 
    referrer 
  }
);
```

### WebInspectorプロトコル定義
**ファイル**: `/packages/playwright-core/src/server/webkit/protocol.d.ts`
- **参考にした内容**:
  - WebInspectorプロトコルの拡張定義
  - Playwright.*メソッドの追加

### WebKitブラウザパッチ
**ディレクトリ**: `/browser_patches/webkit/`
- **主要ファイル**:
  - WebKit embedderの実装
  - プロトコル拡張の実装

## 5. 共通パターンの参照箇所

### BrowserType 抽象化
**ファイル**: `/packages/playwright-core/src/server/browserType.ts`
- **行数**: 全体的なアーキテクチャ理解
- **参考にした内容**:
  - ブラウザ起動処理の統一
  - プロセス管理の抽象化

### Frame管理
**ファイル**: `/packages/playwright-core/src/server/frames.ts`
- **行数**: 438-500行目（Frameクラス）
- **参考にした内容**:
  - フレーム管理の統一実装
  - ナビゲーション処理の共通化

### PageDelegate パターン
**インターフェース定義**: `/packages/playwright-core/src/server/page.ts`
- **参考にした内容**:
  - PageDelegateインターフェースの定義
  - 各ブラウザ実装の共通契約

## 6. 重要な実装詳細の場所

### プロトコル変換の核心部分

#### CDP → 統一API
**ファイル**: `/packages/playwright-core/src/server/chromium/crPage.ts`
- `async goto()` メソッドの実装
- プロトコルレスポンスの正規化

#### Juggler → 統一API  
**ファイル**: `/packages/playwright-core/src/server/firefox/ffPage.ts`
- `async goto()` メソッドの実装
- frameId管理の詳細

#### WebInspector → 統一API
**ファイル**: `/packages/playwright-core/src/server/webkit/wkPage.ts`
- `async goto()` メソッドの実装
- pageProxyId管理の詳細

## 7. デバッグとログ関連

### プロトコルログの参照
**ファイル**: `/packages/playwright-core/src/server/utils/debugLogger.ts`
- **環境変数**: `DEBUG=pw:protocol`
- **参考にした内容**:
  - プロトコルメッセージのログ出力
  - デバッグ情報の取得方法

## 8. 起動プロセスの詳細

### Chromium起動
**ファイル**: `/packages/playwright-core/src/server/chromium/chromium.ts`
- **メソッド**: `_launchProcess()`
- **起動引数**: `--remote-debugging-port`など

### Firefox起動
**ファイル**: `/packages/playwright-core/src/server/firefox/firefox.ts`
- **メソッド**: `_launchProcess()`
- **起動引数**: `--juggler`など

### WebKit起動
**ファイル**: `/packages/playwright-core/src/server/webkit/webkit.ts`
- **メソッド**: `_launchProcess()`
- **起動引数**: WebKit固有の設定

## 9. 実装を読む際の推奨順序

### 初級：基本理解
1. `transport.ts` - 通信層の理解
2. `browserType.ts` - ブラウザ起動の抽象化
3. `page.ts` - PageDelegateパターン

### 中級：プロトコル詳細
1. `chromium/crPage.ts` - CDP実装
2. `firefox/ffPage.ts` - Juggler実装
3. `webkit/wkPage.ts` - WebInspector実装

### 上級：ブラウザパッチ
1. `/browser_patches/firefox/juggler/` - Juggler本体
2. `/browser_patches/webkit/` - WebKit拡張
3. `/browser_patches/chromium/` - Chromium調整

## 10. 特に重要なコード片

### メッセージ送信パターン
```typescript
// 共通パターン
await session.send('Method.name', { param1: value1, param2: value2 });
```

### レスポンス処理パターン
```typescript
// 共通パターン
const response = await session.send(...);
if (response.error)
  throw new Error(response.error.message);
return response.result;
```

### フレーム管理パターン
```typescript
// Firefox/WebKit特有
{ frameId: frame._id }

// WebKit特有
{ pageProxyId: this._pageProxyId, frameId: frame._id }
```

## まとめ

この参照ガイドにより、Playwright本体のコードを読む際の出発点が明確になります。特に以下の理解が深まります：

1. **通信層**: transport.tsから始める
2. **プロトコル実装**: 各ブラウザのPage実装を比較
3. **抽象化**: BrowserTypeとPageDelegateパターン
4. **ブラウザパッチ**: browser_patches/ディレクトリの構造

これらの参照箇所を順に読むことで、Playwrightのクロスブラウザサポートの全体像が理解できます。