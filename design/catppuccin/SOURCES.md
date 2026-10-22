# Catppuccin overlay colors

Source: [Catppuccin palette](https://github.com/catppuccin/palette), palette JSON version 1.8.0. Values were read from the official Mocha and Latte flavors on October 22, 2026. Copyright (c) 2021 Catppuccin, MIT; [complete license](../licenses/catppuccin-MIT.txt).

The owned color layer is `scripts/electron-annotations/catppuccin.css`. `presentation.cjs` scopes its declarations to picker-owned overlay roots using the same fixed scoping path as the copied OpenChamber tokens. Copied upstream CSS/JSON resources are unchanged.

- Mocha dark: Base surfaces, Mantle details, Text foreground, muted Subtext, Peach selection/Send, Blue image actions, Mauve details/focus.
- Latte light: corresponding color families and light surfaces. Small badge numbers use Text; Peach/Blue control inks and per-note keyboard focus mix with Text for readability. Send retains dark icon ink.
- Annotation identities: shuffled Rosewater, Flamingo, Pink, Mauve, Red, Maroon, Peach, Yellow, Green, Teal, Sky, Sapphire, Blue and Lavender slots. They remain attached to original annotation cards through history and resolve to the corresponding theme's value.

Only owned overlay colors change. This palette is not installed on the target app, synthetic fixture, or document root.
