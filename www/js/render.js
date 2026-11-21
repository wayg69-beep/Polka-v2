'use strict';

/* ==========================================================
   render.js — Отрисовка: карточка, сетка, вкладки, нижняя навигация, статусы, фильтры, прогресс
   ========================================================== */

/* ============ КАРТОЧКА ============ */
function cardHTML(it){
  const T = TYPES[it.type] || {label:'—', icon:SVG_ICONS.help};
  const group = groupOf(it.type);
  const sCol = statusColor(effectiveStatus(it));
const statusDot = `<div class="card-status-dot" style="--dot-c:${sCol}"></div>`;
    const coverKey = it.id + '_card';
// На мобиле data URL в src раздувает HTML до мегабайт — рендер тормозит.
// Поэтому на мобиле всегда через hydrate: src ставится JS-ом.
const readyUrl = IS_MOBILE ? '' : getCachedCoverUrl(coverKey, it.cover);
let cover;
if(it.cover && readyUrl){
  cover = `<img class="cover-img" src="${esc(readyUrl)}" loading="lazy" decoding="async" alt="">`;
} else if(it.cover){
cover = `<img class="cover-img" data-cover-key="${esc(coverKey)}" data-cover-url="${esc(it.cover)}" data-cover-width="${coverWidthFor('card')}" alt="" decoding="async" style="display:none"><span class="cover-fallback">${T.icon}</span>`;
} else {
  cover = `<span class="cover-fallback">${T.icon}</span>`;
}
  const rating = it.rating
  ? `<div class="rate" style="--rate-bright:hsl(${hueFor(it.rating).toFixed(1)}, 80%, 68%)"><span class="rate-star">★</span>${esc(it.rating)}</div>`
  : '';
  const showBl = group !== 'music';
  const heartsVal = (typeof it.hearts === 'number') ? it.hearts : 0;
  const heartsEnabled = group === 'screen' || group === 'comic' || group === 'book';
  const highRated = heartsEnabled && heartsVal >= 4 && !state.emergencyMode;
  let cornerHTML = '';
  if(it.bl && showBl){
    cornerHTML = '<div class="bl-corner' + (highRated ? ' rated' : '') + '"><span>BL</span></div>';
  } else if(highRated){
    cornerHTML = '<div class="pink-corner"></div>';
  }
  const favFlag = it.favorite
? '<div class="card-fav-flag"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>'
: '';

let statusLine = '';
if ((group === 'screen' || group === 'comic') && it.projectStatus) {
  statusLine = `<div class="card-status-line ${it.projectStatus}"></div>`;
}
  let subText = '';
if(group === 'music') subText = esc(it.country || '');
else if(group === 'book' || group === 'comic') subText = esc(it.country || '');
else {
  const year = it.year ? ' · ' + esc(it.year) : '';
  const sc = seasonCountLabel(it);
  subText = T.label + year + (sc ? ' · ' + sc : '');
}
  const subHtml = subText ? '<div class="sub">' + subText + '</div>' : '';
  const cardClass = group === 'music' ? 'card music-card' : 'card';

    const playOverlay = group === 'music' ? '<div class="cover-play-overlay"></div>' : '';
  
  return `
    <div class="${cardClass}" data-id="${esc(it.id)}">
      <div class="cover">
  ${cover}
  ${statusDot}
  ${rating}
  ${cornerHTML}
  ${favFlag}
  ${playOverlay}
</div>
      <div class="meta">
        ${statusLine}
        <div class="title"><div class="t-clamp">${esc(it.title || 'Без названия')}</div></div>
        ${subHtml}
      </div>
    </div>`;
}
  // Подгружает обложки для уже отрисованных карточек
