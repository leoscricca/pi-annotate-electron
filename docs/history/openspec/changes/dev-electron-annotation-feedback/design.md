# Design

## Context

See [the proposal](proposal.md) for motivation and [the capability spec](specs/electron-annotation-feedback/spec.md) for required behavior.

The installed tools are Node 24.22.0, Pi 1.3.0, `pi-agent-browser-native@0.9.6`, `agent-browser@0.39.1`, and `pi-annotate@0.5.2`. Doctor and isolated extension-load checks passed. No Electron annotation runtime check occurred. Pi Annotate's browser manifest identifies itself as 0.4.0. That is distinct from its Pi package version.

The pinned picker uses `chrome.runtime.id`, `onMessage.addListener`, and `sendMessage`. Its background code also needs native messaging and browser tab and screenshot APIs. Electron does not document support for the complete background API set. The design does not load that Chrome extension unchanged.

Electron 44.4.5 exposes `session.registerPreloadScript`, `contextBridge.exposeInIsolatedWorld`, `webContents.executeJavaScriptInIsolatedWorld`, and `capturePage`. Their combined behavior with the picker still needs an implementation proof.

The current [browser annotation plan](../dev-ui-annotation-feedback/design.md) stays browser-only. The [developer setup document](../../../docs/UI_ANNOTATION_FEEDBACK.md) and issue #19 retain their incomplete acceptance checks. The PRD treats annotation as developer tools. No capability for makers is added here.

## Goals / Non-Goals

**Goals:** Use the actual workspace renderer in an isolated development Electron launch. Keep annotation separate from product authority. Deliver useful review data to the intended developer Pi pane.

**Non-Goals:** Attach to an current private app session, collect real project data, fix Codex login, automate product operations, or replace the app Pi SDK backend. No new installation, generic browser controller, MCP server, normal preload change, or signed distribution is included. Initial runtime acceptance is macOS-only.

## Decisions

### Use a separate developer bootstrap, not a product switch

Keep the launcher, bootstrap, dedicated preload, and Pi adapter outside `src/` and the preview application. Proposed locations are a developer-tools directory under `scripts/` and a project-local adapter under `.pi/extensions/`. Tests and developer documentation form a separate part of the change.

The bootstrap imports the current built main entry. It does not copy the workspace, product bridge, or session service. Before that import, it verifies the temporary home, profile, and fixture provenance. It refuses packaged operation, unexpected source paths, missing markers, or an current private profile.

Reuse the synthetic launch layout in `tests/electron-codex-conversation.spec.ts`. The app currently admits its conversation fixture only for an unpackaged hidden launch with a private marker. Preserve that admission rule. Do not make normal startup accept the fixture or real credentials.

The developer bootstrap can reveal only its own synthetic window after a separate foreground grant. It must not reveal or focus a routine test window by default. This special walkthrough does not change the normal hidden-test contract. A visible synthetic badge must prevent confusion with the owner's normal app.

Alternative: add annotation flags and a privileged preload to the product. Reject this because normal builds and startup must remain independent of developer feedback.

### Keep annotation portless and inspection separate

The bootstrap registers one dedicated frame preload in its isolated Electron session before the workspace loads. The preload runs only for the verified top-level workspace document. The main process checks the sender WebContents, main frame, document generation, and current request for every invocation.

Use a dedicated renderer world other than the application world or Electron's preload world 999. Expose a narrow annotation API only in that world. The ordinary page must not receive it. A local shim implements the picker's required `chrome.runtime` calls. It must not replace `window.chrome` in the application world.

Only fixed annotation operations are permitted: active-request status, screenshot acquisition, result submission, and cancellation. The boundary rejects unknown fields, arbitrary URLs or paths, generic IPC, evaluation requests, and authentication operations. Product IPC handlers and their admission rules remain unchanged.

The installed Pi browser extension remains the generic inspection tool. Annotation itself does not open CDP or a Node inspector. Any optional renderer-CDP inspection needs a separately approved, verified loopback endpoint for the same synthetic launch. Do not add a second browser controller.

Alternative: use `webContents.debugger` for all operations. Reject it for annotation because opening built-in DevTools detaches that debugger. Also reject a browser-to-auth service and a new web backend.

### Reuse a pinned picker with a restricted feature set

Load the local asset from `pi-annotate@0.5.2`. Record its source hash and MIT attribution. Never patch the installed package or fetch executable picker code at runtime. A changed or missing asset stops activation.

The shim routes `START_ANNOTATION`, `CANCEL`, `CAPTURE_SCREENSHOT`, and completion messages through the active request. Each direction receives schema validation. The shim is not an unrestricted implementation of Chrome APIs.

The upstream start message has no documented feature-policy options. Therefore, use adapter-owned guards for the pinned overlay controls. Permit Crop and None only. Keep Full, Debug, and Etch unavailable. Reject edit data and unknown completion fields at the transport boundary as well.

Guard pointer and keyboard events before they reach product handlers. Allow note input and picker controls only. Verify this against the actual Settings dialog and operational buttons. Capture interaction must not invoke a consent, login, session, or inspection operation.

The first implementation gate must prove these restrictions without a vendor-file patch or a product permission change. If that proof fails, stop. Do not silently enable unsupported features or substitute a new picker design.

### Admit only owned synthetic content

