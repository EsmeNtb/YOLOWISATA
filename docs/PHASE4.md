# Phase 4: messages and bookings

The explicit `POST /api/messages`, `/api/bookings`, and `/api/bookingstatus`
routes run before `POST /api/{kind}`. `app.mount("/")` remains last.
Supabase is written first; only a successful write may update `data/store.json`.
`GET /api/sync` still reads the compatibility file. No database, auth, RLS,
index, AI-model, or offline-storage changes are required.

## Message payload

The existing `push()` and `outbox()` functions send:

```json
{
  "id": "message-device-id", "mid": "message-device-id",
  "thread": "noor:gdevice-id", "from": "g", "t": "Boleh cicip kopi lagi?",
  "own": "device-id", "who": "Visitor", "f": "🇮🇩",
  "ts": 1791000000000, "sync": "sent"
}
```

Owner replies have `from: "b"`; prepared replies also carry `en`.
`own` identifies the sending device, **not** necessarily the traveler (an owner
reply has the owner's device). It is never used as a Supabase auth ID.

| Input | Database mapping |
|---|---|
| `id` (or `mid` when `id` is absent) | Native UUID unchanged; otherwise UUIDv5 of `yolowisata:messages:<id>` |
| `thread` business prefix | Business UUID, or exact unique `Noor Coffee Farm` resolution for `noor` |
| `thread` traveler suffix | Anonymous traveler identity, then a conversation |
| `t` | `original_text` |
| `from`: `g`, `b`, `sys` | `sender_type`: `traveler`, `business`, `system` |
| `l`, when supplied | `original_language`; otherwise `und` |
| `en`, when supplied | `translated_text`, with `translated_language: en` |
| `ts` milliseconds | `created_at` UTC |
| `f` | Valid country flag becomes anonymous traveler's `country_code` |
| `own`, `who`, `mid`, `sync`, other UI fields | Compatibility copy only |

Native column names take precedence over legacy aliases. Native callers may
provide `conversation_id`, `traveler_id`, `business_id`, `sender_id`, language
and translation columns, `detected_intent`, `intent_confidence` (0–1),
`message_type`, `audio_path`, `created_at`, and `synced_at`. Explicit profile
references must exist. No sender profile is created or inferred. Text is required;
audio-only ingestion is outside this phase.

The frontend overwrites its prepared question's `id` translation with the message
ID when building the outbox; that discarded translation cannot be reconstructed
at the backend. Free text language is not inferred from a country flag.

## Anonymous travelers and conversations

`traveler_profiles.user_id` is nullable in the existing schema. Anonymous rows
therefore have `user_id: null`; no `profiles` or `auth.users` rows are created.

- `thread: <business>:g<device>` maps to anonymous key `device:<device>`.
- Booking `gid` maps to the same key, allowing messages and bookings to share
  one anonymous traveler.
- Other demo thread tokens, such as `noor:camille`, map to
  `thread:<resolved-business-UUID>:<token>` and stay business-scoped.
- Anonymous traveler IDs are UUIDv5 of
  `yolowisata:anonymous-travelers:<key>`.
- Explicit traveler UUIDs reference existing traveler profiles and take precedence.
- A native existing conversation UUID is used after checking any supplied business
  and traveler relationships. A new explicit conversation UUID requires resolvable
  business and traveler relationships.
- Without an explicit conversation UUID, an existing unique business/traveler pair
  is reused. Multiple matches return HTTP 400. Otherwise the ID is UUIDv5 of
  `yolowisata:conversations:<business-UUID>:<traveler-UUID>`.

Primary-key upserts with `ignore_duplicates=True` make retries converge on the
same rows. Newly persisted visitor messages already match the Phase 2 insights
adapter, including Indonesian country segmentation; `ai.analyse()` is unchanged.

## Booking payload

The booking action retains its existing fields and adds `visit_date` directly
from the date input, before formatting `date` for display:

```json
{
  "id": "kdevice-booking-id", "gid": "device-id", "biz": "noor",
  "who": "Visitor 🇮🇩", "date": "Sat 10 Oct", "visit_date": "2026-10-10",
  "time": "09:00", "people": 2, "status": "pending",
  "ts": 1791000000000, "sync": "sent"
}
```

| Input | Database mapping |
|---|---|
| `id` | Native UUID unchanged; otherwise UUIDv5 of `yolowisata:bookings:<id>` |
| `experience_id` | Valid active experience; checked against any supplied business |
| `biz` / `business_id`, without experience | Exactly one active experience required; zero/multiple returns HTTP 400 |
| `traveler_id` or `gid` | Existing native traveler or anonymous device traveler |
| `visit_date`, else ISO `date` | `visit_date`; yearless display dates return HTTP 400 |
| `visit_time`, else `time` | `visit_time` |
| `party_size`, else `people` | Positive integer `party_size` |
| `status` | Mapping below |
| `notes` | `notes` |
| `created_at`, else `ts` milliseconds | Initial `created_at`; status retries do not replace it |
| `date` display text, `who`, `sync`, `gid` | Preserved in the compatibility payload |

The original UI resubmits the **whole booking** when an owner decides on a
booking in `S.bookings`. This route therefore inserts once and updates status on
subsequent submissions. Changed experience, traveler, date, time, party size, or
notes under an existing ID returns HTTP 409, rather than silently replacing it.

## Status and retry behavior

`POST /api/bookingstatus` takes `{id, status, ts?}` and never creates a missing
booking. Malformed identifiers/statuses return HTTP 400; unknown IDs return 404.

The UI vocabulary is `pending`, `confirmed`, `declined`. `declined` maps to
Supabase `rejected` and maps back to `declined` in the compatibility copy.
Native schema statuses `rejected`, `cancelled`, and `completed` are also accepted.

Updates filter by one booking UUID and its current `revision`; successful status
changes increment that revision. Same-status retries do not change the row.
Pending request retries cannot undo an owner decision. Older client timestamps
are ignored across both legacy booking buckets. A native UUID status update also
updates any matching legacy booking copy so the existing poller sees the decision.

## Limits of this compatibility phase

- Old locally saved bookings with only a yearless display date must be recreated
  with an explicit date. Guessing a year could book the wrong visit.
- Bundled sample bookings such as `noor-b1` are not database bookings. Status
  changes return 404 until an actual booking exists; no sample booking is invented.
- Unmapped demo businesses still return 400; only `noor` has an established alias.
- Native-only records are not automatically projected into the legacy UI feed.
- Multi-table writes are not transactional through these REST calls. A failure
  can leave an anonymous traveler/conversation, but never a legacy message or
  booking mirror. A retry reuses those support rows.
- Legacy client-timestamp ordering depends on the retained compatibility file and
  this server's lock. It is not a distributed offline conflict-resolution system.
- Anonymous identifiers are compatibility identities, not authenticated identities.
  Existing authentication behavior is unchanged.

## Validation

```text
python -m unittest discover -s tests -v
node tests/test_phase3_frontend.js
node tests/test_phase4_frontend.js
python -m compileall -q backend tests
node --check frontend/app.js
git diff --check
```

The Phase 2 compatibility fixture now supplies the frontend's `gid` and its fake
database contains a bookings table. Existing Phase 2 assertions and Phase 3 tests
are retained. The opt-in Phase 2 live checker exercises the remaining generic
listing/business routes in its temporary store; Phase 4 message/booking writes
and cleanup are covered by the new live checker.

Opt-in live acceptance:

```text
python tests/check_phase4_live.py --write --windows-trust
```

`--windows-trust` uses the already installed pip truststore helper for that test
process where needed. TLS verification stays enabled. The script creates two
synthetic messages, one booking, one conversation, and one anonymous traveler.
It verifies ID absence before writing, deletes exact IDs in `finally` (including
partial failures), checks their absence afterward, and compares all existing
postcards to an untouched snapshot. Its legacy store is a temporary file.
