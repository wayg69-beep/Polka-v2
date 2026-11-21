'use strict';

/* ==========================================================
   state.js — Состояние: items, state, categorySettings, корзина, load/save, помощники по сезонам и статусам
   ========================================================== */

let trashItems = [];


let items = [];
let state = {
  search:'', category:'all', status:'all', sort:'created', blOnly:false,
  typeFilter: null,
  tagFilter: null,
  emergencyMode: false,
  favOnly: false,
};
let categorySettings = {
  all:    { status: 'all', sort: 'created', typeInclude: [], typeExclude: [] },
  screen: { status: 'all', sort: 'created', typeInclude: [], typeExclude: [] },
  comic:  { status: 'all', sort: 'created', typeInclude: [], typeExclude: [] },
  book:   { status: 'all', sort: 'created', typeInclude: [], typeExclude: [] },
  music:  { status: 'all', sort: 'created', typeInclude: [], typeExclude: [] },
};

function groupOf(type){
  return (TYPES[type] && TYPES[type].group) || 'screen';
}
function isSeason(it){
  return !!(it && it.parentId);
}
function getSeasons(parentId){
  return items.filter(i => i.parentId === parentId).sort((a, b) => a.seasonNumber - b.seasonNumber);
}
function getMainItem(it){
  if(!it || !it.parentId) return it;
  return items.find(x => x.id === it.parentId) || null;
}
function computeMainStatus(it){
  if(!it) return 'want';
  if(isSeason(it)) return it.status;
  const seasons = getSeasons(it.id);
  if(!seasons.length) return it.status;
  const st = seasons.map(s => s.status);
  if(st.includes('dropped')) return 'dropped';
  if(st.every(s => s === 'done')) return 'done';
  if(st.some(s => s === 'done' || s === 'in_progress')) return 'in_progress';
  return 'want';
}
function effectiveStatus(it){
  if(!it) return 'want';
  if(isSeason(it)) return it.status;
  return computeMainStatus(it);
}
function pluralRu(n, one, few, many){
  const m10 = n % 10, m100 = n % 100;
  if(m10 === 1 && m100 !== 11) return one;
  if(m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function seasonCountLabel(it){
  if(!it || isSeason(it)) return '';
  const n = getSeasons(it.id).length;
  if(!n) return '';
  return n + ' ' + pluralRu(n, 'сезон', 'сезона', 'сезонов');
}
  
  function statusLabelForCategory(key, category){
  if(key === 'done'){
    if(category === 'screen') return 'Посмотрено';
    if(category === 'book' || category === 'comic') return 'Прочитано';
    if(category === 'music') return 'Прослушано';
    return 'Готово';
  }
  const s = STATUSES[key];
  return s ? s.label : key;
}

/* ============ ХРАНИЛИЩЕ ============ */
function load(){
  // Версия кэша обложек: при смене размеров один раз сбрасываем старые мелкие картинки
  try{
    if(localStorage.getItem('polka_cover_ver') !== '2'){
      CoverCache.clear().catch(() => {});
      localStorage.setItem('polka_cover_ver', '2');
    }
  }catch(e){}
  try{
    try{
  const rawTrash = localStorage.getItem(TRASH_KEY);
  trashItems = rawTrash ? JSON.parse(rawTrash) : [];
  if(!Array.isArray(trashItems)) trashItems = [];
  
  // Очищаем то, что старше 7 дней
  const cutoff = Date.now() - (TRASH_DAYS * 24 * 60 * 60 * 1000);
  const validTrash = [];
  for(const t of trashItems){
    if(t.deletedAt && t.deletedAt > cutoff){
      validTrash.push(t);
    } else {
      CoverCache.deleteForItem(t.id);
    }
  }
  if(validTrash.length !== trashItems.length){
    trashItems = validTrash;
    localStorage.setItem(TRASH_KEY, JSON.stringify(trashItems));
  }
}catch(e){ trashItems = []; }
    const raw = localStorage.getItem(KEY);
    items = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(items)) items = [];
    const legacy = { anime:'series', video:'movie', game:'movie', other:'book' };
    let changed = false;
    items.forEach(it => {
      if(legacy[it.type]){ it.type = legacy[it.type]; changed = true; }
      if(typeof it.description !== 'string'){ it.description = ''; changed = true; }
      if(typeof it.country !== 'string'){ it.country = ''; changed = true; }
      if(typeof it.pages !== 'string'){ it.pages = ''; changed = true; }
      if(typeof it.link !== 'string'){ it.link = ''; changed = true; }
      if(typeof it.link_sub !== 'string'){ it.link_sub = ''; changed = true; }
      if(typeof it.link_extras !== 'string'){ it.link_extras = ''; changed = true; }
      if(typeof it.bl !== 'boolean'){ it.bl = false; changed = true; }
      if(!Array.isArray(it.tags)){ it.tags = []; changed = true; }
      if(typeof it.hearts !== 'number'){ it.hearts = 0; changed = true; }
      if(typeof it.title_en !== 'string'){ it.title_en = ''; changed = true; }
      if(typeof it.lyricsLrc !== 'string'){ it.lyricsLrc = ''; changed = true; }
      if(typeof it.link_comizy !== 'string'){ it.link_comizy = ''; changed = true; }
      if(!Array.isArray(it.comizyChapters)){ it.comizyChapters = []; changed = true; }
      if(!Array.isArray(it.otherNames)){ it.otherNames = []; changed = true; }
      // Миграция со старого Vymanga (если было)
      if(it.link_vy && !it.link_comizy){ it.link_comizy = it.link_vy; changed = true; }
      if(it.vyChapters && (!it.comizyChapters || !it.comizyChapters.length)){ it.comizyChapters = it.vyChapters; changed = true; }
      if('link_vy' in it){ delete it.link_vy; changed = true; }
      if('vyChapters' in it){ delete it.vyChapters; changed = true; }
      if(typeof it.favorite !== 'boolean'){ it.favorite = false; changed = true; }
if(!('parentId' in it)){ it.parentId = null; changed = true; }
else if(it.parentId !== null && typeof it.parentId !== 'string'){ it.parentId = null; changed = true; }
if(typeof it.seasonNumber !== 'number'){ it.seasonNumber = 0; changed = true; }
{ const nm = normMoments(it.moments);
  if(JSON.stringify(nm) !== JSON.stringify(it.moments)){ it.moments = nm; changed = true; } }
    });
    if(changed) save();
  }catch(e){ items = []; }

  try{
    const c = localStorage.getItem(CAT_KEY);
    if(c && CATEGORIES[c]) state.category = c;
  }catch(e){}

  try{
    if(localStorage.getItem(EMERGENCY_KEY) === '1') state.emergencyMode = true;
  }catch(e){}

  try{
    const raw = localStorage.getItem(CAT_SETTINGS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      for(const k in categorySettings){
        if(parsed[k]){
  categorySettings[k] = {
    status: parsed[k].status || 'all',
    sort:   (parsed[k].sort === 'recent' ? 'created' : parsed[k].sort) || 'created',
    typeInclude: Array.isArray(parsed[k].typeInclude) ? parsed[k].typeInclude : [],
    typeExclude: Array.isArray(parsed[k].typeExclude) ? parsed[k].typeExclude : []
  };
        }
      }
    }
  }catch(e){}

  const s = categorySettings[state.category];
  if(s){
    state.status = s.status;
    state.sort   = s.sort;
  }
}
let onDataChanged = null;   // подключается ниже, когда объект Cloud уже создан
function save(){
  if(onDataChanged) onDataChanged();     // всегда помечаем dirty, даже если локалка сдохла
  try{
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  }
  catch(e){ toast('Локально не сохранилось, но в облако уйдёт'); return false; }
}
function saveCat(){
  try{ localStorage.setItem(CAT_KEY, state.category); }catch(e){}
}
function saveCategorySettings(){
  try{ localStorage.setItem(CAT_SETTINGS_KEY, JSON.stringify(categorySettings)); }catch(e){}
}
  function saveTrash(){
  // То же самое: сначала dirty-флаг, потом запись.
  // Иначе при QuotaExceeded «надгробия» из корзины не уедут в облако,
  // и удалённые карточки воскреснут при следующем sync().
  if(onDataChanged) onDataChanged();
  try{
    localStorage.setItem(TRASH_KEY, JSON.stringify(trashItems));
  }
  catch(e){
    toast('Корзина локально не сохранилась, но в облако уйдёт: ' + e.message);
  }
  } 
