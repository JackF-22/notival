# Margin
A local macOS study notebook for subjects, units, notes, materials, test packs, and synthesis. Native AppKit window + system WebKit, with no bundled browser, server, account, or runtime dependency.

## Run
```sh
zsh scripts/build.sh
open dist/Margin.app
```
To replace an older copy in Applications, quit Margin and drag
`dist/Margin.app` to Applications, choosing Replace. The app uses the same
local notes store, so your existing Margin notes remain available.
Requires macOS 13+ and Xcode command line tools to build. The app is locally ad hoc signed, not notarized for distribution.

Notes save atomically to `~/Library/Application Support/Margin/notes.json`, with
the previous save kept as `notes.json.bak`. Use the arrows at the bottom of the
sidebar to export or import a JSON backup. Import adds notes whose IDs are not
already present. The browser version in `web/` uses localStorage separately.

On launch, Margin imports copies of saved Foliose notes from
`~/Library/Application Support/FilePane/Notes/`. Each Foliose record is imported
once using its stable ID. The original Markdown files, records, and attachments
remain untouched. Deleted Foliose notes enter Margin's Trash. Later edits to an imported note stay in Margin; there is no
two-way sync. The original Markdown text is kept verbatim in a text block and rendered as rich
text when opened. Editing stores both sanitized rich HTML and updated Markdown
in Margin's copy. A pending Foliose draft is also copied when present.

Foliose can open Margin with a folder or selected files. The handoff creates a
new note containing local file links and the context folder. Linked files can
be revealed in Finder from the note and are not copied into Margin.

## VS Code companion
Open `extension/` in VS Code and press F5 using its launch configuration. In the Extension Development Host, select code and run **Margin: Capture selection** (also in the editor context menu). Run Margin at least once beforehand to register its URL scheme.

Captured blocks have source links that open and highlight the original lines in VS Code. **Comment in VS Code** adds an inline comment without modifying the source file. Inline VS Code threads last for that extension session; notes and snippets persist in Margin. Source links use fixed line numbers and can drift after edits. The companion targets standard VS Code, not Insiders or other forks. VS Code must have the companion loaded for return links to work.

## Features
- Rich text blocks with headings, inline formatting, lists, checklists, quotes,
  tables, links, images, local equations, and note templates
- Native split-view PDF workspace: opening a PDF resumes its existing note or
  creates one automatically. Selecting text opens a comment bubble beside the
  document, where the passage can be commented on or highlighted. You can also
  press Command-Shift-Q to capture a page-linked quote, or Command-Shift-P to
  add a blank thought linked to the current page. Clicking a PDF reference in a
  note reopens the document at that page and highlights the captured passage.
