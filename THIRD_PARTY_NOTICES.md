# Third-party notices

The private project license does not replace the licenses of these resources.

## Pi Annotate 0.5.2

Copyright (c) 2026 Nico Bailon. MIT License.

The package retains the unchanged pinned picker asset from its local dependency. The runtime verifies the asset's SHA-256 identity before adding a fixed, local annotation-state compatibility hook at evaluation time. The hook supports annotation history without replaying product input; it adds no bridge or model scripting API. Fixed project adapters supply ownership, input isolation, presentation, capture, and delivery boundaries.

The complete [MIT notice](design/licenses/pi-annotate-MIT.txt) accompanies the package. The dependency retains its own notice.

## OpenChamber

Copyright (c) 2025 Bohdan Triapitsyn. MIT License.

The required token exports and original source attribution accompany the extension. The package scopes copied token declarations to picker-owned elements. It does not alter token values.

See the [complete license](design/openchamber/LICENSE.openchamber.txt) and [source record](design/openchamber/SOURCES.md).

## Remix Icon

This project uses icons from Remix Icon (https://remixicon.com), licensed under the Remix Icon License v1.0.

Copyright (c) 2017–2026 Remix Design. The seven icons provide functional controls. They do not act as a logo, app icon, brand identifier, standalone icon pack, or competing icon library.

The [complete license](design/openchamber/LICENSE.remix-icon.txt) accompanies the files. Its restrictions remain applicable.

The twelve additional `*-line.svg` functional controls come from Remix Icon v4.6.0 under Apache License 2.0. The [release license](design/licenses/remix-icon-4.6.0-Apache-2.0.txt) and [source record](design/openchamber/SOURCES.md) accompany these unchanged copies.

## Runtime and development dependencies

Electron, the host Pi SDK, TypeBox, Playwright, TypeScript, and their dependencies retain their respective licenses. This repository does not redistribute the former host application's backend, live account state, profiles, or credential stores.
