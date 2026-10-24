# Development Electron UI protocol

## Status and scope

This document describes version 1 of the development UI wire contract. Source code implements the backend, frontend operations, screenshots, Pi adapter, and attached picker.

Historical host checks covered ownership, state restoration, real offline Pi delivery, verified crops, and zero captures for None. These results do not validate the extracted package. Fresh package results belong in the migration verification record. No evidence establishes live-provider, private-company, native Windows, or arbitrary Electron-app support.

The [migration contract](MIGRATION.md) defines the external startup boundary. The [historical approved design](history/openspec/changes/connect-running-electron-annotations/design.md) records the original host scope. The [parser](../scripts/electron-development-ui/protocol.cjs) owns the field sets and limits. The [tests](../tests/electron-development-ui-protocol.spec.ts) exercise actual decode results and refusals. The legacy synthetic annotation parser remains separate and unchanged.

The connected development UI is trusted content. There is no content classifier, image mask, or extra per-action approval field. Text that contains code or a path remains literal text. It does not become an execution command. Current app host checks still apply.

## Ownership and target kinds

The adapter distinguishes two target kinds:

- `owned-synthetic` retains the legacy child-launch lifecycle.
- `attached-development` grants no app-close authority. Cleanup detaches only.

Socket target records accept only `attached-development`. A remote claim of `owned-synthetic` is invalid. Callers cannot supply a target kind to an input operation.

A binding contains exactly these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `session` | Opaque ID | Source developer Pi session |
| `instance` | Opaque ID | Verified app instance |
| `window` | Opaque ID | Selected window |
| `connection` | Opaque ID | Exclusive connection |
| `generation` | Positive integer | Selected document generation |

IDs contain 1 to 128 ASCII letters, digits, dots, underscores, or hyphens. The generation must be a safe integer. Every bound operation and result retains all five ownership fields. A mismatch causes `DEV_UI_STALE_IDENTITY` before the caller accepts content or dispatches input.

A target record contains `kind`, `instance`, `window`, `generation`, `label`, and `capabilities`. Its label has at most 128 characters. Capability names are `annotation`, `snapshot`, `screenshot`, `input`, and `diagnostics`. Discovery returns at most 64 targets and no duplicate capability names.

## Request envelope

A request contains `version: 1`, `kind: "request"`, `request`, `action`, and `params`. Bound requests also require `binding`. Extra fields are invalid at every record level.

| Action | Parameters | Binding |
| --- | --- | --- |
| `list` | Empty record | Absent |
| `connect` | `session`, `instance`, `window`, `generation` | Absent |
| `status` | Empty record | Required |
| `snapshot` | Empty record | Required |
| `screenshot` | Optional `ref` and `revision` pair | Required |
| `click` | `ref`, `revision`, optional `button` and `count` | Required |
| `fill` | `ref`, `revision`, `text` | Required |
| `scroll` | `direction`, `amount`, optional `ref` and `revision` pair | Required |
| `key` | `key` | Required |
| `console` | Optional Boolean `clear` | Required |
| `exceptions` | Optional Boolean `clear` | Required |
| `network` | Optional Boolean `clear` | Required |
| `annotate` | `mode`, either `none` or `crop` | Required |
| `cancel` | `annotation`, the active annotation request ID | Required |
| `disconnect` | Empty record | Required |

A reference requires a positive snapshot revision. A revision without a reference is invalid. The runtime must also verify that the reference still identifies the same node.

Click buttons are `left`, `middle`, or `right`. Click counts are 1 or 2. Text input has at most 4,096 characters. Scroll direction is `up`, `down`, `left`, or `right`, with an integer amount from 1 to 10,000. Key names have at most 64 ASCII letters, digits, plus signs, dots, underscores, or hyphens. The frontend input adapter must interpret key names without code execution.

`evaluate`, arbitrary protocol methods, shell commands, filesystem operations, and Node debugger operations are not actions. Unknown action names and parameters cause refusal. This restriction defines the UI API, not a content filter or another product approval system.

## Reply envelope

