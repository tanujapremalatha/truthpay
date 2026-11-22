# Verity — UPI Transaction ID Verifier

> **Snap quickly. Know in three.**  
> A lightweight, Firebase-backed web app that lets counter staff verify UPI payment screenshots in seconds.

---

## Project Structure

```
verity-website/
├── index.html   – Markup & layout (Tailwind CSS via CDN)
├── style.css    – Custom animations (popIn, pulseScan) & font rules
├── firebase.js  – Firebase init, Firestore live-listener, claim/replace API
└── app.js       – All UI logic, OCR, verification, admin registry
```

---

## Features

| Feature | Description |
|---|---|
| 📷 OCR Scan | Upload / snap a payment screenshot; Tesseract.js extracts UPI Ref / UTR / Order ID automatically |
| ✅ Registry match | Matches extracted IDs against your Firestore-backed Admin Registry |
| 🔒 Claim protection | Each ID can only be matched once (Firestore transaction) — prevents screenshot reuse |
| ⚡ Collect-request trap | Detects "requested money from you" screens and flags them as FAKE immediately |
| 🧑‍💼 Admin panel | PIN-protected panel to add, bulk-import, delete, and reset transaction IDs |
| ☁️ Real-time sync | Multiple devices stay in sync via Firestore `onSnapshot` |

---

## Firebase Config

The project is wired to the **paytruth-f1b03** Firebase project.  
To use your own project, update the `firebaseConfig` object in **`firebase.js`**.

```js
const firebaseConfig = {
  apiKey:            "AIzaSyAe29UH687W7JUjyTa1kdwUUsqoyycQbxY",
  authDomain:        "paytruth-f1b03.firebaseapp.com",
  projectId:         "paytruth-f1b03",
  storageBucket:     "paytruth-f1b03.firebasestorage.app",
  messagingSenderId: "304984434696",
  appId:             "1:304984434696:web:37ca9c555742855ad3c9bd",
  measurementId:     "G-JGT9R1P9TE"
};
```

### Firestore Rules (minimum required)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /verityTransactions/{id} {
      allow read, write: if true; // Tighten this for production!
    }
  }
}
```

---

## Running Locally

Because `firebase.js` is an ES module loaded with `type="module"`, the page **must be served over HTTP** (not opened as a plain `file://` URL).

```bash
# Python (quickest)
cd verity-website
python -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open **http://localhost:8080** in your browser.

---

## Default Admin PIN

```
1234
```

Change the `ADMIN_PIN` constant in `app.js` before deploying to production.

---

## Demo Quick Tests

| Button | Simulated text | Expected result |
|---|---|---|
| 1. Valid Paytm UTR | UTR `440995361349` | **MATCH** (green) — if pre-seeded |
| 2. Unregistered Fake UTR | UTR `998877665544` | **UNKNOWN** (red) |
| 3. GPay Collect Request | "requested money from you" | **FAKE** (red) — collect-trap |
