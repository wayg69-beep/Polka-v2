'use strict';

/* ==========================================================
   cover-cache.js — Кэш обложек (IndexedDB) + ensureCover / ensureManualCover
   ========================================================== */

/* ============ КЭШ ОБЛОЖЕК (IndexedDB) ============ */
const CoverCache = {
  dbName: 'polka_covers',
  store: 'covers',
  _db: null,

  open(){
    if(this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains(this.store)){
          db.createObjectStore(this.store);
        }
      };
      req.onsuccess = e => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = e => reject(e.target.error);
    });
  },
  async put(key, blob){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).put(blob, key).onsuccess = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async get(key){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readonly');
      const req = tx.objectStore(this.store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = e => reject(e.target.error);
    });
  },
  async count(){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readonly');
      const req = tx.objectStore(this.store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  },
  async size(){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readonly');
      let total = 0;
      const req = tx.objectStore(this.store).openCursor();
      req.onsuccess = e => {
        const cur = e.target.result;
        if(cur){
          if(cur.value && cur.value.size) total += cur.value.size;
          cur.continue();
        } else {
          resolve(total);
        }
      };
      req.onerror = e => reject(e.target.error);
    });
  },
    async clear(){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).clear().onsuccess = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async deleteKey(key){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).delete(key).onsuccess = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async deleteForItem(id){
    if(!id) return;
    try {
      await this.deleteKey(id + '_card');
      await this.deleteKey(id + '_full');
    } catch(e){
      console.log('Cache delete failed for ' + id + ': ' + e.message);
    }
  },
  async pruneOrphans(validIds){
    try {
      const db = await this.open();
      const validSet = new Set(validIds);
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.store, 'readwrite');
        const store = tx.objectStore(this.store);
        let removed = 0;
        const req = store.openCursor();
        req.onsuccess = e => {
          const cur = e.target.result;
          if(cur){
            const key = String(cur.key);
            const m = key.match(/^(.+)_(card|full)$/);
            const baseId = m ? m[1] : key;
            if(!validSet.has(baseId)){
              cur.delete();
              removed++;
            }
            cur.continue();
          } else {
            resolve(removed);
          }
        };
        req.onerror = e => reject(e.target.error);
      });
    } catch(e){
      console.log('Prune failed: ' + e.message);
      return 0;
    }
  }
};
  
  // Гарантирует, что blob для ключа есть в кэше.
// Если нет — скачивает через wsrv.nl, кладёт в кэш, возвращает blob URL.
const _coverTriedThisSession = new Set();
const _coverBlobUrls = new Map(); // key → blobURL или dataURL (на мобиле)
const _manualUrlsOk = new Set();  // прямые URL, которые уже успешно грузились в DOM

// На мобиле Chrome при memory pressure revoke'ает blob URLs — карточки
// остаются с протухшим src и показывают серый фон. Data URL не протухает:
// это просто строка в JS-памяти. На десктопе blob URLs работают, не трогаем.
const IS_MOBILE = window.innerWidth < 700;

function blobToDataUrl(blob){
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// Создаёт URL для <img>: на мобиле data:, на десктопе blob:
async function makeCoverUrl(blob){
  if(!blob || blob.size === 0) return null;
  if(IS_MOBILE) return await blobToDataUrl(blob);
  return URL.createObjectURL(blob);
}

function getCachedCoverUrl(key, originalUrl){
  const u = _coverBlobUrls.get(key);
  if(u) return u;
  if(originalUrl && _manualUrlsOk.has(originalUrl)) return originalUrl;
  return '';
}

async function ensureCover(key, url, width, blur){
  if(!url) return null;
  // Уже пробовали в этой сессии — не ходим в IndexedDB повторно
  if(_coverBlobUrls.has(key)){
    const cached = _coverBlobUrls.get(key);
    return cached || null;
  }
  try {
    const cachedBlob = await CoverCache.get(key);
if(cachedBlob && cachedBlob.size > 0){
  const blobUrl = await makeCoverUrl(cachedBlob);
  if(blobUrl){
    _coverBlobUrls.set(key, blobUrl);
    return blobUrl;
  }
}
    if(_coverTriedThisSession.has(key)){
  // Не пишем null в _coverBlobUrls — иначе при следующем рендере
  // getCachedCoverUrl вернёт пустую строку и обложка будет грузиться снова.
  return null;
    }
    _coverTriedThisSession.add(key);

      const proxied = coverProxy(url, width, blur);
  let resp;
  try { resp = await fetch(proxied, { mode: 'cors' }); }
  catch(e){ return null; }
  if(!resp.ok){ return null; }
  const blob = await resp.blob();
if(!blob || blob.size === 0){ return null; }
await CoverCache.put(key, blob);
const blobUrl = await makeCoverUrl(blob);
if(!blobUrl) return null;
_coverBlobUrls.set(key, blobUrl);
return blobUrl;
} catch(e){
  return null;
  }
}

async function ensureManualCover(key, url, width){
if(!url) return null;
if(_coverBlobUrls.has(key)) return _coverBlobUrls.get(key) || null;
const keep = async (blob, alreadyStored) => {
  if(!blob || blob.size === 0) return null;
  if(!alreadyStored){
    try { await CoverCache.put(key, blob); } catch(e){}
  }
  const blobUrl = await makeCoverUrl(blob);
  if(!blobUrl) return null;
  _coverBlobUrls.set(key, blobUrl);
  return blobUrl;
};
  try {
    const stored = await CoverCache.get(key);
    if(stored && stored.size > 0) return await keep(stored, true);
  } catch(e){}

  // Для knigi.ws сразу идём в polka-proxy (wsrv.nl и прямой fetch там блокируются).
  // Это избавляет от 3-секундного ожидания таймаута при первом рендере.
  if(/knigi\.ws/i.test(url)){
    try {
      const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(proxyUrl, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(timer);
      if(r.ok){ const u = await keep(await r.blob(), false); if(u) return u; }
    } catch(e){}
  }

// Для остальных доменов сначала пробуем wsrv.nl (он быстрый и кэширует)
if(!/^data:/i.test(url) && !/knigi\.ws/i.test(url)){
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(coverProxy(url, width || 0), { mode: 'cors', signal: ctrl.signal });
    clearTimeout(timer);
    if(r.ok){ const u = await keep(await r.blob(), false); if(u) return u; }
  } catch(e){}
}

// 2. Пробуем наш личный Cloudflare Worker (обходит блокировки knigi.ws)
if(!/^data:/i.test(url)){
  try {
    const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(proxyUrl, { mode: 'cors', signal: ctrl.signal });
    clearTimeout(timer);
    if(r.ok){ const u = await keep(await r.blob(), false); if(u) return u; }
  } catch(e){}
}

// 3. Прямая загрузка (на случай, если оба прокси упали)
try {
  const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if(r.ok){ const u = await keep(await r.blob(), false); if(u) return u; }
} catch(e){}
return null;
}
