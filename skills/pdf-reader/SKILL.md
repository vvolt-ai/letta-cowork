---
name: pdf-reader
description: Read and extract text from PDF files stored in local folders. Use when a user asks to scan a directory of PDFs, list PDF files, extract full text or page-limited text, or export extracted text for downstream analysis and summarization.
---

# PDF Reader

Extract PDF text from local directories using the bundled script.
Prefer this skill for batch extraction across multiple files rather than writing one-off parsing code.

## Workflow

1. Install and verify required dependencies before any use:
- Run `npm i pdf-parse` in the project root.
- Verify with `npm ls pdf-parse --depth=0`.
2. Resolve script path with an absolute path (do not assume current working directory):
- Preferred: `<workspace>/skills/pdf-reader/scripts/read_pdf_folder.mjs`
- Fallback discovery: `find . -path '*/skills/pdf-reader/scripts/read_pdf_folder.mjs' -print -quit`
3. Resolve the target folder path from the user request.
4. Run the script using the absolute path:
- Use `--recursive` when PDFs may exist in nested folders.
- Use `--max-pages` to limit extraction for quick previews.
- Use `--export-dir` to save `.txt` files per PDF.
5. Inspect output summary (file counts, page counts, extracted characters).
6. If extraction is empty for scanned/image PDFs, report that OCR is needed (this skill does not run OCR).
7. Continue with summarization or analysis using the extracted text.

## Commands

```bash
# Mandatory preflight
npm i pdf-parse
npm ls pdf-parse --depth=0
```

```bash
# Resolve script path first
SCRIPT_PATH="$(find . -path '*/skills/pdf-reader/scripts/read_pdf_folder.mjs' -print -quit)"
```

```bash
# Extract all PDFs in a folder (non-recursive)
node "$SCRIPT_PATH" --folder /path/to/pdfs
```

```bash
# Include nested folders and limit to first 3 pages per file
node "$SCRIPT_PATH" --folder /path/to/pdfs --recursive --max-pages 3
```

```bash
# Export extracted text files to a destination folder
node "$SCRIPT_PATH" --folder /path/to/pdfs --recursive --export-dir /tmp/pdf-text
```

## Output Contract

- The script prints JSON to stdout with:
- `folder`, `pattern`, `recursive`, `total_files_found`, `processed_files`, and `files`.
- Each item in `files` includes `pdf_path`, `pages_total`, `pages_read`, `text_length`, `text`, and optional `error`.
- When `--export-dir` is provided, each successful file also includes `exported_text_path`.

## Dependency

- Required package: `pdf-parse`
- Always install and verify before use:
  - `npm i pdf-parse`
  - `npm ls pdf-parse --depth=0`

## Hard Rule

- Never run the reader script before confirming required dependencies are installed.
- Never assume `scripts/read_pdf_folder.mjs` exists relative to the current working directory.
- If dependency check fails, install dependencies first, then rerun the command.

## Limitations

- Text extraction depends on embedded PDF text; scanned/image-only PDFs return little or no text.
- Encrypted PDFs may fail if no password is provided.
- Keep `--max-pages` small when fast triage is more useful than full extraction.
