# DokanWala (দোকানওয়ালা) — Design System & Bangla-First UX Specification

> **High-Priority Mandate:** Bangla language support is a primary architectural pillar, not an afterthought. Every screen, button, number, date, search query, error message, receipt, and export must feel natural, effortless, and crisp for a Bangladeshi shopkeeper.

---

## 1. High-Priority Bangla Language Architecture

### 1.1 Localization Framework (`i18next` + `react-i18next`)
- **Default Language:** `bn` (Bangla), with instant runtime switching to `en` (English) from **Login** and **Settings** (no app restart required).
- **Typed Translation Namespaces:** Split cleanly by domain to keep files focused:
  - `common`, `auth`, `dashboard`, `pos`, `products`, `inventory`, `purchases`, `expenses`, `customers`, `suppliers`, `reports`, `settings`, `errors`.
- **Natural Bangladeshi Retail Terminology (not robotic literal translations):**
  - Credit sale = `বাকি বিক্রি` (`Due / Baki`)
  - Collection = `বাকি আদায়` (`Collect Due`)
  - Cashbook = `ক্যাশবুক / নগদ হিসাব`
  - Wastage/Spoilage = `নষ্ট / পচনশীল ক্ষতি`
  - Purchase stock = `মাল কেনা / ক্রয়`
  - Gross Profit = `মোট লাভ`, Net Profit = `নিট লাভ`
  - bKash = `বিকাশ`, Nagad = `নগদ`, Cash = `নগদ টাকা`

### 1.2 Typography & Font Bundling (Critical for Bengali Script)
Android OEMs (Walton, Symphony, Tecno, Xiaomi, Samsung) ship inconsistent system Bengali fonts that sometimes clip vowel marks (`কার` / `ফলা`) or break conjuncts (`যুক্তবর্ণ`).
- **Bundled Fonts via `expo-font`:**
  - **`Noto Sans Bengali`** (`Regular`, `Medium`, `SemiBold`, `Bold`) for all Bangla UI text.
  - **`Inter`** (`Regular`, `Medium`, `SemiBold`, `Bold`) for English text & clean tabular numerals when Latin digits are selected.
- **Line-Height Safety Rule:** Bengali ascenders/descenders (`ু`, `ূ`, `ৃ`, `ী`, `ৈ`, `্য`) clip vertically if `lineHeight` matches English `1.2x`. Every Bengali text token enforces **`lineHeight >= 1.45 * fontSize`** and adequate vertical padding inside `Button`, `Badge`, and `Input` primitives.

### 1.3 Bangla Numerals, Currency (`৳`) & Date Formatting (Hermes-Safe)
React Native on Android (Hermes) can have inconsistent `Intl.NumberFormat('bn-BD')` behavior across older OS builds. Therefore, `packages/shared` implements a **deterministic, unit-tested formatter** independent of device ICU bugs:
- **South Asian Grouping (Lakh / Crore):** `125000` -> `৳ ১,২৫,০০০` (or `৳ 1,25,000` if English digit mode is chosen).
- **Digit Display Preference:** User-selectable in Settings (`বাংলা সংখ্যা (১২৩)` vs `English Digits (123)`), defaulting per user sign-off.
- **Bangla Keyboard Numeric Input Normalizer (Crucial UX!):**
  - If a shopkeeper uses Ridmik/Gboard Bangla keyboard and types `২৫০.৫০` or `১২৫`, `NumericInput` automatically normalizes Bangla digits `০-৯` -> ASCII `0-9` and `।` -> `.` before Zod validation & state updates! Typing numbers NEVER silently fails on a Bangla keyboard.
- **Bangla Dates (`Asia/Dhaka`):** Formats like `১২ নভেম্বর ২০২৬` or `আজ, সকাল ১০:৩০` using deterministic month/weekday dictionaries.

### 1.4 Bilingual Search & Exports
- **Unicode NFC Normalization:** Both search queries and indexed Bangla product names normalize to `NFC` so decomposed vs composed characters (`য়` vs `য+়`) always match accurately.
- **Dual-Field Matching:** Typing either `"পান"` or `"Pan"` matches `{ nameBn: "রাজশাহীর পান", nameEn: "Rajshahi Pan" }`.
- **Bangla Exports & Receipts:**
  - **Receipts:** Clean Bangla layout (Shop Name, Address, Receipt No, Date, Item list with unit e.g. `২৫০ গ্রাম`, Subtotal, Discount, Paid, Due `বাকি`, Thank You message).
  - **CSV Export:** Prepends UTF-8 BOM (`\uFEFF`) so Windows Excel opens Bangla text cleanly without garbled characters.
  - **PDF Export:** Embeds `Noto Sans Bengali` font subset so Bangla reports never show empty boxes (`□□□`).

---

## 2. Visual Design System Tokens

Designed for calm legibility in bright/dim shop lighting without distracting gradients or visual clutter:

