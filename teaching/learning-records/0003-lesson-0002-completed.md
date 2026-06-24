# Lesson 0002 Completed

User demonstrated understanding of the edit pipeline: the four phases (validate & normalize → resolve anchors → compute & apply spans → atomic write & respond), the 3-tier anchor resolution strategy (exact → fuzzy → 3-way merge), how resolveEditSpans turns anchors into byte offsets and how applySpans applies them in reverse order, and how writeFileAtomically uses temp-file + rename for safety.

**Status**: active
**Implications**: User has the mental model of the full edit lifecycle. Next: tool registration & architecture (lesson 0003).
