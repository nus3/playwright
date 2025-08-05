# ブラウザ起動プロセスの詳細

## 起動フローの全体像

```
1. 準備段階 (_prepareToLaunch)
   ↓
2. プロセス起動 (launchProcess)
   ↓
3. 準備完了待機 (waitForReadyState)
   ↓
4. トランスポート接続確立
   ↓
5. ブラウザインスタンス作成
```

## 各ブラウザの起動引数比較

### Chromium
```bash
# 主要な起動引数
--user-data-dir=/path/to/userdata
--remote-debugging-pipe  # または --remote-debugging-port=9222
--no-startup-window      # 非永続時
--headless              # ヘッドレス時

# Chromiumスイッチによる追加引数
--disable-field-trial-config
--disable-background-networking
--disable-extensions
--no-first-run
--enable-automation     # 通常モード時
```

**特徴:**
- 最も多くの起動オプション
- WebSocketまたはPipe接続対応
- CDP (Chrome DevTools Protocol) 使用

### Firefox
```bash
# 主要な起動引数
-no-remote
-profile /path/to/profile
-juggler-pipe           # Juggler通信用
-headless              # ヘッドレス時
-wait-for-browser      # 非ヘッドレス時
-foreground            # 非ヘッドレス時
-silent                # 非永続時
```

**特徴:**
- Firefox独自のJugglerプロトコル
- Pipe接続のみ
- シンプルな起動構成

### WebKit
```bash
# 主要な起動引数
--inspector-pipe
--headless              # ヘッドレス時
--user-data-dir=/path   # 永続時
--no-startup-window     # 非永続時
--disable-accelerated-compositing  # Windows時
```

**特徴:**
- 最もシンプルな起動引数
- Pipe接続のみ
- プラットフォーム固有の調整

## 準備完了判定の違い

### Chromium - ログメッセージ監視
```typescript
browserLogsCollector.onMessage(message => {
  const match = message.match(/DevTools listening on (.*)/);
  if (match)
    result.resolve({ wsEndpoint: match[1] });
});
```
- "DevTools listening on ws://..." を検出
- WebSocketエンドポイント抽出

### Firefox - ログメッセージ監視
```typescript
browserLogsCollector.onMessage(message => {
  if (message.includes('Juggler listening to the pipe'))
    result.resolve({});
});
```
- "Juggler listening to the pipe" を検出
- Pipe接続のためエンドポイント不要

### WebKit - 即座に準備完了
```typescript
async waitForReadyState(): Promise<{ wsEndpoint?: string }> {
  return {};
}
```
- 特別な待機処理なし
- Pipe接続で即座に通信可能

## トランスポート接続の確立

### 接続方式の選択
```typescript
if (options.cdpPort !== undefined || !this.supportsPipeTransport()) {
  // WebSocket接続（主にChromium）
  transport = await WebSocketTransport.connect(progress, wsEndpoint!);
} else {
  // Pipe接続（Firefox、WebKit）
  const stdio = launchedProcess.stdio as unknown as [
    NodeJS.ReadableStream, NodeJS.WritableStream, NodeJS.WritableStream, 
    NodeJS.WritableStream, NodeJS.ReadableStream
  ];
  transport = new PipeTransport(stdio[3], stdio[4]);
}
```

### Pipe接続の仕組み
- **stdio[3]**: 読み取り用パイプ
- **stdio[4]**: 書き込み用パイプ
- ヌル文字（\0）区切りでJSON-RPCメッセージを送受信

## プロセス管理とgracefulClose

### 各ブラウザの終了処理

**Chromium:**
```typescript
attemptToGracefullyCloseBrowser(transport: ConnectionTransport): void {
  const message: ProtocolRequest = { 
    method: 'Browser.close', 
    id: kBrowserCloseMessageId, 
    params: {} 
  };
  transport.send(message);
}
```

**Firefox:**
```typescript
attemptToGracefullyCloseBrowser(transport: ConnectionTransport): void {
  const message = { 
    method: 'Browser.close', 
    params: {}, 
    id: kBrowserCloseMessageId 
  };
  transport.send(message);
}
```

**WebKit:**
```typescript
attemptToGracefullyCloseBrowser(transport: ConnectionTransport): void {
  transport.send({ 
    method: 'Playwright.close', 
    params: {}, 
    id: kBrowserCloseMessageId 
  });
}
```

### プロセス終了フロー
1. **グレースフル終了試行** - プロトコル経由で終了要求
2. **タイムアウト処理** - 指定時間後に強制終了へ移行
3. **強制終了** - `kill()` によるプロセス強制終了
4. **クリーンアップ** - 一時ディレクトリとリソースの削除

## 環境変数とプロセス環境

### 各ブラウザ固有の環境調整

**Firefox:**
```typescript
amendEnvironment(env: Env): Env {
  if (os.platform() === 'linux') {
    // SNAPパッケージとの干渉を回避
    return { ...env, SNAP_NAME: undefined, SNAP_INSTANCE_NAME: undefined };
  }
  return env;
}
```

**WebKit:**
```typescript
amendEnvironment(env: Env, userDataDir: string, isPersistent: boolean): Env {
  return {
    ...env,
    CURL_COOKIE_JAR_PATH: process.platform === 'win32' && isPersistent 
      ? path.join(userDataDir, 'cookiejar.db') : undefined,
  };
}
```

## 重要な発見

1. **起動方式の統一**: 異なる起動引数とプロトコルを統一インターフェースで管理
2. **接続方式の抽象化**: WebSocketとPipeの違いをTransportレイヤーで吸収
3. **準備完了判定**: 各ブラウザ固有のログパターンで接続タイミングを検出
4. **グレースフル終了**: 各ブラウザの終了プロトコルを統一的に処理

この仕組みにより、開発者は各ブラウザの起動の複雑さを意識することなく、統一されたAPI（`playwright.chromium.launch()`等）でブラウザを起動できる。