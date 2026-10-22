# Design

The owner-approved [Electron Annotate compact toolbar](compact-toolbar.md) adds a local presentation follow-up. It preserves the connection, capture, ownership, and cleanup contracts below.

## Context

See [the proposal](./proposal.md) for the problem and approved planning scope. This document describes proposed implementation, not current functionality.

The inspected baseline is local commit `19c397332dfe1a73b7dcd439d00a1ab19187da53` on `development`. Its UI prerequisite is `847754a24b96ea9cb9f9bcb66c24492cb53920f9`. This plan does not establish their publication.

| Current input | Observed behavior | Design consequence |
| --- | --- | --- |
| `.pi/extensions/electron-annotation.ts` | Registers only open, start, cancel, status, and close | Extend the existing command without a parallel annotation extension |
| `scripts/electron-annotations/adapter.mjs` | Owns fresh synthetic child launches and source-session delivery | Distinguish owned children from attached windows before cleanup |
| `scripts/electron-annotations/launch.mjs` | Uses inherited authenticated IPC | Add discoverable IPC for existing apps, not a claim that this pipe supports attachment |
| `scripts/electron-annotations/controller.cjs` | Uses isolated world 1004, the pinned picker, and a synthetic catalog | Reuse picker integration where compatible, but keep the synthetic policy separate |
| `src/main/index.ts` | Owns window creation, conversation, discovery, inspection, and cleanup | Add a small developer hook without another lifecycle or SDK owner |
| `electron.vite.config.ts` | Builds ordinary main, preload, and renderer entries | Exclude developer bridge code and assets from ordinary build output |
| Existing annotation tests | Exercise routing, ownership, capture, content, and restoration | Preserve these tests and add attached-window coverage |

The owner explicitly rejected two proposed additions: UI-content masking and a separate per-action approval layer. The new route trusts the selected local development UI. This decision does not remove those safeguards from the existing synthetic route or alter product host rules.

## Goals / Non-Goals

**Goals:**

- Make the normal development app discoverable without a separate debug-port launch.
- Use one connection for immediate human annotation and subsequent agent UI tools.
- Let the owner choose a window only when selection is necessary.
- Diagnose frontend behavior through normal UI interaction, console errors, exceptions, and failed requests.
- Detach safely without ownership of the existing app process.

**Non-Goals:**

- Discover every Electron process or support third-party apps in this first slice.
- Add a Node inspector, main-process debugger, arbitrary evaluation API, or remote access service.
- Add UI-content classification, image masking, or per-control approval prompts.
- Create another Pi session, authentication store, provider client, product permission system, or browser framework.
- Modify the independent browser preview or make its operational controls real.
- Establish live-provider, company-data, native Windows, packaged, or Mendix-pilot acceptance.

## Decisions

### 1. Enable a bridge only in development

Use a compile-time development entry from the existing Electron build. Enable its fixed host hook during `npm run dev`. Keep an additional packaged-app refusal. Ordinary `npm run build` output and `npm start` remain free of the bridge, listener, picker asset, and developer preload entry.

Keep most bridge code in a dedicated developer module, proposed as `scripts/electron-development-ui/`, with a thin host integration. Register any required developer preload before the development window loads. Keep it separate from the existing product preload contract. Use Electron's isolated-world support. Keep Node disabled in the renderer.

The proposed automatic development registration avoids an extra launch command. It advertises availability only. It collects no DOM, image, or diagnostics before owner connection. A bridge startup failure leaves the product usable and reports that developer connection is unavailable.

An app already open from older bytes cannot acquire the hook through discovery. Report the missing bridge and explain the manual restart requirement. Never restart or reload it automatically. Universal process attachment and a public CDP port were rejected because neither is necessary for this app.

### 2. Discover a private app-owned IPC registration

For the first macOS provider, use a private local socket and a small runtime registry beneath an app-owned temporary directory. Require user ownership, restrictive permissions, and non-symlink paths. Use fresh per-instance random registration identifiers and authentication material. Do not scan home folders, browser profiles, process memory, or TCP ports.

The trusted Node adapter reads the registration, authenticates the app response, and checks compatibility. Model-visible target facts contain only a fixed app label, opaque instance and window IDs, and protocol capabilities. Do not expose socket paths, authentication material, dynamic window titles, or page URLs in discovery output.

Registration cleanup removes only the current app instance's own entry. An old or unreachable registration is not permission to signal its process or remove historical evidence. Same-account malware is not a protection claim of this local developer service.

