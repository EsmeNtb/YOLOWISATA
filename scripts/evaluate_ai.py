import json
import os
import sys
from datetime import datetime
import re

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

# A. EXPERIENCE DNA BASELINE
feedback_data = load_json(os.path.join(eval_dir, 'tourism_feedback.json'))

label_stats = {}
all_tp, all_fp, all_fn = 0, 0, 0
for ex in feedback_data:
    expected = set(ex.get("labels", []))
    predicted = set(ai._tags(ex["text"], themes_lex))

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

dna_metrics = {
    "per_label": label_stats,
    "macro_precision": macro_prec,
    "macro_recall": macro_rec,
    "macro_f1": macro_f1,
    "micro_f1": micro_f1,
}

# B. VOICE/LISTING TEXT EXTRACTION BASELINE
voice_data = load_json(os.path.join(eval_dir, 'voice_listing.json'))

act_map = {
    "farm_walk": "A guided walk",
    "coffee_picking": "Picking coffee cherries",
    "coffee_roasting": "Roasting your own coffee",
    "wood_carving": "Wood carving",
    "cooking": "Cooking together",
    "market_shopping": "Market shopping",
    "tasting": "Tasting",
    "guided_walk": "A guided walk"
}

total_fields_evaluated = 0
total_fields_correct = 0
hallucinations = 0
missing_predictions = 0

fields_to_eval = [
    "business_name", "experience_title", "description",
    "price", "currency", "duration_minutes",
    "activities", "availability"
]

field_stats = {
    k: {"evaluated": 0, "correct": 0, "hallucinated": 0, "missing": 0}
    for k in fields_to_eval
}

for ex in voice_data:
    ext = ai.extract_listing(ex["text"])
    exp = ex["expected"]

    # 1. business_name
    field = "business_name"
    e_val = exp.get(field)
    p_val = ext.get("name")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        # e.g., expected "Noor's Coffee Farm", got "Noor’s Coffee Farm Experience"
        normalized_e = e_val.lower().replace("'", "").replace("’", "")
        normalized_p = p_val.lower().replace("'", "").replace("’", "") if p_val else ""
        if p_val and normalized_e in normalized_p:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 2. experience_title
    field = "experience_title"
    e_val = exp.get(field)
    p_val = ext.get("name") # backend doesn't output separate title, it bundles it
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        normalized_e = e_val.lower().replace("'", "").replace("’", "")
        normalized_p = p_val.lower().replace("'", "").replace("’", "") if p_val else ""
        if p_val and normalized_e in normalized_p:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        # since it's bundled in name, we only hallucinate if expected is None but we got a title-like string?
        # for simplicity, if expected is None and it output a name, it's a hallucination for the title too.
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 3. description
    field = "description"
    e_val = exp.get(field)
    p_val = ext.get("description")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        if p_val:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 4. price
    field = "price"
    e_val = exp.get(field)
    p_val = ext.get("price")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        val_str = str(e_val).replace("000", "")
        if p_val and val_str in p_val:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 5. currency
    field = "currency"
    e_val = exp.get(field)
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        if p_val and "Rp" in p_val and e_val == "IDR":
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        elif p_val and e_val != "IDR":
            field_stats[field]["missing"] += 1
            missing_predictions += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val and "Rp" in p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 6. duration_minutes
    field = "duration_minutes"
    e_val = exp.get(field)
    p_val = ext.get("duration")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        e_hours = e_val // 60
        if p_val and str(e_hours) in p_val:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 7. activities
    field = "activities"
    e_val = exp.get(field, [])
    p_val = ext.get("activities", "")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        all_ok = True
        for act in e_val:
            mapped = act_map.get(act, act)
            if p_val is None or mapped.lower() not in p_val.lower():
                all_ok = False
        if all_ok and p_val:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

    # 8. availability
    field = "availability"
    e_val = exp.get(field, [])
    p_val = ext.get("availability")
    field_stats[field]["evaluated"] += 1
    total_fields_evaluated += 1
    if e_val:
        if p_val:
            if "every day" in p_val.lower() and "every_day" in e_val:
                field_stats[field]["correct"] += 1
                total_fields_correct += 1
            else:
                all_ok = True
                for day in e_val:
                    if day.lower() not in p_val.lower():
                        all_ok = False
                if all_ok:
                    field_stats[field]["correct"] += 1
                    total_fields_correct += 1
                else:
                    field_stats[field]["missing"] += 1
                    missing_predictions += 1
        else:
            field_stats[field]["missing"] += 1
            missing_predictions += 1
    else:
        if p_val:
            field_stats[field]["hallucinated"] += 1
            hallucinations += 1
        else:
            field_stats[field]["correct"] += 1
            total_fields_correct += 1

extraction_metrics = {
    "correct_fields": total_fields_correct,
    "evaluated_fields": total_fields_evaluated,
    "overall_accuracy": total_fields_correct / total_fields_evaluated if total_fields_evaluated else 0,
    "missing_predictions": missing_predictions,
    "hallucinations": hallucinations,
    "per_field": field_stats
}


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
        "tourism_feedback": len(feedback_data),
        "voice_listing": len(voice_data),
        "intent_test": len(intent_data),
        "translation_test": len(trans_data)
    },
    "experience_dna_metrics": dna_metrics,
    "listing_extraction_metrics": extraction_metrics,
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
print(f"Experience DNA Macro F1: {dna_metrics['macro_f1']:.2f}")
print(f"Experience DNA Micro F1: {dna_metrics['micro_f1']:.2f}")
print(f"Listing Extraction Accuracy: {extraction_metrics['overall_accuracy']:.1%} ({total_fields_correct}/{total_fields_evaluated})")
print(f"Listing Extraction Hallucinations: {hallucinations}")
print(f"Intent Classification: {intent_status['status']}")
print(f"Translation: {trans_status['status']}")
print("============================================================")
print(f"Results saved to: {out_path}")
