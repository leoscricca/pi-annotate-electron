# Proposal

## Why

The owner needs element-level feedback on the actual Electron UI, not a browser preview that lacks the Electron host. The installed browser-control extension does not provide Pi Annotate's human element picker inside Electron.

## What Changes

- Add an opt-in developer launcher and project-local Pi adapter outside application source and production bundles. Normal launches remain unchanged.
- Reuse the pinned Pi Annotate picker in a separate renderer world. Support element selection, literal comments, and either element crops or no image. Exclude Etch, DOM edits, full-page delivery, and generic command execution.
- Use Electron's developer-only preload registration and page-capture APIs. Annotation alone requires no CDP port, Chrome extension installation in Electron, or browser-to-auth bridge.
- Bind each request to one owned Electron window, document generation, and intended developer Pi session. Keep Chrome annotation commands, sockets, and queues separate.
- Start with the actual workspace under an isolated synthetic home and profile. Keep routine checks hidden. An owner-visible synthetic walkthrough requires explicit foreground approval.
- Preserve the app's sandbox, context isolation, Node-disabled renderer, trusted product IPC, and sole host-owned Pi SDK session.
- Verify real note and image delivery, operational-click suppression, stale-target refusal, and confirmed teardown. Installation or a numbered screenshot does not establish annotation readiness.

## Capabilities

### New Capabilities

- `electron-annotation-feedback`: Owner-initiated, review-only element feedback from an eligible development Electron window to its intended Pi session.

### Modified Capabilities

None. There are no canonical specs yet. The separate browser-only `dev-ui-annotation-feedback` change and issue #19 retain their requirements and incomplete acceptance checks.

## Impact

The implementation will add developer tools, a dedicated developer preload, focused fixtures, and developer documentation. It will reuse installed `pi-annotate@0.5.2`, `pi-agent-browser-native@0.9.6`, `agent-browser@0.39.1`, and Node 24.22.0. This proposal does not approve another installation.

Root and preview dependencies, ordinary main and preload source, application IPC, build output, and product behavior remain unchanged. The PRD remains the product-scope reference. This change extends developer feedback, not functionality for makers. Developer documentation must describe the new boundary before acceptance.

This is a local proposal. It does not authorize implementation, publication, a debug-port launch, a foreground window, or live provider use. Real credentials, owner-home discovery, private project contents, private app sessions, signed packages, and Windows acceptance are excluded. The Codex login failure remains a separate unresolved issue.
