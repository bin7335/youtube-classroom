// 설정 읽기/쓰기 (팝업·백그라운드 공용). sync를 우선 쓰고, 안 되면 local에 둔다.
(function (root) {
  'use strict';
  const Y = root.YTC;

  async function readSettings() {
    try {
      const r = await chrome.storage.sync.get('settings');
      if (r.settings) return Y.mergeSettings(r.settings);
    } catch { /* sync 불가 환경 */ }
    const l = await chrome.storage.local.get('settings');
    return Y.mergeSettings(l.settings);
  }

  async function writeSettings(settings) {
    const value = Y.mergeSettings(settings);
    try {
      await chrome.storage.sync.set({ settings: value });
    } catch {
      await chrome.storage.local.set({ settings: value });
    }
    return value;
  }

  root.YTCStore = { readSettings, writeSettings };
})(self);
