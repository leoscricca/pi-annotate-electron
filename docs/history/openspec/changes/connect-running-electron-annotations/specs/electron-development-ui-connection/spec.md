# Spec Delta

## Purpose

Connect the intended developer Pi session to one verified existing development window. Start human annotation immediately and retain a safe connection for UI tools without app replacement.

## ADDED Requirements

### Requirement: Verified compatible development targets

Discovery MUST list only reachable targets with a verified compatible bridge. Initial support MUST cover this project's macOS development app. Discovery MUST NOT read page content, credentials, browser profiles, or unrelated process memory. Ordinary built launches and packaged apps MUST NOT advertise the bridge.

#### Scenario: Discover an available app
- **WHEN** an updated development app advertises a compatible bridge
- **THEN** discovery returns its safe app label, opaque instance and window identifiers, and supported capabilities without page content

#### Scenario: No compatible target exists
- **WHEN** no compatible bridge responds, including an older app without a bridge
- **THEN** the command reports no connectable window without a launch, restart, reload, port scan, or attempted injection

### Requirement: Single-window connection and multiple-window choice

Without a selected connection, the owner command `/annotate-electron connect` MUST connect immediately when exactly one eligible window exists. Multiple eligible windows MUST require an explicit keyboard-accessible choice for a new connection. A cancelled choice MUST collect no page content. Verification MUST repeat after selection so stale choices cannot change the target.

#### Scenario: Connect the only window
- **WHEN** the owner invokes connect and exactly one eligible window exists
- **THEN** the command connects that window without a chooser

#### Scenario: Choose among several windows
- **WHEN** several eligible windows exist, including windows from the same app
- **THEN** the command displays distinct safe labels and connects only the chosen live identity

### Requirement: Immediate annotation activation

A successful connection MUST activate the picker without a second command or document reload. No image MUST be the default annotation choice. Connection MUST report picker readiness separately from note delivery. Human selection MUST suppress product operations and shortcuts. Agent input MUST remain blocked while the human picker owns input.

#### Scenario: Connect and annotate
- **WHEN** the selected window completes connection and picker preparation
- **THEN** the owner can select an element and submit a note without a separate start command

#### Scenario: Resume after the picker closes
- **WHEN** the source owner invokes connect after the picker closes or submits and its selected connection remains live and idle
- **THEN** the command starts the None picker on that same connection without discovery, target choice, app reload, or disconnect

#### Scenario: Repeat connect while the picker is active
- **WHEN** the source owner invokes connect while that connection's picker is already active
- **THEN** the command reports the active picker and preserves its request, notes, mode, and selected window

#### Scenario: Resume is not ready or no longer valid
- **WHEN** connection preparation, picker preparation, cancellation, or cleanup remains pending, or the selected connection is blocked or retired
- **THEN** connect reports the busy, blocked, or retired condition without replacement or automatic reconnection

#### Scenario: Preparation fails
- **WHEN** the picker cannot establish the current target identity or restore its temporary effects
- **THEN** the command reports the failed or blocked state without claiming picker readiness or successful feedback

### Requirement: Private and identity-bound connection

The bridge MUST authenticate its local client and server. It MUST bind one connection to the source Pi session, app instance, window, document generation, and protocol version. Secrets and transport addresses MUST NOT enter model-visible metadata. Another client MUST NOT replace an active owner or inherit its requests.

#### Scenario: A second pane requests the same window
- **WHEN** another Pi pane attempts connection while the window has an active owner
- **THEN** the bridge reports the window as busy without replacing the first connection

#### Scenario: Refuse an unverified registration
- **WHEN** discovery finds a stale, malformed, incompatible, or unauthenticated registration
- **THEN** the command excludes that registration without reading its window content or accepting its commands

### Requirement: Cleanup before native window close