A reply contains `version: 1`, `kind: "reply"`, `request`, `action`, and Boolean `ok`. Its request and action must match the active request. A success contains `value` only. A failure contains `error` only.

Bound replies retain the exact request binding. A successful connection supplies a new binding that matches the requested session, instance, window, and generation. Discovery replies and failed connection replies have no binding.

| Action | Success value |
| --- | --- |
| `list` | `targets` array |
| `connect` | `state: "connected-idle"` and `target` |
| `snapshot` | `revision`, `viewport`, `nodes`, Boolean `truncated` |
| `screenshot` | `image` and `viewport` |
| `click`, `fill`, `scroll`, `key` | `outcome`, either `dispatched` or `observed` |
| `console`, `exceptions`, `network` | `items` and Boolean `truncated` |
| `annotate` | `state: "picker-active"`, `annotation`, and `mode` |
| `status`, `cancel`, `disconnect` | `state`, optional `operation` and `message` |

A dispatched input does not prove navigation or task completion. The caller must inspect actual app state after an unknown outcome. It must not replay input automatically.

States are `connected-idle`, `picker-active`, `busy`, `revoked`, `failed`, `cleanup-blocked`, and `disconnected`. Successful disconnect reports `disconnected` or `cleanup-blocked`. Successful cancellation reports `connected-idle` or `cleanup-blocked`.

Errors contain `code`, `message`, and `outcome`. Messages have at most 256 characters. Outcomes are `refused`, `failed`, `unknown`, `revoked`, or `blocked`. Codes are `BUSY`, `STALE_TARGET`, `STALE_REFERENCE`, `NOT_CONNECTED`, `UNAVAILABLE`, `CLEANUP_BLOCKED`, `TIMEOUT`, `CANCELLED`, `OPERATION_FAILED`, and `PROTOCOL_REFUSED`.

## Snapshot, diagnostics, and image records

A snapshot node contains `ref`, `depth`, `tag`, `role`, `name`, and `rect`. Optional fields are `value`, `disabled`, and `focused`. References are unique within the snapshot. Text values have at most 4,096 characters. Depth is an integer from 0 to 128.

A rectangle contains finite `x`, `y`, `width`, and `height`. A viewport contains `width`, `height`, `dpr`, `scrollX`, and `scrollY`. Viewport dimensions have a maximum of 8,192 pixels. The device scale ranges from 0.5 to 4. The image-area limit also applies to the viewport's scaled area.

A diagnostic contains `kind`, `message`, and `timestamp`. Optional fields are `source`, `line`, `column`, and `stack`. Network diagnostics can also contain `status` and `resourceType`. Kinds must match their requested family. Network output has no headers, cookies, or request or response bodies. UI error messages and source URLs have no content-redaction filter.

An image record contains `path`, `sha256`, `width`, `height`, `bytes`, and `mime: "image/png"`. Images cross the wire as metadata for owned files, not base64 payloads. The image consumer must verify the owned directory, file type, permissions, actual bytes, hash, and dimensions before use. A schema-valid path alone is not file verification.

## Asynchronous annotation and revocation

An annotation event contains `version: 1`, `kind: "annotation"`, `binding`, `request`, `outcome`, `mode`, and `notes`. Its request must match the active annotation request. Outcomes are `submitted` or `cancelled`.

A submitted event contains 1 to 10 notes. A cancelled event has no notes. Each note contains `comment`, `selector`, `tag`, `name`, and `rect`. A note can contain verified `image` metadata only in `crop` mode.

Crop mode permits any mix of notes with and without image metadata. The picker selects a crop for each note separately. Each new note uses the initial picker choice, even after earlier notes change the shared mode. It captures no image when every note omits a crop. A `none` event cannot contain image metadata. The runtime must separately prove zero screenshot calls in `none` mode.

A revocation event contains `version: 1`, `kind: "revoked"`, `binding`, and `reason`. A cleanup event contains exactly `version: 1`, `kind: "cleanup-complete"`, and `binding`. All event kinds require the exact connection binding. The backend sends cleanup completion only after actual owned work and cleanup settle. Revocation alone proves no cleanup. Neither event authorizes a replacement target or automatic reconnect.

