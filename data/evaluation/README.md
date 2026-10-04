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
Tests Experience DNA multilabel extraction. This dataset serves as a **synthetic in-domain evaluation**, matching the general phrasing and exact keywords often found in the prototype's demo data.
- **Labels (Experience DNA)**: `roast`, `walk`, `host`, `view`, `carve`, `cook`, `tasting`, `food`, `directions`, `beans`, `process`, `stay`, `ship`.
- **Intended Metrics**: Precision, Recall, F1 (per-label and macro average).

### 3. `tourism_feedback_challenge.json` (~30 examples)
This dataset acts as a **synthetic lexical generalization stress test** for Experience DNA.
- **Purpose**: It was intentionally constructed after inspecting the deterministic keyword vocabulary and reduces lexical overlap with that baseline. Therefore, it is highly useful for exposing keyword-matcher brittleness.
- **Constraints**:
  - It is **NOT** an independent real-world benchmark. It is a synthetic stress test.
  - It must remain **frozen** before evaluating any future Small AI model to ensure honest results.
  - Future model results must be reported on **BOTH** the standard set (`tourism_feedback.json`) and this challenge set.
### 4. `translation_test.json` (~24 examples)
Tests tourism communication translations across en↔id, en↔es, es↔id.
- **Note**: The reference translation is NOT intended for exact string matching. Semantically equivalent translations should be accepted.
- **Intended Metrics**: Human rating (correct, acceptable, incorrect).

### 5. `voice_listing.json` (~18 examples)
Tests textual extraction from voice transcripts into structured listings.
- **Intended Metrics**: Per-field accuracy, overall field accuracy, missing-field / hallucination checks.

## Known Limitations
- **Language Coverage**: Only covers three languages (EN, ES, ID).
- **Synthetic Limitations**: Does not perfectly capture the noisy spelling/grammar of real-world typing and speech transcripts. Examples are carefully constructed to test specific edge cases, which might not reflect real distribution.
