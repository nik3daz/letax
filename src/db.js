// IndexedDB Storage Layer for French Tax Document Workbench
// Stores Client Projects, Document Blobs, Extraction Results, Custom Rules, and Settings

const DB_NAME = 'FrenchTaxWorkbenchDB';
const DB_VERSION = 1;

class WorkbenchDB {
  constructor() {
    this.dbPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Projects store (per-client)
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Documents store (metadata + extracted results + binary blob)
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('projectId', 'projectId', { unique: false });
        }

        // Custom extraction rules store
        if (!db.objectStoreNames.contains('rules')) {
          db.createObjectStore('rules', { keyPath: 'id' });
        }

        // App settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async tx(storeName, mode = 'readonly') {
    const db = await this.dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // --- Projects ---
  async getAllProjects() {
    const store = await this.tx('projects');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveProject(project) {
    const store = await this.tx('projects', 'readwrite');
    project.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
      const req = store.put(project);
      req.onsuccess = () => resolve(project);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteProject(projectId) {
    const docs = await this.getDocumentsByProject(projectId);
    for (const d of docs) {
      await this.deleteDocument(d.id);
    }
    const store = await this.tx('projects', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(projectId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Documents ---
  async getDocumentsByProject(projectId) {
    const store = await this.tx('documents');
    const index = store.index('projectId');
    return new Promise((resolve, reject) => {
      const req = index.getAll(projectId);
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getDocument(docId) {
    const store = await this.tx('documents');
    return new Promise((resolve, reject) => {
      const req = store.get(docId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveDocument(doc) {
    const store = await this.tx('documents', 'readwrite');
    doc.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
      const req = store.put(doc);
      req.onsuccess = () => resolve(doc);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteDocument(docId) {
    const store = await this.tx('documents', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(docId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Custom Rules ---
  async getCustomRules() {
    const store = await this.tx('rules');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveCustomRule(rule) {
    const store = await this.tx('rules', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(rule);
      req.onsuccess = () => resolve(rule);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteCustomRule(ruleId) {
    const store = await this.tx('rules', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(ruleId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Settings ---
  async getSettings() {
    const store = await this.tx('settings');
    return new Promise((resolve) => {
      const req = store.get('appSettings');
      req.onsuccess = () => {
        resolve(
          req.result?.value || {
            useLocalLLM: false,
            autoRunLLMOnNonStandard: false,
            llmModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
            ocrLanguage: 'fra',
            forceOcrThresholdChars: 40,
            defaultOverlayMode: 'highlights' // 'all' | 'highlights' | 'mapped' | 'none'
          }
        );
      };
      req.onerror = () => resolve({});
    });
  }

  async saveSettings(value) {
    const store = await this.tx('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key: 'appSettings', value });
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }
}

export const db = new WorkbenchDB();
