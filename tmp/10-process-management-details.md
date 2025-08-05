# プロセス管理の詳細とクロスプラットフォーム対応

## プロセス起動の仕組み（processLauncher.ts）

### stdio設定の違い

```typescript
// pipeモード: 5つのストリーム
const stdio: ('ignore' | 'pipe')[] = options.stdio === 'pipe' 
  ? ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']  // stdin, stdout, stderr, pipe3, pipe4
  : ['pipe', 'pipe', 'pipe'];                   // 標準モード
```

**Pipe通信用のstdio:**
- `stdio[0]`: stdin (ignore)
- `stdio[1]`: stdout (pipe) - ログ出力
- `stdio[2]`: stderr (pipe) - エラー出力
- `stdio[3]`: 読み取り用カスタムパイプ - ブラウザからPlaywrightへ
- `stdio[4]`: 書き込み用カスタムパイプ - Playwrightからブラウザへ

### プロセス起動オプション

```typescript
const spawnOptions: childProcess.SpawnOptions = {
  // プロセスグループリーダーとして起動（Win32以外）
  detached: process.platform !== 'win32',
  env: (options.env as {[key: string]: string}),
  cwd: options.cwd,
  shell: options.shell,
  stdio,
};
const spawnedProcess = childProcess.spawn(options.command, options.args || [], spawnOptions);
```

**重要な特徴:**
- `detached: true` により、子プロセスツリー全体の制御が可能
- Windowsでは異なるプロセス終了戦略を使用

## グレースフル終了処理

### 2段階の終了プロセス

```typescript
async function gracefullyClose(): Promise<void> {
  if (gracefullyClosing) {
    // 再帰呼び出し時は強制終了
    options.log(`[pid=${spawnedProcess.pid}] <forcefully close>`);
    killProcess();
    await waitForCleanup;
    return;
  }
  gracefullyClosing = true;
  
  // 1. プロトコル経由でのグレースフル終了試行
  await options.attemptToGracefullyClose().catch(() => killProcess());
  
  // 2. クリーンアップ完了まで待機
  await waitForCleanup;
}
```

### プラットフォーム別の強制終了

```typescript
function killProcess() {
  if (process.platform === 'win32') {
    // Windows: taskkillコマンドでプロセスツリー終了
    const taskkillProcess = childProcess.spawnSync(
      `taskkill /pid ${spawnedProcess.pid} /T /F`, 
      { shell: true }
    );
  } else {
    // Unix系: SIGKILLでプロセスグループ終了
    process.kill(-spawnedProcess.pid, 'SIGKILL');
  }
}
```

**プラットフォーム別の戦略:**
- **Windows**: `taskkill /T /F` でプロセスツリー全体を強制終了
- **Unix系**: `-pid` でプロセスグループ全体に`SIGKILL`送信

## シグナルハンドリング

### 段階的なシャットダウン

```typescript
function sigintHandler() {
  if (sigintHandlerCalled) {
    // 2回目のCtrl+C: 即座に強制終了
    process.off('SIGINT', sigintHandler);
    for (const kill of killSet) kill();
    exitWithCode130();
  } else {
    // 1回目のCtrl+C: グレースフル終了試行
    sigintHandlerCalled = true;
    gracefullyCloseAll().then(() => exitWithCode130());
  }
}
```

### プロセス終了コード
- **130**: SIGINT終了（Ctrl+C）
- **自然終了**: ブラウザの正常終了コード

## ログ収集とモニタリング

### リアルタイムログ収集

```typescript
// stdout/stderrを行単位で処理
const stdout = readline.createInterface({ input: spawnedProcess.stdout! });
const stderr = readline.createInterface({ input: spawnedProcess.stderr! });

stdout.on('line', (data: string) => {
  options.log(`[pid=${spawnedProcess.pid}][out] ` + data);
});

stderr.on('line', (data: string) => {
  options.log(`[pid=${spawnedProcess.pid}][err] ` + data);
});
```

### 準備完了判定に使用するログパターン

- **Chromium**: `"DevTools listening on ws://..."`
- **Firefox**: `"Juggler listening to the pipe"`
- **WebKit**: 即座に準備完了

## 一時ディレクトリ管理

### 自動クリーンアップ

```typescript
const cleanup = async () => {
  options.log(`[pid=${spawnedProcess.pid || 'N/A'}] starting temporary directories cleanup`);
  const errors = await removeFolders(options.tempDirectories);
  for (let i = 0; i < options.tempDirectories.length; ++i) {
    if (errors[i])
      options.log(`exception while removing ${options.tempDirectories[i]}: ${errors[i]}`);
  }
};

// プロセス終了時に自動実行
spawnedProcess.once('close', (exitCode, signal) => {
  cleanup().then(fulfillCleanup); // 非同期でクリーンアップ
});
```

**管理される一時ディレクトリ:**
- `userDataDir` - ブラウザのプロファイルディレクトリ
- `artifactsDir` - スクリーンショット、動画等の一時保存場所

## プロセス追跡とリーク防止

### グローバルプロセス管理

```typescript
export const gracefullyCloseSet = new Set<() => Promise<void>>();
const killSet = new Set<() => void>();

// プロセス起動時に登録
gracefullyCloseSet.add(gracefullyClose);
killSet.add(killProcessAndCleanup);

// プロセス終了時に自動削除
spawnedProcess.once('close', (exitCode, signal) => {
  gracefullyCloseSet.delete(gracefullyClose);
  killSet.delete(killProcessAndCleanup);
});
```

### 全プロセス一括終了機能

```typescript
export async function gracefullyCloseAll() {
  await Promise.all(
    Array.from(gracefullyCloseSet).map(
      gracefullyClose => gracefullyClose().catch(e => {})
    )
  );
}
```

## 重要な発見

1. **プロセス管理の統一**: 全ブラウザで同じプロセス管理機構を使用
2. **プラットフォーム対応**: Windows/Unix系の違いを適切に処理
3. **リーク防止**: 確実なクリーンアップとプロセス追跡
4. **段階的終了**: グレースフル→強制終了の段階的アプローチ
5. **通信チャンネル**: stdio[3,4]による専用通信パイプ

この仕組みにより、Playwrightは異なるOS・ブラウザでも安定したプロセス管理を実現している。