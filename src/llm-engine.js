// Optional On-Device WebLLM (WebGPU) Engine for French Tax Document Extraction
// Dynamically loaded ONLY when enabled in App Settings. Baseline Regex works with 0 LLM overhead.

import { findBestTokenBox, parseFrenchNumber, slugifyColumnName } from './french-tax-rules.js';

export const AVAILABLE_LOCAL_MODELS = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct (4-bit)',
    vramEstimate: '~1.2 GB VRAM',
    downloadSize: '~950 MB (cached in browser)',
    speed: 'Fast (~45 tok/s)',
    recommended: true
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B Instruct (4-bit)',
    vramEstimate: '~900 MB VRAM',
    downloadSize: '~750 MB (cached in browser)',
    speed: 'Very Fast (~60 tok/s)',
    recommended: false
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B Instruct (4-bit)',
    vramEstimate: '~2.4 GB VRAM',
    downloadSize: '~1.9 GB (cached in browser)',
    speed: 'High Accuracy (~28 tok/s)',
    recommended: false
  }
];

class LocalLLMEngine {
  constructor() {
    this.engine = null;
    this.loadedModelId = null;
    this.isLoading = false;
    this.statusText = 'Not loaded (Regex Baseline Mode active)';
    this.progressPct = 0;
  }

  async checkWebGPUSupport() {
    if (!navigator.gpu) {
      return {
        supported: false,
        reason: 'WebGPU not detected in this browser. Use a recent version of Chrome, Edge, or Brave.'
      };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return {
          supported: false,
          reason: 'No WebGPU-compatible GPU adapter found.'
        };
      }
      const info = adapter.info || {};
      return {
        supported: true,
        adapterName: info.description || info.vendor || 'WebGPU-compatible GPU'
      };
    } catch (err) {
      return {
        supported: false,
        reason: err.message || 'Error checking WebGPU support'
      };
    }
  }

  async ensureLoaded(modelId, onProgress = () => {}) {
    if (this.engine && this.loadedModelId === modelId) {
      return this.engine;
    }
    if (this.isLoading) {
      throw new Error('A local LLM model is already loading...');
    }

    const gpuCheck = await this.checkWebGPUSupport();
    if (!gpuCheck.supported) {
      throw new Error(gpuCheck.reason);
    }

    this.isLoading = true;
    this.progressPct = 0;
    this.statusText = `Importing WebLLM and loading ${modelId}...`;
    onProgress({ text: this.statusText, progress: 0.02 });

    try {
      const webllm = await import('https://esm.run/@mlc-ai/web-llm');
      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          this.statusText = report.text || 'Loading model...';
          this.progressPct = Math.round((report.progress || 0) * 100);
          onProgress({
            text: this.statusText,
            progress: report.progress || 0
          });
        }
      });
      this.loadedModelId = modelId;
      this.isLoading = false;
      this.statusText = `Active Model: ${modelId}`;
      return this.engine;
    } catch (err) {
      this.isLoading = false;
      this.statusText = `LLM Error: ${err.message}`;
      throw err;
    }
  }

  /**
   * Run on-device LLM extraction over the OCR/PDF text of a French tax document
   */
  async extractFieldsWithLLM(fullText, tokens = [], modelId, onProgress = () => {}) {
    const engine = await this.ensureLoaded(modelId, onProgress);
    const truncatedText = (fullText || '').slice(0, 5500);

    const systemPrompt = `You are a French tax specialist assistant. Analyze the extracted OCR text of a French tax or financial document.
Respond ONLY with a valid JSON object (no markdown wrappers) matching this schema:
{
  "docType": "avis_impot" | "decl_2042" | "ifu_2561" | "bulletin_paie" | "taxe_fonciere" | "facture_charge" | "non_standard",
  "summary": "short English description of the document",
  "fields": [
    {
      "column": "Short_English_Column_Name",
      "label": "Clear English explanation of the field",
      "rawValue": "exact value as written in the document text",
      "cerfaCode": "3-letter Cerfa box code e.g. 1AJ, 2DC, or null"
    }
  ]
}`;

    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Document text:\n${truncatedText}` }
      ],
      temperature: 0.1,
      max_tokens: 700
    });

    const rawReply = response?.choices?.[0]?.message?.content || '{}';
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('The local LLM did not return valid JSON.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const llmFields = (parsed.fields || []).map((f) => {
      const col = slugifyColumnName(f.column || f.label || 'LLM_Field');
      const rawVal = String(f.rawValue ?? '').trim();
      const numVal = parseFrenchNumber(rawVal);
      const matchedBox = findBestTokenBox(tokens, rawVal, f.label || '');

      return {
        id: `llm_${col}_${Math.random().toString(36).slice(2, 7)}`,
        column: col,
        label: f.label || col,
        rawValue: rawVal,
        value: numVal !== null ? numVal : rawVal,
        sourceMethod: 'Local LLM',
        confidence: 0.88,
        cerfaCode: f.cerfaCode || null,
        verified: false,
        contextLine: `[LLM] ${f.label || col}: ${rawVal}`,
        boxId: matchedBox?.id || null,
        page: matchedBox?.page || 1
      };
    });

    return {
      docType: parsed.docType || null,
      summary: parsed.summary || '',
      fields: llmFields
    };
  }
}

export const llmEngine = new LocalLLMEngine();
