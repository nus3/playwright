# コード証拠の所在と確認方法

## 質問1: WebPageInspectorControllerへの移譲

### 証拠の場所
`browser_patches/webkit/patches/bootstrap.diff` line 13768

### 実際のコード
```cpp
pageProxyChannel->page().inspectorController().navigate(WTFMove(resourceRequest), frame, ...);
```

### 確認方法
```bash
sed -n '13768p' browser_patches/webkit/patches/bootstrap.diff
```

### 解析
- `pageProxyChannel` は `PageProxyChannel`型（InspectorPlaywrightAgentの内部クラス）
- `page()` は `WebPageProxy&`を返す
- `inspectorController()` は `WebPageInspectorController&`を返す
- よって `WebPageInspectorController::navigate()`が呼ばれる

## 質問2: WebPageProxyの内部API呼び出し

### 証拠の場所
`browser_patches/webkit/patches/bootstrap.diff` line 12556

### 実際のコード
```cpp
void WebPageInspectorController::navigate(...) {
    auto navigation = m_inspectedPage->loadRequestForInspector(WTFMove(request), frame);
```

### 確認方法
```bash
sed -n '12556p' browser_patches/webkit/patches/bootstrap.diff
```

### m_inspectedPageの型の確認
```bash
grep -B 5 "m_inspectedPage" browser_patches/webkit/patches/bootstrap.diff | grep "WebPageProxy"
# 結果: WebPageInspectorController::WebPageInspectorController(WebPageProxy& inspectedPage)
```

### 解析
- `m_inspectedPage` は `WebPageProxy*`型
- `loadRequestForInspector()` は `WebPageProxy`のメソッド（line 15705で定義）

## 質問3: WebProcessへのメッセージ送信

### 証拠の場所
`browser_patches/webkit/patches/bootstrap.diff` line 15716

### 実際のコード
```cpp
m_legacyMainFrameProcess->send(
    Messages::WebPage::LoadRequestInFrameForInspector(WTFMove(loadParameters), frame->frameID()), 
    m_webPageID
);
```

### 確認方法
```bash
sed -n '15716p' browser_patches/webkit/patches/bootstrap.diff
```

### 解析
- `m_legacyMainFrameProcess` は `WebProcessProxy`型
- `Messages::WebPage::` はWebProcess内のWebPageクラスへのIPCメッセージ
- `send()` はプロセス間通信（IPC）でメッセージを送信

### WebKit2のプロセスモデル
```
UIProcess (ブラウザUI側)
    ├── WebPageProxy
    ├── WebProcessProxy (IPCの送信側)
    └── InspectorPlaywrightAgent

    ↓ IPC (プロセス間通信)
    
WebProcess (Webコンテンツ側)
    ├── WebPage (IPCの受信側)
    └── WebCore (実際のレンダリング)
```

## 質問4: WebProcessでの実際の処理

### メッセージ定義の場所
`browser_patches/webkit/patches/bootstrap.diff` line 20118

### 実際のコード（メッセージ定義）
```
LoadRequestInFrameForInspector(struct WebKit::LoadParameters loadParameters, WebCore::FrameIdentifier frameID)
```

### 確認方法
```bash
grep -n "LoadRequestInFrameForInspector" browser_patches/webkit/patches/bootstrap.diff
```

### 解析
- これは`WebPage.messages.in`ファイルへの追加
- WebKitのビルドシステムが自動的にIPCコードを生成
- WebProcess側でこのメッセージを受信し、実際のページロードを実行

### WebProcess側の処理（推定）
WebProcess側の実装はパッチに含まれていませんが、標準的な流れ：
1. IPCメッセージを受信
2. WebPageクラスの`loadRequestInFrameForInspector()`が呼ばれる
3. WebCoreエンジンを使って実際のHTTPリクエストとレンダリング

## コード追跡のヒント

### 1. メソッド呼び出しの追跡
```bash
# メソッド名で検索
grep -n "メソッド名" browser_patches/webkit/patches/bootstrap.diff

# 定義を探す（::でクラス名付き）
grep -n "クラス名::メソッド名" browser_patches/webkit/patches/bootstrap.diff
```

### 2. 変数の型の確認
```bash
# 変数宣言を探す
grep -B 5 -A 5 "変数名" browser_patches/webkit/patches/bootstrap.diff
```

### 3. IPCメッセージの確認
```bash
# Messages::で始まるIPCメッセージを探す
grep -n "Messages::" browser_patches/webkit/patches/bootstrap.diff
```

## まとめ

すべての情報は`browser_patches/webkit/patches/bootstrap.diff`から確認できます：

1. **行番号を特定**: grepで検索
2. **該当箇所を表示**: sedで行番号指定
3. **型情報を確認**: クラス定義や変数宣言を探す
4. **IPCを識別**: `Messages::`プレフィックスと`send()`メソッド

これらの手法で、WebKitの内部動作を正確に追跡できます。