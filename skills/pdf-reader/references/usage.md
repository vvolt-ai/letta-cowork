# PDF Reader Usage Notes

## Purpose

Use `scripts/read_pdf_folder.mjs` to read PDF files from a local folder and return extracted text as JSON.

## Mandatory Preflight

Always install and verify required dependencies before script execution:

```bash
npm i pdf-parse
npm ls pdf-parse --depth=0
```

Resolve script path first (do not assume current working directory):

```bash
SCRIPT_PATH="$(find . -path '*/skills/pdf-reader/scripts/read_pdf_folder.mjs' -print -quit)"
```

## Arguments

- `--folder` (required): Folder that contains PDF files.
- `--pattern` (optional): Glob pattern, default `*.pdf`.
- `--recursive` (optional): Include nested folders.
- `--max-pages` (optional): Max pages per file, default `0` (all pages).
- `--export-dir` (optional): Save extracted text as `.txt` files.

## Example Commands

```bash
node "$SCRIPT_PATH" --folder ./docs
node "$SCRIPT_PATH" --folder ./docs --recursive --max-pages 5
node "$SCRIPT_PATH" --folder ./docs --recursive --export-dir ./out
```

## Notes

- Extraction works for text-based PDFs.
- Scanned PDFs typically need OCR before useful text can be extracted.
