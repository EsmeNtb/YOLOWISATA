# Phase 5 offline persistence and synchronization preparation

This document is the architecture brief for the next implementation step. It intentionally does not change production behavior. It only describes the minimal, safe offline persistence layer and the exact integration points that later code will use.

## 1. Phase 5 goal

The product rule is:

"Connectivity affects synchronization, not usability."

The intended later behavior is:

1. A user creates a postcard while offline.
2. The postcard appears immediately in the UI.
3. The postcard persists after a page reload.
4. A persistent outbox stores the operation.
5. When connectivity returns, the app sends the existing POST /api/postcards request.
6. Retries reuse the same client UUID / idempotency identifier.
7. Successful sync marks or removes the pending outbox item.
8. Reconnect does not create duplicate postcards.
9. HTTP 4xx errors do not retry forever.
10. Network errors and HTTP 5xx responses remain retryable.
11. Experience DNA continues to use local fallback while backend insights are unavailable.
12. The service worker must not blindly intercept POST requests.

This preparation task is intentionally limited to postcard persistence. Messages and bookings follow the same pattern later, but they are not part of the first implementation.

---

## 2. Offline data model

### 2.1 IndexedDB database

Database name:

- yolowisata-offline

Database version:

- 1

Reason: the database is an app-owned local cache for offline-first user actions. Version 1 is the initial stable schema and allows safe future upgrades via `onupgradeneeded`.

### 2.2 Object stores

The database should contain exactly these stores:

- postcards
- outbox

### 2.3 Primary keys

- postcards: `id`
- outbox: `id`

The `id` for a postcard is the same durable client id used as the idempotency key across retries. Do not create a new identity during sync. The app must reuse the existing postcard id for retries and for the eventual `POST /api/postcards` request.

### 2.4 Useful indexes

`postcards`

- `by_business_id` on `business_id`
- `by_created_at` on `created_at`
- `by_sync_status` on `sync_status`

`outbox`

- `by_status` on `status`
- `by_entity_id` on `entity_id`
- `by_created_at` on `created_at`
- `by_type` on `type`

These are enough to support offline listing, retry ordering, and searching by entity without reading the entire store.

### 2.5 Postcard local schema

The local postcard record should be compact and app-friendly, while remaining compatible with the current legacy payload shape and backend contract.

Suggested record:

```js
{
  id: "m123abc",
  business_id: "noor",
  experience_id: "uuid-or-demo-alias",
  destination_id: "noor",
  traveler_id: "guest-device-id",
  traveler_name: "Ana",
  message: "I loved the roasting experience.",
  country_code: "ID",
  language: "id",
  photo_data: "data:image/jpeg;base64,..." | null,
  audio_data: null,
  background_style: "sun",
  stickers: ["☕", "🌿"],
  consent_for_analysis: false,
  created_at: "2026-10-03T12:00:00.000Z",
  sync_status: "pending"
}
```

Notes:

- `id` is the durable client idempotency key.
- `business_id` should remain the `biz` alias used by the current app logic when relevant.
- `sync_status` is local UX state, not the same as outbox status.
- The postcard can be stored locally even when the backend has not accepted it yet.

### 2.6 Outbox schema

Suggested structure:

```js
{
  id: "op_123",
  type: "postcard.create",
  entity_id: "m123abc",
  payload: {
    id: "m123abc",
    biz: "noor",
    t: "I loved the roasting experience.",
    n: "Ana",
    f: "🇮🇩",
    bg: "sun",
    s: ["☕", "🌿"],
    photo: "data:image/jpeg;base64,..." | null,
    consent_for_analysis: false,
    ts: 1720000000000
  },
  created_at: "2026-10-03T12:00:00.000Z",
  status: "pending",
  attempts: 0,
  last_error: null
}
```

The outbox item is the durable retry record. It is the source of truth for sending the request later.

### 2.7 Sync states

For outbox operations:

- `pending`: ready to send
- `syncing`: in-flight request
- `synced`: successfully acknowledged and cleared from retry queue
- `failed_permanent`: non-retryable error, such as 4xx validation or known client-side invalid payload

The app may also keep a `postcard.sync_status` value such as `pending`, `sent`, or `failed_permanent` for UI clarity, but the authoritative retry decision lives in the outbox item.

### 2.8 Retry behavior

Rules:

