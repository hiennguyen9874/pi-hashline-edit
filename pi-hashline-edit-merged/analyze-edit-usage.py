import json
import sys
import os
from collections import Counter, defaultdict

sessions = [
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-tModLoader--\2026-05-16T12-05-11-968Z_019e30ad-1ca0-7325-8a2f-34d21e4a36fa.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-tModLoader--\2026-05-19T05-06-48-531Z_019e3ea1-2453-7cfa-bf39-4ce21bf676e5.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-Remotion-BevyTD--\2026-05-28T12-43-39-739Z_019e6e9c-a35b-7d41-9c8d-a97c19d41061.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-Bevy-bevy-tower-defense--\2026-05-26T09-15-38-248Z_019e6391-7788-7542-bbdc-d39efc12bf26.jsonl",
]

# --- Global counters ------------------------------------------------

total_edit_calls = 0
total_edits = 0  # individual edit items

# Per-op counts (valid ops only, including MISSING)
op_counts = Counter()

# Replace: end anchor presence
replace_with_end = 0
replace_without_end = 0
replace_multi_no_end = 0  # lines_count > 1 but no end (potential FM1)

# Append / prepend: pos presence
append_with_pos = 0
append_without_pos = 0
prepend_with_pos = 0
prepend_without_pos = 0

# Forbidden fields (valid ops but forbidden fields present)
forbidden_counts = Counter()  # (op, forbidden_field) -> count

# Legacy top-level
legacy_camel = 0
legacy_snake = 0

# Return modes
return_modes = Counter()
return_ranges_used = 0

# ---- Malformation categories ----
malformed = Counter()  # category -> count
# Categories:
#   missing_op              — edit item has no "op" field
#   unknown_op              — edit item has an unrecognized op value
#   replace_text_no_op      — item has oldText+newText but no op (common sub-case of missing_op)
#   replace_text_missing_op — same, tracked separately for clarity
#   replace_no_pos          — replace op but no pos
#   replace_no_lines        — replace op but no lines

# ---- Detail collectors ----
# For replace: (lines_count, has_end)
replace_details = []  # {lines_count, has_end, path}

# For replace_text: oldText length distribution
replace_text_lengths = []

# ---- Session breakdown ----
session_data = []


def process_edit_item(item, session_name):
    global total_edits, replace_with_end, replace_without_end, replace_multi_no_end
    global append_with_pos, append_without_pos, prepend_with_pos, prepend_without_pos

    op = item.get("op")
    has_old = "oldText" in item
    has_new = "newText" in item
    has_old_text = "old_text" in item
    has_new_text = "new_text" in item
    has_pos = "pos" in item
    has_end = "end" in item
    has_lines = "lines" in item

    # Parse lines count
    lines_val = item.get("lines")
    if isinstance(lines_val, list):
        lines_count = len(lines_val)
    elif isinstance(lines_val, str):
        lines_count = 1  # string input
    elif lines_val is None:
        lines_count = 0
    else:
        lines_count = 0

    total_edits += 1

    # -- Malformation: no op --
    if not isinstance(op, str) or op == "":
        malformed["missing_op"] += 1
        op_counts["(no op)"] += 1
        if has_old and has_new:
            malformed["replace_text_missing_op"] += 1
        return

    op_counts[op] += 1

    # -- Malformation: unknown op --
    if op not in ("replace", "append", "prepend", "replace_text"):
        malformed["unknown_op"] += 1
        return

    # -- Per-op checks --

    if op == "replace":
        # Required fields
        if not has_pos:
            malformed["replace_no_pos"] += 1
        if not has_lines:
            malformed["replace_no_lines"] += 1
        # Forbidden fields
        if has_old or has_new:
            forbidden_counts[("replace", "oldText/newText")] += 1
        if has_old_text or has_new_text:
            forbidden_counts[("replace", "old_text/new_text")] += 1
        # End anchor
        if has_end:
            replace_with_end += 1
        else:
            replace_without_end += 1
            if lines_count > 1:
                replace_multi_no_end += 1
        replace_details.append({"lines_count": lines_count, "has_end": has_end})

    elif op == "append":
        if has_end:
            forbidden_counts[("append", "end")] += 1
        if has_old or has_new:
            forbidden_counts[("append", "oldText/newText")] += 1
        if has_pos:
            append_with_pos += 1
        else:
            append_without_pos += 1

    elif op == "prepend":
        if has_end:
            forbidden_counts[("prepend", "end")] += 1
        if has_old or has_new:
            forbidden_counts[("prepend", "oldText/newText")] += 1
        if has_pos:
            prepend_with_pos += 1
        else:
            prepend_without_pos += 1

    elif op == "replace_text":
        if has_pos:
            forbidden_counts[("replace_text", "pos")] += 1
        if has_end:
            forbidden_counts[("replace_text", "end")] += 1
        if has_lines:
            forbidden_counts[("replace_text", "lines")] += 1
        if has_old:
            replace_text_lengths.append(len(item["oldText"]))
        if has_new:
            pass  # newText always expected


# --- Process all sessions -------------------------------------------

