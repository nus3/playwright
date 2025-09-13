# WebKitとWeb Inspectorプロトコルの調査結果

## 概要

PlaywrightがWebKit（Safari）を制御する仕組みについて調査しました。FirefoxがJugglerという独自プロトコルを使用するのと同様に、WebKitもWeb Inspectorプロトコルをベースにした拡張プロトコルを使用しています。

## 1. Web Inspectorプロトコルとは

Web InspectorプロトコルはSafariのデバッグプロトコルです。Chrome DevTools Protocolと同様の役割を持ちますが、Safari/WebKit専用の実装です。

## 2. プロトコル通信の実例

`DEBUG=pw:protocol`を有効にしてWebKitを起動すると、以下のようなコマンドが確認できます：

### 基本的なコマンドフロー
```
1. Playwright.enable - Playwright拡張を有効化
2. Playwright.createContext - ブラウザコンテキスト作成
3. Playwright.createPage - 新規ページ作成（pageProxyIdで管理）
4. Target.sendMessageToTarget - 実際のWeb Inspectorコマンドをラップ
5. Playwright.navigate - URLへのナビゲーション
```

### 特徴的な点
- **pageProxyId**: ページを識別するユニークID
- **二層プロトコル**: PlaywrightコマンドとWeb Inspectorコマンドの二層構造
- **Target.sendMessageToTarget**: Web Inspectorコマンドのラッピング

## 3. WebKitパッチの内容

`browser_patches/webkit/patches/bootstrap.diff`は21,553行の大規模なパッチです。

### 追加されるプロトコルドメイン
```diff
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Dialog.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Emulation.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Input.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Playwright.json
+    ${JAVASCRIPTCORE_DIR}/inspector/protocol/Screencast.json
```

### Playwrightドメインの定義
```json
{
    "domain": "Playwright",
    "types": [
        {
            "id": "PageProxyID",
            "type": "string",
            "description": "Id of WebPageProxy."
        }
    ],
    "commands": [
        {
            "name": "enable"
        },
        {
            "name": "createContext"
        },
        {
            "name": "createPage"
        },
        {
            "name": "navigate"
        }
    ]
}
```

### 追加される主要コンポーネント
- `UIProcess/InspectorPlaywrightAgent.cpp` - Playwrightプロトコルハンドラー
- `UIProcess/RemoteInspectorPipe.cpp` - パイプ通信の実装
- `UIProcess/WebPageInspectorEmulationAgent.cpp` - エミュレーション機能
- `UIProcess/WebPageInspectorInputAgent.cpp` - 入力イベント処理
- `UIProcess/Inspector/Agents/InspectorScreencastAgent.cpp` - スクリーンキャスト機能

## 4. 通信メカニズム

### 4.1 起動オプション
```typescript
// packages/playwright-core/src/server/webkit/webkit.ts:68
const webkitArguments = ['--inspector-pipe'];
```

`--inspector-pipe`オプションによりstdioパイプ通信が有効になります。

### 4.2 接続の確立
```typescript
// packages/playwright-core/src/server/webkit/wkBrowser.ts:44-49
static async connect(parent: SdkObject, transport: ConnectionTransport, options: BrowserOptions): Promise<WKBrowser> {
    const browser = new WKBrowser(parent, transport, options);
    await browser._browserSession.send('Playwright.enable');
    // ...
}
```

### 4.3 WKConnectionクラス
```typescript
// packages/playwright-core/src/server/webkit/wkConnection.ts
export class WKConnection {
    constructor(transport: ConnectionTransport, onDisconnect: () => void, protocolLogger: ProtocolLogger, browserLogsCollector: RecentLogsCollector) {
        this.browserSession = new WKSession(this, '', (message: any) => {
            this.rawSend(message);
        });
        this._transport.onmessage = this._dispatchMessage.bind(this);
    }

    rawSend(message: ProtocolRequest) {
        this._protocolLogger('send', message);
        this._transport.send(message);
    }
}
```

### 4.4 メッセージのディスパッチ
```typescript
// packages/playwright-core/src/server/webkit/wkConnection.ts:72-82
private _dispatchMessage(message: ProtocolResponse) {
    this._protocolLogger('receive', message);
    if (message.pageProxyId) {
        const payload: PageProxyMessageReceivedPayload = { 
            message: message, 
            pageProxyId: message.pageProxyId 
        };
        this.browserSession.dispatchMessage({ 
            method: kPageProxyMessageReceived, 
            params: payload 
        });
        return;
    }
    this.browserSession.dispatchMessage(message);
}
```

## 5. Firefoxとの比較

| 項目 | Firefox (Juggler) | WebKit (Web Inspector) |
|------|------------------|----------------------|
| プロトコル | 独自のJugglerプロトコル | Web Inspector + Playwright拡張 |
| 通信方式 | stdio pipe (FD 3,4) | stdio pipe (--inspector-pipe) |
| ページ識別 | targetId | pageProxyId |
| パッチサイズ | 約12,000行 | 約21,500行 |
| 主要コンポーネント | nsRemoteDebuggingPipe | RemoteInspectorPipe |
| 初期化 | final-ui-startup | Playwright.enable |

## 6. 実装の特徴

### 6.1 プロトコルの階層化
- **上位層**: Playwrightドメイン（createContext, createPage, navigate）
- **下位層**: Web Inspectorプロトコル（Page, Runtime, DOM等）

### 6.2 pageProxyIdによるページ管理
各ページは`pageProxyId`という一意のIDで管理され、メッセージルーティングに使用されます。

### 6.3 プラットフォーム固有の実装
- macOS: `InspectorPlaywrightAgentClientMac`
- Windows: `InspectorPlaywrightAgentClientWin`
- Linux: `InspectorPlaywrightAgentClientGLib`

## 7. まとめ

WebKitの制御では：

1. **Web Inspectorプロトコルを拡張**: 既存のSafariデバッグプロトコルに Playwrightドメインを追加
2. **stdio pipeで通信**: `--inspector-pipe`オプションで標準入出力経由の通信
3. **pageProxyIdでページ管理**: 各ページを一意のIDで識別
4. **二層プロトコル構造**: Playwrightコマンドと Web Inspectorコマンドの組み合わせ

Firefoxと同様に、WebKitも大規模なパッチ（21,500行）を適用して、Playwright専用の制御機能を実現しています。これにより、Safariの内部APIに直接アクセスし、完全な自動化を可能にしています。