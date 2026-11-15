# 03 · Screens

78 designed frames: 39 web app (screens, overlays, components, dark checks), 24 Viewer and phone, 15 website. **Every screen is designed and approved.** There are no ⬜ screens left: build each one to match its prototype (`design/prototypes/`) and image (`design/screens/`).

How to read a prototype: `design/prototypes/README.md`. How to port it: `docs/09-design-and-motion.md`.

## Shared shells

- **App shell:** top bar with logo, file chips (before → after), mode badge, search (⌘K), Share, Export. Under it, view tabs for OpenAPI (Summary · Workspace · Raw diff · Changelog). Three-pane layout where relevant: tree 260–300 px · content · inspector 260–300 px. Max width 1360 px.
- **Viewer shell:** header with logo or the embedder's brand, API title, version picker ("v2.0.0 compared with v1.5.0"), theme switch, Copy for LLM, Download spec. Left nav (search, Overview, What changed, Authentication, endpoints by tag with method and badge, Schemas), centre content, right column for Try it and code samples. Max width 1440 px.
- **Website shell (v2):** floating rounded nav that stays at the top (compact logo + Open app + menu button on phones), dotted-grid hero background, footer with four link columns. Max width 1240 px.
- **Phone (390 px):** read-only. One column, 44 px touch targets, back and next/previous controls in a top bar.

## Example data used across designs

All app and Viewer screens use the same example so numbers agree: `payments-v1.yaml → payments-v2.yaml`, 28 changes (3 breaking, 2 possibly, 14 safe, 9 docs only), suggested version 2.0.0. The breaking changes are `DELETE /v1/refunds/{id}` removed, `currency` became required on `POST /v1/payments`, and `Card.last4` removed (shared schema, 3 endpoints). Use this data for samples (IN-05), fixtures and Playwright tests so screenshots match.

## Navigation map

```
Website: Home ─ Docs ─ Rules reference ─ Rule detail ─ Changelog ─ "Try it" ──► App
App:     Compare (drag-over) ─► Parsing ─► mode screen
           OpenAPI: Summary ⇄ Workspace (review, SDK view, affects-me filter) ⇄ Raw diff ⇄ Changelog & export
           JSON/YAML (tree, export) · Markdown (rendered, side by side) · Code (Beta, fallback) · Text (filters, moved block, patch)
         any mode ─► Share (passphrase) · Export · Copy for LLM
         top bar ─► History (empty) · Saved sources · Rules & settings · Command palette · Shortcuts
         shared link ─► Unlock (if locked) ─► comparison
Viewer:  Overview ─► Endpoint (Docs ⇄ History) ⇄ Schema · What changed (timeline, my endpoints) · Search · Version picker
         Endpoint ─► Try it ─► Response | CORS blocked | Fails-on-newer warning · Authentication dialog
Phone:   Shared link ─► Summary ─► Change detail · Viewer overview ─► Viewer endpoint
Packages: embed / React / Express / Fastify / Spring Boot render the Viewer; CLI opens the App locally; pre-commit hook runs the CLI
```

## States every mode must handle (X-08)

Loading (Parsing, A-02) · parse error pinned to line (in `AComponents`) · identical files (in `AComponents`) · too large (O-08) · empty history (A-11 empty) · network/CORS failure (O-05, V-01 error, V-02 CORS) · toasts (O-13).

## Superseded designs

`website/Main.dc.html`, `W01-Home-Dark` and `W01-Home-390` are the first home page. **Build Home v2** (`W01v2-*`). Keep v1 only as a content reference.

## Web app — `design/prototypes/app/`