async function hydrateOneCover(img){
  const key = img.dataset.coverKey;
  const url = img.dataset.coverUrl;
  const width = parseInt(img.dataset.coverWidth || '300', 10);
  const hideFallback = () => {
    const f = img.parentNode && img.parentNode.querySelector('.cover-fallback');
    if(f) f.style.display = 'none';
  };
  const showDirect = () => {
  img.onload = () => {
    img.style.display = 'block';
    _manualUrlsOk.add(url);
    hideFallback();
    (async () => {
      try {
        const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if(r.ok){
          const blob = await r.blob();
          if(blob && blob.size > 0){
            try { await CoverCache.put(key, blob); } catch(e){}
            const blobUrl = await makeCoverUrl(blob);
            if(blobUrl) _coverBlobUrls.set(key, blobUrl);
          }
        }
      } catch(e){}
    })();
  };
  img.onerror = () => img.remove();
  img.src = url;
};

  const isManaged = /image\.tmdb\.org|s4\.anilist\.co/.test(url);

// Ручная карточка (URL не из наших источников)
if(!isManaged){
  // Сначала пробуем достать из кэша/прокси. Если получаем blob — ставим его.
  const cachedBlob = await ensureManualCover(key, url, width);
  if(cachedBlob){
    img.src = cachedBlob;
    img.style.display = 'block';
    hideFallback();
    return;
  }
  
  // Если прокси не справились, грузим напрямую. 
  // Браузер может помигать, но это последний шанс.
  showDirect();
  return;
}

  // Наш источник — через прокси в кэш; если прокси не ответил — показываем напрямую
  const blobUrl = await ensureCover(key, url, width);
  if(blobUrl){
    img.src = blobUrl;
    img.style.display = 'block';
    hideFallback();
  } else {
    showDirect();
  }
}

async function hydrateCardCovers(rootEl){
  const root = rootEl || document.getElementById('grid');
  if(!root) return;
  const imgs = Array.from(root.querySelectorAll('img.cover-img[data-cover-key]'))
    .filter(img => img.dataset.hydrated !== '1');
  imgs.forEach(img => { img.dataset.hydrated = '1'; });

  // Быстрый синхронный проход: если URL уже в Map — ставим сразу, без await.
  // На мобиле это критично — при переключении вкладок все URL уже в Map,
  // и весь hydrate проходит за один синхронный цикл, без микротасок.
  const pending = [];
  for(const img of imgs){
    const key = img.dataset.coverKey;
    const cached = _coverBlobUrls.get(key);
    if(cached){
      img.src = cached;
      img.style.display = 'block';
      const f = img.parentNode && img.parentNode.querySelector('.cover-fallback');
      if(f) f.style.display = 'none';
    } else {
      pending.push(img);
    }
  }
  if(!pending.length) return;

  let next = 0;
  const worker = async () => {
    while(next < pending.length){
      const img = pending[next++];
      try { await hydrateOneCover(img); }
      catch(e){ img.remove(); }
    }
  };
await Promise.all(Array.from({ length: Math.min(12, pending.length) }, worker));}

/* ============ РЕНДЕР ВКЛАДОК ============ */
function renderTabs(){
  const el = document.getElementById('navList');
  const ICONS = {
    all: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    screen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
    comic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17h14"/></svg>',
    music: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  };
  el.innerHTML = Object.entries(CATEGORIES).map(([k,v]) =>
    `<button class="nav-item ${state.category===k?'on':''}" data-c="${k}" title="${esc(v.label)}">
      <span class="nav-icon">${ICONS[k] || ''}</span>
      <span class="nav-label">${esc(v.label)}</span>
    </button>`
  ).join('');
  el.querySelectorAll('.nav-item').forEach(b => {
    b.onclick = () => {
  state.category = b.dataset.c;
  state.typeFilter = null;
  state.tagFilter = null;
  state.blOnly = false;
  state.search = '';
  const searchInp = document.getElementById('search');
  if(searchInp) searchInp.value = '';
  updateSearchClear();
  const cs = categorySettings[state.category];
      if(cs){
        state.status = cs.status;
        state.sort   = cs.sort;
      } else {
        state.status = 'all';
        state.sort   = 'created';
      }
      saveCat(); renderTabs(); render();
const content = document.querySelector('.content');
if(content) content.scrollTop = 0; // <-- Сброс скролла
    };
  });
  renderBottomNav();
}
  
function renderBottomNav(){
  const nav = document.getElementById('bottomNav');
  if(!nav) return;
  const ICONS = {
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
    comic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17h14"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  };
  nav.innerHTML = Object.entries(CATEGORIES).map(([k,v]) =>
    `<button class="bottom-nav-item ${state.category===k?'on':''}" data-c="${k}">
      ${ICONS[k] || ''}
      <span class="bottom-nav-label">${esc(v.label)}</span>
    </button>`
  ).join('');
  nav.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.onclick = () => {
  state.category = b.dataset.c;
  state.typeFilter = null;
  state.tagFilter = null;
  state.blOnly = false;
  state.search = '';
  const searchInp = document.getElementById('search');
  if(searchInp) searchInp.value = '';
  updateSearchClear();
  const cs = categorySettings[state.category];
      if(cs){
        state.status = cs.status;
        state.sort   = cs.sort;
      } else {
        state.status = 'all';
        state.sort   = 'created';
      }
      saveCat(); renderTabs(); render();
const content = document.querySelector('.content');
if(content) content.scrollTop = 0; // <-- Сброс скролла
    };
  });
}
  
  /* ============ ВКЛАДКИ СТАТУСОВ ============ */
