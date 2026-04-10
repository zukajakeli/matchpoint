# MatchPoint Table Manager — Developer Documentation

> **Purpose of this document:** Comprehensive reference for anyone maintaining or extending the MatchPoint application. It covers architecture, data flow, pricing logic, Supabase schema, and every source file.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Environment & Configuration](#4-environment--configuration)
5. [Database Schema (Supabase)](#5-database-schema-supabase)
6. [Frontend Routes](#6-frontend-routes)
7. [Application Bootstrap & State Architecture](#7-application-bootstrap--state-architecture)
8. [Hooks](#8-hooks)
9. [Services Layer (Supabase API)](#9-services-layer-supabase-api)
10. [Utilities](#10-utilities)
11. [Components](#11-components)
12. [Pages](#12-pages)
13. [Pricing & Billing Logic](#13-pricing--billing-logic)
14. [Timer System](#14-timer-system)
15. [Multi-Device Sync (Live Timers)](#15-multi-device-sync-live-timers)
16. [Bar / POS Flow](#16-bar--pos-flow)
17. [Bookings System](#17-bookings-system)
18. [Analytics](#18-analytics)
19. [Sound System](#19-sound-system)
20. [Local Storage Schema](#20-local-storage-schema)
21. [Static Assets](#21-static-assets)
22. [Deployment](#22-deployment)
23. [Known Issues & Future Development Notes](#23-known-issues--future-development-notes)

---

## 1. Project Overview

**MatchPoint Table Manager** is a single-page React application built for managing a table-sports venue. It runs entirely in the browser with no custom backend server; all cloud persistence is handled through [Supabase](https://supabase.com).

### Core capabilities

| Capability | Description |
|---|---|
| **Table timer management** | Start, stop, and pay for sessions on 12 tables (ping-pong, foosball, air hockey, PlayStation, custom). Supports standard (count-up) and countdown modes. |
| **Pricing** | Segmented hourly pricing with a configurable sale window; flat rates for foosball/air hockey and fit-pass customers; custom per-session rates for custom timers. |
| **Multi-device sync** | Timer state is mirrored to Supabase and pushed to all connected clients via Realtime WebSockets. |
| **Bar / POS** | A slide-out sidebar lets staff browse the menu and submit bar sales; items and orders are stored in Supabase. |
| **Bookings** | Staff can log upcoming bookings; new bookings trigger toast notifications on all open tabs/devices. |
| **Analytics** | Charts (day-of-week, time-of-day, per-table) built from the `session_history` table. |
| **Menu admin** | Add, edit, delete, and reorder bar menu items with image upload (stored as base64 strings). |
| **Sales settings** | Configurable sale window (hours + discounted rate) stored in localStorage. |

The venue is located in Georgia (UTC+4), and the timezone offset is hard-coded in the billing calculations.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | ^19 |
| Routing | react-router-dom | ^7 |
| Backend / DB | Supabase (PostgreSQL + Realtime) | ^2 (JS client) |
| UI Components | Ant Design (`antd`) | ^5 |
| Charts | Chart.js + react-chartjs-2 | ^4 / ^5 |
| Unique IDs | uuid | ^11 |
| Build tool | Vite | ^6 |
| Lint | ESLint (flat config) | ^9 |
| Deployment | Netlify (SPA redirect via `netlify.toml`) | — |

---

## 3. Repository Structure

```
matchpoint/
├── public/                     # Static assets served at root
│   ├── matchpoint-logo.png
│   ├── favicon.png
│   ├── apple-touch-icon.png
│   ├── nofood.png              # Announcement images for sound buttons
│   ├── nolean.png
│   ├── nofoodtable.png
│   ├── tournament.png
│   └── sound/                  # MP3 files for game-end / notification sounds
│       ├── table[1-8]-end.mp3  # Per-table ping-pong end sounds
│       ├── foosball-end.mp3
│       ├── airhockey-end.mp3
│       ├── playstation-end.mp3
│       ├── payment-success.mp3
│       ├── tournament.mp3
│       ├── nofood.mp3
│       ├── nolean.mp3
│       ├── rules.mp3
│       └── ...
├── src/
│   ├── main.jsx                # React root mount
│   ├── App.jsx                 # Router, global state wiring, 1s interval
│   ├── App.css                 # Global CSS variables + layout
│   ├── config.js               # App-wide numeric constants + localStorage keys
│   ├── hooks/
│   │   ├── useTables.js        # All table state + handlers
│   │   ├── useLiveTimersSync.js# Supabase Realtime sync for timers
│   │   ├── useCart.js          # Bar cart state + submit
│   │   ├── useBookingNotifications.js  # Toast notifications for new bookings
│   │   └── useActiveBookingsCount.js   # Badge count for Bookings nav link
│   ├── services/
│   │   ├── supabaseClient.js   # createClient + isSupabaseConfigured flag
│   │   ├── assertSupabase.js   # Guard that throws if Supabase not configured
│   │   ├── menuItemsApi.js     # menu_items CRUD
│   │   ├── historyApi.js       # session_history + bar_sales insert/select
│   │   ├── liveTimersApi.js    # live_timers fetch/upsert/subscribe
│   │   ├── bookingsApi.js      # bookings CRUD + Realtime
│   │   └── supabaseData.js     # Barrel re-export of all service modules
│   ├── utils/
│   │   ├── utils.js            # formatTime, calculateSegmentedPrice, playSound
│   │   ├── constants.js        # SALE_TYPES, SOUNDS paths
│   │   ├── storage.js          # initializeTables + initializeHistory (entry points)
│   │   ├── storageTables.js    # Default 12-table definitions + localStorage normalisation
│   │   ├── storageHistory.js   # Load + prune session history (today + yesterday only)
│   │   ├── tableBilling.js     # getFinalElapsed, calculateBillingSummary, getClearedState
│   │   ├── tableCardView.js    # Pure view-model: display time, costs, button visibility
│   │   ├── menuOrder.js        # Persist menu item order in localStorage
│   │   └── analyticsCharts.js  # Build Chart.js datasets from session_history rows
│   ├── components/
│   │   ├── HomeDashboard.jsx   # Main grid + sidebar wrapper
│   │   ├── TableCard.jsx       # Individual table card with all controls
│   │   ├── table-card/
│   │   │   └── TableCardUnavailable.jsx
│   │   ├── StartModal.jsx      # Session-start dialog
│   │   ├── start-modal/
│   │   │   └── StartModalContentFields.jsx
│   │   ├── Sidebar.jsx         # Bar menu + Cart slide-out panel
│   │   ├── Cart.jsx            # Cart line items + submit
│   │   ├── ItemCard.jsx        # Single menu item card
│   │   ├── SessionHistory.jsx  # Table of recent completed sessions
│   │   ├── SwitchToggle.jsx    # Ant Design Switch for table availability
│   │   ├── GlobalSoundButtons.jsx  # Rule/announcement sound buttons
│   │   ├── BookingNotifications.jsx # Toast notification stack
│   │   ├── CocktailRecipes.jsx # Static cocktail recipe cards
│   │   └── Analytics.jsx       # Analytics page content
│   │       └── analytics/
│   │           └── MonthlyAnalyticsSection.jsx
│   │   └── menu-admin/
│   │       ├── MenuAdminForm.jsx
│   │       └── MenuItemsList.jsx
│   ├── pages/
│   │   ├── AnalyticsPage.jsx
│   │   ├── SalesSettingsPage.jsx
│   │   ├── MenuAdminPage.jsx
│   │   └── BookingsPage.jsx
│   └── assets/
│       └── react.svg           # Vite template leftover — unused
├── supabase/
│   └── schema.sql              # Full DDL: tables, RLS policies, Realtime, RPC
├── index.html                  # Vite HTML shell + Google Fonts
├── vite.config.js
├── eslint.config.js
├── netlify.toml                # SPA redirect rule
├── .env.example
├── package.json
└── README.md                   # ⚠️ Outdated — describes Google Sheets, not Supabase
```

---

## 4. Environment & Configuration

### `.env` variables

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Both must be prefixed with `VITE_` for Vite to expose them to the browser bundle. Copy `.env.example` to `.env` and fill in values from your Supabase project's API settings.

If either variable is missing, `isSupabaseConfigured` returns `false` and the `supabase` client will be `null`. The app degrades gracefully: tables still work via localStorage only, but Realtime sync, session history uploads, bookings, and bar sales will not function.

### `src/config.js` — App constants

| Constant | Value | Usage |
|---|---|---|
| `HOURLY_RATE` | `16` | Default GEL/hour for standard ping-pong tables |
| `TABLE_COUNT` | `12` | Number of table slots to initialise |
| `LOCAL_STORAGE_TABLES_KEY` | `pingPongTablesData_v2` | Table state cache |
| `LOCAL_STORAGE_HISTORY_KEY` | `pingPongSessionHistory_v1` | Local session history |
| `LOCAL_STORAGE_SALES_SETTINGS_KEY` | `pingPongSalesSettings_v1` | Sale window config |
| `LOCAL_STORAGE_MENU_ORDER_KEY` | `pingPongMenuOrder_v1` | Menu item display order |

> To change the base hourly rate, update `HOURLY_RATE` in `config.js`. This propagates to billing, the footer display, and the view-model cost preview.

---

## 5. Database Schema (Supabase)

Run `supabase/schema.sql` in the Supabase SQL Editor to set up or recreate the schema. The file is idempotent (`CREATE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.).

### Tables

#### `menu_items`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` identity PK | Auto-increment |
| `name` | `text NOT NULL` | Display name |
| `price` | `numeric(10,2)` | GEL, must be ≥ 0 |
| `image` | `text NOT NULL` | Usually a base64 data URL |
| `created_at` | `timestamptz` | Auto-set |

#### `session_history`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `table_id` | `integer` | References table slot (not FK) |
| `table_name` | `text` | Snapshot of name at session end |
| `end_time` | `timestamptz` | When the session ended / countdown expired |
| `duration_played` | `numeric` | Seconds; for countdown = `initialCountdownSeconds` |
| `amount_paid` | `numeric(10,2)` | Calculated GEL amount |
| `session_type` | `text` | `'standard'` or `'countdown'` |
| `created_at` | `timestamptz` | Auto-set |

#### `bar_sales`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `timestamp` | `timestamptz` | Time of sale submission |
| `items` | `text` | JSON-serialised array of `{ name, quantity, price }` |
| `total_amount` | `numeric(10,2)` | Sum of all items |
| `created_at` | `timestamptz` | Auto-set |

#### `live_timers`
One row per table slot. This is the multi-device sync source of truth.

| Column | Type | Notes |
|---|---|---|
| `table_id` | `integer` PK | 1–12 |
| `name` | `text` | Current display name |
| `is_available` | `boolean` | Availability toggle |
| `timer_start_time` | `bigint` | Unix ms when last started (null if stopped) |
| `elapsed_time_in_seconds` | `numeric` | Accumulated elapsed before last start |
| `is_running` | `boolean` | Whether timer is actively running |
| `timer_mode` | `text` | `'standard'` or `'countdown'` |
| `initial_countdown_seconds` | `numeric` | Set only for countdown mode |
| `session_start_time` | `bigint` | Unix ms of session start (for billing window) |
| `session_end_time` | `bigint` | Unix ms when timer was stopped |
| `fit_pass` | `boolean` | Whether FitPass pricing applies |
| `game_type` | `text` | `'pingpong'`, `'foosball'`, `'airhockey'`, `'playstation'`, `'custom'` |
| `hourly_rate` | `numeric` | Custom rate; null means use default `HOURLY_RATE` |
| `sync_revision` | `bigint` | Monotonically increasing; prevents stale overwrites |
| `updated_at` | `timestamptz` | Auto-set by RPC |

#### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `customer_name` | `text NOT NULL` | |
| `tables_count` | `integer` | Must be > 0 |
| `hours_count` | `numeric` | Optional (nullable); must be > 0 if set |
| `booking_at` | `timestamptz` | Scheduled time (optional) |
| `is_done` | `boolean` | Default `false`; set when booking is completed |
| `done_at` | `timestamptz` | When it was marked done |
| `created_at` | `timestamptz` | Auto-set |

### RLS Policies

All five tables have a single catch-all policy (`for all to anon, authenticated using (true) with check (true)`). This means anyone with the anon key can read and write. The app is designed as a **private kiosk** — secure by network/physical access, not auth.

> **Future dev note:** If the app is ever publicly exposed, add Supabase Auth and restrict RLS policies to authenticated users only.

### Realtime

Both `live_timers` and `bookings` are added to the `supabase_realtime` publication. This enables WebSocket push updates.

### RPC: `upsert_live_timers_guarded(payload jsonb)`

Accepts an array of timer rows as JSONB. For each row it does an `INSERT ... ON CONFLICT DO UPDATE`, but the update only fires if the incoming `sync_revision` is **strictly greater than** the stored revision. This prevents an older client from overwriting newer state written by another device.

```sql
-- Only update if incoming revision is newer
where excluded.sync_revision > public.live_timers.sync_revision;
```

---

## 6. Frontend Routes

Defined in `App.jsx` using `react-router-dom` v7:

| Path | Component | Description |
|---|---|---|
| `/` | `HomeDashboard` | Table grid, sidebar, session history |
| `/analytics` | `AnalyticsPage` → `Analytics` | Session charts (lazy-loaded via `Suspense`) |
| `/admin/sales` | `SalesSettingsPage` | Edit sale window hours and discounted rate |
| `/admin/menu` | `MenuAdminPage` | Add/edit/delete/reorder bar menu items |
| `/admin/bookings` | `BookingsPage` | Create and manage bookings |

Navigation links live in the `<header>` of `App.jsx`. The `netlify.toml` `[[redirects]]` rule ensures all paths serve `index.html` so client-side routing works after a hard refresh.

---

## 7. Application Bootstrap & State Architecture

```
main.jsx
  └── App.jsx  (BrowserRouter + all global state)
        ├── useTables()         → tables[], sessionHistory[], modal control, handlers
        │     └── useLiveTimersSync()  → Supabase sync (runs inside useTables)
        ├── useCart()           → cart[], add/remove/submit
        ├── useBookingNotifications()  → notifications[] for toast display
        ├── useActiveBookingsCount()   → number badge for nav link
        └── setInterval(1s)     → drives countdown completion + visual re-render
```

**State is lifted to `App.jsx`** and passed down as props. There is no global state library (no Redux, Zustand, Context API). All table-related state lives in `useTables`; all cart state in `useCart`.

**Persistence:**
- `tables` → `localStorage[pingPongTablesData_v2]` (synced via `useEffect` on every change)
- `sessionHistory` → `localStorage[pingPongSessionHistory_v1]` (same pattern)
- `live_timers` table in Supabase → mirrors table state for multi-device sync

**Initialisation order:**
1. `initializeTables()` loads from localStorage, fills missing tables with defaults.
2. `initializeHistory()` loads from localStorage, pruning entries older than yesterday.
3. `useLiveTimersSync` runs on mount: fetches `live_timers` from Supabase. If remote has rows, merges them into local state. If remote is empty, pushes local state up (first device wins).

---

## 8. Hooks

### `useTables.js`

The most important hook. Owns all table and session state.

**State:**
- `tables` — array of 12 table objects
- `sessionHistory` — array of completed session records (today + yesterday only in memory)
- `showModalForTableId` — which table's start-modal is open (null = closed)

**Handlers:**

| Handler | What it does |
|---|---|
| `openStartModal(tableId)` | Sets `showModalForTableId` |
| `closeStartModal()` | Clears `showModalForTableId` |
| `handleToggleAvailability(tableId)` | Flips `isAvailable` on the table |
| `handleStartTimer(tableId, mode, durationMinutes, options)` | Sets `isRunning=true`, `timerStartTime=Date.now()`, applies mode/fitPass/customName/customRate |
| `handleStopTimer(tableId)` | Accumulates elapsed time, sets `isRunning=false` |
| `handlePayAndClear(tableId)` | Calculates bill, appends to history, resets table, writes to Supabase |
| `handleTransferTimer(fromId, toId)` | Moves all timer state from one table to another (destination must be idle) |

**`handlePayAndClear` in detail:**
1. `getFinalElapsedTimeInSeconds` — adds live running segment to stored elapsed.
2. `calculateBillingSummary` — determines amount based on game type / pricing mode.
3. Creates a `newSessionDetails` object with a `uuidv4()` id.
4. Plays `payment-success.mp3`.
5. Calls `getClearedTableState` — resets the table (custom timers also reset name/rate).
6. Appends the session to local `sessionHistory`.
7. Fires `createSessionHistoryRecord(newSessionDetails)` to Supabase (fire-and-forget with error logging).

---

### `useLiveTimersSync.js`

Keeps `live_timers` in Supabase in sync with local `tables` state.

**On mount:**
1. Fetches all rows from `live_timers`.
2. If remote has data: merges each remote row into local state by comparing `sync_revision`. Remote wins if its revision ≥ local.
3. If remote is empty: pushes local state up via `upsertLiveTimers`.
4. Subscribes to Realtime `postgres_changes` on `live_timers` for `INSERT` and `UPDATE`.

**On remote change (Realtime event):**
- Only updates local state if remote `sync_revision` ≥ local revision (prevents overwriting newer local state with stale broadcast).

**On local `tables` change (debounced):**
- Converts local tables to DB shape.
- Calls `upsert_live_timers_guarded` RPC (or fallback `.upsert()` if RPC is unavailable).
- Increments `sync_revision` by 1 on each push.

---

### `useCart.js`

Manages the bar POS cart.

- `cart` — array of `{ id, name, price, quantity }` items.
- `addToCart(item)` — adds item or increments quantity if already present.
- `incrementQuantity(id)` / `decrementQuantity(id)` — adjust qty (removes if qty reaches 0).
- `removeItem(id)` — removes item from cart.
- `calculateTotal()` — sums `price * quantity`.
- `handleSubmit()` — calls `createBarSaleRecord`, plays payment sound, clears cart.

---

### `useBookingNotifications.js`

Subscribes to Supabase Realtime `INSERT` events on the `bookings` table. For each new booking, adds a toast to `notifications[]` (max 4 visible at once). Toasts auto-dismiss after 6 seconds.

---

### `useActiveBookingsCount.js`

Maintains the number badge on the "Bookings" nav link.

Keeps count fresh via four mechanisms:
1. Initial fetch on mount.
2. Supabase Realtime subscription for inserts/updates/deletes.
3. Custom `bookings:changed` DOM event (fired after any local mutation).
4. `window focus` re-fetch.
5. 5-second polling interval (safety net).

---

## 9. Services Layer (Supabase API)

All Supabase interactions are isolated in `src/services/`. Components and hooks import from the barrel file `supabaseData.js`.

### `supabaseClient.js`

```js
// Exports:
export const supabase          // SupabaseClient instance or null
export const isSupabaseConfigured  // boolean
```

### `assertSupabase.js`

Throws a descriptive error if Supabase is not configured. Called at the top of any function that requires DB access.

### `menuItemsApi.js`

| Function | Description |
|---|---|
| `fetchMenuItems()` | Returns all rows from `menu_items` ordered by `created_at` |
| `insertMenuItem({ name, price, image })` | Inserts a new menu item |
| `updateMenuItem(id, { name, price, image })` | Updates by PK |
| `deleteMenuItem(id)` | Deletes by PK |

### `historyApi.js`

| Function | Description |
|---|---|
| `createSessionHistoryRecord(session)` | Inserts one row into `session_history` |
| `fetchSessionHistoryForAnalytics()` | Selects all rows from `session_history` for chart building |
| `createBarSaleRecord({ timestamp, items, totalAmount })` | Inserts one row into `bar_sales` |

### `liveTimersApi.js`

| Function | Description |
|---|---|
| `fetchLiveTimers()` | Selects all rows from `live_timers` |
| `upsertLiveTimers(tables, syncRevision)` | Tries `upsert_live_timers_guarded` RPC first; falls back to direct `.upsert()` |
| `subscribeToLiveTimerChanges(callback)` | Sets up Realtime channel; calls `callback(row)` on INSERT/UPDATE |
| `mapTableToDbRow(table, syncRevision)` | Converts app table object → DB row shape |
| `mapDbRowToTable(row)` | Converts DB row → app table object |

### `bookingsApi.js`

| Function | Description |
|---|---|
| `fetchActiveBookings()` | Selects bookings where `is_done = false` (or null), ordered by `created_at desc` |
| `createBooking({ customerName, tablesCount, hoursCount, bookingAt })` | Inserts new booking |
| `markBookingDone(id)` | Updates `is_done = true`, `done_at = now()` (falls back to delete on error) |
| `deleteBooking(id)` | Hard deletes a booking |
| `fetchActiveBookingsCount()` | Returns count only (used by badge hook) |
| `subscribeToBookingInserts(callback)` | Realtime channel for INSERT events |
| `subscribeToBookingChanges(callback)` | Realtime channel for all changes (INSERT/UPDATE/DELETE) |

---

## 10. Utilities

### `utils.js`

**`formatTime(totalSeconds)`**
Converts seconds to `HH:MM:SS` or `MM:SS` string.

**`calculateSegmentedPrice({ startTimeMs, endTimeMs, hourlyRate, saleFromHour, saleToHour, saleHourlyRate, timezoneOffsetMinutes })`**

Splits a time range across a configurable sale window and calculates cost:
- Default sale window: 12:00–15:00 local time (UTC+4 / 240 minutes offset).
- Regular segments billed at `hourlyRate`; sale segments at `saleHourlyRate`.
- Returns a string representation of the GEL amount.

**`playSound(src)`**
Creates a new `Audio(src)` and calls `.play()`. Errors are silently swallowed.

**`playTableEndSound(tableId, gameType)`**
Determines which MP3 to play when a session ends:
1. If `gameType` is `foosball`, `airhockey`, or `playstation` → play corresponding sound.
2. If `gameType` is `pingpong` and `tableId` is 1–8 → play `table{id}-end.mp3`.
3. Fallback: generic end sound.

---

### `constants.js`

```js
export const SALE_TYPES = { BAR_SALE: "bar_sale" };
export const SOUNDS = { PAYMENT_SUCCESS: "/sound/payment-success.mp3" };
```

---

### `storage.js`

Entry point exports:
- `initializeTables()` — delegates to `storageTables.js`
- `initializeHistory()` — delegates to `storageHistory.js`

---

### `storageTables.js`

**Default table definitions** (used when localStorage is empty):

| ID | Name | Game Type |
|---|---|---|
| 1–8 | Ping-Pong 1–8 | `pingpong` |
| 9 | Foosball | `foosball` |
| 10 | Air Hockey | `airhockey` |
| 11 | PlayStation | `playstation` |
| 12 | Blank Timer | `custom` |

**`initializeTables()`:**
1. Reads `pingPongTablesData_v2` from localStorage.
2. If present, normalises each row (fills missing fields with defaults, forces correct `gameType`).
3. Pads to `TABLE_COUNT = 12` tables if needed.
4. Sorts by `id` to maintain stable order.
5. If not present or unparseable, returns the default 12 tables.

---

### `storageHistory.js`

**`initializeHistory()`:**
1. Reads `pingPongSessionHistory_v1` from localStorage.
2. Filters out entries older than yesterday (based on `endTime`).
3. Writes pruned list back to localStorage.
4. Returns the pruned list.

The 2-day window prevents localStorage from growing unboundedly. Analytics uses Supabase for longer history.

---

### `tableBilling.js`

The billing engine. Three exported functions:

**`getFinalElapsedTimeInSeconds(table)`**
Returns `elapsedTimeInSeconds` plus any live running segment: `(Date.now() - timerStartTime) / 1000`.

**`calculateBillingSummary({ table, finalElapsedTimeInSeconds, hourlyRate, salesSettingsStorageKey })`**

Priority order for pricing:

1. **Foosball / Air Hockey** → flat `12 GEL/hr` regardless of sale window.
2. **FitPass** → flat `6 GEL per 30 minutes` (i.e., `12 GEL/hr`).
3. **Custom rate** → `table.hourlyRate` (set at session start for custom timers).
4. **Default** → `calculateSegmentedPrice` with sale window from localStorage.

For countdown mode, `durationForBilling = initialCountdownSeconds` (customer paid for that time).  
For standard mode, `durationForBilling = finalElapsedTimeInSeconds`.

Returns `{ durationForBilling, amountToPay, endTimeMsForBilling }`.

**`getClearedTableState(table)`**
Returns a spread of `table` with all timer fields reset to defaults. For `custom` game type, resets `name` to `'Blank Timer'` and clears `hourlyRate`.

---

### `tableCardView.js`

**`getTableCardViewModel(table, hourlyRate, salesSettingsStorageKey)`**

Pure function — no side effects. Returns display-ready data:

| Field | Description |
|---|---|
| `displayTime` | Formatted elapsed or countdown-remaining string |
| `displayCost` | Current running cost in GEL (live estimate) |
| `canStart` | Whether start button should be shown |
| `canStop` | Whether stop button should be shown |
| `canPay` | Whether pay button should be shown |
| `isCountdownEnded` | Whether a countdown timer has expired (shows "TIME'S UP") |
| `extraEquipmentCost` | Extra GEL for ping-pong/PlayStation with `extraEquipment` flag |

---

### `menuOrder.js`

Persists the display order of menu items in `localStorage[pingPongMenuOrder_v1]`.

- `loadMenuOrder()` — returns array of item IDs in saved order.
- `saveMenuOrder(ids)` — writes the ID array.
- `applyOrder(items)` — takes raw DB items and returns them sorted by saved order (new items appended at end).
- `removeFromOrder(id)` — removes a deleted item's ID from saved order.

---

### `analyticsCharts.js`

Builds Chart.js dataset objects from `session_history` rows. Groups sessions by:
- **Day of week** (Mon–Sun play frequency)
- **Hour of day** (0–23 busy hours)
- **Table name** (revenue/sessions per table)

Also calculates average session duration (in minutes).

---

## 11. Components

### `HomeDashboard.jsx`

The main `/` view. Renders:
- A CSS grid of `TableCard` components (one per table).
- Conditionally renders `Sidebar` if `isSidebarOpen`.
- `SessionHistory` — recent completed sessions.
- `CocktailRecipes` — static cocktail reference.
- A link button to `/analytics`.

Props flow down from `App.jsx` — all table handlers and cart state are passed through.

---

### `TableCard.jsx`

Represents one table slot. Uses `getTableCardViewModel` for all display values.

**Rendering logic:**
- If `!table.isAvailable` → renders `TableCardUnavailable` (grayed out, only shows the availability toggle).
- Otherwise renders full card with:
  - Table name and game type badge.
  - Timer display (`displayTime`).
  - Cost preview (`displayCost` in GEL).
  - Start / Stop / Pay buttons (conditionally shown based on view model).
  - Drag-handle: a running table card can be dragged onto an idle table to transfer the session.
  - Sound test button (plays the end sound for this table).

**Drag and drop (timer transfer):**
- `draggable={true}` on running cards.
- `onDragStart` stores source `tableId` in `dataTransfer`.
- `onDrop` on idle cards calls `handleTransferTimer(fromId, toId)`.

---

### `TableCardUnavailable.jsx`

Minimal card: shows table name and an Ant Design `Switch` to re-enable the table.

---

### `StartModal.jsx`

Dialog to configure and start a session on a selected table.

Fields:
- **Mode**: Standard (count-up) or Countdown.
- **Duration** (countdown only): minutes.
- **FitPass** toggle.
- **Extra Equipment** toggle (ping-pong / PlayStation only).
- **Custom name** (custom timer only).
- **Custom hourly rate** (custom timer only).

Validates that countdown mode has a positive duration. Calls `onStart(tableId, mode, durationMinutes, options)`.

---

### `Sidebar.jsx`

A slide-out panel on the right side. Loads `menu_items` from Supabase on mount, applies saved display order via `applyOrder`. Renders `ItemCard` for each item and the `Cart` component at the top.

---

### `Cart.jsx`

Displays cart line items with quantity controls. Shows total in GEL. Submit button calls `handleSubmit` from `useCart`.

---

### `ItemCard.jsx`

A single menu item: image thumbnail, name, price. Clicking calls `addToCart(item)`.

---

### `SessionHistory.jsx`

Renders `sessionHistory` array (from `useTables`) as a table with columns: Table, End Time, Duration, Amount, Type. Newest entries at the top.

---

### `SwitchToggle.jsx`

Thin wrapper around Ant Design `<Switch>` for the table availability toggle.

---

### `GlobalSoundButtons.jsx`

Fixed bar of quick-announce buttons visible on the home dashboard. Each button plays a MP3:
- No Food
- No Leaning
- Tournament announcement
- Rules reminder

---

### `BookingNotifications.jsx`

Renders a stack of toast cards (max 4) in the top-right corner. Each toast shows the booking's customer name and tables count. A dismiss button calls `onDismiss(id)`.

---

### `CocktailRecipes.jsx`

Purely static component displaying cocktail recipe cards with CSS "glass" layering. Not connected to any DB data.

---

### `Analytics.jsx` + `MonthlyAnalyticsSection.jsx`

Fetches all `session_history` rows from Supabase. Groups by calendar month. For each month renders three bar charts:
1. Sessions by day of week.
2. Sessions by hour of day.
3. Revenue by table name.

Also shows average session duration.

---

### `MenuAdminForm.jsx`

Form for adding or editing a menu item:
- Text inputs for name and price.
- File input for image → converts to base64 string via `FileReader`.
- Submit calls `insertMenuItem` or `updateMenuItem`.

---

### `MenuItemsList.jsx`

Draggable list of existing menu items. Drag-and-drop reorder updates `saveMenuOrder`. Edit and delete buttons per item.

---

## 12. Pages

### `AnalyticsPage.jsx`
Lazy-loaded wrapper (via `Suspense` in `App.jsx`) that renders `Analytics`.

### `SalesSettingsPage.jsx`
Form with three fields:
- Sale start hour (e.g., `12`)
- Sale end hour (e.g., `15`)
- Sale rate (GEL/hr, e.g., `12`)

Saves to `localStorage[pingPongSalesSettings_v1]`. Changes take effect on the next billing calculation; no page reload required.

### `MenuAdminPage.jsx`
Combines `MenuAdminForm` and `MenuItemsList`. Manages `menuItems` state locally, loading from Supabase on mount.

### `BookingsPage.jsx`
Create booking form + list of active bookings.

Booking form fields:
- Customer name (required)
- Number of tables (required, integer > 0)
- Number of hours (optional)
- Scheduled time (optional datetime picker)

Active bookings list: customer name, tables, hours, scheduled time, created time.
- "Done" button → calls `markBookingDone`.
- "Delete" button → calls `deleteBooking`.

Stays in sync via Realtime + `bookings:changed` event + polling.

---

## 13. Pricing & Billing Logic

### Standard ping-pong (default)

Uses `calculateSegmentedPrice`:

1. Splits the session time range into segments that fall inside/outside the sale window.
2. Prices each segment at the appropriate rate.
3. Sums them.

**Example:** Session 11:00–14:00, `HOURLY_RATE=16`, sale 12:00–15:00 @ 12 GEL/hr:
- 11:00–12:00 (60 min) @ 16 → 16 GEL
- 12:00–14:00 (120 min) @ 12 → 24 GEL
- **Total: 40 GEL**

### Foosball / Air Hockey

`12 GEL/hr` flat rate, sale window ignored.

### FitPass

`6 GEL per 30 minutes` = `12 GEL/hr` flat rate.

### Custom timer

Staff-entered `hourlyRate` per session. E.g., a corporate booking at a special rate.

### Extra Equipment

An `extraEquipment` flag is stored on the session. The view-model function `getTableCardViewModel` adds a fixed cost on top of the calculated cost for ping-pong / PlayStation tables when this flag is set. (The exact amount is defined inside `tableCardView.js`.)

### Countdown mode billing

The billed duration is always `initialCountdownSeconds` (what the customer paid for), not actual elapsed time. This prevents undercharging if they stop early.

---

## 14. Timer System

### Table object shape (in-memory / localStorage)

```js
{
  id: number,                    // 1–12
  name: string,                  // Display name
  isAvailable: boolean,
  isRunning: boolean,
  timerMode: "standard" | "countdown",
  timerStartTime: number | null, // Date.now() ms when last started
  elapsedTimeInSeconds: number,  // Accumulated time before current segment
  initialCountdownSeconds: number | null,
  sessionStartTime: number | null,
  sessionEndTime: number | null,
  fitPass: boolean,
  extraEquipment: boolean,
  gameType: "pingpong" | "foosball" | "airhockey" | "playstation" | "custom",
  hourlyRate: number | null,
}
```

### 1-second interval (`App.jsx`)

Every second:
1. Checks all running tables.
2. For countdown tables: if `elapsedTimeInSeconds + liveDelta >= initialCountdownSeconds`, marks `isRunning=false`, plays end sound.
3. For any running table: sets a `tick` state to force a re-render (so `TableCard` shows updated time without modifying `tables`).

### Standard mode

- `elapsedTimeInSeconds` accumulates paused time.
- Live display = `elapsedTimeInSeconds + (Date.now() - timerStartTime) / 1000`.
- Stopping adds the live segment to `elapsedTimeInSeconds`.

### Countdown mode

- `initialCountdownSeconds` = total purchased time.
- Live display = `initialCountdownSeconds - (elapsedTimeInSeconds + liveDelta)`.
- Timer auto-stops when remaining ≤ 0.

### Timer transfer (drag-and-drop)

Copies accumulated elapsed, mode, `fitPass`, `hourlyRate`, and `sessionStartTime` to the destination table. Source table is fully reset.

---

## 15. Multi-Device Sync (Live Timers)

The sync logic is in `useLiveTimersSync.js`.

### Sync revision

Every local change increments `sync_revision` by 1. The RPC only applies DB updates when `incoming.sync_revision > stored.sync_revision`. This means:
- If two devices are both running, whichever saves last wins **only if** its revision is higher.
- Stale Realtime events (replayed or delayed) are ignored.

### Bootstrap race condition mitigation

On mount, the hook first reads remote state before writing. If remote rows exist, it merges — never blindly overwrites. If remote is empty (first device), it seeds from local.

### Debounce

Upserts are debounced (typically 300–500ms) to avoid hammering Supabase on rapid state changes (e.g., while the 1s interval runs).

---

## 16. Bar / POS Flow

1. Staff clicks "Open Bar" → `isSidebarOpen = true` → `Sidebar` renders.
2. `Sidebar` fetches `menu_items` from Supabase; applies saved display order.
3. Staff clicks an `ItemCard` → `addToCart(item)` in `useCart`.
4. Staff adjusts quantities in `Cart`, then clicks Submit.
5. `handleSubmit`:
   a. Calls `createBarSaleRecord({ timestamp, items: JSON.stringify(cart), totalAmount })`.
   b. Plays `payment-success.mp3`.
   c. Clears cart.

---

## 17. Bookings System

### Creating a booking
1. Staff fills form on `/admin/bookings`.
2. Calls `createBooking(...)` → inserts into `bookings` table.
3. Realtime INSERT event is broadcast.
4. All open instances of the app (including the home dashboard) receive the event via `useBookingNotifications` and show a toast.

### Completing a booking
- "Done" button calls `markBookingDone(id)`.
- Sets `is_done = true` on the row; fires `bookings:changed` custom DOM event.
- All `useActiveBookingsCount` instances decrement their count.

### Notification lifecycle
- `useBookingNotifications` only subscribes to INSERT events (new bookings, not completions).
- Max 4 toasts visible; 6-second auto-dismiss.
- Manually dismissible via ×.

---

## 18. Analytics

Data source: `session_history` table in Supabase (not localStorage — that only holds 2 days).

`fetchSessionHistoryForAnalytics()` retrieves all rows. `analyticsCharts.js` then:
1. Groups rows by `YYYY-MM` month string.
2. For each month, builds:
   - **Day of week chart**: count of sessions per weekday.
   - **Hour of day chart**: count of sessions per hour (based on `end_time`).
   - **Table revenue chart**: total `amount_paid` per `table_name`.
3. Calculates average `duration_played` in minutes.

`MonthlyAnalyticsSection` renders three `<Bar>` charts using `react-chartjs-2`.

---

## 19. Sound System

All sounds are `.mp3` files in `/public/sound/`.

### Sounds inventory

| File | Trigger |
|---|---|
| `table1-end.mp3` – `table8-end.mp3` | Ping-pong tables 1–8 countdown end |
| `foosball-end.mp3` | Foosball countdown end |
| `airhockey-end.mp3` | Air hockey countdown end |
| `playstation-end.mp3` | PlayStation countdown end |
| `payment-success.mp3` | Session paid / bar sale submitted |
| `nofood.mp3` | "No food" announcement button |
| `nolean.mp3` | "No leaning" announcement button |
| `tournament.mp3` | Tournament announcement button |
| `rules.mp3` | Rules reminder button |

### `playSound(src)`
Creates a fresh `Audio` object each time. Multiple sounds can overlap.

### `playTableEndSound(tableId, gameType)`
Routing logic is in `utils.js`. Game-type sounds take priority over table-specific sounds.

---

## 20. Local Storage Schema

| Key | Format | Pruned? |
|---|---|---|
| `pingPongTablesData_v2` | `JSON.stringify(Table[])` | No (always current state) |
| `pingPongSessionHistory_v1` | `JSON.stringify(Session[])` | Yes — today + yesterday only |
| `pingPongSalesSettings_v1` | `JSON.stringify({ saleFromHour, saleToHour, saleHourlyRate })` | No |
| `pingPongMenuOrder_v1` | `JSON.stringify(number[])` | No |

All keys are versioned (e.g., `_v2`). If the data shape changes in a breaking way, bump the version constant in `config.js` — old data will be ignored and defaults used instead.

---

## 21. Static Assets

| File | Usage |
|---|---|
| `/matchpoint-logo.png` | Header logo |
| `/favicon.png` | Browser tab icon |
| `/apple-touch-icon.png` | iOS home screen icon |
| `/nofood.png` | Image shown on "No Food" sound button |
| `/nolean.png` | Image shown on "No Leaning" sound button |
| `/nofoodtable.png` | Alternative no-food image |
| `/tournament.png` | Tournament announcement image |

---

## 22. Deployment

The app is configured for Netlify deployment.

**`netlify.toml`:**
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
This ensures all client-side routes (e.g., `/admin/bookings`) return `index.html` on hard refresh instead of 404.

**Build command:** `npm run build` (Vite outputs to `dist/`).  
**Publish directory:** `dist`.

**Environment variables** must be set in the Netlify dashboard under Site Settings → Environment Variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 23. Known Issues & Future Development Notes

### README is outdated
`README.md` still describes the original Google Sheets / Apps Script architecture. It references `VITE_APPS_SCRIPT_WEB_APP_URL` which no longer exists. **Update the README** to match the Supabase implementation.

### No authentication
The app uses the Supabase `anon` key with fully open RLS policies. Any person who discovers the deployed URL and anon key can read and write all data. This is acceptable for a private in-venue kiosk on a controlled network. If the URL ever becomes public, add Supabase Auth.

### Images stored as base64 in Postgres
Menu item images are stored as base64 data URLs directly in the `image` text column. For a production deployment with many items, consider using Supabase Storage instead (upload file → store public URL).

### `assets/react.svg`
Leftover from the Vite starter template. Not referenced anywhere — safe to delete.

### History is capped to 2 days in localStorage
This is intentional to prevent unbounded growth. For the analytics page, all history is read from Supabase `session_history`. If Supabase is not configured, the analytics page will show no data.

### `console.log` calls in `useTables.js` and `App.jsx`
Several `console.log` and `console.error` calls are left in production code (particularly around `handlePayAndClear` and the session history `useEffect`). Consider removing or gating behind a `DEBUG` flag before a production release.

### Extra Equipment cost
The `extraEquipment` boolean is stored on the table object and passed to `getTableCardViewModel`, which adds a fixed GEL amount to the displayed cost. However, this additional amount is **not** currently included in the `calculateBillingSummary` result used when calling `handlePayAndClear`. Verify the intended behaviour and ensure billing and display are consistent.

### Sale window settings are device-local
`SalesSettingsPage` saves to localStorage only. If staff change the sale window on one device, other devices will not pick up the change until they also update their settings. Consider storing sale settings in Supabase (a simple `settings` table with a single row) to make them global.

### Timer transfer and countdown billing
When a countdown session is transferred between tables, `sessionStartTime` is carried from the source table. The billing engine uses `sessionStartTime` to determine which part of the sale window the session falls in. Confirm this is the desired behaviour.

### `supabase/schema.sql` is append-only
The schema file contains `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements written incrementally. For a fresh setup, the file works correctly (all statements are idempotent). For a clean documentation of the current schema, consider maintaining a single `CREATE TABLE` statement per table in addition to the migration-style additions.
