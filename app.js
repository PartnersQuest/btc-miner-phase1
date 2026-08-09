import { sha256d, toHex, fromHex } from './sha256d.js';
import { SHA256D_TEST_VECTORS } from './vectors.js';
import { runBlockHeaderTests } from './blockheader-tests.js';
import { debugLog, debugWarn, debugError } from './debug-log.js';
import { buildBlockTemplate } from './blocktemplate.js';
import { leadingZeroBitsToTarget } from './target.js';
import { validateFoundBlock } from './block-validator.js';

debugLog('app.js loaded, starting init...');

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
  try {
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
        debugError(`Vector "${vector.label}" FAILED — expected ${vector.expected}, got ${computedHex}`);
      }
    }
    debugLog('runVectorTests completed');
  } catch (err) {
    debugError(`runVectorTests threw: ${err.message || err}`);
  }
}

document.getElementById('run-tests-button').addEventListener('click', runVectorTests);

// ---------- Block header / target tests (Phase 3/4, real genesis block) ----------

const headerTestList = document.getElementById('header-test-list');

async function runHeaderTests() {
  try {
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
        debugError(`Header test "${r.label}" FAILED`);
      }
    }
    debugLog('runHeaderTests completed, ' + results.length + ' results');
  } catch (err) {
    debugError(`runHeaderTests threw: ${err.message || err}\n${err.stack || ''}`);
  }
}

document.getElementById('run-header-tests-button').addEventListener('click', runHeaderTests);

// ---------- Real mining (Phase 5-9: coinbase, merkle, header, nonce search, validation) ----------

const PAYOUT_ADDRESS = 'bc1qtqukcc9jhqcug77k4pd52dmkn30y08jgmvzjnl';

const difficultyInput = document.getElementById('mining-difficulty');
const buildTemplateButton = document.getElementById('build-template-button');
const templateOutput = document.getElementById('template-output');
const startMiningButton = document.getElementById('start-mining-button');
const stopMiningButton = document.getElementById('stop-mining-button');
const miningHashrateEl = document.getElementById('mining-hashrate');
const miningHashesEl = document.getElementById('mining-hashes');
const miningElapsedEl = document.getElementById('mining-elapsed');
const miningStatusEl = document.getElementById('mining-status');
const blockFoundPanel = document.getElementById('block-found-panel');
const blockFoundDetails = document.getElementById('block-found-details');

let currentTemplate = null;
let miningWorkers = [];
let miningWorkerCounts = [];
let miningStartTime = null;
let miningTimerHandle = null;
let miningActive = false;

buildTemplateButton.addEventListener('click', async () => {
  try {
    const bits = parseInt(difficultyInput.value, 10);
    if (isNaN(bits) || bits < 1 || bits > 40) {
      templateOutput.textContent = 'Difficulté invalide (1-40 bits recommandé pour un test sur iPhone)';
      return;
    }
    const targetHex = leadingZeroBitsToTarget(bits);

    currentTemplate = await buildBlockTemplate({
      previousBlockHashDisplayHex: '00'.repeat(32),
      height: 1,
      rewardSatoshis: 5000000000n,
      payoutAddress: PAYOUT_ADDRESS,
      targetHex,
      extranonce: 0
    });

    templateOutput.textContent =
      `coinbase txid: ${currentTemplate.coinbase.txidDisplayHex}\n` +
      `scriptPubKey: ${currentTemplate.coinbase.scriptPubKeyHex}\n` +
      `merkle root: ${toHex(currentTemplate.merkleRootInternal)}\n` +
      `target: ${targetHex}\n` +
      `expected hashes (~2^${bits}): ${Math.pow(2, bits).toLocaleString('fr-FR')}`;

    startMiningButton.disabled = false;
    debugLog('Template built successfully, difficulty=' + bits + ' bits');
  } catch (err) {
    templateOutput.textContent = 'ERREUR: ' + (err.message || err);
    debugError('buildTemplate failed: ' + (err.stack || err.message || err));
  }
});

function miningTotalHashes() {
  return miningWorkerCounts.reduce((sum, c) => sum + c, 0);
}

function updateMiningStats() {
  const elapsedMs = performance.now() - miningStartTime;
  const total = miningTotalHashes();
  const rate = elapsedMs > 0 ? total / (elapsedMs / 1000) : 0;

  miningHashrateEl.textContent = rate >= 1000 ? `${(rate / 1000).toFixed(2)} kH/s` : `${rate.toFixed(0)} H/s`;
  miningHashesEl.textContent = total.toLocaleString('fr-FR');
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  miningElapsedEl.textContent = `${h}:${m}:${s}`;
}

