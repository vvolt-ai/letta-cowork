# PDF Reader Usage Notes

## Purpose

Use `scripts/read_pdf_folder.mjs` to read PDF files from a local folder and return extracted text as JSON.

## Arguments

- `--folder` (required): Folder that contains PDF files.
- `--pattern` (optional): Glob pattern, default `*.pdf`.
- `--recursive` (optional): Include nested folders.
- `--max-pages` (optional): Max pages per file, default `0` (all pages).
- `--export-dir` (optional): Save extracted text as `.txt` files.

## Example Commands

```bash
npm i pdf-parse
node scripts/read_pdf_folder.mjs --folder ./docs
node scripts/read_pdf_folder.mjs --folder ./docs --recursive --max-pages 5
node scripts/read_pdf_folder.mjs --folder ./docs --recursive --export-dir ./out
```

## Notes

- Extraction works for text-based PDFs.
- Scanned PDFs typically need OCR before useful text can be extracted.