| Screen | Phase | Features | Prototype | Image |
|---|---|---|---|---|
| A-04 OpenAPI summary | P1 | OA-08, OA-14, OA-19, OA-21, X-11 | `app/Main.dc.html` | `screens/app/Main.jpg` |
| A-01 Compare | P1 | IN-01…10, X-01 | `app/ACompare.dc.html` | `screens/app/ACompare.jpg` |
| A-05 OpenAPI workspace | P1 | OA-03…13 | `app/AWorkspace.dc.html` | `screens/app/AWorkspace.jpg` |
| A-05 Workspace · dark | P1 | SET-05 | `app/ADark.dc.html` | `screens/app/ADark.jpg` |
| A-07 JSON / YAML diff | P2 | JS-01…08 | `app/AJson.dc.html` | `screens/app/AJson.jpg` |
| A-08 Markdown diff | P2 | MD-01…05 | `app/AMarkdown.dc.html` | `screens/app/AMarkdown.jpg` |
| A-10 Changelog, export, share | P1 | OUT-01…03, OUT-05, OUT-06, O-02 | `app/AChangelog.dc.html` | `screens/app/AChangelog.jpg` |
| Component sheet | P1 | Component sheet (all) | `app/AComponents.dc.html` | `screens/app/AComponents.jpg` |
| A-05 Workspace · review decisions | P1 | OA-10, OA-14, OA-15, OA-21, X-11 | `app/A05-Review.dc.html` | `screens/app/A05-Review.jpg` |
| A-02 Parsing | P1 | IN-08, X-02 | `app/A02-Parsing.dc.html` | `screens/app/A02-Parsing.jpg` |
| A-03 Text diff · filters | P1 | TX-01…10 | `app/A03-TextDiff.dc.html` | `screens/app/A03-TextDiff.jpg` |
| A-06 OpenAPI raw diff | P1 | OA-11, OA-13 | `app/A06-RawDiff.dc.html` | `screens/app/A06-RawDiff.jpg` |
| A-11 History | P1 | OUT-07 | `app/A11-History.dc.html` | `screens/app/A11-History.jpg` |
| A-12 Rules and settings | P1 | SET-01…07, OA-19 | `app/A12-Settings.dc.html` | `screens/app/A12-Settings.jpg` |
| O-05 Load from URL | P1 | IN-03 | `app/O05-LoadUrl.dc.html` | `screens/app/O05-LoadUrl.jpg` |
| O-09 Share with passphrase | P1 | OUT-05, OUT-06, OUT-09 | `app/O09-ShareLock.dc.html` | `screens/app/O09-ShareLock.jpg` |
| O-08 File too large | P1 | IN-10 | `app/O08-TooLarge.dc.html` | `screens/app/O08-TooLarge.jpg` |
| O-03 Keyboard shortcuts | P1 | SET-07, X-05 | `app/O03-Shortcuts.dc.html` | `screens/app/O03-Shortcuts.jpg` |
| O-04 Explain this change | P1 | OA-07, OUT-12 | `app/O04-Explain.dc.html` | `screens/app/O04-Explain.jpg` |
| A-07 JSON tree · auto key match | P2 | JS-01…06, JS-10, JS-11 | `app/A07-JsonTree.dc.html` | `screens/app/A07-JsonTree.jpg` |
| A-07 JSON export · Patch | P2 | JS-08 | `app/A07-JsonExport.dc.html` | `screens/app/A07-JsonExport.jpg` |
| A-08 Markdown side by side · checks | P2 | MD-02, MD-04, MD-05, MD-06 | `app/A08-MdSideBySide.dc.html` | `screens/app/A08-MdSideBySide.jpg` |
| A-09 Code diff (Beta) | P3 | CD-01…03, CD-06 | `app/A09-Code.dc.html` | `screens/app/A09-Code.jpg` |
| A-09 Code fallback to text | P3 | CD-04 | `app/A09-Fallback.dc.html` | `screens/app/A09-Fallback.jpg` |
| A-03 Text · moved block | P2 | TX-11 | `app/A03-MovedBlock.dc.html` | `screens/app/A03-MovedBlock.jpg` |
| A-03 Open a pasted patch | P2 | TX-12 | `app/A03-Patch.dc.html` | `screens/app/A03-Patch.jpg` |
| A-05 SDK impact view (Beta) | P3 | OA-20, OA-19 | `app/A05-SdkImpact.dc.html` | `screens/app/A05-SdkImpact.jpg` |
| A-05 Changes that affect me | P3 | OA-22 | `app/A05-ConsumerFilter.dc.html` | `screens/app/A05-ConsumerFilter.jpg` |
| Saved sources · changed since last visit | P5 | IN-11 | `app/A13-SavedSources.dc.html` | `screens/app/A13-SavedSources.jpg` |
| A-01 Compare · drag over | P1 | IN-02, IN-04 | `app/A01-DragOver.dc.html` | `screens/app/A01-DragOver.jpg` |
| A-11 History · empty | P1 | OUT-07, X-08 | `app/A11-HistoryEmpty.dc.html` | `screens/app/A11-HistoryEmpty.jpg` |
| O-10 Unlock a locked link | P1 | OUT-09 | `app/O10-Unlock.dc.html` | `screens/app/O10-Unlock.jpg` |
| O-11 Copy for LLM menu | P5 | OUT-12 | `app/O11-CopyLLM.dc.html` | `screens/app/O11-CopyLLM.jpg` |
| Toasts | P1 | X-08 | `app/O13-Toasts.dc.html` | `screens/app/O13-Toasts.jpg` |
| New components | P1 | Components for v2 features | `app/AComponents2.dc.html` | `screens/app/AComponents2.jpg` |
| A-04 Summary · dark | P1 | SET-05 | `app/A04-Summary-Dark.dc.html` | `screens/app/A04-Summary-Dark.jpg` |
| A-05 Review · dark | P1 | SET-05 | `app/A05-Review-Dark.dc.html` | `screens/app/A05-Review-Dark.jpg` |
| A-03 Text diff · dark | P1 | SET-05 | `app/A03-TextDiff-Dark.dc.html` | `screens/app/A03-TextDiff-Dark.jpg` |
| A-12 Settings · dark | P1 | SET-05 | `app/A12-Settings-Dark.dc.html` | `screens/app/A12-Settings-Dark.jpg` |

