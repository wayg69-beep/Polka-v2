'use strict';

/* ==========================================================
   screenshots.js — Скриншоты и OCR-галерея
   ========================================================== */

/* ═══════════════════════════════════════════════
   СКРИНШОТЫ / OCR ГАЛЕРЕЯ — ядро
   ═══════════════════════════════════════════════ */

const ScreenshotsDB = {
  dbName: 'polka_screenshots',
  store: 'screens',
  _db: null,
  _urls: new Map(),

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.store)) {
          db.createObjectStore(this.store, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
      req.onerror = e => reject(e.target.error);
    });
  },

  async put(record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).put(record).onsuccess = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },

  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readonly');
      const req = tx.objectStore(this.store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = e => reject(e.target.error);
    });
  },

  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).delete(id).onsuccess = () => {
        const url = this._urls.get(id);
        if (url) { try { URL.revokeObjectURL(url); } catch(e){} this._urls.delete(id); }
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
    });
  },

  async getAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readonly');
      const req = tx.objectStore(this.store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  },

  urlFor(record) {
    let u = this._urls.get(record.id);
    if (u) return u;
    u = URL.createObjectURL(record.blob);
    this._urls.set(record.id, u);
    return u;
  },

  getDimensions(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
      img.src = url;
    });
  }
};

/* ── Рендер сетки скриншотов ─────────────────── */
async function renderScreensGrid() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  if (!grid) return;

  const records = await ScreenshotsDB.getAll();
  records.sort((a, b) => b.createdAt - a.createdAt);

  empty.style.display = 'none';
  grid.classList.remove('sections-mode');
  grid.classList.add('screens-mode');

  let html = `
    <div class="screen-add-card" id="screenAddCard" title="Добавить скриншот">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </div>`;

  for (const rec of records) {
    let url = '';
    try { url = ScreenshotsDB.urlFor(rec); } catch(e){}
    html += `<div class="screen-card" data-id="${esc(rec.id)}"><img src="${url}" alt="" loading="lazy"></div>`;
  }

  grid.innerHTML = html;

  const addBtn = document.getElementById('screenAddCard');
  if (addBtn) addBtn.onclick = pickScreenshots;

  grid.querySelectorAll('.screen-card').forEach(card => {
    card.onclick = () => openScreenshotView(card.dataset.id);
  });
}

function pickScreenshots() {
  let inp = document.getElementById('_screenshotInput');
  if (!inp) {
    inp = document.createElement('input');
    inp.id = '_screenshotInput';
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.style.display = 'none';
    inp.onchange = async e => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      await addScreenshots(files);
      e.target.value = '';
    };
    document.body.appendChild(inp);
  }
  inp.click();
}

async function addScreenshots(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const dims = await ScreenshotsDB.getDimensions(file);
      await ScreenshotsDB.put({
        id: uid(),
        blob: file,
        width: dims.width,
        height: dims.height,
        createdAt: Date.now()
      });
      added++;
    } catch (e) {
      console.warn('[Screenshots] failed:', e);
    }
  }
  if (added) {
    toast(added === 1 ? 'Скриншот добавлен' : 'Добавлено: ' + added);
    renderScreensGrid();
  }
}

/* ── Модалка просмотра + зум ────────────────── */
let _screenshotIds = [];
let _screenshotIndex = -1;
let _currentScreenshot = null;
const _screenshotZoom = { scale: 1, baseScale: 1, tx: 0, ty: 0 };

