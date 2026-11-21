'use strict';

/* ==========================================================
   mangalib.js — Импорт из MangaLib (MangaLibImporter + окно)
   ========================================================== */

/* ============ ИМПОРТЁР MANGA LIB ============ */
const MangaLibImporter = {
  async read(source){
    if(!source) throw new Error('Источник не указан');
    if(source.type === 'file'){
      const text = await source.file.text();
      let data;
      try { data = JSON.parse(text); }
      catch(e){ throw new Error('Файл не является JSON'); }
      const raw = this._extractRaw(data);
      return this._normalize(raw);
    }
    if(source.type === 'api'){
      throw new Error('API пока не подключён');
    }
    throw new Error('Неизвестный источник');
  },
  _extractRaw(data){
    if(Array.isArray(data)) return data;
    if(data && typeof data === 'object'){
      if(Array.isArray(data.items)) return data.items;
      if(Array.isArray(data.manga)) return data.manga;
      if(Array.isArray(data.comics)) return data.comics;
      if(Array.isArray(data.list))  return data.list;
      if(Array.isArray(data.data))  return data.data;
    }
    return [];
  },
  _pick(obj, ...keys){
    for(const k of keys){
      if(obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return '';
  },
  _mapStatus(s){
    const v = String(s || '').toLowerCase();
    if(/drop|abandon|delete/.test(v))                           return 'dropped';
    if(/in_?progress|process|watching|reading|current/.test(v))  return 'in_progress';
    if(/unread|plan|want|later|todo/.test(v))                    return 'want';
    if(/read|complete|done|finished/.test(v))                    return 'done';
    return 'want';
  },
  _mapOne(r){
    if(!r || typeof r !== 'object') return null;
    const rawTitle  = this._pick(r, 'title','rus_name','rusName','russian','name');
    const shikiRu   = this._pick(r, 'target_title_ru');
    const shikiOrig = this._pick(r, 'target_title');
    let title = rawTitle || shikiRu || shikiOrig;
    let title_en = this._pick(r, 'title_en','eng_name','engName','name_en','english','target_title') || '';
    if(title_en === title) title_en = '';
    const cover = this._pick(r, 'cover','image','cover_url','coverUrl','img','poster');
    const descr = this._pick(r, 'description','summary','annotation','about');
    const year  = this._pick(r, 'year','releaseDate','release_date','release_year');
    const authorRaw = this._pick(r, 'author','authors','author_name','authorName');
    let author = '';
    if(Array.isArray(authorRaw)){
      author = authorRaw.map(a => (typeof a === 'string' ? a : (a && (a.name || a.rus_name)) || '')).filter(Boolean).join(', ');
    } else if(authorRaw && typeof authorRaw === 'object'){
      author = authorRaw.name || authorRaw.rus_name || '';
    } else if(typeof authorRaw === 'string'){
      author = authorRaw;
    }
    let tagsRaw = this._pick(r, 'tags','genres','categories');
    let tags = [];
    if(Array.isArray(tagsRaw)){
      tags = tagsRaw.map(t => (typeof t === 'string' ? t : (t && (t.name || t.rus_name)) || '')).filter(Boolean);
    } else if(typeof tagsRaw === 'string'){
      tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
    }
    const pagesVal = this._pick(r, 'pages','chapters','chapters_count');
    const status = this._mapStatus(this._pick(r, 'status','read_status','readStatus','userStatus'));
    const score = Number(this._pick(r, 'score','rating','userRating','user_rating')) || 0;
    let sourceId = '';
    const txt = this._pick(r, 'text');
    if(txt && typeof txt === 'string'){
      const m = txt.match(/Source ID:\s*(\d+)/);
      if(m) sourceId = m[1];
    }
    const url = this._pick(r, 'url','link','source_url','sourceUrl') || sourceId;
if(!title) return null;
const now = Date.now();
return {
  id: uid(),
  title: String(title).trim(),
  title_en: title_en ? String(title_en).trim() : '',
  type: 'comic',
  status,
  rating: score > 0 ? Math.round(score) : 0,
  hearts: 0,
  year: year ? String(year).substring(0,4) : '',
  country: author ? String(author).trim() : '',
  cover: cover ? String(cover).trim() : '',
  tags: tags,
  description: descr ? String(descr).trim() : '',
  notes: '',
  bl: isYaoiTags(tags),
  pages: pagesVal ? String(pagesVal) : '',
      link: '',
      link_sub: '',
      link_extras: '',
      shortTitle: false,
      createdAt: now,
      updatedAt: now,
      favorite: false,
      source: 'mangalib',
      sourceUrl: url ? String(url).trim() : ''
    };
  },
  _normalize(raw){
    if(!Array.isArray(raw)) return [];
    const out = [];
    for(const r of raw){
      const m = this._mapOne(r);
      if(m) out.push(m);
    }
    return out;
  }
};


/* ============ ИМПОРТ ИЗ MANGA LIB ============ */
function openMangaLibModal(){
  const modal = document.getElementById('mangalibModal');
  const status = document.getElementById('mangalibStatus');
  if(status){ status.textContent = ''; status.className = 'import-status'; }
  if(modal) modal.classList.add('on');
}
function closeMangaLibModal(){
  const modal = document.getElementById('mangalibModal');
  if(modal) modal.classList.remove('on');
}
document.getElementById('btnMangaLib').onclick = () => {
  state.category = 'screens';
  state.typeFilter = null;
  state.tagFilter = null;
  state.blOnly = false;
  state.search = '';
  const searchInp = document.getElementById('search');
  if (searchInp) searchInp.value = '';
  if (typeof updateSearchClear === 'function') updateSearchClear();
  saveCat();
  renderTabs();
  render();
  const content = document.querySelector('.content');
  if (content) content.scrollTop = 0;
};
document.getElementById('mangalibClose').onclick = () => closeMangaLibModal();
document.getElementById('mangalibModal').onclick = (e) => {
  if(e.target.id === 'mangalibModal') closeMangaLibModal();
};
document.getElementById('mangalibPick').onclick = () => {
  document.getElementById('mangalibFile').click();
};
document.getElementById('mangalibFile').onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  if(!files.length) return;

  const status = document.getElementById('mangalibStatus');
  if(status){ status.textContent = 'Обрабатываю ' + files.length + ' файл(ов)…'; status.className = 'import-status'; }

  let totalAdded = 0, totalSkipped = 0, errors = 0;
  const existingTitles = new Set(
    items.filter(i => i.type === 'comic').map(i => (i.title || '').toLowerCase())
  );

  for(const file of files){
    try {
      const incoming = await MangaLibImporter.read({ type: 'file', file });
      if(!incoming.length) continue;

      for(const it of incoming){
        if(existingTitles.has((it.title || '').toLowerCase())){ totalSkipped++; continue; }
        items.push(it);
        existingTitles.add((it.title || '').toLowerCase());
        totalAdded++;
      }
    } catch(err){
      errors++;
      console.log('Ошибка в файле ' + file.name + ': ' + err.message);
    }
  }

  save(); renderTabs(); render();

  if(status){
    let msg = 'Добавлено: ' + totalAdded;
    if(totalSkipped) msg += ', дубликатов: ' + totalSkipped;
    if(errors) msg += ', ошибок: ' + errors;
    status.textContent = msg;
    status.className = totalAdded > 0 ? 'import-status ok' : 'import-status err';
  }
  toast('Импортировано комиксов: ' + totalAdded);
  e.target.value = '';
};
