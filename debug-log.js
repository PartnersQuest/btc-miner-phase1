
 * debug-log.js
 *
 * Without a Mac, there is no way to open Safari's Web Inspector on this
 * iPhone — so any uncaught JS error is normally completely invisible.
 * This module catches everything (uncaught exceptions, promise rejections,
 * and manual log calls) and renders it directly in the page.
 *
 * This is the fix for "un truc s'affiche mais rien ne se passe quand
 * j'appuie sur le bouton" — from now on, the actual error text will show
 * up on screen instead of silently dying in a console you can't reach.
 */

let logContainer = null;

function ensureContainer() {
  if (logContainer) return logContainer;
  logContainer = document.createElement('section');
  logContainer.className = 'panel';
  logContainer.innerHTML = '<h2>Debug Log</h2><div id="debug-log-entries"></div>';
  document.querySelector('main').appendChild(logContainer);
  return logContainer;
}

function logEntry(level, message) {
  ensureContainer();
  const entries = document.getElementById('debug-log-entries');
  const row = document.createElement('div');
  row.style.fontFamily = 'ui-monospace, monospace';
  row.style.fontSize = '0.7rem';
  row.style.wordBreak = 'break-word';
  row.style.padding = '0.3rem 0';
  row.style.borderBottom = '1px solid #232d3a';
  row.style.color = level === 'error' ? '#f85149' : level === 'warn' ? '#f7931a' : '#8b98a5';
  const time = new Date().toLocaleTimeString('fr-FR');
  row.textContent = `[${time}] ${level.toUpperCase()}: ${message}`;
  entries.prepend(row);

  // keep it bounded so the page doesn't grow forever
  while (entries.children.length > 50) {
    entries.removeChild(entries.lastChild);
  }
}

window.addEventListener('error', (event) => {
  const msg = event.error && event.error.stack ? event.error.stack : event.message;
  logEntry('error', `${event.filename}:${event.lineno} — ${msg}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
  logEntry('error', `Unhandled promise rejection — ${reason}`);
});

function debugLog(message) {
  logEntry('info', message);
}

function debugWarn(message) {
  logEntry('warn', message);
}

function debugError(message) {
  logEntry('error', message);
}

export { debugLog, debugWarn, debugError };