### 2.1 Color Palette (High Contrast, Accessible)
| Token | Hex | Usage |
|---|---|---|
| `primary` | `#0F766E` | Primary actions, active tab, main CTA (`বিক্রি সম্পন্ন করুন`) |
| `primaryPressed` | `#115E59` | Touch feedback state |
| `primarySoft` | `#CCFBF1` | Selected category pills, active highlights |
| `background` | `#F8FAFC` | Screen canvas (off-white reduces eye strain) |
| `surface` | `#FFFFFF` | Cards, POS tiles, bottom sheets |
| `border` | `#E2E8F0` | Subtle 1px card/input dividers |
| `textPrimary` | `#0F172A` | Primary headings & numbers (`>= 12:1` contrast) |
| `textSecondary` | `#475569` | Labels, units, timestamps |
| `success` | `#15803D` (`#DCFCE7` bg) | Paid, synced, positive profit |
| `warning` | `#B45309` (`#FEF3C7` bg) | Low stock, pending sync |
| `danger` | `#B91C1C` (`#FEE2E2` bg) | Due (`বাকি`), wastage loss, destructive confirm |

### 2.2 Typography Scale (Bangla-Safe Line Heights)
| Role | Size | Line Height | Weight | Example Usage |
|---|---|---|---|---|
| `kpiHero` | `26px` | `36px` | Bold | Dashboard today's sales `৳ ৪,৮৫০` |
| `screenTitle` | `20px` | `30px` | Bold | Screen headers (`নতুন বিক্রি`) |
| `sectionTitle` | `17px` | `26px` | SemiBold | Card headers |
| `body` | `15px` | `23px` | Regular | Lists, product names, inputs |
| `caption` | `13px` | `20px` | Medium | Units (`প্রতি কেজি`), badges, stock count |

### 2.3 Spacing, Radius & Ergonomics
- **Grid:** 4px base (`4, 8, 12, 16, 20, 24`).
- **Touch Targets:** Minimum **`48dp × 48dp`** for all buttons, +/- quantity steppers, and list rows (critical for quick one-handed counter taps!).
- **Border Radius:** Cards `12px`, Buttons/Inputs `10px`, Pills `999px`.
- **Small Screen Support:** Tested down to `360dp` width (common budget Android phones in Bangladesh) with `SafeAreaView` and `KeyboardAvoidingView` on all forms/modals.

---

## 3. Navigation Architecture (5 Clean Bottom Tabs)

```text
┌────────────────────────────────────────────────────────────────┐
│  [দোকানওয়ালা]                   [● সিঙ্ক করা আছে] [BN/EN]      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Main Screen Content (Large readable cards, minimal typing)    │
│                                                                │
├──────────┬──────────┬──────────┬──────────┬────────────────────┤
│   হোম    │  বিক্রি   │   পণ্য   │  রিপোর্ট  │       আরও         │
│  (Home)  │  (POS)   │(Products)│(Reports) │      (More)        │
└──────────┴──────────┴──────────┴──────────┴────────────────────┘
```

1. **হোম (Home):** Today's summary KPIs (Sales, Gross Profit [Owner], Expenses, Net Profit [Owner], Customer Dues, Low-Stock count), 5 Quick Action buttons (`নতুন বিক্রি`, `পণ্য যোগ`, `মাল কেনা`, `খরচ যোগ`, `বাকি আদায়`), Recent Transactions.
2. **বিক্রি (Sales / POS):** Search + category chips + frequent items grid -> tap adds directly to bottom cart bar -> unit selector (`টি` / `বিড়া` / `গ্রাম` / `কেজি`) -> Checkout bottom sheet (Discount, Cash / bKash / Nagad / Split / Credit `বাকি`) -> Instant Bangla Receipt!
3. **পণ্য (Products & Stock):** Active catalog, low-stock filter pill, quick stock adjust / wastage entry, product create/edit with unit conversion builder.
4. **রিপোর্ট (Reports):** Clean period switcher (`আজ`, `এই সপ্তাহ`, `এই মাস`, `কাস্টম`) -> Sales, Best Sellers, P&L, Cashbook, Inventory Valuation, Customer/Supplier Dues + CSV/PDF Export.
5. **আরও (More):** Customers (`বাকি খাতা`), Suppliers & Purchases, Expenses, Cashbook Open/Close, Sync Queue & Conflicts, Shop & Language Settings, Security/PIN, Backup/Restore.

---

## 4. Reusable Component & State Standards

Every screen MUST implement consistent, humane states:
- **`LoadingView`:** Clean skeleton cards / centered spinner with localized label (`লোড হচ্ছে...`).
- **`EmptyState`:** Clear icon + Bangla message + primary CTA (e.g., `"এখনো কোনো পণ্য যোগ করা হয়নি"` -> `[পণ্য যোগ করুন]`).
- **`ErrorState`:** Non-technical explanation + `[আবার চেষ্টা করুন]` retry action.
- **`ConfirmDialog`:** Mandatory explicit confirmation for destructive/irreversible actions (sale cancellation, wastage recording, product archive, restore backup).
- **`UnitQuantityPicker`:** Quick preset chips (`২৫০ গ্রাম`, `৫০০ গ্রাম`, `১ কেজি`, or `+১ / +৫ / +১০ টি`) to eliminate repetitive typing at the counter!
