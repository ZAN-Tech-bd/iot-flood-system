import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';

class Element {
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  style = {};
  options = [];
  listeners = new Map();
  dataset = {};
  classes = new Set();
  classList = {
    toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)),
    remove: (name) => this.classes.delete(name),
  };
  addEventListener(name, fn) {
    this.listeners.set(name, fn);
  }
  dispatch(name, event = { preventDefault() {} }) {
    return this.listeners.get(name)?.(event);
  }
  setAttribute() {}
  add(option) {
    this.options.push(option);
  }
  replaceChildren(...options) {
    this.options = options;
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
test('frontend modules initialize and preserve location, telemetry, settings, and feedback behavior', async (t) => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('FLOOD Lifting House'));
  assert.ok(html.includes('/assets/images/team-logo.png'));
  for (const id of [
    'startLevel',
    'stopLevel',
    'mode',
    'manualState',
    'baselineCm',
    'maxHeightCm',
  ]) {
    assert.ok(!html.includes(`id="${id}"`), `Removed settings field: ${id}`);
  }
  const elements = new Map(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]),
  );
  const $ = (id) => {
    assert.ok(elements.has(id), 'HTML element exists: ' + id);
    return elements.get(id);
  };
  const navigation = ['dashboard', 'settings'].map((page) => {
    const el = new Element();
    el.dataset.page = page;
    return el;
  });
  const handlers = new Map(),
    emitted = [],
    intervals = [];
  const socket = {
    connected: true,
    on(name, fn) {
      handlers.set(name, [...(handlers.get(name) || []), fn]);
    },
    emit(name, data, reply) {
      emitted.push([name, data]);
      reply?.(null, { ok: true });
    },
    timeout() {
      return this;
    },
  };
  const deliver = (name, data) => {
    for (const fn of handlers.get(name) || []) fn(data);
  };
  const bd = [
    {
      city: 'Dhaka',
      region: 'Dhaka',
      country: 'Bangladesh',
      countryCode: 'BD',
      lat: 23.8103,
      lon: 90.4125,
    },
    {
      city: 'Khulna',
      region: 'Khulna',
      country: 'Bangladesh',
      countryCode: 'BD',
      lat: 22.8,
      lon: 89.5,
    },
  ];
  let releaseUS, releaseOnline;
  const names = ['document', 'window', 'location', 'Option', 'fetch', 'setInterval'];
  const original = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  t.after(() => {
    for (const name of names) {
      if (original[name] === undefined) delete globalThis[name];
      else globalThis[name] = original[name];
    }
  });
  globalThis.document = { getElementById: $, querySelectorAll: () => navigation };
  globalThis.window = { io: () => socket, addEventListener() {} };
  globalThis.location = { hash: '' };
  globalThis.Option = class {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  globalThis.setInterval = (fn) => {
    intervals.push(fn);
    return 1;
  };
  globalThis.fetch = async (url) => {
    if (url.startsWith('/api/locations'))
      await new Promise((resolve) => {
        releaseOnline = resolve;
      });
    if (url.includes('country=US'))
      await new Promise((resolve) => {
        releaseUS = resolve;
      });
    return {
      ok: true,
      json: async () =>
        url.includes('country=BD')
          ? bd
          : [{ city: 'Boston', countryCode: 'US', lat: 42.36, lon: -71.06 }],
    };
  };
  await import('../public/js/app.js');
  const activeConfig = {
    ...DEFAULT_CONFIG,
    startLevel: 90,
    stopLevel: 10,
    baselineCm: 37,
    maxHeightCm: 321,
    mode: 'manual',
    manualState: true,
    apiKeyConfigured: true,
  };
  deliver('configUpdate', activeConfig);
  await pause();
  assert.equal($('city').options.length, 3);
  assert.equal($('city').value, '0');
  $('citySearch').value = 'khulna';
  $('citySearch').dispatch('input');
  assert.ok($('city').options.some((option) => option.text.startsWith('Khulna')));
  $('city').value = '1';
  $('city').dispatch('change');
  $('settingsForm').dispatch('submit');
  assert.equal(emitted.find(([name]) => name === 'updateConfig')[1].city, 'Khulna');
  const savedConfig = emitted.find(([name]) => name === 'updateConfig')[1];
  for (const key of [
    'startLevel',
    'stopLevel',
    'baselineCm',
    'maxHeightCm',
    'mode',
    'manualState',
  ]) {
    assert.equal(savedConfig[key], activeConfig[key], `Preserved controller setting: ${key}`);
  }
  $('country').value = 'US';
  $('country').dispatch('change');
  await pause();
  $('country').value = 'BD';
  $('country').dispatch('change');
  await pause();
  releaseUS();
  await pause();
  assert.ok($('city').options.some((option) => option.text.startsWith('Dhaka')));
  assert.ok(!$('city').options.some((option) => option.text.startsWith('Boston')));
  assert.equal($('city').disabled, false);
  $('citySearch').value = 'Dhaka';
  const onlineSearch = $('searchCities').dispatch('click');
  assert.equal($('searchCities').disabled, true);
  $('citySearch').value = 'khulna';
  $('citySearch').dispatch('input');
  assert.equal($('searchCities').disabled, false);
  releaseOnline();
  await onlineSearch;
  assert.equal($('city').options.length, 2);
  assert.ok($('city').options[1].text.startsWith('Khulna'));
  deliver('dashboardUpdate', {
    sensorLevel: 42,
    distanceCm: 95.5,
    houseHeightCm: 75.5,
    motorActive: true,
    motorDirection: 'up',
    updatedAt: new Date().toISOString(),
  });
  assert.equal($('height').textContent, '75.5 cm');
  assert.equal($('liftStatus').textContent, 'House is lifting');
  assert.equal($('liftArrows').hidden, false);
  assert.equal($('liftUp').disabled, false);
  $('liftUp').dispatch('click');
  assert.equal(emitted.find(([name]) => name === 'liftCommand')[1].action, 'stop');
  deliver('liftCommandUpdate', {
    action: 'down',
    expiresAt: new Date(Date.now() + 15000).toISOString(),
  });
  assert.equal($('liftStatus').textContent, 'House is lifting');
  deliver('dashboardUpdate', {
    sensorLevel: 42,
    distanceCm: 95.5,
    houseHeightCm: 75.5,
    motorActive: true,
    motorDirection: 'down',
    updatedAt: new Date().toISOString(),
  });
  assert.equal($('liftStatus').textContent, 'House is lowering');
  assert.equal($('liftArrows').textContent, '↓ ↓ ↓');
  for (const [limit, message, blocked, allowed] of [
    ['upperLimit', 'Upper limit reached · lifting stopped', 'liftUp', 'liftDown'],
    ['lowerLimit', 'Lower limit reached · lifting stopped', 'liftDown', 'liftUp'],
  ]) {
    deliver('dashboardUpdate', {
      sensorLevel: 42,
      distanceCm: 95.5,
      houseHeightCm: 75.5,
      motorActive: false,
      motorDirection: 'stopped',
      upperLimit: false,
      lowerLimit: false,
      [limit]: true,
      updatedAt: new Date().toISOString(),
    });
    assert.equal($('liftCommandState').textContent, message);
    assert.equal($(blocked).disabled, true);
    assert.equal($(allowed).disabled, false);
  }
  socket.connected = false;
  deliver('disconnect');
  assert.equal($('liftStatus').textContent, 'Lift status unavailable');
  assert.equal($('liftArrows').hidden, true);
  assert.equal($('liftUp').disabled, true);
  assert.equal($('liftStop').disabled, true);
  socket.connected = true;
  deliver('connect');
  deliver('dashboardUpdate', {
    sensorLevel: 42,
    distanceCm: 95.5,
    houseHeightCm: 75.5,
    motorActive: false,
    updatedAt: new Date().toISOString(),
  });
  assert.equal($('liftStatus').textContent, 'House is stationary');
  deliver('dashboardUpdate', {
    sensorLevel: 42,
    distanceCm: 95.5,
    houseHeightCm: 75.5,
    motorActive: true,
    motorDirection: 'up',
    updatedAt: new Date(Date.now() - 31000).toISOString(),
  });
  assert.equal($('liftStatus').textContent, 'Lift status unavailable');
  $('analyze').dispatch('click');
  assert.equal($('analyze').disabled, true);
  deliver('analysisResult', {
    text: 'Test feedback',
    generatedAt: new Date().toISOString(),
    sensorAt: new Date().toISOString(),
    weatherAt: new Date().toISOString(),
  });
  assert.equal($('aiOutput').textContent, 'Test feedback');
  assert.equal($('analyze').disabled, false);
});
