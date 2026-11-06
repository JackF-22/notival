#!/usr/bin/env python3
"""Reads a cropped equation image and prints {"ok": true, "latex": "..."} as its last line of output.

Runs fully offline with the ONNX models that scripts/setup-latex-ocr.sh installs next to this file's venv.
"""
import contextlib, io, json, os, re, sys, tempfile, time

def finish(payload):
    sys.stdout.write("\n" + json.dumps(payload) + "\n")
    sys.stdout.flush()
    sys.exit(0)

try:
    import numpy as np
    from PIL import Image
    with contextlib.redirect_stdout(sys.stderr):
        from rapid_latex_ocr import LaTeXOCR
except Exception as error:  # the environment is not set up
    finish({"ok": False, "error": "setup", "detail": str(error)})

# Loops end sooner with a shorter decoder limit; 320 tokens covers most display equations.
CONFIG = "max_width: 672\nmax_height: 192\nmin_height: 32\nmin_width: 32\nbos_token: 1\nmax_seq_len: 320\neos_token: 2\ntemperature: 0.00001\n"

def tidy(path, pad=14, target=0):
    """Trim blank margins, then optionally scale small equations up to a comfortable height."""
    image = Image.open(path).convert("L")
    ink = np.where(np.array(image) < 200)
    if ink[0].size == 0:
        return None
    y0, y1, x0, x1 = ink[0].min(), ink[0].max(), ink[1].min(), ink[1].max()
    crop = image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad + 1), min(image.height, y1 + pad + 1)))
    if target and crop.height < target:
        scale = target / crop.height
        crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
    buffer = io.BytesIO()
    crop.convert("RGB").save(buffer, "PNG")
    return buffer.getvalue()

def collapse_repeats(latex):
    """The model sometimes loops on one group of tokens; keep the first pass and drop the repeats."""
    tokens = re.findall(r"\\[A-Za-z]+|\s+|.", latex)
    count, out, i = len(tokens), [], 0
    while i < count:
        matched = False
        for period in range(1, 31):
            if i + period * 3 > count:
                break
            block = tokens[i:i + period]
            repeats = 1
            while tokens[i + repeats * period:i + (repeats + 1) * period] == block:
                repeats += 1
            if repeats >= 3 and sum(len(token) for token in block) >= 2:
                out.extend(block)
                i += repeats * period
                matched = True
                break
        if not matched:
            out.append(tokens[i])
            i += 1
    return "".join(out)

def balanced(latex):
    """Cheap structural check: braces and \\left/\\right all pair up."""
    depth = 0
    for match in re.finditer(r"\\[{}]|\\left|\\right|[{}]", latex):
        token = match.group(0)
        if token in ("\\{", "\\}"):
            continue
        if token == "{":
            depth += 1
        elif token == "}":
            depth -= 1
            if depth < 0:
                return False
    lefts, rights = len(re.findall(r"\\left\b", latex)), len(re.findall(r"\\right\b", latex))
    return depth == 0 and lefts == rights

# Crops and scales to try. Different equations read best at different sizes.
VARIANTS = ((14, 0, 1.0), (14, 96, 1.0), (30, 0, 1.0), (14, 64, 1.0), (14, 128, 1.0), (14, 0, 0.7))

def tidy_scaled(path, pad, target, shrink):
    data = tidy(path, pad, target)
    if data is None or shrink == 1.0:
        return data
    image = Image.open(io.BytesIO(data))
    image = image.resize((max(32, int(image.width * shrink)), max(32, int(image.height * shrink))), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()

def run(path):
    config = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False)
    config.write(CONFIG)
    config.close()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            model = LaTeXOCR(config_path=config.name)
    finally:
        os.unlink(config.name)
    candidates = []  # (latex, looped)
    deadline = time.time() + 40
    for pad, target, shrink in VARIANTS:
        data = tidy_scaled(path, pad, target, shrink)
        if data is None:
            return {"ok": False, "error": "blank"}
        started = time.time()
        with contextlib.redirect_stdout(sys.stderr):
            raw, _ = model(data)
        looped = collapse_repeats(raw) != raw or time.time() - started > 6
        latex = re.sub(r"\\(?:text|display|script)style\s*", "", collapse_repeats(raw)).strip()
        if latex and latex not in [c[0] for c in candidates]:
            candidates.append((latex, looped))
        # Stop at the first clean, well-formed reading; otherwise keep looking until time runs out.
        if latex and not looped and balanced(latex):
            break
        if time.time() > deadline:
            break
    if not candidates:
        return {"ok": False, "error": "empty"}
    ranked = sorted(candidates, key=lambda c: (c[1], not balanced(c[0])))
    return {"ok": True, "latex": ranked[0][0], "uncertain": ranked[0][1] or not balanced(ranked[0][0]), "candidates": [c[0] for c in ranked]}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        finish({"ok": False, "error": "usage"})
    try:
        finish(run(sys.argv[1]))
    except SystemExit:
        raise
    except Exception as error:
        finish({"ok": False, "error": "failed", "detail": str(error)})
