# Verification record

## Catppuccin overlay and v0.1.1 — October 22, 2026

The shared overlay now uses Catppuccin Mocha dark and Latte light. Peach, Blue and Mauve carry the approved Orbit identity into its controls. Annotation colors draw from a shuffled fourteen-accent cycle, avoid active colors on reuse, and remain attached to original cards through undo/redo and theme changes. Copied OpenChamber resources, the pinned picker, frozen catalogs, four paint exceptions and bridge/tool schemas are unchanged.

Fresh checks against the changed runtime passed:

| Command | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run typecheck` | Passed |
| `npm run check:package` | Passed: 30 fixed resources, frozen catalogs, SDK family and 89 relative imports in 81 source files |
| `npm test` | **194 passed, one existing foreground walkthrough skipped** |
| `npm audit --omit=dev --audit-level=moderate` | Zero reported vulnerabilities |
| Focused presentation suite | All 26 passed |
| Reduced-motion contrast recheck | Passed across all fourteen Latte accents; focus ≥3:1 and screenshot/placeholder text ≥4.5:1 |
| Design detector | No deterministic findings; nothing suppressed |

New regressions first reproduced the old palette and light-mode focus contrast failures. The final tests cover shuffled membership and first-cycle uniqueness, cycle reuse with two and ten simultaneous notes, repeated deletion/reselection and history restoration, explicit theme switching, contrast and unchanged product colors. Independent source review found light-mode contrast issues; the corrected focus and control inks passed its recheck. The full suite retains zero-capture None, verified crops and capture refusals, input guards, restoration, stale references, explicit reconnect, delayed cleanup and actual-launcher terminal signals. Logs remain under ignored `outputs/catppuccin-*.log`.

`npm run demo` captured the actual extension in a hidden fictional Electron sample, including two literal no-image notes delivered to the offline fixture. Mocha/Latte desktop and a 390px narrow-window capture were visually inspected together. The GIF, MP4 and screenshots are refreshed; `compact.png` records the narrow layout. This is a window-width check, not mobile platform acceptance. A safe local gallery exposes only copied public media.

Version, lockfile, install examples and package media URLs consistently target v0.1.1. Public tag installation and release receipts must be verified separately from these local results. npm publication remains pending the owner's publisher account. No owner application restart, global installation, provider call or private profile was used. Checks establish hidden macOS development behavior, not foreground focus, Windows, packaged apps or live-provider acceptance. Every section below describes its earlier source version.

## Native test portability and public installation — October 22, 2026

The first hosted macOS CI run passed 185 tests and failed two native tests, with the existing foreground skip. Both exact failures reproduced locally at 1024px: overlapping cards covered the first note's delete control, and a drag assertion incorrectly required movement past the viewport's clamp. The mixed-image test now minimizes the second card before accessing the first footer. The drag test verifies actual movement, viewport containment and pointer release, retaining its original beyond-card movement assertion when actual space permits. Both tests cover requested 1024px and 1440px widths; macOS can constrain a requested size to its display work area. No runtime, guard, capture or catalog code changed.

The final `npm run typecheck`, `npm test` and `npm run check:package` passed: **189 passed, one existing foreground walkthrough skipped**. `npm test` also rebuilt the sample. A parameterization run first exposed a missing serialized Electron evaluation argument; the explicit argument was corrected before this final full run. The final log is `outputs/release-ci-final-tests.log`. Independent review found no remaining issues in the test correction. Hosted CI receipts are available in [GitHub Actions](https://github.com/leoscricca/pi-annotate-electron/actions).

The public `v0.1.0` tag installed through the project-local Pi CLI in an isolated temporary home. Its extension loaded through the real Pi SDK, registered its command/tools, and launched and normally closed the actual hidden sample. Public logo, dark/light screenshots, GIF and video returned HTTP 200 and matched local bytes. The repository is public under MIT and the GitHub release includes the archive and video. npm publication remains pending publisher account setup. No owner Pi settings or application profiles were changed. The test correction follows the tag; packaged runtime bytes remain unchanged.

## Public release preparation — October 22, 2026

The owner approved MIT licensing and public GitHub distribution. Release preparation adds visual documentation, original logo concepts, synthetic demo media, package metadata, an executable launcher, built fixture packaging and macOS CI. Electron is pinned to 44.9.3, with the owned-route prerequisite updated to match. Runtime dependency lookup now uses Node resolution so npm-hoisted dependencies work; the pinned picker hash, frozen catalogs and four paint exceptions remain unchanged.

Fresh checks against the release runtime bytes passed:

| Command | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run typecheck` | Passed |
| `npm run check:package` | Passed: 29 fixed resources, frozen catalogs, local SDK family and 89 relative imports in 81 source files |
| `npm test` | **187 passed, one existing foreground walkthrough skipped** |
| `npm audit --omit=dev --audit-level=moderate` | Zero reported vulnerabilities |
| `npm pack` | Runtime, executable, built fixture, notices and selected docs/media included; local sessions and historical plans excluded |