A future provider can supply another verified compatible target. This slice needs no provider plugin framework and must not imply that a discovered Electron process is connectable.

### 3. Keep explicit target and Pi-session ownership

Without a selected connection, `/annotate-electron connect` performs discovery in the intended developer Pi pane. With zero targets it explains absence. With one eligible window it connects immediately. With several it uses the existing Pi selection UI, then verifies the chosen target again.

Picker close, Cancel, Escape, and Submit preserve the selected app connection. A later owner `connect` starts the None picker on that same live idle connection without discovery or another target choice. If the picker is already active, the command preserves its request, notes, and mode. Connection or picker preparation, cancellation, blocked cleanup, and retired targets still prevent resume. A different target requires an explicit disconnect before a new connection.

The app grants one exclusive connection for the selected window. Bind it to protocol version, app instance, window, document generation, connection ID, and developer Pi session. A second pane receives busy rather than control of that connection. Model tools cannot create a connection without the owner command.

Keep a discriminated adapter target kind, `owned-synthetic` or `attached-development`. Retain the legacy synthetic launch's close behavior. In attached mode, both `disconnect` and the existing `close` command detach only. A session cannot hold a new target while earlier cleanup is unresolved.

A native window-close intent revokes the annotation lease before renderer destruction. The host keeps the renderer alive until actual pending operations and cleanup settle. A closing target cannot accept a replacement connection. Repeated close attempts join one cleanup. Unconfirmed cleanup remains blocked. Pi disconnect still detaches without window closure.

The native close intent waits for actual lease settlement rather than a bounded reporting promise. A reporting deadline can report cleanup as pending or unknown. It cannot permanently prevent close after actual cleanup succeeds. The original close then completes without another owner action. A genuine cleanup rejection still blocks close and replacement.

On session switch, fork, tree navigation, shutdown, document navigation, reload, target destruction, or transport loss, revoke operations and delivery before asynchronous cleanup. Do not follow a new page. A fresh connection requires another owner command. A manual DevTools attachment must not cause the bridge to steal or repeatedly reacquire the debugger.

### 4. Add fixed frontend operations, not a generic debugger endpoint

Add the project-local `electron_ui` tool beside the existing adapter. Use one selected connection and fixed operations:

| Operation | Result or effect |
| --- | --- |
| `snapshot` | Bounded UI structure, accessible labels, element references, and geometry |
| `screenshot` | The selected window or an identified element image |
| `click` | A current element's normal click behavior |
| `fill` | Text input in a current editable element |
| `scroll` | Scroll the selected document or identified scroll container |
| `key` | Keyboard input in the selected window |
| `console` | Console errors collected after connection |
| `exceptions` | JavaScript exceptions and frontend source locations |
| `network` | Failed-request URL, type, status, and failure facts |
| `status` | Actual connection, operation, and cleanup state |

Use Electron's [webContents debugger API](https://www.electronjs.org/docs/latest/api/debugger) internally for supported frontend protocol commands and events. Keep helper scripts fixed and reviewed. Do not accept evaluation commands, arbitrary protocol methods, filesystem operations, main-process targets, request headers, cookies, or network bodies through this tool. Literal text input can contain code or paths. The tool must not interpret that text as an execution command.

Existing native browser tools are not automatically compatible with private IPC. The project adapter must implement this connection explicitly. Reuse existing picker, image, and request-lifecycle helpers when their contracts fit. Do not silently route through another tool with broader access.

Use current element references bound to document generation and snapshot revision. Recheck before dispatch. Return stale for a previous reference to a replacement element. Input uses normal app behavior without a bridge action classifier or another approval prompt. Host checks still apply.

Serialize operations per connection. Human picker input has exclusive ownership. Read or input requests that conflict with active selection return busy. A timeout revokes delivery but does not prove that work stopped. An unknown mutation outcome requires a fresh snapshot, not automatic replay.

Proposed protocol limits are 16 KiB per command, 2 MiB per non-image result, 2,000 snapshot nodes, and 200 retained diagnostics per family. Report truncation. Reuse the existing 10 MiB image and 16,777,216-pixel limits. Keep these as named transport limits with boundary tests, not arbitrary internal defensive checks.

### 5. Trust the selected UI and disclose model data flow

The bridge adds no synthetic-content fingerprint, public-region catalog, content masking, or per-action approval layer to the attached route. Normal UI text, drafts, screenshots, error messages, and failed-request URLs can reach developer Pi. Local transport does not mean that its model runs locally.

