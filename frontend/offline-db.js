(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  const DB_NAME = "yolowisata-offline";
  const DB_VERSION = 1;

  function openOfflineDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const request = root.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("postcards")) {
          const postcards = db.createObjectStore("postcards", { keyPath: "id" });
          postcards.createIndex("by_business_id", "business_id", { unique: false });
          postcards.createIndex("by_created_at", "created_at", { unique: false });
          postcards.createIndex("by_sync_status", "sync_status", { unique: false });
        }

        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "id" });
          outbox.createIndex("by_status", "status", { unique: false });
          outbox.createIndex("by_entity_id", "entity_id", { unique: false });
          outbox.createIndex("by_created_at", "created_at", { unique: false });
          outbox.createIndex("by_type", "type", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open offline database."));
    });
  }

  function getStore(db, storeName, mode = "readonly") {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function readAll(store) {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Failed to read values."));
    });
  }

  function readOne(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Failed to read item."));
    });
  }

  function writeOne(store, value) {
    return new Promise((resolve, reject) => {
      const request = store.put(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error || new Error("Failed to write item."));
    });
  }

  function deleteOne(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error("Failed to delete item."));
    });
  }

  async function saveLocalPostcard(postcard) {
    if (!postcard || !postcard.id) {
      throw new Error("A postcard requires an id.");
    }

    const db = await openOfflineDB();
    const store = getStore(db, "postcards", "readwrite");
    const record = {
      ...postcard,
      sync_status: postcard.sync_status || "pending",
      created_at: postcard.created_at || new Date().toISOString()
    };
    return writeOne(store, record);
  }

  async function getLocalPostcards() {
    const db = await openOfflineDB();
    const store = getStore(db, "postcards", "readonly");
    return readAll(store);
  }

  async function getLocalPostcard(id) {
    const db = await openOfflineDB();
    const store = getStore(db, "postcards", "readonly");
    return readOne(store, id);
  }

  async function enqueueOperation(operation) {
    if (!operation || !operation.id || !operation.type) {
      throw new Error("An outbox operation requires an id and type.");
    }

    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readwrite");
    const record = {
      ...operation,
      status: operation.status || "pending",
      attempts: Number(operation.attempts || 0),
      created_at: operation.created_at || new Date().toISOString(),
      last_error: operation.last_error || null
    };

    return writeOne(store, record);
  }

  async function getPendingOperations() {
    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readonly");
    const all = await readAll(store);
    return all.filter((item) => item.status === "pending" || item.status === "syncing");
  }

  async function updateOperation(operation) {
    if (!operation || !operation.id) {
      throw new Error("An outbox operation requires an id.");
    }

    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readwrite");
    return writeOne(store, operation);
  }

  async function markOperationSynced(id) {
    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readwrite");
    const existing = await readOne(store, id);

    if (!existing) {
      return null;
    }

    const next = { ...existing, status: "synced", last_error: null };
    await writeOne(store, next);
    return next;
  }

  async function markOperationFailed(id, error, permanent = false) {
    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readwrite");
    const existing = await readOne(store, id);

    if (!existing) {
      return null;
    }

    const attempts = Number(existing.attempts || 0) + 1;
    const next = {
      ...existing,
      status: permanent ? "failed_permanent" : "pending",
      attempts,
      last_error: error && error.message ? error.message : String(error)
    };

    await writeOne(store, next);
    return next;
  }

  async function removeOperation(id) {
    const db = await openOfflineDB();
    const store = getStore(db, "outbox", "readwrite");
    return deleteOne(store, id);
  }

  async function clearOfflineData() {
    const db = await openOfflineDB();

    for (const storeName of ["postcards", "outbox"]) {
      const store = getStore(db, storeName, "readwrite");
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error || new Error("Failed to clear store: " + storeName));
      });
    }

    return true;
  }

  const api = {
    DB_NAME,
    DB_VERSION,
    openOfflineDB,
    saveLocalPostcard,
    getLocalPostcards,
    getLocalPostcard,
    enqueueOperation,
    getPendingOperations,
    updateOperation,
    markOperationSynced,
    markOperationFailed,
    removeOperation,
    clearOfflineData
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof root !== "undefined") {
    root.YOLO_OFFLINE_DB = api;
  }
})();
