#!/bin/zsh
# Installs offline equation recognition for Notival's "ƒx" Trace button.
# Free, private, and self-contained: about 500 MB in ~/Library/Application Support/Margin/latex-ocr.
# To remove it later, delete that folder.
set -eu
TARGET="$HOME/Library/Application Support/Margin/latex-ocr"
PYTHON=""
for candidate in python3.12 python3.11 python3.13 python3.10; do
  for dir in /opt/homebrew/bin /usr/local/bin /usr/bin; do
    if [[ -x "$dir/$candidate" ]]; then PYTHON="$dir/$candidate"; break 2; fi
  done
done
if [[ -z "$PYTHON" ]]; then
  echo "Python 3.10 to 3.13 is needed (the newest Python is too new for the recognition libraries)."
  echo "Install one with:  brew install python@3.12"
  exit 1
fi
mkdir -p "$TARGET"
"$PYTHON" -m venv "$TARGET/venv"
"$TARGET/venv/bin/pip" install --quiet --upgrade pip
"$TARGET/venv/bin/pip" install --quiet rapid_latex_ocr requests
# Fetch the model files now so the first trace is quick.
"$TARGET/venv/bin/python" -c "from rapid_latex_ocr import LaTeXOCR; LaTeXOCR()" >/dev/null 2>&1
echo "Equation recognition is ready. Use the ƒx button in Notival's PDF bar."
