import { sha256d, toHex, fromHex } from './sha256d.js';
import { SHA256D_TEST_VECTORS } from './vectors.js';
import { runBlockHeaderTests } from './blockheader-tests.js';

// ---------- SHA256d manual test ----------

const hashInput = document.getElementById('hash-input');
const hashButton = document.getElementById('hash-button');
const hashOutput = document.getElementById('hash-output');

hashButton.addEventListener('click', async () => {
  const text = hashInput.value;
  const bytes = new TextEncoder().encode(text);
  const digest = await sha256d(bytes);
  hashOutput.textContent = toHex(digest);
});

// ---------- Known vector tests ----------

const vectorList = document.getElementById('vector-list');

async function runVectorTests() {
  vectorList.innerHTML = '';
  for (const vector of SHA256D_TEST_VECTORS) {
    const row = document.createElement('div');
    row.className = 'vector-row';

    const label = document.createElement('span');
    label.textContent = vector.label;

    const badge = document.createElement('span');
    badge.className = 'badge pending';
    badge.textContent = '...';

    row.appendChild(label);
    row.appendChild(badge);
    vectorList.appendChild(row);

    const bytes = fromHex(vector.inputHex);
    const digest = await sha256d(bytes);
    const computedHex = toHex(digest);
    const passed = computedHex === vector.expected;

    badge.className = `badge ${passed ? 'pass' : 'fail'}`;
    badge.textContent = passed ? 'PASS' : 'FAIL';

    if (!passed) {
      console.error(`Vector "${vector.label}" FAILED`, {
        expected: vector.expected,
        computed: computedHex
      });
    }
  }
}

document.getElementById('run-tests-button').addEventListener('click', runVectorTests);

// ---------- Block header / target tests (Phase 3/4, real genesis block) ----------

const headerTestList = document.getElementById('header-test-list');

async function runHeaderTests() {
  headerTestList.innerHTML = '';
  const results = await runBlockHeaderTests();
  for (const r of results) {
    const row = document.createElement('div');
    row.className = 'vector-row';

    const label = document.createElement('span');
    label.textContent = r.label;

    const badge = document.createElement('span');
    badge.className = `badge ${r.pass ? 'pass' : 'fail'}`;
    badge.textContent = r.pass ? 'PASS' : 'FAIL';

    row.appendChild(label);
    row.appendChild(badge);
    headerTestList.appendChild(row);

    if (!r.pass) {
      console.error(`Header test "${r.label}" FAILED`);
    }
  }
}

document.getElementById('run-header-tests-button').addEventListener('click', runHeaderTests);

// ---------- Benchmark ----------

const startButton = document.getElementById('start-benchmark');
const stopButton = document.getElementById('stop-benchmark');
const hashrateEl = document.getElementById('stat-hashrate');
const totalHashesEl = document.getElementById('stat-total-hashes');
const elapsedEl = document.getElementById('stat-elapsed');
const bestHashEl = document.getElementById('stat-best-hash');

let workers = [];
let workerCounts = [];
let benchmarkStartTime = null;
let elapsedTimerHandle = null;
let bestHashHexOverall = null;

const numWorkers = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8));

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatHashrate(hashesPerSecond) {
  if (hashesPerSecond >= 1_000_000) return `${(hashesPerSecond / 1_000_000).toFixed(2)} MH/s`;
  if (hashesPerSecond >= 1_000) return `${(hashesPerSecond / 1_000).toFixed(2)} kH/s`;
  return `${hashesPerSecond.toFixed(1)} H/s`;
}

function totalHashes() {
  return workerCounts.reduce((sum, c) => sum + c, 0);
}

function updateStatsDisplay() {
  const elapsedMs = performance.now() - benchmarkStartTime;
  const elapsedSeconds = elapsedMs / 1000;
  const total = totalHashes();
  const rate = elapsedSeconds > 0 ? total / elapsedSeconds : 0;

  hashrateEl.textContent = formatHashrate(rate);
  totalHashesEl.textContent = total.toLocaleString('fr-FR');
  elapsedEl.textContent = formatElapsed(elapsedMs);
  bestHashEl.textContent = bestHashHexOverall ? bestHashHexOverall.slice(0, 16) + '…' : '—';
}

function startBenchmark() {
  workers = [];
  workerCounts = new Array(numWorkers).fill(0);
  bestHashHexOverall = null;
  benchmarkStartTime = performance.now();

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker('sha256d-worker.js', { type: 'module' });
    worker.onmessage = (event) => {
      const { workerId, hashCount, bestHashHex } = event.data;
      workerCounts[workerId] = hashCount;
      if (bestHashHex && (bestHashHexOverall === null || bestHashHex < bestHashHexOverall)) {
        bestHashHexOverall = bestHashHex;
      }
    };
    worker.postMessage({ type: 'start', workerId: i });
    workers.push(worker);
  }

  elapsedTimerHandle = setInterval(updateStatsDisplay, 250);

  startButton.disabled = true;
  stopButton.disabled = false;
}

function stopBenchmark() {
  workers.forEach((w) => {
    w.postMessage({ type: 'stop' });
    // give it a tick to report final count before terminating
    setTimeout(() => w.terminate(), 600);
  });
  clearInterval(elapsedTimerHandle);
  updateStatsDisplay();

  startButton.disabled = false;
  stopButton.disabled = true;
}

startButton.addEventListener('click', startBenchmark);
stopButton.addEventListener('click', stopBenchmark);
stopButton.disabled = true;

// ---------- Device info ----------

document.getElementById('device-workers').textContent = String(numWorkers);
document.getElementById('device-ua').textContent = navigator.userAgent.includes('Safari') ? 'Safari' : 'Autre navigateur';
document.getElementById('device-webcrypto').textContent = window.crypto && window.crypto.subtle ? 'OUI' : 'NON';

// ---------- Service worker registration (PWA) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Run vector tests automatically on load
runVectorTests();
runHeaderTests();
