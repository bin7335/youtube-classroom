// 단축키(수업 모드 전환)와 툴바 배지 표시.
importScripts('shared/settings.js', 'shared/store.js');

async function refreshBadge() {
  const s = await self.YTCStore.readSettings();
  await chrome.action.setBadgeText({ text: s.enabled ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  await chrome.action.setTitle({
    title: `클래스룸 for YouTube: 수업 모드 ${s.enabled ? '켜짐' : '꺼짐'} (Alt+Q)`,
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-class-mode') return;
  const s = await self.YTCStore.readSettings();
  await self.YTCStore.writeSettings({ ...s, enabled: !s.enabled });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) refreshBadge();
});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
