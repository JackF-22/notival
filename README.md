# Notival
A local macOS study notebook for subjects, units, notes, materials, test packs, and synthesis. Native AppKit window + system WebKit, with no bundled browser, server, account, or runtime dependency.

## Install
1. Download **Notival.zip** from the [latest release](https://github.com/JackF-22/notival/releases/latest) and open it.
2. Drag **Notival** into **Applications**.
3. The first time you open it, macOS says it can't check the developer: go to **System Settings → Privacy & Security** and click **Open Anyway** next to Notival. Once only.

Notival then keeps itself up to date. A few seconds after it opens (and every few hours) it checks for a newer release and offers it; **Update and restart** downloads it, checks it, swaps the app and reopens. **Notival → Check for Updates…** checks on demand. Notes live outside the app, so updates never touch them.

Requires macOS 13+. The app is ad hoc signed, not notarized, which is why step 3 is needed.

## Build from source
```sh
zsh scripts/build.sh
open dist/Notival.app
```
Quit Notival before copying `dist/Notival.app` to Applications. Choose Replace if a Notival copy already exists.
Building needs the Xcode command line tools. `zsh scripts/test-all.sh` runs every test.

## Publish an update
1. Raise the number in `VERSION` (1.0.0 → 1.0.1 for fixes, 1.1.0 for new features).
2. Write what changed in `release-notes/<version>.md`.
3. Commit both, then run `zsh scripts/release.sh`. It builds the app, zips it, tags the commit and creates the GitHub Release; installed copies offer it the next time they open.

Notes save atomically to `~/Library/Application Support/Margin/notes.json`, with
the previous save kept as `notes.json.bak`. Use the arrows at the bottom of the
sidebar to export or import a JSON backup. Import adds notes whose IDs are not
already present. The browser version in `web/` uses localStorage separately.

On launch, Notival imports copies of saved Foliose notes from
`~/Library/Application Support/FilePane/Notes/`. Each Foliose record is imported
once using its stable ID. The original Markdown files, records, and attachments
remain untouched. Deleted Foliose notes enter Notival's Trash. Later edits to an imported note stay in Notival; there is no
two-way sync. The original Markdown text is kept verbatim in a text block and rendered as rich
text when opened. Editing stores both sanitized rich HTML and updated Markdown
in Notival's copy. A pending Foliose draft is also copied when present.

Foliose can open Notival with a folder or selected files. The handoff creates a
new note containing local file links and the context folder. Linked files can
be revealed in Finder from the note and are not copied into Notival.

A short tour, with screenshots, is in `docs/index.html`. It is a static page
that GitHub Pages can serve from the `docs/` folder.

## Searching a PDF
With a PDF open, press **⌘F** (File → Find in PDF), type a word, and press
**Return**. Nothing is searched while you type, so long documents stay
responsive. Matches are highlighted and counted ("3 of 12"; a very common word
stops at 500 and shows "500+"). **Return** or **⌘G** jumps to the next match,
**⇧Return** or **⇧⌘G** to the previous one, and **Esc** closes the search.
Selected text in the PDF fills the search box.

## Equation recognition (optional, free, offline)
In the PDF header, the **ƒx** button turns a boxed equation into LaTeX, either on
its own line or inline. Recognition runs on your Mac with a small ONNX model in
a private Python environment, so nothing is sent anywhere after setup.

- Choose **File → Set Up Equation Recognition…**, or trace an equation and
  accept the offer. This downloads about 500 MB once into
  `~/Library/Application Support/Margin/latex-ocr`.
- It needs Python 3.10 to 3.13 (`brew install python@3.12`). The newest Python
  is too new for the libraries.
- `scripts/setup-latex-ocr.sh` does the same from Terminal. Delete the
  `latex-ocr` folder to remove it.
- Unbalanced brackets are repaired and several image sizes are tried, but long
  equations still need a few corrections. Trace them a part at a time.

## Canvas
Pair subjects with your Canvas courses and keep assignments in your to-do lists.

- On Home, or in a subject's To do card, choose **Connect Canvas** and paste
  your **Calendar Feed** link (in Canvas: Calendar, then Calendar Feed in the
  right sidebar). It doesn't expire, so there is nothing to renew.
- Notival suggests a course for each subject, and can add a subject for every
  course you haven't paired. Assignments with due dates become tasks, labeled
  with their subject and linked back to Canvas.
- Sync runs after launch, every half hour while the app is open, and from the
  **Sync Canvas** button. Canvas owns each task's title and due date. The
  calendar doesn't say whether you've turned work in, so you tick tasks off
  yourself, and Notival never unticks them.
- It is read-only: Notival only fetches that one calendar link. The link works
  like a password for your calendar, so it is stored in the macOS Keychain, not
  in your notes or backups. Reset it in Canvas at any time. Disconnecting
  removes it and keeps your tasks.

## VS Code companion
Open `extension/` in VS Code and press F5 using its launch configuration. In the Extension Development Host, select code and run **Notival: Capture selection** (also in the editor context menu). Run Notival at least once beforehand to register its URL scheme.

Captured blocks have source links that open and highlight the original lines in VS Code. **Comment in VS Code** adds an inline comment without modifying the source file. Inline VS Code threads last for that extension session; notes and snippets persist in Notival. Source links use fixed line numbers and can drift after edits. The companion targets standard VS Code, not Insiders or other forks. VS Code must have the companion loaded for return links to work.

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
- Control-Option-Command-N opens a fresh note from any app while Notival is running
- Local URL handoff with VS Code; no network listener

## Flagging what you don't understand
In a lecture, select the text that isn't clicking and press **⌘⇧U** (or **Flag as unclear**). It is
highlighted in amber and you keep writing; a one-line comment about what's unclear is optional.

- Click a highlight to read, edit, or resolve it. **A flag can only be resolved by writing what
  cleared it up**, so the answer is kept next to the passage. Resolved flags stay as a faint green
  underline, can be reopened, and can become a Recall question in one click.
- Open flags are gathered under **To clarify**: on the subject overview, on Home, and in a note's
  **Questions** list. **Go to** jumps back to the highlighted text.
- Flags live on the note (`note.flags`) and the text carries only a small marker, so your words,
  Markdown, and exports are unchanged.

Checks: `node tests/flags-model.cjs` and `node tests/flags.mjs` (requires Chrome).

## Recall: questions, review, and quizzes
Turn what you are learning into questions you answer from memory. Open **Recall**
from a subject's overview, Home, or a test pack's **Practice included notes**.

**Making questions**
- Select text in a note and press **⌘⇧K** (or **Make a question**). A short selection becomes a
  fill-in-the-blank; a longer one becomes the answer to a question you write. A link under the
  form switches the type. If it's something you don't understand yet, flag it instead (below).
- Type `Q:` and `A:` on separate lines (or `Q: …? A: …` on one line) and the pair becomes a
  question. Wrap words in `{{double braces}}` to hide them, with an optional hint:
  `{{mitochondrion::organelle}}`.
- **Draft questions from my notes** (first screen, or the bank's **Suggest**) proposes questions
  from bold terms, "X is …" definitions, and headings. Reword them and keep only the good ones.
- A note's **Questions** button lists everything asked about that note, including things you
  haven't understood yet. **Browse all** in Recall lets you search, edit, pause, or delete any
  question. Plain paragraphs still produce older "explain this passage" prompts; pause the
  ones you don't want.

**Studying**
- **Start** asks what is due, plus a few new questions, and shows a score at the end. You answer
  first, then reveal. Questions you haven't met before arrive as multiple choice; later
  reviews ask you to type. Short answers are checked and spelling slips are forgiven; longer
  answers show which key ideas you did and didn't mention.
- You grade yourself (Again, Hard, Good, Easy, or keys 1–4) and see when each question
  returns. Missed questions come back later in the same session, and the summary offers a
  **Drill** of the ones you missed.
- When nothing is due, **Practice anyway** runs a mixed round without waiting.

Scheduling is a spaced-repetition scheme (SM-2 family), kept per question in
`state.reviews`, with an append-only log in `state.reviewLog`. Questions you write live in
`state.items` and are included in note backups. Nothing leaves your Mac.

Checks: `node tests/recall-model.cjs`, and `node tests/recall-ui.mjs` (requires Chrome).

## Learning notebook

Add text and JavaScript cells on the same page. Use **Run** (or Command/Ctrl-Enter inside a code cell) to run JavaScript from the top through that cell. **Run all** starts the whole page fresh; press it again to stop. Cells share variables within each run. Use `console.log(value)` for inline output. Code runs in a worker without access to the editor DOM or native bridge, and stops after three seconds. Browser APIs such as the DOM and Node.js APIs are unavailable.

An optional prediction folds under each JavaScript cell. Duplicate a cell to try a variation. Results save with your notes, and show “Code changed” when the cell or earlier JavaScript changes. Duplicated declarations should be renamed, or edited in the original cell, because the page runs as one script.

Checks: `node tests/lab.cjs`, `node tests/extension.cjs`, and `node tests/workspace.mjs` (requires Chrome).

Code blocks remain plain monospace editors. Mind maps support manual ideas and source-linked passage connections. PDF files stay
in their original locations; Notival stores their path, page references, and the
text of captured quotes. Moving a PDF breaks its references until it is attached
again. Scanned PDFs need a text layer for quote capture. JavaScript cells run
locally in a separate worker; other languages remain editable snippets. Images
inserted into notes are embedded in the note backup and limited to 2 MB each.

The new Notival icon and violet, cyan, and coral theme are included in the built app. Foliose's original Markdown files stay untouched.

## Notival 0.4.0 — Understanding workspace

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

## Notival 0.5.0 — Persistent synthesis

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

## Notival 0.6.0 — Student notebooks

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
  `~/Library/Application Support/Margin/Materials/`. PDFs open in Notival's PDF
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

### Notival 0.6.1 — Sidebar spacing

The sidebar now uses one scrolling library instead of capped, nested lists.
Subject names wrap over two lines, units have clear indentation and selection,
and the subject creation control sits beside its heading. The sidebar defaults
to 280 px and remains resizable. Verified visually in the native application;
no storage changes were introduced.


## Notival 0.7.0 — Subject personality and planning

Features now have consistent icons and restrained colors: blue notes, teal
materials, amber test packs, violet synthesis, and green units. A permanent
**Subject overview** button returns directly to the front of the active subject;
clicking the subject in the sidebar also resets its unit/tab context.

**Customize subject** edits name, icon, accent color, and description, and chooses
whether the overview shows its checklist, test/assignment dates, feature
shortcuts, and recent notes. The small checklist saves progress. Dates support
tests, assignments, optional details, completion, editing, removal, and Undo;
dated test packs appear automatically. Dates are displayed in Notival and do
not create OS notifications or calendar events.

### Unit study guides

A note belongs to one unit (the unit selector, or drag it onto the unit). When a
note has a linked PDF, the PDF bar shows **Add to unit materials**; it adds that
file to the note's unit once (the same file is never duplicated, and if it is
already in another unit the button moves it, with Undo). Open a unit and choose
**Study guide** to pick which of its notes and PDF materials to include, then
**Download PDF**: the notes become the first pages and the checked PDFs are
appended after them. Synthesis notes and empty notes are left out. The PDF is
built on your Mac; nothing is uploaded. Test: `node tests/student.cjs`.

### GitHub setup

Build outputs, local preview screenshots, and environment files are ignored.
The repository source contains no personal notes or material library.
After installing and signing into GitHub CLI, run:

```sh
gh auth login -h github.com
zsh scripts/publish-github.sh
```

The script initializes Git, commits the app source, and creates a private
`notival` repository under the signed-in account. It refuses to push to an
unexpected remote or a public repository. It must be run locally when the
agent's filesystem policy prevents writes to `.git`.


## Notival 0.9.0 — Filing and capture

Notes appear as compact cards with a short preview, unit, and Move action.
Drag notes or materials onto sidebar subjects or units; hovering a collapsed
subject reveals its units. Select multiple cards to move them together. Moves
preserve contents and source references and offer Undo. Move also provides a
keyboard-accessible destination chooser.

The sidebar Capture to control follows the current subject/unit, or pins a
specific destination. Global new notes, external captures, and newly opened
PDFs use it. Subject-specific creation uses that subject. Existing PDFs retain
their original note destination. Drop Finder files onto a subject/unit to copy
them into the local Materials library. Undo removes the attachment entry while
retaining its copied file on disk.


### Connect passages while writing

Choose **Tools → Connect passages** (or select text and choose **Connect passages**), then draw freely from near
one paragraph, list item, or code block to another. Nearby passages highlight;
release and describe their relationship. Cancel or Escape leaves the map
unchanged. The mind map gains both passages and a labeled connection without
opening it. Reconnecting the same pair updates its relationship.

Passage nodes follow text edits when the map opens. Removed passages keep their
last label with a dashed border. Remove selected deletes a passage node and its
connections without deleting note text. Connections travel with note backups.

Check: `node tests/passage-connections.mjs` (requires Chrome).


### A simpler writing surface

New note and Command-N open a blank note ready to write. **Tools → New from
template** keeps lecture, reading, assignment, and Cornell starting layouts.
The formatting bar keeps paragraph style, bold, italic, and lists visible.
**Insert** contains tables, images, equations, drawing, quotes, and code; `/`
and keyboard shortcuts still work. Select a passage to underline, strike
through, ask a source-linked question, or connect passages.

**Questions** opens the note’s questions. **Tools** contains the mind map,
subject connections, and VS Code capture. **Open PDF** stays visible. **Context**
opens the outline (when headings exist), subject, and recent notes; it starts
closed. **Focus** sits beside the sidebar control; Escape exits focus.

Validation: `node tests/editor-interaction.mjs`, `node tests/understanding.mjs`,
and `node tests/passage-connections.mjs`.


### Quieter subject overviews and quick due dates

The subject overview focuses on To do and Upcoming. Units and Recent notes open
on demand. The tabs retain the complete library; Add groups file attachment,
unit creation, test packs, dated assignments, date management, and customization.
The duplicate feature shortcut cards have been removed. Existing checklist,
date, and recent-note visibility preferences are preserved.

Checklist completion has a short checkmark pop and settling animation, including
study-pack checklists. Unchecking reverses the completed state immediately.
Reduced-motion settings disable the animation.

Type **HW3 due Friday at 11:59pm** in the checklist entry or a test/assignment
Title. A dismissible preview shows the interpreted local date and time. Saving
keeps **HW3** as the title and stores the due date and time. Click × on the preview
to keep the phrase as ordinary text. Tasks and assignments can be edited with
manual date/time pickers; manual picker changes take precedence.

Supported English phrases include today, tomorrow, tonight, weekdays (including
this/next), in N days, ISO dates, and month/day names, with optional am/pm,
24-hour times, noon, or midnight. Weekdays mean the next occurrence, including
today; a timed weekday rolls to the following week if its time has passed.
This Friday explicitly keeps the current occurrence. Named dates without a year
use their next occurrence. Recurring schedules, numeric slash dates, and time
zone phrases are not interpreted. Recognition uses a date phrase at the end of
the entry. Dates are stored in local wall time, with no OS notification added.

Checks: `node tests/task-dates.cjs`, `node tests/subject-overview.mjs`,
`node tests/student.cjs`, and `node tests/student-backup.cjs`.


### Balanced subject overview and completed work

Units and the three latest notes are visible on the overview again, with compact
unit cards, tab icons, and lightly outlined To do/Upcoming panels. Attach
materials is directly beside New note; less frequent actions remain under Add.

Completed checklist items, tests/assignments, and test-pack study topics move
into their own collapsible Completed section after the check animation. Uncheck
an item to return it to the active list. Clear completed removes only completed
items in that section and offers Undo. Pending tasks and their recognized dates
are preserved. The overview shows up to four active checklist items and three
active dates; All tasks / All dates open the complete lists.


### Comments on images

Click an image embedded in a note, or choose Comment on image beneath its text
block, to open its comments. With multiple images, the buttons identify each
image separately. Images can also be focused with Tab and opened with Enter or
Space. Add, edit, and remove comments; removal offers Undo. Comments attach to
a stable image identity and stay with the note through saves, Trash, and JSON
backups. They discuss the whole image rather than a selected region. Pasted
slide screenshots and iPad drawings use the same behavior.

Check: `node tests/image-comments.mjs`.


### Text alignment, spacing, and prose symbols

Use Align in the note formatting bar for Left, Center, Right, or Justify. It
applies to the current paragraph or selected paragraphs and stays in the note's
rich HTML through saves and JSON backups. Plain Markdown does not encode text
alignment. The writing column now uses equal text gutters, aligned title and
toolbar edges, and more paragraph spacing.

In prose, type a space after `->`, `<-`, `=>`, `<->`, `<=>`, `+/-`, `<=`, `>=`,
`!=`, or `~=` to insert →, ←, ⇒, ↔, ⇔, ±, ≤, ≥, ≠, or ≈. Executable code cells,
inline/preformatted code, equations, links, and URL tokens remain literal.

Checks: `node tests/alignment-symbols.mjs`, `node tests/editor-interaction.mjs`.


### Discoverable editor shortcuts and table sizing

Insert actions show their shortcuts beside their names: inline equation ⌘⇧E,
display equation ⌘⌥E, table ⌘⌥T, image ⌘⌥I, checklist ⌘⌥L, and quote ⌘⌥Q.
The Text style list shows the current paragraph style. Change existing text
between Body and Heading 1–3 without rewriting it, using the list or ⌘⌥0–3.
Shortcuts apply while editing rich text and stay inactive in code cells, title
fields, search, and dialogs. Non-Mac browsers use Ctrl and Alt equivalents.

Insert → Table, /table, and ⌘⌥T open an 8×8 size grid inspired by Foliose.
Hover to preview a size, click to insert, or drag across the grid and release.
Arrow keys resize the selection; Enter/Space inserts; Escape cancels. Custom
fields allow up to 12 columns and 50 rows. Insertion restores the note selection
and puts the caret in the first cell. Reduced-motion settings disable the
picker's opening animation and cell transitions.

Check: `node tests/editor-shortcuts.mjs`.


### Launch, clipboard, and connection feedback

Launching shows the folded blue/mint Notival mark assembling with a soft glow,
then fades into the notebook once data is ready. The normal reveal is brief;
reduced motion skips movement and exits immediately when ready. Interaction
can dismiss the animation after readiness, and a fail-safe prevents an overlay
from getting stuck.

Dragging to select text no longer triggers the card's caret-to-end behavior.
Native copy/cut remain available, and paste preserves supported rich HTML after
sanitizing it, with plain-text and image paste also supported.

Mind map is directly visible in the note toolbar. Connect passages remains in
Tools and the selection toolbar. Its drag trail follows the cursor across the
window; source and destination passages use separate violet and mint highlights.
Highlights remain while describing the relationship, then clear on save/cancel.

Checks: `node tests/launch.mjs`, `node tests/editor-clipboard.mjs`,
`node tests/passage-connections.mjs`.
