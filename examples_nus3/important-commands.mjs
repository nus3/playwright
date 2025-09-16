/**
 * すべてのブラウザで監視する重要なプロトコルコマンドの統一リスト
 * 
 * 各ブラウザが使用するプロトコル:
 * - Chromium: CDP (Chrome DevTools Protocol)
 * - Firefox: Juggler Protocol (Playwright独自)
 * - WebKit: WebInspector Protocol + Playwright拡張
 * - BiDi: WebDriver BiDi (標準化プロトコル)
 */

export const importantCommands = [
  // CDP (Chrome DevTools Protocol) - Chromiumで使用
  'Browser.getVersion',
  'Target.setAutoAttach',
  'Target.createTarget',
  'Target.createBrowserContext',
  'Target.attachToTarget',
  
  // Firefox Juggler Protocol - Firefoxで使用
  'Browser.enable',
  'Browser.getInfo',
  'Browser.newPage',
  'Browser.close',
  'Screencast.startVideoRecording',
  
  // WebKit/Playwright Protocol - WebKit(Safari)で使用
  'Playwright.enable',
  'Playwright.createContext',
  'Playwright.createPage',
  'Playwright.navigate',
  'Playwright.setDownloadBehavior',
  'Playwright.setViewportSize',
  
  // BiDi Protocol - 標準化されたプロトコル
  'session.new',
  'session.subscribe',
  'browser.createUserContext',
  'browser.close',
  'browsingContext.create',
  'browsingContext.navigate',
  'browsingContext.setViewport',
  'script.evaluate',
  'script.callFunction',
  'script.addPreloadScript',
  'network.addIntercept',
  
  // 共通のドメイン - 複数のプロトコルで共通
  'Page.enable',
  'Page.navigate',
  'Page.getFrameTree',
  'Page.getResourceTree',
  'Page.setViewport',
  'Page.getContentFrame',
  'Runtime.enable',
  'Runtime.evaluate',
  'Network.enable',
  'DOM.getDocument'
];

/**
 * プロトコル別にグループ化されたコマンド
 */
export const commandsByProtocol = {
  cdp: [
    'Browser.getVersion',
    'Target.setAutoAttach',
    'Target.createTarget',
    'Target.createBrowserContext',
    'Target.attachToTarget'
  ],
  juggler: [
    'Browser.enable',
    'Browser.getInfo',
    'Browser.newPage',
    'Browser.close',
    'Screencast.startVideoRecording'
  ],
  webkit: [
    'Playwright.enable',
    'Playwright.createContext',
    'Playwright.createPage',
    'Playwright.navigate',
    'Playwright.setDownloadBehavior',
    'Playwright.setViewportSize'
  ],
  bidi: [
    'session.new',
    'session.subscribe',
    'browser.createUserContext',
    'browser.close',
    'browsingContext.create',
    'browsingContext.navigate',
    'browsingContext.setViewport',
    'script.evaluate',
    'script.callFunction',
    'script.addPreloadScript',
    'network.addIntercept'
  ],
  common: [
    'Page.enable',
    'Page.navigate',
    'Page.getFrameTree',
    'Page.getResourceTree',
    'Page.setViewport',
    'Page.getContentFrame',
    'Runtime.enable',
    'Runtime.evaluate',
    'Network.enable',
    'DOM.getDocument'
  ]
};