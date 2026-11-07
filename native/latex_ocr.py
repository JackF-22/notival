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
    from PIL import Image, ImageOps
    with contextlib.redirect_stdout(sys.stderr):
        from rapid_latex_ocr import LaTeXOCR
except Exception as error:  # the environment is not set up
    finish({"ok": False, "error": "setup", "detail": str(error)})

# Loops end sooner with a shorter decoder limit; 320 tokens covers most display equations.
CONFIG = "max_width: 672\nmax_height: 192\nmin_height: 32\nmin_width: 32\nbos_token: 1\nmax_seq_len: 320\neos_token: 2\ntemperature: 0.00001\n"

def tidy(path, pad=14, target=0, soft=False):
    """Trim blank margins, then optionally scale small equations up to a comfortable height.

    soft=True also pushes the picture towards black on white, which helps grey text on tinted paper but
    can thicken fine strokes in a crisp one, so it is a second opinion rather than the default."""
    image = Image.open(path).convert("L")
    # The model reads dark ink on a light page, so a dark page is flipped. (Stretching contrast on every
    # picture was measured and made results worse, so it is not done.)
    if np.median(np.array(image)) < 128:
        image = ImageOps.invert(image)
    if soft:
        levels = np.array(ImageOps.autocontrast(image, cutoff=0)).astype(float)
        image = Image.fromarray((np.clip((levels - 90) / 100, 0, 1) * 255).astype("uint8"))
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

# Reading the same equation at several sizes gives several readings, and no single size is best: the model is
# confidently wrong at some scales and right at others. So read it at each size and let the readings vote.
# (On a synthetic benchmark this took exact matches from 83% to 93%.) Heights are in pixels after trimming; 0 = as is.
HEIGHTS = (0, 64, 96, 128, 48, 80)
EARLY_AGREE = 3  # this many identical readings in a row of the first scales is already conclusive

def at_height(data, height):
    if not height:
        return data
    image = Image.open(io.BytesIO(data))
    scale = height / image.height
    image = image.resize((max(32, int(image.width * scale)), height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()

def canonical(latex):
    """A form for comparing readings: spacing, redundant braces and font wrappers don't make two readings different."""
    text = re.sub(r"\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)(?![A-Za-z])\s*", "", latex)
    text = re.sub(r"\\(?:displaystyle|textstyle|scriptstyle|mathrm|operatorname\*?|mathop|boldsymbol|mathbf|rm|bf|cal)(?![A-Za-z])", "", text)
    text = re.sub(r"\\[dt]frac(?![A-Za-z])", r"\\frac", text)
    text = re.sub(r"\\(?:[!,;:> ]|quad|qquad)", "", text)
    text = re.sub(r"\s+", "", text)
    previous = None
    while previous != text:  # {x} -> x and {\alpha} -> \alpha
        previous = text
        text = re.sub(r"\{([A-Za-z0-9]|\\[A-Za-z]+)\}", r"\1", text)
        text = re.sub(r"\{\{([^{}]*)\}\}", r"{\1}", text)
    return text

def run(path):
    config = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False)
    config.write(CONFIG)
    config.close()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            model = LaTeXOCR(config_path=config.name)
    finally:
        os.unlink(config.name)
    plain, soft = tidy(path, 14, 0), tidy(path, 14, 0, soft=True)
    if plain is None:
        return {"ok": False, "error": "blank"}
    readings = []  # (latex, looped) in the order read
    deadline = time.time() + 40
    # The picture as it is first; the softened copy is only consulted if those readings don't settle it.
    for base in (plain, soft):
        for height in HEIGHTS:
            started = time.time()
            with contextlib.redirect_stdout(sys.stderr):
                raw, _ = model(at_height(base, height))
            cleaned = collapse_repeats(raw)
            latex = re.sub(r"\\(?:text|display|script)style\s*", "", cleaned).strip()
            if latex:
                readings.append((latex, cleaned != raw or time.time() - started > 6))
            # The first few sizes all agreeing on a clean reading needs no more evidence.
            if base is plain and len(readings) >= EARLY_AGREE:
                first = readings[:EARLY_AGREE]
                if len({canonical(r[0]) for r in first}) == 1 and all(not r[1] and balanced(r[0]) for r in first):
                    break
            if time.time() > deadline:
                break
        else:
            continue
        break
    if not readings:
        return {"ok": False, "error": "empty"}
    # Group readings that say the same thing; a clean, balanced reading counts for more than a broken one.
    groups = {}
    for order, (latex, looped) in enumerate(readings):
        weight = (0.5 if looped else 1.0) * (1.0 if balanced(latex) else 0.4)
        group = groups.setdefault(canonical(latex), {"latex": latex, "votes": 0.0, "count": 0, "order": order, "clean": not looped and balanced(latex)})
        group["votes"] += weight
        group["count"] += 1
    ranked = sorted(groups.values(), key=lambda g: (-g["votes"], g["order"]))
    top = ranked[0]
    agreement = top["count"] / len(readings)
    return {
        "ok": True,
        "latex": top["latex"],
        "uncertain": not top["clean"] or agreement < 0.5,
        "agreement": round(agreement, 2),
        "candidates": [g["latex"] for g in ranked],
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        finish({"ok": False, "error": "usage"})
    try:
        finish(run(sys.argv[1]))
    except SystemExit:
        raise
    except Exception as error:
        finish({"ok": False, "error": "failed", "detail": str(error)})
