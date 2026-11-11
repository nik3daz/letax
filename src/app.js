import { db } from './db.js';
import {
  DOCUMENT_TYPES,
  CERFA_BOX_DICTIONARY,
  BUILTIN_EXTRACTION_RULES,
  analyzeFrenchTaxDocument,
  parseFrenchNumber,
  formatFrenchNumber,
  slugifyColumnName
} from './french-tax-rules.js';
import { extractDocumentContent } from './extractor.js';
import { llmEngine, AVAILABLE_LOCAL_MODELS } from './llm-engine.js';
import { generateSampleFrenchTaxFiles } from './sample-generator.js';

// Configure PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

class TaxWorkbenchApp {
  constructor() {
    this.projects = [];
    this.activeProjectId = null;
    this.documents = [];
    this.activeDocId = null;
    this.customRules = [];
    this.settings = {};

    // UI state
    this.queueFilter = 'all'; // 'all' | 'standard' | 'needs_review' | 'non_standard'
    this.inspectorTab = 'fields'; // 'fields' | 'entities' | 'raw'
    this.spreadsheetMode = 'by_doc'; // 'by_doc' | 'consolidated'
    this.drawerCollapsed = false;

    // PDF/Image Viewer state
    this.currentPage = 1;
    this.zoomScale = 1.15;
    this.overlayMode = 'highlights'; // 'highlights' | 'all' | 'mapped' | 'none'
    this.pulsingBoxId = null;
    this.activePdfProxy = null;
    this.activePdfDocId = null;

    // Pending files inside "New Project" modal
    this.newProjectPendingFiles = [];
  }

  async init() {
    this.settings = await db.getSettings();
    this.overlayMode = this.settings.defaultOverlayMode || 'highlights';
    this.customRules = await db.getCustomRules();
    this.projects = await db.getAllProjects();

    this.bindGlobalEvents();

    if (this.projects.length === 0) {
      // Automatically create a starter demo project with sample French tax documents on first visit
      await this.createDemoProject();
    } else {
      await this.selectProject(this.projects[0].id);
    }
  }

