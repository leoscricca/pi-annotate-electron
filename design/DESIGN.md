# Electron Annotate design

The overlay uses OpenChamber's canonical dark and light tokens. The copied CSS and JSON exports remain unchanged. Their license and the Remix Icon license accompany the required icons.

Apply tokens only to picker-owned panels, note cards, highlights, tooltips, markers, and connectors. Never install a global application palette or change target styles.

Use the compact system-font scale. Labels use 13.5px, metadata uses 12.5px, and micro text uses 12px. Toolbar buttons use the existing 28px size. Send, fields, and selects use 32px. Preserve 2px keyboard focus with a 2px offset.

Keep the centered floating toolbar, readable note cards, semantic interaction states, and reduced-motion support. Coarse pointers retain 44px targets. New presentation must preserve draft, focus, cursor, selection, and scroll on original nodes.

The overlay defaults to the system color scheme. Explicit host `data-theme` or `data-preview-color-scheme` attributes can select its copied light or dark palette. These attributes do not grant any app capability.

The synthetic fixture contains fictional controls only. Its exact DOM states belong to a frozen catalog. Keep the four existing button hover and active paint exceptions. Never calibrate that catalog from an owner app or an arbitrary target.

See `openchamber/tokens.css`, `openchamber/tokens.json`, and `openchamber/SOURCES.md` for provenance. Current overlay rules remain in `scripts/electron-annotations/presentation.css`.
