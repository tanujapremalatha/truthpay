/**
 * app.js
 * All UI logic, OCR, verification, and admin registry management.
 * Firebase is initialised in firebase.js (loaded first as a module).
 */

/* ================================================================== */
/*  Constants & State                                                   */
/* ================================================================== */
const ADMIN_PIN = '1234';

window.registryCache = [];
window.registryReady = false;
let isAdminUnlocked  = false;

/** Pre-loaded sample IDs so the demo works immediately. */
const DEFAULT_SEED = [
  { id: '440995361349', amount: '₹871', note: 'Paytm Sample UTR',      claimed: false, addedAt: 'Preloaded' },
  { id: 'U2N9CEP1MD4W', amount: '₹871', note: 'Paytm Sample Order ID', claimed: false, addedAt: 'Preloaded' }
];

/* ================================================================== */
/*  Registry Helpers                                                    */
/* ================================================================== */

function loadRegistry() {
  return [...window.registryCache];
}

async function saveRegistry(list) {
  if (!window.registryReady || !window.firebaseStore) {
    alert('Cloud registry is still connecting. Please try again in a moment.');
    return false;
  }
  try {
    await window.firebaseStore.replace(loadRegistry(), list);
    return true;
  } catch (error) {
    console.error(error);
    alert('Could not save to Firestore: ' + error.message);
    return false;
  }
}