## Viewer and phone — `design/prototypes/viewer/`

| Screen | Phase | Features | Prototype | Image |
|---|---|---|---|---|
| V-01 API overview | P3 | VW-01, VW-07, VW-08 | `viewer/Main.dc.html` | `screens/viewer/Main.jpg` |
| V-01 Overview · dark | P3 | SET-05, VW-12 | `viewer/V01-Overview-Dark.dc.html` | `screens/viewer/V01-Overview-Dark.jpg` |
| V-01 Version failed to load | P3 | VW-01, VW-13, X-08 | `viewer/V01-Overview-Error.dc.html` | `screens/viewer/V01-Overview-Error.jpg` |
| Search | P3 | VW-04 | `viewer/V05-Search.dc.html` | `screens/viewer/V05-Search.jpg` |
| Version picker | P3 | VW-07 | `viewer/V05-VersionPicker.dc.html` | `screens/viewer/V05-VersionPicker.jpg` |
| V-02 Endpoint | P3 | VW-02, VW-06, VW-08, VW-14 | `viewer/V02-Endpoint.dc.html` | `screens/viewer/V02-Endpoint.jpg` |
| V-02 Endpoint · dark | P3 | VW-12 | `viewer/V02-Endpoint-Dark.dc.html` | `screens/viewer/V02-Endpoint-Dark.jpg` |
| V-02 Code samples · Java | P3 | VW-06 | `viewer/V02-CodeSamples.dc.html` | `screens/viewer/V02-CodeSamples.jpg` |
| V-02 Deprecated endpoint | P3 | VW-02, OA-17 | `viewer/V02-Deprecated.dc.html` | `screens/viewer/V02-Deprecated.jpg` |
| V-02 Endpoint history | P3 | VW-09 | `viewer/V02-History.dc.html` | `screens/viewer/V02-History.jpg` |
| V-02 Try it · request | P3 | VW-05 | `viewer/V02-TryIt.dc.html` | `screens/viewer/V02-TryIt.jpg` |
| V-02 Try it · response | P3 | VW-05 | `viewer/V02-TryIt-Response.dc.html` | `screens/viewer/V02-TryIt-Response.jpg` |
| V-02 Try it · CORS blocked | P3 | VW-13 | `viewer/V02-TryIt-Cors.dc.html` | `screens/viewer/V02-TryIt-Cors.jpg` |
| V-02 Try it · fails on newer version | P3 | VW-11 | `viewer/V02-TryIt-Warning.dc.html` | `screens/viewer/V02-TryIt-Warning.jpg` |
| V-02 Authentication | P3 | VW-05 | `viewer/V02-Auth.dc.html` | `screens/viewer/V02-Auth.jpg` |
| V-03 Schema | P3 | VW-03, VW-08 | `viewer/V03-Schema.dc.html` | `screens/viewer/V03-Schema.jpg` |
| V-04 What changed for me | P3 | VW-07, VW-09, VW-10 | `viewer/V04-Timeline.dc.html` | `screens/viewer/V04-Timeline.jpg` |
| V-04 Pick my endpoints | P3 | VW-10, OA-22 | `viewer/V04-MyEndpoints.dc.html` | `screens/viewer/V04-MyEndpoints.jpg` |
| Embedded in Spring Boot, brand colour | P3 | VW-12, PK-07 | `viewer/V06-Embedded.dc.html` | `screens/viewer/V06-Embedded.jpg` |
| M-01 Opened share link | P5 | X-07, OUT-05 | `viewer/M01-SharedLink.dc.html` | `screens/viewer/M01-SharedLink.jpg` |
| M-02 OpenAPI summary | P5 | X-07, OA-08 | `viewer/M02-Summary.dc.html` | `screens/viewer/M02-Summary.jpg` |
| M-03 Change detail | P5 | X-07, OA-07 | `viewer/M03-Change.dc.html` | `screens/viewer/M03-Change.jpg` |
| M-04 Viewer endpoint | P5 | X-07, VW-02 | `viewer/M04-ViewerEndpoint.dc.html` | `screens/viewer/M04-ViewerEndpoint.jpg` |
| Viewer overview · phone | P5 | X-07, VW-01 | `viewer/M05-ViewerOverview.dc.html` | `screens/viewer/M05-ViewerOverview.jpg` |

