# Floating annotation interface implementation plan

**Goal:** Ship the owner-approved interface in `outputs/floating-send-refined.html` through both Electron annotation routes.

**Architecture:** Keep the verified upstream picker file, existing route ownership, capture validation, and native input guards. A fixed, hash-gated compatibility hook exposes only local annotation state to the shared presentation layer, so undo restores original nodes and drafts without replaying product input. No bridge/tool schema or generic scripting capability is added.

**Stack:** CommonJS runtime helpers, existing Pi Annotate 0.5.2, OpenChamber tokens, licensed Remix SVGs, project-local Playwright and hidden Electron.

## Constraints and review focus

- Preserve unrelated uncommitted edits; work in the current checkout. Do not commit, install globally, publish, or change the former host.
- Preserve the upstream file/hash, canonical token exports, licenses, synthetic catalog and capture refusal policy. Record intentionally changed presentation CSS and new icon identities.
- History belongs to one active picker request. Reject restoration to detached/replaced nodes; never select a replacement by selector alone.
- Deleting and restoring notes retains comment, screenshot choice, DOM order, draft selection, and other surviving editor nodes. New annotations use the initial capture choice.
- Details/visibility/minimize are view state, distinct from add/delete history. Hidden or minimized notes still submit correctly. None/camera-off must capture zero images.
- Details toggle is in a footer anchored during expansion; styles affect only owned overlays. Preserve original product draft, focus, selection and scroll at cleanup.

## Tasks

- [x] Add failing behavioral regressions in `tests/electron-annotation-presentation.spec.ts`: stationary disclosure, details contents, minimize versus delete, undo/redo delivered state, hidden notes, stale-node restoration, and independent screenshot toggles.
- [x] Add `scripts/electron-annotations/picker-source.cjs` with hash-gated, fixed annotation-state hooks; use it in the synthetic controller and attached picker loader. Preserve existing card nodes on history restoration and revoke hooks at disposal.
- [x] Implement icon toolbar, bounded add/delete history and note editor in `presentation-ui.cjs`, keeping `presentation.cjs` as the source loader; replace only overlay rules in `presentation.css`. Add required licensed icon copies, hashes and provenance.
- [x] Update presentation and native regression selectors to the new accessible controls, retaining their existing assertions. Add native hidden-window coverage for history and zero-capture restoration.
- [x] Update `design/DESIGN.md`, provenance, notices and relevant protocol/connection docs to describe the final UI and fixed compatibility hook.
- [x] Run focused tests, then `npm run build`, `npm run typecheck`, `npm run check:package`, `npm test`; report actual results and existing foreground/platform limits. Inspect light/dark runtime screenshots and perform final code review.

## Execution record

Owner approved implementation after reviewing the working mockups. Execute inline without a second design approval. The checkout already contains screenshot fixes in presentation, renderer, picker and tests; preserve them. No commit is authorized by this implementation request.

Final verification: build, typecheck and package checks passed; full suite 176 passed, one pre-existing foreground skip. Independent review's stale draft/image history and textarea sizing findings were reproduced and corrected. The initial full run's native drag failure was corrected with a fixed owned-drag hook and retained input guards. Final review reported no remaining important findings. Full details and limitations are in `docs/VERIFICATION.md`.
