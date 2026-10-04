"""Shared original semantic scoring, with typed-field adapters for the new schema.
Description presence and expected-list containment are legacy metrics, not fact audits.
"""
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

def score_listings(cases, extractor, structured=False):
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

    for ex in cases:
        ext = extractor(ex)
        exp = ex["expected"]

        # 1. business_name
        field = "business_name"
        e_val = exp.get(field)
        p_val = ext.get(field) if structured else ext.get("name")
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
            if p_val:
                field_stats[field]["hallucinated"] += 1
                hallucinations += 1
            else:
                field_stats[field]["correct"] += 1
                total_fields_correct += 1

        # 2. experience_title
        field = "experience_title"
        e_val = exp.get(field)
        p_val = ext.get(field) if structured else ext.get("name")
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
        p_val = str(ext["price"]) if structured and ext.get("price") is not None else ext.get("price")
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
            if (structured and ext.get("currency") == e_val) or (not structured and p_val and "Rp" in p_val and e_val == "IDR"):
                field_stats[field]["correct"] += 1
                total_fields_correct += 1
            elif p_val and e_val != "IDR":
                field_stats[field]["missing"] += 1
                missing_predictions += 1
            else:
                field_stats[field]["missing"] += 1
                missing_predictions += 1
        else:
            if (structured and ext.get("currency")) or (not structured and p_val and "Rp" in p_val):
                field_stats[field]["hallucinated"] += 1
                hallucinations += 1
            else:
                field_stats[field]["correct"] += 1
                total_fields_correct += 1

        # 6. duration_minutes
        field = "duration_minutes"
        e_val = exp.get(field)
        p_val = str(ext["duration_minutes"] / 60) if structured and ext.get("duration_minutes") is not None else ext.get("duration")
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
        p_val = ", ".join(act_map.get(v, v) for v in ext.get("activities", [])) if structured else ext.get("activities", "")
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
        p_val = ", ".join(v.replace("_", " ") for v in ext.get("availability", [])) if structured else ext.get("availability")
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


    return extraction_metrics