function positionStatusIndicator(animate){
  const BASE_W = 100;  // должна совпадать с CSS width у .status-tabs-indicator
  const tabs = document.getElementById('statusTabs');
  const indicator = document.getElementById('statusIndicator');
  if(!tabs || !indicator) return;
  const active = tabs.querySelector('.status-tab.on');
  if(!active){
    indicator.style.transform = 'translate3d(0,0,0) scaleX(0)';
    return;
  }

  const par = indicator.offsetParent || indicator.parentElement;
  const parRect = par.getBoundingClientRect();

  // Отменяем предыдущую анимацию
  if(indicator._raf){
    cancelAnimationFrame(indicator._raf);
    indicator._raf = null;
  }

  const indRect = indicator.getBoundingClientRect();
  const actRect = active.getBoundingClientRect();

  const currentLeft  = indRect.left - parRect.left;
  const currentWidth = indRect.width;
  const targetLeft   = actRect.left - parRect.left;
  const targetWidth  = actRect.width;
  const currentRight = currentLeft + currentWidth;
  const targetRight  = targetLeft + targetWidth;

  const setTransform = (left, width) => {
    const k = width / BASE_W;
    indicator.style.transform = 'translate3d(' + left + 'px, 0, 0) scaleX(' + k + ')';
  };

  if(!animate || currentWidth < 1){
    setTransform(targetLeft, targetWidth);
    return;
  }

  if(Math.abs(currentLeft - targetLeft) < 1 && Math.abs(currentWidth - targetWidth) < 1) return;

  const goingRight = targetRight > currentRight;

  /* ===== Настройки ===== */
  const DURATION = 480;
  const distance = Math.abs(targetLeft - currentLeft);
  const stretchFactor = Math.min(1, distance / 500);
  const noseShare = 0.65 + 0.28 * stretchFactor;
  /* ==================== */

  const startTime = performance.now();

  function ease(t){
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  function step(now){
    const t = Math.min(1, (now - startTime) / DURATION);

    const noseT = Math.min(1, t / noseShare);
    const noseEase = ease(noseT);
    const backEase = ease(t);

    let left, right;
    if(goingRight){
      right = currentRight + (targetRight - currentRight) * noseEase;
      left  = currentLeft  + (targetLeft  - currentLeft ) * backEase;
    } else {
      left  = currentLeft  + (targetLeft  - currentLeft ) * noseEase;
      right = currentRight + (targetRight - currentRight) * backEase;
    }

    setTransform(left, Math.max(0, right - left));

    if(t < 1){
      indicator._raf = requestAnimationFrame(step);
    } else {
      setTransform(targetLeft, targetWidth);
      indicator._raf = null;
    }
  }

  setTransform(currentLeft, currentWidth);
  indicator._raf = requestAnimationFrame(step);
}
function renderStatusTabs(){
  const tabs = document.getElementById('statusTabs');
  if(!tabs) return;
  if (state.category === 'screens') {
    tabs.innerHTML = '<span class="status-tab on" style="cursor:default;pointer-events:none;">Галерея</span>';
    tabs.dataset.cat = '';
    const row = tabs.closest('.status-tabs-row');
    if (row) {
      row.style.display = '';
      row.classList.add('screens-row');
    }
    const indicator = document.getElementById('statusIndicator');
    if (indicator) indicator.style.transform = 'translate3d(0,0,0) scaleX(0)';
    return;
  } else {
    const row = tabs.closest('.status-tabs-row');
    if (row) {
      row.style.display = '';
      row.classList.remove('screens-row');
    }
  }
  const cat = CATEGORIES[state.category];
let inCategory = cat && cat.types
  ? items.filter(i => !isSeason(i) && cat.types.includes(i.type))
  : items.filter(i => !isSeason(i));
if(state.emergencyMode) inCategory = inCategory.filter(i => !i.bl);
const data = [{ key: 'all', label: 'Все', count: inCategory.length }];
for(const k in STATUSES){
  data.push({
    key: k,
    label: statusLabelForCategory(k, state.category),
    count: inCategory.filter(i => effectiveStatus(i) === k).length
  });
}
  const sameCategory = tabs.dataset.cat === state.category;
  const existing = tabs.querySelectorAll('.status-tab');
  if(sameCategory && existing.length === data.length){
    existing.forEach((btn, i) => {
      const d = data[i];
      const cnt = btn.querySelector('.cnt');
      if(cnt) cnt.textContent = d.count;
      btn.classList.toggle('on', d.key === state.status);
    });
    positionStatusIndicator(true);
  } else {
    tabs.innerHTML = data.map(d =>
      `<button type="button" class="status-tab ${d.key === state.status ? 'on' : ''}" data-v="${d.key}">${esc(d.label)}<span class="cnt">${d.count}</span></button>`
    ).join('');
    tabs.dataset.cat = state.category;
    tabs.querySelectorAll('.status-tab').forEach(b => {
  b.onclick = () => {
    state.status = b.dataset.v;
    state.search = '';
    const searchInp = document.getElementById('search');
    if(searchInp) searchInp.value = '';
    updateSearchClear();
    renderStatusTabs();
    renderGrid();
  };
});
    requestAnimationFrame(() => positionStatusIndicator(false));
  }
}

/* ============ АКТИВНЫЕ ФИЛЬТРЫ ============ */
function renderActiveFilters(){
  const box = document.getElementById('activeFilters');
  if(!box) return;
  const chips = [];
  if(state.typeFilter){
    const lbl = (TYPES[state.typeFilter] && TYPES[state.typeFilter].label) || state.typeFilter;
    chips.push(`<span class="af-chip">Тип: ${esc(lbl)}<button type="button" data-clear="typeFilter" aria-label="Снять">✕</button></span>`);
  }
  if(state.tagFilter){
    chips.push(`<span class="af-chip">Тег: ${esc(state.tagFilter)}<button type="button" data-clear="tagFilter" aria-label="Снять">✕</button></span>`);
  }
  if(!chips.length){
  box.hidden = true;
  box.innerHTML = '';
  return;
}
box.hidden = false;
box.innerHTML = chips.join('');
box.querySelectorAll('button[data-clear]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.clear;
      if(k === 'typeFilter') state.typeFilter = null;
      else if(k === 'tagFilter') state.tagFilter = null;
      renderTabs();
      render();
    };
  });
}