An owner native window-close intent MUST retire the annotation lease before renderer destruction. Actual pending operations and cleanup MUST settle before that close. A closing target MUST NOT accept a replacement connection. Reporting deadlines MUST NOT permanently reject that close. An actual cleanup failure MUST block it.

#### Scenario: Close a connected native window
- **WHEN** the owner closes a native window with an idle connection or an active picker
- **THEN** the annotation lease retires before renderer destruction and app shutdown does not await cleanup in a destroyed renderer

#### Scenario: Close while actual work remains pending
- **WHEN** a native capture remains pending and the owner requests window close more than once
- **THEN** the window remains alive until that work and cleanup settle, without late success or another connection

#### Scenario: Cleanup succeeds after a reporting deadline
- **WHEN** a reporting deadline expires while native capture remains pending, and actual work and cleanup later succeed
- **THEN** the original native close completes without another owner action, replacement connection, or late operation success

#### Scenario: Actual cleanup fails
- **WHEN** owned cleanup rejects instead of merely exceeding a reporting deadline
- **THEN** native close remains blocked, the renderer remains alive, and another connection cannot replace the retired lease

### Requirement: Revocation on target or session change

Navigation, reload, window destruction, transport loss, Pi-session switch, fork, tree navigation, and shutdown MUST revoke pending input and delivery. Old references and late results MUST fail. The bridge MUST NOT follow a replacement page or reconnect automatically. Unknown cleanup MUST block replacement until actual settlement.

#### Scenario: Reload during a request
- **WHEN** the document reloads before an annotation or UI operation completes
- **THEN** the old request cannot deliver success and the new document requires a new owner connection

#### Scenario: Switch the developer Pi session
- **WHEN** the initiating pane switches sessions while a note is pending
- **THEN** neither session receives that note as a successful new request

### Requirement: Non-destructive disconnect

`/annotate-electron disconnect` MUST revoke the connection and remove only its owned picker, input guards, and diagnostics. It MUST preserve the attached app, unrelated debugger clients, and user state. The existing `close` command MUST detach an attached target, never close its window. Unconfirmed cleanup MUST remain explicit and retain evidence.

#### Scenario: Disconnect an existing app
- **WHEN** the owner disconnects with Settings open and a draft present
- **THEN** the app remains open with Settings and the draft intact, and the bridge reports actual cleanup status

#### Scenario: An unrelated debugger exists
- **WHEN** another debugging client already owns the target or causes detachment
- **THEN** connection refuses or revokes its own operations without stealing or closing that client

### Requirement: Source-session feedback without edit authority

Notes MUST reach only the source developer Pi session. Comments, element facts, and images MUST remain untrusted review input. Submission MUST NOT grant source edits, tool execution, product operations, or publication. Literal text MUST NOT expand prompt templates. Tool responses MUST NOT create duplicate annotation messages.

#### Scenario: Submit a literal note
- **WHEN** the owner submits a permitted element and the comment "Reduce the Settings button padding"
- **THEN** the source pane receives that exact comment as feedback without a padding edit or product action

### Requirement: Separate legacy ownership and behavior

The synthetic `open` route MUST retain its owned-launch lifecycle, strict content catalog, and capture guards. The attached route MUST NOT reuse child-process close authority. Chrome annotation transport, queues, profiles, and commands MUST remain unchanged. Discovery MUST grant no access.

#### Scenario: Retire both target kinds
- **WHEN** a Pi session retires a synthetic owned launch or an attached existing window
- **THEN** the synthetic route uses its existing scoped close while the attached route detaches without app closure

### Requirement: Truthful connection status

Status MUST distinguish no target, selection, connection preparation, picker active, connected idle, busy, revoked, failed, and cleanup blocked. A reachable bridge MUST NOT establish tested UI control or successful annotation. Discovery and command messages MUST use bounded diagnostics without private content.

#### Scenario: Only the handshake succeeds
- **WHEN** the bridge handshake passes but picker preparation or UI verification fails
- **THEN** status reports that narrower result rather than a successful end-to-end connection
