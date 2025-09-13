# AppDelegate.mの実装詳細

## 概要

`browser_patches/webkit/embedder/Playwright/mac/AppDelegate.m`は、macOS用のPlaywright WebKitブラウザアプリケーションのメインデリゲートクラスです。

## 主要な役割

### 1. アプリケーション起動と初期化

```objc
- (id)init
{
    // コマンドライン引数を解析
    NSArray *arguments = [[NSProcessInfo processInfo] arguments];
    
    // 各種オプションを処理
    _headless = [arguments containsObject: @"--headless"];
    _noStartupWindow = [arguments containsObject: @"--no-startup-window"];
    
    // --inspector-pipeオプションでPlaywrightプロトコルを有効化
    if ([arguments containsObject: @"--inspector-pipe"])
        [_WKBrowserInspector initializeRemoteInspectorPipe:self headless:_headless];
}
```

### 2. コマンドラインオプションの処理

処理される主要なオプション：
- `--headless` - ヘッドレスモードで起動
- `--no-startup-window` - 起動時にウィンドウを開かない
- `--inspector-pipe` - Playwrightプロトコル通信を有効化
- `--user-data-dir=<path>` - ユーザーデータディレクトリ
- `--proxy=<server>` - プロキシサーバー設定
- `--proxy-bypass-list=<list>` - プロキシバイパスリスト

### 3. _WKBrowserInspectorDelegateプロトコルの実装

AppDelegateは`_WKBrowserInspectorDelegate`プロトコルを実装し、Playwrightからのリクエストを処理：

#### createNewPage
```objc
- (WKWebView *)createNewPage:(uint64_t)sessionID withURL:(NSString*)urlString
{
    WKWebViewConfiguration *configuration = [self sessionConfiguration:sessionID];
    if (_headless)
        return [self createHeadlessPage:configuration withURL:urlString];
    return [self createHeadfulPage:configuration withURL:urlString];
}
```

#### createBrowserContext
```objc
- (_WKBrowserContext *)createBrowserContext:(NSString *)proxyServer 
                               WithBypassList:(NSString *)proxyBypassList
{
    // 新しいブラウザコンテキストを作成
    _WKBrowserContext *browserContext = [[_WKBrowserContext alloc] init];
    // プロセスプールとデータストアを設定
    browserContext.dataStore = [[[WKWebsiteDataStore alloc] _initWithConfiguration:...] autorelease];
    browserContext.processPool = [[[WKProcessPool alloc] _initWithConfiguration:...] autorelease];
    return browserContext;
}
```

#### deleteBrowserContext
```objc
- (void)deleteBrowserContext:(uint64_t)sessionID
{
    // 指定されたセッションIDのコンテキストを削除
}
```

#### quit
```objc
- (void)quit
{
    [NSApp performSelector:@selector(terminate:) withObject:nil afterDelay:0.0];
}
```

### 4. ヘッドレス/ヘッドフルページの作成

#### ヘッドレスページ
```objc
- (WKWebView *)createHeadlessPage:(WKWebViewConfiguration *)configuration 
                          withURL:(NSString*)urlString
{
    // 画面外にウィンドウを作成（-10000, +10000の位置）
    NSRect windowRect = NSOffsetRect(rect, -10000, 
                                     [firstScreen frame].size.height - rect.size.height + 10000);
    NSWindow* window = [[NSWindow alloc] initWithContentRect:windowRect 
                                         styleMask:NSWindowStyleMaskBorderless 
                                         backing:_NSBackingStoreUnbuffered 
                                         defer:YES];
    
    WKWebView* webView = [[WKWebView alloc] initWithFrame:[window.contentView bounds] 
                                            configuration:configuration];
    webView._windowOcclusionDetectionEnabled = NO;  // オクルージョン検出を無効化
}
```

#### ヘッドフルページ
```objc
- (WKWebView *)createHeadfulPage:(WKWebViewConfiguration *)configuration 
                         withURL:(NSString*)urlString
{
    // 通常のウィンドウを作成
    BrowserWindowController *controller = [[BrowserWindowController alloc] 
                                          initWithConfiguration:configuration];
    [controller loadURLString:urlString];
    [window setIsVisible:YES];
}
```

### 5. WebKit UIDelegate/NavigationDelegateの実装

#### JavaScript ダイアログ処理
```objc
- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message 
        initiatedByFrame:(WKFrameInfo *)frame 
        completionHandler:(void (^)(void))completionHandler
{
    // ダイアログをトラッキング（ヘッドレスモードで必要）
    WebViewDialog* dialog = [[WebViewDialog alloc] autorelease];
    dialog.webView = webView;
    dialog.completionHandler = completionHandler;
    [_dialogs addObject:dialog];
}
```

#### ナビゲーションポリシー
```objc
- (void)webView:(WKWebView *)webView 
        decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction 
        decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler
{
    // ダウンロードや新規ウィンドウの処理
}
```

### 6. データストア管理

```objc
- (WKWebsiteDataStore *)persistentDataStore
{
    if (_userDataDir) {
        // 永続化データストアを設定
        [configuration _setCookieStorageFile:cookieFile];
        [configuration setApplicationCacheDirectory:applicationCacheDirectory];
        [configuration _setCacheStorageDirectory:cacheStorageDirectory];
        [configuration _setIndexedDBDatabaseDirectory:indexedDBDirectory];
        [configuration _setWebStorageDirectory:localStorageDirectory];
    }
}
```

## アーキテクチャ上の位置づけ

```
Playwright (Node.js)
    ↓ stdio pipe
WebKit Process (macOS)
    ↓ --inspector-pipe
AppDelegate.m
    ↓ [_WKBrowserInspector initializeRemoteInspectorPipe]
RemoteInspectorPipe
    ↓
InspectorPlaywrightAgent
    ↓ delegate callbacks
AppDelegate (_WKBrowserInspectorDelegate)
    ↓
WKWebView / BrowserWindowController
```

## まとめ

`AppDelegate.m`は：

1. **エントリーポイント** - macOS WebKitアプリケーションの起動点
2. **オプション処理** - コマンドライン引数を解析し、適切な設定を適用
3. **Playwrightブリッジ** - `_WKBrowserInspectorDelegate`を実装し、Playwrightからのコマンドを処理
4. **ページ管理** - ヘッドレス/ヘッドフルページの作成と管理
5. **WebKit統合** - WKWebViewの各種デリゲートを実装

これにより、PlaywrightがmacOS上でWebKitを完全に制御できるようになっています。