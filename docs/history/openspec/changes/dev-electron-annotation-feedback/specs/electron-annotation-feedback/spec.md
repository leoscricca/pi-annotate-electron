# Spec Delta

## Purpose

Let the owner select elements in an eligible development Electron workspace and send review-only notes with optional element images to the intended Pi session. Keep normal application behavior and the current Chrome annotation workflow unchanged.

## ADDED Requirements

### Requirement: Explicit eligible development target

Annotation MUST require an explicit owner action and one owned synthetic development launch. The target MUST identify its application, window, document, isolated home, and profile. The adapter MUST refuse private app sessions, packaged targets, arbitrary URLs, and unverified endpoints before injection or capture.

#### Scenario: Start a synthetic annotation session
- **WHEN** the owner selects a verified development launch with a temporary synthetic home and profile
- **THEN** annotation binds to that launch's intended workspace window and displays its synthetic status

#### Scenario: Refuse an unrelated target
- **WHEN** a request names another app, a private existing session, or an endpoint without a matching owned launch
- **THEN** no annotation code is injected and no image or page content is collected

### Requirement: Owner-controlled visibility

Routine automated checks MUST remain hidden or headless and use isolated profiles. A visible synthetic walkthrough MUST require explicit foreground approval. Normal startup visibility and test isolation MUST remain unchanged.

#### Scenario: Run routine checks
- **WHEN** the automated annotation checks start without foreground approval
- **THEN** no Electron window or browser takes desktop focus

#### Scenario: Show the owner the annotation workspace
- **WHEN** the owner explicitly approves a visible synthetic walkthrough
- **THEN** only its owned development window becomes visible and the ordinary app session remains untouched

### Requirement: Unchanged product authority

The capability MUST preserve the sandbox, context isolation, the Node-disabled renderer, product IPC admission, and host ownership of the app Pi session. It MUST NOT expose authentication, filesystem, process, or generic evaluation commands through annotation. Normal bundles and launches MUST contain no annotation entry or new preload API.

#### Scenario: Inspect the ordinary application
- **WHEN** the normal application starts without the developer launcher
- **THEN** annotation controls, annotation preload APIs, and annotation listeners are absent

#### Scenario: Attempt a privileged annotation command
- **WHEN** an annotation request contains an authentication action, arbitrary path, or executable command
- **THEN** the annotation boundary refuses it without invoking a product operation

### Requirement: Non-operational element selection

The owner MUST be able to select a visible element and enter a literal comment. Active annotation MUST suppress app operations and shortcuts. Etch, DOM edit capture, and full-page delivery MUST remain unavailable. The picker MUST NOT change application content beyond its own temporary overlay effects.

#### Scenario: Select an operational button
- **WHEN** the owner selects Connect Codex while the picker is active
- **THEN** the button becomes an annotation target without consent, login, or provider activity

#### Scenario: Annotate an open Settings dialog
- **WHEN** the owner selects a control in the existing Settings dialog and edits the note
- **THEN** the note receives keyboard input without triggering an application shortcut or changing the dialog's state

### Requirement: Bounded element metadata

Each submitted note MUST identify its literal comment, selected element, app target, document, request, and viewport. Metadata MUST use a fixed bounded field set. Complete HTML, input values, arbitrary attributes, secrets, provider data, and unrelated DOM content MUST NOT enter feedback.

#### Scenario: Submit a literal note
- **WHEN** the owner submits "Reduce the Settings button padding" on the synthetic Settings control
- **THEN** the intended Pi session receives that exact comment with the selected element's selector and permitted layout and accessibility facts

#### Scenario: Reject an invalid payload
- **WHEN** feedback contains an unknown command, excess data, or fields outside the permitted schema
- **THEN** delivery fails with a bounded diagnostic and no partial success message

### Requirement: Selected element image or no image

The owner MUST be able to choose an element crop or no image. A crop MUST depict the current selected element, not an unrelated window or stale geometry. The no-image path MUST perform no screenshot operation. A capture error MUST NOT produce a success claim or a nonexistent image path.

#### Scenario: Deliver the actual crop
- **WHEN** the owner enables an element image and submits a valid selection
- **THEN** Pi receives the corresponding verified local PNG and can open the actual selected-element image

