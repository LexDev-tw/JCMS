/**
 * 勘驗附件「程式化匯入」佇列：寫入與讀取皆經 IndexedDB，供影片截圖分頁與勘驗附件分頁跨 tab 傳遞。
 * 須在 inspection-layout-app.jsx、video-inspection-app.jsx 之前載入。
 */
(function (global) {
  const DB_NAME = 'jcms_inspection_import_v1';
  const STORE = 'items';
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('seq', 'seq', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  /**
   * @param {File[]|Blob[]} files 已為 image/*，順序即匯入順序
   */
  global.__jcmsQueueInspectionImportFiles = async function __jcmsQueueInspectionImportFiles(files) {
    const arr = Array.from(files || []).filter((f) => {
      const t = f && (f.type || '');
      return typeof t === 'string' && t.startsWith('image/');
    });
    if (!arr.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const clearReq = st.clear();
      clearReq.onerror = () => reject(clearReq.error);
      clearReq.onsuccess = () => {
        let seq = 0;
        arr.forEach((file) => {
          const name = file.name || `import_${seq}.png`;
          const mime = file.type || 'image/png';
          const blob = file instanceof Blob ? file : new Blob([file], { type: mime });
          st.add({ seq: seq++, name, blob, mime });
        });
      };
      tx.oncomplete = () => {
        try { db.close(); } catch (e) { /* ignore */ }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  };

  /** @returns {Promise<File[]>} 依 seq 排序；讀取後清空 store */
  global.__jcmsDrainInspectionImportQueueAsFiles = async function __jcmsDrainInspectionImportQueueAsFiles() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const req = st.getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const rows = (req.result || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
        const files = rows.map((row) => {
          const blob = row.blob;
          const name = row.name || 'import.png';
          const mime = row.mime || 'image/png';
          try {
            return new File([blob], name, { type: mime, lastModified: Date.now() });
          } catch (e) {
            return new File([blob], name, { type: mime });
          }
        });
        st.clear();
        tx.oncomplete = () => {
          try { db.close(); } catch (e2) { /* ignore */ }
          resolve(files);
        };
      };
      tx.onerror = () => reject(tx.error);
    });
  };
}(typeof window !== 'undefined' ? window : globalThis));