for session_path in sessions:
    if not os.path.exists(session_path):
        continue

    session_name = os.path.basename(os.path.dirname(session_path))
    call_count = 0
    item_count = 0

    with open(session_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") != "message":
                continue
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if not isinstance(content, list):
                continue
            for item in content:
                if item.get("type") != "toolCall":
                    continue
                if item.get("name") != "edit":
                    continue
                args = item.get("arguments", {})
                if not isinstance(args, dict):
                    continue
                total_edit_calls += 1

                # Return mode
                rm = args.get("returnMode", "changed")
                return_modes[rm] += 1
                if args.get("returnRanges"):
                    return_ranges_used += 1

                # Legacy top-level
                has_camel = "oldText" in args or "newText" in args
                has_snake = "old_text" in args or "new_text" in args
                if has_camel and not has_snake:
                    legacy_camel += 1
                elif has_snake and not has_camel:
                    legacy_snake += 1

                # Process edits array
                edits = args.get("edits", [])
                if not isinstance(edits, list):
                    continue
                if len(edits) == 0:
                    continue
                call_count += 1
                for edit_item in edits:
                    if not isinstance(edit_item, dict):
                        continue
                    process_edit_item(edit_item, session_name)
                    item_count += 1

    session_data.append((session_name, call_count, item_count))


# --- Print report ---------------------------------------------------

print("=" * 72)
print("HASHLINE EDIT TOOL — USAGE STATISTICS")
print(f"{'Sessions analyzed:':40s} {len(session_data)}")
print(f"{'Total edit tool calls:':40s} {total_edit_calls}")
print(f"{'Total edit items:':40s} {total_edits}")
print()

# Session breakdown
print("-" * 72)
print("PER-SESSION BREAKDOWN")
print(f"  {'Session':55s} {'Calls':>6s} {'Items':>6s}")
for name, calls, items in session_data:
    print(f"  {name:55s} {calls:6d} {items:6d}")
print()

# Operation distribution
print("-" * 72)
print("OPERATION DISTRIBUTION (all attempted edit items)")
valid_total = sum(c for k, c in op_counts.items() if k != "(no op)")
print(f"  Valid ops:   {valid_total}")
print(f"  Missing ops: {op_counts.get('(no op)', 0)}")
print()
for op, count in op_counts.most_common():
    bar = "#" * max(1, count // 5)
    print(f"  {op:20s} {count:5d}  {bar}")
print()

# Malformation summary
print("-" * 72)
print("MALFORMED EDIT ITEMS (would be rejected by runtime)")
if malformed:
    for cat, count in sorted(malformed.items(), key=lambda x: -x[1]):
        pct = count / max(total_edits, 1) * 100
        print(f"  {cat:30s} {count:5d}  ({pct:5.1f}%)")
    total_malformed = sum(malformed.values())
    pct = total_malformed / max(total_edits, 1) * 100
    print(f"  {'TOTAL malformed':30s} {total_malformed:5d}  ({pct:5.1f}%)")
else:
    print("  (none)")
print()

# Replace: end anchor usage
print("-" * 72)
print("REPLACE — END ANCHOR USAGE")
total_replaces = replace_with_end + replace_without_end
print(f"  With end:       {replace_with_end:5d}")
print(f"  Without end:    {replace_without_end:5d}")
if total_replaces > 0:
    print(f"  % missing end:  {replace_without_end/total_replaces*100:5.1f}%")
print()

# Potential FM1
print("-" * 72)
print("REPLACE — MULTI-LINE lines BUT NO end (potential FM1)")
print(f"  Count: {replace_multi_no_end}  (of {total_replaces} total replaces)")
if total_replaces > 0:
    print(f"  Rate:  {replace_multi_no_end/total_replaces*100:.1f}%")
    if replace_without_end > 0:
        print(f"  Rate among without-end: {replace_multi_no_end/replace_without_end*100:.1f}%")
print()

# Replace: lines_count distribution
print("-" * 72)
print("REPLACE — lines_count DISTRIBUTION")
lines_with = Counter()
lines_without = Counter()
for d in replace_details:
    if d["has_end"]:
        lines_with[d["lines_count"]] += 1
    else:
        lines_without[d["lines_count"]] += 1

def print_lines_dist(counter, label):
    print(f"  {label}:")
    for cnt, freq in sorted(counter.items()):
        bar = "#" * freq
        print(f"    lines_count={cnt:4d}: {freq:3d}  {bar}")

print_lines_dist(lines_with, "with end")
print_lines_dist(lines_without, "without end")
print()

# Append / Prepend
print("-" * 72)
print("APPEND / PREPEND — pos USAGE")
print(f"  append:   with pos={append_with_pos}, without pos={append_without_pos}")
print(f"  prepend:  with pos={prepend_with_pos}, without pos={prepend_without_pos}")
print()

# Forbidden fields
print("-" * 72)
print("FORBIDDEN FIELDS PRESENT (valid ops)")
if forbidden_counts:
    for (op, field), count in sorted(forbidden_counts.items(), key=lambda x: -x[1]):
        print(f"  op={op:15s} field(s)={field:25s} count={count}")
else:
    print("  (none)")
print()

# Legacy
print("-" * 72)
print("LEGACY TOP-LEVEL")
print(f"  camelCase (oldText/newText): {legacy_camel}")
print(f"  snake_case (old_text/new_text): {legacy_snake}")
print()

# Return modes
print("-" * 72)
print("RETURN MODES")
for mode, count in return_modes.most_common():
    print(f"  {mode:10s} {count}")
print(f"  returnRanges used: {return_ranges_used}")
print()

# replace_text: oldText length distribution
if replace_text_lengths:
    print("-" * 72)
    print("replace_text — oldText LENGTH DISTRIBUTION")
    len_dist = Counter()
    for l in replace_text_lengths:
        bucket = (l // 100) * 100
        len_dist[bucket] += 1
    for bucket, count in sorted(len_dist.items()):
        print(f"  {bucket:5d}-{bucket+99:5d} chars: {count}")
    print(f"  min={min(replace_text_lengths)}, max={max(replace_text_lengths)}, avg={sum(replace_text_lengths)/len(replace_text_lengths):.0f}")
