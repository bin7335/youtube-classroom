// 설정 기본값과 순수 로직. 콘텐츠 스크립트·팝업·백그라운드·Node 테스트가 함께 쓴다.
(function (root) {
  'use strict';

  // 숨김 항목: key → 팝업 라벨. 순서가 팝업 표시 순서다.
  const HIDE_OPTIONS = [
    ['sidebar', '오른쪽 추천 영상'],
    ['comments', '댓글'],
    ['endscreen', '영상 끝 추천 화면'],
    ['cards', '영상 중 정보 카드(i)'],
    ['home', '홈 화면 추천·쇼츠'],
    ['search', '검색어 자동완성·이전 검색어'],
    ['account', '계정 아이콘·알림·구독·시청 기록'],
    ['embed', '다른 사이트에 넣은 영상(패들렛 등) 추천'],
  ];

  const DEFAULTS = Object.freeze({
    enabled: true,
    autoplayOff: true,
    blackScreen: true,
    hide: Object.freeze(Object.fromEntries(HIDE_OPTIONS.map(([k]) => [k, true]))),
  });

  // 저장된 값(일부 키만 있거나 오래된 버전일 수 있음)을 기본값과 합친다.
  function mergeSettings(stored) {
    const s = stored && typeof stored === 'object' ? stored : {};
    const hide = { ...DEFAULTS.hide };
    if (s.hide && typeof s.hide === 'object') {
      for (const k of Object.keys(hide)) {
        if (typeof s.hide[k] === 'boolean') hide[k] = s.hide[k];
      }
    }
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    return {
      enabled: bool(s.enabled, DEFAULTS.enabled),
      autoplayOff: bool(s.autoplayOff, DEFAULTS.autoplayOff),
      blackScreen: bool(s.blackScreen, DEFAULTS.blackScreen),
      hide,
    };
  }

  // <html>에 붙일 클래스 목록. CSS는 이 클래스만 보고 숨긴다.
  function classesFor(settings) {
    if (!settings.enabled) return [];
    const out = ['ytc-on'];
    for (const [k] of HIDE_OPTIONS) if (settings.hide[k]) out.push('ytc-hide-' + k);
    return out;
  }

  // "2:10", "1:02:03", "130", "130.5" → 초. 해석할 수 없으면 null.
  function parseTime(text) {
    if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : null;
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (!t) return null;
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const parts = t.split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    if (!parts.every((p) => /^\d+$/.test(p))) return null;
    const nums = parts.map(Number);
    if (nums.slice(1).some((n) => n >= 60)) return null;
    return nums.reduce((acc, n) => acc * 60 + n, 0);
  }

  // 초 → "2:10" / "1:02:03"
  function formatTime(sec) {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '';
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }

  // 구간 정규화: start/end 중 하나만 있어도 된다. 둘 다 없거나 end<=start면 null.
  function normalizeSegment(seg) {
    if (!seg || typeof seg !== 'object') return null;
    const start = parseTime(seg.start ?? '');
    const end = parseTime(seg.end ?? '');
    if (start == null && end == null) return null;
    if (start != null && end != null && end <= start) return null;
    return { start: start ?? 0, end: end ?? null };
  }

  // 지금 재생 위치에서 멈춰야 하는가 (끝 지점 도달)
  function reachedEnd(currentTime, seg) {
    return !!seg && seg.end != null && currentTime >= seg.end - 0.25;
  }

  // URL에서 영상 ID 추출 (watch, embed, youtu.be, shorts)
  function videoIdFromUrl(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
        if (m) id = m[1];
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  }

  const SEGMENT_PREFIX = 'seg:';
  const segmentKey = (videoId) => SEGMENT_PREFIX + videoId;

  const api = {
    HIDE_OPTIONS, DEFAULTS, mergeSettings, classesFor,
    parseTime, formatTime, normalizeSegment, reachedEnd,
    videoIdFromUrl, segmentKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YTC = api;
})(typeof self !== 'undefined' ? self : this);