This trust decision does not add credential-file access, authentication-store inspection, hidden host-memory inspection, or network payload capture. Those operations are outside the UI tool contract. Existing application permission and approval behavior remains unchanged. Company-data policy and actual live test approval remain separate requirements.

Do not weaken the predecessor's synthetic catalog, four fixed hover/active paint exceptions, or refusal tests. The two routes have different content assumptions and explicit target kinds. Never calibrate the synthetic catalog from an owner window.

### 6. Start annotation without losing command responsiveness

After connection, inject the pinned picker into the selected document without reload. Verify its existing hash and license before use. Default to no image and retain the camera choice for an optional element crop.

The command reports connected and picker-ready after actual preparation, not after a note eventually arrives. Retain a session-bound result listener for Submit or Cancel. Check session, connection, request, generation, cancellation, and delivery revision before image preparation and before follow-up delivery. Deliver once, without prompt-template expansion. A tool response must not create a duplicate user message.

While annotation is active, consume pointer selection and product shortcuts before they trigger UI actions. Selection of Connect Codex remains annotation, not sign-in. After Submit or Cancel, remove the picker and release input. Keep the connection for agent tools. Existing `none` and `crop` commands can start another annotation on that connection.

### 7. Preserve application state and honest evidence

Reuse the established overlay restoration contract for focus, selection, cursor, scroll, draft, layout, and accessibility state where original nodes remain. Cleanup removes only owned effects and must not overwrite later user changes. It must not undo an intentional agent UI action.

Screenshots require an explicit image request. A text-only note performs no screenshot call. Verify target generation, geometry, scroll, and scale before and after capture. Save only verified requested images in an owned `0700` directory with `0600` files and an evidence ledger. No capture failure can return a success path.

Do not delete captures on disconnect. Explain retained data and require separate approval for identified evidence removal. Disconnect stops only owned collectors, debugger attachment, input guards, and picker effects. It never calls app quit, window close, reload, restart, or process termination on an attached target.

### 8. Reuse the established visual system

Visitor mode is Operate. The owner needs a short route from Pi command to the intended window, not a new settings surface. Reuse Pi's native keyboard chooser and the existing picker. Report no target, busy, revoked, failed, and cleanup-blocked states explicitly. Do not add an app-wide modal for every tool call.

Any changed in-app connection indicator follows [root DESIGN.md](../../../DESIGN.md), particularly Components and Shapes. The relevant detailed sections are [Buttons](../../../design/openchamber/DESIGN.md#buttons), [Inputs](../../../design/openchamber/DESIGN.md#inputs--fields), and [Switches, menus, and code](../../../design/openchamber/DESIGN.md#switches-menus-and-code). The [interactive guide](../../../design/openchamber/index.html#interaction) and [inventory](../../../design/openchamber/index.html#inventory) supply interaction and icon evidence, not new product authority.

Use existing shared controls, semantic light/dark tokens, compact labels, visible focus, and licensed icons. Preserve the 1024px composer maximum and mounted conversation state. Do not alter Settings padding or other product styling because an annotation note requests it.

## Risks / Trade-offs

- A powerful development connection can expose visible data to the configured model. The owner chose no extra masking. Document the scope and use appropriate development data.
- A frontend automation event can activate ordinary product behavior. Keep host rules intact and limit actual acceptance to approved fixture actions. Connection does not approve live testing.
- A stale registration or element reference can identify the wrong target. Authenticate registrations and recheck immutable target and generation identities.
- DevTools can detach an Electron debugger session. Report revocation. Do not replace another client's attachment.
- A normal build can accidentally retain a developer module. Check actual built output and launch behavior, not only source flags.
- Immediate picker activation blocks concurrent agent input. Report busy and require the picker to exit. Do not combine two input owners.
- Existing app state can change during restoration. Restore only owned effects on original nodes and retain blocked cleanup evidence when uncertain.

## Migration Plan

Implementation needs a later apply request and verified publication of this plan. Preserve unrelated local edits. Add developer modules and isolated checks first, then the development hook, adapter integration, and documentation. Re-run the legacy annotation gate after shared helper changes.

The new feature cannot upgrade an app that is already open. After future implementation, the owner can manually start an updated development instance. Do not use, inspect, or alter the owner's currently open synthetic window for this work.

Rollback removes the development hook and restores the old adapter contract. It must leave product auth, SDK ownership, Chrome tooling, existing app instances, capture evidence, and ordinary builds unchanged. No publication, installation, migration, or runtime action occurs as part of this planning work.