  async createDemoProject() {
    this.setStatusBanner('Generating sample French tax client project (Digital PDFs & OCR Scan)...');
    try {
      const sampleFiles = await generateSampleFrenchTaxFiles();
      const project = {
        id: `proj_${Date.now()}`,
        name: 'Martin Household — 2026 Tax Return (Demo)',
        taxYear: '2025',
        notes: 'Demo client folder with Tax Notice (Avis), Bank IFU 2561, URSSAF CESU Scan (OCR), and Non-Standard Rental Repairs Statement.',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await db.saveProject(project);
      this.projects = await db.getAllProjects();
      await this.selectProject(project.id);
      await this.ingestFileObjects(sampleFiles);
    } catch (err) {
      console.error('Demo generation error:', err);
    } finally {
      this.setStatusBanner(null);
    }
  }

  async selectProject(projectId) {
    this.activeProjectId = projectId;
    this.documents = await db.getDocumentsByProject(projectId);
    this.activeDocId = this.documents[0]?.id || null;
    this.currentPage = 1;
    this.activePdfProxy = null;
    this.activePdfDocId = null;
    this.renderAll();
  }

  getActiveProject() {
    return this.projects.find((p) => p.id === this.activeProjectId) || null;
  }

  getActiveDocument() {
    return this.documents.find((d) => d.id === this.activeDocId) || null;
  }

  setStatusBanner(message) {
    const el = document.getElementById('processing-banner');
    const textEl = document.getElementById('processing-banner-text');
    if (!el || !textEl) return;
    if (!message) {
      el.classList.add('hidden');
    } else {
      textEl.textContent = message;
      el.classList.remove('hidden');
    }
  }

  /**
   * Process and store an array of uploaded files or generated sample file objects
   */
  async ingestFileObjects(fileList, forceOcr = false) {
    if (!this.activeProjectId || !fileList || !fileList.length) return;

    for (let i = 0; i < fileList.length; i++) {
      const item = fileList[i];
      const fileName = item.name;
      const mimeType =
        item.type ||
        (fileName.toLowerCase().endsWith('.png')
          ? 'image/png'
          : fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/pdf');

      const buffer = item.buffer ? item.buffer : await item.arrayBuffer();

      this.setStatusBanner(
        `Processing (${i + 1}/${fileList.length}): ${fileName}...`
      );

      try {
        const extraction = await extractDocumentContent(buffer, mimeType, {
          forceOcr,
          ocrLanguage: this.settings.ocrLanguage || 'fra',
          forceOcrThresholdChars: this.settings.forceOcrThresholdChars || 40,
          onProgress: (p) => {
            this.setStatusBanner(
              `[${i + 1}/${fileList.length}] ${fileName} — ${p.message}`
            );
          }
        });

        const analysis = analyzeFrenchTaxDocument(
          extraction.fullText,
          extraction.tokens,
          this.customRules,
          extraction.avgConfidence
        );

        const docRecord = {
          id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          projectId: this.activeProjectId,
          name: fileName,
          mimeType,
          fileSize: buffer.byteLength,
          fileBuffer: buffer,
          numPages: extraction.numPages,
          pages: extraction.pages,
          tokens: extraction.tokens,
          fullText: extraction.fullText,
          extractionMethod: extraction.method,
          avgConfidence: extraction.avgConfidence,
          elapsedMs: extraction.elapsedMs,
          docType: analysis.docType,
          triageStatus: analysis.triageStatus,
          extractedFields: analysis.extractedFields,
          detectedEntities: analysis.detectedEntities,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        // Optional: If Local LLM is enabled & auto-run on non-standard is checked
        if (
          this.settings.useLocalLLM &&
          this.settings.autoRunLLMOnNonStandard &&
          docRecord.triageStatus === 'non_standard'
        ) {
          this.setStatusBanner(`[Local LLM] Running AI extraction on ${fileName}...`);
          try {
            const llmRes = await llmEngine.extractFieldsWithLLM(
              docRecord.fullText,
              docRecord.tokens,
              this.settings.llmModelId
            );
            if (llmRes.docType && llmRes.docType !== 'non_standard') {
              docRecord.docType = llmRes.docType;
            }
            for (const lf of llmRes.fields) {
              if (!docRecord.extractedFields.some((ef) => ef.column === lf.column)) {
                docRecord.extractedFields.push(lf);
              }
            }
          } catch (llmErr) {
            console.warn('Auto LLM fallback skipped:', llmErr);
          }
        }

        await db.saveDocument(docRecord);
        this.documents = await db.getDocumentsByProject(this.activeProjectId);
        if (!this.activeDocId) {
          this.activeDocId = docRecord.id;
        }
        this.renderAll();
      } catch (err) {
        console.error(`Error processing ${fileName}:`, err);
        alert(`Error reading ${fileName}: ${err.message}`);
      }
    }

    this.setStatusBanner(null);
    this.renderAll();
  }

  /**
   * Re-run extraction on the currently active document (e.g. Force OCR or Re-apply Rules)
   */
  async reprocessActiveDocument({ forceOcr = false, runLLM = false } = {}) {
    const doc = this.getActiveDocument();
    if (!doc) return;

    try {
      if (forceOcr) {
        this.setStatusBanner(`Running Tesseract OCR (${this.settings.ocrLanguage || 'fra'}) on ${doc.name}...`);
        const extraction = await extractDocumentContent(doc.fileBuffer, doc.mimeType, {
          forceOcr: true,
          ocrLanguage: this.settings.ocrLanguage || 'fra',
          onProgress: (p) => this.setStatusBanner(`${doc.name} — ${p.message}`)
        });
        doc.pages = extraction.pages;
        doc.tokens = extraction.tokens;
        doc.fullText = extraction.fullText;
        doc.extractionMethod = extraction.method;
        doc.avgConfidence = extraction.avgConfidence;
        doc.elapsedMs = extraction.elapsedMs;
      }

      // Re-run baseline regex + custom rules while preserving manually verified fields
      const verifiedFields = (doc.extractedFields || []).filter((f) => f.verified || f.sourceMethod === 'Manual Tag');
      const analysis = analyzeFrenchTaxDocument(
        doc.fullText,
        doc.tokens,
        this.customRules,
        doc.avgConfidence
      );

      const mergedMap = new Map();
      for (const f of analysis.extractedFields) {
        mergedMap.set(f.column, f);
      }
      for (const vf of verifiedFields) {
        mergedMap.set(vf.column, vf);
      }

      doc.extractedFields = Array.from(mergedMap.values());
      doc.detectedEntities = analysis.detectedEntities;
      if (doc.docType === 'non_standard' && analysis.docType !== 'non_standard') {
        doc.docType = analysis.docType;
        doc.triageStatus = analysis.triageStatus;
      }

      if (runLLM) {
        this.setStatusBanner(`Running Local AI Extraction (WebLLM) on ${doc.name}...`);
        const llmRes = await llmEngine.extractFieldsWithLLM(
          doc.fullText,
          doc.tokens,
          this.settings.llmModelId,
          (prog) => this.setStatusBanner(`[WebLLM] ${prog.text}`)
        );
        if (llmRes.docType && doc.docType === 'non_standard') {
          doc.docType = llmRes.docType;
        }
        for (const lf of llmRes.fields) {
          if (!doc.extractedFields.some((ef) => ef.column === lf.column)) {
            doc.extractedFields.push(lf);
          }
        }
      }

      // Sync token mapped flags
      const matchedIds = new Set(doc.extractedFields.map((f) => f.boxId).filter(Boolean));
      for (const t of doc.tokens || []) {
        t.isMapped = matchedIds.has(t.id);
      }

      await db.saveDocument(doc);
      this.setStatusBanner(null);
      this.renderAll();
    } catch (err) {
      this.setStatusBanner(null);
      alert(`Error: ${err.message}`);
    }
  }

  // ============================================================================
  // UI RENDERING
  // ============================================================================

  renderAll() {
    this.renderTopBar();
    this.renderSidebarQueue();
    this.renderDocumentViewer();
    this.renderInspector();
    this.renderSpreadsheetDrawer();
  }

  renderTopBar() {
    const selectEl = document.getElementById('project-select');
    if (selectEl) {
      selectEl.innerHTML = this.projects
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === this.activeProjectId ? 'selected' : ''}>${this.escapeHtml(
              p.name
            )} (${p.taxYear || '2025'})</option>`
        )
        .join('');
    }

    // Stats pills
    const total = this.documents.length;
    const stdCount = this.documents.filter((d) => d.triageStatus === 'standard').length;
    const revCount = this.documents.filter((d) => d.triageStatus === 'needs_review').length;
    const nonStdCount = this.documents.filter((d) => d.triageStatus === 'non_standard').length;

    const pillsEl = document.getElementById('triage-pills');
    if (pillsEl) {
      pillsEl.innerHTML = `
        <span class="stat-pill" title="Total documents in this client project">📄 ${total} docs</span>
        <span class="stat-pill" title="Automatically recognized standard documents"><span class="dot standard"></span>${stdCount} Standard</span>
        <span class="stat-pill" title="Partial matches or scans needing verification"><span class="dot review"></span>${revCount} Needs Review</span>
        <span class="stat-pill" title="Non-standard documents to inspect or tag"><span class="dot nonstandard"></span>${nonStdCount} Non-Standard</span>
      `;
    }

    // LLM mode badge in Settings button
    const llmIndicator = document.getElementById('llm-mode-indicator');
    if (llmIndicator) {
      llmIndicator.textContent = this.settings.useLocalLLM ? '⚡ Regex + Local LLM' : '⚙️ Mode: Regex Baseline';
      llmIndicator.className = this.settings.useLocalLLM ? 'btn btn-purple' : 'btn';
    }
  }

  renderSidebarQueue() {
    document.querySelectorAll('.filter-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === this.queueFilter);
    });

    const listEl = document.getElementById('doc-queue-list');
    if (!listEl) return;

    const filtered = this.documents.filter((d) => {
      if (this.queueFilter === 'all') return true;
      return d.triageStatus === this.queueFilter;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No documents match this filter.
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map((doc) => {
        const docTypeObj =
          DOCUMENT_TYPES.find((t) => t.id === doc.docType) ||
          DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
        const statusLabels = {
          standard: '🟢 Standard',
          needs_review: '🟡 Needs Review',
          non_standard: '🟣 Non-Standard'
        };
        const methodLabels = {
          native_pdf: 'Native PDF',
          ocr_tesseract: 'OCR Scan',
          hybrid_pdf_ocr: 'Hybrid PDF+OCR'
        };
        const verifiedCount = (doc.extractedFields || []).filter((f) => f.verified).length;
        const totalFields = (doc.extractedFields || []).length;

        return `
          <div class="doc-card ${doc.id === this.activeDocId ? 'active' : ''}" data-doc-id="${doc.id}">
            <div class="doc-card-top">
              <div class="doc-filename">${this.escapeHtml(doc.name)}</div>
              <button class="btn btn-sm btn-danger doc-delete-btn" data-delete-doc="${doc.id}" title="Remove this document" style="padding:1px 5px; font-size:10px;">✕</button>
            </div>
            <div class="doc-badges">
              <span class="badge badge-${doc.triageStatus}">${statusLabels[doc.triageStatus] || 'Unclassified'}</span>
              <span class="badge" style="background:${docTypeObj.color}22; color:${docTypeObj.color}; border:1px solid ${docTypeObj.color}55;">
                ${this.escapeHtml(docTypeObj.shortLabel)}
              </span>
              <span class="badge badge-method">${methodLabels[doc.extractionMethod] || 'PDF'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary);">
              <span>${totalFields} extracted field(s)</span>
              <span style="color:${verifiedCount === totalFields && totalFields > 0 ? '#34d399' : 'var(--text-muted)'}">
                ✓ ${verifiedCount}/${totalFields} verified
              </span>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.doc-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.doc-delete-btn')) return;
        this.activeDocId = card.dataset.docId;
        this.currentPage = 1;
        this.pulsingBoxId = null;
        this.closeBoxPopover();
        this.renderAll();
      });
    });

