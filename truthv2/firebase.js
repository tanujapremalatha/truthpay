/**
 * firebase.js
 * Initialises Firebase, connects to Firestore, and exposes
 * window.firebaseStore so app.js can claim / replace entries.
 */

import { initializeApp }         from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ------------------------------------------------------------------ */
/*  Firebase project config                                            */
/* ------------------------------------------------------------------ */
const firebaseConfig = {
  apiKey:            "AIzaSyAe29UH687W7JUjyTa1kdwUUsqoyycQbxY",
  authDomain:        "paytruth-f1b03.firebaseapp.com",
  projectId:         "paytruth-f1b03",
  storageBucket:     "paytruth-f1b03.firebasestorage.app",
  messagingSenderId: "304984434696",
  appId:             "1:304984434696:web:37ca9c555742855ad3c9bd",
  measurementId:     "G-JGT9R1P9TE"
};

/* ------------------------------------------------------------------ */
/*  Initialise                                                         */
/* ------------------------------------------------------------------ */
const app = initializeApp(firebaseConfig);
isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(console.warn);

const db      = getFirestore(app);
const entries = collection(db, "verityTransactions");

/* ------------------------------------------------------------------ */
/*  Public Firestore API (used by app.js)                             */
/* ------------------------------------------------------------------ */
window.firebaseStore = {

  /**
   * Atomically replace the entire registry.
   * Deletes entries that were removed, sets all current ones.
   */
  async replace(previous, next) {
    const batch  = writeBatch(db);
    const nextIds = new Set(next.map(x => x.id));
    for (const item of previous) {
      if (!nextIds.has(item.id)) batch.delete(doc(entries, item.id));
    }
    for (const item of next) {
      batch.set(doc(entries, item.id), item);
    }
    await batch.commit();
  },

  /**
   * Atomically claim a transaction ID.
   * Returns { status: 'missing' | 'claimed' | 'success', item? }
   */
  async claim(id) {
    return runTransaction(db, async tx => {
      const ref  = doc(entries, id);
      const snap = await tx.get(ref);

      if (!snap.exists())    return { status: 'missing' };
      const item = snap.data();
      if (item.claimed)      return { status: 'claimed', item };

      tx.update(ref, { claimed: true });
      return { status: 'success', item };
    });
  }
};

/* ------------------------------------------------------------------ */
/*  Live listener — keeps window.registryCache in sync                */
/* ------------------------------------------------------------------ */
onSnapshot(entries, snapshot => {
  window.registryCache = snapshot.docs.map(d => d.data());
  window.registryReady = true;

  window.updateAdminBadge?.();
  window.renderRegistry?.();

  const status = document.getElementById('firebaseStatus');
  if (status) status.textContent = 'Cloud registry connected ✓';

}, error => {
  console.error('Firestore connection failed:', error);
  const status = document.getElementById('firebaseStatus');
  if (status) status.textContent = 'Cloud registry unavailable — check Firestore rules';
});