function applyScreenshotZoom() {
  const wrap = document.getElementById('screenshotImgWrap');
  if (!wrap) return;
  const z = _screenshotZoom;
  wrap.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale / z.baseScale})`;
}

async function openScreenshotView(id) {
  // Запоминаем список всех скринов для свайпа
  const records = await ScreenshotsDB.getAll();
  records.sort((a, b) => b.createdAt - a.createdAt);
  _screenshotIds = records.map(r => r.id);
  _screenshotIndex = _screenshotIds.indexOf(id);

  const rec = await ScreenshotsDB.get(id);
  if (!rec) return;
  _currentScreenshot = rec;

  const modal = document.getElementById('screenshotView');
  const img = document.getElementById('screenshotImg');
  const wrap = document.getElementById('screenshotImgWrap');
  const overlay = document.getElementById('screenshotOcrOverlay');
  const stage = document.getElementById('screenshotStage');
  
  const url = ScreenshotsDB.urlFor(rec);
  img.src = url;

  overlay.innerHTML = '';
  overlay.classList.remove('active');
  document.getElementById('screenshotOcrHint').style.display = 'none';
  document.getElementById('screenshotOcrBtn').classList.remove('recording');

  _screenshotZoom.tx = 0;
  _screenshotZoom.ty = 0;

  modal.classList.add('on');

  requestAnimationFrame(() => {
    const sr = stage.getBoundingClientRect();
    const base = Math.min(sr.width / rec.width, sr.height / rec.height);
    
    _screenshotZoom.baseScale = base;
    _screenshotZoom.scale = base;

    wrap.style.width = (rec.width * base) + 'px';
    wrap.style.height = (rec.height * base) + 'px';

    applyScreenshotZoom();
  });
}
  
function closeScreenshotView() {
  const modal = document.getElementById('screenshotView');
  if (modal) modal.classList.remove('on');
  _currentScreenshot = null;
}

/* ── Жесты: pinch + pan ─────────────────────── */
(function initScreenshotGestures() {
  const stage = document.getElementById('screenshotStage');
  if (!stage) return;

  let lastDist = 0, lastX = 0, lastY = 0, startX = 0, startY = 0;
  let startScale = 1, startTx = 0, startTy = 0;
  let isPinching = false, isPanning = false, isDraggingSelection = false;

  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  // Функция покраски слов
  const paintWord = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (el && el.classList.contains('ocr-line')) {
      el.classList.add('selected');
    }
  };

  stage.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      isPinching = true; isPanning = false;
      lastDist = dist(e.touches);
      startScale = _screenshotZoom.scale;
      return;
    } 
    
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;

      const overlay = document.getElementById('screenshotOcrOverlay');
      
      // Если OCR активен — включаем режим выделения
      if (overlay && overlay.classList.contains('active')) {
        isDraggingSelection = true;
        document.querySelectorAll('.ocr-line.selected').forEach(el => el.classList.remove('selected'));
        paintWord(startX, startY);
        return;
      }

      // Если не активен и не увеличен — готовимся к свайпу
      if (_screenshotZoom.scale <= _screenshotZoom.baseScale * 1.05) {
        isPanning = false; 
      } else {
        isPanning = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        startTx = _screenshotZoom.tx;
        startTy = _screenshotZoom.ty;
      }
    }
  }, { passive: false });

  stage.addEventListener('touchmove', e => {
    if (isPinching && e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const k = dist(e.touches) / lastDist;
      let ns = startScale * k;
      const minS = _screenshotZoom.baseScale;
      ns = Math.max(minS, Math.min(ns, minS * 5));
      _screenshotZoom.scale = ns;
      applyScreenshotZoom();
    } else if (isDraggingSelection && e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      paintWord(e.touches[0].clientX, e.touches[0].clientY);
    } else if (isPanning && e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      _screenshotZoom.tx = startTx + (e.touches[0].clientX - lastX);
      _screenshotZoom.ty = startTy + (e.touches[0].clientY - lastY);
      applyScreenshotZoom();
    }
  }, { passive: false });

  stage.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
      isPinching = false; 
      isPanning = false;

      // Если отпустили палец после выделения текста
      if (isDraggingSelection) {
        isDraggingSelection = false;
        const selectedEls = Array.from(document.querySelectorAll('.ocr-line.selected'));
        
        if (selectedEls.length > 0) {
          // Сортируем по порядку, чтобы слова не перемешались
          selectedEls.sort((a, b) => +a.dataset.i - +b.dataset.i);
          const combinedText = selectedEls.map(el => el.dataset.text).join(' ');
          
          showOcrPopup(combinedText);
          
          // Убираем выделение через полсекунды
          setTimeout(() => {
            document.querySelectorAll('.ocr-line.selected').forEach(el => el.classList.remove('selected'));
          }, 500);
        }
        return;
      }

      // Логика свайпа (если не увеличен)
      if (_screenshotZoom.scale <= _screenshotZoom.baseScale * 1.05) {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0 && _screenshotIndex > 0) {
            openScreenshotView(_screenshotIds[_screenshotIndex - 1]);
          } else if (dx < 0 && _screenshotIndex < _screenshotIds.length - 1) {
            openScreenshotView(_screenshotIds[_screenshotIndex + 1]);
          }
        }
      }
    } else if (e.touches.length === 1 && isPinching) {
      isPinching = false;
    }
  }, { passive: true });
})();
  
/* ── OCR (PaddleOCR через локальный пакет) ──── */
let _tesseractWorker = null;

async function loadTesseract() {
  if (_tesseractWorker) return _tesseractWorker;
  const Tesseract = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
  const createWorker = Tesseract.default.createWorker;
  
  _tesseractWorker = await createWorker(['rus', 'eng'], 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  await _tesseractWorker.setParameters({ tessedit_pageseg_mode: '11' }); // Sparse Text
  return _tesseractWorker;
}

async function runOcr() {
  if (!_currentScreenshot) return;
  const ocrBtn = document.getElementById('screenshotOcrBtn');
  ocrBtn.classList.add('recording');
  toast('Загружаю OCR...', 'success');

  try {
    const worker = await loadTesseract();
    toast('Распознаю текст...', 'success');

    // 1. Готовим картинку
    const img = new Image();
    img.src = ScreenshotsDB.urlFor(_currentScreenshot);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // 2. ПРЕПРОЦЕССИНГ: Инверсия цветов для темной темы
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = 255 - data[i];     // R
      data[i + 1] = 255 - data[i + 1]; // G
      data[i + 2] = 255 - data[i + 2]; // B
    }
    ctx.putImageData(imageData, 0, 0);

    // 3. Распознаем
    const { data: ocrData } = await worker.recognize(canvas, {}, { blocks: true });

    // 4. Фильтруем (порог снижен до 45, чтобы ловить мелкий текст)
    const words = (ocrData.words || []).filter(w => {
      if (!w.text || !w.text.trim()) return false;
      if (w.confidence < 45) return false;
      
      const cleanText = w.text.replace(/[^\p{L}\p{N}]/gu, '');
      if (cleanText.length < 2) return false;

      return true;
    });

    const overlay = document.getElementById('screenshotOcrOverlay');
    const hint = document.getElementById('screenshotOcrHint');

    if (!words.length) {
      toast('Текст не найден', 'warn');
      ocrBtn.classList.remove('recording');
      return;
    }

    const k = _screenshotZoom.baseScale;

    overlay.innerHTML = words.map((w, i) => {
      const b = w.bbox;
      const x0 = b.x0 * k;
      const y0 = b.y0 * k;
      const x1 = b.x1 * k;
      const y1 = b.y1 * k;
      const style = `left:${x0}px;top:${y0}px;width:${x1-x0}px;height:${y1-y0}px;`;
      return `<div class="ocr-line" data-i="${i}" data-text="${esc(w.text.trim())}" style="${style}"></div>`;
    }).join('');

    overlay.classList.add('active');
    hint.style.display = '';

  

    ocrBtn.classList.remove('recording');
    toast('Распознано: ' + words.length + ' слов');
  } catch (e) {
    console.error('[OCR]', e);
    toast('Ошибка OCR: ' + (e.message || 'проверь консоль'), 'error');
    ocrBtn.classList.remove('recording');
  }
}

  
/* ── Popup действий ─────────────────────────── */
function showOcrPopup(text) {
  const popup = document.getElementById('ocrPopup');
  const input = document.getElementById('ocrPopupInput');
  input.value = text || '';
  popup.classList.add('on');
  setTimeout(() => input.focus(), 100);
}
function closeOcrPopup() {
  document.getElementById('ocrPopup').classList.remove('on');
}

/* ── Модалка выбора типа/источника ──────────── */
const OCR_SOURCES = {
  movie:  [{key:'tmdb',label:'TMDB'},{key:'kinogo',label:'Kinogo'},{key:'manual',label:'Вручную'}],
  series: [{key:'tmdb',label:'TMDB'},{key:'kinogo',label:'Kinogo'},{key:'manual',label:'Вручную'}],
  drama:  [{key:'dorama',label:'Dorama.land'},{key:'tmdb',label:'TMDB'},{key:'manual',label:'Вручную'}],
  comic:  [{key:'anilist',label:'AniList'},{key:'slashlib',label:'Slashlib'},{key:'manual',label:'Вручную'}],
  book:   [{key:'knigi',label:'Knigi.ws'},{key:'flibusta',label:'Flibusta'},{key:'ficbook',label:'Ficbook'},{key:'fanfics',label:'Fanfics.me'},{key:'ao3',label:'AO3'},{key:'manual',label:'Вручную'}],
  music:  [{key:'manual',label:'Создать вручную'}]
};

let _ocrSearchState = { type: '', source: '', query: '' };

function openOcrSearchModal(query) {
  _ocrSearchState = { type: '', source: '', query: query || '' };
  const modal = document.getElementById('ocrSearchModal');
  const preview = document.getElementById('ocrQueryPreview');
  const typeSeg = document.getElementById('ocrTypeSeg');
  const sourceSeg = document.getElementById('ocrSourceSeg');
  const goBtn = document.getElementById('ocrSearchGo');

  preview.textContent = _ocrSearchState.query || '(пусто)';
  goBtn.disabled = true;

  typeSeg.innerHTML = Object.entries(TYPES).map(([k, v]) =>
    `<button type="button" data-v="${k}">${v.icon} ${v.label}</button>`
  ).join('');

  sourceSeg.innerHTML = '<span style="opacity:0.5;font-size:13px;">Сначала выбери тип</span>';

  typeSeg.onclick = e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    _ocrSearchState.type = b.dataset.v;
    _ocrSearchState.source = '';
    typeSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));

    const sources = OCR_SOURCES[_ocrSearchState.type] || [];
    sourceSeg.innerHTML = sources.map(s =>
      `<button type="button" data-v="${s.key}">${esc(s.label)}</button>`
    ).join('');
    goBtn.disabled = true;

    sourceSeg.onclick = e2 => {
      const b2 = e2.target.closest('button[data-v]');
      if (!b2) return;
      _ocrSearchState.source = b2.dataset.v;
      sourceSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b2));
      goBtn.disabled = false;
    };
  };

  goBtn.onclick = doOcrSearch;
  document.getElementById('ocrSearchCancel').onclick = () => modal.classList.remove('on');
  modal.classList.add('on');
}

function doOcrSearch() {
  const { type, source, query } = _ocrSearchState;
  if (!type || !source) return;

  document.getElementById('ocrSearchModal').classList.remove('on');

  const screenshotId = _currentScreenshot ? _currentScreenshot.id : null;
  closeOcrPopup();
  closeScreenshotView();

  openForm(null);

  const panel = document.getElementById('panel');
  const segType = panel.querySelector('#f_type');
  const typeBtn = segType.querySelector(`button[data-v="${type}"]`);
  if (typeBtn) {
    segType.querySelectorAll('button').forEach(b => b.classList.remove('on'));
    typeBtn.classList.add('on');
  }
  const draft = window._currentDraft;
  if (draft) {
    draft.type = type;
    if (query) {
      draft.title = query;
      const titleInput = panel.querySelector('#f_title');
      if (titleInput) titleInput.value = query;
    }
  }
  if (screenshotId) window._pendingScreenshotForDeletion = screenshotId;

  const handlers = {
    tmdb:     () => { openTmdbModal();     document.getElementById('tmdbQuery').value = query; },
    kinogo:   () => { openKinogoModal();   document.getElementById('kinogoQuery').value = query; },
    dorama:   () => { openDoramaModal();   document.getElementById('doramaQuery').value = query; },
    anilist:  () => { openAniListModal();  document.getElementById('anilistQuery').value = query; },
    slashlib: () => { openSlashlibModal(); document.getElementById('slashlibQuery').value = query; },
    knigi:    () => { openKnigiModal();    document.getElementById('knigiQuery').value = query; },
    flibusta: () => { openFlibustaModal(); document.getElementById('flibustaQuery').value = query; },
    ficbook:  () => { openFicbookModal();  document.getElementById('ficbookQuery').value = query; },
    fanfics:  () => { openFanficsModal();  document.getElementById('fanficsQuery').value = query; },
    ao3:      () => { openAo3Modal();      document.getElementById('ao3Query').value = query; },
    manual:   () => { /* форма уже открыта, title заполнен */ }
  };
  const h = handlers[source];

  setTimeout(() => {
    if (h) h();

    // Ждём отрисовки модалки и запускаем поиск напрямую, без фокуса на клавиатуру
    setTimeout(() => {
      if (source === 'tmdb' && typeof runTmdbSearch === 'function') runTmdbSearch();
      else if (source === 'kinogo' && typeof runKinogoSearch === 'function') runKinogoSearch();
      else if (source === 'dorama' && typeof runDoramaSearch === 'function') runDoramaSearch();
      else if (source === 'anilist' && typeof runAniListSearch === 'function') runAniListSearch();
      else if (source === 'slashlib' && typeof runSlashlibSearch === 'function') runSlashlibSearch();
      else if (source === 'knigi' && typeof runKnigiSearch === 'function') runKnigiSearch();
      else if (source === 'flibusta' && typeof runFlibustaSearch === 'function') runFlibustaSearch();
      else if (source === 'ficbook' && typeof runFicbookSearch === 'function') runFicbookSearch();
      else if (source === 'fanfics' && typeof runFanficsSearch === 'function') runFanficsSearch();
      else if (source === 'ao3' && typeof runAo3Search === 'function') runAo3Search();
    }, 350);
  }, 200);
}


/* ── Подключаем кнопки модалки скриншота ────── */
(function bindScreenshotUi() {
  const close = document.getElementById('screenshotCloseBtn');
  if (close) close.onclick = closeScreenshotView;

  const ocr = document.getElementById('screenshotOcrBtn');
  if (ocr) ocr.onclick = runOcr;

  const del = document.getElementById('screenshotDeleteBtn');
  if (del) del.onclick = async () => {
    if (!_currentScreenshot) return;
    if (!confirm('Удалить скриншот?')) return;
    const id = _currentScreenshot.id;
    await ScreenshotsDB.delete(id);
    closeScreenshotView();
    renderScreensGrid();
    toast('Скриншот удалён');
  };

  const view = document.getElementById('screenshotView');
  if (view) view.onclick = e => {
    if (e.target.id === 'screenshotView' || e.target.id === 'screenshotStage' ||
        e.target.id === 'screenshotZoomLayer') {
      closeScreenshotView();
    }
  };

  const popup = document.getElementById('ocrPopup');
  if (popup) popup.onclick = e => {
    if (e.target.id === 'ocrPopup') closeOcrPopup();
  };
  document.getElementById('ocrPopupCancel').onclick = closeOcrPopup;
  document.getElementById('ocrPopupCopy').onclick = async () => {
    const text = document.getElementById('ocrPopupInput').value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Скопировано');
    } catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      toast('Скопировано');
    }
    closeOcrPopup();
  };
  document.getElementById('ocrPopupAdd').onclick = () => {
    const text = document.getElementById('ocrPopupInput').value.trim();
    if (!text) return;
    closeOcrPopup();
    openOcrSearchModal(text);
  };
  document.getElementById('ocrPopupInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('ocrPopupAdd').click();
    }
  });
})();
