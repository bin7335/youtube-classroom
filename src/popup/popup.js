(async () => {
  'use strict';
  const Y = self.YTC;
  const { readSettings, writeSettings } = self.YTCStore;
  const $ = (id) => document.getElementById(id);

  let settings = await readSettings();

  // ---------- 설정 ----------
  const hideList = $('hideList');
  for (const [key, label] of Y.HIDE_OPTIONS) {
    const chip = document.createElement('label');
    chip.className = 'chip';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.hide = key;
    const text = document.createElement('span');
    text.textContent = label;
    chip.append(cb, text);
    hideList.appendChild(chip);
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('masterState').textContent = settings.enabled ? '수업 모드' : '꺼짐';
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
  const key = Y.segmentKey(state.videoId);
  const msg = (text, err) => { $('segMsg').textContent = text; $('segMsg').classList.toggle('err', !!err); };

  if (state.segment) {
    $('segStart').value = state.segment.start ? Y.formatTime(state.segment.start) : '';
    $('segEnd').value = state.segment.end != null ? Y.formatTime(state.segment.end) : '';
    $('segLoop').checked = !!state.segment.loop;
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
    if ((rawStart && start == null) || (rawEnd && end == null)) return msg('예: 2:10', true);
    const loop = $('segLoop').checked;
    if (start == null && end == null && !loop) return msg('시간을 입력하세요', true);
    if (!Y.normalizeSegment({ start, end, loop })) return msg('끝이 시작보다 앞입니다', true);
    await chrome.storage.local.set({ [key]: { start, end, loop, savedAt: Date.now() } });
    msg('저장됨');
  });

  $('segClear').addEventListener('click', async () => {
    await chrome.storage.local.remove(key);
    $('segStart').value = '';
    $('segEnd').value = '';
    $('segLoop').checked = false;
    msg('');
  });
})();
