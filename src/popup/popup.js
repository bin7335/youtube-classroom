(async () => {
  'use strict';
  const Y = self.YTC;
  const { readSettings, writeSettings } = self.YTCStore;
  const $ = (id) => document.getElementById(id);

  let settings = await readSettings();

  // ---------- 설정 ----------
  const hideList = $('hideList');
  for (const [key, label] of Y.HIDE_OPTIONS) {
    const row = document.createElement('label');
    row.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.hide = key;
    row.append(cb, ' ' + label);
    hideList.appendChild(row);
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('masterState').textContent = settings.enabled ? '켜짐 · 아래 항목을 가립니다' : '꺼짐 · 유튜브가 원래대로 보입니다';
    document.body.classList.toggle('off', !settings.enabled);
    hideList.querySelectorAll('input[data-hide]').forEach((cb) => { cb.checked = settings.hide[cb.dataset.hide]; });
    $('autoplayOff').checked = settings.autoplayOff;
    $('blackScreen').checked = settings.blackScreen;
  }

  async function update(patch) {
    settings = await writeSettings({ ...settings, ...patch });
    render();
  }

  $('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));
  $('autoplayOff').addEventListener('change', (e) => update({ autoplayOff: e.target.checked }));
  $('blackScreen').addEventListener('change', (e) => update({ blackScreen: e.target.checked }));
  hideList.addEventListener('change', (e) => {
    const key = e.target.dataset.hide;
    if (key) update({ hide: { ...settings.hide, [key]: e.target.checked } });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) { settings = Y.mergeSettings(changes.settings.newValue); render(); }
  });

  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  render();

  // ---------- 구간 재생 (현재 탭이 유튜브 영상일 때만) ----------
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let state = null;
  try {
    state = await chrome.tabs.sendMessage(tab.id, { type: 'ytc:state' }, { frameId: 0 });
  } catch { /* 유튜브 탭이 아니면 콘텐츠 스크립트가 없다 */ }
  if (!state || !state.videoId) return;

  $('segGroup').hidden = false;
  $('segHint').hidden = true;
  const key = Y.segmentKey(state.videoId);
  const msg = (text, err) => { $('segMsg').textContent = text; $('segMsg').classList.toggle('err', !!err); };

  if (state.segment) {
    $('segStart').value = state.segment.start ? Y.formatTime(state.segment.start) : '';
    $('segEnd').value = state.segment.end != null ? Y.formatTime(state.segment.end) : '';
  }

  async function nowTime() {
    try {
      const s = await chrome.tabs.sendMessage(tab.id, { type: 'ytc:state' }, { frameId: 0 });
      return s && typeof s.currentTime === 'number' ? s.currentTime : null;
    } catch { return null; }
  }
  $('segNowStart').addEventListener('click', async () => {
    const t = await nowTime();
    if (t != null) $('segStart').value = Y.formatTime(t);
  });
  $('segNowEnd').addEventListener('click', async () => {
    const t = await nowTime();
    if (t != null) $('segEnd').value = Y.formatTime(t);
  });

  $('segSave').addEventListener('click', async () => {
    const rawStart = $('segStart').value.trim();
    const rawEnd = $('segEnd').value.trim();
    const start = rawStart ? Y.parseTime(rawStart) : null;
    const end = rawEnd ? Y.parseTime(rawEnd) : null;
    if ((rawStart && start == null) || (rawEnd && end == null)) return msg('시간은 2:10 또는 130 처럼 입력하세요', true);
    if (start == null && end == null) return msg('시작이나 끝 중 하나는 입력하세요', true);
    if (!Y.normalizeSegment({ start, end })) return msg('끝은 시작보다 뒤여야 합니다', true);
    await chrome.storage.local.set({ [key]: { start, end, savedAt: Date.now() } });
    msg(`저장됨: ${Y.formatTime(start ?? 0)} ~ ${end != null ? Y.formatTime(end) : '끝까지'}`);
  });

  $('segClear').addEventListener('click', async () => {
    await chrome.storage.local.remove(key);
    $('segStart').value = '';
    $('segEnd').value = '';
    msg('구간을 지웠습니다');
  });
})();
