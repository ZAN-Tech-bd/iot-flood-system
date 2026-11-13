import { $, setText } from '../lib/dom.js';
export function initNavigation() {
  function page(name) {
    $('dashboardPage').hidden = name !== 'dashboard';
    $('settingsPage').hidden = name !== 'settings';
    $('historyPage').hidden = name !== 'history';
    setText(
      'pageLabel',
      name === 'settings' ? 'Settings' : name === 'history' ? 'Sensor history' : 'Overview',
    );
    document.querySelectorAll('.nav').forEach((button) => {
      const active = button.dataset.page === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
  document.querySelectorAll('.nav').forEach((button) =>
    button.addEventListener('click', () => {
      location.hash = button.dataset.page;
    }),
  );
  window.addEventListener('hashchange', () =>
    page(['#settings', '#history'].includes(location.hash) ? location.hash.slice(1) : 'dashboard'),
  );
  page(['#settings', '#history'].includes(location.hash) ? location.hash.slice(1) : 'dashboard');
}