- Type `/` or `\` in a text block to open the full insert menu; keep typing to
  filter it, then press Return or click an option
- Use `\inlineequation` for LaTeX within a sentence. Click an equation and
  press Delete or Backspace to remove the whole equation.
- Press Command-Shift-T to add a text block or Command-Shift-C to add a code block
  while writing a note (Control-Shift-T/C in a browser outside macOS).
- Press Command-Shift-Delete while editing a cell to remove that cell. Right-click
  a note in the sidebar for Open, Pin, and Delete actions. Deleted notes go to Trash.
- Mixed editable text and code blocks; language labels and copy
- Note search, pinning, deletion, automatic saving, JSON export
- Per-note mind map; connected nodes, dragging, renaming, removal
- Native light/dark appearance, keyboard editing, Command-N
- Control-Option-Command-N opens a fresh note from any app while Margin is running
- Local URL handoff with VS Code; no network listener

## Learning notebook

Add text and JavaScript cells on the same page. Use **Run** (or Command/Ctrl-Enter inside a code cell) to run JavaScript from the top through that cell. **Run all** starts the whole page fresh; press it again to stop. Cells share variables within each run. Use `console.log(value)` for inline output. Code runs in a worker without access to the editor DOM or native bridge, and stops after three seconds. Browser APIs such as the DOM and Node.js APIs are unavailable.

An optional prediction folds under each JavaScript cell. Duplicate a cell to try a variation. Results save with your notes, and show “Code changed” when the cell or earlier JavaScript changes. Duplicated declarations should be renamed, or edited in the original cell, because the page runs as one script.

Checks: `node tests/lab.cjs`, `node tests/extension.cjs`, and `node tests/workspace.mjs` (requires Chrome).

Code blocks remain plain monospace editors. Mind maps are manual. PDF files stay
in their original locations; Margin stores their path, page references, and the
text of captured quotes. Moving a PDF breaks its references until it is attached
again. Scanned PDFs need a text layer for quote capture. JavaScript cells run
locally in a separate worker; other languages remain editable snippets. Images
inserted into notes are embedded in the note backup and limited to 2 MB each.

The new Margin icon and violet, cyan, and coral theme are included in the built app. Foliose's original Markdown files stay untouched.

## Margin 0.4.0 — Understanding workspace

- A smaller home screen with recent notes and a persistent compact list option.
  All notes and Pinned now open their respective home views. Search uses one
  Command-K entry point and also finds questions, explanations, and evidence.
- **Ask a question** on a note, or **Question this passage** beneath a text
  block. A selected passage can also be captured through Ask a question.
  Questions retain a source block and an excerpt, plus your explanation,
  evidence, and chosen understanding stage. Browse them from **Questions** in
  the sidebar or from a project home. Removal supports Undo.
- Questions with explanations become source-linked recall prompts. Generated
  recall prompts can be edited. Connections can carry a written relationship.
- **Build an explanation** on Home or inside a project combines selected text
  blocks under Supports, Challenges, or Still unclear with your conclusion.
  The new note preserves editable snapshots and links to original source blocks;
  snapshots do not automatically change when the source changes.
- Code cells have a **What happened, and why?** reflection beneath their output.
- **Focus writing** hides navigation and context. Escape exits focus.
- Questions, synthesis references, and reflections are part of their notes and
  are included in JSON backups. Review scheduling and connection descriptions
  are workspace state; the existing additive backup importer only imports notes
  and Trash, rather than restoring all workspace settings.

Validation: `node tests/knowledge.cjs`, `node tests/lab.cjs`,
`node tests/rich-editor.cjs`, `node tests/pdf-notes.cjs`,
`node tests/extension.cjs`. `node tests/understanding.mjs` exercises questions,
recall provenance, reflection, synthesis navigation, focus, and persistence in an
isolated Chrome profile. Chrome must be launchable by the test process.

## Margin 0.5.0 — Persistent synthesis

**Build an explanation** now opens a workspace with searchable source notes,
editable or selected excerpts, three evidence lanes, reasoning for each excerpt,
and a working explanation. Every draft is a regular note with attached synthesis
data, so it autosaves, survives relaunch, and travels through note backups and
Trash. Project pages list drafts; generated notes have a **Resume synthesis
workspace** action. An excerpt preserves its original text and source block;
the workspace flags changed or unavailable sources. Creating/updating a note
preserves manually edited generated blocks as additional blocks.

Project pages now lead with an editable guiding question and concrete output,
a next action based on drafts/questions/commitments, and Gather → Question →
Explain counts. Commitments and milestones remain available in a collapsible
section. Counts describe activity, not mastery or a required sequence.

Additional check: `node tests/synthesis.cjs` verifies source preservation and
safe regeneration after manual editing. The synthesis workflow in
`tests/understanding.mjs` uses the new workspace.

## Margin 0.6.0 — Student notebooks

The main workspace is now **Subjects → Units → Notes and materials**. Existing
project IDs remain unchanged, so notes and source references keep their links.
The front page shows subjects and recent notes; the previous thought panel and
project-direction dashboard are no longer used. Persistent Home, Back/Forward,
clickable subject/unit breadcrumbs, and expandable sidebar subjects improve
navigation. Option-Left/Right navigates history.

- Add and rename units, move them earlier, and assign notes/materials through
  unit selectors. Removing a unit keeps its content unsorted and preserves
  existing test-pack coverage; Undo restores the unit.
- **Attach materials** selects multiple files and copies them into
  `~/Library/Application Support/Margin/Materials/`. PDFs open in Margin's PDF
  workspace; other files open in their default app. Removing a material from a
  subject keeps its managed file and offers Undo.
- **Test packs** include selected units and/or individual notes and materials,
  an optional test date, and a study checklist. Whole-unit membership updates as
  content is added. Practice uses only the notes included in the pack.
- **Create study guide** creates an editable note from the pack's checklist and
  text blocks, preserving original note/block links and attached file links.
  Each invocation creates a new snapshot. Material contents are not extracted
  automatically, and checklist progress is self-reported.
- Command-K search also finds units, material names, and test packs. Synthesis,
  questions, PDF annotations, and executable cells remain available.
- JSON backup import now adds missing subject records, including units and test
  packs. Existing records are left unchanged. Managed material files are **not
  embedded in JSON backups**; preserve the Materials folder when moving Macs.
  This release does not add cross-device sync or a portable attachment archive.

Checks: `node tests/student.cjs` covers legacy metadata, dynamic scoped test-pack
membership, JSON round trips, and safe unit removal. Existing core test suites
remain applicable. The native interface was checked for unit creation, managed
file attachment, test-pack creation, checklist saving, study-guide creation,
and persistence after relaunch.

### Margin 0.6.1 — Sidebar spacing

The sidebar now uses one scrolling library instead of capped, nested lists.
Subject names wrap over two lines, units have clear indentation and selection,
and the subject creation control sits beside its heading. The sidebar defaults
to 280 px and remains resizable. Verified visually in the native application;
no storage changes were introduced.


## Margin 0.7.0 — Subject personality and planning

Features now have consistent icons and restrained colors: blue notes, teal
materials, amber test packs, violet synthesis, and green units. A permanent
**Subject overview** button returns directly to the front of the active subject;
clicking the subject in the sidebar also resets its unit/tab context.

**Customize subject** edits name, icon, accent color, and description, and chooses
whether the overview shows its checklist, test/assignment dates, feature
shortcuts, and recent notes. The small checklist saves progress. Dates support
tests, assignments, optional details, completion, editing, removal, and Undo;
dated test packs appear automatically. Dates are displayed in Margin and do
not create OS notifications or calendar events.

### GitHub setup

Build outputs, local preview screenshots, and environment files are ignored.
The repository source contains no personal notes or material library.
After installing and signing into GitHub CLI, run:

```sh
gh auth login -h github.com
zsh scripts/publish-github.sh
```

The script initializes Git, commits the app source, and creates a private
`margin` repository under the signed-in account. It refuses to push to an
unexpected remote or a public repository. It must be run locally when the
agent's filesystem policy prevents writes to `.git`.
