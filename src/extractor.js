// Hybrid On-Device PDF.js + Tesseract.js French OCR Extraction Pipeline
import { classifyTokenBox } from './french-tax-rules.js';

let tesseractWorker = null;
let currentWorkerLang = null;

async function getOcrWorker(lang = 'fra', onProgress = null) {
  if (!window.Tesseract) {
    throw new Error('Tesseract.js library is not loaded');
  }
  if (tesseractWorker && currentWorkerLang === lang) {
    return tesseractWorker;
  }
  if (tesseractWorker) {
    await tesseractWorker.terminate();
  }
  tesseractWorker = await window.Tesseract.createWorker(lang, 1, {
    logger: (m) => {
      if (onProgress && m.status) {
        onProgress(m);
      }
    }
  });
  currentWorkerLang = lang;
  return tesseractWorker;
}

/**
 * Process a file (PDF or Image) on-device:
 * 1. If PDF: extract native text items + normalized bounding boxes (0..100%) per page.
 * 2. If a page has fewer than `forceOcrThresholdChars` characters (or `forceOcr === true`),
 *    render the page to a high-DPI canvas and run Tesseract.js French OCR.
 * 3. If Image (PNG/JPG/WEBP): run Tesseract.js French OCR and return normalized bounding boxes.
 */
export async function extractDocumentContent(fileBuffer, mimeType, options = {}) {
  const {
    forceOcr = false,
    ocrLanguage = 'fra',
    forceOcrThresholdChars = 40,
    onProgress = () => {}
  } = options;

  const startTime = performance.now();
  const isImage = mimeType && mimeType.startsWith('image/');

  if (isImage) {
    return await extractFromImageBuffer(fileBuffer, mimeType, ocrLanguage, onProgress, startTime);
  }

  // Otherwise process as PDF via PDF.js
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error('PDF.js is not loaded');
  }

  const uint8 = new Uint8Array(fileBuffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({ data: uint8 });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const pages = [];
  const allTokens = [];
  let fullTextParts = [];
  let usedOcrOnAnyPage = false;
  let usedNativeOnAnyPage = false;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress({
      stage: 'pdf_parse',
      pageNum,
      numPages,
      message: `Reading page ${pageNum}/${numPages}...`
    });

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    let pageTokens = [];
    let pageText = '';
    let pageMethod = 'native_pdf';
    let pageConfidence = 99;

    if (!forceOcr) {
      const textContent = await page.getTextContent();
      const rawItems = textContent.items || [];

      // Sort items top-to-bottom, then left-to-right to reconstruct natural reading lines
      const positionedItems = rawItems
        .filter((item) => item.str && item.str.trim().length > 0)
        .map((item, idx) => {
          // PDF transform matrix: [scaleX, skewY, skewX, scaleY, tx, ty]
          const tx = item.transform[4];
          const ty = item.transform[5];
          const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;
          const w = item.width || item.str.length * (fontHeight * 0.5);
          const h = fontHeight * 1.15;

          // Convert bottom-left PDF coordinates to top-left percentage coordinates (0..100)
          const xPct = Math.max(0, Math.min(100, (tx / pageWidth) * 100));
          const yTop = pageHeight - ty - fontHeight * 0.88;
          const yPct = Math.max(0, Math.min(100, (yTop / pageHeight) * 100));
          const wPct = Math.max(0.8, Math.min(100 - xPct, (w / pageWidth) * 100));
          const hPct = Math.max(1.0, Math.min(100 - yPct, (h / pageHeight) * 100));

          return {
            id: `p${pageNum}_t${idx}`,
            page: pageNum,
            text: item.str.trim(),
            x: Number(xPct.toFixed(2)),
            y: Number(yPct.toFixed(2)),
            w: Number(wPct.toFixed(2)),
            h: Number(hPct.toFixed(2)),
            kind: classifyTokenBox(item.str),
            source: 'native_pdf',
            confidence: 99
          };
        });

      // Sort by Y line buckets (within 1.1% height tolerance) then X
      positionedItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 1.1) return a.y - b.y;
        return a.x - b.x;
      });

      // Reconstruct readable lines from sorted tokens
      const lines = [];
      let currentLine = [];
      let lastY = null;
      for (const tok of positionedItems) {
        if (lastY === null || Math.abs(tok.y - lastY) <= 1.1) {
          currentLine.push(tok.text);
          lastY = lastY === null ? tok.y : (lastY + tok.y) / 2;
        } else {
          lines.push(currentLine.join('   '));
          currentLine = [tok.text];
          lastY = tok.y;
        }
      }
      if (currentLine.length) lines.push(currentLine.join('   '));

      pageText = lines.join('\n');
      pageTokens = positionedItems;
    }

    // Check if native text is sufficient or if we need Tesseract OCR
    const nonWhitespaceCount = pageText.replace(/\s+/g, '').length;
    if (forceOcr || nonWhitespaceCount < forceOcrThresholdChars) {
      usedOcrOnAnyPage = true;
      pageMethod = 'ocr_tesseract';
      onProgress({
        stage: 'ocr',
        pageNum,
        numPages,
        message: `Running OCR (${ocrLanguage}) on page ${pageNum}/${numPages}...`
      });

      // Render PDF page to offscreen canvas at 2.0x scale for sharp OCR
      const ocrScale = 2.0;
      const ocrViewport = page.getViewport({ scale: ocrScale });
      const canvas = document.createElement('canvas');
      canvas.width = ocrViewport.width;
      canvas.height = ocrViewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;

      const ocrResult = await runTesseractOnCanvas(
        canvas,
        pageNum,
        ocrLanguage,
        (m) => {
          const pct = m.progress ? Math.round(m.progress * 100) : 0;
          onProgress({
            stage: 'ocr',
            pageNum,
            numPages,
            message: `OCR page ${pageNum}/${numPages}: ${pct}%`
          });
        }
      );

      pageText = ocrResult.text;
      pageTokens = ocrResult.tokens;
      pageConfidence = ocrResult.confidence;
    } else {
      usedNativeOnAnyPage = true;
    }

    confidenceSum += pageConfidence;
    confidenceCount++;

    pages.push({
      pageNumber: pageNum,
      width: pageWidth,
      height: pageHeight,
      method: pageMethod,
      confidence: pageConfidence,
      text: pageText,
      tokenCount: pageTokens.length
    });

    allTokens.push(...pageTokens);
    fullTextParts.push(`--- [Page ${pageNum}] ---\n${pageText}`);
  }

  const elapsedMs = Math.round(performance.now() - startTime);
  const overallMethod =
    usedOcrOnAnyPage && usedNativeOnAnyPage
      ? 'hybrid_pdf_ocr'
      : usedOcrOnAnyPage
      ? 'ocr_tesseract'
      : 'native_pdf';

  return {
    numPages,
    pages,
    tokens: allTokens,
    fullText: fullTextParts.join('\n\n'),
    method: overallMethod,
    avgConfidence: confidenceCount ? Math.round(confidenceSum / confidenceCount) : 95,
    elapsedMs
  };
}