/* ============ ПРОГРЕСС ============ */

function updateRainbowProgress(){
  const stat = document.getElementById('progressStat');
  const fill = document.getElementById('progressFill');
  const glow = document.getElementById('progressGlow');
  const chandFill = document.getElementById('progressChandelierFill');
  const chandGlow = document.getElementById('progressChandelierGlow');
  if(!stat || !fill || !glow) return;
  let counted = items.filter(i => !isSeason(i) && effectiveStatus(i) !== 'dropped');
if(state.emergencyMode) counted = counted.filter(i => !i.bl);
const done = counted.filter(i => effectiveStatus(i) === 'done').length;
  const total = counted.length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  stat.textContent = total > 0 ? `${done} / ${total} · ${pct}%` : 'Пока пусто';
  fill.style.width = pct + '%';
  glow.style.width = pct + '%';
  if(chandFill) chandFill.style.width = pct + '%';
  if(chandGlow) chandGlow.style.width = pct + '%';
}
  
  /* ============ РАЗВОРАЧИВАНИЕ ЛЮСТРЫ ============ */
let progressExpanded = false;
try{
  progressExpanded = localStorage.getItem('polka_progress_expanded') === '1';
}catch(e){}

function applyProgressExpanded(){
  document.body.classList.toggle('progress-expanded', progressExpanded);
  const wrap = document.getElementById('rainbowProgress');
  if(wrap) wrap.classList.toggle('expanded', progressExpanded);
}

function toggleProgress(){
  progressExpanded = !progressExpanded;
  applyProgressExpanded();
  try{
    localStorage.setItem('polka_progress_expanded', progressExpanded ? '1' : '0');
  }catch(e){}
  if(progressExpanded){
    requestAnimationFrame(() => updateRainbowProgress());
  }
}

applyProgressExpanded();

const brandToggleEl = document.querySelector('h1.brand');
if(brandToggleEl){
  brandToggleEl.style.cursor = 'pointer';
  brandToggleEl.style.webkitTapHighlightColor = 'transparent';
  brandToggleEl.addEventListener('click', toggleProgress);
}

