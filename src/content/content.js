// 유튜브 페이지(및 임베드 iframe) 안에서 동작한다.
// 1) <html>에 숨김 클래스 적용  2) 자동재생 끄기  3) 영상 끝 검은 화면  4) 구간 재생
(() => {
  'use strict';
  const Y = self.YTC;
  if (!Y || self.__ytcLoaded) return;
  self.__ytcLoaded = true;

  const isEmbed = /^\/embed\//.test(location.pathname);
  let settings = Y.mergeSettings(null);
  let videoId = null;
  let segment = null;          // { start, end } | null
  let startApplied = false;    // 이 영상에서 시작 지점 이동을 이미 했는가
  let endHandled = false;      // 끝 지점 정지를 이미 했는가 (다시 보기 전까지)
  const hookedVideos = new WeakSet();

  // ---------- 저장소 ----------
  const storageGet = (area, key) =>
    new Promise((resolve) => {
      try { chrome.storage[area].get(key, (r) => resolve(chrome.runtime.lastError ? {} : r || {})); }
      catch { resolve({}); }
    });
  const storageSet = (area, obj) =>
    new Promise((resolve) => {
      try { chrome.storage[area].set(obj, () => resolve()); } catch { resolve(); }
    });

  async function loadSettings() {
    const r = await storageGet('sync', 'settings');
    const l = r.settings ? r : await storageGet('local', 'settings');
    settings = Y.mergeSettings(l.settings);
    applyClasses();
  }

  async function loadSegment() {
    if (!videoId) { segment = null; return; }
    const key = Y.segmentKey(videoId);
    const r = await storageGet('local', key);
    segment = Y.normalizeSegment(r[key]);
    updateSegButtons();
  }

  // patch: { start?: 초|null, end?: 초|null, loop?: boolean }. null이면 그 값을 지운다.
  // 저장에 실패(끝이 시작보다 앞)하면 false.
  async function saveSegment(patch) {
    if (!videoId) return false;
    const key = Y.segmentKey(videoId);
    const r = await storageGet('local', key);
    const raw = { ...(r[key] || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) delete raw[k];
      else raw[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v;
    }
    const norm = Y.normalizeSegment(raw);
    if (!norm && (raw.start != null || raw.end != null)) {
      toast('끝 지점은 시작 지점보다 뒤여야 합니다');
      return false;
    }
    if (norm) await storageSet('local', { [key]: { start: raw.start ?? null, end: raw.end ?? null, loop: raw.loop === true, savedAt: Date.now() } });
    else await new Promise((res) => chrome.storage.local.remove(key, res));
    return true;
  }

  // ---------- 숨김 클래스 ----------
  function applyClasses() {
    const root = document.documentElement;
    if (!root) return;
    const want = new Set(Y.classesFor(settings));
    if (isEmbed) want.add('ytc-embed');
    for (const c of [...root.classList]) if (c.startsWith('ytc-') && !want.has(c)) root.classList.remove(c);
    for (const c of want) root.classList.add(c);
    if (!settings.enabled) { removeBlack(); removeSegButtons(); }
  }

  // ---------- 플레이어 도우미 ----------
  const getVideo = () => document.querySelector('video.html5-main-video') || document.querySelector('video');
  const getPlayer = (v) => (v && v.closest('.html5-video-player')) || document.querySelector('#movie_player');
  const isAd = (p) => !!p && p.classList.contains('ad-showing');

  function toast(text) {
    const p = getPlayer(getVideo());
    if (!p) return;
    p.querySelector('.ytc-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'ytc-toast';
    el.textContent = text;
    p.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // ---------- 검은 화면 ----------
  function showBlack(reason) {
    const v = getVideo();
    const p = getPlayer(v);
    if (!p || p.querySelector('.ytc-black')) return;
    const wrap = document.createElement('div');
    wrap.className = 'ytc-black';
    const box = document.createElement('div');
    box.className = 'ytc-black-box';
    const msg = document.createElement('div');
    msg.textContent = reason === 'segment' ? '지정한 구간이 끝났습니다' : '영상이 끝났습니다';
    const btn = document.createElement('button');
    btn.className = 'ytc-black-replay';
    btn.type = 'button';
    btn.textContent = '↺ 다시 보기';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      replay();
    });
    box.append(msg, btn);
    wrap.appendChild(box);
    // 플레이어 클릭(재생/일시정지)이 뒤로 전달되지 않게 막는다
    for (const t of ['click', 'dblclick', 'mousedown']) wrap.addEventListener(t, (e) => e.stopPropagation());
    p.appendChild(wrap);
  }

  function removeBlack() {
    document.querySelectorAll('.ytc-black').forEach((el) => el.remove());
  }

  function replay() {
    const v = getVideo();
    removeBlack();
    endHandled = false;
    if (!v) return;
    v.currentTime = segment ? segment.start : 0;
    v.play().catch(() => {});
  }

  // ---------- 비디오 이벤트 ----------
  function hookVideo(v) {
    if (hookedVideos.has(v)) return;
    hookedVideos.add(v);

    v.addEventListener('timeupdate', () => {
      if (!settings.enabled || !segment || isAd(getPlayer(v))) return;
      if (!startApplied && segment.start > 0 && v.currentTime < segment.start - 1) {
        startApplied = true;
        v.currentTime = segment.start;
        toast(`구간 재생: ${Y.formatTime(segment.start)}부터`);
        return;
      }
      startApplied = true;
      if (segment.loop && Y.reachedEnd(v.currentTime, segment)) {
        v.currentTime = segment.start;
        return;
      }
      if (!endHandled && Y.reachedEnd(v.currentTime, segment)) {
        endHandled = true;
        v.pause();
        if (settings.blackScreen) showBlack('segment');
        else toast('지정한 구간이 끝났습니다');
      }
    });

    v.addEventListener('ended', () => {
      if (!settings.enabled || isAd(getPlayer(v))) return;
      if (segment && segment.loop) { replay(); return; }
      if (settings.blackScreen) showBlack('ended');
    });

    // 사용자가 다시 재생하거나 앞쪽으로 이동하면 검은 화면을 걷고 끝 정지를 다시 준비한다
    v.addEventListener('play', removeBlack);
    v.addEventListener('seeked', () => {
      if (segment && segment.end != null && v.currentTime < segment.end - 0.3) endHandled = false;
      if (!v.ended) removeBlack();
    });
  }

  // ---------- 자동재생 끄기 ----------
  function ensureAutoplayOff() {
    if (!settings.enabled || !settings.autoplayOff || isEmbed) return;
    const btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (btn) btn.click();
  }

  // ---------- 구간 버튼 ----------
  function removeSegButtons() {
    document.querySelectorAll('.ytc-seg-group').forEach((el) => el.remove());
  }

  function updateSegButtons() {
    const g = document.querySelector('.ytc-seg-group');
    if (!g) return;
    const s = g.querySelector('[data-part="start"]');
    const e = g.querySelector('[data-part="end"]');
    const l = g.querySelector('[data-part="loop"]');
    const c = g.querySelector('[data-part="clear"]');
    const hasStart = segment && segment.start > 0;
    const hasEnd = segment && segment.end != null;
    const looping = !!(segment && segment.loop);
    s.dataset.set = hasStart ? '1' : '0';
    e.dataset.set = hasEnd ? '1' : '0';
    l.dataset.set = looping ? '1' : '0';
    s.textContent = hasStart ? `시작 ${Y.formatTime(segment.start)}` : '시작 지점';
    e.textContent = hasEnd ? `끝 ${Y.formatTime(segment.end)}` : '끝 지점';
    l.textContent = looping ? '🔁 반복 중' : '🔁 반복';
    c.style.display = segment ? '' : 'none';
  }

  function ensureSegButtons() {
    if (!settings.enabled || !videoId) { removeSegButtons(); return; }
    const right = document.querySelector('.ytp-right-controls');
    if (!right || right.querySelector('.ytc-seg-group')) return;
    const g = document.createElement('div');
    g.className = 'ytc-seg-group';
    const mk = (part, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ytc-seg-btn';
      b.dataset.part = part;
      b.title = title;
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const v = getVideo();
        if (!v) return;
        if (part === 'clear') {
          await saveSegment({ start: null, end: null, loop: null });
          toast('구간을 지웠습니다');
        } else if (part === 'loop') {
          const on = !(segment && segment.loop);
          await saveSegment({ loop: on || null });
          const range = segment && segment.end != null ? '구간' : '영상 전체';
          toast(on ? `${range} 반복 재생` : '반복 끔 (끝에서 멈춤)');
        } else if (await saveSegment({ [part]: v.currentTime })) {
          toast(`${part === 'start' ? '시작' : '끝'} 지점: ${Y.formatTime(v.currentTime)}`);
        }
      });
      return b;
    };
    g.append(
      mk('start', '지금 위치를 구간 시작으로 저장'),
      mk('end', '지금 위치를 구간 끝으로 저장 (여기서 멈추고 검은 화면)'),
      mk('loop', '구간(없으면 영상 전체)을 반복 재생'),
      mk('clear', '이 영상의 구간 지우기'),
    );
    g.lastChild.textContent = '✕';
    right.prepend(g);
    updateSegButtons();
  }

  // ---------- 주기 점검 (유튜브는 SPA라 페이지 이동이 새로고침 없이 일어난다) ----------
  function tick() {
    const id = Y.videoIdFromUrl(location.href);
    if (id !== videoId) {
      videoId = id;
      startApplied = false;
      endHandled = false;
      removeBlack();
      removeSegButtons();
      loadSegment();
    }
    const v = getVideo();
    if (v) hookVideo(v);
    if (settings.enabled) {
      ensureAutoplayOff();
      ensureSegButtons();
    }
  }

  // ---------- 메시지 (팝업) ----------
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'ytc:state' && window === window.top) {
      const v = getVideo();
      reply({ videoId, currentTime: v ? v.currentTime : null, segment });
    }
  });

  // ---------- 변경 감지 ----------
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.settings && (area === 'sync' || area === 'local')) {
      settings = Y.mergeSettings(changes.settings.newValue);
      applyClasses();
      tick();
    }
    if (area === 'local' && videoId && changes[Y.segmentKey(videoId)]) {
      segment = Y.normalizeSegment(changes[Y.segmentKey(videoId)].newValue);
      startApplied = true; // 방금 저장한 구간 때문에 갑자기 점프하지 않게
      endHandled = false;
      updateSegButtons();
    }
  });

  applyClasses(); // 저장값을 읽기 전에도 기본값(켜짐)으로 바로 가린다 — 깜빡임 방지
  loadSettings().then(tick);
  document.addEventListener('yt-navigate-finish', tick);
  setInterval(tick, 1000);
})();
