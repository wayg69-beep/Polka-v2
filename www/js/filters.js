'use strict';

/* ==========================================================
   filters.js — Фильтрация карточек: visible()
   ========================================================== */

  /* ============ ФИЛЬТРАЦИЯ ============ */
function visible(){
  let list = items.filter(i => !isSeason(i));
  const cat = CATEGORIES[state.category];
  if(cat && cat.types) list = list.filter(i => cat.types.includes(i.type));
  if(state.emergencyMode) list = list.filter(i => !i.bl);
  if(state.blOnly) list = list.filter(i => i.bl && groupOf(i.type) !== 'music');
  if(state.status !== 'all') list = list.filter(i => effectiveStatus(i) === state.status);

// Фильтр по типам (зеленый/красный)
const incTypes = categorySettings[state.category]?.typeInclude || [];
const excTypes = categorySettings[state.category]?.typeExclude || [];
if(incTypes.length > 0) list = list.filter(i => incTypes.includes(i.type));
if(excTypes.length > 0) list = list.filter(i => !excTypes.includes(i.type));
  if(state.favOnly) list = list.filter(i => i.favorite);
if(state.typeFilter) list = list.filter(i => i.type === state.typeFilter);
if(state.tagFilter) list = list.filter(i => Array.isArray(i.tags) && i.tags.includes(state.tagFilter));
  const qRaw = state.search.trim();
if(qRaw){
  const qRu = normSearch(qRaw);
  const qEn = normSearch(enToRu(qRaw));
  list = list.filter(i => {
    const t  = normSearch(i.title || '');
    const tE = normSearch(i.title_en || '');
    
    // Основной матч: название / оригинал
    if (t.includes(qRu) || t.includes(qEn) || tE.includes(qRu) || tE.includes(qEn)) return true;
    
    // Дополнительный матч по country — ТОЛЬКО для музыки, книг и комиксов
    // (там country = исполнитель / автор). У медиа country — это страна,
    // её в поиске не учитываем, чтобы не искать по «Япония» / «Корея».
    const g = groupOf(i.type);
    if (g === 'music' || g === 'book' || g === 'comic') {
      const c = normSearch(i.country || '');
      if (c.includes(qRu) || c.includes(qEn)) return true;
    }
    
    return false;
  });
}
  
const s = state.sort === 'recent' ? 'created' : state.sort; // Поддержка старых сохранений
// Ключ сортировки. «created» / «created_old» теперь значат «по дате изменения»,
// а не по дате создания: так изменённая карточка поднимается наверх.
// fallback на createdAt — для карточек, которых updatedAt почему-то нет.
const updOf = x => (x && (x.updatedAt || x.createdAt)) || 0;
  list.sort((a,b) => {
  if(s === 'rating') return (b.rating||0) - (a.rating||0);
  if(s === 'title')  return (a.title||'').localeCompare(b.title||'', 'ru');
  if(s === 'created')return updOf(b) - updOf(a);
  if(s === 'created_old') return updOf(a) - updOf(b); // <-- Старые сначала
  if(s === 'process'){
  const priority = { in_progress: 1, want: 2, done: 3, dropped: 4 };
  const pA = priority[effectiveStatus(a)] || 5;
  const pB = priority[effectiveStatus(b)] || 5;
  if(pA !== pB) return pA - pB;
  return updOf(b) - updOf(a);
  
  }
  if(s === 'year'){
    const ya = parseInt(a.year) || 0, yb = parseInt(b.year) || 0;
    return yb - ya;
  }
  return updOf(b) - updOf(a);
});
  return list;
}