#### Scenario: Deliver text without an image
- **WHEN** the owner selects no image and submits a note
- **THEN** only the permitted metadata and comment are delivered and no screenshot is taken

#### Scenario: Refuse stale capture geometry
- **WHEN** the selected element disappears, changes identity, or moves during capture
- **THEN** the capture is refused and the owner must select the element again

### Requirement: Capture privacy

Only synthetic development content is eligible in this slice. Visible authentication challenges, secret inputs, private project content, and unknown provenance MUST block capture. Any temporary full-renderer image needed for a crop MUST remain transient and MUST NOT become a delivered full-page image or log entry.

#### Scenario: A challenge appears after selection
- **WHEN** an authentication challenge becomes visible before submission or capture completes
- **THEN** delivery is revoked and no challenge image, code, or text is saved or sent

#### Scenario: Decline sensitive or unknown content
- **WHEN** the content policy cannot establish that the target contains permitted synthetic content
- **THEN** the adapter refuses capture rather than guessing that the content is safe

### Requirement: Intended Pi session and separate transport

Delivery MUST bind to the source developer Pi session and annotation request. The Electron route MUST remain separate from Chrome's annotation command, native host, shared socket, and queue. A stale, cancelled, or replaced session MUST NOT receive feedback as a new successful request.

#### Scenario: Keep two Pi panes separate
- **WHEN** another Pi pane and Chrome annotation session exist during an Electron capture
- **THEN** the Electron note reaches only its initiating pane and the Chrome connection remains unchanged

#### Scenario: Refuse a late result
- **WHEN** a result arrives after cancellation, timeout, or Pi-session replacement
- **THEN** it does not create a new annotation message or revive the old request

### Requirement: Navigation and generation revocation

The adapter MUST revoke a request on target closure, destruction, navigation, reload, or loss of its document identity. It MUST recheck transport and document identity before capture, file creation, and delivery. The adapter MUST NOT follow a different page or silently attach to another window.

#### Scenario: Reload during selection
- **WHEN** the selected Electron document reloads before submission
- **THEN** the old selection is cancelled and the new document requires a new explicit annotation request

### Requirement: Review-only feedback

Page Annotation and Recovered Pending Annotation content MUST remain untrusted review input. Submission can start a developer Pi response, but MUST NOT grant source-edit, publication, process-control, or product-operation authority. An implementation change still requires a separate explicit owner request.

#### Scenario: Receive an embedded instruction
- **WHEN** a comment, element label, attribute, or image contains an instruction to run a command or edit source
- **THEN** Pi treats it as quoted feedback and performs no such action without a separate owner request

### Requirement: Confirmed scoped teardown

Exit, cancellation, timeout, and failure MUST revoke the request and restore its owned overlay effects. App focus, draft, selection, layout, and accessibility state MUST return to their prior values where the original elements still exist. Unknown teardown or process outcomes MUST remain explicit and retain evidence. The adapter MUST NOT stop unrelated processes or app sessions.

#### Scenario: Exit without a note
- **WHEN** the owner cancels the picker with Settings open and a retained draft
- **THEN** the owned overlay and active input guards disappear, prior app state remains usable, and no note is sent

#### Scenario: Cleanup is unconfirmed
- **WHEN** an owned cleanup operation cannot confirm completion
- **THEN** readiness remains blocked and the adapter retains its identity and evidence without declaring success or killing an unrelated process

### Requirement: Owned evidence and honest readiness

Capture files MUST use an owned private directory and explicit identities. Documentation MUST disclose persistence, replay policy, and scoped removal. End-to-end readiness MUST require actual literal-note delivery, an opened image, no-image delivery, click suppression, and exit evidence. Install, load, doctor, or generic Connected states alone MUST NOT establish readiness.

#### Scenario: Report installed but unverified tooling
- **WHEN** package and load checks pass but no annotation reaches the intended Pi pane
- **THEN** the capability remains installed or configured, not end-to-end verified

#### Scenario: Remove only owned evidence
- **WHEN** the owner explicitly requests capture removal
- **THEN** only identified files from the owned capture directory are eligible and Chrome queues, other sessions, and historical evidence remain intact