## Website — `design/prototypes/website/`

| Screen | Phase | Features | Prototype | Image |
|---|---|---|---|---|
| W-01 Home | P5 | Superseded by v2 (reference only) | `website/Main.dc.html` | `screens/website/Main.jpg` |
| W-01 Home · dark | P5 | Superseded by v2 | `website/W01-Home-Dark.dc.html` | `screens/website/W01-Home-Dark.jpg` |
| W-01 Home · phone | P5 | Superseded by v2 | `website/W01-Home-390.dc.html` | `screens/website/W01-Home-390.jpg` |
| W-02 Docs · phone | P5 | WEB-03 phone | `website/W02-Docs-390.dc.html` | `screens/website/W02-Docs-390.jpg` |
| W-03 Rules · phone | P5 | WEB-04 phone | `website/W03-Rules-390.dc.html` | `screens/website/W03-Rules-390.jpg` |
| W-03 Rule detail · phone | P5 | WEB-04 phone | `website/W04-RuleDetail-390.dc.html` | `screens/website/W04-RuleDetail-390.jpg` |
| W-04 404 · phone | P5 | WEB-08 phone | `website/W08-404-390.dc.html` | `screens/website/W08-404-390.jpg` |
| W-02 Docs page | P5 | WEB-03, WEB-05 | `website/W02-Docs.dc.html` | `screens/website/W02-Docs.jpg` |
| W-03 Rules reference | P5 | WEB-04 | `website/W03-Rules.dc.html` | `screens/website/W03-Rules.jpg` |
| W-03 Rule detail | P5 | WEB-04 | `website/W04-RuleDetail.dc.html` | `screens/website/W04-RuleDetail.jpg` |
| W-02 Changelog page | P5 | WEB-06 | `website/W06-Changelog.dc.html` | `screens/website/W06-Changelog.jpg` |
| W-04 Page not found | P5 | WEB-08 | `website/W08-404.dc.html` | `screens/website/W08-404.jpg` |
| W-01 Home v2 | P5 | WEB-01, WEB-02, WEB-09 | `website/W01v2-Home.dc.html` | `screens/website/W01v2-Home.jpg` |
| W-01 Home v2 · dark | P5 | WEB-07 | `website/W01v2-Home-Dark.dc.html` | `screens/website/W01v2-Home-Dark.jpg` |
| W-01 Home v2 · phone | P5 | WEB-01 phone | `website/W01v2-Home-390.dc.html` | `screens/website/W01v2-Home-390.jpg` |
