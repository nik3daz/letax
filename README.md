# FiscalLab — On-Device French Tax Document Workbench

A 100% on-device, browser-based workbench for processing French tax and financial documents (Cerfa 2042, Avis d'Imposition, IFU 2561, Bulletin de Paie, Taxe Foncière, etc.).

## Key Features

- **100% Local Processing & Privacy**: Zero document data sent to external servers. All PDF parsing, OCR, and classification run inside the user's browser.
- **Client Project Management**: Organize files by client and tax year. All records and uploaded files persist locally in browser IndexedDB.
- **Hybrid Extraction Pipeline**:
  - `PDF.js` for instant digital text and coordinate bounding boxes.
  - `Tesseract.js` (French language model) in a Web Worker for scanned PDFs or images.
- **Side-by-Side Verification**: Original document on the left with interactive bounding boxes; structured data inspector and Cerfa code dictionary on the right.
- **Interactive Tagging**: Click any number or text on the original PDF overlay to map it directly into a spreadsheet column.
- **Exporting**: Consolidate client figures across documents and export to Excel (`.xlsx`) or CSV.
- **Configurable Intelligence**:
  - Baseline deterministic regex engine for 30+ Cerfa boxes and standard French currency patterns.
  - Optional in-browser local LLM via WebGPU (WebLLM) for automated extraction on non-standard layouts.

## Local Development

Launch the local server:
```bash
python serve.py 8080
```
or double-click `start.bat`. Open `http://localhost:8080` in Chrome, Edge, or any modern browser.

## Remote Deployment (GitHub Pages / Cloudflare Pages)

This project has no backend server dependencies and can be deployed directly to any static site host (e.g. GitHub Pages, Cloudflare Pages, Netlify).
