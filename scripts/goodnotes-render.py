#!/usr/bin/env python3
"""Render pages of a .goodnotes archive to PNGs for transcription.

A .goodnotes file is a ZIP holding the original scan as an embedded PDF under
attachments/.  The PDF also carries a GoodNotes-generated OCR text layer, but
that layer is unusable for question import: it destroys formulas, mangles the
①②③④ choice markers non-deterministically, and scrambles reading order across
the two-column layout.  See docs/question-import.md.  The scans themselves are
clean, so we render them and read the images.

Usage:
  python scripts/goodnotes-render.py "<path/to/file.goodnotes>" [--dpi 150]
  python scripts/goodnotes-render.py --list

Outputs PNGs to work-import/pages/<slug>/p001.png ... (git-ignored).
"""
import argparse
import os
import re
import sys
import zipfile

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF is required:  pip install pymupdf")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SOURCE = os.path.join(PROJECT_ROOT, "Backup 2026-07-15", "전산기")
WORK_DIR = os.path.join(PROJECT_ROOT, "work-import")


def slug(rel_path):
    """Stable id for a source file: 전기자기/12.전자계.goodnotes -> 전기자기__12.전자계"""
    s = rel_path.replace("\\", "/").replace(".goodnotes", "")
    return re.sub(r"[^0-9A-Za-z가-힣._-]+", "__", s)


def open_scan(path):
    """Return the embedded scan PDF from a .goodnotes archive."""
    z = zipfile.ZipFile(path)
    att = [i for i in z.infolist() if i.filename.startswith("attachments/")]
    if not att:
        raise RuntimeError("no attachment in %s" % path)
    data = z.open(att[0].filename).read()
    if data[:4] != b"%PDF":
        raise RuntimeError("attachment is not a PDF: %r" % data[:4])
    return fitz.open(stream=data, filetype="pdf")


def list_sources(source_dir):
    rows = []
    for root, _, files in os.walk(source_dir):
        for f in sorted(files):
            if not f.endswith(".goodnotes"):
                continue
            path = os.path.join(root, f)
            rel = os.path.relpath(path, source_dir)
            try:
                d = open_scan(path)
                rows.append((rel, d.page_count))
                d.close()
            except Exception as e:
                rows.append((rel, -1))
    return rows


def render(path, dpi):
    rel = os.path.relpath(path, DEFAULT_SOURCE) if path.startswith(DEFAULT_SOURCE) else os.path.basename(path)
    out_dir = os.path.join(WORK_DIR, "pages", slug(rel))
    os.makedirs(out_dir, exist_ok=True)
    d = open_scan(path)
    written = []
    for i in range(d.page_count):
        dest = os.path.join(out_dir, "p%03d.png" % (i + 1))
        if not os.path.exists(dest):
            d[i].get_pixmap(dpi=dpi).save(dest)
        written.append(dest)
    d.close()
    return out_dir, written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", help="path to a .goodnotes file")
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument("--list", action="store_true", help="list source files and page counts")
    args = ap.parse_args()

    if args.list:
        rows = list_sources(DEFAULT_SOURCE)
        total = 0
        for rel, n in sorted(rows):
            print("%5s  %s" % (n if n >= 0 else "ERR", rel))
            total += max(n, 0)
        print("\n%d files, %d pages" % (len(rows), total))
        return

    if not args.path:
        ap.error("give a .goodnotes path, or --list")
    out_dir, written = render(args.path, args.dpi)
    print("rendered %d pages at %d dpi" % (len(written), args.dpi))
    print("-> %s" % out_dir)


if __name__ == "__main__":
    main()
