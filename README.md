<p align="center"><img src="docs/assets/mark.svg" width="72" alt=""></p>

# Notival

**A study notebook for your Mac.** Notes, PDFs, recall questions and code, organised by subject. It's a native app with no account, no server and no subscription, and your notes never leave your Mac.

![Notival](preview.png)

## Install (2 minutes)

1. **Download** `Notival.zip` from the [latest release](https://github.com/JackF-22/notival/releases/latest) and open it.
2. **Drag** Notival into your **Applications** folder.
3. **Open it.** The first time, macOS says it can't check the developer. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Notival. You only do this once.

That's it. Notival updates itself: it offers new versions when you open it, and **Notival → Check for Updates…** checks on demand. Updates never touch your notes.

*Needs macOS 13 or later.*

## What you can do

| | |
|---|---|
| **Organise** | Subjects hold units, classes, notes and materials. Drag to reorder or file things; hide any section you never use. |
| **Write** | Rich notes with headings, lists, tables, columns, pictures, equations, highlights and templates. Type `/` for everything you can insert. |
| **Read PDFs** | Open a PDF beside your note, quote passages, comment on them, or box an equation and get editable LaTeX. |
| **Remember** | Turn notes into questions (`Q:` / `A:`) and review them on a spaced-repetition schedule. Flag what you don't understand and resolve it later. |
| **Plan** | Test dates, to-do lists with natural dates ("HW3 due Friday 11:59pm"), a class timer, and an optional Canvas calendar feed. |
| **Languages** | Language subjects get vocab, a transliterating keyboard, listening practice and graded stories. |
| **Think** | Mind maps, a memory palace, and synthesis notes that gather evidence for and against an idea. |
| **Code** | Runnable JavaScript cells, code blocks, Markdown export, and a [VS Code companion](#get-it-in-vs-code). |
| **Share** | Export a note as PDF, Word or Markdown, or push Markdown to a GitHub repository straight from the app. |

New to it? Open Notival, press **＋ New subject**, then **＋ Note**. Press **⌘K** to search anything, and **⌘,** to hide the parts you don't need.

## Get it in VS Code

The companion extension lets you send code from VS Code into a note, and jump from the note back to the exact lines. Install the app first and open it once.

1. **Download** `Notival-Companion.vsix` from the [latest release](https://github.com/JackF-22/notival/releases/latest).
2. In VS Code open the **Extensions** view (⇧⌘X), click **⋯** at the top right, choose **Install from VSIX…** and pick the file.
   *Or in Terminal:* `code --install-extension Notival-Companion.vsix`
3. Click the **Notival** icon in the activity bar. You'll see the outline of the file you're editing.

**Using it**

- **Send code:** select lines, right-click, **Notival: Capture selection**. Notival asks which note to add it to, or makes a new one.
- **Copy a function:** in the sidebar, the **copy** button puts a function on your clipboard, and **→** sends it to Notival.
- **Go back:** click a captured block's source link in Notival and VS Code opens the file at those lines.

More in [extension/README.md](extension/README.md). The extension never edits your files.

## Send Markdown to GitHub

1. Open a note and click the **Markdown** button in its header. The pane shows exactly what GitHub would get.
2. Click **Connect GitHub**. Your browser opens to sign in, and Notival lists your repositories. (This uses GitHub's free command-line tool, `brew install gh`, so your password never enters Notival.)
3. Choose a repository and **Save into this repository…**, then **Commit & push to GitHub**.

## Your data

Notes are stored on your Mac in `~/Library/Application Support/Margin/notes.json`, with the previous save kept next to it. Use the arrows at the bottom of the sidebar to export or import a JSON backup. Nothing is uploaded unless you choose to publish or sync something.

## Build it yourself

```sh
zsh scripts/build.sh        # builds dist/Notival.app (needs the Xcode command line tools)
open dist/Notival.app
zsh scripts/test-all.sh     # runs every test
zsh scripts/package-extension.sh   # builds dist/Notival-Companion.vsix
```

## More

- [Tour with screenshots](https://jackf-22.github.io/notival/)
- [Full reference](docs/reference.md): every feature in detail, Canvas and equation setup, release history
- [Publishing a release](docs/releasing.md)
