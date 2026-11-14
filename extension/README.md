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
