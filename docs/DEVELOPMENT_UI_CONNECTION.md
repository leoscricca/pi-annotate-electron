# Existing-window development UI connection

## Current implementation status

Source code implements the connection, frontend controls, diagnostics, screenshots, Pi commands, and attached picker. The standalone package includes its external launcher and isolated verification suite. See the [verification record](VERIFICATION.md) for actual package checks and their limits.

Historical host checks covered crops, camera-off notes, keyboard None, zero captures for None, and state restoration. These checks do not validate the extracted package. Historical plans and verification notes remain under `docs/history/openspec/changes/`.

[Issue 2](https://github.com/leoscricca/pi-annotate-electron/issues/2) tracks the transferred connection work. The [migration contract](MIGRATION.md) defines the new startup boundary. The [protocol reference](ELECTRON_DEVELOPMENT_UI_PROTOCOL.md) describes fields, limits, authentication, ownership, and error outcomes. A reachable socket does not establish UI readiness.

## Availability

The extracted package uses an explicit external launcher, not an application import or build flag. Build the selected development app first. Start it through the [documented owner command](../README.md#start-a-development-app-with-explicit-opt-in).

The file route installs the private bridge and preload before the app entry executes. It pins a local renderer file inside the selected app root. The provider requires macOS, an unpackaged app, and Electron's default session. Ordinary app startup remains bridge-free. Packaged apps refuse development host setup.

The explicit `--adapter openchamber` route requires a built OpenChamber source checkout and `--profile`. It rejects custom entry and renderer arguments. It prepares the private bridge before Electron readiness. Its ESM entry imports OpenChamber's protocol setup before readiness and activates the preload at readiness. No app-source change is required.

Only root windows with context isolation, Node integration disabled, and the default session qualify. The accepted document is `openchamber-ui://app/index.html`, with an optional hash. Splash, Mini Chat, child windows, other paths, query variants, and remote origins remain outside the target set. The adapter does not change the app's existing sandbox or preload configuration. OpenChamber uses an unsandboxed ESM preload. The fictional route remains sandboxed.

OpenChamber retains its quit confirmation. After a confirmed quit, its final `app.exit()` waits for actual bridge work and cleanup. A cancelled quit does not trigger an adapter retry or detach. A `will-quit` fallback covers the interval before the product installs its quit handler. Unknown cleanup keeps the exit blocked.

A macOS close can hide the main window rather than destroy it. The host first retires the connection and waits for actual cleanup. If the product then cancels the native close, the same document becomes discoverable again. Explicit reconnect creates a new binding and new references. The old binding stays retired.

The supplied Electron profile does not isolate OpenCode accounts, backend settings, or inherited credentials. Use a separate development home and data directories for verification. The owner must still run `/annotate-electron connect` in the intended Pi session.

Discovery exposes safe app and window identities, not page content. Other Electron processes do not become compatible merely because the owner can find them. A compatible protocol and an explicit target connection remain necessary.

## Older instances and restart boundaries

An app that already runs older bytes cannot acquire the startup hook through discovery. Its owner must save any work before a later manual restart. Neither discovery nor connection performs that restart, reloads a page, or replaces an app window.

Routine tests use fresh hidden instances with temporary homes and profiles. They do not inspect an owner's existing app instance. A foreground walkthrough requires separate approval.

## Local trust and data flow

The owner selected an unmasked local-development workflow. The attached route adds no public-content catalog, image mask, per-control action classification, or extra per-action approval prompt. Current product host checks remain unchanged.

Requested UI text, screenshots, and frontend diagnostics can reach Pi's configured model. A local transport does not establish local-only model inference. This connection adds no credential-file reader, generic filesystem command, Node inspector, or Electron main-process debugger.

The synthetic `open` route retains its strict content catalog, fixed paint exceptions, and owned-child lifecycle. Chrome annotation remains separate. Their earlier evidence does not establish acceptance of the new attached route.

## Pi commands

The connection command requires interactive owner context. With no compatible windows, the command provides restart guidance instead of an app launch. With one compatible window, the command connects and starts the None picker immediately. Multiple windows produce the Pi SDK's keyboard-accessible selection dialog. Cancellation of that dialog creates no window connection.

| Command | Attached development behavior |
| --- | --- |
| `/annotate-electron connect` | Without a connection, the owner selects a compatible window. With a live connection, the command reopens its idle picker. After confirmed retirement, the command can discover a new compatible window. An already active picker retains its notes. |
| `/annotate-electron none` | The command starts another picker without screenshots. An active picker prevents another start. |
| `/annotate-electron crop` | The command starts another picker with per-note crops. Each note's Add screenshot / Element crop button controls its image. |
| `/annotate-electron cancel` | The command cancels the current picker after its work and cleanup settle. The connection remains open. |
| `/annotate-electron status` | The command reports the selected state or retained cleanup block. |
| `/annotate-electron disconnect` | The command releases the connection without app closure. Verified capture files remain on disk. |
| `/annotate-electron close` | Attached mode has the same behavior as disconnect. The owned synthetic mode closes its own child normally. |
| `/annotate-electron open` | This separate legacy command requests approval for a new synthetic workspace. It does not connect an existing app. |

Submit or Cancel can occur after the connection command returns. A submitted note reaches only its original Pi session. Duplicate, retired, cancelled, or replaced requests cannot produce successful feedback. Comments and images remain untrusted review data. Notes grant no source-edit or process authority.

The picker close button, Cancel, and Escape close only annotation controls. The app connection and UI tools remain available. Another `connect` reopens the None picker on that same live connection without discovery or another window choice. An active picker remains unchanged. Pending preparation, cancellation, cleanup, or a retired connection cannot resume through this command.

To release the connection, use `/annotate-electron disconnect`. To choose another window, disconnect before another `connect`.

The picker verifies the pinned Pi Annotate asset and adds a fixed annotation-state compatibility hook with the local Electron Annotate presentation. An icon toolbar offers additive selection, show/hide annotations, undo, redo, the selected count and cancellation, beside a separate circular Send button. Notes retain their drag behavior and scoped OpenChamber tokens. A dash minimizes; a plus or numbered marker reopens; a bin deletes. Undo/redo restores added/deleted notes with original node identity, literal text and image choice, without replaying product input. Parent/child selection controls remain visible in the footer beside the details and delete actions. Element facts stay in the collapsible details region. Its footer code icon stays stationary as details expand above it.

Each note has a feedback field and its own screenshot button: Add screenshot when off, Element crop when on. In None mode, each note starts without an image. In Crop mode, each note starts with an element crop. Each new note uses the picker's initial choice, even after earlier notes change the shared mode.

Change a note's choice to affect only that note. The app captures one viewport only when at least one note requests a crop, then saves only the requested element crops. None mode performs zero native captures.

Space or Enter selects the focused product control without its normal action. Escape or X cancels the picker. The command and tool identifiers remain `/annotate-electron` and `annotate_electron`. To load this presentation in an older instance, manually restart the development app and reload the project Pi extension before connecting again. The styling change does not restart the owner's app.

The picker renders above ordinary application overlays in the browser's top layer. Native HTML modal dialogs (`dialog.showModal()`) must be closed before picker activation. Opening one during annotation cancels the current unsent notes and retains the UI connection; the picker does not move its controls into the app dialog or change app modality. Start annotation explicitly again after closing the modal.

## Model UI tools

`electron_ui` exposes `status`, `snapshot`, `screenshot`, `click`, `fill`, `scroll`, `key`, `console`, `exceptions`, and `network`. The tool cannot discover, select, or launch a target. The owner must connect first.

Snapshots return bounded current references and a revision. Each connection uses a fresh reference namespace. Input requests use those references where the action requires an element. Stale references fail rather than select a replacement element. Agent UI requests report busy while the human picker owns input.

An SDK input abort does not replay the operation. Another input requires a fresh successful snapshot. An SDK abort during picker preparation revokes delivery and detaches the frontend connection after actual work settles. The app remains open.

## Ownership and cleanup

Each window has one active connection. Its source Pi session, app instance, window, document generation, and connection ID remain bound together. Another pane cannot replace that owner.

Navigation, reload, target destruction, session retirement, and transport loss revoke old input and delivery. The owner must explicitly connect again. There is no automatic reconnect or replay queue.

A frontend debugger connection belongs to the selected window lease. The bridge refuses a connection while another debugger or DevTools owns the target. Unexpected detachment revokes the lease without automatic reattachment. Cleanup detaches only the bridge's own debugger session.

Pi disconnect removes only owned listeners, collectors, input guards, and picker effects. It never closes, terminates, or restarts the attached app. Unknown cleanup retains its ownership block and available evidence. A deadline does not prove terminal cleanup.

A native window close first revokes its annotation lease while the renderer is alive. The window closes only after actual pending work and cleanup settle. The closing target is not discoverable. Duplicate close attempts join the same cleanup. Unknown cleanup keeps the close blocked.

Native close waits for actual settlement, independently of a reporting deadline. Late successful cleanup completes the original close without another owner action. A real cleanup failure keeps the close blocked.

The bridge sends a binding-scoped `cleanup-complete` event only after controller cleanup and all tracked lease work settle. It uses the authenticated connection. Renderer and controller callbacks cannot supply this event. The bridge waits for the terminal frame's write callback before normal transport shutdown. Revocation, socket closure, and a deadline do not certify cleanup.

After this confirmation, an explicit owner `connect` joins local work and retires the old slot before discovery. It can then select the reopened app. It never reconnects automatically. Failed or unconfirmed cleanup still blocks replacement. An older bridge without this confirmation remains unconfirmed.

The transport uses CommonJS modules. A Pi extension reload does not refresh an active transport client. A live check of this correction requires updated app bytes and a fresh Pi process. That fresh process does not prove that any older cleanup finished.

On macOS, the app can remain in the Dock after its last window closes. This differs from a frozen window that remains visible.

## Retained cleanup diagnostics

A retained cleanup block can stop `connect` before discovery. A new Electron launch does not clear Pi's retained state. A Pi extension reload preserves that state.

Pi can keep a native `.mjs` adapter in cache after `/reload` refreshes the TypeScript entry. The project entry uses a native loader and a source-hash URL for the direct development adapter. Changed adapter bytes receive a fresh code-module identity. Unchanged adapter bytes reuse the same module. The retained session map and ownership blocks remain in the process-global state.

This refresh covers only the direct development adapter. It does not refresh the loader itself, the legacy adapter, or transitive CommonJS dependencies.

For blocked cleanup, `status` reads only local cached evidence. It reports at most eight records and the omitted count. A record distinguishes the current session from an earlier session. Only the current session's record can include its opaque target binding. Earlier-session records expose no target or source-session identifiers.

The report includes client activity, the number of tracked local operations, and the retained close promise's state. The operation count covers only the adapter's job set, not remote cleanup or other untracked work. A `null` field means that the fact is unavailable. It does not prove that no resource exists. Error codes and outcomes come from fixed allowlists. Raw error messages, stacks, transport addresses, authentication material, and page content never enter this report.

The close state describes only the retained promise. A `pending` or `not-available` state remains unconfirmed. A fulfilled promise does not itself release the ownership block. Status does not retry cleanup, rediscover a target, inspect the app, reconnect, or change ownership. A session change rejects stale diagnostic delivery.

Keep retained evidence until the actual cleanup outcome is known. Do not treat a diagnostic report as permission to reset the connection.

## Verification boundaries

Pure protocol tests prove decode behavior. Real local-socket tests prove Node transport, ownership, authentication, and cleanup behavior with synthetic controller callbacks. Neither establishes actual frontend interaction.

The hidden host checks build a small synthetic app in a separate owned directory. Explicit opt-in uses the production external bootstrap and bridge. Ordinary launch uses no bridge. The sample has no product backend. Fixed operation counters make an escaped product click observable.

Real offline Pi fixtures exercise developer-session tool execution and annotation delivery. They disable model network access and use private test directories. These fixtures do not create or replace the target application's agent backend.

These checks do not establish native foreground focus, private-company-data use, live-provider behavior, Windows, packaged distribution, or the Pi walkthrough with the owner. Those acceptance boundaries remain explicit in the checklist.
