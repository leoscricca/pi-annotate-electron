# Architecture

Pi Annotate Electron links human feedback and bounded frontend operations to the developer's existing Pi session. It supplies no application agent, credential store, model provider, or product backend.

## Components

| Component | Responsibility |
| --- | --- |
| `extensions/annotate-electron.ts` | Pi commands, closed tool schemas, source-session delivery |
| `bin/launch.mjs` | Explicit app-root, entry and renderer selection; external launch; normal quit |
| `scripts/electron-development-ui/external-bootstrap.cjs` | Prepare the bridge before app import and coordinate normal quit |
| `scripts/electron-development-ui/openchamber-main.mjs` | Hold Electron readiness until OpenChamber's pre-ready entry setup completes |
| `host.cjs` | Bind eligible windows and lifecycle events |
| `registry.cjs`, `connection.cjs` | Private discovery, mutual authentication, leases, transport and cleanup receipts |
| `protocol.cjs` | Version 1 wire validation, exact fields, identity and limits |
| `adapter.mjs` | Attached connection and bounded UI tools |
| `controller.cjs`, `page.cjs`, `diagnostics.cjs` | Fixed isolated helpers, snapshots, guarded input and collectors |
| `picker.cjs`, `capture.cjs`, `images.cjs` | Human selection, optional native capture, verified image artifacts |
| `scripts/electron-annotations/` | Owned synthetic route, strict content/capture policy and shared overlay presentation |
| `fixtures/`, `tests/` | Fictional app inputs; protocol, browser, SDK, native and terminal regressions |

Unqualified filenames belong to `scripts/electron-development-ui/`. The [protocol](ELECTRON_DEVELOPMENT_UI_PROTOCOL.md) is the detailed contract.

## Two ownership routes

**Attached development:** the owner launches an eligible, already-built app through the external launcher, then selects its verified window from Pi. This grants frontend access only. Disconnect and `close` detach; they cannot quit or restart the app. App UI content is trusted and unmasked.

**Owned synthetic:** the package launches its fictional workspace with a private home and profile. This route owns its child lifecycle and may close that child normally. Its frozen content catalog, four exact hover/active paint exceptions, capture checks and refusal tests remain independent of the attached route.

Chrome annotation remains separate; this package does not replace `/annotate` or its transport and queues.

## Startup and connection

1. The launcher validates a trusted root, existing main entry and local renderer. It starts the pinned Electron runtime and prepares the bridge before app import. The file route installs the preload after Electron readiness. The OpenChamber ESM route prepares the bridge before readiness, imports the app entry, and activates the preload at readiness.
2. The host advertises eligible windows through private same-user registration. Ordinary app startup has no bridge. Connect never upgrades or restarts an existing process.
3. Discovery authenticates compatible targets. Pi chooses among multiple windows and freshly verifies the selected identity.
4. Connection installs fixed helpers in isolated world `1004` without changing app security preferences. A verified connection starts the picker. The fictional sample retains its sandbox. OpenChamber retains its existing unsandboxed ESM preload, context isolation, and Node-disabled renderer.
5. Submission delivers literal comments, bounded element facts and optional verified crops to the source Pi session. Picker readiness and delivery remain separate results.

The explicit `openchamber` adapter pins the expected source layout, bundled HTML asset, and a supplied development profile. Only root windows in the default session can become targets. Their context isolation must be enabled and Node integration disabled. The accepted document is exactly `openchamber-ui://app/index.html`, apart from its hash. Other paths, query variants, child windows, and remote origins do not qualify. The authenticated socket and UI wire schema remain unchanged.

Electron and its helpers live outside the launcher's terminal signal group. Terminal signals request normal app quit over the retained parent channel. The launcher waits for actual exit; there is no forced-termination deadline.

## Protocol and authority

The transport is version 1 JSON-line messages over a private Unix-domain socket with mutual authentication and fresh challenges. Registry directories require `0700`; sockets and registration records require `0600`. Authentication material and socket addresses do not enter model-visible target metadata.

Every bound request and result identifies the source **session**, app **instance**, **window**, **connection**, and document **generation**. Stale bindings and late results fail. Reference-based input also requires a current snapshot revision and the same live node identity and geometry.

The tools expose fixed operations, not arbitrary evaluation or protocol dispatch. No public CDP endpoint, Node debugger, shell, generic file API, backend agent access, HTTP app connector, WebSocket connector, or MCP attachment is supplied. npm and Git are installation formats, not runtime transports.

## Human selection and agent input

The hash-verified Pi Annotate dependency supplies selection behavior. Shared owned presentation adds the dock, editor, request-local history, per-note image controls, Catppuccin Mocha/Latte themes and stable color identity. Request-local shuffled accent cycles avoid repeating active colors; original cards retain their assigned color families through history. Fixed local hooks validate original nodes before history restoration; the upstream asset remains unchanged.

Owned manual popovers keep controls above ordinary app stacking layers while retaining their original ancestry. A native HTML app modal prevents activation or cancels an active picker. Controls are never moved into product dialogs.

Active selection blocks product operations and agent input. The `electron_ui` schema permits bounded snapshots, screenshots, click, fill, scroll, key and diagnostics. Dispatch does not prove completion. Unknown input outcomes require a fresh state inspection before another operation and are never automatically retried.

## Images and diagnostics

No-image and camera-off notes perform zero screenshot calls. Snapshots and diagnostic reads also capture no images. Requested native capture rechecks document ownership, geometry and scale before and after capture.

Delivery verifies actual PNG bytes, dimensions, digest, current file identity and permissions. A schema-valid path is insufficient. Private artifact files and records use `0600` inside `0700` directories. Detach does not delete retained images; removal requires separate owner approval and fresh checks.

Network diagnostics retain bounded URL, status, resource type and failure information, without headers, cookies or request/response bodies. UI text, URLs and errors are unmasked and may reach Pi's configured model. The attached route supplies no content classifier; the synthetic route retains its strict catalog.

## Retirement and cleanup

Navigation, reload, transport loss, target destruction and Pi session retirement revoke input and delivery before asynchronous cleanup. There is no replacement-page following or automatic reconnect.

Ownership lasts until actual work and cleanup settle. Only an authenticated cleanup receipt for the exact binding can certify bridge cleanup. A deadline, cancellation, inactive socket, process signal or renderer error does not certify cleanup. Failed or unknown cleanup retains its block and evidence.

Cleanup removes only owned helpers, listeners, collectors, guards and debugger effects. Where original nodes remain, it preserves or restores draft, focus, selection, cursor and scroll without overwriting later user changes. Native close and quit join actual settlement separately from ordinary bounded detach.

## Evidence limits

Tests cover local sockets, headless browsers, hidden macOS Electron, offline Pi SDK sessions, installed package layout and actual launcher terminal signals. They use fictional content and private profiles. They do not establish arbitrary-app compatibility, foreground focus, packaged or Windows support, private-account behavior, or live-provider acceptance. See [verification](VERIFICATION.md).