/* ============ EMERGENCY / BL-ТУМБЛЕР ============ */
function updateEmergencyButton(){
  const btn = document.getElementById('fabEmergency');
  if(!btn) return;
  btn.classList.toggle('on', state.emergencyMode);
  btn.title = state.emergencyMode ? 'Показать BL' : 'Скрыть BL';
}
function updateBlToggle(){
  const t = document.getElementById('blToggle');
  if(!t) return;
  if(state.emergencyMode){ t.style.display = 'none'; return; }
  t.style.display = '';
  t.classList.toggle('on', state.blOnly);
}
function updateFavToggle(){
  const t = document.getElementById('favToggle');
  if(!t) return;
  t.classList.toggle('on', state.favOnly);
}

/* ============ СЕТКА ============ */
  function sectionOverflows(itemCount, isMusic){
  if(!itemCount) return false;
  const content = document.querySelector('.content');
  if(!content) return itemCount > 3;
  // .content имеет padding 16px с обеих сторон
  const availW = content.clientWidth - 32;
  const cardW = isMusic ? 165 : 150;
  const gap = 12;
  const totalW = itemCount * cardW + Math.max(0, itemCount - 1) * gap;
  return totalW > availW + 4;
  }
  

function calcGridCardWidth(){
  // На мобиле сетка фиксированная (3 колонки через CSS), JS не трогает
if(window.innerWidth < 700) return;
  const grid = document.getElementById('grid');
  if(!grid) return;

  // Считаем ширину так, как будто сайдбар ЗАКРЫТ (64px).
  // При открытии сайдбара размер карточки не меняется — просто
  // часть карточек перескакивает на строку ниже. Хвост справа — ок.
  const sidebarW = 64;
  const isNarrow = window.innerWidth < 460;
  const padH = isNarrow ? 12 : 16;
  const availW = window.innerWidth - sidebarW - padH * 2;
  if(availW <= 0) return;

  const gap = 12;
  const targetCardW = 165;
  const minCardW = 130;
  const maxCardW = 200;

  let cols = Math.max(2, Math.round((availW + gap) / (targetCardW + gap)));
  let cardW = Math.floor((availW - (cols - 1) * gap) / cols);

  while(cardW > maxCardW && cols < 12){
    cols++;
    cardW = Math.floor((availW - (cols - 1) * gap) / cols);
  }
  while(cardW < minCardW && cols > 2){
    cols--;
    cardW = Math.floor((availW - (cols - 1) * gap) / cols);
  }

  grid.style.setProperty('--grid-card-w', cardW + 'px');

  console.log('[Полка] grid: cardW=' + cardW + 'px, cols=' + cols + ', availW=' + availW);
}

// Один вызов при старте
calcGridCardWidth();

// Пересчёт ТОЛЬКО при смене ориентации (или сильном изменении ширины)
let _lastOrientW = window.innerWidth;

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    _lastOrientW = window.innerWidth;
    calcGridCardWidth();
  }, 300);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  // Порог 150px отсекает мелочь (адресная строка, клавиатура),
  // ловит только поворот экрана / изменение размера окна
  if(Math.abs(w - _lastOrientW) > 150){
    _lastOrientW = w;
    clearTimeout(window._gridResizeTimer);
    window._gridResizeTimer = setTimeout(calcGridCardWidth, 200);
  }
});

function handleMusicCardTap(it, cardEl) {
  const isCurrent = Player.currentTrackId === it.id;
  const wasPlaying = isCurrent && Player.isPlaying;
  
  // Оверлей: пауза если сейчас играет этот трек, иначе play
  const overlay = cardEl.querySelector('.cover-play-overlay');
  if (overlay) {
    overlay.innerHTML = wasPlaying
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    overlay.classList.add('show');
    clearTimeout(overlay._hideTimer);
    overlay._hideTimer = setTimeout(() => overlay.classList.remove('show'), 800);
  }
  
  if (isCurrent) {
    Player.togglePlay();
  } else {
    Player.playFromCard(it.id);
  }
}
  