Each launch uses a new private home, user-data profile, and temporary directory. The environment excludes inherited provider credentials and personal Pi resources. The current synthetic fixture supplies its provider behavior. No ordinary credentials, private model files, or owner-home discovery are needed.

Verify Electron's resolved home and profile before product startup. Normal user-data paths, unknown provenance, visible authentication challenges, and secret or editable value fields are not eligible for capture. Do not serialize input values, full HTML, arbitrary attributes, or unrelated transcript and project content.

The initial content policy is deliberately conservative. It permits known synthetic controls and bounded facts. It refuses unknown regions or a page that leaves its synthetic state. This is not general-purpose secret detection. Real-session annotation needs a later privacy decision.

Alternative: redact an arbitrary live app after capture. Reject it because the upstream Crop path first requests a full viewport image.

### Crop in memory and save only approved output

The picker requests a transient image through the dedicated preload. The bootstrap captures only its owned renderer, not the OS desktop. The upstream Crop path can use that image to produce the selected crops. Never log or save the transient full-renderer image or send it to Pi.

Match viewport, scroll position, device scale, and element identity before and after capture. Test crops at the supported desktop widths and device scales. If the document or target changes, reject the capture. A None request must not invoke page capture.

Proposed bounds are ten selected elements, 4,096 characters per comment, 256 KiB of metadata, and 10 MiB per image. Validate PNG dimensions and impose a 16 MiB total result limit before storage. Defaults belong to developer configuration, not annotation text.

Save approved crops with exclusive creation in an owned private directory. Use directory mode 0700 and file mode 0600. The sender does not choose filesystem paths. Validate the actual image before it reports the path. Images persist until an explicitly approved removal. No memory-only or automatic-deletion claim is valid for those files.

### Bind feedback to one Pi session and request

Add a dedicated `annotate_electron` tool and `/annotate-electron` command. Keep `/annotate` unchanged. The developer Pi adapter owns the launch handle, request ID, deadline, and intended Pi-session identity.

Use a private per-session local control channel. Authenticate its caller with a fresh local secret, not a value from the page. Do not use the Chrome native-host socket or token. That host supports one active Pi client and a new client can displace the previous pane.

A result contains the verified app and target identity, document generation, viewport, permitted element facts, literal comments, and owned crop paths. Format it as Page Annotation review input for the source Pi session. Do not dump the application snapshot or raw local file URL into the message.

Use a default request deadline of 300 seconds. A busy target refuses replacement. Session replacement, cancellation, target loss, or deadline revokes delivery. Late callbacks cannot create a new request or send feedback to another pane.

No automatic replay queue is part of this slice. The Chrome queues, tokens, captures, and connections are untouched. A later resend requires a new explicit request and review of identified owned evidence.

### Restore owned state and retain uncertain outcomes

Record the pre-annotation focus, selection, cursor, scroll, and relevant accessibility attributes. Remove only the overlay, handlers, styles, and transient changes owned by this request. Restore original values. Do not assume the default cursor or accessibility state.

Revoke authority before cleanup. Join actual capture and file-operation promises before the adapter releases the request. A timeout is not completion. A file committed during cancellation remains identified as owned evidence but is not delivered as a successful note.

On reload or navigation, retire the old generation before the adapter admits the new document. Cleanup cannot silently attach to another page. Picker exit does not close the app. The launcher uses the current test-child observation rules to close an owned developer launch. Never stop an unrelated process or recover an old unknown process outcome.

An unconfirmed teardown remains blocked with retained evidence. The developer preload registration is removed when the owned launch closes. An inactive bridge in the dedicated world must reject calls even if its JavaScript object remains until document destruction.

## Risks / Trade-offs

- The isolated world shares the DOM. It is not a sandbox against privileged developer code. The trusted preload and its admission checks remain essential.
- The pinned picker has global IDs and modal guards. Verify ownership and exact restoration before use. The IDs or incompatible modal behavior must stop activation.
- A crop requires a transient viewport image. Synthetic-only provenance is a capture boundary, not just a test convenience.
- A session preload also runs in frames unless guarded. Both preload and main-process admission must refuse subframes and unexpected documents.
- A privileged helper can inspect more than the annotation schema allows. Do not expose generic commands or enable debug endpoints for annotation alone.
- The installed browser extension is pre-1.0. Installation, doctor, and a CLI load probe do not prove Electron interaction or Windows cleanup.

## Migration Plan

This draft adds proposal files only. Implementation needs a separate apply request and the repository's verified plan-publication gate.

1. Capture the current protected-source and configuration identities. Keep unrelated local edits intact.
2. Verify the installed pins and prove the dedicated-world adapter in a hidden synthetic Electron window.
3. Add the owned launcher, narrow transport, picker policy, and focused tests. No product dependency or startup change is permitted.
4. Prove crop and None delivery in the intended Pi pane, plus cancellation and restoration. Request foreground permission only for the owner-visible synthetic walkthrough.
5. Run the ordinary app and preview gates, source and bundle isolation checks, strict OpenSpec validation, and independent review. Record actual platform limits.
6. Update developer documentation with exact launch, visibility, persistence, privacy, and removal rules. Do not mark #19 or live authentication complete.

Rollback first revokes and closes only owned developer requests and launches. Remove only this adapter's resources and project declaration if one was added. Identify capture files before any separately approved deletion. Leave the installed general browser tool, Pi Annotate, Chrome registration, ordinary app, and other sessions unchanged.