async function extractFromImageBuffer(fileBuffer, mimeType, ocrLanguage, onProgress, startTime) {
  onProgress({
    stage: 'ocr',
    pageNum: 1,
    numPages: 1,
    message: `Running OCR on image (${ocrLanguage})...`
  });

  const blob = new Blob([fileBuffer], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const ocrResult = await runTesseractOnCanvas(canvas, 1, ocrLanguage, (m) => {
    const pct = m.progress ? Math.round(m.progress * 100) : 0;
    onProgress({
      stage: 'ocr',
      pageNum: 1,
      numPages: 1,
      message: `OCR image: ${pct}%`
    });
  });

  const elapsedMs = Math.round(performance.now() - startTime);
  return {
    numPages: 1,
    pages: [
      {
        pageNumber: 1,
        width: bitmap.width,
        height: bitmap.height,
        method: 'ocr_tesseract',
        confidence: ocrResult.confidence,
        text: ocrResult.text,
        tokenCount: ocrResult.tokens.length
      }
    ],
    tokens: ocrResult.tokens,
    fullText: ocrResult.text,
    method: 'ocr_tesseract',
    avgConfidence: ocrResult.confidence,
    elapsedMs
  };
}

async function runTesseractOnCanvas(canvas, pageNum, ocrLanguage, onProgress) {
  const worker = await getOcrWorker(ocrLanguage, onProgress);
  const { data } = await worker.recognize(canvas);
  const W = canvas.width || 1;
  const H = canvas.height || 1;

  const tokens = (data.words || [])
    .filter((w) => w.text && w.text.trim().length > 0 && (w.confidence || 0) > 25)
    .map((w, idx) => {
      const { x0, y0, x1, y1 } = w.bbox;
      const xPct = Math.max(0, Math.min(100, (x0 / W) * 100));
      const yPct = Math.max(0, Math.min(100, (y0 / H) * 100));
      const wPct = Math.max(0.8, Math.min(100 - xPct, ((x1 - x0) / W) * 100));
      const hPct = Math.max(1.0, Math.min(100 - yPct, ((y1 - y0) / H) * 100));

      return {
        id: `p${pageNum}_ocr${idx}`,
        page: pageNum,
        text: w.text.trim(),
        x: Number(xPct.toFixed(2)),
        y: Number(yPct.toFixed(2)),
        w: Number(wPct.toFixed(2)),
        h: Number(hPct.toFixed(2)),
        kind: classifyTokenBox(w.text),
        source: 'ocr_tesseract',
        confidence: Math.round(w.confidence || 80)
      };
    });

  return {
    text: data.text || '',
    tokens,
    confidence: Math.round(data.confidence || 80)
  };
}