## Limits and parser behavior

| Resource | Limit |
| --- | --- |
| Request JSON | 16 KiB |
| Reply or event JSON | 2 MiB |
| Snapshot nodes | 2,000 |
| Diagnostics per family | 200 |
| PNG file | 10 MiB |
| Image or scaled viewport area | 16,777,216 pixels |

Packets use UTF-8 JSON followed by a newline. Byte limits exclude the newline delimiter and apply before JSON parsing. Invalid UTF-8, malformed JSON, unknown fields, unsupported actions, and invalid types cause `DEV_UI_PACKET_REFUSED`. Excess wire bytes cause `DEV_UI_PAYLOAD_LIMIT`. Wrong request or action correlation causes `DEV_UI_CORRELATION_REFUSED`.

`decodeRequest` validates the received request and can compare it with an active binding. `decodeReply` requires the original validated request. `decodeEvent` requires the current binding and the annotation request ID for annotation events. `encodePacket` supplies framing and the byte limit. It does not replace the receiver's schema checks.

These pure parsers do not open a socket, attach a debugger, access an app window, capture an image, or create a product Pi session.

## Private connection backend

The [registry](../scripts/electron-development-ui/registry.cjs) and [connection backend](../scripts/electron-development-ui/connection.cjs) implement private local discovery and ownership. The [connection tests](../tests/electron-development-ui-connection.spec.ts) use real local sockets and synthetic controller callbacks. They do not establish Electron UI behavior.

The registry directory requires the current user's ownership and mode `0700`. Registration files and sockets require mode `0600`. The reader refuses directory or file symlinks, invalid ownership, changed files, unknown fields, and records larger than 4 KiB. Registration filenames identify random app instances. Socket basenames are short enough for the macOS Unix-socket path limit.

The registry contains only protocol version, instance, socket basename, and a fresh 32-byte secret as hexadecimal text. Addresses and authentication material stay inside the trusted Node client. Discovery returns target records only. It reads no browser profile, credential store, page content, process memory, or PID list.

### Authentication

Each socket uses a fresh server challenge and client nonce, both 32 bytes as hexadecimal text. The shared secret authenticates both peers with HMAC-SHA256. Input parts use UTF-8 and a NUL separator. The HMAC key is the registry's `token` text as UTF-8, not hexadecimal-decoded bytes.

1. The server sends `kind: "challenge"`, `version: 1`, `instance`, and a fresh `challenge` value.
2. The client sends `kind: "authenticate"`, `version: 1`, `nonce`, and the HMAC of `client`, the challenge, and its nonce.
3. The server sends `kind: "authenticated"`, `version: 1`, and the HMAC of `server`, the challenge, and the client nonce.

The words `challenge`, `authenticate`, and `authenticated` identify the `kind` field. Authentication records use closed field sets and the request byte limit. A failed or expired handshake closes only its socket. Authentication does not grant a UI connection or start a controller.

Discovery checks at most 32 registration records. Unreachable, invalid, stale, or unauthenticated entries produce no target and remain untouched. Excess registrations or targets cause an explicit discovery-limit failure, not an incomplete list presented as complete.

### Host integration interface

`createDevelopmentBridge` accepts trusted Node options, not renderer or model parameters:

- `label` optionally supplies a nonempty display label of at most 128 characters, without control characters. It carries no transport or authentication data.

- `directory` optionally selects an owned private registry for a host or test fixture.
- `targets()` supplies current window IDs, document generations, and actual supported capabilities. It must not collect page content.
- `openTarget(binding, emit)` creates the selected window controller only after explicit connection. It can return a promise.
- A controller supplies `execute(action, params, request)` and `close(reason)`. The latter cancels and joins its owned work without app closure.

The returned bridge has `instance`, `directory`, `revoke(window, reason)`, and idempotent `close()`. Host navigation and session integration must call revocation at their actual lifecycle boundaries. The Node backend alone does not observe an Electron document.

The external OpenChamber adapter uses the same wire contract. It prepares the host before Electron readiness, then registers the isolated preload at readiness before app window creation. It accepts only the fixed local application document in eligible root windows. It adds no model-supplied URL, script, backend method, or public debugging endpoint. The app retains its existing preload and sandbox configuration.

