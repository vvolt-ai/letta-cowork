"""Read a local PDF through installed readers only. No network or installation."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

MAX_BYTES = 25 * 1024 * 1024
MAX_CHARS = 100_000


def blocked(reason, **extra):
    return {"status": "blocked", "complete": False, "reason": reason, **extra}


def finish(texts, reader, digest, max_chars):
    empty = [i + 1 for i, text in enumerate(texts) if not text.strip()]
    text = "\n".join(f"--- Page {i + 1} ---\n{value}" for i, value in enumerate(texts))
    if not any(value.strip() for value in texts):
        return blocked("no_extractable_text_use_supported_visual_or_OCR_review",
                       reader=reader, sha256=digest, pages=len(texts))
    truncated = len(text) > max_chars
    complete = not empty and not truncated
    return {"status": "extracted" if complete else "partial", "complete": complete,
            "reader": reader, "sha256": digest, "pages": len(texts),
            "empty_pages_requiring_visual_check": empty, "truncated": truncated,
            "text_chars": len(text), "text": text[:max_chars]}


def extract(path, *, max_bytes=MAX_BYTES, max_chars=MAX_CHARS, timeout=30):
    pdf = Path(path).expanduser()
    if not pdf.is_file():
        return blocked("local_file_not_found")
    if pdf.stat().st_size > max_bytes:
        return blocked("input_size_limit", max_bytes=max_bytes)
    with pdf.open("rb") as source:
        signature = source.read(1024)
        if b"%PDF-" not in signature:
            return blocked("not_a_pdf")
        source.seek(0)
        # hashlib.file_digest is Python 3.11+; use bounded streaming for
        # supported existing Python 3.9/3.10 runtimes as well.
        checksum = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            if size > max_bytes:
                return blocked("input_size_limit", max_bytes=max_bytes)
            checksum.update(chunk)
        digest = checksum.hexdigest()

    reader = shutil.which("pdftotext")
    if reader:
        try:
            # An argument list keeps spaces and metacharacters in filenames literal.
            result = subprocess.run([reader, "-layout", "-enc", "UTF-8", str(pdf.resolve()), "-"],
                                    capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            return blocked("local_reader_timeout", reader="pdftotext", sha256=digest)
        except OSError:
            return blocked("local_reader_unavailable", reader="pdftotext", sha256=digest)
        if result.returncode:
            return blocked("local_reader_failed_or_encrypted", reader="pdftotext",
                           exit_code=result.returncode, sha256=digest)
        try:
            output = result.stdout.decode("utf-8")
        except UnicodeDecodeError:
            return blocked("local_reader_encoding_error", reader="pdftotext", sha256=digest)
        texts = output.split("\f")
        if len(texts) > 1 and not texts[-1].strip():
            texts.pop()  # pdftotext terminates the last page with a form feed.
        return finish(texts, "pdftotext", digest, max_chars)

    # Reuse an installed Python reader, never install one during a customer turn.
    try:
        pypdf = importlib.import_module("pypdf")
    except ImportError:
        return blocked("no_installed_local_reader_pdftotext_or_pypdf_required", sha256=digest)
    try:
        doc = pypdf.PdfReader(str(pdf))
        if doc.is_encrypted:
            return blocked("encrypted_pdf_requires_authorized_readable_copy", reader="pypdf", sha256=digest)
        texts = [page.extract_text() or "" for page in doc.pages]
    except Exception:
        return blocked("local_reader_failed", reader="pypdf", sha256=digest)
    return finish(texts, "pypdf", digest, max_chars)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="Existing local PDF; a filename is not a verified PO reference")
    parser.add_argument("--max-chars", type=int, default=MAX_CHARS)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    if not 1 <= args.max_chars <= 1_000_000 or not 1 <= args.timeout <= 120:
        parser.error("max-chars must be 1..1000000; timeout must be 1..120 seconds")
    try:
        result = extract(args.pdf, max_chars=args.max_chars, timeout=args.timeout)
    except OSError:
        result = blocked("local_file_access_failed")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