function renderGrid(){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  grid.classList.remove('screens-mode');
  if (state.category === 'screens') {
    renderScreensGrid();
    return;
  }
  const list = visible();

  if(!list.length){
    grid.innerHTML = '';
    grid.classList.remove('sections-mode');
    empty.style.display = 'block';
    if(items.length){
empty.querySelector('.big').innerHTML = `<div style="color:#5a5a6e; width:64px; height:64px; margin:0 auto 14px;">${SVG_ICONS.search.replace('1em','100%')}</div>`;
      empty.querySelector('p b').textContent = 'Ничего не найдено';
      empty.querySelectorAll('p')[1].textContent = 'Попробуй сбросить фильтры';
    }else{
      empty.querySelector('.big').textContent = '🪹';
      empty.querySelector('p b').textContent = 'Пусто';
      empty.querySelectorAll('p')[1].textContent = 'Жми «+» внизу справа, чтобы добавить';
    }
    return;
  }
  empty.style.display = 'none';

  if(state.category === 'all'){
    grid.classList.add('sections-mode');
    let html = '';
    for(const sec of SECTIONS){
      const secItems = list.filter(i => sec.types.includes(i.type));
      if(!secItems.length) continue;
      const overflows = sectionOverflows(secItems.length, sec.key === 'music');
const edgeRClass = overflows ? ' visible' : '';
html += `
  <div class="section">
    <div class="section-head ${sec.key}">
      <span class="section-icon">${sec.icon}</span>
      <span class="section-label">${sec.label}</span>
    </div>
    <div class="section-scroll-wrap">
      <div class="section-scroll-edge left"></div>
      <div class="section-scroll">${secItems.map(cardHTML).join('')}</div>
      <div class="section-scroll-edge right${edgeRClass}"></div>
    </div>
  </div>`;
    }
    grid.innerHTML = html;
  } else {
    grid.classList.remove('sections-mode');
    grid.innerHTML = list.map(cardHTML).join('');
  }
  grid.querySelectorAll('.card').forEach(c => {
  const id = c.dataset.id;
  const it = items.find(x => x.id === id);
  if (!it) return;
  
  if (groupOf(it.type) === 'music') {
    const cover = c.querySelector('.cover');
    const meta = c.querySelector('.meta');
    if (cover) cover.onclick = (e) => { e.stopPropagation(); handleMusicCardTap(it, c); };
    if (meta) meta.onclick = (e) => { e.stopPropagation(); openView(id); };
  } else {
    c.onclick = () => openView(id);
  }
});
    grid.querySelectorAll('.section-scroll-wrap').forEach(wrap => {
  const scroll = wrap.querySelector('.section-scroll');
  if(!scroll) return;
  const edgeL = wrap.querySelector('.section-scroll-edge.left');
  const edgeR = wrap.querySelector('.section-scroll-edge.right');
  if(!edgeL || !edgeR) return;
  const update = () => {
    const sl = scroll.scrollLeft;
    const max = scroll.scrollWidth - scroll.clientWidth;
    edgeL.classList.toggle('visible', sl > 4);
    edgeR.classList.toggle('visible', sl < max - 4);
  };
  scroll.addEventListener('scroll', update, { passive: true });
});
  // Запускаем подгрузку обложек
  requestAnimationFrame(() => hydrateCardCovers(grid));
}

function syncSidebarMode(){
  const main = document.querySelector('.main');
  const isSections = state.category === 'all';
  const wasSections = document.body.classList.contains('sections-mode');
  if(wasSections === isSections) return;

  // Отключаем transition на момент смены режима, чтобы не было скачка
  if(main){
    const prevTrans = main.style.transition;
    main.style.transition = 'none';
    document.body.classList.toggle('sections-mode', isSections);
    void main.offsetHeight;
    main.style.transition = prevTrans;
  } else {
    document.body.classList.toggle('sections-mode', isSections);
  }
}

function render(){
  renderActiveFilters();
  updateRainbowProgress();
  updateEmergencyButton();
  updateBlToggle();
  updateFavToggle();
  renderStatusTabs();
  syncSidebarMode();
  renderGrid();
}
  
  /* ============ ПРОСМОТР ============ */
function goToFilter(opts){
  const vm = document.getElementById('viewModal');
  if(vm) vm.classList.remove('on');
  if(opts.category) state.category = opts.category;
  if('typeFilter' in opts) state.typeFilter = opts.typeFilter;
  if('tagFilter' in opts) state.tagFilter = opts.tagFilter;
  if(opts.status) state.status = opts.status;
  if(opts.blOnly) state.blOnly = true;
  
  state.search = '';
  const searchInp = document.getElementById('search');
  if(searchInp) searchInp.value = '';
  updateSearchClear();
  saveCat();
  renderTabs();
  render();
  const content = document.querySelector('.content');
  if(content) content.scrollTop = 0;
}
