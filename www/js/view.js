'use strict';

/* ==========================================================
   view.js — Окно просмотра карточки: openView, листание сезонов, свайпы, обложка на весь экран
   ========================================================== */

function openCoverFullscreen(it){
  const modal = document.getElementById('coverViewModal');
  const img = document.getElementById('coverViewImg');
  if(!modal || !img) return;

  modal.dataset.itemId = it.id;

  const thumbSrc  = getCachedCoverUrl(it.id + '_card', it.cover);
  const fullCache = getCachedCoverUrl(it.id + '_full', it.cover) || it.cover;
  const isManaged = /image\.tmdb\.org|s4\.anilist\.co/.test(it.cover);
  const hi = isManaged ? hiResCoverUrl(it.cover) : fullCache;
  const finalSrc = (isManaged && hi !== fullCache) ? hi : fullCache;

  // Полный сброс прошлого состояния и размеров
  modal.classList.remove('visible');
  modal.classList.remove('on');
  img.removeAttribute('src');
  img.style.width = '';
  img.style.height = '';
  img.style.maxWidth = '';
  img.style.maxHeight = '';
  void modal.offsetWidth;

  // Сначала — миниатюр (мгновенно из кэша)
  img.src = thumbSrc || finalSrc;

  const reveal = () => {
    if(modal.dataset.itemId !== it.id) return;

    // Считаем и фиксируем размер по соотношению сторон и свободному месту
    const cs = getComputedStyle(modal);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop)  || 0) + (parseFloat(cs.paddingBottom) || 0);
    const availW = window.innerWidth  - padX;
    const availH = window.innerHeight - padY;

    const nw = img.naturalWidth  || 1;
    const nh = img.naturalHeight || 1;
    const ratio = nw / nh;

    let w = availW;
    let h = w / ratio;
    if(h > availH){ h = availH; w = h * ratio; }

    img.style.width    = w + 'px';
    img.style.height   = h + 'px';
    img.style.maxWidth  = 'none';
    img.style.maxHeight = 'none';

    modal.classList.add('on');
    void modal.offsetWidth;
    modal.classList.add('visible');
  };

  img.decode().then(reveal).catch(reveal);

  // В фоне — полноразмер. Размер img уже зафиксирован, поэтому подмена
  // src не изменит его ни на пиксель: станет только резче
  if(finalSrc !== img.src){
    const pre = new Image();
    pre.src = finalSrc;
    pre.decode().then(() => {
      if(modal.dataset.itemId !== it.id) return;
      img.src = finalSrc;
    }).catch(() => {});
  }
}  

let _sliding = false;
function slideToView(newId, direction){
  if(_sliding){ return; }
  const stage = document.getElementById('viewStage');
  const oldPanel = document.getElementById('viewPanel');
  if(!stage || !oldPanel){ openView(newId); return; }

  _sliding = true;

  const oldH = oldPanel.offsetHeight;
  stage.style.height = oldH + 'px';

  const exitX  = direction === 'next' ? -100 : 100;
  const enterX = direction === 'next' ? 100 : -100;
  const duration = 240;
  const ease = 'cubic-bezier(.4,0,.2,1)';

  let clone = null;
  const cleanup = () => {
    if(clone && clone.parentNode) clone.remove();
    stage.style.height = '';
    const np = document.getElementById('viewPanel');
    if(np){
      np.style.visibility = '';
      np.style.transition = '';
      np.style.transform = '';
      np.style.opacity = '';
      np.style.willChange = '';
    }
    _sliding = false;
  };

  try {
    // Клон готовим ДО вставки в DOM — задаём все стили, чтобы первый кадр
    // совпадал с финальным состоянием «стоит на месте», без рывка
    clone = oldPanel.cloneNode(true);
    clone.classList.add('clone');
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    clone.style.transition = 'none';
    clone.style.transform = 'translateX(0)';
    clone.style.opacity = '1';
    clone.style.willChange = 'transform, opacity';
    stage.appendChild(clone);

    oldPanel.style.visibility = 'hidden';

    openView(newId);

    const newPanel = document.getElementById('viewPanel');
    if(!newPanel){ cleanup(); return; }

    newPanel.style.visibility = '';
    newPanel.style.transition = 'none';
    newPanel.style.transform = 'translateX(' + enterX + 'px)';
    newPanel.style.opacity = '0';
    newPanel.style.willChange = 'transform, opacity';

    void newPanel.offsetWidth;

    requestAnimationFrame(() => {
      clone.style.transition = 'transform ' + duration + 'ms ' + ease + ', opacity ' + duration + 'ms ease';
      clone.style.transform = 'translateX(' + exitX + 'px)';
      clone.style.opacity = '0';

      newPanel.style.transition = 'transform ' + duration + 'ms ' + ease + ', opacity ' + duration + 'ms ease';
      newPanel.style.transform = 'translateX(0)';
      newPanel.style.opacity = '1';

      setTimeout(cleanup, duration + 30);
    });
  } catch(e){
    console.error('[slideToView]', e);
    cleanup();
  }
}
  