A trusted factory can throw `ConnectionRefusal` only when it proves that resource acquisition did not occur. This private Node brand never comes from wire fields or renderer errors. Unknown factory failures retain their ownership block. A late proven refusal releases ownership only after the factory actually settles.

The backend reserves a window before asynchronous controller creation. Another pane cannot replace that reservation. Disconnect and cancellation remain available before an active operation settles. A request deadline revokes its result, not the actual operation's ownership. Replacement stays busy until actual work and cleanup settle.

Failed or uncertain cleanup keeps its lease blocked. A normal bridge shutdown removes only its own unchanged registration after actual socket closure and controller cleanup. Unknown shutdown retains the registration as evidence. Neither route signals or closes the app process.

### Trusted client interface

`discoverDevelopmentTargets` returns public target records after mutual authentication. `connectDevelopmentTarget` re-reads the selected private registration and requires a source session ID. The returned client exposes its binding, active state, opaque `annotationRequest`, read-only `cleanupConfirmed`, `request(action, params)`, and `close()`. A second annotation request reports busy without replacement of the first request ID.

`cleanupConfirmed` starts false. It becomes true only after an authenticated, validated cleanup-complete event for that exact binding. A timeout, revocation, transport loss, or renderer error cannot set it. With positive cleanup proof, `close()` still joins the client's actual socket closure. Without that proof, an earlier failed close remains blocked. This property grants no app-close authority.

A connection-wide abort signal revokes its transport. A timed-out input requires a successful fresh snapshot before another input request. The client does not reconnect, replace a target, or replay an operation automatically. Its close path requests detach and waits for its own socket's actual close event.

These interfaces add no product SDK session, provider configuration, new content mask, or per-action approval prompt.

## Frontend snapshot and input adapter

The [controller](../scripts/electron-development-ui/controller.cjs) installs a fixed [page helper](../scripts/electron-development-ui/page.cjs) in isolated world `1004`. Only an explicit window connection performs this setup. The normal app renderer has no new API. Model parameters cannot supply JavaScript, protocol methods, or selectors.

A snapshot describes rendered main-document elements. It can include elements outside the current scroll viewport. It omits non-rendered elements and reports its node, text, depth, scan, and byte limits through `truncated`. It supplies a bounded DOM role and label projection, not the browser's complete accessibility tree.

Direct text scans read at most 32 child nodes and 4,096 characters. Label resolution reads at most 32 `aria-labelledby` IDs. A scan limit reports truncation if more input remains. An exact limit without omitted input does not report truncation.

Each new snapshot invalidates the previous revision. References use a fresh connection namespace. Retired references cannot identify nodes after reconnect, reload, or a different window selection. A reference retains the actual node and its tag, role, name, type, and link identity. Detached, hidden, replaced, renamed, or stale-revision targets cause refusal. The adapter rechecks live geometry and hit targets before a click.

Editable values remain literal text. Checkable controls expose their state as `value: "true"` or `value: "false"`. The snapshot does not hide a field because its text resembles code or a path. It adds no UI content catalog or per-control permission classification.

Clicks and keys use fixed frontend input methods. Text input uses native selection and text insertion, followed by a value check. This preserves normal application input events. Scroll requests use the selected element's normal scroll mechanism or the document scroll container.

Key names support ordinary letters, digits, function keys, arrows, navigation keys, `Enter`, `Escape`, `Tab`, `Space`, `Backspace`, and `Delete`. `Alt`, `Control`, `Meta`, and `Shift` can prefix a key. `Option`, `Ctrl`, `Command`, and `Cmd` are aliases. Unsupported combinations cause refusal, not command execution.

A trusted adapter uses `OperationFailure` to preserve a specific public error code and outcome. An uncertain input result requires a fresh successful snapshot. The adapter never retries an input automatically. Cleanup removes only its own page helper and frontend debugger connection.

## Frontend diagnostic collectors

