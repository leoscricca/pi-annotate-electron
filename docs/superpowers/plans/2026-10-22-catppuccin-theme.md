# Catppuccin annotation theme

Use the approved Peach / Blue / Mauve identity in the actual extension overlay. Apply a scoped Catppuccin color layer while retaining copied OpenChamber resources, typography, dimensions and licenses. The target application's styles and synthetic content catalog remain unchanged.

## Implementation

1. Add owned theme tokens and load them through the existing scoped-token path. Use Mocha surfaces, readable text, Peach selection/send, Blue screenshot actions and Mauve details/focus. Preserve explicit host/system theme precedence; the owner confirmed Mocha dark plus Latte light.
2. Replace the fixed ten-color order with a shuffled Catppuccin accent cycle per annotation request. Draw without replacement, avoid currently active colors on reuse, and preserve colors on original annotation cards through history. Reserve existing colors before allocating new ones so undo cannot recolor restored cards. Randomize only on assignment, never during ordinary redraws.
3. Add interaction regressions for palette membership, uniqueness, deterministic seeded shuffles, exhaustion/reuse, history stability and no target style changes. Update the existing tint assertion to use the selected accent rather than assume a fixed first color.
4. Verify native annotation/capture guards with the required build, typecheck, package and full test suite. Review actual dark/light/mobile renders together, then one correction pass if needed. Deliver a working preview URL and open it as requested. Refresh design documentation and user-facing media.

## Rulings

- The owner confirmed Mocha dark and Latte light. Light badge numbers use the standard foreground so pale accents remain readable; action inks mix palette colors with the foreground where needed for contrast.
- Exact tint assertions derive the expected 6% blend from the assigned accent, because a random cycle no longer has a fixed first color.

## Review focus

- Deletion/reselection followed by undo must preserve the restored original color even when a later card used that color.
- More lifetime additions than palette slots must not create duplicate colors among active notes.
- All note, marker, outline, focus and tint states remain in sync when themes change.
- Randomization must not create synthetic guard mutation failures or change product styles.
- Theme and image choices must not change screenshot intent, geometry checks, capture refusal or cleanup authority.