Four new package regressions first reproduced missing launcher metadata, missing built fixture and hardcoded dependency paths, then passed after the fixes. A clean production-only archive installation in a private temporary project also passed executable help, actual hidden picker activation, cancellation and normal child close. Full coverage includes actual-launcher terminal signals and delayed cleanup, no-image zero-capture, verified crops, input guards, stale references, draft restoration, explicit reconnect and offline Pi delivery. Logs and local receipts are retained under ignored `outputs/`.

Media was captured from the actual fictional sample in a hidden macOS window, with two literal notes delivered and no images requested. The MP4 is 13 seconds, H.264, 1280×828. Dark/light images and a representative video frame were visually inspected. Logo artwork is original SVG under MIT; third-party functional icon notices remain intact.

Independent release review found no important issues in packaging, dependency resolution, runtime version gate, metadata, docs, media helper or CI. Tests used headless Chromium, hidden macOS Electron, private temporary profiles and offline Pi SDK fixtures. This does not establish foreground focus, arbitrary-app compatibility, Windows, packaged-app support, private-account behavior or live-provider acceptance. npm publication remains pending the owner's publisher account; GitHub release and public-install receipts must be checked separately. Older sections below describe their original source versions.

## Overlay alignment, layering and card tints — October 22, 2026

Owned icon margins and toolbar button geometry now keep icons centered even when the app applies a global `button svg` margin. Disabled Send remains opaque and dims its arrow, preventing product text from showing through. Each annotation card has an opaque 6% selection-color tint, with matching hovered borders and focus rings.

The original overlay roots render as manual popovers in the browser's top layer, above ordinary application overlays even at the maximum CSS z-index. They remain separate from product event paths. An active native HTML modal refuses picker startup; a modal opened during annotation cancels the picker, retains the connection and leaves the dialog intact. No native-modal annotation support is claimed.

Final `npm run build`, `npm run typecheck`, `npm run check:package` and `npm test` passed against these runtime bytes. The suite passed **183 tests**, with the existing foreground walkthrough skipped. Package checks retained all 29 fixed resources, frozen catalogs, canonical tokens, licensed icons and the dependency picker hash. The final log is `outputs/overlay-layer-verified.log`.

Three new headless browser regressions first failed for icon displacement, disabled Send transparency and overlay stacking. Existing color/history coverage now checks distinct card fills; theme coverage checks opaque tinted pixels in dark and light. A hidden native Electron regression verifies modal-triggered cancellation without app activation, modal focus preservation, cleanup, refusal while a modal remains active and explicit reactivation after it closes. Native dock/note drags also passed. Independent review found no remaining important issues after the modal boundary was corrected.

Visual checks covered dark desktop and light 390px layouts, including the empty dock above product controls and the colored cards. Both measured icon center offsets were zero. The full suite retained capture refusals, zero-capture None, input guards, restoration, stale references, reconnect, delayed cleanup and actual-launcher terminal checks. Checks used hidden macOS windows, synthetic content and private profiles; no foreground owner app, global installation, commit or publication was used.

## Dock, editor padding and selection colors — October 22, 2026

The shared overlay now supports dragging the dock from its edges, corners and spaces between buttons, with pointer capture and viewport bounds. Moved docks stay inside a resized window and reset for a new annotation request. Textareas retain their 159px writing area with 12px padding on all sides. Each annotation has a distinct token-derived accent across its outline, marker, card border and note badge; original cards retain their colors through undo, including delete/reselect history branches.

