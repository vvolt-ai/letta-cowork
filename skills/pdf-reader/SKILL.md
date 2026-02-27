---
name: pdf-reader
description: Read and extract text from PDF files stored in local folders. Use when a user asks to scan a directory of PDFs, list PDF files, extract full text or page-limited text, or export extracted text for downstream analysis and summarization.
---

# PDF Reader

Extract PDF text from local directories using the bundled script.
Prefer this skill for batch extraction across multiple files rather than writing one-off parsing code.

## Workflow

1. Resolve the target folder path from the user request.
2. Run `scripts/read_pdf_folder.mjs` to extract text:
- Use `--recursive` when PDFs may exist in nested folders.
- Use `--max-pages` to limit extraction for quick previews.
- Use `--export-dir` to save `.txt` files per PDF.
3. Inspect output summary (file counts, page counts, extracted characters).
4. If extraction is empty for scanned/image PDFs, report that OCR is needed (this skill does not run OCR).
5. Continue with summarization or analysis using the extracted text.

## Commands

```bash
# Extract all PDFs in a folder (non-recursive)
node scripts/read_pdf_folder.mjs --folder /path/to/pdfs
```

```bash
# Include nested folders and limit to first 3 pages per file
node scripts/read_pdf_folder.mjs --folder /path/to/pdfs --recursive --max-pages 3
```

```bash
# Export extracted text files to a destination folder
node scripts/read_pdf_folder.mjs --folder /path/to/pdfs --recursive --export-dir /tmp/pdf-text
```

## Output Contract

- The script prints JSON to stdout with:
- `folder`, `pattern`, `recursive`, `total_files_found`, `processed_files`, and `files`.
- Each item in `files` includes `pdf_path`, `pages_total`, `pages_read`, `text_length`, `text`, and optional `error`.
- When `--export-dir` is provided, each successful file also includes `exported_text_path`.

## Dependency

- Install once in the project root: `npm i pdf-parse`

## Limitations

- Text extraction depends on embedded PDF text; scanned/image-only PDFs return little or no text.
- Encrypted PDFs may fail if no password is provided.
- Keep `--max-pages` small when fast triage is more useful than full extraction.
