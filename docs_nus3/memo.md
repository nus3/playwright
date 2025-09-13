## Playwright → Chrome

- ブラウザプロセスを`'--remote-debugging-port`を指定して実行
- 指定したポートに localhost から http でアクセス
- レスポンスで帰ってきた websocket エンドポイントに対して WebSocket 接続
- WebSocket を通して CDP のコマンドを送受信

WebSocket 接続をしてそう
https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/chromium/chromium.ts#L93-L95

```ts
const wsEndpoint = await urlToWSEndpoint(progress, endpointURL, headersMap);
chromeTransport = await WebSocketTransport.connect(progress, wsEndpoint, {
  headers: headersMap,
});
```

`connectOverCDP`の`endpointURL`は、CDP の WebSocket エンドポイントを指す。

> A CDP websocket endpoint or http url to connect to. For example `http://localhost:9222/` or `ws://127.0.0.1:9222/devtools/browser/387adf4c-243f-4051-a181-46798f4a46f4`.

https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/docs/src/api/class-browsertype.md?plain=1#L196-L200

具体的には HTTP で、CDP の WebSocket エンドポイントを取得し、そこに WebSocket 接続を行う。
https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/chromium/chromium.ts#L380-L397

```ts
const json = await fetchData(
  progress,
  {
    url: httpURL,
    headers,
  },
  async (_, resp) =>
    new Error(
      `Unexpected status ${resp.statusCode} when connecting to ${httpURL}.\n` +
        `This does not look like a DevTools server, try connecting via ws://.`
    )
);
return JSON.parse(json).webSocketDebuggerUrl;
```

## Playwright → Firefox

firefox を起動する際に`-juggler-pipe`オプションを渡す
https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/firefox/firefox.ts#L88

```ts
firefoxArguments.push("-juggler-pipe");
```

ブラウザのログで、Juggler が起動しているのを確認している
https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/firefox/firefox.ts#L99-L101

```ts
browserLogsCollector.onMessage((message) => {
  if (message.includes("Juggler listening to the pipe")) result.resolve({});
});
```

FFConnection、FFBrowser を通して Firefox（ブラウザ）とやりとりしてそう

https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/firefox/ffBrowser.ts#L45-L46

```ts
const connection = new FFConnection(
  transport,
  options.protocolLogger,
  options.browserLogsCollector
);
const browser = new FFBrowser(parent, connection, options);
```

Playwright では、cdp がサポートされていない場合、PipeTransport(stdio pipe 通信)を使用している？

https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/browserType.ts#L268-L273

```ts
if (options.cdpPort !== undefined || !this.supportsPipeTransport()) {
  transport = await WebSocketTransport.connect(progress, wsEndpoint!);
} else {
  const stdio = launchedProcess.stdio as unknown as [
    NodeJS.ReadableStream,
    NodeJS.WritableStream,
    NodeJS.WritableStream,
    NodeJS.WritableStream,
    NodeJS.ReadableStream
  ];
  transport = new PipeTransport(stdio[3], stdio[4]);
}
```

各ブラウザでの`this.supportsPipeTransport()`の返り値（Claude 調べ）
基本的には BiDi 以外は true になっているはず？
TODO: 詳細調べ

| ブラウザ                  | supportsPipeTransport()   | 実装箇所        |
| ------------------------- | ------------------------- | --------------- |
| BrowserType（基本クラス） | return true;              | browserType.ts  |
| Firefox                   | オーバーライドなし → true | firefox.ts      |
| Chromium                  | オーバーライドなし → true | chromium.ts     |
| WebKit                    | オーバーライドなし → true | webkit.ts       |
| BiDiFirefox               | return false;             | bidiFirefox.ts  |
| BiDiChromium              | return false;             | bidiChromium.ts |

しかし Chrome の場合は、options.cdpPort で CDP のポートを明示的に指定すると WebSocket 接続が利用される
明示的に指定しない場合は PipeTransport が利用される

PipeTransport では Node.js の WritableStream と ReadableStream を使って、プロセス間通信をしてそう？
https://github.com/microsoft/playwright/blob/832e8ac42d1ae2ab7ed942417bafd66c23d119d5/packages/playwright-core/src/server/pipeTransport.ts#L33-L45

```ts
  constructor(pipeWrite: NodeJS.WritableStream, pipeRead: NodeJS.ReadableStream) {
    this._pipeRead = pipeRead;
    this._pipeWrite = pipeWrite;
    pipeRead.on('data', buffer => this._dispatch(buffer));
    pipeRead.on('close', () => {
      this._closed = true;
      if (this._onclose)
        this._onclose.call(null);
    });
    pipeRead.on('error', e => debugLogger.log('error', e));
    pipeWrite.on('error', e => debugLogger.log('error', e));
    this.onmessage = undefined;
  }
