const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('../src/shared/settings.js');

test('mergeSettings: 빈 값이면 기본값(모두 켜짐)', () => {
  const s = Y.mergeSettings(undefined);
  assert.equal(s.enabled, true);
  assert.equal(s.blackScreen, true);
  assert.ok(Object.values(s.hide).every(Boolean));
  assert.equal(Object.keys(s.hide).length, Y.HIDE_OPTIONS.length);
});

test('mergeSettings: 저장값 우선, 잘못된 타입과 모르는 키는 무시', () => {
  const s = Y.mergeSettings({ enabled: false, hide: { comments: false, sidebar: 'no', bogus: true } });
  assert.equal(s.enabled, false);
  assert.equal(s.hide.comments, false);
  assert.equal(s.hide.sidebar, true);
  assert.equal('bogus' in s.hide, false);
});

test('classesFor: 꺼지면 클래스 없음, 켜지면 선택 항목만', () => {
  assert.deepEqual(Y.classesFor(Y.mergeSettings({ enabled: false })), []);
  const c = Y.classesFor(Y.mergeSettings({ hide: { comments: false } }));
  assert.ok(c.includes('ytc-on'));
  assert.ok(c.includes('ytc-hide-sidebar'));
  assert.ok(!c.includes('ytc-hide-comments'));
});

test('parseTime / formatTime', () => {
  assert.equal(Y.parseTime('2:10'), 130);
  assert.equal(Y.parseTime('1:02:03'), 3723);
  assert.equal(Y.parseTime(' 45 '), 45);
  assert.equal(Y.parseTime('12.5'), 12.5);
  assert.equal(Y.parseTime('1:75'), null);
  assert.equal(Y.parseTime('abc'), null);
  assert.equal(Y.parseTime(''), null);
  assert.equal(Y.formatTime(130), '2:10');
  assert.equal(Y.formatTime(3723), '1:02:03');
  assert.equal(Y.formatTime(-1), '');
});

test('normalizeSegment', () => {
  assert.deepEqual(Y.normalizeSegment({ start: '0:10', end: '0:20' }), { start: 10, end: 20, loop: false });
  assert.deepEqual(Y.normalizeSegment({ end: '1:00' }), { start: 0, end: 60, loop: false });
  assert.deepEqual(Y.normalizeSegment({ start: 30 }), { start: 30, end: null, loop: false });
  assert.deepEqual(Y.normalizeSegment({ start: 5, end: 9, loop: true }), { start: 5, end: 9, loop: true });
  assert.deepEqual(Y.normalizeSegment({ loop: true }), { start: 0, end: null, loop: true });
  assert.equal(Y.normalizeSegment({ loop: false }), null);
  assert.equal(Y.normalizeSegment({ start: 20, end: 10 }), null);
  assert.equal(Y.normalizeSegment({}), null);
  assert.equal(Y.normalizeSegment(null), null);
});

test('reachedEnd', () => {
  const seg = { start: 0, end: 60 };
  assert.equal(Y.reachedEnd(59, seg), false);
  assert.equal(Y.reachedEnd(59.8, seg), true);
  assert.equal(Y.reachedEnd(100, { start: 0, end: null }), false);
  assert.equal(Y.reachedEnd(100, null), false);
});

test('videoIdFromUrl', () => {
  assert.equal(Y.videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.equal(Y.videoIdFromUrl('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ');
  assert.equal(Y.videoIdFromUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'), 'dQw4w9WgXcQ');
  assert.equal(Y.videoIdFromUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(Y.videoIdFromUrl('https://www.youtube.com/'), null);
  assert.equal(Y.videoIdFromUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(Y.videoIdFromUrl('not a url'), null);
});
