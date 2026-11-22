/**
 * app.js
 * Verity — Enterprise UPI Verification Gateway
 * High-performance OCR, Web Audio Feedback, Firestore Ledger, and Terminal UI
 */

/* ================================================================== */
/*  State & Configuration                                             */
/* ================================================================== */
const ADMIN_PIN = '1234';

window.registryCache = [];
window.registryReady = false;
let isAdminUnlocked  = false;
let audioEnabled     = true;
let currentFilter    = 'all'; // 'all' | 'unused' | 'claimed'

/** Preloaded fallback sample IDs */
const DEFAULT_SEED = [
  { id: '440995361349', amount: '₹871', note: 'Paytm Settlement UTR', claimed: false, addedAt: 'Preloaded' },
  { id: 'U2N9CEP1MD4W', amount: '₹871', note: 'Paytm Order ID', claimed: false, addedAt: 'Preloaded' }
];

/* ================================================================== */
/*  Web Audio Feedback Synthesizer                                    */
/* ================================================================== */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSuccessChime() {
  if (!audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Harmonic double chime (Paytm/Apple Pay style)
    const now = ctx.currentTime;
    
    // Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Note 2 (higher fifth)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (e) {
    console.warn('Audio synthesis error:', e);
  }
}

function playWarningTone() {
  if (!audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(196, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.warn('Audio synthesis error:', e);
  }
}

function toggleAudioFeedback() {
  audioEnabled = !audioEnabled;
  const icon = document.getElementById('soundIcon');
  const label = document.getElementById('soundLabel');
  if (icon) icon.textContent = audioEnabled ? '🔊' : '🔇';
  if (label) label.textContent = audioEnabled ? 'Sound: ON' : 'Sound: OFF';
  showToast(audioEnabled ? 'Audio confirmation alerts enabled' : 'Audio alerts muted');
}

/* ================================================================== */
/*  Toast Notification                                                */
/* ================================================================== */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMsg');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.remove('translate-y-[-150%]', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('translate-y-[-150%]', 'opacity-0', 'pointer-events-none');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 2200);
}

