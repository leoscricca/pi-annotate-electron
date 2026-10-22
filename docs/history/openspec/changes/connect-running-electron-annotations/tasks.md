# Tasks

The owner selected compact-toolbar mockup 3 and requested implementation on 21 October 2026. The [presentation follow-up plan](compact-toolbar.md) tracks that bounded work separately from the earlier verification records below. Issue #28 remains open with its existing relationships and acceptance gates.

## 1. Confirm the implementation baseline and interface

- [x] 1.1 Verify owner approval for plan publication and a subsequent apply request before source changes. Record the immutable published plan, PRD, and source baseline. Publication scope must include every outgoing commit, not silently publish the two existing local prerequisite commits.
- [x] 1.2 Define fixed connection, UI-operation, result, and target-kind schemas. Verify malformed, excessive, stale, cross-target, and non-UI requests fail through protocol tests. Document the interface and transport limits with those tests.

## 2. Add the private development connection

- [x] 2.1 Implement the app-owned registry, authenticated local socket, discovery handshake, and exclusive window connection. Verify ownership, permissions, symlink refusal, stale registrations, incompatible versions, and two-client contention in isolated temporary directories.
- [x] 2.2 Add the development-only host hook and any separate developer preload registration. Verify ordinary built launches and packaged targets expose no listener, bridge API, or picker assets. Document automatic development availability and manual restart for older instances.
- [x] 2.3 Bind work to the Pi session, app, window, document generation, and request. Verify navigation, reload, debugger detachment, transport loss, session changes, timeout, and delayed cleanup races. Document blocked cleanup without app termination or automatic reconnect.

## 3. Add UI tools and frontend diagnostics

- [x] 3.1 Implement bounded snapshots, current element references, clicks, text input, scrolling, and keyboard input through `electron_ui`. Verify normal Settings and theme behavior without masking or extra approval prompts. Preserve existing host checks and document the UI-access scope.
- [x] 3.2 Add connection-scoped console errors, JavaScript exceptions, and failed-request metadata. Verify deliberate frontend failures, source locations, output limits, stopped collectors, and target isolation. Document model data flow and the absence of headers, cookies, and network bodies.
- [x] 3.3 Add explicit window and element screenshots with current geometry and verified private files. Verify capture failures, stale targets, zero-capture text requests, permissions, and evidence ownership. Open an actual generated image and document retention and scoped removal.

## 4. Integrate the existing annotation command

- [x] 4.1 Add `/annotate-electron connect` with zero, one, and multiple-window behavior. Verify immediate single-window connection, keyboard selection, cancelled choices, stale selections, and refusal without interactive owner context. Prevent automatic target selection by model tools.
- [x] 4.2 Activate the picker immediately and retain source-session Submit or Cancel delivery after the command returns. Verify literal notes, Crop, None, input suppression, late-result refusal, and exactly-once messages through the actual adapter. Preserve the pinned picker and document the attached workflow.
- [x] 4.3 Add disconnect and attached-mode close without app closure. Verify Settings, the exact draft `Synthetic annotation draft`, focus, selection, and app responsiveness after cleanup. Verify agent input reports busy during annotation. Preserve Chrome tooling and the legacy synthetic close and content guards.

## 5. Verify the integrated UI journey

- [x] 5.1 Exercise an already-open hidden development fixture through discovery, connection, annotation, UI tools, diagnostics, and detach. Verify both themes at 980, 1280, and 1440 pixels, keyboard choice, state restoration, and unchanged unrelated windows. Keep native focus claims separate.
- [x] 5.2 Run typecheck, ordinary build, root tests, the legacy annotation gate, and independent preview checks. Run strict OpenSpec, reference, whitespace, bundle-exclusion, dependency, and notice checks. Record actual commands, failures, skips, identities, and evidence. Leave the owner's current window and home unchanged.
- [x] 5.3 Obtain separate owner approval for a fresh visible development-window walkthrough. Prove source-pane note delivery, an opened crop, and keyboard None with zero captures. Verify agent input, frontend diagnostics, and non-destructive detach. Use synthetic data and no live provider request. Do not reuse the currently protected synthetic window.

## 6. Review and reconcile delivery

- [x] 6.1 Freeze the source, task delta, context, and successful checks for independent Standards and Spec review. Resolve findings and verify final source and relied-on context identities before acceptance. Do not restore the rejected content filter or approval layer as an unapproved review preference.
- [x] 6.2 Update developer documentation, PRD status, task evidence, and the linked GitHub issue and Project together. Verify scope, task order, relationships, and actual remaining limits. Keep delivery open until required evidence and the project's acceptance conditions hold.

## Workflow follow-up

