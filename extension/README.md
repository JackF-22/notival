# Notival for VS Code

![Notival](icon.png)

Bridge between VS Code and the **Notival** notebook app for macOS.

## What it does

| In VS Code | In Notival |
| --- | --- |
| Select code → **Notival: Capture selection** | The code lands in a note with its language, file name and line numbers |
| Click a captured block's source link | VS Code opens that file with the exact lines highlighted |
| **Comment in VS Code** on a block | Your note appears as an inline comment on those lines |

Your source files are never modified, and nothing leaves your Mac.

## The sidebar

Click the Notival icon in the activity bar.

- **This file** shows the structure of the file you are editing: functions, classes, methods and Markdown sections, with how many lines each covers. VS Code's own language support is used when it has any, and the file is read directly when it has not. Click an item to jump to it.
- Beside each item: **copy** puts that function's code (with the doc comment above it) on your clipboard, and **→** sends it to Notival. Right-click for more: *Copy as Markdown* (a fenced block with the file name and lines) and *Copy the signature*.
- **Sent to Notival** lists what you have sent, grouped by file. Click one to go back to those lines.
- Without opening the sidebar: right-click inside a function and choose **Notival: Copy the function around the cursor** (or *Send*).

## Using it

1. Install the Notival app and open it once.
2. In VS Code, select a few lines.
3. Right-click → **Notival: Capture selection** (or ⇧⌘P and type *Notival*).
4. A **Notival** button in the status bar does the same thing.

Run **Notival: How it works** or open *Get Started* from the Command Palette for a short walkthrough.

## Notes

- Captures are limited to about 70 KB of text.
- If the file changed since you captured it, you will be asked to capture again so a link never points at the wrong lines.
- Works with local files and VS Code remote windows.
