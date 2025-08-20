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
