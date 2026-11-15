# Prototypes

HTML source of every approved design, exported from three design canvases. Treat them as the **visual spec**. Each folder has a `canvas.json` index (frame titles, sizes and order) and one `.dc.html` per frame. Rendered images of each frame are in `../screens/<folder>/<same name>.jpg`.

| Folder | Frames | What |
|---|---|---|
| `app/` | 39 | Web app screens, overlays and states, component sheets, dark checks |
| `viewer/` | 24 | Viewer (19) and phone read-only layouts (5) |
| `website/` | 15 | Home v2 (light, dark, phone), docs, rules list and detail, changelog, 404 (each with phone), plus the superseded Home v1 |

`docs/03-screens.md` maps every frame to its screen ID, phase and features.

## Reading a `.dc.html`

- Everything visual is plain HTML with inline styles. Copy layout, spacing, sizes and copy from it.
- Ignore the canvas runtime: `<x-dc>`, `<helmet>`, `support.js`, the `<script type="text/x-dc">` block, `data-props`, `{{holes}}`, `<sc-if>` and `<sc-for>`. Where these appear (website v2 tabs and slider), they describe behaviour to rebuild with React state.
- Colours are inline hex values of the tokens; map them to `--sd-*` variables (`docs/09`).
- The `.jpg` renders were produced by stripping the runtime and showing the default state (first tab selected, slider at 46%). Website renders were taken a few seconds into the animation.

The handover's original seven designs are kept under their original names (`ACompare`, `AWorkspace`, `ADark`, `AJson`, `AMarkdown`, `AChangelog`, `AComponents`).