[Issue #28](https://github.com/leoscricca/cnc-mendix-agent/issues/28) is Open/In Progress in Project 2 under parent #1, without native blockers.

Planning review `result:electron-annotation-review#7` passed Standards and Spec without findings. Main verified the reviewed source and context identities before publication.

The owner approved publication of the seven-file plan and all nine existing outgoing commits, then implementation. Published plan and PRD baseline: [`fa52644694adf5f12a40695d1d0241f8ffa2adf8`](https://github.com/leoscricca/cnc-mendix-agent/commit/fa52644694adf5f12a40695d1d0241f8ffa2adf8). Main compared all seven remote files with the reviewed bytes. Application source starts from that commit, with unrelated local edits preserved.

- Implementation is authorized. Feature behavior remains unverified until its task evidence passes.
- The owner approved all remaining tasks for unattended completion, including a fresh visible synthetic walkthrough. The protected original window remains excluded.
- Tasks 4.1 through 4.3 passed typecheck, 27 adapter cases, and four hidden native cases. The actual registered command delivered one verified crop. None performed zero captures. DOM focus, selection, and the exact draft survived cleanup. Cancellation joined pending feedback before acknowledgment and prevented its late delivery.
- Task 5.1 passed eight native checks. Both themes passed at 980, 1280, and 1440 pixels. The checks verified diagnostics, state restoration, an unchanged witness window, pending-capture cancellation, and note drag. Native foreground focus remains separate.
- Task 5.2 passed typecheck, ordinary build, and 490 root tests. Eleven tests remained skipped, including ten historical diagnostic cases and the separately approved visible walkthrough. The root suite includes the legacy annotation gate. A first run passed 489 tests but encountered the runtime's inherited-credential guard. The clean child environment resolved that test setup failure without a source change.
- The independent preview passed 24 browser tests. One historical palette-baseline comparison remained skipped. Notice and isolation checks passed. A restrictive verification-shell umask changed 95 generated license-file permissions. Main verified every affected byte against the baseline and restored only the original permissions. All 856 unrelated inputs now match their baseline.
- Strict OpenSpec, references, whitespace, dependency, and ordinary-bundle exclusion checks passed. The real offline Pi SDK smoke check also passed through an authentic agent tool call. Three files received confirmed clean LSP results. Nine LSP checks remained inconclusive, with no returned diagnostics. Typecheck and runtime checks provide the separate verification evidence.
- The final current-byte run passed typecheck and 499 root tests. It included the separately approved visible walkthrough. Ten historical diagnostic cases remained skipped.
- The real offline Pi session received two annotation messages and one crop. The walkthrough opened the actual crop and the official Pi source-session export. Keyboard None performed zero native captures. Agent UI actions, frontend diagnostics, the exact draft, and non-destructive detach passed.
- All three fresh windows reported visible. The owner did not personally observe this unattended run. No live provider or protected-window operation occurred.
- Initial implementation review `result:electron-annotation-review#8` requested two corrections. Retired references now use a fresh connection namespace. Child-node and label-ID scan limits now report omissions. Eight focused cases passed after six cases first reproduced the defects. The cases verify reconnect, reload, another window, zero retired input or capture, successful current operations, and exact scan boundaries.
- The corrected source passed typecheck, normal production builds, all 499 root tests, and 24 preview tests. Ten historical root cases and one preview baseline comparison remained skipped. Notice, isolation, exclusion, reference, whitespace, dependency, and all 856 protected-input checks passed. The visible real offline SDK walkthrough passed again.
- The first fix check passed all root cases, but its test-mode environment added React DevTools code to the preview bundle. The normal production environment resolved that check setup failure. The isolation rule and application source remained unchanged.
- A focused diagnostic check returned two retained `innerText` advisories. One server probe remained inconclusive. Typecheck passed separately.
- Implementation recheck `result:electron-annotation-review#9` passed Standards and Spec with no findings. Main verified all 35 reviewed task files and 22 supporting files against their earlier identities. All 856 protected inputs remain unchanged.
- All 16 initial local implementation and evidence tasks are complete. A separate bounded metadata recheck applies to these completion records before final technical acceptance. Main retains its actual result and final identity receipts with the private evidence.
- The PRD, developer documentation, task evidence, and issue describe the verified local implementation and its remaining acceptance gates. Issue #28 remains Open/In Progress. The implementation is not merged or separately accepted by the owner.
- The publication approval covered the reviewed plan and existing history only. It does not authorize a later implementation commit or push.
- Do not infer additional authority from Project status. Preserve the owner's existing window and all separate acceptance gates.
- Publication of implementation, merge, archive, installation, deployment, live-provider use, and company-data acceptance need their own approved scope.
- Parent #1, related #26 and #19, and existing pilot prerequisites retain their current states and dependencies. This change adds no blocker to another issue.

## Owner feedback follow-up: Resume the picker

The owner reported that the picker close button removed annotation controls but a later `connect` failed because the app connection remained active. The approved correction keeps that connection and reopens its idle picker on another owner `connect`. An already active picker retains its request, notes, and mode. Pending connection, preparation, cancellation, cleanup, or retirement still prevents resume. Another target requires an explicit disconnect first.

Three regression cases first reproduced the failure. The corrected adapter passed its first 19-case check. A real hidden Electron check closed the actual X button, resumed through the registered Pi command, and delivered one source-session note. It verified one discovery, one connection, the same binding, an unchanged draft, and an app that remained open after disconnect.

Picker-resume verification passed typecheck, the normal production build, 505 root tests, and all 24 preview browser cases. The root run includes all 22 adapter cases and the real X-close/resume flow. Ten historical diagnostic cases and the separately gated foreground walkthrough remained skipped. One historical preview baseline remained skipped. All 884 protected paths outside the seven-file follow-up remain unchanged.

The follow-up requires current full checks and independent review before technical acceptance. Its final review and identity receipts remain with the private evidence. The initial 16-task acceptance does not validate these later bytes. No new foreground walkthrough, provider operation, publication, or protected-window action is part of this correction.

## Owner feedback follow-up: Native window shutdown

The owner reported that native window close, Quit, and terminal interruption did not exit the current app. Fresh hidden diagnostics reproduced a window-close race with idle and active annotation connections. The debugger detached before renderer destruction, but isolated cleanup began after that detachment and never returned. The retained lease then blocked app shutdown. Direct Quit and unconnected-window controls passed.

The development host now revokes the annotation lease before native window destruction. Actual operations and cleanup must settle while the renderer remains alive. The closing target cannot accept another connection. Duplicate close requests join one cleanup. Pi disconnect still preserves the attached app. Unknown cleanup remains explicit and blocked.

Both native close regressions first failed against the original source. The corrected idle-close, active-picker-close, and pending-capture/duplicate-close cases passed with typecheck. They verify normal process exit, revocation, exclusion from discovery, and actual work settlement before renderer destruction. The first corrected run reached normal app exit but its test collector queried a disposed Playwright handle. The collector now retains the known child process at launch. No application guard changed to bypass that evidence failure.

Six fresh hidden post-correction controls passed for Quit and native window close with no connection, an idle connection, and an active picker. Each process exited with code zero, no signal, and no forced fixture cleanup.

Initial shutdown verification passed typecheck, the normal production builds, 508 root tests, and all 24 preview browser cases. Ten historical diagnostic cases and the separately gated foreground walkthrough remained skipped. One historical preview baseline remained skipped. All 885 protected paths outside this six-file follow-up remain unchanged.

The first full command passed runtime checks but strict OpenSpec flagged an overlong requirement. The native close requirement now has its own heading and scenarios. Strict validation passed again. No runtime or test byte changed for that document correction.

The owner chose to leave the current stuck instance open. Main performed no current-instance or protected-window action. Current full checks and independent review remain necessary before technical acceptance of this follow-up. Its actual result and final identities remain with the private evidence. Earlier acceptance does not validate these later bytes.

## Independent review follow-up: Actual cleanup settlement

Independent review found R1 in the first shutdown correction. Native close cached a bounded reporting promise, so a five-second timeout permanently blocked it even after actual cleanup succeeded. The contract requires actual settlement, not a permanent timeout latch. Real cleanup failure must still block close and replacement.

The bounded remedy separates actual native-close settlement from the reporting deadline. Ordinary revocation and disconnect keep their existing bounded reports. The owner's current instance remains open and untouched. New beyond-deadline and real-rejection checks, full verification, and a recheck in the saved reviewer session form part of this remedy. The earlier 508-case result does not establish R1 acceptance.

The new beyond-deadline regression first failed after actual capture completion. The real-cleanup-rejection case already passed against that source. After correction, typecheck and all five focused native cases passed. The late case first observes the existing bounded disconnect deadline, then releases actual capture. The original native close completes without another owner action. Duplicate closes cannot release the renderer or grant another connection while actual work remains pending.

The real-rejection case verifies that the window remains alive, delivery stays revoked, and discovery excludes the target. Its known fresh fixture then requires its own recorded termination. The receipt reports failed cleanup and non-graceful fixture termination, not normal app closure. That fixture and all failed evidence remain intact. No owner instance or historical process is part of fixture cleanup.

R1 verification passed typecheck, the normal production builds, 510 root tests, and all 24 preview browser cases. The root skips cover ten historical diagnostics and the separately gated foreground walkthrough. One historical preview baseline remained skipped. Six fresh healthy Quit/window-close controls exited with code zero, no signal, and no forced cleanup. Strict validation and preservation checks passed. All 884 protected paths outside this seven-file remedy remain unchanged.

The saved reviewer session must recheck the frozen remedy before technical acceptance. Its actual result and final identity receipt remain with the private evidence. No publication or owner-instance recovery follows from these checks.
