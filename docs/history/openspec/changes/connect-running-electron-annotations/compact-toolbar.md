# Electron Annotate compact toolbar

The owner selected the compact toolbar HTML mockup and requested implementation on 21 October 2026. This is a presentation follow-up to the existing connection, not a new annotation transport.

## Design and boundaries

- Display the name `Electron Annotate`. Keep `/annotate-electron`, `annotate_electron`, protocol messages, and upstream picker identifiers compatible.
- Use an opaque, compact bottom toolbar with selection controls, selected count, Send, and X. Keep floating element note editors, crop/none choices, per-element crop inclusion, multi-selection, parent/child selection, and note dragging.
- Follow root DESIGN.md and canonical semantic tokens in both application themes. Use licensed Remix icons and visible focus. The overlay must not reflow or mutate product content.
- Keep the pinned Pi Annotate package unchanged. Share a local presentation adapter between attached-development and owned-synthetic paths. Remove its observers and owned presentation during picker cleanup.
- Preserve request/session ownership, capture checks, untrusted feedback, cleanup settlement, X cancellation, and subsequent Connect. Do not touch owner windows or private sessions during verification.

## Implementation plan

Execute inline in the existing checkout, preserving unrelated changes. No commit, push, installation, or foreground launch is part of this request.

- [x] Add headless tests using the real pinned picker and canonical theme. Check toolbar geometry, notes, selection, native controls, crop/none, cancellation, focus, and restoration in both themes.
- [x] Add shared presentation CSS and renderer installer. Integrate it into both existing picker lifecycles and update the display name.
- [x] Run the focused presentation and native annotation checks, typecheck, ordinary build, and appropriate existing suites. Inspect actual light/dark screenshots.
- [x] Record actual results and synchronize issue #28 without closing or changing existing dependencies or acceptance gates.

## Review focus

Check that note-card positioning and drag still work near viewport edges; multi-note operations retain their indices; crop/none never adds an unintended image; X and reconnect leave product drafts intact; theme changes preserve readable controls and never move the selected product element.

## Verification on 21 October 2026

The final source passed typecheck, the ordinary production build, and a clean full Playwright run with 518 passes and 11 existing or separately gated skips. The independent preview passed its source, notices, isolation, build, and browser checks with 24 passes and one historical skip. Four inherited CSS optimization warnings remain in the ordinary build.

Eight focused headless tests passed. They use the real pinned picker and canonical tokens in both themes at 980, 1280, and 1440 pixels. Twelve final hidden Electron checks passed, including the six theme/width journeys, canonical crop delivery, camera-off notes, zero-image None, X/reconnect, cancellation, and note dragging. Actual light/dark native screenshots were inspected. The unchanged upstream picker still matches its pinned SHA-256.

One independent frozen-delta review found two defects: textarea reparenting lost focus, and note growth could escape the available space. Both first failed dedicated assertions and now pass after preserving the textarea node and observing note size. The same bounded correction pass fixed toolbar-inset specificity and hid connector wires to match the selected mockup. A separate screenshot-obstruction regression first failed and now passes with hover metadata hidden while a note has focus. Final verification checks these remedies; no second independent signoff is claimed.

Initial test failures remain recorded in private evidence. Native fixtures now await actual focus and mixed-note Send readiness. Existing tests use the visible screenshot choice instead of the removed Dock-top controls. No capture, ownership, cleanup, or restoration assertion was relaxed. The compiled development host resolves local presentation assets from its verified repository root.

These results cover local implementation and isolated fixtures. No owner window, private session, live provider, installation, commit, push, or merge formed part of this change. Load the update with a manual development-app restart and Pi extension reload, then reconnect. Issue #28 remains Open/In Progress under #1 with no new blockers; earlier publication and acceptance gates remain separate.