function copyToClipboard(text) {
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${text} to clipboard`);
  }).catch(() => {
    showToast('Failed to copy');
  });
}

/* ================================================================== */
/*  Registry Persistence Helpers                                      */
/* ================================================================== */
function loadRegistry() {
  return [...window.registryCache];
}

async function saveRegistry(list) {
  if (!window.registryReady || !window.firebaseStore) {
    alert('Cloud registry is synchronizing. Please retry in a moment.');
    return false;
  }
  try {
    await window.firebaseStore.replace(loadRegistry(), list);
    return true;
  } catch (error) {
    console.error(error);
    alert('Could not synchronize with Firestore: ' + error.message);
    return false;
  }
}

function normalizeId(str) {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/* ================================================================== */
/*  Navigation & View Switching                                       */
/* ================================================================== */
function switchTab(tab) {
  const viewScan  = document.getElementById('viewScan');
  const viewAdmin = document.getElementById('viewAdmin');
  const tabScan   = document.getElementById('tabScan');
  const tabAdmin  = document.getElementById('tabAdmin');

  if (tab === 'scan') {
    viewScan.classList.remove('hidden');
    viewAdmin.classList.add('hidden');
    tabScan.className  = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition bg-zinc-800 text-white shadow-sm';
    tabAdmin.className = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition text-zinc-400 hover:text-white';
  } else {
    viewScan.classList.add('hidden');
    viewAdmin.classList.remove('hidden');
    tabAdmin.className = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition bg-zinc-800 text-white shadow-sm';
    tabScan.className  = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition text-zinc-400 hover:text-white';
    renderRegistry();
  }
}

/* ================================================================== */
/*  Admin Security Gate & Dashboard                                   */
/* ================================================================== */
function unlockAdmin() {
  const pin = document.getElementById('adminPinInput').value.trim();
  if (pin === ADMIN_PIN) {
    isAdminUnlocked = true;
    document.getElementById('adminLockBox').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    renderRegistry();
    showToast('Admin Ledger unlocked');
  } else {
    alert('Incorrect Master PIN. Use 1234 for demo.');
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
  showToast('Admin Ledger locked');
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
    alert('This Transaction ID is already logged in your registry.');
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
  showToast(`Registered Txn: ${cleanId}`);
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
        note:    'Bulk Settlement Import',
        claimed: false,
        addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      added++;
    }
  });

  if (!await saveRegistry(list)) return;
  document.getElementById('bulkTxnInput').value = '';
  showToast(`Imported ${added} new Transaction ID(s)`);
}

async function toggleClaimStatus(id) {
  const list   = loadRegistry();
  const target = list.find(x => x.id === id);
  if (target) {
    target.claimed = !target.claimed;
    await saveRegistry(list);
    showToast(`Updated ${id} → ${target.claimed ? 'Claimed' : 'Unused'}`);
  }
}

async function deleteTxn(id) {
  if (!confirm(`Remove transaction ${id} from ledger?`)) return;
  const list = loadRegistry().filter(x => x.id !== id);
  await saveRegistry(list);
  showToast(`Deleted ${id}`);
}

async function resetDefaultSeed() {
  await saveRegistry([...DEFAULT_SEED]);
  showToast('Restored default demo benchmark IDs');
}

function setRegistryFilter(filter) {
  currentFilter = filter;
  ['filterAll', 'filterUnused', 'filterClaimed'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const isTarget = 
      (filter === 'all' && btnId === 'filterAll') ||
      (filter === 'unused' && btnId === 'filterUnused') ||
      (filter === 'claimed' && btnId === 'filterClaimed');
    btn.className = isTarget
      ? 'px-2.5 py-1 rounded-lg bg-zinc-800 text-white font-medium'
      : 'px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white font-medium';
  });
  renderRegistry();
}

/* ================================================================== */
/*  Ledger Rendering & Counters                                       */
/* ================================================================== */
function renderRegistry() {
  const container = document.getElementById('registryList');
  if (!container) return;

  const rawList = loadRegistry();
  const search = (document.getElementById('registrySearchInput')?.value || '').toLowerCase().trim();

  // Update Stats
  const unusedCount = rawList.filter(x => !x.claimed).length;
  const claimedCount = rawList.filter(x => x.claimed).length;

  const elTotal = document.getElementById('ledgerStatTotal');
  const elUnused = document.getElementById('ledgerStatUnused');
  const elClaimed = document.getElementById('ledgerStatClaimed');
  if (elTotal) elTotal.textContent = rawList.length;
  if (elUnused) elUnused.textContent = unusedCount;
  if (elClaimed) elClaimed.textContent = claimedCount;

  // Filter list
  let filtered = rawList;
  if (currentFilter === 'unused') filtered = filtered.filter(x => !x.claimed);
  if (currentFilter === 'claimed') filtered = filtered.filter(x => x.claimed);
  if (search) {
    filtered = filtered.filter(x => 
      x.id.toLowerCase().includes(search) || 
      (x.note && x.note.toLowerCase().includes(search)) ||
      (x.amount && x.amount.toLowerCase().includes(search))
    );
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="text-center py-8 rounded-2xl border border-dashed border-white/[0.08] text-zinc-500 text-xs">
        ${rawList.length ? 'No entries match your search/filter.' : 'No transactions logged in ledger yet. Add one above.'}
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-zinc-950/70 border border-white/[0.06] hover:border-white/[0.12] transition">
      <div>
        <div class="flex items-center gap-2.5">
          <span class="mono font-bold text-sm text-white tracking-wide">${item.id}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${item.claimed
            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
            ${item.claimed ? 'Claimed' : 'Unused'}
          </span>
          <button onclick="copyToClipboard('${item.id}')" title="Copy ID" class="text-zinc-500 hover:text-zinc-300 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
        <div class="text-xs text-zinc-400 mt-1 flex items-center gap-2 flex-wrap">
          <span class="text-zinc-200 font-semibold">${item.amount}</span>
          <span class="text-zinc-600">•</span>
          <span>${item.note}</span>
          <span class="text-zinc-600">•</span>
          <span class="text-zinc-500 text-[11px]">${item.addedAt}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <button onclick="toggleClaimStatus('${item.id}')" class="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-[11px] font-semibold text-zinc-300 transition">
          ${item.claimed ? 'Reset Unused' : 'Mark Claimed'}
        </button>
        <button onclick="deleteTxn('${item.id}')" class="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition" title="Delete Entry">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function updateAdminBadge() {
  const count = loadRegistry().length;
  const badge = document.getElementById('adminCountBadge');
  if (badge) badge.textContent = count;
}

window.updateAdminBadge = updateAdminBadge;
window.renderRegistry   = renderRegistry;

/* ================================================================== */
/*  Image Processing & Neural OCR Extraction                          */
/* ================================================================== */
function preprocessImageForOcr(imgElement) {
  const canvas = document.createElement('canvas');
  const scale  = Math.min(2, 1200 / Math.max(imgElement.naturalWidth, 1));
  canvas.width  = Math.round(imgElement.naturalWidth  * scale);
  canvas.height = Math.round(imgElement.naturalHeight * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data    = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray       = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrasted = gray > 150 ? 255 : (gray < 90 ? 0 : gray);
    data[i] = data[i + 1] = data[i + 2] = contrasted;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function extractTxnCandidates(ocrText) {
  const found = new Set();

  // 1. Explicitly labeled identifiers
  const labeledRegex = /(?:UPI\s*Ref\s*No|UTR|Ref\s*No|Order\s*ID|Transaction\s*ID|Txn\s*ID)[:\s#-]*([A-Za-z0-9]{8,24})/gi;
  let match;
  while ((match = labeledRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[1]));
  }

  // 2. Standard 12-digit UPI banking UTR numbers
  const twelveDigitRegex = /\b\d{12}\b/g;
  while ((match = twelveDigitRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[0]));
  }

  // 3. Mixed alphanumeric IDs (Paytm, PhonePe, GPay order formats)
  const alphaNumRegex = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,18}\b/g;
  while ((match = alphaNumRegex.exec(ocrText)) !== null) {
    found.add(normalizeId(match[0]));
  }

  return Array.from(found);
}

/* ================================================================== */
/*  Core Verification Engine                                          */
/* ================================================================== */
async function evaluateVerdict(candidates, rawText = '', elapsedMs = 0) {
  if (!window.registryReady || !window.firebaseStore) {
    alert('Connecting to Firestore mesh... Please try in a second.');
    return;
  }

  const registry  = loadRegistry();
  const lowerText = rawText.toLowerCase();

  // Detect GPay/PhonePe "Requested money from you" collect trap
  const isRequestTrap =
    lowerText.includes('requested money from you') ||
    lowerText.includes('request received') ||
    (lowerText.includes('decline') && lowerText.includes('ignore this request'));

  if (isRequestTrap) {
    playWarningTone();
    showBigVerdict({
      statusType: 'fake',
      bigWord:   'COLLECT SCAM',
      headline:  'Payment Request Trap — NO Funds Sent!',
      txnId:     candidates[0] || 'COLLECT REQUEST',
      subMeta:   'Customer screen displays "Requested money from you". This is an incoming payment request, NOT a completed payment.',
      elapsedMs
    });
    return;
  }

  // Check candidates against Admin Registry
  for (const candidate of candidates) {
    const match = registry.find(entry => entry.id === candidate);
    if (match) {
      try {
        const result = await window.firebaseStore.claim(candidate);
        if (result.status === 'missing') continue;
        
        if (result.status === 'claimed') {
          playWarningTone();
          showBigVerdict({
            statusType: 'used',
            bigWord:  'REPLAY ATTACK',
            headline: 'Transaction ID Already Claimed!',
            txnId:    candidate,
            subMeta:  'This UTR was already scanned and claimed once before. Do not hand over goods twice for the same transaction.',
            elapsedMs
          });
        } else {
          playSuccessChime();
          showBigVerdict({
            statusType: 'real',
            bigWord:  'AUTHENTIC',
            headline: 'Matched Bank Settlement Registry',
            txnId:    candidate,
            subMeta:  `Verified against entry (${match.amount} • ${match.note}). Single-claim token locked. Safe to release goods.`,
            elapsedMs
          });
        }
      } catch (error) {
        alert('Verification error with Firestore: ' + error.message);
      }
      return;
    }
  }

  // No match found in registry
  playWarningTone();
  showBigVerdict({
    statusType: 'unknown',
    bigWord:  'UNVERIFIED',
    headline: candidates.length
      ? 'Transaction ID Not Found in Registry'
      : 'No Valid UPI Reference Detected',
    txnId:   candidates[0] || 'UNREADABLE / NONE',
    subMeta: candidates.length
      ? `Extracted [${candidates.join(', ')}] — none match your bank ledger. High risk of fabricated screenshot.`
      : 'Could not extract a valid 12-digit UTR from screenshot. Use manual lookup below.',
    elapsedMs
  });
}

/* ================================================================== */
/*  Verdict HUD Overlay Controller                                    */
/* ================================================================== */
function showBigVerdict({ statusType, bigWord, headline, txnId, subMeta, elapsedMs }) {
  const modal      = document.getElementById('verdictModal');
  const box        = document.getElementById('verdictBox');
  const iconWrap   = document.getElementById('verdictIconWrapper');
  const iconEl     = document.getElementById('verdictIcon');
  const wordEl     = document.getElementById('verdictBigWord');
  const headEl     = document.getElementById('verdictHeadline');
  const txnEl      = document.getElementById('verdictTxnDisplay');
  const metaEl     = document.getElementById('verdictSubMeta');
  const timeEl     = document.getElementById('verdictTimeBadge');
  const glow       = document.getElementById('verdictAmbientGlow');
  const auditTag   = document.getElementById('verdictAuditTag');

  if (statusType === 'real') {
    // Green Authentic
    box.className = 'animate-pop-in w-full max-w-lg rounded-3xl border-2 border-emerald-500/80 bg-zinc-950/95 text-emerald-50 p-6 sm:p-8 text-center shadow-2xl shadow-emerald-500/20 relative overflow-hidden backdrop-blur-2xl';
    glow.className = 'absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-emerald-500/25';
    iconWrap.className = 'relative w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-5 bg-emerald-500 text-zinc-950 shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-500/20';
    iconEl.innerHTML = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
    wordEl.className = 'text-5xl sm:text-6xl font-black tracking-tight uppercase leading-none mb-2 text-emerald-400';
    auditTag.textContent = 'SECURITY CLEARANCE: VERIFIED AUTHENTIC';
    auditTag.className = 'text-[11px] font-bold tracking-widest uppercase mb-1 text-emerald-400';
  } else if (statusType === 'used') {
    // Amber Used
    box.className = 'animate-pop-in w-full max-w-lg rounded-3xl border-2 border-amber-500/80 bg-zinc-950/95 text-amber-50 p-6 sm:p-8 text-center shadow-2xl shadow-amber-500/20 relative overflow-hidden backdrop-blur-2xl';
    glow.className = 'absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-amber-500/25';
    iconWrap.className = 'relative w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-5 bg-amber-500 text-zinc-950 shadow-xl shadow-amber-500/40 ring-4 ring-amber-500/20';
    iconEl.innerHTML = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="2.75" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    wordEl.className = 'text-5xl sm:text-6xl font-black tracking-tight uppercase leading-none mb-2 text-amber-400';
    auditTag.textContent = 'SECURITY ALERT: DUPLICATE RECEIPT';
    auditTag.className = 'text-[11px] font-bold tracking-widest uppercase mb-1 text-amber-400';
  } else {
    // Rose Fake / Unknown
    box.className = 'animate-pop-in w-full max-w-lg rounded-3xl border-2 border-rose-500/80 bg-zinc-950/95 text-rose-50 p-6 sm:p-8 text-center shadow-2xl shadow-rose-500/20 relative overflow-hidden backdrop-blur-2xl';
    glow.className = 'absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-rose-500/25';
    iconWrap.className = 'relative w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-5 bg-rose-500 text-white shadow-xl shadow-rose-500/40 ring-4 ring-rose-500/20';
    iconEl.innerHTML = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="2.75" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
    wordEl.className = 'text-5xl sm:text-6xl font-black tracking-tight uppercase leading-none mb-2 text-rose-400';
    auditTag.textContent = statusType === 'fake' ? 'CRITICAL FRAUD: COLLECT SCAM' : 'SECURITY WARNING: UNVERIFIED UTR';
    auditTag.className = 'text-[11px] font-bold tracking-widest uppercase mb-1 text-rose-400';
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
/*  Image Pipeline & File Upload Handling                             */
/* ================================================================== */
function processReceiptImage(file) {
  if (!file) return;

  switchTab('scan');

  const t0           = performance.now();
  const workspace    = document.getElementById('scanWorkspace');
  const statusPill   = document.getElementById('scanStatusPill');
  const previewImg   = document.getElementById('previewImage');
  const candidateList = document.getElementById('candidateList');
  const rawOcrOut    = document.getElementById('rawOcrOutput');
  const laser        = document.getElementById('scannerLaser');

  workspace.classList.remove('hidden');
  if (laser) laser.style.display = 'block';

  statusPill.innerHTML = `
    <span class="animate-spin inline-block w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full"></span>
    <span>Extracting tokens with Neural OCR...</span>`;
  statusPill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5';
  
  candidateList.innerHTML = `<span class="text-xs text-zinc-400 animate-pulse">Running image pre-processing & binarization...</span>`;
  rawOcrOut.textContent   = 'Pre-processing image canvas...';

  const reader = new FileReader();
  reader.onload = function(e) {
    previewImg.src = e.target.result;
    previewImg.onload = async function() {
      try {
        const processedDataUrl = preprocessImageForOcr(previewImg);
        const result  = await Tesseract.recognize(processedDataUrl, 'eng');
        const text    = result.data.text || '';
        const elapsed = performance.now() - t0;

        if (laser) laser.style.display = 'none';

        rawOcrOut.textContent = text.trim() || '(No text could be extracted from image)';
        const candidates = extractTxnCandidates(text);

        if (candidates.length) {
          candidateList.innerHTML = candidates.map(c => `
            <div class="inline-flex items-center gap-1.5 p-1 pl-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs">
              <span class="mono font-bold text-emerald-300">${c}</span>
              <button onclick="verifySingleToken('${c}')" class="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold text-[11px] transition">
                Check
              </button>
            </div>
          `).join('');
        } else {
          candidateList.innerHTML = `<span class="text-xs text-rose-400">No standard 12-digit UTR or Order ID detected in image</span>`;
        }

        statusPill.innerHTML = `✓ Analyzed in ${(elapsed / 1000).toFixed(2)}s`;
        statusPill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';

        evaluateVerdict(candidates, text, elapsed);
      } catch (err) {
        if (laser) laser.style.display = 'none';
        statusPill.textContent = 'OCR Engine Error';
        statusPill.className   = 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30';
        rawOcrOut.textContent  = 'Error reading image: ' + err.message;
      }
    };
  };
  reader.readAsDataURL(file);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  processReceiptImage(file);
}

/* ================================================================== */
/*  Drag & Drop Events                                                */
/* ================================================================== */
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('dropzone');
  if (dropzone) dropzone.classList.add('drag-active');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('dropzone');
  if (dropzone) dropzone.classList.remove('drag-active');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('dropzone');
  if (dropzone) dropzone.classList.remove('drag-active');

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    processReceiptImage(files[0]);
  }
}

/* ================================================================== */
/*  Clipboard Direct Paste (Ctrl+V Anywhere)                          */
/* ================================================================== */
window.addEventListener('paste', (e) => {
  // If user is typing in an input or textarea, don't hijack text paste
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea') {
    // Only hijack if an image is being pasted
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        processReceiptImage(file);
        showToast('Pasted screenshot from clipboard');
        e.preventDefault();
        return;
      }
    }
    return;
  }

  const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      processReceiptImage(file);
      showToast('Pasted screenshot from clipboard');
      e.preventDefault();
      return;
    }
  }
});

/* ================================================================== */
/*  Keyboard Shortcuts                                                */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  // Space or Escape closes verdict modal
  if (e.key === 'Escape') {
    closeVerdictAndReset();
  }
  if (e.code === 'Space' && !document.getElementById('verdictModal').classList.contains('hidden')) {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      e.preventDefault();
      closeVerdictAndReset();
    }
  }
});

/* ================================================================== */
/*  Manual Input & Preset Benchmark Demonstrations                    */
/* ================================================================== */
function verifySingleToken(token) {
  evaluateVerdict([normalizeId(token)], '', 0);
}

function verifyManualInput() {
  const val = normalizeId(document.getElementById('manualTxnInput').value);
  if (!val) {
    alert('Please enter a Transaction ID or UTR to verify.');
    return;
  }
  evaluateVerdict([val], '', 0);
}

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

// Initialise
updateAdminBadge();
