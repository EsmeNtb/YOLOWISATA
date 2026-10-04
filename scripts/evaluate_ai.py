import json
import os
import sys
from datetime import datetime

# Insert backend to sys.path so we can import ai
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend import ai

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
eval_dir = os.path.join(base_dir, 'data', 'evaluation')
processed_dir = os.path.join(base_dir, 'data', 'processed')
content_path = os.path.join(base_dir, 'data', 'content.json')

content = load_json(content_path)
themes_lex = {}
for category in ["loved", "asks"]:
    if category in content.get("themes", {}):
        themes_lex.update(content["themes"][category])

def evaluate_experience_dna(dataset_filename):
    data = load_json(os.path.join(eval_dir, dataset_filename))
    label_stats = {}
    all_tp, all_fp, all_fn = 0, 0, 0
    missed_examples = []

    for ex in data:
        expected = set(ex.get("labels", []))
        predicted = set(ai._tags(ex["text"], themes_lex))

        # Track examples with missed labels for human review (where expected is not empty and predicted misses some)
        if expected and not expected.issubset(predicted):
            missed_examples.append({"id": ex["id"], "text": ex["text"], "expected": list(expected), "predicted": list(predicted)})

        all_labels = expected.union(predicted)
        for lbl in all_labels:
            if lbl not in label_stats:
                label_stats[lbl] = {"tp": 0, "fp": 0, "fn": 0}

            if lbl in expected and lbl in predicted:
                label_stats[lbl]["tp"] += 1
                all_tp += 1
            elif lbl in predicted and lbl not in expected:
                label_stats[lbl]["fp"] += 1
                all_fp += 1
            elif lbl in expected and lbl not in predicted:
                label_stats[lbl]["fn"] += 1
                all_fn += 1

    macro_prec, macro_rec, macro_f1 = 0.0, 0.0, 0.0
    valid_labels = 0
    for lbl, stats in label_stats.items():
        tp, fp, fn = stats["tp"], stats["fp"], stats["fn"]
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
        stats["precision"] = prec
        stats["recall"] = rec
        stats["f1"] = f1
        macro_prec += prec
        macro_rec += rec
        macro_f1 += f1
        valid_labels += 1

    if valid_labels > 0:
        macro_prec /= valid_labels
        macro_rec /= valid_labels
        macro_f1 /= valid_labels

    micro_prec = all_tp / (all_tp + all_fp) if (all_tp + all_fp) > 0 else 0.0
    micro_rec = all_tp / (all_tp + all_fn) if (all_tp + all_fn) > 0 else 0.0
    micro_f1 = 2 * micro_prec * micro_rec / (micro_prec + micro_rec) if (micro_prec + micro_rec) > 0 else 0.0

    return {
        "dataset_size": len(data),
        "per_label": label_stats,
        "macro_precision": macro_prec,
        "macro_recall": macro_rec,
        "macro_f1": macro_f1,
        "micro_f1": micro_f1,
        "missed_examples": missed_examples
    }

dna_metrics_standard = evaluate_experience_dna('tourism_feedback.json')
dna_metrics_challenge = evaluate_experience_dna('tourism_feedback_challenge.json')

# B. VOICE/LISTING TEXT EXTRACTION BASELINE
voice_data = load_json(os.path.join(eval_dir, 'voice_listing.json'))
from scripts.listing_evaluation import score_listings
extraction_metrics = score_listings(voice_data, lambda ex: ai.extract_listing(ex["text"]))
total_fields_correct = extraction_metrics["correct_fields"]
total_fields_evaluated = extraction_metrics["evaluated_fields"]
hallucinations = extraction_metrics["hallucinations"]

# C. INTENT BASELINE
intent_data = load_json(os.path.join(eval_dir, 'intent_test.json'))
intent_status = {
    "status": "Intent classifier: not implemented / baseline unavailable",
    "accuracy": None,
    "macro_f1": None
}

# D. TRANSLATION BASELINE
trans_data = load_json(os.path.join(eval_dir, 'translation_test.json'))
lang_dirs = {}
for d in trans_data:
    key = f"{d['source_language']}-{d['target_language']}"
    lang_dirs[key] = lang_dirs.get(key, 0) + 1

trans_status = {
    "status": "Translation is currently implemented via prepared phrases / fixed mappings in frontend only. Requires later model or human evaluation.",
    "total_examples": len(trans_data),
    "counts_by_direction": lang_dirs
}

# E. GENERATED RESULTS
results = {
    "generated_timestamp": datetime.utcnow().isoformat() + "Z",
    "baseline_implementation": "Deterministic regex and keyword matching (backend.ai v0.2)",
    "dataset_counts": {
        "tourism_feedback": dna_metrics_standard["dataset_size"],
        "tourism_feedback_challenge": dna_metrics_challenge["dataset_size"],
        "voice_listing": len(voice_data),
        "intent_test": len(intent_data),
        "translation_test": len(trans_data)
    },
    "experience_dna_standard": {
        "macro_f1": dna_metrics_standard["macro_f1"],
        "micro_f1": dna_metrics_standard["micro_f1"],
    },
    "experience_dna_challenge": {
        "macro_f1": dna_metrics_challenge["macro_f1"],
        "micro_f1": dna_metrics_challenge["micro_f1"],
        "missed_examples": dna_metrics_challenge["missed_examples"]
    },
    "listing_extraction_metrics": extraction_metrics,
    "listing_extraction_baseline": extraction_metrics,
    "intent_status": intent_status,
    "translation_status": trans_status,
    "hallucination_count": hallucinations,
    "known_limitations": [
        "Intent classification is not implemented yet.",
        "Translation relies on fixed client-side phrases, not evaluateable automatically.",
        "Voice listing extraction currently uses simple regexes, lacking robustness to varied phrasing.",
        "Experience DNA relies on keyword matching which fails on synonyms or complex phrasing."
    ]
}

out_path = os.path.join(processed_dir, 'evaluation_results.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

# F. CLI Print
print("============================================================")
print("YoloWisata AI Evaluation Baseline")
print("============================================================")
print(f"Implementation: {results['baseline_implementation']}")
print(f"Experience DNA (Standard) Macro F1: {dna_metrics_standard['macro_f1']:.2f} | Micro F1: {dna_metrics_standard['micro_f1']:.2f}")
print(f"Experience DNA (Challenge) Macro F1: {dna_metrics_challenge['macro_f1']:.2f} | Micro F1: {dna_metrics_challenge['micro_f1']:.2f}")
print(f"Listing Extraction Accuracy: {extraction_metrics['overall_accuracy']:.1%} ({total_fields_correct}/{total_fields_evaluated})")
print(f"Listing Extraction Hallucinations: {hallucinations}")
print(f"Intent Classification: {intent_status['status']}")
print(f"Translation: {trans_status['status']}")
print("============================================================")
print(f"Results saved to: {out_path}")