Final `npm run build`, `npm run typecheck`, `npm run check:package` and `npm test` passed against these runtime bytes. The full suite passed **179 tests**, with the existing foreground walkthrough skipped. Package checks verified 29 fixed resources and the unchanged frozen catalogs, canonical tokens and dependency picker hash. The final log is `outputs/dock-refinement-final.log`.

Two added headless browser regressions exercise dock movement, viewport clamping, usable controls and stable annotation colors through history. A hidden native Electron regression exercises pointer capture, release, subsequent selection without product activation, cancellation and dock reset. Visual checks covered dark desktop and light 390px layouts and confirmed 12px textarea padding in all directions.

The first full run passed 171 tests and failed all eight synthetic annotation-flow variants, with one existing skip: direct style changes on transient marker nodes left mutation records after those nodes were rebuilt. Moving accent updates into a stable owned stylesheet fixed those failures without changing the content guard. All 26 focused presentation and synthetic-flow tests then passed. Independent review reproduced a color/history collision; the regression failed before colors were tied to original annotation cards and passed after the fix. Review found no further important issues.

Checks remain headless or hidden on macOS with synthetic content and private test profiles. No foreground owner walkthrough, Windows or packaged-app acceptance, owner app restart, installation, commit or publication was performed. Earlier verification sections below describe prior runtime versions.

## Floating annotation interface — October 22, 2026

The approved floating toolbar and note editor are implemented in the shared presentation for both routes. Validation ran against the uncommitted runtime bytes, using project-local dependencies, headless Chromium, hidden macOS Electron windows, synthetic data, private test profiles and offline Pi sessions.