function openView(id){
  const it = items.find(x => x.id === id);
  if(!it) return;
  const T = TYPES[it.type] || {label:'—', icon:SVG_ICONS.help};
  const group = groupOf(it.type);
  const isMobile = window.innerWidth < 700;
  const panel = document.getElementById('viewPanel');
  panel.classList.remove('expanded');

  const viewCoverKey = it.id + '_full';
const viewReadyUrl = getCachedCoverUrl(viewCoverKey, it.cover);
let coverImg;
if(it.cover && viewReadyUrl){
  coverImg = `<img class="view-cover-img" src="${esc(viewReadyUrl)}" alt="" decoding="async">`;
} else if(it.cover && !/image\.tmdb\.org|s4\.anilist\.co/.test(it.cover)){
  // Ручная обложка: сразу ставим src, без асинхронной подмены — иначе картинка мигает
  coverImg = `<img class="view-cover-img" src="${esc(it.cover)}" alt="" style="display:none"><span class="view-cover-fallback">${T.icon}</span>`;
} else if(it.cover){
  coverImg = `<img class="view-cover-img" data-cover-key="${viewCoverKey}" data-cover-url="${esc(it.cover)}" data-cover-full="1" alt="" style="display:none" onload="this.style.display='block'; var f=this.parentNode.querySelector('.view-cover-fallback'); if(f) f.style.display='none';" onerror="this.remove();"><span class="view-cover-fallback">${T.icon}</span>`;
} else {
  coverImg = `<span class="view-cover-fallback">${T.icon}</span>`;
}
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
  const mainStatus = effectiveStatus(it);
const sCol = statusColor(mainStatus);
const sLbl = statusLabel(mainStatus, it.type);
const statusPill = `<span class="view-pill status-pill" data-filter-status="${esc(mainStatus)}" style="--dot-c:${sCol};--dot-bg:${hexToRgba(sCol,.14)}"><span class="status-dot"></span>${esc(sLbl)}</span>`;
  const ratingPill = it.rating
  ? `<span class="view-rating" style="--rate-bright:hsl(${hueFor(it.rating).toFixed(1)}, 80%, 68%)"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${esc(it.rating)}/10</span>`
  : '';
  const blPill = (it.bl && showBl) ? `<span class="view-pill bl-pill" data-filter-bl="1">BL</span>` : '';

let projectPill = '';
if ((group === 'screen' || group === 'comic') && it.projectStatus) {
  let pLabel = '';
  if (it.projectStatus === 'completed') pLabel = 'Завершено';
  else if (it.projectStatus === 'ongoing') pLabel = 'Онгоинг';
  else if (it.projectStatus === 'announced') pLabel = 'Анонс';
  if (pLabel) {
     projectPill = `<span class="view-pill project-pill ${it.projectStatus}">${pLabel}</span>`;
  }
}
const favPill = `<button type="button" class="view-pill fav-pill ${it.favorite ? 'on' : ''}" id="favToggleBtn" title="${it.favorite ? 'Убрать из избранного' : 'В избранное'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`;
const hasCover = !!it.cover;

      let linksRowHTML = '';
 if(group === 'screen'){
   let btns = '';
   const seasons = getSeasons(it.id);
   
   // Сезоны или обычные ссылки
   if (seasons.length > 0) {
     seasons.forEach(s => {
       if (s.link) {
          btns += `<button type="button" class="view-link-btn dub" data-href="${esc(s.link)}" title="${esc(s.seasonNumber)} сезон | Озвучка">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>S${s.seasonNumber} | Озв.
          </button>`;
       }
       if (s.link_sub) {
          btns += `<button type="button" class="view-link-btn sub" data-href="${esc(s.link_sub)}" title="${esc(s.seasonNumber)} сезон | Оригинал / субтитры">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="6" y1="14" x2="14" y2="14"/><line x1="6" y1="11" x2="10" y2="11"/></svg>S${s.seasonNumber} | Sub
          </button>`;
       }
     });
   } else {
     if (it.link) {
       btns += `<button type="button" class="view-link-btn dub" data-href="${esc(it.link)}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>Озвучка
       </button>`;
     }
     if (it.link_sub) {
       btns += `<button type="button" class="view-link-btn sub" data-href="${esc(it.link_sub)}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="6" y1="14" x2="14" y2="14"/><line x1="6" y1="11" x2="10" y2="11"/></svg>Оригинал
       </button>`;
     }
   }
   
   // Экстры / Скачивание (YTS)
   if (it.link_extras) {
      // Если у нас формат JSON с магнитами (для любого типа)
      if (it.link_extras.startsWith('json:')) {
         try {
            const linksMap = JSON.parse(it.link_extras.substring(5));
            const sortedQualities = Object.keys(linksMap).sort((a, b) => parseInt(b) - parseInt(a));
            let pillsHtml = sortedQualities.map(q => {
               const data = linksMap[q];
               const href = typeof data === 'string' ? data : data.magnet;
               return `<button type="button" class="download-pill" data-href="${esc(href)}">${q}</button>`;
            }).join('');

            btns += `<div class="download-dropdown-wrap">
              <button type="button" class="view-link-btn extras" id="btnDownloadTrigger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Скачать
              </button>
              <div class="download-dropdown" id="downloadMenu">
                ${pillsHtml}
              </div>
            </div>`;
         } catch(e) {
            btns += `<button type="button" class="view-link-btn extras" data-href="${esc(it.link_extras)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Скачать
            </button>`;
         }
      } else {
         // Обычная ссылка (не JSON)
         const isMovie = (it.type === 'movie');
         const btnLabel = isMovie ? 'Скачать' : 'Экстры';
         const btnIcon = isMovie 
           ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
           : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
         
         btns += `<button type="button" class="view-link-btn extras" data-href="${esc(it.link_extras)}">
            ${btnIcon}${btnLabel}
         </button>`;
      }
   }
   
   if (btns) {
     linksRowHTML = `<div class="view-links"><span class="view-links-label">Смотреть:</span><div class="view-links-btns">${btns}</div></div>`;
   }

} else if(group === 'book' || group === 'comic') {
  let btns = '';
  // Для shlib.life-комиксов общую «Открыть/Читать» не рисуем —
// её заменяет специализированная кнопка «Slashlib» ниже (тот же href).
if (it.link && !it.link.includes('shlib.life')) {
  const isFicbook = it.link.includes('ficbook.net');
    const lbl = isFicbook ? 'Читать' : 'Открыть';
    btns += `<button type="button" class="view-link-btn book" data-href="${esc(it.link)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5v13"/><path d="M2 6.5c3.5-1.5 7-1.5 10 0 3-1.5 6.5-1.5 10 0v13c-3.5-1.5-7-1.5-10 0-3-1.5-6.5-1.5-10 0z"/></svg>${lbl}
    </button>`;
    if (isFicbook) {
      btns += `<button type="button" class="view-link-btn btn-ficbook-dl" id="btnDlFicbook" style="margin-left:8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Скачать FB2</button>`;
    }
  }
     // Внутри openView, в блоке if(group === 'comic') или else if (group === 'book' || group === 'comic')
  if (it.link && it.link.includes('shlib.life')) {
  btns += `<button type="button" class="view-link-btn book" data-href="${esc(it.link)}" style="margin-left:8px;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Slashlib
  </button>`;
}
  if (it.link_comizy) {
  btns += `<button type="button" class="view-link-btn comizy-btn" data-href="${esc(it.link_comizy)}" style="margin-left:8px;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Comizy
  </button>`;
}
  if (btns) {
    linksRowHTML = `<div class="view-links"><span class="view-links-label">Читать:</span><div class="view-links-btns">${btns}</div></div>`;
  }
 
 
} else if(group === 'music') {
  const searchQuery = (it.title || '') + (it.country ? ' ' + it.country : '');
  linksRowHTML = `<div class="view-links">
    <span class="view-links-label">Слушать:</span>
    <div class="view-links-btns">
      <button type="button" class="view-link-btn play-music-btn" onclick="Player.playFromCard('${it.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Играть
      </button>
      <button type="button" class="view-link-btn vkx" data-vkx-query="${esc(searchQuery)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Найти в VK X
      </button>
    </div>
  </div>`;
 }
   

let sublines = [];
if(group === 'music'){
  if(it.country) sublines.push(`<div class="view-subline">${esc(it.country)}</div>`);
  if(it.year)    sublines.push(`<div class="view-subline year-line">${esc(it.year)}</div>`);
} else if(group === 'book'){
  const parts = [];
  if(it.country) parts.push(esc(it.country));
  if(it.year)    parts.push(esc(it.year));
  if(parts.length) sublines.push(`<div class="view-subline">${parts.join(', ')}</div>`);
} else {
  if(!isMobile && it.title_en){
    sublines.push(`<div class="view-subline title-en">${esc(it.title_en)}</div>`);
  }
  const parts = [];
  if(it.year)    parts.push(esc(it.year));
  if(it.country) parts.push(esc(it.country));
  const sc = seasonCountLabel(it);
  if(sc) parts.push(sc);
  if(parts.length) sublines.push(`<div class="view-subline">${parts.join(', ')}</div>`);
}

// Вставляем оценку в 3-ю строку, если нет — во 2-ю, если нет — создаём новую
if (ratingPill) {
  const ratingInline = `<span class="view-rating-inline">${ratingPill}</span>`;
  if (sublines.length >= 2) {
  sublines[1] = sublines[1].replace(/<\/div>$/, ` ${ratingInline}</div>`);
} else if (sublines.length === 1) {
  sublines[0] = sublines[0].replace(/<\/div>$/, ` ${ratingInline}</div>`);
} else {
    sublines.push(`<div class="view-subline">${ratingInline}</div>`);
  }
}

const sublineHtml = sublines.join('');

  const pagesPill = ((group === 'book' && it.pages) || (group === 'comic' && it.pages))
  ? `<span class="view-pill">${SVG_ICONS.page} ${esc(it.pages)} ${group === 'comic' ? 'гл.' : 'стр.'}</span>`
  : '';
  const tags = (it.tags && it.tags.length)
? `<div class="view-tags-wrap">
     <button class="tags-arrow-btn" id="tagsExpandBtn" style="display:none;" title="Показать все теги">
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
     </button>
     <div class="view-tags" id="viewTagsContainer" style="max-height:30px">${it.tags.map(t => `<span class="view-tag" data-filter-tag="${esc(t)}">${esc(t)}</span>`).join('')}</div>
   </div>`
: '';
  const descTitle = (group === 'music') ? 'Текст песни' : 'Описание';
const descBlock = (it.description)
  ? `<div class="view-section">
       <div class="view-section-title">${descTitle}</div>
       <div class="view-notes desc-block clampable" id="descBody">${esc(it.description)}</div>
       <button class="expand-btn" id="descBtn">Показать полностью</button>
     </div>`
  : '';
  // Заметки показываем только если они не пустые
const notesBlock = (it.notes && String(it.notes).trim())
  ? `<div class="view-section">
       <div class="view-section-head">
         <div class="view-section-title">Заметки</div>
         <button type="button" class="notes-edit-btn" id="notesEditBtn" title="Редактировать заметки">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
         </button>
       </div>
       <div class="view-notes notes-block clampable" id="notesBody">${esc(it.notes)}</div>
       <button class="expand-btn" id="notesBtn">Показать полностью</button>
     </div>`
  : '';
  // Метки времени — только для фильмов / сериалов / дорам
  const momentsBlock = (group === 'screen' || group === 'book' || group === 'comic')
    ? `<div class="view-section">
         <div class="view-section-title">${group === 'screen' ? 'Метки времени' : 'Метки'}</div>
         <div class="moments-box" id="momentsBox"></div>
       </div>`
    : '';

  const heartsView = (heartsEnabled && !state.emergencyMode && heartsVal > 0)
  ? '<div class="view-hearts">' + heartsRowHTML(heartsVal) + '</div>'
  : '';

  const isSquare = (group === 'music');
  const viewLeftClass = 'view-left' + (isSquare ? ' square' : '');
  const coverHClass = 'view-cover-h' + (isSquare ? ' square' : '') + (hasCover ? ' tappable' : '');
const hasSlashlib = group === 'comic' && it.link && it.link.includes('shlib.life');
const hasComizy = group === 'comic' && it.link_comizy && it.link_comizy.includes('comizy.io');
const showReadBtn = hasSlashlib || hasComizy;
  const showComizyReadBtn = group === 'comic' && it.link_comizy && it.link_comizy.includes('comizy.io');
  
    panel.innerHTML = `
    <div class="view-body">
      <div class="view-header">
        <div class="${viewLeftClass}">
  <div class="view-cover-wrap">
    <div class="${coverHClass}">
      ${coverImg}
      ${cornerHTML}
    </div>
  </div>
</div>
        <div class="view-info">
          ${(isMobile && group !== 'music' && it.title_en)
            ? `<h3 class="view-title-h"><span>${esc(it.title || 'Без названия')}</span><span class="view-title-sep">|</span><span class="view-title-en">${esc(it.title_en)}</span></h3>`
            : `<h3 class="view-title-h">${esc(it.title || 'Без названия')}</h3>`}
          ${sublineHtml}
                                    <div class="view-pills">
${pagesPill}
<span class="view-pill" data-filter-type="${esc(it.type)}">${T.icon} ${T.label}</span>
${projectPill}
${statusPill}
  ${isMobile ? '' : blPill}
  ${isMobile ? '' : favPill}
</div>
${isMobile
  ? ((heartsView || blPill || favPill) ? `<div class="view-rating-row">${heartsView}${blPill}${favPill}</div>` : '')
  : heartsView}
          ${tags}
          ${linksRowHTML}
        </div>
      </div>
      ${descBlock}
      ${momentsBlock}
      ${notesBlock}
    </div>
        <div class="view-footer">
  <div class="actions">
${showReadBtn ? `<button class="btn btn-read-manga" id="btnReadSlashlib" title="Читать в приложении">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  Читать
</button>` : ''}
    <button class="btn primary refresh-btn" id="viewRefresh" title="Обновить данные">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 10 15 10"/></svg>
</button>
<button class="btn primary edit-btn" id="viewEdit" title="Редактировать">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
</button>
    <button class="btn ghost view-close-btn" id="viewClose">Закрыть</button>
  </div>
</div>`;

  const viewBody = panel.querySelector('.view-body');
  if(viewBody) viewBody.scrollTop = 0;

  // Градиент над футером скрываем, когда докрутили до конца (и когда скроллить нечего)
  const viewFooter = panel.querySelector('.view-footer');
  if(viewBody && viewFooter){
    const checkBottom = () => {
      const atBottom = viewBody.scrollTop + viewBody.clientHeight >= viewBody.scrollHeight - 20;
      viewFooter.classList.toggle('at-bottom', atBottom);
    };
    viewBody.addEventListener('scroll', checkBottom, { passive: true });
    checkBottom();
    requestAnimationFrame(checkBottom);
    // высота содержимого меняется (раскрытие описания/заметок, добавление меток) — пересчитываем
    if(window.ResizeObserver){
  if(panel._ro){ try{ panel._ro.disconnect(); }catch(e){} }
  panel._ro = new ResizeObserver(checkBottom);
  panel._ro.observe(viewBody);
  Array.from(viewBody.children).forEach(c => panel._ro.observe(c));
    }
  }

    requestAnimationFrame(() => {
  // На телефонах (узкий экран) не подстраиваем обложку под высоту —
  // там своя вертикальная раскладка через CSS
  if(window.innerWidth < 640) return;

  const infoEl = panel.querySelector('.view-info');
  const leftEl = panel.querySelector('.view-left');
  const coverEl = panel.querySelector('.view-cover-h');
  if(!infoEl || !leftEl || !coverEl) return;
  const infoH = infoEl.offsetHeight;
  if(infoH <= 0) return;
  const ratio = isSquare ? 1 : (2/3);
  const minW = isSquare ? 170 : 148;
  const maxW = 340;
  const calcW = infoH * ratio;
let coverW = Math.round(Math.max(minW, Math.min(calcW, maxW)));
// Округляем до чётного, чтобы высота через aspect-ratio 2/3 была целой
// и маска эмбиента рендерилась без субпиксельных артефактов
coverW = Math.round(coverW / 2) * 2;
coverEl.style.width = coverW + 'px';
leftEl.style.flex = '0 0 ' + coverW + 'px';
});

// Ambient glow — подкладываем ту же картинку размытой позади обложки
// Подгружаем обложку в высоком качестве (из кэша) и настраиваем ambient
if(it.cover){
  const fullImg = panel.querySelector('.view-cover-img');
  const wrapEl = panel.querySelector('.view-cover-wrap');
  const isSquare = groupOf(it.type) === 'music';

  // Сначала кладём в ambient уменьшенную версию (общую с карточкой в списке)
const isManagedCover = /image\.tmdb\.org|s4\.anilist\.co/.test(it.cover);
if(!isManagedCover){
  // Ручная обложка: обложка и фон-эмбиент берут ОДИН И ТОТ ЖЕ адрес сразу, без ожидания fetch
  // и без последующей подмены src — это и убирает мерцание.
  const shownSrc = (fullImg && fullImg.getAttribute('src')) || it.cover;
  if(wrapEl) wrapEl.style.setProperty('--ambient-img', 'url("' + shownSrc + '")');
  if(fullImg){
    const showIt = () => {
      fullImg.style.display = 'block';
      _manualUrlsOk.add(it.cover);
      const f = fullImg.parentNode && fullImg.parentNode.querySelector('.view-cover-fallback');
      if(f) f.style.display = 'none';
    };
    fullImg.onerror = () => fullImg.remove();
    if(fullImg.complete && fullImg.naturalWidth) showIt(); else fullImg.onload = showIt;
  }
  // в кэш кладём тихо, на экран результат не выводим
  if(!/^data:/i.test(it.cover)){
    ensureManualCover(it.id + '_card', it.cover, coverWidthFor('card')).catch(() => {});
  }
} else {
(async () => {
  const ambientBlob = await ensureCover(it.id + '_card', it.cover, coverWidthFor('card'));
  if(ambientBlob && wrapEl){
    wrapEl.style.setProperty('--ambient-img', `url("${ambientBlob}")`);
  } else if(wrapEl){
    wrapEl.style.setProperty('--ambient-img', `url("${it.cover}")`);
  }
})();

  // Полную версию — в основную обложку
(async () => {
  if(!fullImg) return;
  const fullBlob = await ensureCover(it.id + '_full', it.cover, coverWidthFor('view'));
  if(fullBlob){
    fullImg.src = fullBlob;
    fullImg.style.display = 'block';
    const f = fullImg.parentNode.querySelector('.view-cover-fallback');
    if(f) f.style.display = 'none';
  }
})();
}
}

  if(hasCover){
    const coverEl = panel.querySelector('.view-cover-h');
    if(coverEl){
      coverEl.onclick = (e) => {
        e.stopPropagation();
        openCoverFullscreen(it);
      };
    }
  }
  const btnDlFicbook = panel.querySelector('#btnDlFicbook');
if (btnDlFicbook) {
  btnDlFicbook.onclick = (e) => {
    e.stopPropagation();
    downloadFicbookFic(it.link, it.title, it.country, btnDlFicbook);
  };
}
const btnReadSlashlib = panel.querySelector('#btnReadSlashlib');
if (btnReadSlashlib) {
  btnReadSlashlib.onclick = async (e) => {
    e.stopPropagation();

    const origHTML = btnReadSlashlib.innerHTML;
    btnReadSlashlib.disabled = true;
    btnReadSlashlib.innerHTML = 'Загружаю...';

    try {
      // ═══ ВЫБОР ПО ЯЗЫКУ ═══
// ru → SlashLib, en → Comizy. Если выбранный источник недоступен — fallback.
const lang = SlashLibReader._settings?.language || 'ru';
let useComizy;
if (lang === 'en') useComizy = hasComizy;
else useComizy = !hasSlashlib && hasComizy;

      // ═══ COMIZY ═══
if (useComizy) {
  const slug = (it.link_comizy.match(/comizy\.io\/([^\/?#]+)/) || [])[1];
  if (!slug) throw new Error('Нет slug в ссылке Comizy');

  let details = null;
  try {
    details = await ComizyParser.getMangaDetails(slug);
  } catch(e) {
    console.warn('[Comizy] getMangaDetails failed:', e.message);
  }

  if (!details || !details.hid) {
    // Fallback на SlashLib, если Comizy недоступен
    if (hasSlashlib) {
      console.warn('[Comizy] недоступен, fallback на SlashLib');
      btnReadSlashlib.disabled = false;
      btnReadSlashlib.innerHTML = origHTML;
      // Переключаем на SlashLib принудительно
      toast('Comizy недоступен, открываю SlashLib', 'warn');
      useComizy = false;
    } else {
      throw new Error('Comizy недоступен (502). Попробуй позже.');
    }
  }

  if (useComizy) {
    const chapters = await ComizyParser.getChaptersFor(details.hid, slug, it.link);
    if (!chapters || !chapters.length) throw new Error('Нет глав');
    chapters.sort((a, b) => a.number - b.number);

    const fullSlug = 'comizy:' + slug;

    let progress = null;
    try {
      const p = JSON.parse(localStorage.getItem('polka_reader_progress') || '{}')[fullSlug];
      if (p && p.chapterId) progress = p;
    } catch(err) {}

    let target = progress ? chapters.find(c => c.id === progress.chapterId) : null;
    if (!target) target = chapters[0];

    const rawPages = await ComizyParser.getChapterPages(slug, target.slug);
    if (!rawPages || !rawPages.length) throw new Error('Нет страниц в главе');

    const filtered = rawPages.filter(p => !(p.width && p.height && p.width / p.height > 1.2));
    if (!filtered.length) throw new Error('Все страницы отфильтрованы');

    const pages = filtered.map(p => ({
      image: '',
      url: p.url,
      width: p.width,
      height: p.height,
      chapterId: target.id,
      volume: 1,
      number: target.number
    }));

    const chaptersList = chapters.map(c => ({
      id: c.id,
      volume: 1,
      number: c.number,
      name: c.name,
      slug: c.slug,
      textual: !!c.textual
    }));

    SlashLibReader.open(
      fullSlug,
      target.id,
      1,
      target.number,
      pages,
      details.title + ' - Chapter ' + target.number,
      progress,
      chaptersList,
      it.id,
      'comizy'
    );

    document.getElementById('viewModal').classList.remove('on');
    return;
  }

      }

      // ═══ SLASHLIB ═══
      const token = localStorage.getItem('slashlib_token');
      if (!token) { toast('Нужно войти в SlashLib', 'error'); return; }

      const fullSlug = (it.link.match(/\/manga\/([^\/?#]+)/) || [])[1];
      if (!fullSlug) { toast('Не удалось определить slug', 'error'); return; }

      let progress = {};
      try { progress = JSON.parse(localStorage.getItem('polka_reader_progress') || '{}')[fullSlug] || null; } catch(err){}

      const listRes = await nativeFetch(`https://api.cdnlibs.org/api/manga/${fullSlug}/chapters`, {
        'Authorization': 'Bearer ' + token, 'Site-Id': '2',
        'Origin': 'https://v2.shlib.life', 'Referer': 'https://v2.shlib.life/'
      });
      if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          toast('Токен SlashLib истёк. Войди заново', 'error');
          try {
            localStorage.removeItem('slashlib_token');
            localStorage.removeItem('slashlib_token_valid');
          } catch(e) {}
        } else {
          toast('Ошибка API SlashLib: ' + listRes.status, 'error');
        }
        return;
      }
      let listJson;
      try {
        listJson = await listRes.json();
      } catch(e) {
        toast('SlashLib вернул не JSON. Попробуй войти заново', 'error');
        return;
      }
      const chaptersList = listJson.data || [];
      if (!chaptersList.length) { toast('Глав не найдено', 'warn'); return; }

      let targetChapter = null;
      if (progress && progress.chapterId) {
        targetChapter = chaptersList.find(c => c.id === progress.chapterId);
      }
      if (!targetChapter) targetChapter = chaptersList[0];

      const chapRes = await nativeFetch(`https://api.cdnlibs.org/api/manga/${fullSlug}/chapter?volume=${targetChapter.volume}&number=${targetChapter.number}`, {
        'Authorization': 'Bearer ' + token, 'Site-Id': '2',
        'Origin': 'https://v2.shlib.life', 'Referer': 'https://v2.shlib.life/'
      });
      if (!chapRes.ok) {
        if (chapRes.status === 401 || chapRes.status === 403) {
          toast('Токен SlashLib истёк. Войди заново', 'error');
          try {
            localStorage.removeItem('slashlib_token');
            localStorage.removeItem('slashlib_token_valid');
          } catch(e) {}
        } else {
          toast('Ошибка загрузки главы: ' + chapRes.status, 'error');
        }
        return;
      }
      let chapJson;
      try {
        chapJson = await chapRes.json();
      } catch(e) {
        toast('SlashLib вернул не JSON. Попробуй войти заново', 'error');
        return;
      }
      const chapData = chapJson.data;

      if (!chapData || !chapData.pages || !chapData.pages.length) {
        toast('Не удалось загрузить страницы', 'error');
        return;
      }

      const title = `${it.title} - Том ${chapData.volume} Глава ${chapData.number}`;

      SlashLibReader.open(fullSlug, chapData.id, chapData.volume, chapData.number, chapData.pages, title, progress, chaptersList, it.id, 'slashlib');
      document.getElementById('viewModal').classList.remove('on');

    } catch(err) {
      console.error('[Read]', err);
      toast('Ошибка: ' + err.message, 'error');
    } finally {
      btnReadSlashlib.disabled = false;
      btnReadSlashlib.innerHTML = origHTML;
    }
  };
}

  const btnReadComizy = panel.querySelector('#btnReadComizy');
if (btnReadComizy) {
  btnReadComizy.onclick = async (e) => {
    e.stopPropagation();
    const origHTML = btnReadComizy.innerHTML;
    btnReadComizy.disabled = true;
    btnReadComizy.innerHTML = 'Загружаю...';

    try {
      const slug = (it.link_comizy.match(/comizy\.io\/([^\/?#]+)/) || [])[1];
      if (!slug) throw new Error('Нет slug в ссылке');

      const details = await ComizyParser.getMangaDetails(slug);
      if (!details || !details.hid) throw new Error('Не удалось получить данные манги');

      const chapters = await ComizyParser.getChapters(details.hid);
      if (!chapters || !chapters.length) throw new Error('Нет глав');
      chapters.sort((a, b) => a.number - b.number);

      const fullSlug = 'comizy:' + slug;

      let progress = null;
      try {
        const p = JSON.parse(localStorage.getItem('polka_reader_progress') || '{}')[fullSlug];
        if (p && p.chapterId) progress = p;
      } catch(err) {}

      let target = progress ? chapters.find(c => c.id === progress.chapterId) : null;
      if (!target) target = chapters[0];

      const rawPages = await ComizyParser.getChapterPages(slug, target.slug);
      if (!rawPages || !rawPages.length) throw new Error('Нет страниц в главе');

      const filtered = rawPages.filter(p => !(p.width && p.height && p.width / p.height > 1.2));
      if (!filtered.length) throw new Error('Все страницы отфильтрованы как дисклеймеры');

      const pages = filtered.map(p => ({
        image: '',
        url: p.url,
        chapterId: target.id,
        volume: 1,
        number: target.number
      }));

      const chaptersList = chapters.map(c => ({
        id: c.id,
        volume: 1,
        number: c.number,
        name: c.name,
        slug: c.slug,
      textual: !!c.textual
      }));

      SlashLibReader.open(
        fullSlug,
        target.id,
        1,
        target.number,
        pages,
        details.title + ' - Chapter ' + target.number,
        progress,
        chaptersList,
        it.id,
        'comizy'
      );

      document.getElementById('viewModal').classList.remove('on');
    } catch(err) {
      console.error('[Comizy read]', err);
      toast('Ошибка: ' + err.message, 'error');
    } finally {
      btnReadComizy.disabled = false;
      btnReadComizy.innerHTML = origHTML;
    }
  };
}

// Запускаем инициализацию читалки при старте
setTimeout(() => SlashLibReader.init(), 100);
  
// Обработчик для кнопок ссылок (озвучка, оригинал, экстры)
panel.querySelectorAll('.view-link-btn[data-href]').forEach(btn => {
  btn.onclick = (e) => {
    e.stopPropagation();
    const href = btn.dataset.href;

    // Magnet открываем через скрытый <a>
    if (href.startsWith('magnet:')) {
      const a = document.createElement('a');
      a.href = href;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    
    const ok = safeLink(href);
    if(!ok) return;
    
    // Логика скачивания с Flibusta
    if(href.includes('flibusta.club')){
      const safeName = (it.title || 'book').replace(/[\\\/:*?"<>|]/g, '_').trim().slice(0, 60);
      const cleanUrl = ok.replace('format=fb2.zip', 'format=fb2').replace('format=txt.zip', 'format=txt');
      const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(cleanUrl);
      downloadViaProxy(proxyUrl, safeName + '.fb2');
      return;
    }
    
    // Всё остальное (озвучка, оригинал, экстры) — открываем в новой вкладке
    window.open(ok, '_blank', 'noopener,noreferrer');
  };
});

// ДОБАВЛЯЕМ ОБРАБОТЧИК ДЛЯ VK X
panel.querySelectorAll('.vkx[data-vkx-query]').forEach(btn => {
  btn.onclick = async (e) => {
    e.stopPropagation();
    const q = btn.dataset.vkxQuery;
    const AppSearch = window.Capacitor?.Plugins?.AppSearch;
    if (!AppSearch) return toast('Плагин не установлен', 'error');

    try {
      // Если у нас есть ссылка на трек (сохраненная при шаринге), открываем её
      if (it.link && /vk\.(com|ru)\/audio/.test(it.link)) {
        await AppSearch.openLink({ url: it.link, packageName: 'ua.itaysonlab.vkx' });
      } else {
        // Иначе шлем поиск (даже если VK X его игнорирует, приложение откроется)
        await AppSearch.openSearch({ query: q, packageName: 'ua.itaysonlab.vkx' });
      }
    } catch (err) {
      toast('Не удалось открыть VK X', 'error');
    }
  };
});  
// === ЛОГИКА ДЛЯ ВЫПАДАЮЩЕГО МЕНЮ "СКАЧАТЬ" (YTS) ===
const dlTrigger = panel.querySelector('#btnDownloadTrigger');
const dlMenu = panel.querySelector('#downloadMenu');

if (dlTrigger && dlMenu) {
  // Открытие/закрытие по клику на саму кнопку
  dlTrigger.onclick = (e) => {
    e.stopPropagation(); // Чтобы клик не улетел в panel.onclick и не закрыл меню сразу же
    dlMenu.classList.toggle('on');
  };
  
  // Закрываем меню при клике в любое место карточки
  panel.onclick = (ev) => {
    // Если кликнули не по меню и не по кнопке — закрываем
    if (!dlMenu.contains(ev.target) && !dlTrigger.contains(ev.target)) {
      dlMenu.classList.remove('on');
    }
  };
  
  // Обработка кликов по таблеткам качества
  dlMenu.querySelectorAll('.download-pill').forEach(pill => {
    pill.onclick = (e) => {
      e.stopPropagation(); // Чтобы клик не улетел в panel.onclick
      const href = pill.dataset.href;
      if (href) {
        const a = document.createElement('a');
        a.href = href;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      dlMenu.classList.remove('on'); // Закрываем после выбора
    };
  });
}
  
  const notesEditBtn = panel.querySelector('#notesEditBtn');
  if(notesEditBtn){
    notesEditBtn.onclick = (e) => { e.stopPropagation(); openNotesModal(it.id); };
  }
  panel.querySelectorAll('[data-filter-type]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const t = el.dataset.filterType;
      const g = groupOf(t);
      const cat = (g === 'book') ? 'book' : (g === 'comic') ? 'comic' : (g === 'music') ? 'music' : 'screen';
      goToFilter({ category: cat, typeFilter: t });
    };
  });
  panel.querySelectorAll('[data-filter-status]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); goToFilter({ status: el.dataset.filterStatus }); };
  });
  panel.querySelectorAll('[data-filter-tag]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); goToFilter({ tagFilter: el.dataset.filterTag }); };
  });
  panel.querySelectorAll('[data-filter-bl]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); goToFilter({ blOnly: true }); };
  });
    const favBtn = panel.querySelector('#favToggleBtn');
if(favBtn){
  favBtn.onclick = (e) => {
    e.stopPropagation();
    it.favorite = !it.favorite;
    it.updatedAt = Date.now();
    save();
    favBtn.classList.toggle('on', it.favorite);
    favBtn.title = it.favorite ? 'Убрать из избранного' : 'В избранное';
    
    // Обновляем флажок на карточке в сетке БЕЗ перерисовки всей сетки
    const cardEl = document.querySelector(`.card[data-id="${it.id}"]`);
    if (cardEl) {
      let flag = cardEl.querySelector('.card-fav-flag');
      if (it.favorite) {
        if (!flag) {
          flag = document.createElement('div');
          flag.className = 'card-fav-flag';
          flag.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
          cardEl.querySelector('.cover').appendChild(flag);
        }
      } else {
        if (flag) flag.remove();
      }
    }
    
    // Если включён фильтр "Только избранное", карточка должна исчезнуть. 
    // В этом случае перерисовка нужна, но мы делаем её с задержкой, чтобы анимация кнопки успела пройти
    if (state.favOnly) {
      setTimeout(() => renderGrid(), 150);
    }
  };
}

  function setupExpandable(bodyId, btnId){
    const body = panel.querySelector('#' + bodyId);
    const btn = panel.querySelector('#' + btnId);
    if(!body || !btn) return;
    let fullH = 0, clampH = 130, hasOverflow = false;
    let isExpanded = false, locked = false;
    requestAnimationFrame(() => {
  const cs = getComputedStyle(body);
  const lh = parseFloat(cs.lineHeight) || 22;
  const padY = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0);
  clampH = Math.round(lh * 4 + padY);
  // НЕ сбрасываем max-height — scrollHeight его игнорирует
  fullH = body.scrollHeight;
  hasOverflow = fullH > clampH + 4;
  if(hasOverflow){
    body.style.maxHeight = clampH + 'px';
    body.classList.add('tappable');
    btn.classList.add('visible');
  } else {
    body.style.maxHeight = 'none';
    body.classList.remove('tappable');
    btn.classList.remove('visible');
  }
});
    const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    const toggle = () => {
      if(!hasOverflow || locked || panel._busy) return;
      locked = true; panel._busy = true;
      const vBody = panel.querySelector('.view-body');
      const section = body.closest('.view-section');
      const expanding = !isExpanded;
      isExpanded = expanding;
      body.classList.remove('tappable');
      btn.textContent = expanding ? 'Свернуть' : 'Показать полностью';
      body.classList.toggle('expanded', expanding);

      /* --- 1. Замеры: старт --- */
      const H0 = panel.getBoundingClientRect().height;
      const b0 = body.getBoundingClientRect().height;
      const s0 = vBody ? vBody.scrollTop : 0;
      body.style.maxHeight = 'none';
      fullH = body.getBoundingClientRect().height;      // свежая полная высота
      const b1 = expanding ? fullH : clampH;

      /* --- 2. Замеры: конечное состояние (синхронно, без отрисовки) --- */
      panel.style.height = ''; panel.style.maxHeight = '';
      body.style.maxHeight = b1 + 'px';
      panel.classList.toggle('expanded', expanding && b1 > clampH);
      const H1 = panel.getBoundingClientRect().height;
      let s1 = s0;
      if(vBody){
        const maxEnd = Math.max(0, vBody.scrollHeight - vBody.clientHeight);
        s1 = Math.min(s0, maxEnd);
        if(section){
          const top = section.getBoundingClientRect().top - vBody.getBoundingClientRect().top + vBody.scrollTop;
          const want = Math.max(0, top - 18);
          if(expanding) s1 = Math.min(want, maxEnd);       // раскрыли — показываем начало блока
          else s1 = 0;                                     // свернули — плавно едем в самый верх карточки (тем же прогрессом, что и сворачивание)
        }
      }

      /* --- 3. Возвращаем стартовое состояние и анимируем всё одним прогрессом --- */
      const hi = Math.max(H0, H1);
      panel.style.maxHeight = hi + 'px';
      panel.style.height = H0 + 'px';
      body.style.maxHeight = b0 + 'px';
      if(vBody) vBody.scrollTop = s0;

      const dist = Math.max(Math.abs(H1 - H0), Math.abs(b1 - b0), Math.abs(s1 - s0));
      // плавная (логарифмическая) зависимость: маленький текст — не «черепаха», огромный — не «ракета»
      const dur = Math.min(800, Math.max(320, 300 + 120 * Math.log(1 + dist / 100)));
      const tok = panel._tok;
      const t0 = performance.now();
      const finish = () => {
        panel.style.height = ''; panel.style.maxHeight = '';
        panel.classList.toggle('expanded', expanding && b1 > clampH);
        body.style.maxHeight = expanding ? 'none' : clampH + 'px';
        if(!expanding && hasOverflow) body.classList.add('tappable');
        if(vBody) vBody.scrollTop = s1;
        locked = false; panel._busy = false;
      };
      const step = (now) => {
        if(panel._tok !== tok){ locked = false; return; }
        const p = Math.min(1, (now - t0) / dur), e = ease(p);
        panel.style.height = (H0 + (H1 - H0) * e) + 'px';
        body.style.maxHeight = (b0 + (b1 - b0) * e) + 'px';
        if(vBody) vBody.scrollTop = s0 + (s1 - s0) * e;
        if(p < 1) requestAnimationFrame(step); else finish();
      };
      requestAnimationFrame(step);
    };
    body.onclick = toggle;
    btn.onclick = (e) => { e.stopPropagation(); toggle(); };
  }
  panel._tok = (panel._tok || 0) + 1; panel._busy = false;
  panel.style.height = ''; panel.style.maxHeight = '';
  setupExpandable('descBody', 'descBtn');
  setupExpandable('notesBody', 'notesBtn');

// Обработчик для тегов (без щелчков и паразитных анимаций)
const tagsContainer = panel.querySelector('#viewTagsContainer');
const tagsExpandBtn = panel.querySelector('#tagsExpandBtn');
if (tagsContainer && tagsExpandBtn) {
  let isExpanded = false;

  requestAnimationFrame(() => {
  tagsContainer.style.transition = 'none';
  tagsContainer.style.maxHeight = 'none';
  const fullHeight = tagsContainer.scrollHeight;
  tagsContainer.style.maxHeight = '26px';

// Убираем старые классы при каждом рендере
tagsContainer.querySelectorAll('.view-tag.fade-right').forEach(t => t.classList.remove('fade-right'));

if (fullHeight > 28) {
  tagsExpandBtn.style.display = 'flex';
  
  // Находим последний тег, который целиком поместился в первую строку
  const containerRect = tagsContainer.getBoundingClientRect();
  const tags = Array.from(tagsContainer.querySelectorAll('.view-tag'));
  let lastInRow = null;

  for (let i = 0; i < tags.length; i++) {
    const rect = tags[i].getBoundingClientRect();
    // Если верх тега ниже низа контейнера (ушёл на 2-ю строку) — стоп
    if (rect.top > containerRect.top + 15) break; 
    lastInRow = tags[i];
  }

  // Если после этого тега есть ещё теги (т.е. он не последний вообще) — вешаем градиент
  if (lastInRow && lastInRow.nextElementSibling) {
    lastInRow.classList.add('fade-right');
  }

    void tagsContainer.offsetHeight;
    tagsContainer.style.transition = '';
    

tagsExpandBtn.onclick = (e) => {
  e.stopPropagation();
  if (!isExpanded) {
    isExpanded = true;
    tagsExpandBtn.classList.add('open');
    tagsContainer.classList.add('expanded'); // <--- Добавили
    tagsContainer.style.maxHeight = fullHeight + 'px'; 
  } else {
    isExpanded = false;
    tagsExpandBtn.classList.remove('open');
    tagsContainer.classList.remove('expanded'); // <--- Убрали
    tagsContainer.style.maxHeight = '26px';
  }
};
  
  } else {
    tagsExpandBtn.style.display = 'none';
    tagsContainer.style.maxHeight = 'none';
    requestAnimationFrame(() => {
      tagsContainer.style.transition = '';
    });
  }
});
}

  bindMomentsBox(panel, it);
  
  

    const close = () => {
  const navL = document.getElementById('viewNavLeft');
  const navR = document.getElementById('viewNavRight');
  if(navL) navL.classList.add('hidden');
  if(navR) navR.classList.add('hidden');
  panel.style.transition = '';
  panel.style.transform = '';
  panel.style.opacity = '';
  panel.style.visibility = '';
  panel.style.willChange = '';
  panel.style.animation = '';
  const stage = document.getElementById('viewStage');
  if(stage) stage.querySelectorAll('.clone').forEach(c => c.remove());
  _sliding = false;
  document.getElementById('viewModal').classList.remove('on');
};
panel.querySelector('#viewClose').onclick = close;

(function setupSeasonNav(){
  const navL = document.getElementById('viewNavLeft');
  const navR = document.getElementById('viewNavRight');
  if(!navL || !navR) return;

  // Сбрасываем состояние кнопок от предыдущего сезона/карточки.
  // Без этого stale onclick «залипает» и уводит на тот же сезон бесконечно.
  navL.classList.add('hidden');
  navR.classList.add('hidden');
  navR.classList.remove('plus');
  navL.onclick = null;
  navR.onclick = null;

  const itGroup = groupOf(it.type);
const parentGroup = it.parentId ? groupOf((getMainItem(it) || {}).type) : itGroup;
if(itGroup !== 'screen' && parentGroup !== 'screen') return;

// Проверяем, завершён ли проект
let projStatus = it.projectStatus;
if (isSeason(it)) {
   const p = getMainItem(it);
   if (p) projStatus = p.projectStatus;
}
const isCompleted = (projStatus === 'completed');

let _preparing = false;
  function prepareAndSlide(targetId, direction) {
    if (_preparing || _sliding) return;

    const vBody = panel.querySelector('.view-body');
    const descBody = panel.querySelector('#descBody');
    const notesBody = panel.querySelector('#notesBody');
    const descBtn = panel.querySelector('#descBtn');
    const notesBtn = panel.querySelector('#notesBtn');

    let needsWait = false;

    if (descBody && descBody.classList.contains('expanded') && descBtn) {
      descBtn.click();
      needsWait = true;
    }
    if (notesBody && notesBody.classList.contains('expanded') && notesBtn) {
      notesBtn.click();
      needsWait = true;
    }
    if (vBody && vBody.scrollTop > 10) {
      vBody.scrollTo({ top: 0, behavior: 'smooth' });
      needsWait = true;
    }

    if (needsWait) {
  _preparing = true;
  setTimeout(() => {
    _preparing = false;
    slideToView(targetId, direction);
  }, 550);
} else {
  slideToView(targetId, direction);
    }
  }

  if(isSeason(it)){
    const parent = getMainItem(it);
    const siblings = parent ? getSeasons(parent.id) : [];
    const idx = siblings.findIndex(s => s.id === it.id);

    // Левая стрелка — всегда к предыдущему сезону или к родителю
    navL.textContent = '‹';
    navL.classList.remove('hidden');
    navL.onclick = (e) => {
      e.stopPropagation();
      const prevId = idx > 0 ? siblings[idx - 1].id : (parent ? parent.id : null);
      if(prevId) prepareAndSlide(prevId, 'prev');
    };

    // Правая кнопка: › (следующий) · + (добавить) · скрыта (завершено)
    if(idx === siblings.length - 1){
      // последний сезон
      if (isCompleted) {
        // «+» убираем полностью: карточка завершена, новых сезонов не предлагаем.
        // onclick обнулён выше — кнопка не может никуда увести.
        navR.textContent = '';
        navR.classList.remove('plus');
        navR.classList.add('hidden');
      } else {
        navR.textContent = '+';
        navR.classList.add('plus');
        navR.onclick = (e) => {
          e.stopPropagation();
          close();
          openAddSeason(it.parentId);
        };
        navR.classList.remove('hidden');
      }
    } else {
      // не последний — ведём на следующий сезон
      navR.textContent = '›';
      navR.classList.remove('plus');
      navR.onclick = (e) => {
        e.stopPropagation();
        prepareAndSlide(siblings[idx + 1].id, 'next');
      };
      navR.classList.remove('hidden');
    }
  } else {
    // Основная карточка
    const seasons = getSeasons(it.id);
    if(seasons.length){
      // есть сезоны → › ведёт на первый
      navR.textContent = '›';
      navR.classList.remove('plus');
      navR.onclick = (e) => {
        e.stopPropagation();
        prepareAndSlide(seasons[0].id, 'next');
      };
      navR.classList.remove('hidden');
    } else {
      // сезонов нет — либо +, либо скрыть (если завершено)
      if (isCompleted) {
        navR.textContent = '';
        navR.classList.remove('plus');
        navR.classList.add('hidden');
      } else {
        navR.textContent = '+';
        navR.classList.add('plus');
        navR.onclick = (e) => {
          e.stopPropagation();
          close();
          openAddSeason(it.id);
        };
        navR.classList.remove('hidden');
      }
    }
  }
})();
  
(function setupSwipe(){
  const stage = document.getElementById('viewStage');
  if(!stage) return;
  if(stage._swipeCleanup) stage._swipeCleanup();

  let startX = 0, startY = 0, tracking = false, isHorizontal = null;

  const shouldIgnore = (target) => {
    if(!target || !target.closest) return true;
    if(target.closest('a, button, input, textarea, select')) return true;
    if(target.closest('.view-tags, .view-tags-wrap, .moments-box, .tags-arrow-btn, .view-link-btn, .view-footer, .view-cover-h, .view-pills')) return true;
    return false;
  };

  const onStart = (e) => {
    if(e.touches.length !== 1) return;
    if(shouldIgnore(e.target)) return;
    if(document.body.classList.contains('moment-open')) return;
    const nm = document.getElementById('notesModal');
    if(nm && nm.classList.contains('on')) return;
    const cm = document.getElementById('coverViewModal');
    if(cm && cm.classList.contains('on')) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    isHorizontal = null;
  };

  const onMove = (e) => {
  if(!tracking || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;
  if(isHorizontal === null){
    if(Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.1) isHorizontal = true;
    else if(Math.abs(dy) > 6) isHorizontal = false;
    else return;
  }
  if(isHorizontal && e.cancelable) e.preventDefault();
};

  const onEnd = (e) => {
    if(!tracking) return;
    tracking = false;
    if(!isHorizontal) return;
    const dx = e.changedTouches[0].clientX - startX;
    const SWIPE_THRESHOLD = 45;
    if(Math.abs(dx) < SWIPE_THRESHOLD) return;
    const navL = document.getElementById('viewNavLeft');
    const navR = document.getElementById('viewNavRight');
    if(dx < 0){
      if(navR && !navR.classList.contains('hidden')) navR.click();
    } else {
      if(navL && !navL.classList.contains('hidden')) navL.click();
    }
  };

  stage.addEventListener('touchstart', onStart, { passive: true });
  stage.addEventListener('touchmove', onMove, { passive: false });
  stage.addEventListener('touchend', onEnd, { passive: true });

  stage._swipeCleanup = () => {
    stage.removeEventListener('touchstart', onStart);
    stage.removeEventListener('touchmove', onMove);
    stage.removeEventListener('touchend', onEnd);
    stage._swipeCleanup = null;
  };
})();

        const btnRefresh = panel.querySelector('#viewRefresh');
if(btnRefresh) {
  // Показываем кнопку, если есть хоть одна зацепка для обновления
  if(!it.link && !it.sourceUrl && !it.tmdbId && !it.title_en) {
    btnRefresh.style.visibility = 'hidden';
    btnRefresh.style.pointerEvents = 'none';
  } else {
    btnRefresh.onclick = (e) => {
      e.stopPropagation();
      refreshCard(it.id);
    };
  }
}

panel.querySelector('#viewEdit').onclick = () => {
  document.getElementById('viewModal').classList.remove('on');
  openForm(id);
};
  document.getElementById('viewModal').classList.add('on');
}
document.getElementById('coverViewModal').onclick = () => {
  const m = document.getElementById('coverViewModal');
  m.classList.remove('on');
  m.classList.remove('visible');
};
document.getElementById('viewModal').onclick = e => {
  // Внутри панели или по кнопкам навигации — не закрываем
  if(e.target.closest('.view-modal-stage')) return;
  if(e.target.closest('.view-nav-btn')) return;
  // Всё остальное (фон, обёртка за пределами панели) — закрываем
  const vm = document.getElementById('viewModal');
  if(!vm || !vm.classList.contains('on')) return;
  vm.classList.remove('on');
  const navL = document.getElementById('viewNavLeft');
  const navR = document.getElementById('viewNavRight');
  if(navL) navL.classList.add('hidden');
  if(navR) navR.classList.add('hidden');
  const panel = document.getElementById('viewPanel');
  if(panel){
    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.opacity = '';
    panel.style.visibility = '';
    panel.style.willChange = '';
    panel.style.animation = '';
  }
  const stage = document.getElementById('viewStage');
  if(stage) stage.querySelectorAll('.clone').forEach(c => c.remove());
  _sliding = false;
};
