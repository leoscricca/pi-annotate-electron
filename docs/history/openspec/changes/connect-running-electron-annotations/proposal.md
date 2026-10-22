# Proposal

## Why

The owner needs one connection to the existing Electron window for human annotations, agent UI control, and frontend diagnostics. The current helper opens a separate synthetic window and cannot connect to an existing app.

## What Changes

- Add `/annotate-electron connect` for verified compatible development windows. Connect immediately when exactly one eligible window exists. Show a keyboard-accessible chooser when several windows exist.
- Start the annotation picker after connection, without another start command, reload, or restart. Report an absent bridge without a silent app replacement.
- Add a private development bridge for this project's macOS Electron app. The proposed default enables discovery during `npm run dev`, not ordinary built launches or packaged builds.
- Add a session-bound `electron_ui` tool for UI structure, screenshots, mouse and keyboard input, console errors, JavaScript exceptions, and network failure diagnostics. Keep human annotation and agent input mutually exclusive.
- Use Electron's frontend DevTools APIs behind fixed operations. Do not expose a public debug port, arbitrary evaluation, a Node inspector, shell commands, or credential access.
- Treat the owner's connected local development window as a trusted UI target. Add no bridge-specific content masking or per-action approval prompts. Document that UI content and diagnostics can reach Pi's configured model.
- Add disconnect and stale-target handling that remove only owned tools and overlays. Never close, reload, or restart an attached app as connection cleanup.
- Preserve the existing synthetic `open` flow, its exact content guards, and Chrome's separate annotation route. Submitted annotations remain untrusted review input, not edit authorization.

## Capabilities

### New Capabilities

- `electron-development-ui-connection`: Discovery, explicit target selection, connection ownership, annotation activation, and non-destructive disconnect for an existing development window.
- `electron-ui-automation`: Bounded UI inspection, input, image capture, and frontend diagnostics through the selected connection.

### Modified Capabilities

None. There are no canonical specs. This change is a successor to `dev-electron-annotation-feedback`, not a rewrite of its accepted synthetic route.

For the new `connect` route only, the plan replaces that predecessor's fresh-synthetic-launch prerequisite, synthetic-content restriction, and annotation-only command set. The owner rejected extra content filters and per-action approval guards for this trusted local development route. The plan also permits a development startup hook and frontend debugger use. The predecessor's normal-startup and bundle exclusions still apply to ordinary built and packaged launches. Its synthetic catalog and fixed paint exceptions remain unchanged.

## Impact

The implementation will extend the project-local Pi adapter, add developer bridge modules, and add a development-only host hook. Likely integration points are `.pi/extensions/electron-annotation.ts`, `scripts/electron-annotations/`, `src/main/index.ts`, and `electron.vite.config.ts`. The bridge will use normal UI inspection and input, without a public-content catalog or per-control approval filter. The independent browser preview remains unchanged.

The design retains Electron's sandbox and context isolation, the Node-disabled renderer, guarded product IPC, and the sole host-owned product Pi session. The developer Pi pane is the tools client, not a replacement product backend. Existing dependencies and the pinned MIT Pi Annotate asset suffice for the proposed approach. No installation or upgrade is approved.

First acceptance covers this project's macOS development app and isolated fixtures. Other Electron apps, Windows acceptance, packaged support, backend debugging, live provider use, and private-company-data acceptance remain separate. Available process or window metadata does not establish compatibility.

The [design](design.md), [requirements](specs/electron-development-ui-connection/spec.md), [automation requirements](specs/electron-ui-automation/spec.md), and [tasks](tasks.md) define the bounded work. [The PRD](../../../docs/PRD.md#planned-existing-window-ui-development-connection) records product scope. [Issue #28](https://github.com/leoscricca/cnc-mendix-agent/issues/28) tracks implementation as Open/In Progress under parent [#1](https://github.com/leoscricca/cnc-mendix-agent/issues/1). Related annotation issue [#26](https://github.com/leoscricca/cnc-mendix-agent/issues/26) retains its current state and prerequisites. No new native blocker is added.

The initial approval covered planning files, the PRD entry, and GitHub tracking only. The owner subsequently approved publication of the plan and all nine existing outgoing commits, then implementation. Plan baseline [`fa52644694adf5f12a40695d1d0241f8ffa2adf8`](https://github.com/leoscricca/cnc-mendix-agent/commit/fa52644694adf5f12a40695d1d0241f8ffa2adf8) is published, with all seven remote files verified against the reviewed bytes. Implementation now follows this scope. It does not authorize current-window inspection, new installation, live account operations, or publication of later implementation changes.
