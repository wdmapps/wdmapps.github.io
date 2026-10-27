let connection;
export function openStorage() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Este navegador não oferece armazenamento para os anúncios. Use outro navegador.'));
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('wdm-vendezap-web', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => reject(new Error('Feche outras abas do VendeZap e tente novamente.'));
  });
  return connection;
}
export async function readState() {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const request = db.transaction('data', 'readonly').objectStore('data').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeState(value) {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('data', 'readwrite');
    transaction.objectStore('data').put(value, 'state');
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar.'));
  });
}
