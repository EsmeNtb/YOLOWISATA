# YoloWisata Database

YoloWisata uses Supabase PostgreSQL for shared online data
and IndexedDB for offline device storage.

## Architecture

Browser/PWA
    ↓
IndexedDB
    ↓
FastAPI
    ↓
Supabase PostgreSQL

## Main tables

- businesses
- experiences
- postcards
- messages
- bookings
- ai_analysis_runs
- ai_insight_evidence

## Offline strategy

Records are created locally first.

When a connection becomes available, pending records are
synchronized with the backend.

This follows a store-and-forward architecture.

## AI traceability

Every important AI analysis is stored in `ai_analysis_runs`.

Supporting evidence is stored in `ai_insight_evidence`.

The AI does not automatically modify a business.
The operator makes the final decision.