/** Strip everything but uppercase alphanumerics. */
function normalizeId(str) {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/* ================================================================== */
/*  Navigation                                                          */
/* ================================================================== */

function switchTab(tab) {
  const viewScan  = document.getElementById('viewScan');
  const viewAdmin = document.getElementById('viewAdmin');
  const tabScan   = document.getElementById('tabScan');
  const tabAdmin  = document.getElementById('tabAdmin');

  if (tab === 'scan') {
    viewScan.classList.remove('hidden');
    viewAdmin.classList.add('hidden');
    tabScan.className  = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-zinc-800 text-white shadow';
    tabAdmin.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-zinc-400 hover:text-white flex items-center gap-1.5';
  } else {
    viewScan.classList.add('hidden');
    viewAdmin.classList.remove('hidden');
    tabAdmin.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-zinc-800 text-white shadow flex items-center gap-1.5';
    tabScan.className  = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-zinc-400 hover:text-white';
    renderRegistry();
  }
}

/* ================================================================== */
/*  Admin Auth & Actions                                                */
/* ================================================================== */

function unlockAdmin() {
  const pin = document.getElementById('adminPinInput').value.trim();
  if (pin === ADMIN_PIN) {
    isAdminUnlocked = true;
    document.getElementById('adminLockBox').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    renderRegistry();
  } else {
    alert('Incorrect PIN. Use 1234 for demo.');
  }
}

function quickUnlockAdmin() {
  document.getElementById('adminPinInput').value = ADMIN_PIN;
  unlockAdmin();
}

function lockAdmin() {
  isAdminUnlocked = false;
  document.getElementById('adminPinInput').value = '';
  document.getElementById('adminLockBox').classList.remove('hidden');
  document.getElementById('adminDashboard').classList.add('hidden');
}

async function addSingleTxn() {
  const rawId   = document.getElementById('newTxnId').value;
  const cleanId = normalizeId(rawId);
  const amount  = document.getElementById('newTxnAmount').value.trim() || '—';
  const note    = document.getElementById('newTxnNote').value.trim()   || 'Counter Entry';

  if (cleanId.length < 6) {
    alert('Please enter a valid Transaction ID or 12-digit UTR.');
    return;
  }

  const list     = loadRegistry();
  const existing = list.find(item => item.id === cleanId);
  if (existing) {
    alert('This Transaction ID already exists in your registry.');
    return;
  }

  list.unshift({
    id:      cleanId,
    amount,
    note,
    claimed: false,
    addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  if (!await saveRegistry(list)) return;
  document.getElementById('newTxnId').value     = '';
  document.getElementById('newTxnAmount').value = '';
  document.getElementById('newTxnNote').value   = '';
}

async function addBulkTxns() {
  const raw    = document.getElementById('bulkTxnInput').value;
  const tokens = raw.split(/[\n,;]+/).map(normalizeId).filter(t => t.length >= 6);
  if (!tokens.length) return;

  const list = loadRegistry();
  let added  = 0;
  tokens.forEach(id => {
    if (!list.some(item => item.id === id)) {
      list.unshift({
        id,
        amount:  '—',
        note:    'Bulk Import',
        claimed: false,
        addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      added++;
    }
  });

  if (!await saveRegistry(list)) return;
  document.getElementById('bulkTxnInput').value = '';
  alert(`Added ${added} new Transaction ID(s).`);
}

async function toggleClaimStatus(id) {
  const list   = loadRegistry();
  const target = list.find(x => x.id === id);
  if (target) {
    target.claimed = !target.claimed;
    saveRegistry(list);
  }
}

async function deleteTxn(id) {
  const list = loadRegistry().filter(x => x.id !== id);
  saveRegistry(list);
}

async function resetDefaultSeed() {
  saveRegistry([...DEFAULT_SEED]);
}

/* ================================================================== */
/*  Admin Registry Render                                               */
/* ================================================================== */

function renderRegistry() {
  const container = document.getElementById('registryList');
  const list      = loadRegistry();

  if (!list.length) {
    container.innerHTML = `<div class="text-center py-6 text-xs text-zinc-500">No Transaction IDs registered yet. Add one above.</div>`;
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
      <div>
        <div class="flex items-center gap-2">
          <span class="mono font-bold text-sm text-white">${item.id}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${item.claimed
            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
            ${item.claimed ? 'Claimed' : 'Unused'}
          </span>
        </div>
        <div class="text-xs text-zinc-400 mt-0.5">${item.amount} &bull; ${item.note} &bull; ${item.addedAt}</div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="toggleClaimStatus('${item.id}')" class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300">
          ${item.claimed ? 'Reset Unused' : 'Mark Claimed'}
        </button>
        <button onclick="deleteTxn('${item.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-semibold text-rose-400">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

/* ================================================================== */
/*  Admin Badge Counter                                                 */
/* ================================================================== */

function updateAdminBadge() {
  document.getElementById('adminCountBadge').textContent = loadRegistry().length;
}

// Expose so firebase.js can call them after each snapshot.
window.updateAdminBadge = updateAdminBadge;
window.renderRegistry   = renderRegistry;

/* ================================================================== */
/*  Image Pre-Processing (sharpens OCR accuracy)                        */
/* ================================================================== */

function preprocessImageForOcr(imgElement) {
  const canvas = document.createElement('canvas');
  const scale  = Math.min(2, 1200 / Math.max(imgElement.naturalWidth, 1));
  canvas.width  = Math.round(imgElement.naturalWidth  * scale);
  canvas.height = Math.round(imgElement.naturalHeight * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

  // Greyscale + simple threshold contrast
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data    = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray       = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrasted = gray > 155 ? 255 : (gray < 95 ? 0 : gray);
    data[i] = data[i + 1] = data[i + 2] = contrasted;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/* ================================================================== */
/*  OCR Text — Candidate Extraction                                     */
/* ================================================================== */

function extractTxnCandidates(ocrText) {
  const found = new Set();

  // 1. Labelled patterns (UPI Ref No, UTR, Order ID, Transaction ID)
  const labeledRegex = /(?:UPI\s*Ref\s*No|UTR|Ref\s*No|Order\s*ID|Transaction\s*ID|Txn\s*ID)[:\s#-]*([A-Za-z0-9]{8,24})/gi;
  let match;
  while ((match = labeledRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[1]));
  }

  // 2. Standard 12-digit UPI UTR numbers anywhere in the receipt
  const twelveDigitRegex = /\b\d{12}\b/g;
  while ((match = twelveDigitRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[0]));
  }

  // 3. Mixed alphanumeric IDs (10–18 chars containing both letters & digits)
  const alphaNumRegex = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,18}\b/g;
  while ((match = alphaNumRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[0]));
  }

  return Array.from(found);
}

/* ================================================================== */
/*  Core Verification Engine                                            */
/* ================================================================== */

async function evaluateVerdict(candidates, rawText = '', elapsedMs = 0) {
  if (!window.registryReady || !window.firebaseStore) {
    alert('Cloud registry not connected yet. Please wait or check your Firestore rules.');
    return;
  }

  const registry  = loadRegistry();
  const lowerText = rawText.toLowerCase();

  // ---- Collect / Request Trap detection ----
  const isRequestTrap =
    lowerText.includes('requested money from you') ||
    lowerText.includes('request received') ||
    (lowerText.includes('decline') && lowerText.includes('ignore this request'));

  if (isRequestTrap) {
    showBigVerdict({
      isReal:    false,
      bigWord:   'FAKE',
      headline:  'Payment Request Trap — NOT Paid!',
      txnId:     candidates[0] || 'COLLECT REQUEST',
      subMeta:   'Screen shows "Requested money from you". Customer has NOT sent money.',
      elapsedMs
    });
    return;
  }

  // ---- Match against Admin Registry ----
  for (const candidate of candidates) {
    const match = registry.find(entry => entry.id === candidate);
    if (match) {
      try {
        const result = await window.firebaseStore.claim(candidate);
        if (result.status === 'missing') continue;
        if (result.status === 'claimed') {
          showBigVerdict({
            isReal:   false,
            bigWord:  'USED',
            headline: 'Duplicate / Already Claimed ID!',
            txnId:    candidate,
            subMeta:  'This registry ID has already been claimed once before.',
            elapsedMs
          });
        } else {
          showBigVerdict({
            isReal:   true,
            bigWord:  'MATCH',
            headline: 'Matched Admin Registry (not bank-confirmed)',
            txnId:    candidate,
            subMeta:  'ID matched an unused registry entry and was marked claimed. Confirm actual receipt in your bank / UPI merchant account.',
            elapsedMs
          });
        }
      } catch (error) {
        alert('Unable to verify with Firestore: ' + error.message);
      }
      return;
    }
  }

  // ---- No match found ----
  showBigVerdict({
    isReal:   false,
    bigWord:  'UNKNOWN',
    headline: candidates.length
      ? 'Transaction ID Not Found in Registry'
      : 'No Valid Transaction ID Detected',
    txnId:   candidates[0] || 'UNREADABLE / NONE',
    subMeta: candidates.length
      ? `Extracted [${candidates.join(', ')}] — none match your Admin Registry.`
      : 'Could not read a valid UTR/Txn ID from screenshot. Use the manual input below.',
    elapsedMs
  });
}

/* ================================================================== */
/*  Verdict Modal                                                       */
/* ================================================================== */

function showBigVerdict({ isReal, bigWord, headline, txnId, subMeta, elapsedMs }) {
  const modal  = document.getElementById('verdictModal');
  const box    = document.getElementById('verdictBox');
  const icon   = document.getElementById('verdictIcon');
  const wordEl = document.getElementById('verdictBigWord');
  const headEl = document.getElementById('verdictHeadline');
  const txnEl  = document.getElementById('verdictTxnDisplay');
  const metaEl = document.getElementById('verdictSubMeta');
  const timeEl = document.getElementById('verdictTimeBadge');

  if (isReal) {
    box.className  = 'animate-verdict w-full max-w-lg rounded-3xl border-4 border-emerald-400 bg-emerald-950 text-emerald-50 p-6 sm:p-8 text-center shadow-2xl shadow-emerald-950/80';
    icon.className = 'w-24 h-24 mx-auto rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center mb-4 shadow-lg';
    icon.innerHTML = `<svg class="w-14 h-14" fill="none" stroke="currentColor" stroke-width="3.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
    wordEl.className = 'text-6xl sm:text-7xl font-black tracking-tight uppercase leading-none mb-2 text-emerald-400';
  } else {
    box.className  = 'animate-verdict w-full max-w-lg rounded-3xl border-4 border-rose-500 bg-rose-950 text-rose-50 p-6 sm:p-8 text-center shadow-2xl shadow-rose-950/80';
    icon.className = 'w-24 h-24 mx-auto rounded-full bg-rose-500 text-white flex items-center justify-center mb-4 shadow-lg';
    icon.innerHTML = `<svg class="w-14 h-14" fill="none" stroke="currentColor" stroke-width="3.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
    wordEl.className = 'text-6xl sm:text-7xl font-black tracking-tight uppercase leading-none mb-2 text-rose-400';
  }

  wordEl.textContent = bigWord;
  headEl.textContent = headline;
  txnEl.textContent  = txnId;
  metaEl.textContent = subMeta;
  timeEl.textContent = elapsedMs ? `${(elapsedMs / 1000).toFixed(2)}s` : 'INSTANT';

  modal.classList.remove('hidden');
}

function closeVerdictAndReset() {
  document.getElementById('verdictModal').classList.add('hidden');
}

/* ================================================================== */
/*  File Upload + Tesseract OCR                                         */
/* ================================================================== */

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const t0           = performance.now();
  const workspace    = document.getElementById('scanWorkspace');
  const statusPill   = document.getElementById('scanStatusPill');
  const previewImg   = document.getElementById('previewImage');
  const candidateList = document.getElementById('candidateList');
  const rawOcrOut    = document.getElementById('rawOcrOutput');

  workspace.classList.remove('hidden');
  statusPill.textContent = 'Scanning OCR...';
  statusPill.className   = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 scanning-bar';
  candidateList.innerHTML = `<span class="text-xs text-zinc-400">Extracting IDs...</span>`;
  rawOcrOut.textContent   = 'Running OCR engine...';

  const reader = new FileReader();
  reader.onload = function(e) {
    previewImg.src = e.target.result;
    previewImg.onload = async function() {
      try {
        const processedDataUrl = preprocessImageForOcr(previewImg);
        const result  = await Tesseract.recognize(processedDataUrl, 'eng');
        const text    = result.data.text || '';
        const elapsed = performance.now() - t0;

        rawOcrOut.textContent = text.trim() || '(No readable text detected)';
        const candidates = extractTxnCandidates(text);

        if (candidates.length) {
          candidateList.innerHTML = candidates.map(c =>
            `<button onclick="verifySingleToken('${c}')" class="mono px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-500/20 border border-zinc-700 text-xs font-bold text-emerald-300">${c}</button>`
          ).join('');
        } else {
          candidateList.innerHTML = `<span class="text-xs text-rose-400">No 12-digit UTR or Txn ID found</span>`;
        }

        statusPill.textContent = `Done in ${(elapsed / 1000).toFixed(2)}s`;
        statusPill.className   = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300';

        evaluateVerdict(candidates, text, elapsed);
      } catch (err) {
        statusPill.textContent = 'OCR Error';
        rawOcrOut.textContent  = 'Error reading image: ' + err.message;
      }
    };
  };
  reader.readAsDataURL(file);
}

/* ================================================================== */
/*  Quick-verify helpers (token button click / manual input)           */
/* ================================================================== */

function verifySingleToken(token) {
  evaluateVerdict([normalizeId(token)], '', 0);
}

function verifyManualInput() {
  const val = normalizeId(document.getElementById('manualTxnInput').value);
  if (!val) return;
  evaluateVerdict([val], '', 0);
}

/* ================================================================== */
/*  Built-in Demo Presets                                               */
/* ================================================================== */

function runDemoSample(type) {
  const t0 = performance.now();
  let simulatedText = '';

  if (type === 'valid_paytm') {
    simulatedText =
      'Paid Successfully\n₹871\nTo Delhivery Limited\nPaid at 03:31 PM, 12 Feb 2024\nOrder ID: u2N9CEP1mD4W\nUPI Ref No: 440995361349';
  } else if (type === 'fake_utr') {
    simulatedText =
      'Paid Successfully\n₹450\nTo Campus Canteen\nUPI Ref No: 998877665544';
  } else if (type === 'gpay_request') {
    simulatedText =
      'Vishu Mad requested money from you\n₹800\nRequest received\nIgnore this request if you have already made this payment outside of Google Pay\nGoogle transaction ID\nCICAgPDTxtWHYA';
  }

  const candidates = extractTxnCandidates(simulatedText);
  const elapsed    = performance.now() - t0;
  evaluateVerdict(candidates, simulatedText, elapsed);
}

/* ================================================================== */
/*  Kick-off — badge is populated once firebase.js fires first snapshot */
/* ================================================================== */
updateAdminBadge();
