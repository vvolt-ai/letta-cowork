import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface PdfExtractionOptions {
  executable?: string;
  run?: typeof execFileAsync;
}

/** Extract locally using the supported reader; never upload documents or install tools. */
export async function extractLocalPdf(
  filePath: string,
  options: PdfExtractionOptions = {},
): Promise<string> {
  const executable = options.executable ?? process.env.PDFTOTEXT_PATH ?? 'pdftotext';
  const run = options.run ?? execFileAsync;
  let stdout: string;
  try {
    const result = await run(executable, ['-layout', '-enc', 'UTF-8', filePath, '-'], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = String(result.stdout);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'PDF_EXTRACTOR_UNAVAILABLE: Read needs an existing local pdftotext executable for PDFs. ' +
          'Verify the runtime prerequisite or explicitly configure PDFTOTEXT_PATH. ' +
          'No document was uploaded and no dependency was installed.',
      );
    }
    throw new Error(
      'PDF_EXTRACTION_FAILED: Local PDF extraction failed or exceeded its bounded limits. ' +
        'The file may be encrypted or malformed; no content is verified.',
    );
  }

  const pages = stdout.replace(/\f$/, '').split('\f');
  if (!pages.some((page) => page.trim())) {
    throw new Error(
      'PDF_OCR_REQUIRED: The PDF has no extractable text. Use an explicitly approved ' +
        'local visual/OCR reader; do not infer document contents from its filename.',
    );
  }
  const blankPages = pages.flatMap((page, index) => (page.trim() ? [] : [index + 1]));
  const notice = blankPages.length
    ? `\nWARNING: Pages ${blankPages.join(', ')} returned no text and require visual/OCR verification.`
    : '';
  return `[PDF: local text extraction only; images and signatures are not visually verified.]${notice}\n\n${pages.map((page, index) => `--- Page ${index + 1} ---\n${page}`).join('\n')}`;
}
