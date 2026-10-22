# Electron Annotate design

The overlay uses OpenChamber's canonical dark and light tokens. The copied CSS and JSON exports remain unchanged. Their licenses and the applicable Remix Icon notices accompany the required icons.

Apply tokens only to picker-owned panels, note cards, highlights, tooltips, markers, and connectors. Never install a global application palette or change target styles.

Use the compact system-font scale. Labels use 13.5px, metadata uses 12.5px, and micro text uses 12px. Toolbar buttons use 28px targets. The separate circular Send button uses 44px. Preserve 2px keyboard focus with a 2px offset.

Reset margins on owned icons so application button-icon rules cannot shift them inside their targets. Disabled Send retains an opaque surface and dims only its arrow. Original overlay roots use manual popovers to render in the browser's top layer above ordinary application stacking contexts. Keep these roots outside product event paths. An active native HTML modal refuses picker activation; a native modal opened during annotation cancels the picker while leaving the UI connection available and the app dialog intact. Never reparent annotation controls into product dialogs or change the app's modality to bypass inertness.

Start the floating toolbar centered at the bottom. Its edges, corners and spaces between controls drag it anywhere inside the viewport; buttons retain their actions. Pointer capture keeps a drag on the owned overlay, with capture released on completion, cancellation and teardown. Keep moved docks inside a resized viewport. Moving the dock leaves existing notes in place. Coarse pointers retain 44px targets. Preserve draft, focus, cursor, selection, and scroll on original nodes.

The owner-approved floating toolbar uses icons for selection, visibility, undo, redo and cancellation, plus the annotation count and a separate Send button. Selection adds notes by default. Pausing selection does not release the input guard or permit product actions. Icon controls retain accessible action labels and tooltips.

Notes are 437px wide where space permits, with a 159px writing area and 12px of internal textarea padding on all sides. Empty feedback uses muted italic instruction text; entered feedback uses regular foreground text. Selections have distinct accents derived from the copied tokens, matching the selected outline, numbered marker, note border and note badge. Each opaque card mixes 6% of its selection accent into its surface; focus rings and hovered borders retain that accent. Accents follow original selected elements through deletion and history restoration; numbers remain visible alongside color. A dash minimizes the note without deleting it, a plus or numbered marker reopens it, and a separate bin deletes it. History restores added/deleted annotations with their original elements, comment, image choice and editor nodes; it never dispatches product input or follows replacement nodes. Typing keeps native text undo separate from annotation history.

The footer image button says “Add screenshot” when off and “Element crop” when on. New notes inherit the initial request's None/Crop choice independently. The footer code icon expands tag, selector, classes and dimensions above the footer. Keep that icon stationary through both expansion and collapse, including near viewport edges. Parent/child selection controls remain inside the details region. Hiding annotations hides notes, markers and highlights without discarding them or changing image intent.

The overlay defaults to the system color scheme. Explicit host `data-theme` or `data-preview-color-scheme` attributes can select its copied light or dark palette. These attributes do not grant any app capability.

The synthetic fixture contains fictional controls only. Its exact DOM states belong to a frozen catalog. Keep the four existing button hover and active paint exceptions. Never calibrate that catalog from an owner app or an arbitrary target.

See `openchamber/tokens.css`, `openchamber/tokens.json`, and `openchamber/SOURCES.md` for provenance. Overlay rules live in `scripts/electron-annotations/presentation.css`; the isolated-world installer lives in `presentation-ui.cjs`. The pinned picker file remains unchanged. `picker-source.cjs` verifies its exact hash before adding a fixed annotation-state compatibility hook inside its lexical scope; this hook adds no bridge method, product input, capture or model-supplied script.