- Network errors and HTTP 5xx: retryable.
- HTTP 4xx: not retryable; move to `failed_permanent` and preserve the error for diagnostics.
- For 4xx, keep the record in storage so the user can see it in the UI if needed, but do not loop forever.
- For retryable errors, keep `status` as `pending` and increment `attempts` on each retry.

Suggested flow:

- enqueue -> `pending`
- when flushing -> set `syncing`
- success -> `synced` (then remove the record), or mark local postcard as synced
- retryable failure -> `pending` with `attempts += 1`
- permanent failure -> `failed_permanent`

### 2.9 Idempotency strategy

This is the most important rule for Phase 5.

- The postcard client id that already exists in app state must be reused for all retries.
- The same `id` must be used in:
  - the local postcard record,
  - the outbox `entity_id`,
  - the eventual POST body sent to `/api/postcards`,
  - any dedupe comparison before sending.

Do not generate a fresh postcard id after a failed send. The backend contract already stabilizes idempotency via the client id in the legacy adapter path and the `upsert(..., on_conflict="id", ignore_duplicates=True)` path.

This prevents duplicate postcards when the user reconnects and the same network request is retried.

---

## 3. Application boot behavior

Current boot flow in [frontend/app.js](../frontend/app.js):

- load content from `window.YOLO_CONTENT` or `/api/content` or `/data/content.json`
- apply content to state
- set offline state using `navigator.onLine === false`
- render UI
- call `pull()` and `flush()` when API is configured
- start periodic polling every 8 seconds

Phase 5 preparation should preserve that boot order. Later, the offline layer should hydrate local postcards before or during the render cycle, but should not invalidate the existing local demo state model.

Minimal rule for future integration:

- hydrate local postcards from IndexedDB early,
- merge them into `S.mine` (or equivalent local state),
- keep `status` consistent with the current UI text,
- do not bypass the current `render()` cycle,
- do not change the offline UX model.

### 3.1 Browser online/offline event behavior

Current app behavior:

- `window.addEventListener("offline", ...)`
- `window.addEventListener("online", ...)`
- `setOnline(on)` flips state and updates UI

Later Phase 5 behavior:

- online event triggers run of `flush()` and `pull()`
- offline event should not clear local state
- the app should remain fully usable in airplane mode
- only synchronization should slow down, not the main UX

### 3.2 Manual sync behavior

No automatic sync should be hidden behind a background worker. The minimal app behavior should be:

- on boot, if online and API exists, call `pull()` and then `flush()`
- on online event, call `pull(); flush()`
- on periodic polling, maintain the existing 8-second refresh pattern but keep offline state separate from sync state

The final implementation should not replace the current UI flow. It should only add a local persistence layer and a retry queue for HTTP writes.

### 3.3 Permanent failure behavior

Permanent failures are not retried forever.

Examples:

- 400 invalid payload
- 401/403 forbidden
- 409 duplicate ID already exists
- any app-level validation issue that is not caused by connectivity

In these cases, the outbox item should be marked `failed_permanent`, the error should be recorded, and the system should stop retrying automatically.

### 3.4 Database upgrade/version strategy

Versioning rules:

- start with database version 1
- when adding future stores or fields, bump the version intentionally
- use `onupgradeneeded` to safely create stores and indexes
- do not delete existing stores silently unless that is part of the explicit demo reset path
- if data migration becomes necessary, do it in one controlled upgrade step

### 3.5 Demo reset behavior

The app already has a demo reset action (`A.reset` in [frontend/app.js](../frontend/app.js)). That reset clears the in-memory app state and localStorage state. In Phase 5, the reset path must also clear persisted IndexedDB state so the app does not resurrect local postcards or outbox items after the demo is reset.

This should be a deliberate reset action, not a silent background cleanup.

---

## 4. Exact app.js integration points

The following are the exact existing integration points that later Phase 5 code must touch.

### 4.1 Postcard creation (`A.send`)

Current behavior:

- `A.send` creates a local postcard object with `S.mine.push(...)`.
- It sets `status: st()` where `st()` is `"sent"` if online or `"pending"` if offline.
- It moves the user to the thank-you screen and keeps the card in memory.
- The app later relies on the legacy `outbox()` and `flush()` queue for sync.

Required Phase 5 behavior:

- save the postcard to IndexedDB immediately,
- keep it visible in the UI immediately,
- keep the same idempotent client id,
- store the outbox operation if the user is offline or if the request is queued for retry.

Minimal change:

- add one call to the offline DB helper when a postcard is created,
- call the same helper to insert the outbox record,
- preserve the existing UI and `S.mine` state so the current render logic is unchanged.

Risks:

- duplicate local insertion if both app state and IndexedDB are updated twice,
- creating a new id on each retry instead of reusing the original postcard id,
- mismatch between `status` and outbox state.

### 4.2 `outbox()`

Current behavior:

- `outbox()` produces a queue of pending API payloads for postcards, messages, bookings, listings, and business writes.
- It is already the central serialization of things waiting to send.

Required Phase 5 behavior:

- postcards should be persisted in IndexedDB and not only in memory,
- the queue must be stable across page reloads,
- the queued item should keep the same `entity_id` for retries.

Minimal change:

- leave the public shape of `outbox()` alone,
- add a local database-backed mirror for the postcard outbox entry,
- let the future sync routine read from IndexedDB first and then call the current API.

Risks:

- overloading `outbox()` with storage logic,
- duplicate queue entries from both memory and DB sources,
- mismatched retry semantics when the same entity appears twice.

### 4.3 `flush()`

Current behavior:

- `flush()` sends all queued entries in `outbox()` when `API` is configured and the app is online.
- It uses a local `inflight` map to prevent duplicate sending.

Required Phase 5 behavior:

- postcard flush should read from IndexedDB queue state when reloaded,
- use the same original id on every retry,
- mark `failed_permanent` for 4xx, keep retryable errors in pending state,
- stop writing duplicates for successful sync.

Minimal change:

- no redesign of the API calls,
- only add a local DB wrapper and an error classification layer on top of the current `api` helper logic.

Risks:

- retry loop without a permanent failure path,
- duplicate transmission because the in-memory `inflight` map is reset on reload,
- POST requests re-created with a new ID.

### 4.4 `setOnline(on)`

Current behavior:

- sets `S.online` and updates local state immediately,
- on connection restoration, it marks pending records as sent without real sync confirmation,
- it displays toast messages and can change UI state immediately.

Required Phase 5 behavior:

- online restoration should trigger the outbox flush, not just a local UI update,
- “online” must not collapse all pending state to `sent` unless the network operation actually succeeds,
- offline state should stay safe and usable.

Minimal change:

- treat connection restoration as a trigger only; do not alter the current UX messages beyond the existing toast behavior.
- preserve the current fallback logic while adding real DB-backed queue flushing.

Risks:

- marking records as synced before the HTTP request actually succeeds,
- incorrect behavior when the app is offline but the browser reports online incorrectly.

### 4.5 `boot()`

Current behavior:

- loads content,
- calls `render()`,
- if API configured calls `pull(); flush(); refreshInsights();` and starts polling.

Required Phase 5 behavior:

- hydrate IndexedDB local postcards before reading the app state,
- ensure queued postcard items survive reload,
- keep the existing poll and refresh flow intact.

Minimal change:

- add a short hydration step before render,
- keep polling and sync behavior after hydration.

Risks:

- race conditions between initial render and hydration,
- platform-specific missing IndexedDB availability,
- UI showing stale or duplicated postcards until hydration completes.

### 4.6 Online/offline listeners

Current behavior:

- `window.addEventListener("offline", ...)`
- `window.addEventListener("online", ...)`

Required Phase 5 behavior:

- trigger queue flush and remote pull when online returns,
- maintain a local `sync_status` that is not confused with successful server acceptance,
- keep files and content available offline.

Minimal change:

- add helper calls around the existing event handlers, no rewrite of the event system.

Risks:

- duplicate event handlers,
- repeated attempts while the app is still in a transient offline/online cycle.

### 4.7 Experience DNA fallback

Current behavior:

- `analyse()` computes local postcard and message summary,
- `refreshInsights()` tries the backend when configured and online,
- if backend fails or is offline, it falls back to the on-device analysis.

Required Phase 5 behavior:

- offline local postcards must still contribute to `analyse()` as existing local fallback,
- local DB persistence should not interfere with `S.mine` or `cardsOf` logic,
- backend request failures remain fallback-only.

Minimal change:

- do not alter the fallback logic,
- ensure the postcard stays in `S.mine` and local state after recovery from reload.

Risks:

- a new DB-backed list doubling the same postcard count,
- backend insights not respecting local fallback when offline.

### 4.8 Demo reset

Current behavior:

- `A.reset` resets `S` and clears the current session state.

Required Phase 5 behavior:

- also clear IndexedDB `postcards` and `outbox` records,
- ensure the reset path is deterministic,
- verify the app starts from a clean local cache after reset.

Minimal change:

- call `clearOfflineData()` as part of the reset action.

Risks:

- leaving stale queued postcards behind after the demo is reset,
- confusing the next user with old queued writes.

---

## 5. Service worker review

The current service worker is in [frontend/sw.js](../frontend/sw.js).

### 5.1 Shell/static caching behavior

- It uses a static `VERSION` string.
- It installs a cache containing the key shell files and the content JSON.
- It activates by removing old caches and calling `clients.claim()`.

This is appropriate for app-like shell caching and startup offline behavior.

### 5.2 Navigation strategy

- `navigate` requests use `/index.html` as the app shell.
- `content.json` requests are also cached with a network-first strategy.
- All other non-API GET requests use cached copy first and then network fallback.

This matches the requirement to keep the app usable without internet after first visit.

### 5.3 /api behavior

The service worker intentionally ignores all API requests:

```js
if (r.method !== "GET") return;
if (url.pathname.startsWith("/api/")) return;
```

This is important: it means POST requests are not intercepted and replaced by cached responses. That is the correct behavior for outbox synchronization and avoids a common offline bug where the worker blocks the actual network write request.

### 5.4 Whether POST requests bypass the Service Worker

Yes. The worker does not handle POST requests at all. That is a key safety property for Phase 5 because the outbox sync must call the real `/api/postcards` fetch function rather than a stale or hijacked cached response.

### 5.5 Whether anything could interfere with application-level outbox sync

The worker is intentionally minimal and should not interfere with the app-level outbox. The only risk would be a future change that broadens the fetch interception beyond GET-only requests, or a future rewrite that caches API responses. The current file does not do that, and it is compatible with the planned outbox design.

---

## 6. Acceptance tests for Phase 5

The current Node test environment is not set up for IndexedDB without adding a browser-like polyfill dependency. This task intentionally avoids adding a dependency just for the offline DB helper. The required acceptance tests therefore live in the implementation plan rather than in this repo.

The final Phase 5 implementation must prove all of the following:

1. Offline postcard is saved locally.
2. Offline postcard is immediately visible.
3. Postcard survives reload.
4. Outbox survives reload.
5. Reconnect triggers synchronization.
6. Retry uses the same UUID.
7. Reconnect does not create duplicates.
8. Network failure remains pending.
9. HTTP 5xx remains retryable.
10. HTTP 4xx becomes failed_permanent.
11. Successful sync clears pending state.
12. App remains usable in airplane mode.
13. Experience DNA uses local fallback while offline.
14. Demo reset clears persisted offline data.

### Recommended test strategy

- Unit test the IndexedDB helper with a browser-like shim in a later browser-based run if available.
- Keep the app-level tests in the existing frontend harness style used for Phase 3 and Phase 4 feature checks.
- Validate the retry classification by mocking fetch responses with different HTTP statuses.
- Validate the persistence flow by simulating reload with IndexedDB state kept across script instances.

---

## 7. Implementation notes for the next agent

Keep it small and isolated.

- Add a single IndexedDB helper in [frontend/offline-db.js](../frontend/offline-db.js).
- Keep it free of UI code and app globals.
- Keep the app state and fetch logic in [frontend/app.js](../frontend/app.js) untouched for this prep task.
- Keep the backend API unchanged; do not add new routes or change the existing postcard contract.
- Keep the service worker untouched unless a tiny, isolated bug is found later.

The next implementation should integrate the helper at the postcard creation and retry points only, then extend the same pattern to future message and booking outbox items if needed.

---

## 8. Minimal architecture summary

The future Phase 5 implementation should be very small:

- local IndexedDB cache for postcards and outbox operations,
- one durable outbox queue for retryable writes,
- same client id reused across retries,
- app-level `flush()` remains responsible for sending the current API requests,
- `failed_permanent` is reserved for non-retryable errors,
- service worker stays GET-only so POST requests reach the real network.

This keeps the app usable offline while still respecting the current architecture and the existing product rules.