    listEl.querySelectorAll('.doc-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteDoc;
        if (confirm('Remove this document from the client project?')) {
          await db.deleteDocument(id);
          this.documents = await db.getDocumentsByProject(this.activeProjectId);
          if (this.activeDocId === id) {
            this.activeDocId = this.documents[0]?.id || null;
          }
          this.renderAll();
        }
      });
    });
  }

  async renderDocumentViewer() {
    const doc = this.getActiveDocument();
    const emptyEl = document.getElementById('viewer-empty-state');
    const stageWrapper = document.getElementById('viewer-stage-wrapper');
    const pageIndicator = document.getElementById('page-indicator');
    const zoomIndicator = document.getElementById('zoom-indicator');
    const overlaySelect = document.getElementById('overlay-mode-select');

    if (overlaySelect) {
      overlaySelect.value = this.overlayMode;
    }
    if (zoomIndicator) {
      zoomIndicator.textContent = `${Math.round(this.zoomScale * 100)}%`;
    }

    if (!doc) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (stageWrapper) stageWrapper.classList.add('hidden');
      if (pageIndicator) pageIndicator.textContent = '0 / 0';
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (stageWrapper) stageWrapper.classList.remove('hidden');

    const numPages = doc.numPages || 1;
    if (this.currentPage > numPages) this.currentPage = numPages;
    if (this.currentPage < 1) this.currentPage = 1;
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${this.currentPage} / ${numPages}`;
    }

    const canvas = document.getElementById('doc-render-canvas');
    const stageEl = document.getElementById('page-stage');
    if (!canvas || !stageEl) return;
    const ctx = canvas.getContext('2d');

    if (doc.mimeType && doc.mimeType.startsWith('image/')) {
      const blob = new Blob([doc.fileBuffer], { type: doc.mimeType });
      const bitmap = await createImageBitmap(blob);
      const displayW = Math.round(bitmap.width * 0.65 * this.zoomScale);
      const displayH = Math.round(bitmap.height * 0.65 * this.zoomScale);
      canvas.width = displayW;
      canvas.height = displayH;
      stageEl.style.width = `${displayW}px`;
      stageEl.style.height = `${displayH}px`;
      ctx.drawImage(bitmap, 0, 0, displayW, displayH);
    } else {
      // Render PDF page via PDF.js
      if (this.activePdfDocId !== doc.id || !this.activePdfProxy) {
        const uint8 = new Uint8Array(doc.fileBuffer.slice(0));
        this.activePdfProxy = await window.pdfjsLib.getDocument({ data: uint8 }).promise;
        this.activePdfDocId = doc.id;
      }
      const page = await this.activePdfProxy.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: this.zoomScale * 1.2 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      stageEl.style.width = `${viewport.width}px`;
      stageEl.style.height = `${viewport.height}px`;
      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    this.renderBoundingBoxOverlay(doc);
  }

  renderBoundingBoxOverlay(doc) {
    const overlayEl = document.getElementById('bbox-overlay');
    if (!overlayEl) return;

    if (this.overlayMode === 'none') {
      overlayEl.innerHTML = '';
      return;
    }

    const pageTokens = (doc.tokens || []).filter((t) => t.page === this.currentPage);
    const filteredTokens = pageTokens.filter((t) => {
      if (t.id === this.pulsingBoxId) return true;
      if (this.overlayMode === 'mapped') return t.isMapped;
      if (this.overlayMode === 'highlights') {
        return t.isMapped || t.kind === 'amount' || t.kind === 'cerfa_code' || t.kind === 'number';
      }
      return true; // 'all'
    });

    overlayEl.innerHTML = filteredTokens
      .map((t) => {
        const classes = [
          'bbox-item',
          `kind-${t.kind || 'text'}`,
          t.isMapped ? 'mapped' : '',
          t.id === this.pulsingBoxId ? 'pulsing' : ''
        ]
          .filter(Boolean)
          .join(' ');

        return `<div class="${classes}"
          data-box-id="${t.id}"
          title="${this.escapeHtml(t.text)} (Click to map to a spreadsheet column)"
          style="left:${t.x}%; top:${t.y}%; width:${t.w}%; height:${t.h}%;"></div>`;
      })
      .join('');

    overlayEl.querySelectorAll('.bbox-item').forEach((boxEl) => {
      boxEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const boxId = boxEl.dataset.boxId;
        const token = (doc.tokens || []).find((t) => t.id === boxId);
        if (token) {
          this.openBoxTagPopover(token, boxEl);
        }
      });
    });

    if (this.pulsingBoxId) {
      const targetEl = overlayEl.querySelector(`[data-box-id="${this.pulsingBoxId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }

  openBoxTagPopover(token) {
    this.closeBoxPopover();
    const doc = this.getActiveDocument();
    if (!doc) return;

    const stageEl = document.getElementById('page-stage');
    if (!stageEl) return;

    const docTypeObj =
      DOCUMENT_TYPES.find((d) => d.id === doc.docType) || DOCUMENT_TYPES[0];
    const suggestedCols = [
      ...(docTypeObj.defaultColumns || []),
      ...Object.values(CERFA_BOX_DICTIONARY).map((c) => c.column)
    ];
    const uniqueCols = Array.from(new Set(suggestedCols));

    const parsedNum = parseFrenchNumber(token.text);
    const defaultCol =
      token.kind === 'cerfa_code' && CERFA_BOX_DICTIONARY[token.text]
        ? CERFA_BOX_DICTIONARY[token.text].column
        : docTypeObj.defaultColumns?.[0] || 'Extracted_Amount';

    const popover = document.createElement('div');
    popover.className = 'bbox-popover';
    popover.id = 'active-bbox-popover';

    const leftPx = Math.min(
      stageEl.clientWidth - 300,
      Math.max(10, (token.x / 100) * stageEl.clientWidth)
    );
    const topPx = Math.min(
      stageEl.clientHeight - 220,
      Math.max(10, ((token.y + token.h) / 100) * stageEl.clientHeight + 6)
    );
    popover.style.left = `${leftPx}px`;
    popover.style.top = `${topPx}px`;

    popover.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:12px; color:#38bdf8;">🎯 Tag to Spreadsheet</span>
        <button class="btn btn-sm" id="close-popover-btn" style="padding:1px 6px;">✕</button>
      </div>
      <div style="font-size:11.5px; background:#1e293b; padding:6px 8px; border-radius:5px; font-family:var(--font-mono);">
        Selected text: <strong>${this.escapeHtml(token.text)}</strong>
      </div>
      <div>
        <label style="font-size:11px; color:var(--text-secondary);">Spreadsheet Column (existing or new):</label>
        <input type="text" id="popover-col-input" list="popover-col-datalist" class="text-input" value="${this.escapeHtml(
          defaultCol
        )}" style="margin-top:3px;" />
        <datalist id="popover-col-datalist">
          ${uniqueCols.map((c) => `<option value="${this.escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>
      <div>
        <label style="font-size:11px; color:var(--text-secondary);">Normalized Value:</label>
        <input type="text" id="popover-val-input" class="text-input" value="${this.escapeHtml(
          parsedNum !== null ? String(parsedNum) : token.text
        )}" style="margin-top:3px;" />
      </div>
      <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">
        <button class="btn btn-sm btn-primary" id="popover-save-btn">✓ Assign & Verify</button>
      </div>
    `;

    stageEl.appendChild(popover);

    popover.querySelector('#close-popover-btn').addEventListener('click', () => {
      this.closeBoxPopover();
    });

    popover.querySelector('#popover-save-btn').addEventListener('click', async () => {
      const colName = slugifyColumnName(
        popover.querySelector('#popover-col-input').value.trim() || 'Manual_Field'
      );
      const rawVal = popover.querySelector('#popover-val-input').value.trim();
      const numVal = parseFrenchNumber(rawVal);

      const existingIdx = (doc.extractedFields || []).findIndex((f) => f.column === colName);
      const newField = {
        id: `manual_${colName}_${Date.now()}`,
        column: colName,
        label: colName.replace(/_/g, ' '),
        rawValue: token.text,
        value: numVal !== null ? numVal : rawVal,
        sourceMethod: 'Manual Tag',
        confidence: 1.0,
        verified: true,
        contextLine: `Direct selection on document (p.${token.page}): ${token.text}`,
        boxId: token.id,
        page: token.page
      };

      if (existingIdx >= 0) {
        doc.extractedFields[existingIdx] = newField;
      } else {
        doc.extractedFields.push(newField);
      }

      token.isMapped = true;
      await db.saveDocument(doc);
      this.closeBoxPopover();
      this.renderAll();
    });
  }

  closeBoxPopover() {
    const existing = document.getElementById('active-bbox-popover');
    if (existing) existing.remove();
  }

  renderInspector() {
    const doc = this.getActiveDocument();
    const docTypeSelect = document.getElementById('inspector-doctype-select');
    const triageSelect = document.getElementById('inspector-triage-select');
    const bodyEl = document.getElementById('inspector-body');

    document.querySelectorAll('.inspector-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === this.inspectorTab);
    });

    if (!doc) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="empty-state">Select or upload a document to inspect and verify its extracted data.</div>`;
      }
      return;
    }

    if (docTypeSelect) {
      docTypeSelect.innerHTML = DOCUMENT_TYPES.map(
        (dt) =>
          `<option value="${dt.id}" ${dt.id === doc.docType ? 'selected' : ''}>${this.escapeHtml(
            dt.label
          )}</option>`
      ).join('');
    }

    if (triageSelect) {
      triageSelect.value = doc.triageStatus || 'needs_review';
    }

    if (!bodyEl) return;

    if (this.inspectorTab === 'fields') {
      this.renderInspectorFieldsTab(doc, bodyEl);
    } else if (this.inspectorTab === 'entities') {
      this.renderInspectorEntitiesTab(doc, bodyEl);
    } else {
      this.renderInspectorRawTab(doc, bodyEl);
    }
  }

  renderInspectorFieldsTab(doc, container) {
    const fields = doc.extractedFields || [];

    const headerActions = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <span style="font-size:11.5px; color:var(--text-secondary);">
          <strong>${fields.length}</strong> field(s) mapped to spreadsheet
        </span>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm" id="add-manual-field-btn">+ Add Field</button>
          <button class="btn btn-sm btn-emerald" id="verify-all-fields-btn">✓ Verify All</button>
        </div>
      </div>
    `;

    if (fields.length === 0) {
      container.innerHTML = `
        ${headerActions}
        <div style="padding:22px; text-align:center; background:var(--bg-app); border:1px dashed var(--border-subtle); border-radius:8px; color:var(--text-secondary);">
          <p style="margin-bottom:8px;">No standard fields were automatically extracted for this document.</p>
          <p style="font-size:11.5px; color:var(--text-muted);">
            👉 Click any highlighted box directly on the PDF on the left, or open the <strong>Numbers & Codes</strong> tab to map values in 1 click.
          </p>
        </div>
      `;
    } else {
      container.innerHTML =
        headerActions +
        fields
          .map(
            (f, idx) => `
          <div class="field-card ${f.verified ? 'verified' : ''}" data-field-idx="${idx}">
            <div class="field-card-header">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="field-col-key">${this.escapeHtml(f.column)}</span>
                <span class="badge badge-method">${this.escapeHtml(f.sourceMethod || 'Regex')}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${
                  f.boxId
                    ? `<button class="btn btn-sm locate-box-btn" data-box-id="${f.boxId}" data-page="${
                        f.page || 1
                      }" title="Locate and pulse this value on the original document">🎯 Locate on PDF</button>`
                    : ''
                }
                <button class="btn btn-sm btn-danger delete-field-btn" data-field-idx="${idx}" title="Delete this field">✕</button>
              </div>
            </div>
            <div style="font-size:11.5px; color:var(--text-secondary);">${this.escapeHtml(f.label)}</div>
            <div class="field-inputs-row">
              <input type="text" class="text-input field-col-edit" data-field-idx="${idx}" value="${this.escapeHtml(
              f.column
            )}" title="Spreadsheet column name" />
              <input type="text" class="text-input field-val-edit" data-field-idx="${idx}" value="${this.escapeHtml(
              String(f.value ?? '')
            )}" style="font-family:var(--font-mono); font-weight:700; color:#34d399;" title="Extracted value" />
              <label style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; cursor:pointer; user-select:none;">
                <input type="checkbox" class="field-verify-checkbox" data-field-idx="${idx}" ${
              f.verified ? 'checked' : ''
            } />
                Verified
              </label>
            </div>
            ${
              f.contextLine
                ? `<div class="field-context" title="${this.escapeHtml(f.contextLine)}">Source line: ${this.escapeHtml(
                    f.contextLine
                  )}</div>`
                : ''
            }
          </div>
        `
          )
          .join('');
    }

    // Bind field events
    container.querySelector('#add-manual-field-btn')?.addEventListener('click', async () => {
      doc.extractedFields.push({
        id: `custom_${Date.now()}`,
        column: 'Custom_Field',
        label: 'Custom manual field',
        rawValue: '0',
        value: 0,
        sourceMethod: 'Manual Tag',
        confidence: 1,
        verified: true,
        contextLine: 'Manual entry'
      });
      await db.saveDocument(doc);
      this.renderAll();
    });

    container.querySelector('#verify-all-fields-btn')?.addEventListener('click', async () => {
      (doc.extractedFields || []).forEach((f) => {
        f.verified = true;
      });
      if (doc.triageStatus === 'needs_review') {
        doc.triageStatus = 'standard';
      }
      await db.saveDocument(doc);
      this.renderAll();
    });

    container.querySelectorAll('.locate-box-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const boxId = btn.dataset.boxId;
        const page = Number(btn.dataset.page) || 1;
        this.locateBoxOnViewer(page, boxId);
      });
    });

    container.querySelectorAll('.delete-field-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.fieldIdx);
        doc.extractedFields.splice(idx, 1);
        await db.saveDocument(doc);
        this.renderAll();
      });
    });

    container.querySelectorAll('.field-col-edit').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const idx = Number(inp.dataset.fieldIdx);
        doc.extractedFields[idx].column = slugifyColumnName(inp.value.trim());
        await db.saveDocument(doc);
        this.renderSpreadsheetDrawer();
      });
    });

    container.querySelectorAll('.field-val-edit').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const idx = Number(inp.dataset.fieldIdx);
        const raw = inp.value.trim();
        const num = parseFrenchNumber(raw);
        doc.extractedFields[idx].value = num !== null ? num : raw;
        doc.extractedFields[idx].verified = true;
        await db.saveDocument(doc);
        this.renderAll();
      });
    });

    container.querySelectorAll('.field-verify-checkbox').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const idx = Number(chk.dataset.fieldIdx);
        doc.extractedFields[idx].verified = chk.checked;
        await db.saveDocument(doc);
        this.renderAll();
      });
    });
  }

  renderInspectorEntitiesTab(doc, container) {
    const entities = doc.detectedEntities || [];
    if (entities.length === 0) {
      container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">No currency amounts or Cerfa tax codes detected on this document.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="font-size:11.5px; color:var(--text-secondary); margin-bottom:4px;">
        All currency amounts (€), numbers, and Cerfa tax box codes detected in this document. Click <strong>+ Map to Column</strong> to send any value to the spreadsheet:
      </div>
      ${entities
        .map(
          (ent, idx) => `
        <div class="field-card">
          <div class="field-card-header">
            <span class="badge ${
              ent.kind === 'cerfa_code' ? 'badge-needs_review' : 'badge-method'
            }">
              ${ent.kind === 'cerfa_code' ? `Cerfa Box ${ent.code}` : 'Amount (€)'}
            </span>
            <span style="font-family:var(--font-mono); font-weight:700; font-size:13px; color:#34d399;">
              ${this.escapeHtml(ent.rawValue)}
            </span>
          </div>
          <div class="field-context" title="${this.escapeHtml(ent.contextLine)}">
            ${this.escapeHtml(ent.contextLine)}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:2px;">
            <span style="font-size:11px; color:#38bdf8; font-family:var(--font-mono);">
              → ${this.escapeHtml(ent.suggestedColumn)}
            </span>
            <div style="display:flex; gap:6px;">
              ${
                ent.boxId
                  ? `<button class="btn btn-sm ent-locate-btn" data-box-id="${ent.boxId}" data-page="${
                      ent.page || 1
                    }">🎯 Locate</button>`
                  : ''
              }
              <button class="btn btn-sm btn-primary ent-map-btn" data-ent-idx="${idx}">+ Map to Column</button>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    `;

    container.querySelectorAll('.ent-locate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.locateBoxOnViewer(Number(btn.dataset.page) || 1, btn.dataset.boxId);
      });
    });

    container.querySelectorAll('.ent-map-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ent = entities[Number(btn.dataset.entIdx)];
        if (!ent) return;
        const col = prompt(
          'Enter the spreadsheet column name for this value:',
          ent.suggestedColumn || 'Extracted_Amount'
        );
        if (!col) return;
        const cleanCol = slugifyColumnName(col);
        doc.extractedFields.push({
          id: `mapped_${cleanCol}_${Date.now()}`,
          column: cleanCol,
          label: ent.label || cleanCol,
          rawValue: ent.rawValue,
          value: ent.value,
          sourceMethod: 'Manual Tag',
          confidence: 1.0,
          verified: true,
          contextLine: ent.contextLine,
          boxId: ent.boxId,
          page: ent.page || 1
        });
        await db.saveDocument(doc);
        this.inspectorTab = 'fields';
        this.renderAll();
      });
    });
  }

  renderInspectorRawTab(doc, container) {
    container.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:space-between; background:var(--bg-app); padding:8px 10px; border-radius:6px; border:1px solid var(--border-subtle);">
        <div style="font-size:11.5px;">
          Method: <strong>${this.escapeHtml(doc.extractionMethod)}</strong> |
          Confidence: <strong>${doc.avgConfidence || 95}%</strong> |
          Time: <strong>${doc.elapsedMs || 0} ms</strong>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm" id="raw-force-ocr-btn">🔍 Force French OCR</button>
          <button class="btn btn-sm btn-purple" id="raw-run-llm-btn">🤖 Extract with Local LLM</button>
        </div>
      </div>
      <div class="raw-text-box">${this.escapeHtml(doc.fullText || '(No text extracted)')}</div>
    `;

    container.querySelector('#raw-force-ocr-btn')?.addEventListener('click', () => {
      this.reprocessActiveDocument({ forceOcr: true });
    });

    container.querySelector('#raw-run-llm-btn')?.addEventListener('click', () => {
      this.reprocessActiveDocument({ runLLM: true });
    });
  }

  locateBoxOnViewer(page, boxId) {
    this.currentPage = page;
    this.pulsingBoxId = boxId;
    this.renderDocumentViewer();
    setTimeout(() => {
      if (this.pulsingBoxId === boxId) {
        this.pulsingBoxId = null;
        this.renderDocumentViewer();
      }
    }, 3500);
  }

  // ============================================================================
  // SPREADSHEET DRAWER & EXPORT
  // ============================================================================

  getAllSpreadsheetColumns() {
    const colSet = new Set();
    for (const d of this.documents) {
      for (const f of d.extractedFields || []) {
        if (f.column) colSet.add(f.column);
      }
    }
    return Array.from(colSet);
  }

  renderSpreadsheetDrawer() {
    const drawer = document.getElementById('spreadsheet-drawer');
    const headEl = document.getElementById('spreadsheet-thead');
    const bodyEl = document.getElementById('spreadsheet-tbody');
    const modeSelect = document.getElementById('spreadsheet-mode-select');

    if (drawer) {
      drawer.classList.toggle('collapsed', this.drawerCollapsed);
    }
    if (modeSelect) {
      modeSelect.value = this.spreadsheetMode;
    }
    if (!headEl || !bodyEl) return;

    if (this.documents.length === 0) {
      headEl.innerHTML = '';
      bodyEl.innerHTML = `<tr><td style="padding:16px; color:var(--text-muted);">No documents in this client project yet.</td></tr>`;
      return;
    }

    if (this.spreadsheetMode === 'by_doc') {
      const dynamicCols = this.getAllSpreadsheetColumns();
      headEl.innerHTML = `
        <tr>
          <th>Document</th>
          <th>Triage Status</th>
          <th>Document Type</th>
          ${dynamicCols.map((c) => `<th>${this.escapeHtml(c)}</th>`).join('')}
        </tr>
      `;

      bodyEl.innerHTML = this.documents
        .map((doc) => {
          const docTypeObj =
            DOCUMENT_TYPES.find((t) => t.id === doc.docType) ||
            DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
          const fieldMap = new Map((doc.extractedFields || []).map((f) => [f.column, f]));

          return `
            <tr data-row-doc="${doc.id}" style="${
            doc.id === this.activeDocId ? 'background:rgba(59,130,246,0.12);' : ''
          }">
              <td style="font-weight:600; cursor:pointer;" class="sheet-doc-cell" data-doc-id="${doc.id}">
                📄 ${this.escapeHtml(doc.name)}
              </td>
              <td><span class="badge badge-${doc.triageStatus}">${this.escapeHtml(doc.triageStatus)}</span></td>
              <td>${this.escapeHtml(docTypeObj.shortLabel)}</td>
              ${dynamicCols
                .map((col) => {
                  const field = fieldMap.get(col);
                  if (!field) return `<td style="color:var(--text-muted);">—</td>`;
                  const displayVal =
                    typeof field.value === 'number'
                      ? formatFrenchNumber(field.value)
                      : String(field.value);
                  return `<td class="num-cell" data-doc-id="${doc.id}" data-box-id="${
                    field.boxId || ''
                  }" data-page="${field.page || 1}" title="Click to highlight source on ${this.escapeHtml(
                    doc.name
                  )}">
                    ${this.escapeHtml(displayVal)} ${field.verified ? '✓' : ''}
                  </td>`;
                })
                .join('')}
            </tr>
          `;
        })
        .join('');
    } else {
      // Consolidated Client Summary (One row per extracted tax column across all client docs)
      const dynamicCols = this.getAllSpreadsheetColumns();
      headEl.innerHTML = `
        <tr>
          <th>Tax Column / Cerfa Box</th>
          <th>Description (English)</th>
          <th>Consolidated Client Total / Value</th>
          <th>Contributing Source Documents</th>
        </tr>
      `;

      bodyEl.innerHTML = dynamicCols
        .map((col) => {
          const matching = [];
          for (const doc of this.documents) {
            for (const f of doc.extractedFields || []) {
              if (f.column === col) {
                matching.push({ doc, field: f });
              }
            }
          }
          const firstLabel = matching[0]?.field?.label || col;
          const allNumeric = matching.every((m) => typeof m.field.value === 'number');
          let consolidatedVal = '';
          if (allNumeric && col !== 'Tax_Year' && col !== 'Tax_ID_SPI' && col !== 'Annee_Revenus' && col !== 'Numero_Fiscal') {
            const sum = matching.reduce((acc, m) => acc + Number(m.field.value || 0), 0);
            consolidatedVal = `${formatFrenchNumber(sum)}`;
          } else {
            consolidatedVal = Array.from(new Set(matching.map((m) => m.field.value))).join(' | ');
          }

          return `
            <tr>
              <td style="font-family:var(--font-mono); font-weight:700; color:#38bdf8;">${this.escapeHtml(col)}</td>
              <td>${this.escapeHtml(firstLabel)}</td>
              <td class="num-cell" data-doc-id="${matching[0]?.doc.id || ''}" data-box-id="${
            matching[0]?.field.boxId || ''
          }" data-page="${matching[0]?.field.page || 1}">
                ${this.escapeHtml(String(consolidatedVal))}
              </td>
              <td style="color:var(--text-secondary);">
                ${matching
                  .map(
                    (m) =>
                      `<span class="badge badge-method" style="margin-right:4px;">${this.escapeHtml(
                        m.doc.name
                      )}: ${this.escapeHtml(String(m.field.value))}</span>`
                  )
                  .join('')}
              </td>
            </tr>
          `;
        })
        .join('');
    }

    // Clicking any cell in the spreadsheet jumps to that document & highlights the bounding box!
    bodyEl.querySelectorAll('[data-doc-id]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const docId = cell.dataset.docId;
        const boxId = cell.dataset.boxId;
        const page = Number(cell.dataset.page) || 1;
        if (!docId) return;
        this.activeDocId = docId;
        this.currentPage = page;
        this.pulsingBoxId = boxId || null;
        this.renderAll();
      });
    });
  }

  exportSpreadsheet(format = 'xlsx') {
    const project = this.getActiveProject();
    if (!project || !window.XLSX) {
      alert('No data available to export.');
      return;
    }

    const dynamicCols = this.getAllSpreadsheetColumns();
    const rowsByDoc = this.documents.map((doc) => {
      const docTypeObj =
        DOCUMENT_TYPES.find((t) => t.id === doc.docType) ||
        DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
      const row = {
        Client_Project: project.name,
        Document: doc.name,
        Triage_Status: doc.triageStatus,
        Document_Type: docTypeObj.label,
        Extraction_Method: doc.extractionMethod
      };
      for (const col of dynamicCols) {
        const f = (doc.extractedFields || []).find((x) => x.column === col);
        row[col] = f ? f.value : '';
      }
      return row;
    });

    const wb = window.XLSX.utils.book_new();
    const ws1 = window.XLSX.utils.json_to_sheet(rowsByDoc);
    window.XLSX.utils.book_append_sheet(wb, ws1, 'By_Document');

    // Sheet 2: Consolidated summary
    const summaryRows = dynamicCols.map((col) => {
      const matching = [];
      for (const doc of this.documents) {
        for (const f of doc.extractedFields || []) {
          if (f.column === col) matching.push({ doc, field: f });
        }
      }
      const allNumeric = matching.every((m) => typeof m.field.value === 'number');
      const val =
        allNumeric && col !== 'Tax_Year' && col !== 'Tax_ID_SPI'
          ? matching.reduce((acc, m) => acc + Number(m.field.value || 0), 0)
          : Array.from(new Set(matching.map((m) => m.field.value))).join(' | ');
      return {
        Tax_Column: col,
        Description: matching[0]?.field?.label || col,
        Consolidated_Value: val,
        Source_Document_Count: matching.length,
        Sources: matching.map((m) => `${m.doc.name} (${m.field.value})`).join('; ')
      };
    });
    const ws2 = window.XLSX.utils.json_to_sheet(summaryRows);
    window.XLSX.utils.book_append_sheet(wb, ws2, 'Client_Summary');

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    if (format === 'csv') {
      window.XLSX.writeFile(wb, `${safeName}_Export.csv`, { bookType: 'csv' });
    } else {
      window.XLSX.writeFile(wb, `${safeName}_Export.xlsx`);
    }
  }

  // ============================================================================
  // EVENT BINDINGS & MODALS
  // ============================================================================

  bindGlobalEvents() {
    // Project selector
    document.getElementById('project-select')?.addEventListener('change', (e) => {
      this.selectProject(e.target.value);
    });

    // Delete current project
    document.getElementById('delete-project-btn')?.addEventListener('click', async () => {
      const proj = this.getActiveProject();
      if (!proj) return;
      if (confirm(`Delete client project "${proj.name}" and all its documents?`)) {
        await db.deleteProject(proj.id);
        this.projects = await db.getAllProjects();
        if (this.projects.length === 0) {
          await this.createDemoProject();
        } else {
          await this.selectProject(this.projects[0].id);
        }
      }
    });

    // Quick add files to current project
    const quickFileInput = document.getElementById('quick-file-input');
    document.getElementById('add-files-btn')?.addEventListener('click', () => {
      quickFileInput?.click();
    });
    quickFileInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        await this.ingestFileObjects(files);
        quickFileInput.value = '';
      }
    });

    // Sidebar filter tabs
    document.querySelectorAll('.filter-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.queueFilter = btn.dataset.filter;
        this.renderSidebarQueue();
      });
    });

    // Viewer toolbar controls
    document.getElementById('prev-page-btn')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderDocumentViewer();
      }
    });
    document.getElementById('next-page-btn')?.addEventListener('click', () => {
      const doc = this.getActiveDocument();
      if (doc && this.currentPage < (doc.numPages || 1)) {
        this.currentPage++;
        this.renderDocumentViewer();
      }
    });
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
      this.zoomScale = Math.max(0.5, Number((this.zoomScale - 0.15).toFixed(2)));
      this.renderDocumentViewer();
    });
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
      this.zoomScale = Math.min(2.5, Number((this.zoomScale + 0.15).toFixed(2)));
      this.renderDocumentViewer();
    });
    document.getElementById('overlay-mode-select')?.addEventListener('change', (e) => {
      this.overlayMode = e.target.value;
      const doc = this.getActiveDocument();
      if (doc) this.renderBoundingBoxOverlay(doc);
    });
    document.getElementById('viewer-force-ocr-btn')?.addEventListener('click', () => {
      this.reprocessActiveDocument({ forceOcr: true });
    });

    // Inspector classification controls
    document.getElementById('inspector-doctype-select')?.addEventListener('change', async (e) => {
      const doc = this.getActiveDocument();
      if (!doc) return;
      doc.docType = e.target.value;
      await db.saveDocument(doc);
      this.renderAll();
    });

    document.getElementById('inspector-triage-select')?.addEventListener('change', async (e) => {
      const doc = this.getActiveDocument();
      if (!doc) return;
      doc.triageStatus = e.target.value;
      await db.saveDocument(doc);
      this.renderAll();
    });

    // Inspector tabs
    document.querySelectorAll('.inspector-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.inspectorTab = tab.dataset.tab;
        this.renderInspector();
      });
    });

    // Drawer controls
    document.getElementById('toggle-drawer-btn')?.addEventListener('click', () => {
      this.drawerCollapsed = !this.drawerCollapsed;
      this.renderSpreadsheetDrawer();
    });
    document.getElementById('spreadsheet-mode-select')?.addEventListener('change', (e) => {
      this.spreadsheetMode = e.target.value;
      this.renderSpreadsheetDrawer();
    });
    document.getElementById('export-xlsx-btn')?.addEventListener('click', () => {
      this.exportSpreadsheet('xlsx');
    });
    document.getElementById('export-csv-btn')?.addEventListener('click', () => {
      this.exportSpreadsheet('csv');
    });

    // --- Modal: New Client Project ---
    this.bindNewProjectModal();

    // --- Modal: Custom Rule Builder ---
    this.bindRuleModal();

    // --- Modal: Settings (Regex Baseline vs Local WebLLM) ---
    this.bindSettingsModal();
  }

  bindNewProjectModal() {
    const modal = document.getElementById('new-project-modal');
    const nameInput = document.getElementById('new-project-name');
    const yearInput = document.getElementById('new-project-year');
    const notesInput = document.getElementById('new-project-notes');
    const fileInput = document.getElementById('new-project-files');
    const dropzone = document.getElementById('new-project-dropzone');
    const fileCountLabel = document.getElementById('new-project-file-list');

    const updatePendingLabel = () => {
      if (!fileCountLabel) return;
      if (this.newProjectPendingFiles.length === 0) {
        fileCountLabel.textContent = 'No files selected yet (you can also add files later).';
      } else {
        fileCountLabel.innerHTML = `<strong>${this.newProjectPendingFiles.length} file(s) ready:</strong> ${this.newProjectPendingFiles
          .map((f) => this.escapeHtml(f.name))
          .join(', ')}`;
      }
    };

    document.getElementById('new-project-btn')?.addEventListener('click', () => {
      this.newProjectPendingFiles = [];
      if (nameInput) nameInput.value = '';
      if (yearInput) yearInput.value = '2025';
      if (notesInput) notesInput.value = '';
      updatePendingLabel();
      modal?.classList.remove('hidden');
      nameInput?.focus();
    });

    document.getElementById('close-new-project-modal')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const dropped = Array.from(e.dataTransfer?.files || []);
      this.newProjectPendingFiles.push(...dropped);
      updatePendingLabel();
    });

    fileInput?.addEventListener('change', (e) => {
      const picked = Array.from(e.target.files || []);
      this.newProjectPendingFiles.push(...picked);
      updatePendingLabel();
    });

    document.getElementById('load-sample-batch-btn')?.addEventListener('click', async () => {
      const sampleFiles = await generateSampleFrenchTaxFiles();
      this.newProjectPendingFiles.push(...sampleFiles);
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = 'Sample Client — French Tax File';
      }
      updatePendingLabel();
    });

    document.getElementById('create-project-submit-btn')?.addEventListener('click', async () => {
      const name = (nameInput?.value || '').trim() || `Client ${new Date().toLocaleDateString('en-US')}`;
      const taxYear = (yearInput?.value || '2025').trim();
      const notes = (notesInput?.value || '').trim();

      const project = {
        id: `proj_${Date.now()}`,
        name,
        taxYear,
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await db.saveProject(project);
      this.projects = await db.getAllProjects();
      modal?.classList.add('hidden');
      await this.selectProject(project.id);

      if (this.newProjectPendingFiles.length > 0) {
        await this.ingestFileObjects(this.newProjectPendingFiles);
        this.newProjectPendingFiles = [];
      }
    });
  }

  bindRuleModal() {
    const modal = document.getElementById('rule-modal');
    const colInput = document.getElementById('rule-column-input');
    const labelInput = document.getElementById('rule-label-input');
    const anchorInput = document.getElementById('rule-anchor-input');
    const listEl = document.getElementById('custom-rules-list');

    const renderRulesList = () => {
      if (!listEl) return;
      if (this.customRules.length === 0) {
        listEl.innerHTML = `<div style="font-size:11.5px; color:var(--text-muted);">No custom rules saved yet.</div>`;
        return;
      }
      listEl.innerHTML = this.customRules
        .map(
          (r) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-app); padding:6px 10px; border-radius:6px; border:1px solid var(--border-subtle);">
            <div>
              <strong style="color:#38bdf8; font-family:var(--font-mono);">${this.escapeHtml(r.column)}</strong>
              <span style="font-size:11px; color:var(--text-secondary);"> — Keyword: "${this.escapeHtml(
                r.anchorKeyword || r.pattern
              )}"</span>
            </div>
            <button class="btn btn-sm btn-danger" data-del-rule="${r.id}">Delete</button>
          </div>
        `
        )
        .join('');

      listEl.querySelectorAll('[data-del-rule]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await db.deleteCustomRule(btn.dataset.delRule);
          this.customRules = await db.getCustomRules();
          renderRulesList();
        });
      });
    };

    document.getElementById('open-rule-modal-btn')?.addEventListener('click', () => {
      renderRulesList();
      modal?.classList.remove('hidden');
    });

    document.getElementById('close-rule-modal')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    document.getElementById('save-custom-rule-btn')?.addEventListener('click', async () => {
      const col = slugifyColumnName(colInput?.value.trim() || '');
      const label = labelInput?.value.trim() || col;
      const anchor = anchorInput?.value.trim() || '';
      if (!col || !anchor) {
        alert('Please provide both a spreadsheet column name and the keyword/phrase preceding the amount.');
        return;
      }
      const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const pattern = `${escapedAnchor}[^\\d\\n\\r-]{0,45}(-?\\d{1,3}(?:[\\s\\u00A0.]\\d{3})*(?:[,.]\\d{1,2})?)`;

      const newRule = {
        id: `crule_${Date.now()}`,
        column: col,
        label,
        anchorKeyword: anchor,
        pattern,
        type: 'amount',
        isCustom: true
      };

      await db.saveCustomRule(newRule);
      this.customRules = await db.getCustomRules();
      if (colInput) colInput.value = '';
      if (labelInput) labelInput.value = '';
      if (anchorInput) anchorInput.value = '';
      renderRulesList();
      await this.reprocessActiveDocument();
    });
  }

  bindSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const useLlmCheckbox = document.getElementById('setting-use-llm');
    const autoLlmCheckbox = document.getElementById('setting-auto-llm');
    const modelSelect = document.getElementById('setting-llm-model');
    const gpuStatusEl = document.getElementById('webgpu-status-box');
    const preloadBtn = document.getElementById('preload-llm-btn');

    const populateSettingsUI = async () => {
      if (useLlmCheckbox) useLlmCheckbox.checked = !!this.settings.useLocalLLM;
      if (autoLlmCheckbox) autoLlmCheckbox.checked = !!this.settings.autoRunLLMOnNonStandard;
      if (modelSelect) {
        modelSelect.innerHTML = AVAILABLE_LOCAL_MODELS.map(
          (m) =>
            `<option value="${m.id}" ${m.id === this.settings.llmModelId ? 'selected' : ''}>
              ${m.name} (${m.downloadSize} | ${m.vramEstimate})
            </option>`
        ).join('');
      }

      if (gpuStatusEl) {
        const gpu = await llmEngine.checkWebGPUSupport();
        gpuStatusEl.innerHTML = gpu.supported
          ? `✅ <strong>WebGPU Available:</strong> ${this.escapeHtml(gpu.adapterName)} — Ready for on-device local LLM inference.`
          : `⚠️ <strong>WebGPU Unavailable:</strong> ${this.escapeHtml(gpu.reason)} (The Regex Baseline engine remains 100% operational).`;
      }
    };

    document.getElementById('open-settings-btn')?.addEventListener('click', () => {
      populateSettingsUI();
      modal?.classList.remove('hidden');
    });

    document.getElementById('close-settings-modal')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    preloadBtn?.addEventListener('click', async () => {
      const modelId = modelSelect?.value || this.settings.llmModelId;
      preloadBtn.disabled = true;
      try {
        await llmEngine.ensureLoaded(modelId, (prog) => {
          if (gpuStatusEl) {
            gpuStatusEl.innerHTML = `⏳ <strong>Downloading / Initializing WebLLM:</strong> ${this.escapeHtml(
              prog.text
            )}`;
          }
        });
        if (gpuStatusEl) {
          gpuStatusEl.innerHTML = `✅ <strong>Model Loaded into GPU Memory:</strong> ${this.escapeHtml(
            modelId
          )}`;
        }
      } catch (err) {
        if (gpuStatusEl) {
          gpuStatusEl.innerHTML = `❌ <strong>Error:</strong> ${this.escapeHtml(err.message)}`;
        }
      } finally {
        preloadBtn.disabled = false;
      }
    });

    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
      this.settings.useLocalLLM = !!useLlmCheckbox?.checked;
      this.settings.autoRunLLMOnNonStandard = !!autoLlmCheckbox?.checked;
      this.settings.llmModelId = modelSelect?.value || AVAILABLE_LOCAL_MODELS[0].id;
      await db.saveSettings(this.settings);
      modal?.classList.add('hidden');
      this.renderTopBar();
    });
  }

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new TaxWorkbenchApp();
  app.init();
});