The [diagnostic collector](../scripts/electron-development-ui/diagnostics.cjs) belongs to one selected frontend debugger connection. It starts with fresh buffers after domain setup, not with earlier console history. It records console errors, warnings, assertions, uncaught exceptions, HTTP error responses, and failed requests. It does not inspect the Node host, product session, or another window.

Console and exception records preserve bounded messages and source locations. Line and column numbers start at one. Request records retain only URL, resource type, failure text, and available HTTP status. They never retain request headers, cookies, request bodies, response headers, or response bodies. URLs and frontend error text remain unmasked model-visible data.

Browser policy can block a fetch before any network event occurs. Such failures remain console log facts with their actual text. The collector never invents a request URL or status from log text.

Each family has a 200-item limit and a separate byte budget below the reply limit. Oldest records leave the buffer when a limit applies. `truncated` reports dropped or shortened data. A `clear: true` request returns the current records before it clears that family.

Collector shutdown removes its listener, unfinished request metadata, and buffers. It does not clear the app's own console history or disable another debugger's domains. Disconnect, target retirement, and debugger loss prevent delivery of later events to the old connection.

## Attached annotation runtime

The [picker controller](../scripts/electron-development-ui/picker.cjs) reuses the annotation request lane and hash-verifies the pinned Pi Annotate asset. A fixed local compatibility hook adds annotation-state snapshot/restore and selection pause inside the picker’s lexical scope; it exposes no new wire method, product input, capture, or model scripting capability. History is request-bound and rejects detached, changed, ambiguous or replaced original nodes before restoring any state. The dependency file remains unchanged. The command returns after actual picker preparation. A separate source-session listener retains Submit or Cancel delivery after that return.

The fixed isolated-world adapter captures the asset's capture-phase selection handlers, not its bubble-phase drag handlers. The developer preload consumes product input during annotation. Own picker controls retain normal input. Space and Enter select the focused product element without its normal action.

Submit binds each note to its actual original node and geometry. Crop mode captures the current window in memory and saves only canonical per-note crops with the fixed padding. None and camera-off notes produce no image. The model cannot supply pixel data, selectors for input, or arbitrary scripts.

Cancellation revokes feedback before cleanup and joins actual unfinished capture and feedback work. Source-session retirement also joins unfinished readers before target replacement. A late result cannot gain authority through another pane or request. Unknown cleanup retains the ownership block.

Picker cleanup restores the original text selection before focus because a contenteditable selection can move browser focus. Disconnect removes only the current connection's helper, listeners, debugger attachment, and asset registration marker. The marker removal permits a fresh connection to the same document. The attached app remains open.

## Explicit screenshot artifacts

The [capture adapter](../scripts/electron-development-ui/capture.cjs) calls the selected window's native capture method only for an explicit screenshot request. Text snapshots and diagnostics perform no screenshot call. A window screenshot contains the current frontend viewport. An element screenshot contains its visible viewport intersection without a silent scroll.

Document identity, snapshot reference, viewport scale, and geometry must remain current before and after capture. Empty captures, incorrect dimensions, native failures, or stale geometry do not produce a successful image result. A hidden test window remains hidden during capture.

The [image store](../scripts/electron-development-ui/images.cjs) creates its private directory only when it saves the first requested image. Directories require current-user ownership and mode `0700`. PNGs, ownership records, and image records require mode `0600`. A connection can reserve at most 64 captures and 128 MiB of image bytes.

Each artifact carries its actual PNG dimensions, byte count, SHA-256 digest, and MIME type. A consumer requires the connection's ownership record and the requested image's record. It reads a bounded regular file through a descriptor that refuses symlinks. It rechecks ownership, permissions, file identity, actual bytes, dimensions, and digest before delivery.

Detach does not delete images. Temporary directories remain subject to the operating system's retention policy. Failed or partial writes remain private evidence rather than a claimed image result. The native tests retain verified byte-identical audit copies outside their temporary app profiles.

`ownedImageRemovalCandidates` verifies only eligibility for a supplied image list and connection. Every returned entry states `removalAuthorized: false`. It does not remove files or grant permission. Any later cleanup requires separate owner approval and fresh identity checks. The model has no generic file reader or removal command.
