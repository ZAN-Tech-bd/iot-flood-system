import test from 'node:test';
import assert from 'node:assert/strict';
import { initHistory } from '../public/js/features/history.js';
class Element {
  value = '';
  textContent = '';
  disabled = false;
  children = [];
  listeners = new Map();
  addEventListener(name, fn) {
    this.listeners.set(name, fn);
  }
  append(child) {
    this.children.push(child);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  dispatch(name) {
    this.listeners.get(name)?.({ preventDefault() {} });
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
test('history UI filters local dates, browses pages, handles missing weather, and renders text safely', async (t) => {
  const names = ['document', 'window', 'location', 'fetch'];
  const originals = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  t.after(() => {
    for (const name of names) {
      if (originals[name] === undefined) delete globalThis[name];
      else globalThis[name] = originals[name];
    }
  });
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: $,
    createElement: () => new Element(),
    createDocumentFragment: () => new Element(),
  };
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn) };
  globalThis.location = { hash: '#history' };
  const item = {
    id: 6,
    recordedAt: '2026-11-14T12:00:00Z',
    location: { city: '<img src=x>', country: 'Bangladesh' },
    sensors: { sensorLevel: 42, distanceCm: null, houseHeightCm: null, motorActive: false },
    weather: null,
    weatherAgeSeconds: null,
    weatherStatus: 'unavailable',
  };
  const urls = [];
  let response = { items: [item], nextCursor: 5 },
    fail = false,
    release;
  globalThis.fetch = async (url) => {
    urls.push(url);
    return { ok: !fail, json: async () => (fail ? { error: 'Invalid date range' } : response) };
  };
  initHistory();
  await pause();
  assert.ok($('historyFrom').value.includes('T00:00:00'));
  const query = new URL(urls[0], 'http://localhost').searchParams;
  assert.ok(query.get('to').endsWith('.999Z'));
  let row = $('historyRows').children[0].children[0];
  assert.equal(row.children[1].textContent, '<img src=x>, Bangladesh');
  assert.equal(row.children[3].textContent, '— cm');
  assert.match(row.children[11].textContent, /unavailable/);
  assert.equal($('historyOlder').disabled, false);
  response = { items: [{ ...item, id: 5 }], nextCursor: null };
  $('historyOlder').dispatch('click');
  await pause();
  assert.equal(new URL(urls.at(-1), 'http://localhost').searchParams.get('before'), '5');
  assert.equal($('historyNewer').disabled, false);
  response = { items: [item], nextCursor: 5 };
  $('historyNewer').dispatch('click');
  await pause();
  assert.equal(new URL(urls.at(-1), 'http://localhost').searchParams.has('before'), false);
  response = { items: [], nextCursor: null };
  $('historyAll').dispatch('click');
  await pause();
  assert.equal(new URL(urls.at(-1), 'http://localhost').searchParams.has('from'), false);
  assert.match($('historyStatus').textContent, /No readings/);
  fail = true;
  $('historyFilters').dispatch('submit');
  await pause();
  assert.equal($('historyStatus').textContent, 'Invalid date range');
  assert.equal($('historyApply').disabled, false);
  fail = false;
  globalThis.fetch = async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return { ok: true, json: async () => ({ items: [item], nextCursor: null }) };
  };
  $('historyAll').dispatch('click');
  await pause();
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ items: [], nextCursor: null }),
  });
  $('historyToday').dispatch('click');
  await pause();
  release();
  await pause();
  assert.match($('historyStatus').textContent, /No readings/);
  assert.equal($('historyRows').children[0].children.length, 0);
});