```

Firefox 起動時に`-juggler-pipe`オプションを渡すとどうなるのか

TODO: tmp/29-firefox-juggler-implementation-deep-dive.md と Juggler プロトコルの既存実装を読むところから

### PipeTransport とは何？

stdio pipe(スタンダード I/O)

WebSocket との違い

通信方向

- stdio pipe: 一方向（双方向には 2 つのパイプが必要）
- WebSocket: 双方向（1 つの接続で両方向に通信可能）

用途・目的

- stdio pipe: 同一マシン上のプロセス間でのデータ処理パイプライン
- WebSocket: ネットワーク越しのリアルタイム通信（ブラウザ-サーバー間など）

データの流れ方

- stdio pipe: ストリーミング処理（データが流れてきたら即座に処理）
- WebSocket: メッセージベース（完全なメッセージ単位でやり取り）

接続の性質

- stdio pipe: プロセス起動時に作成され、プロセス終了時に自動的に閉じる
- WebSocket: 明示的に接続・切断を管理する必要がある

## Playwright → WebKit

## playwright の動作流れ

`npx playwright test`を実行

package.json の bin には cli.js が指定
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/package.json#L51-L53

cli.js
https://github.com/nus3/playwright/blob/research/packages/playwright/cli.js

```js
const { program } = require("./lib/program");
program.parse(process.argv);
```

program はこれ
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/program.ts#L27

program の中では addTestCommand が実行され、
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/program.ts#L43

runTests が実行
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/program.ts#L60

runTests では、config 読込と、
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/program.ts#L166

Runner を生成し、runAllTests を実行する
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/program.ts#L220-L221

runAllTests の実装は以下
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/runner.ts#L72

task 作って runTasks してる
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/runner.ts#L87-L96

createRunTestsTasks→createRunTestsTask の中で dispatcher.run() を実行してる
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/tasks.ts#L355
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/tasks.ts#L383C17-L383C31

dispatcher.run() の中で Dispatcher はワーカプロセスを起動、
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/dispatcher.ts#L138-L143

`this._createWorker` の中で、WorkerHost を生成し、workerMain.js をサブプロセスとして起動
(ここの job が TestGroup)
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/workerHost.ts#L41

WorkerHost がテストグループ（テストファイルのパスとテストケース）を送信し
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/runner/workerHost.ts#L78-L80

WorkerMain でテストを実行
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/worker/workerMain.ts#L215

テスト実行時にフィクスチャをセットアップ
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/worker/workerMain.ts#L362

この時使われる FixtureRunner が browser フィクスチャを初期化
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/worker/fixtureRunner.ts#L173

ブラウザのフィクスチャを以下で定義し、`playwright[browserName].launch()`を実行してる
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright/src/index.ts#L122

各ブラウザクラス

- **Chromium**: `packages/playwright-core/src/server/chromium/chromium.ts:54`
- **Firefox**: `packages/playwright-core/src/server/firefox/firefox.ts:35`
- **WebKit**: `packages/playwright-core/src/server/webkit/webkit.ts:32`

Playwright では Node.js の同じプロセスにクライアント層とサーバー層がある
クライアント層が Playwright が提供する API、サーバー層が実際のブラウザ制御を担当
詳細は tmp/33-client-server-architecture-explanation.md を参照

クライアント層(`playwright[browserName].launch()`)では Channel を通してサーバー層の launch()を呼び出している
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/client/browserType.ts#L80

サーバー層では実際にブラウザプロセスを起動
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L73

サーバー層でのブラウザプロセスの起動
`_innerLaunch`→`_launchProcess`→`_prepareToLaunch`でブラウザ実行可能ファイルのパスと引数を準備
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L110
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L198
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L206C47-L206C63

`launchProcess`が実行される
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L213C62-L213C75
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/
playwright-core/src/server/utils/processLauncher.ts#L133

この際にブラウザを起動するのに固有の引数が渡される

- **Chromium**: CDP ポート指定、ヘッドレスモードなど
- **Firefox**: `-juggler-pipe`で標準入出力パイプ通信を指定（firefox.ts:88）
- **WebKit**: `--inspector-pipe`でインスペクタパイプ通信を指定（webkit.ts:68）

`_launchProcess`の中で、ブラウザとサーバー層のプロトコルを決定している
https://github.com/nus3/playwright/blob/c81defee33790d12ad16a611b39f340531592f78/packages/playwright-core/src/server/browserType.ts#L263-L275

```md
launchProcess() → プロセス起動とパイプ作成
↓
waitForReadyState() → ブラウザ準備完了
↓
【ここで選択】Pipe or WebSocket？
↓
PipeTransport または WebSocketTransport を作成
```

実験的に実装されている BiDi プロトコルを使う場合、そもそも別の BrowserType クラスとして実装されている
`playwright._bidiChromium`のような宣言で利用可能
実装例: test-bidi-launch-path.js

プロトコルの選択は「どの BrowserType クラスを使うか」の時点で決まってる

## Playwright と Chrome

事前に `npx playwright install chromium` を実行して Chromium をインストールする
examples_nus3/README.md を見ると実際にどのようなコマンドが実行されているかを確認できる

playwright の launch 時のオプションで、chromium の起動時のオプションを切り替えている
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/chromium/chromium.ts#L286-L293

- `--remote-debugging-port={cdpPort}`
- `--remote-debugging-pipe`

実際に playwright とブラウザの通信をどうするかは、以下らへんで決めている
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/browserType.ts#L263-L272

- cdpPort が指定されている場合は WebSocketTransport
- デフォルトは PipeTransport がサポートされている場合は PipeTransport

stdio はこんな感じらしい

- stdio[0]: 'ignore' = stdin（標準入力）- ブラウザへの入力は不要なので無視
- stdio[1]: 'pipe' = stdout（標準出力）- ブラウザのログ出力用
- stdio[2]: 'pipe' = stderr（標準エラー出力）- エラーメッセージ用
- stdio[3]: 'pipe' = カスタムパイプ（書き込み用） - Playwright→ ブラウザへのコマンド送信
- stdio[4]: 'pipe' = カスタムパイプ（読み込み用） -　ブラウザ →Playwright へのレスポンス受信

WebSocketTransport か PipeTransport かは通信の方式の違いであって、コマンドはどちらも CDP コマンドを送っている？

WebSocketTransport
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/transport.ts#L188-L190

PiPeTransport
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/pipeTransport.ts#L57-L62

ProtocolRequest の型
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/transport.ts#L38-L43

接続クラスはブラウザごとに異なる

- Chromium: CRConnection
- Firefox: FFConnection
- WebKit: WKConnection

Chromium の場合は ProtocolRequest をそのまま send してそう
https://github.com/microsoft/playwright/blob/60a8032faf6f8b25ce353b3dd51d783044d7058d/packages/playwright-core/src/server/chromium/crConnection.ts#L62-L70

どのブラウザでもブラウザ操作には method 名と params、id は必要そうなので、ProtocolRequest の型は共通で良さそう

https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md
に Chrome の起動オプションの記載がある

```md
- --remote-debugging-pipe: more secure than using protocol over a websocket
- --remote-debugging-port=…: With a value of 0, Chrome will automatically select a useable port and will set navigator.webdriver to true.
```

Chrome DevTools Protocol (CDP)
https://chromedevtools.github.io/devtools-protocol/

Chrome に関しては`examples_nus3/trace-cdp-all-in-one.mjs`でどのようなコマンドを使ってブラウザ操作をしているのか確認できる

## Playhwright と Firefox

事前に `npx playwright install firefox` を実行して Firefox をインストールする
examples_nus3/README.md を見ると実際にどのようなコマンドが実行されているかを確認できる

## Playwright と WebKit

事前に `npx playwright install webkit` を実行して WebKit をインストールする
examples_nus3/README.md を見ると実際にどのようなコマンドが実行されているかを確認できる
