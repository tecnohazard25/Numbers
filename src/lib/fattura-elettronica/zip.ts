import JSZip from "jszip";

export interface ExtractedFile {
  fileName: string;
  xmlContent: string;
}

export interface ZipExtractionResult {
  xmlFiles: ExtractedFile[];
  ignoredFiles: string[];
}

/**
 * Extract XML files from a ZIP buffer.
 * Non-XML files are reported as ignored.
 */
export async function extractXmlFromZip(zipBuffer: ArrayBuffer): Promise<ZipExtractionResult> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const xmlFiles: ExtractedFile[] = [];
  const ignoredFiles: string[] = [];

  const entries = Object.entries(zip.files);

  for (const [path, file] of entries) {
    if (file.dir) continue;

    const fileName = path.split("/").pop() ?? path;

    if (fileName.toLowerCase().endsWith(".xml")) {
      const content = await file.async("text");
      xmlFiles.push({ fileName, xmlContent: content });
    } else {
      ignoredFiles.push(fileName);
    }
  }

  return { xmlFiles, ignoredFiles };
}
