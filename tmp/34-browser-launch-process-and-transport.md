# ブラウザプロセス起動と通信プロトコルの詳細

## launchProcess()の役割

`launchProcess()`は、実際のブラウザプロセスを起動し、通信用のパイプを設定する関数です。

### 1. stdioパイプの設定

**processLauncher.ts:134**
```typescript
const stdio: ('ignore' | 'pipe')[] = options.stdio === 'pipe' ? 
  ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] :  // 5つのパイプ
  ['pipe', 'pipe', 'pipe'];                      // 3つのパイプ（stdin付き）
```

#### 5つのパイプの用途（stdio: 'pipe'の場合）：
- **stdio[0]**: 'ignore' - stdin（使用しない）
- **stdio[1]**: 'pipe' - stdout（ブラウザのログ出力）
- **stdio[2]**: 'pipe' - stderr（エラー出力）
- **stdio[3]**: 'pipe' - **書き込み用パイプ**（Playwright→ブラウザ）
- **stdio[4]**: 'pipe' - **読み込み用パイプ**（ブラウザ→Playwright）

### 2. 通信プロトコルの選択

**browserType.ts:268-273**
```typescript
if (options.cdpPort !== undefined || !this.supportsPipeTransport()) {
  // WebSocket通信（CDP）
  transport = await WebSocketTransport.connect(progress, wsEndpoint!);
} else {
  // Pipe通信（stdio[3]とstdio[4]を使用）
  const stdio = launchedProcess.stdio as [...];
  transport = new PipeTransport(stdio[3], stdio[4]);
}
```

## ブラウザごとの通信プロトコル

### 1. Chromium
```
起動オプション: --remote-debugging-pipe または --remote-debugging-port
```

**デフォルト動作**：
- `supportsPipeTransport()`: true（基底クラスのデフォルト）
- CDPポートが指定されていない場合 → **Pipe通信**（stdio[3], stdio[4]）
- CDPポートが指定されている場合 → **WebSocket通信**

**プロトコル**: Chrome DevTools Protocol (CDP)

### 2. Firefox
```
起動オプション: -juggler-pipe
```

**動作**：
- `supportsPipeTransport()`: true
- 常に**Pipe通信**を使用（stdio[3], stdio[4]）
- WebSocket通信はサポートしない

**プロトコル**: Juggler（Playwright独自プロトコル）

### 3. WebKit（Safari）
```
起動オプション: --inspector-pipe
```

**動作**：
- `supportsPipeTransport()`: true
- 常に**Pipe通信**を使用（stdio[3], stdio[4]）
- WebSocket通信はサポートしない

**プロトコル**: WebInspector Protocol

## プロセス起動の詳細フロー

```
1. launchProcess()呼び出し
     ↓
2. childProcess.spawn()でブラウザプロセス起動
   - stdio配列で5つのパイプを設定
   - detached: true（Unix系）でプロセスグループリーダーに
     ↓
3. ブラウザからの準備完了メッセージを待機
   - Firefox: "Juggler listening to the pipe"
   - Chromium: WebSocketエンドポイントまたはパイプ準備完了
   - WebKit: インスペクタパイプ準備完了
     ↓
4. 通信Transportの作成
   - PipeTransport: stdio[3]（書き込み）とstdio[4]（読み込み）
   - WebSocketTransport: CDP用WebSocket接続
     ↓
5. ブラウザ固有のオブジェクト作成
   - CRBrowser（Chromium）
   - FFBrowser（Firefox）
   - WKBrowser（WebKit）
```

## Pipe通信の利点

### 1. **パフォーマンス**
- プロセス間の直接通信
- WebSocketのオーバーヘッドなし
- カーネルレベルでの効率的なデータ転送

### 2. **セキュリティ**
- ネットワークポートを開かない
- 外部からアクセス不可能
- ファイアウォールの影響を受けない

### 3. **信頼性**
- プロセスのライフサイクルと連動
- 親プロセス終了時に自動的にクリーンアップ

## CDPモード（Chromiumのみ）を使う場合

```typescript
// CDPポートを指定して起動
const browser = await chromium.launch({
  args: ['--remote-debugging-port=9222']
});
```

この場合：
1. WebSocketでlocalhostの9222ポートに接続
2. 外部ツール（Chrome DevTools等）からもアクセス可能
3. デバッグやリモート操作に便利

## まとめ

`launchProcess()`は以下を行います：

1. **5つのstdioパイプを作成**（stdin無視、stdout、stderr、通信用×2）
2. **ブラウザプロセスを起動**（`childProcess.spawn()`）
3. **通信方式を決定**：
   - デフォルト: Pipe通信（stdio[3]とstdio[4]）
   - CDPポート指定時: WebSocket通信（Chromiumのみ）

各ブラウザは独自のプロトコルを使用しますが、Playwrightは`ConnectionTransport`インターフェースでこれらの違いを抽象化しています。