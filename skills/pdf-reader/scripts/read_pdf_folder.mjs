#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    folder: '',
    pattern: '*.pdf',
    recursive: false,
    maxPages: 0,
    exportDir: '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--folder') {
      args.folder = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--pattern') {
      args.pattern = argv[i + 1] || '*.pdf';
      i += 1;
    } else if (arg === '--recursive') {
      args.recursive = true;
    } else if (arg === '--max-pages') {
      args.maxPages = Number(argv[i + 1] || '0');
      i += 1;
    } else if (arg === '--export-dir') {
      args.exportDir = argv[i + 1] || '';
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/read_pdf_folder.mjs --folder <path> [options]\n\nOptions:\n  --folder <path>        Path to folder containing PDFs (required)\n  --pattern <glob>       Glob-like pattern (default: *.pdf, only suffix-based)\n  --recursive            Search nested folders\n  --max-pages <number>   Max pages per PDF (0 means all pages)\n  --export-dir <path>    Optional directory to write extracted .txt files\n  -h, --help             Show help`);
}

function suffixFromPattern(pattern) {
  if (pattern.startsWith('*.')) {
    return pattern.slice(1).toLowerCase();
  }
  return '.pdf';
}

async function collectFiles(dir, recursive) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      out.push(full);
    } else if (recursive && entry.isDirectory()) {
      out.push(...(await collectFiles(full, recursive)));
    }
  }
  return out;
}

async function loadPdfParse() {
  try {
    const mod = await import('pdf-parse');
    if (typeof mod.default === 'function') {
      return { mode: 'v1', parseFn: mod.default };
    }
    if (typeof mod === 'function') {
      return { mode: 'v1', parseFn: mod };
    }
    if (typeof mod.PDFParse === 'function') {
      return { mode: 'v2', PDFParse: mod.PDFParse };
    }
    return null;
  } catch {
    return null;
  }
}

function buildParseOptions(maxPages) {
  if (!maxPages || maxPages <= 0) return undefined;
  return { first: maxPages };
}

async function parsePdfBuffer(pdfLoader, dataBuffer, maxPages) {
  if (pdfLoader.mode === 'v1') {
    const parsed = await pdfLoader.parseFn(
      dataBuffer,
      maxPages > 0 ? { max: maxPages } : undefined
    );
    return {
      text: (parsed.text || '').trim(),
      pagesTotal: Number(parsed.numpages || 0),
      pagesRead: Number(parsed.numrender || parsed.numpages || 0),
    };
  }

  const parser = new pdfLoader.PDFParse({ data: dataBuffer });
  try {
    const parsed = await parser.getText(buildParseOptions(maxPages));
    const pagesTotal = Number(parsed.total || parsed.pages?.length || 0);
    const pagesRead = Number(parsed.pages?.length || 0);
    return {
      text: (parsed.text || '').trim(),
      pagesTotal,
      pagesRead,
    };
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.folder) {
    console.log(JSON.stringify({ error: 'Missing required argument: --folder' }));
    process.exit(1);
  }

  if (Number.isNaN(args.maxPages) || args.maxPages < 0) {
    console.log(JSON.stringify({ error: '--max-pages must be a non-negative number' }));
    process.exit(1);
  }

  const folder = path.resolve(args.folder);
  let folderStat;
  try {
    folderStat = await fs.stat(folder);
  } catch {
    console.log(JSON.stringify({ error: `Folder does not exist: ${folder}` }));
    process.exit(1);
  }

  if (!folderStat.isDirectory()) {
    console.log(JSON.stringify({ error: `Path is not a directory: ${folder}` }));
    process.exit(1);
  }

  const pdfLoader = await loadPdfParse();
  if (!pdfLoader) {
    console.log(
      JSON.stringify({
        error:
          "Missing or incompatible dependency 'pdf-parse'. Run: npm i pdf-parse",
      })
    );
    process.exit(1);
  }

  const suffix = suffixFromPattern(args.pattern);
  const allFiles = await collectFiles(folder, args.recursive);
  const pdfFiles = allFiles
    .filter((file) => file.toLowerCase().endsWith(suffix))
    .sort((a, b) => a.localeCompare(b));

  const result = {
    folder,
    pattern: args.pattern,
    recursive: args.recursive,
    max_pages: args.maxPages,
    total_files_found: pdfFiles.length,
    processed_files: 0,
    files: [],
  };

  const exportDir = args.exportDir ? path.resolve(args.exportDir) : '';
  if (exportDir) {
    await fs.mkdir(exportDir, { recursive: true });
  }

  for (const pdfPath of pdfFiles) {
    const item = {
      pdf_path: pdfPath,
      pages_total: 0,
      pages_read: 0,
      text_length: 0,
      text: '',
    };

    try {
      const dataBuffer = await fs.readFile(pdfPath);
      const parsed = await parsePdfBuffer(pdfLoader, dataBuffer, args.maxPages);
      const text = parsed.text;
      item.pages_total = parsed.pagesTotal;
      item.pages_read = parsed.pagesRead;
      item.text_length = text.length;
      item.text = text;

      if (exportDir) {
        const outName = `${path.basename(pdfPath, path.extname(pdfPath))}.txt`;
        const outPath = path.join(exportDir, outName);
        await fs.writeFile(outPath, text, 'utf8');
        item.exported_text_path = outPath;
      }
    } catch (error) {
      item.error = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    }

    result.files.push(item);
  }

  result.processed_files = result.files.length;
  console.log(JSON.stringify(result, null, 2));
}

main();
