# Changelog

All notable changes to this package will be documented in this file.

## Unreleased

### Changed
- Enabled `grep` by default in package metadata for coding-agent search workflows.
- Updated tool prompts to clarify fresh anchor sources and default `grep` behavior.
- Standardized warning labels to clean `W_...` codes only:
  - `[W_LEGACY_NORMALIZED]`
  - `[W_MERGED]`
  - `[W_RELOCATED]`
  - `[W_REPEATED_CALL]`
  - `[W_ALTERNATING_CALL]`
  - `[W_NON_UTF8]`
  - `[W_SUSPICIOUS_ESCAPE]`
- Removed old backward-compatible warning labels such as `[LEGACY_NORMALIZED]`, `[MERGED]`, `[RELOCATED]`, `REPEATED-CALL WARNING`, and `ALTERNATING-CALL WARNING`.

### Fixed
- No-op edit responses now include warnings in model-visible text and `details.warnings`.

### Tests
- Added regression coverage for no-op warning visibility.
- Updated warning-label expectations across focused tool, core, extension, and integration tests.
