const DB_NAME = 'checklist_offline';
const STORE = 'queue';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOffline(payload) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({
      ...payload,
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOffline() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOffline(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Gửi lại các bản chờ khi có mạng */
export async function flushOfflineQueue(submitFn) {
  const items = await listOffline();
  for (const item of items) {
    try {
      const fd = new FormData();
      Object.entries(item.fields || {}).forEach(([k, v]) => fd.append(k, v));
      if (item.photoBlob) {
        fd.append('photo', item.photoBlob, 'offline.jpg');
      }
      await submitFn(fd);
      await removeOffline(item.id);
    } catch (e) {
      console.warn('Offline flush failed', e);
      break;
    }
  }
}
