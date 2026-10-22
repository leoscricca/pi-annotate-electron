# Spec Delta

## Purpose

Let the developer agent inspect and operate the selected local development UI, reproduce frontend failures, and verify results. Use the owner's connection as UI access consent without extra content filters or per-action approval prompts.

## ADDED Requirements

### Requirement: UI tools use the selected connection

The `electron_ui` tool MUST expose bounded UI inspection, screenshots, element-based click and text input, scrolling, keyboard input, and frontend diagnostics. Every request MUST use the source session's selected live connection. Missing, stale, unknown, excessive, or cross-target requests MUST fail without execution.

#### Scenario: Inspect without a connection
- **WHEN** an agent requests a UI snapshot before the owner connects a window
- **THEN** the tool reports that a connection is required without choosing or opening a target

#### Scenario: Inspect and operate the connected UI
- **WHEN** the owner connects a verified window and the human picker releases input
- **THEN** the agent can inspect the selected UI and operate its controls through current element references

### Requirement: Trusted local UI access without extra guards

Owner connection MUST grant access to the selected development UI without bridge-specific content masking, a public-content catalog, or per-action approval prompts. Output MUST remain bounded to that target and request. Documentation MUST state that visible content, screenshots, and diagnostics can reach Pi's configured model, not necessarily a local model.

#### Scenario: Inspect normal development content
- **WHEN** the connected app contains a synthetic draft and ordinary development UI text
- **THEN** the tool exposes the requested UI facts without a content-classification refusal or an extra approval prompt

#### Scenario: Explain the local trust boundary
- **WHEN** the owner reads connection documentation
- **THEN** the documentation distinguishes a local app connection from local-only model processing

### Requirement: Explicit and verified image capture

Screenshots MUST require an explicit image request or per-note image choice. No-image annotation MUST perform no screenshot operation. Images MUST match the selected window, document, requested region, viewport, scroll, and scale without bridge-specific content masking. A capture failure MUST NOT produce a successful image path. Private files and retained evidence MUST have explicit ownership.

#### Scenario: Request a UI screenshot
- **WHEN** the agent explicitly requests an image of the connected window or a selected element
- **THEN** the tool returns a verified private image of that current target, or a precise capture failure

#### Scenario: Annotate without an image
- **WHEN** the owner submits a note with images disabled
- **THEN** the bridge delivers the note and element metadata without any screenshot operation

### Requirement: Normal UI input without a second approval layer

Input MUST target the selected window through current references or a valid focused input. The bridge MUST NOT add a per-control action classifier or approval prompt. Product behavior and existing host checks MUST remain unchanged. Human annotation selection MUST never activate the selected product control.

#### Scenario: Operate a normal control
- **WHEN** the agent clicks Settings, types in a field, or changes the theme after the picker exits
- **THEN** normal app behavior occurs without a bridge-specific approval prompt

#### Scenario: Preserve an existing host check
- **WHEN** the product already requires confirmation or rejects a UI request
- **THEN** automation follows that existing product behavior without bypassing the host or fabricating an approval

### Requirement: Bounded frontend diagnostics

Diagnostics MUST cover console errors, JavaScript exceptions, and network failure metadata for the selected frontend. Collection MUST start only for the active connection and stop on revocation. Diagnostics MUST add no UI-content redaction filter. Network output MUST use URL, status, type, and failure facts, not headers, cookies, or bodies. Omission and truncation MUST remain visible.

#### Scenario: Reproduce a frontend failure
- **WHEN** an approved UI action produces a JavaScript exception and a failed frontend asset request
- **THEN** the agent receives bounded error messages, source locations, and failure metadata for that target without unrelated historical events

#### Scenario: A diagnostic exceeds its size limit
- **WHEN** a console argument, exception value, or network event exceeds the fixed output budget
- **THEN** the tool reports truncation or omission instead of returning an unbounded payload

### Requirement: Frontend control does not expose a backend debugger

The bridge MUST NOT expose a Node inspector, main-process evaluation, arbitrary renderer evaluation, or generic protocol forwarding. Filesystem, process, credential-storage, and product SDK APIs MUST remain unavailable. It MUST preserve sandbox, context isolation, the Node-disabled renderer, and guarded product IPC. Backend debugging MUST remain a separate capability.

#### Scenario: Request arbitrary execution
- **WHEN** a request asks for code evaluation, arbitrary protocol forwarding, filesystem access, or a main-process debugger operation
- **THEN** the bridge rejects the request before execution and leaves product authority unchanged

### Requirement: Serial input and observed outcomes

Human annotation and agent input MUST have exclusive ownership. UI commands MUST report observed results, refusals, timeouts, and unknown outcomes separately. A dispatched click MUST NOT prove navigation or task completion. Unknown mutation outcomes MUST require fresh inspection before retry. Tools MUST NOT replay a timed-out operation automatically.

#### Scenario: Agent input during annotation
- **WHEN** an agent requests a click while the owner selects an annotation target
- **THEN** the tool reports busy without moving focus or changing the app

#### Scenario: A click outcome is unknown
- **WHEN** input dispatch times out after possible app mutation
- **THEN** the tool reports an unknown outcome and requires inspection rather than automatic retry

### Requirement: Restore only owned temporary effects

Cleanup MUST remove bridge-owned overlays, listeners, input guards, and diagnostics. It MUST preserve original draft, selection, focus, scroll, layout, and accessibility state where original nodes remain. It MUST NOT undo intentional approved agent actions or overwrite later user changes. Unknown restoration MUST block readiness.

#### Scenario: Cancel annotation after UI interaction
- **WHEN** an approved theme change precedes a human annotation and the owner cancels the picker
- **THEN** cleanup preserves the theme change and the pre-picker draft while removing only annotation effects

### Requirement: Evidence distinguishes connection from acceptance

Acceptance MUST demonstrate source-pane feedback, an opened image, zero-capture text delivery, and UI input without extra approval prompts. It MUST also demonstrate frontend diagnostics, unchanged host checks, and non-destructive disconnect. Routine checks MUST use hidden isolated fixtures. Foreground, live, private-data, native Windows, and packaged acceptance MUST NOT follow from those checks.

#### Scenario: Evaluate automated evidence
- **WHEN** hidden fixtures pass connection, input, diagnostics, target-isolation, and teardown checks
- **THEN** the record accepts only those observed behaviors and keeps unrun owner or platform checks explicit