| Command | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run typecheck` | Passed |
| `npm run check:package` | Passed: 29 fixed resources and 88 relative imports in 79 source files; frozen catalogs and canonical token exports preserved |
| `npm test` | 176 passed, one existing foreground walkthrough skipped |

Six new presentation regressions cover the stationary details toggle and minimized draft, original editor-node restoration and independent image choices, replaced-node refusal, screenshot changes after undo, surviving draft/image preservation, and the writing area's height after input. Existing presentation coverage was migrated to the accessible icon buttons without removing its delivery, geometry, theme, cancellation, or restoration assertions.

Native tests additionally exercised delete/undo/redo through real capture and delivery, and hidden/minimized None notes through zero-capture submission. The full suite retained capture refusals, input isolation, draft/focus restoration, stale references, explicit reconnect, delayed cleanup, normal close/quit and actual-launcher terminal regressions.

The first full run passed 172 tests and failed the native drag-across-card-boundary regression, with the existing foreground skip. The fixed local drag hook now forwards only an already active owned drag through the existing guarded pointer path; it does not release product guards or dispatch product input. The focused native recheck passed. Independent review also found stale surviving-note state in undo and upstream textarea shrinking; both were reproduced with failing tests, fixed, and independently rechecked before the passing final suite.

The dependency picker file and hash remain unchanged. Evaluation adds a fixed local annotation-state hook after hash verification. New SVG copies retain their v4.6.0 Apache 2.0 license and provenance. No tool/wire schema, synthetic policy/catalog, product authentication, provider configuration, global installation or distribution was changed. Earlier uncommitted screenshot corrections remain included.

This verifies hidden macOS development workflows. It does not establish foreground focus, packaged/Windows support, live-provider acceptance, or owner-profile behavior. No owner application was restarted, and no commit, push, global installation or publication was performed. The migration records below describe earlier runs.

## Current status

The source transfer, application checks, and independent source review are complete. Final verification matched all 129 package identities and 815 baseline-backed original identities. Publication remains limited to the approved new private repository. Actual publication receipts belong to the private migration journal. Memory-removal limits remain in `MIGRATION.md`.

The application delta contains exactly 81 transferred file removals and three shared edits. All other 815 baseline identities remain unchanged. The check preserves the owner's pre-existing missing `WORKFLOW.md`.

## Standalone package results

These checks passed against the current runtime source:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `node scripts/check-package.mjs` | Passed. Sixteen fixed identities and 85 relative imports across 77 source files |
| `npm test` with an isolated home | 166 passed, one existing foreground walkthrough skipped |
| Focused catalog, privacy, native input, and crop matrix | All 16 passed before the initial full run. The current full run repeats these cases |
| Local dependency audit after SDK alignment | 136 packages, zero reported vulnerabilities |

The full run covered real offline Pi tool registration and delivery. Native checks covered Crop, zero-capture None, input guards, draft and focus restoration, diagnostics, cancellation, disconnect, normal close, delayed cleanup, and explicit reconnect. Ordinary launch advertised no bridge. Packaged setup refused before registration.

The package retains all 25 legacy states and 36 legacy control labels. The controlled sample adds eight exact states and one theme control. Its fixed four hover and active paint exceptions remain unchanged. Package checks verify the original strict policy, tokens, licenses, icons, picker, legacy baseline, and sample inputs.

The test environment uses matching Pi SDK 1.1.0 packages. The host SDK remains a peer. Electron 44.4.5 and the Playwright headless browser belong to this project. Automated checks used private test homes and isolated profiles. No owner Chrome profile or existing app instance formed part of these checks.

## Terminal lifecycle correction

The first independent source review requested one launcher correction. Terminal signals could reach Electron and its helpers directly. A real private terminal regression then exposed helper termination and an empty native capture. The startup control passed on the original launcher.

The launcher now isolates Electron's process group and ignores terminal input in the child. Its referenced IPC channel requests normal quit and waits for Electron. App shutdown also selects actual bridge settlement. Ordinary bounded cleanup keeps its existing deadline behavior.

All 21 focused connection, startup, and terminal checks passed after these fixes. The terminal checks use Python 3.9.6, the actual launcher, a private pseudo-terminal, and hidden windows. They cover terminal Ctrl+C and foreground-group SIGTERM and SIGHUP. A capture remains pending beyond six seconds. Revocation occurs first. One cleanup receipt and normal exit follow actual capture settlement.

The current full suite passed 166 tests and retained the existing foreground skip. The independent R1 recheck passed Standards and Spec with no remaining must-fix finding. The author verified final source and all relied-on context identities. Failed private fixture disposal is separate from these results. The author retained its evidence and did not count forced test-process termination as bridge cleanup.

## Original application results

The original application's type check, normal build, and root suite passed. The root suite passed 375 tests and retained ten existing skips. The independent preview gate passed its source, license, type, build, notice, isolation, and browser checks. Its browser suite passed 24 tests and retained one existing skip.

The post-build check verified all 815 unrelated baseline identities, including generated canonical theme files. The application's Git index remains unchanged. No application commit or push forms part of this migration.

## Corrections before the passing run

The initial full run passed 151 tests and failed 13 legacy fixture checks. The fixes corrected synthetic fixture behavior, not privacy policy:

- Remove the icon file's terminal newline from generated button markup. This restores the literal `Connect` selection.
- Record synthetic operations through separate fixed, no-argument channels. Keep the existing operation assertions.
- Verify that a native Settings click opens the actual dialog. Do not depend on the former preview's status widget.
- Apply test media to the actual Settings selector. Preserve every refusal and zero-capture assertion.
- Place injected geometry controls inside the visible dialog. Preserve target dimensions, native pointer events, and crop assertions.

Private evidence retains the failed reports, pointer hit tests, exact source changes, and subsequent passing runs. No new skip, broader catalog rule, or privacy exception resolved a failure.

## Historical feasibility evidence

Before extraction, three isolated native checks passed against a private ordinary host build. Ordinary startup advertised no bridge. External opt-in covered native window close, app quit, and a second instance in the same real offline Pi session.

Those checks covered stale-reference refusal, one current note, no old unsent note, draft preservation, and normal exit. All 899 original source identities remained unchanged during that proof. This historical evidence does not validate the extracted bytes.

## Remaining acceptance

Independent review and final identity checks passed. The owner approved one initial commit and push to the new private repository after fresh-state checks. Keep the verified commit and remote readback in the private migration journal. Preserve skips, failed evidence, and memory-removal limits.

No result grants live-provider acceptance, private-company data access, support for arbitrary Electron apps or Windows, signed distribution, npm publication, global Pi installation, or a source-history rewrite.
