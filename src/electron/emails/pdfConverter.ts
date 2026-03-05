import path from "path";
import fs from "fs";
import { app } from "electron";

/**
 * Configuration for PDF to Markdown conversion via Docling API
 */
interface DoclingOptions {
  /** Base URL of the Docling API */
  apiUrl?: string;
  /** Whether to extract table structures */
  doTableStructure?: boolean;
  /** Table extraction mode: 'fast' or 'accurate' */
  tableMode?: "fast" | "accurate";
  /** Whether to perform OCR */
  doOcr?: boolean;
  /** Whether to describe pictures */
  doPictureDescription?: boolean;
  /** VLM pipeline model configuration */
  vlmModel?: {
    url: string;
    responseFormat: string;
    model: string;
    concurrency?: number;
  };
}

interface ConversionResult {
  /** Path to the generated markdown file */
  markdownPath: string;
  /** Content of the markdown file */
  markdownContent: string;
  /** Whether the conversion was successful */
  success: boolean;
}

/**
 * Convert a PDF file to markdown using Docling API
 * 
 * @param pdfPath - Path to the PDF file
 * @param options - Conversion options
 * @returns Promise resolving to the conversion result
 */
export async function convertPdfToMarkdown(
  pdfPath: string,
  options: DoclingOptions = {}
): Promise<ConversionResult> {
  const {
    apiUrl = "https://file-converter.ngrok.app/v1/convert/source",
    doTableStructure = true,
    tableMode = "accurate",
    doOcr = true,
    doPictureDescription = false,
    vlmModel,
  } = options;

  // Get output directory (default to same directory as PDF)
  const outputDir = path.dirname(pdfPath);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const markdownPath = path.join(outputDir, `${baseName}.md`);

  try {
    // Read PDF file and convert to base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64String = pdfBuffer.toString("base64");

    // Build request payload options
    const payloadOptions: Record<string, unknown> = {
      from_formats: ["pdf"],
      do_table_structure: doTableStructure,
      table_mode: tableMode,
      table_cell_matching: true,
      output_format: "markdown",
      do_ocr: doOcr,
      do_picture_description: doPictureDescription,
      pdf_backend: "pypdfium2",
    };

    // Add VLM model configuration if provided
    if (vlmModel) {
      payloadOptions.vlm_pipeline_model_api = {
        url: vlmModel.url,
        response_format: vlmModel.responseFormat,
        params: {
          model: vlmModel.model,
          ...(vlmModel.concurrency && { concurrency: vlmModel.concurrency }),
        },
      };
    }

    // Build complete request payload
    const payload = {
      options: payloadOptions,
      sources: [
        {
          kind: "file",
          filename: path.basename(markdownPath),
          base64_string: base64String,
        },
      ],
    };

    // Make API request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Docling API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Extract markdown content from Docling response
    let markdownContent = "";
    
    if (result && result.document && result.document.md_content) {
      // Primary response format: { document: { md_content: "..." } }
      markdownContent = result.document.md_content;
    } else if (result && result.markdown) {
      markdownContent = result.markdown;
    } else if (result && result.elements) {
      // Alternative response format - join all markdown elements
      markdownContent = result.elements
        .map((el: { markdown?: string }) => el.markdown || "")
        .join("\n\n");
    } else if (typeof result === "string") {
      markdownContent = result;
    } else {
      // Try to find any markdown content in the response
      const jsonStr = JSON.stringify(result);
      // If no structured response, try to use the raw result
      markdownContent = jsonStr;
    }

    // Write markdown to file
    fs.writeFileSync(markdownPath, markdownContent, "utf-8");

    return {
      markdownPath,
      markdownContent,
      success: true,
    };
  } catch (error) {
    console.error("PDF conversion error:", error);
    throw new Error(`Failed to convert PDF to markdown: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if a file is a PDF
 * 
 * @param filePath - Path to the file
 * @returns True if the file is a PDF
 */
export function isPdfFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".pdf";
}

/**
 * Convert multiple PDF attachments to markdown
 * 
 * @param pdfPaths - Array of PDF file paths
 * @param options - Conversion options
 * @returns Promise resolving to array of conversion results
 */
export async function convertMultiplePdfsToMarkdown(
  pdfPaths: string[],
  options: DoclingOptions = {}
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  
  for (const pdfPath of pdfPaths) {
    if (isPdfFile(pdfPath)) {
      try {
        const result = await convertPdfToMarkdown(pdfPath, options);
        results.push(result);
      } catch (error) {
        console.error(`Failed to convert ${pdfPath}:`, error);
        // Continue with other files
      }
    }
  }
  
  return results;
}

/**
 * Get the downloads directory for email attachments
 * 
 * @returns Path to the attachments download directory
 */
export function getAttachmentsDir(): string {
  return path.join(app.getPath('downloads'), 'ZohoAttachments');
}
