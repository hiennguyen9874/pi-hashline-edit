import json
import os
import re
from collections import Counter, defaultdict

sessions = [
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-tModLoader--\2026-05-16T12-05-11-968Z_019e30ad-1ca0-7325-8a2f-34d21e4a36fa.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-tModLoader--\2026-05-19T05-06-48-531Z_019e3ea1-2453-7cfa-bf39-4ce21bf676e5.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-Remotion-BevyTD--\2026-05-28T12-43-39-739Z_019e6e9c-a35b-7d41-9c8d-a97c19d41061.jsonl",
    r"C:\Users\Jerry\.pi\agent\sessions\--C--Users-Jerry-Projects-Bevy-bevy-tower-defense--\2026-05-26T09-15-38-248Z_019e6391-7788-7542-bbdc-d39efc12bf26.jsonl",
]

# Diff line prefixes:
#   ' ' = context (unchanged)
#   '+' = added
#   '-' = removed
#   '...' = omitted context marker

def parse_diff_line(line):
    """Return (kind, content) where kind is '+', '-', ' ', or '...'."""
    if not line:
        return (None, "")
    if line.startswith("... "):
        return ("...", "")
    if line[0] in "+- ":
        return (line[0], line[1:])
    return (None, line)


def extract_content(parsed_line):
    """
    Strip line-number and optional hash to get pure content.
    '+123#AB:actual content' -> 'actual content'
    ' 123#AB:actual content' -> 'actual content'
    '-123    actual content' -> 'actual content'
    """
    kind, text = parsed_line
    if kind is None or kind == "...":
        return None
    if kind in "+ ":
        # '+123#AB:content' or ' 123#AB:content'
        idx = text.find(":")
        if idx >= 0:
            return text[idx + 1:]
    if kind == "-":
        # '-123    content'
        # Skip the line number and spaces
        m = re.match(r'\d+\s{4}(.*)', text)
        if m:
            return m.group(1)
    return text


def extract_line_number(parsed_line):
    """Extract line number from a +/-/ context line."""
    kind, text = parsed_line
    if kind is None or kind == "...":
        return None
    m = re.match(r'\s*(\d+)', text)
    if m:
        return int(m.group(1))
    return None


def detect_boundary_duplication(diff_text):
    """
    Analyze a diff for boundary line duplication.
    Returns list of duplications found: each is (variant, old_line_num, new_line_num, content).
    """
    if not diff_text:
        return []

    lines = diff_text.split("\n")
    parsed = [parse_diff_line(l) for l in lines]
    contents = [extract_content(p) for p in parsed]
    line_nums = [extract_line_number(p) for p in parsed]

    dups = []

    # Find change blocks: runs of consecutive +/- lines
    i = 0
    while i < len(parsed):
        kind = parsed[i][0]
        if kind not in ("+", "-"):
            i += 1
            continue

        # Found start of a change block
        block_start = i
        while i < len(parsed) and parsed[i][0] in ("+", "-"):
            i += 1
        block_end = i  # exclusive

        # Find first '+' in block (first addition)
        first_add_idx = None
        last_add_idx = None
        for j in range(block_start, block_end):
            if parsed[j][0] == "+":
                if first_add_idx is None:
                    first_add_idx = j
                last_add_idx = j

        if first_add_idx is None:
            # Pure deletion block, no additions to check
            continue

        # Variant A: first added line matches the context line BEFORE the block
        if block_start > 0:
            prev_ctx_idx = block_start - 1
            # Walk back past any '...' markers
            while prev_ctx_idx >= 0 and parsed[prev_ctx_idx][0] == "...":
                prev_ctx_idx -= 1
            if prev_ctx_idx >= 0 and parsed[prev_ctx_idx][0] == " ":
                ctx_content = contents[prev_ctx_idx]
                add_content = contents[first_add_idx]
                if ctx_content is not None and add_content is not None:
                    if ctx_content.strip() == add_content.strip() and ctx_content.strip():
                        dups.append({
                            "variant": "A (first added line matches preceding context)",
                            "ctx_line": line_nums[prev_ctx_idx],
                            "add_line": line_nums[first_add_idx],
                            "content": ctx_content.strip()[:80],
                        })

        # Variant B: last added line matches the context line AFTER the block
        if block_end < len(parsed):
            next_ctx_idx = block_end
            # Walk forward past any '...' markers
            while next_ctx_idx < len(parsed) and parsed[next_ctx_idx][0] == "...":
                next_ctx_idx += 1
            if next_ctx_idx < len(parsed) and parsed[next_ctx_idx][0] == " ":
                ctx_content = contents[next_ctx_idx]
                add_content = contents[last_add_idx]
                if ctx_content is not None and add_content is not None:
                    if ctx_content.strip() == add_content.strip() and ctx_content.strip():
                        dups.append({
                            "variant": "B (last added line matches following context)",
                            "ctx_line": line_nums[next_ctx_idx],
                            "add_line": line_nums[last_add_idx],
                            "content": ctx_content.strip()[:80],
                        })

    return dups


# ─── Process all sessions ───────────────────────────────────────────

total_edit_results = 0
results_with_diff = 0
total_dups = 0
dup_by_variant = Counter()
dup_by_session = Counter()
all_dups_detail = []

for session_path in sessions:
    if not os.path.exists(session_path):
        continue
    session_name = os.path.basename(os.path.dirname(session_path))

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
            if msg.get("role") != "toolResult":
                continue
            if msg.get("toolName") != "edit":
                continue

            total_edit_results += 1
            details = msg.get("details", {})
            diff = details.get("diff", "")
            if not diff:
                continue
            results_with_diff += 1

            dups = detect_boundary_duplication(diff)
            if dups:
                total_dups += len(dups)
                dup_by_session[session_name] += len(dups)
                for d in dups:
                    dup_by_variant[d["variant"]] += 1
                all_dups_detail.extend(dups)


# ─── Print report ───────────────────────────────────────────────────

print("=" * 72)
print("BOUNDARY DUPLICATION — DIFF-BASED ANALYSIS")
print()
print(f"Total edit tool results:     {total_edit_results}")
print(f"Results with diff data:      {results_with_diff}")
print()
print(f"Edits with boundary dups:    {total_dups}")
print(f"  % of results with diff:    {total_dups / max(results_with_diff, 1) * 100:.1f}%")
print(f"  % of all edit results:     {total_dups / max(total_edit_results, 1) * 100:.1f}%")
print()

print("By variant:")
for variant, count in dup_by_variant.most_common():
    print(f"  {variant}")
    print(f"    count: {count}")
print()

print("By session:")
for session, count in sorted(dup_by_session.items(), key=lambda x: -x[1]):
    print(f"  {session}: {count}")
print()

# Show some examples
print("--- Sample duplications (first 15) ---")
for d in all_dups_detail[:15]:
    print(f"  {d['variant']}")
    print(f"    context line {d['ctx_line']}, added line {d['add_line']}")
    print(f"    content: {d['content']}")
    print()