async function onWorkerFound(data) {
  if (!miningActive) return; // another worker may have already found it
  miningActive = false;
  miningStatusEl.textContent = 'VALIDATING...';

  stopAllMiningWorkers();
  clearInterval(miningTimerHandle);
  updateMiningStats();

  try {
    const validation = await validateFoundBlock({
      headerHex: data.headerHex,
      targetHex: currentTemplate.targetHex,
      expectedCoinbaseTxid: currentTemplate.coinbase.txidInternal
    });

    blockFoundPanel.style.display = 'block';
    let html = '';
    for (const c of validation.checks) {
      html += `<div class="vector-row"><span>${c.label}</span><span class="badge ${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'}</span></div>`;
    }
    html += `<div class="hash-output" style="margin-top:0.6rem;">
Block hash: ${validation.blockHashDisplayHex}
Nonce: ${data.nonce}
Height: ${currentTemplate.height}
Payout address: ${PAYOUT_ADDRESS}
Statut réseau: NON DIFFUSÉ (aucun relais Bitcoin connecté)
Validation: ${validation.valid ? 'VALID BLOCK (localement, hors réseau réel)' : 'INVALID'}
</div>`;
    blockFoundDetails.innerHTML = html;

    miningStatusEl.textContent = validation.valid ? 'FOUND' : 'INVALID';
    debugLog(`Block found and validated: valid=${validation.valid}, nonce=${data.nonce}`);
  } catch (err) {
    miningStatusEl.textContent = 'ERROR';
    debugError('Validation threw: ' + (err.stack || err.message || err));
  }

  startMiningButton.disabled = false;
  stopMiningButton.disabled = true;
}

function stopAllMiningWorkers() {
  for (const w of miningWorkers) {
    w.postMessage({ type: 'stop' });
    setTimeout(() => w.terminate(), 300);
  }
  miningWorkers = [];
}

startMiningButton.addEventListener('click', () => {
  if (!currentTemplate) return;
  try {
    blockFoundPanel.style.display = 'none';
    miningActive = true;
    miningStatusEl.textContent = 'MINING';
    miningStartTime = performance.now();

    const numWorkers = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8));
    const rangeSize = Math.floor(0xffffffff / numWorkers);

    miningWorkers = [];
    miningWorkerCounts = new Array(numWorkers).fill(0);

    const headerFields = {
      version: currentTemplate.version,
      prevBlockHashInternal: currentTemplate.prevBlockHashInternal,
      merkleRootInternal: currentTemplate.merkleRootInternal,
      timestamp: currentTemplate.timestamp,
      bits: 0,
      nonce: 0
    };

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker('mining-worker.js', { type: 'module' });
      const nonceStart = i * rangeSize;
      const nonceEnd = i === numWorkers - 1 ? 0xffffffff : (i + 1) * rangeSize - 1;

      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'progress') {
          miningWorkerCounts[msg.workerId] = msg.hashCount;
        } else if (msg.type === 'found') {
          onWorkerFound(msg);
        } else if (msg.type === 'exhausted') {
          miningWorkerCounts[msg.workerId] = msg.hashCount;
          debugWarn(`Worker ${msg.workerId} exhausted its nonce range without finding a block`);
        }
      };
      worker.onerror = (err) => {
        debugError(`mining-worker ${i} error: ${err.message}`);
      };

      worker.postMessage({
        type: 'start',
        workerId: i,
        headerFields,
        targetHex: currentTemplate.targetHex,
        nonceStart,
        nonceEnd
      });
      miningWorkers.push(worker);
    }

    miningTimerHandle = setInterval(updateMiningStats, 250);

    startMiningButton.disabled = true;
    stopMiningButton.disabled = false;
    debugLog(`Mining started with ${numWorkers} workers`);
  } catch (err) {
    debugError('startMining failed: ' + (err.stack || err.message || err));
  }
});

stopMiningButton.addEventListener('click', () => {
  miningActive = false;
  stopAllMiningWorkers();
  clearInterval(miningTimerHandle);
  updateMiningStats();
  miningStatusEl.textContent = 'STOPPED';
  startMiningButton.disabled = false;
  stopMiningButton.disabled = true;
  debugLog('Mining stopped by user');
});

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
