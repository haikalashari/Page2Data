export default defineBackground(() => {
  const openPanelOnActionClick = () => {
    chrome.sidePanel
      ?.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => console.warn('[Page2Data] side panel setup failed', error));
  };

  chrome.runtime.onInstalled.addListener(openPanelOnActionClick);
  chrome.runtime.onStartup.addListener(openPanelOnActionClick);
  openPanelOnActionClick();
});
