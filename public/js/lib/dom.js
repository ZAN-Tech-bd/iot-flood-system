export const $ = (id) => document.getElementById(id);
export const setText = (id, text) => {
  $(id).textContent = text;
};
export const number = (value, unit) =>
  Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : `— ${unit}`;
export const time = (value) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
