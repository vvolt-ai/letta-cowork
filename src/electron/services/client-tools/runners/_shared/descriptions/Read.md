# Read

Reads local text, supported images, and PDF text when the runtime has the supported local `pdftotext` executable. Other binary files are not readable. If the User provides a path, attempt that exact path and report any missing file or capability precisely.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Letta Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Letta Code is a multimodal LLM.
- PDFs use bounded local text extraction, not a cloud upload or automatic dependency installation. Extraction preserves page markers; images and signatures are not visually verified. Blank/scanned pages require an explicitly approved local visual/OCR route. A missing extractor is a concrete runtime prerequisite, not proof that the attachment does not exist.
- The same PDF capability is available to delegated tasks through their inherited Read tool. Reuse supplied extracted content rather than re-extracting it. Do not infer a PO reference, terms, or tax-certificate validity from filenames or a partial extraction.
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
