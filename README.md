# TruthPay — Snap. Scan. Settle.

### UPI Payment Screenshot Verification System

**TruthPay** is a web-based payment verification application designed to help campus canteens, small businesses, and merchants identify suspicious UPI payment screenshots.

Instead of relying solely on screenshot appearance, TruthPay extracts transaction references and verifies them against a merchant-maintained payment registry to detect unregistered transactions, payment-request traps, and reused receipts.

**Live Website:** https://truthpayinit.netlify.app/

## Problem Statement

**H2 — Fake UPI Payment Screenshot Detector**

During busy hours, merchants often have only a few seconds to verify UPI payments. Fraudulent screenshots, previously used receipts, and misleading payment requests can result in financial losses.

Manually checking every payment slows down operations, while trusting screenshots without verification creates opportunities for fraud.

TruthPay addresses this challenge through a fast, accessible, transaction-reference-based verification workflow.

## Our Solution

**Snap. Scan. Settle.**

1. **Snap:** Upload a UPI payment screenshot.
2. **Scan:** Extract transaction IDs using OCR and check them against the registered payment records.
3. **Settle:** Display a clear verification result with supporting details.

The system also identifies payment-request language and detects transaction IDs that have already been claimed.

## Key Features

- **Screenshot Verification:** Upload payment screenshots for automated text extraction.
- **OCR Integration:** Extract transaction IDs and UTR numbers using Tesseract.js.
- **Transaction Registry:** Maintain received-payment references using Firebase Cloud Firestore.
- **Duplicate Detection:** Identify previously claimed transaction IDs.
- **Collect-Request Detection:** Flag payment-request screens that may be mistaken for completed transactions.
- **Admin Dashboard:** Add, manage, and bulk-import transaction IDs.
- **Manual Verification:** Enter transaction references when screenshots are unclear.
- **Instant Visual Feedback:** Display prominent REAL / FAKE results with explanations.
- **Responsive Interface:** Accessible through desktop and mobile browsers.
- **Demo Scenarios:** Test registered IDs, unregistered IDs, and collect-request examples.

## Our Unique Selling Proposition

### Registry-Anchored Verification with Anti-Replay Protection

TruthPay goes beyond visual-only screenshot analysis by matching extracted transaction references against a merchant-maintained registry.

Our approach combines:

**1. Transaction Reference Matching**

Checks whether an extracted transaction ID exists in the registered payment records.

**2. Collect-Request Detection**

Identifies payment-request language to help distinguish requests from completed payments.

**3. Anti-Replay Protection**

Uses an Unused → Claimed lifecycle to prevent repeated acceptance of the same registered transaction reference.

This approach provides an additional verification layer without depending exclusively on screenshot appearance.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Website structure |
| CSS3 & Tailwind CSS | Responsive interface |
| JavaScript | Application logic |
| Tesseract.js | Optical Character Recognition |
| HTML Canvas API | Image preprocessing |
| Regular Expressions | Transaction ID extraction |
| Firebase Firestore | Cloud transaction registry |
| Firebase Analytics | Application analytics |
| localStorage | Local fallback storage |
| Netlify | Website hosting |

## System Architecture

```text
       UPI Payment Screenshot
                 |
                 v
          Image Upload
                 |
                 v
        Image Preprocessing
                 |
                 v
        Tesseract.js OCR
                 |
                 v
      Transaction ID Extraction
                 |
                 v
       Collect-Request Check
                 |
                 v
       Firebase Admin Registry
                 |
                 v
       Duplicate / Claim Check
                 |
                 v
        Verification Result
```

## How to Run the Project

1. Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
```

2. Open the project folder in Visual Studio Code.

3. Rename the main HTML file to `index.html` if necessary.

4. Use VS Code Live Server or another local development server to run the application.

5. Configure Firebase Cloud Firestore and its access permissions.

6. Open the application in your browser.

**Note:** Firebase requires a configured Firestore database and appropriate security rules. The prototype's default admin PIN is intended for demonstration only and is not secure authentication.

## Current Implementation

Our prototype currently focuses on:

- OCR-based transaction reference extraction.
- Registry-based transaction matching.
- Collect-request identification.
- Duplicate transaction detection.
- Admin-managed transaction records.
- Clear verification results.
- Mobile-responsive website functionality.

## Future Enhancements

To further satisfy the H2 problem statement, we plan to implement:

- Screenshot layout verification for Google Pay, PhonePe, and Paytm.
- Font and pixel inconsistency detection.
- Timestamp anomaly detection.
- Reference datasets of genuine UPI screenshots.
- Verification performance optimization targeting under three seconds on mid-range Android devices.
- Secure Firebase Authentication for administrators.
- Authorized payment-provider integration for independent payment confirmation.

## Important Limitations

TruthPay's current verification results are based on merchant-maintained transaction records, not direct bank settlement confirmation.

A matched transaction ID does not independently prove that money was received. Likewise, an unmatched ID does not necessarily mean a screenshot is fraudulent.

OCR accuracy may vary depending on image quality, and the current prototype does not yet implement all required screenshot-forensic checks.

## Use Cases

TruthPay is designed for:

- Campus canteens
- Small retail shops
- Food stalls
- Local merchants
- High-traffic payment counters

## Project Vision

Our vision is to make digital payment verification more accessible, efficient, and reliable for everyday merchants.

By combining transaction-reference matching, automated text extraction, and anti-replay protection, TruthPay aims to reduce dependence on visual trust and help merchants make more informed payment decisions.

---

### TruthPay — Snap. Scan. Settle.

**Because a payment screenshot should be checked, not blindly trusted.**
