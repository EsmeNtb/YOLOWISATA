# YoloWisata Evaluation Suite

This directory contains a small, credible multilingual evaluation suite for the YoloWisata World Bank Small AI Hackathon prototype.

## Important Notices
- **Synthetic Data**: These examples are synthetic hackathon evaluation data. They are NOT World Bank visitor records.
- **Human Review**: These require human review before being called ground truth.
- **Evaluation Only**: They are evaluation data, NOT production training data unless explicitly changed later.

## Supported Languages
- English (`en`)
- Spanish (`es`)
- Bahasa Indonesia (`id`)

## Files & Schemas

### 1. `intent_test.json` (~30 examples)
Tests intent classification for guest messages.
- **Taxonomy**: `booking_request`, `price_question`, `availability_question`, `directions_question`, `activity_question`, `product_interest`, `feedback`, `greeting`.
- **Intended Metrics**: Accuracy, Macro F1.

### 2. `tourism_feedback.json` (~45 examples)
Tests Experience DNA multilabel extraction.
- **Labels (Experience DNA)**: `roast`, `walk`, `host`, `view`, `carve`, `cook`, `tasting`, `food`, `directions`, `beans`, `process`, `stay`, `ship`.
- **Intended Metrics**: Precision, Recall, F1 (per-label and macro average).

### 3. `translation_test.json` (~24 examples)
Tests tourism communication translations across en↔id, en↔es, es↔id.
- **Note**: The reference translation is NOT intended for exact string matching. Semantically equivalent translations should be accepted.
- **Intended Metrics**: Human rating (correct, acceptable, incorrect).

### 4. `voice_listing.json` (~18 examples)
Tests textual extraction from voice transcripts into structured listings.
- **Intended Metrics**: Per-field accuracy, overall field accuracy, missing-field / hallucination checks.

## Known Limitations
- **Language Coverage**: Only covers three languages (EN, ES, ID).
- **Synthetic Limitations**: Does not perfectly capture the noisy spelling/grammar of real-world typing and speech transcripts. Examples are carefully constructed to test specific edge cases, which might not reflect real distribution.
