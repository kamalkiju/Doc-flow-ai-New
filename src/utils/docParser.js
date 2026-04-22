/**
 * docParser.js
 * Handles reading and extracting clean text from PDF, DOCX, TXT, MD, CSV files.
 * Uses PDF.js and Mammoth.js loaded via CDN in index.html.
 */

// ── PDF.js worker setup ───────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Main entry: detect file type and route to the correct reader.
 * @param {File} file
 * @returns {Promise<string>} cleaned plain text
 */
export async function parseDocument(file) {
  const ext = getExtension(file.name);
  let raw = '';

  switch (ext) {
    case 'pdf':
      raw = await readPDF(file);
      break;
    case 'docx':
    case 'doc':
      raw = await readDOCX(file);
      break;
    default:
      // txt, md, csv — all plain UTF-8
      raw = await readPlainText(file);
  }

  const cleaned = cleanText(raw);

  if (!cleaned || cleaned.length < 20) {
    throw new Error('Could not extract readable text from this file. Try copy-pasting the content below.');
  }

  return cleaned;
}

/**
 * Read a PDF file page by page using PDF.js.
 * Groups text items by Y-position to preserve line order.
 */
async function readPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js library not available.');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by rounded Y coordinate to reconstruct lines
    const lineMap = {};
    textContent.items.forEach(item => {
      if (!item.str || !item.str.trim()) return;
      // PDF Y axis is bottom-up; round to nearest 2px bucket
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lineMap[y]) lineMap[y] = [];
      lineMap[y].push({ x: item.transform[4], text: item.str });
    });

    // Sort lines top-to-bottom (highest Y = top in PDF coords)
    const sortedYs = Object.keys(lineMap)
      .map(Number)
      .sort((a, b) => b - a);

    sortedYs.forEach(y => {
      // Sort items within a line left-to-right by X
      const line = lineMap[y]
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .trim();
      if (line) fullText += line + '\n';
    });

    fullText += '\n'; // blank line between pages
  }

  return fullText;
}

/**
 * Read a DOCX file using Mammoth.js.
 * Extracts raw text preserving paragraphs.
 */
async function readDOCX(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('Mammoth.js library not available.');
  }
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  if (result.messages?.length) {
    console.warn('[DocParser] Mammoth warnings:', result.messages);
  }
  return result.value || '';
}

/**
 * Read plain text files (TXT, MD, CSV) with UTF-8 encoding.
 */
function readPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result || '');
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Clean and normalize extracted text.
 * - Normalize line endings
 * - Collapse excessive whitespace
 * - Remove non-printable characters
 * - Limit consecutive blank lines
 */
export function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ ]{4,}/g, '   ')
    .replace(/\n{4,}/g, '\n\n\n')
    // Remove null bytes and other non-printable chars (keep Unicode letters)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Smart truncation for very large documents.
 * Keeps the beginning and end to preserve context.
 * @param {string} text
 * @param {number} maxChars - target max characters for API
 * @returns {string}
 */
export function truncateForAPI(text, maxChars = 12000) {
  if (text.length <= maxChars) return text;

  const headChars = Math.floor(maxChars * 0.75); // 75% from start
  const tailChars = Math.floor(maxChars * 0.20); // 20% from end
  // 5% gap note

  const head = text.slice(0, headChars);
  const tail = text.slice(-tailChars);

  return (
    head +
    '\n\n[... document continues — middle section omitted for length ...]\n\n' +
    tail
  );
}

/** Get lowercase file extension */
function getExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/** File icon by extension */
export function getFileIcon(filename) {
  const icons = { pdf: '📕', doc: '📘', docx: '📘', txt: '📄', md: '📝', csv: '📊' };
  return icons[getExtension(filename)] || '📎';
}

/** Human-readable file size */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
