'use strict';

/* ==========================================================
   moments.js — Метки-моменты (сердечки) и модалка заметок
   ========================================================== */

/* ============ МЕТКИ ВРЕМЕНИ ============ */
/* Формат: медиа { s, e, t, tag } · книга { p, tag } · комикс { p, f, tag }
   (s — сезон|null, e — эпизод|null, t — секунды, p — страница, f — кадр, tag — id иконки)
   t нужен для будущего APK: vlc://play?uri=[ссылка]&time=[t] (см. momentVlcUrl). */
const MOMENT_ICONS = {
  heart:    { color:'#ff5c8a', svg:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' },
  star:     { color:'#ffcf3a', svg:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
  fire:     { color:'#ff8a24', svg:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
  bolt:     { color:'#ffe14a', svg:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  laugh:    { color:'#ffb020', svg:'<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>' },
  sad:      { color:'#3a9cff', svg:'<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>' },
  drop:     { color:'#4ecad4', svg:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>' },
  eye:      { color:'#a48bff', svg:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
  music:    { color:'#2ed55f', svg:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
  bookmark: { color:'#c77cd2', svg:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' },
  flag:     { color:'#ff5a5a', svg:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>' }
};
const MOMENT_DEFAULT_TAG = 'heart';

function momentIconSVG(tag){
  const ic = MOMENT_ICONS[tag] || MOMENT_ICONS[MOMENT_DEFAULT_TAG];
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ic.svg + '</svg>';
}
function momentColor(tag){
  return (MOMENT_ICONS[tag] || MOMENT_ICONS[MOMENT_DEFAULT_TAG]).color;
}
function fmtMomentTime(t){
  t = Math.max(0, Math.floor(Number(t) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
// Приводит массив меток к строгому формату:
//   книга   — { p, tag }
//   комикс  — { p, f, tag }
//   медиа   — { s, e, t, tag }
function normMoments(arr){
  if(!Array.isArray(arr)) return [];
  const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Math.max(0, Math.floor(Number(v)));
  const out = [];
  arr.forEach(m => {
    if(!m || typeof m !== 'object') return;
    const tag = (typeof m.tag === 'string' && m.tag) ? m.tag : MOMENT_DEFAULT_TAG;
    const p = num(m.p);
    if(p !== null){
      const f = num(m.f);
      const base = f !== null ? { p: p, f: f, tag: tag } : { p: p, tag: tag };
      if(m.c !== undefined && m.c !== null) base.c = m.c;
      if(m.v !== undefined && m.v !== null) base.v = num(m.v);
      if(m.n !== undefined && m.n !== null) base.n = num(m.n);
      if(m.o !== undefined && m.o !== null) base.o = num(m.o);
      out.push(base);
      return;
    }
    const t = num(m.t);
    if(t === null) return;
    out.push({ s: num(m.s), e: num(m.e), t: t, tag: tag });
  });
  return out;
}
  
function sortMoments(arr){
  return arr.slice().sort((a, b) =>
    ((a.n || 0) - (b.n || 0)) ||
    ((a.p || 0) - (b.p || 0)) || ((a.f || 0) - (b.f || 0)) ||
    ((a.s || 0) - (b.s || 0)) || ((a.e || 0) - (b.e || 0)) || ((a.t || 0) - (b.t || 0)));
}
  
// Задел под APK: ссылка для VLC, открывающая плеер ровно на метке
function momentVlcUrl(uri, t){
  return 'vlc://play?uri=' + encodeURIComponent(uri) + '&time=' + (Math.floor(Number(t)) || 0);
}

function renderMomentsBox(box, it){
  if(!box) return;
  const list = Array.isArray(it.moments) ? it.moments : [];
  const isSeries = it.type !== 'movie';
  const grp = groupOf(it.type);
  if(!list.length){
    box.classList.add('empty');
    box._laySig = null;
    box.style.removeProperty('--rbw');
    box.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>' + (grp === 'screen' ? 'Добавить метку времени' : 'Добавить метку') + '</span>';
    return;
  }
  box.classList.remove('empty');
  box.classList.remove('ready');
  // innerHTML заменяет все плашки, а вместе с ними и их --rbx: сбрасываем кэш раскладки,
  // иначе при совпавшей «подписи» градиент не запишется и каждая плашка окрасится как первая
  box._laySig = null;
  box.innerHTML = list.map((m, i) => {
    if(grp === 'book' || grp === 'comic'){
      const chapterPart = (grp === 'comic' && m.n != null)
        ? '<span class="m-se">Гл. ' + m.n + '</span><span class="m-bar">|</span>' : '';
      const fr = (grp === 'comic' && m.f != null)
        ? '<span class="m-bar">|</span><span class="m-time m-frame">Фрейм: ' + m.f + '</span>' : '';
      return '<button type="button" class="moment-pill" data-i="' + i + '" style="--i:' + i + '">'
        + chapterPart
        + '<span class="m-time m-page">Стр. ' + (m.p != null ? m.p : 1) + '</span>'
        + fr
        + '<span class="m-dash">–</span>'
        + '<span class="m-icon" style="--ic:' + momentColor(m.tag) + '">' + momentIconSVG(m.tag) + '</span>'
        + '</button>';
    }
    const se = (isSeries && m.s != null && m.e != null)
      ? '<span class="m-se">S' + m.s + 'E' + m.e + '</span><span class="m-bar">|</span>'
      : '';
    return '<button type="button" class="moment-pill" data-i="' + i + '" style="--i:' + i + '">'
      + se
      + '<span class="m-time">' + fmtMomentTime(m.t) + '</span>'
      + '<span class="m-dash">–</span>'
      + '<span class="m-icon" style="--ic:' + momentColor(m.tag) + '">' + momentIconSVG(m.tag) + '</span>'
      + '</button>';
  }).join('') + '<span class="moment-add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>';
  layoutMomentsGradient(box);
}
  
  
  // Один радужный градиент на весь набор плашек: у каждой — свой сдвиг внутри общей ширины
function layoutMomentsGradient(box){
  if(!box) return;
  const pills = Array.from(box.querySelectorAll('.moment-pill'));
  if(!pills.length) return;
  // карточка ещё скрыта (display:none) — размеры нулевые, считать рано
  if(!box.offsetWidth) return;
  let minL = Infinity, maxR = -Infinity;
  pills.forEach(p => {
    minL = Math.min(minL, p.offsetLeft);
    maxR = Math.max(maxR, p.offsetLeft + p.offsetWidth);
  });
  if(!isFinite(minL) || maxR <= minL) return;
  const xs = pills.map(p => {
    const x = p.offsetLeft - minL;
    const tms = Array.from(p.querySelectorAll('.m-time')).map(tm => x + tm.offsetLeft);
    return [x, tms];
  });
  // пишем в DOM только если что-то реально изменилось — лишние записи вызывают перерисовку и мерцание
  const sig = (maxR - minL) + '|' + xs.map(a => a[0] + ':' + a[1].join(',')).join(';');
  if(box._laySig !== sig){
    box._laySig = sig;
    box.style.setProperty('--rbw', (maxR - minL) + 'px');
    pills.forEach((p, i) => {
      p.style.setProperty('--rbx', xs[i][0].toFixed(1));
      p.querySelectorAll('.m-time').forEach((tm, k) => {
        tm.style.setProperty('--rbx', xs[i][1][k].toFixed(1));
      });
    });
  }
  box.classList.add('ready');
}
function bindMomentsBox(panel, it){
  const box = panel.querySelector('#momentsBox');
  if(!box) return;
  renderMomentsBox(box, it);
  box.onclick = (e) => {
    e.stopPropagation();
    const p = e.target.closest('.moment-pill');
    openMomentModal(it.id, p ? +p.dataset.i : -1);
  };
  // Бокс появляется вместе с модалкой (до этого display:none): ResizeObserver сработает
  // один раз, когда у бокса появится размер, и градиент встанет на место без повторных пересчётов.
  if(window.ResizeObserver){
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if(raf) return;
      raf = requestAnimationFrame(() => { raf = 0; layoutMomentsGradient(box); });
    });
    ro.observe(box);
    box._ro = ro;
  } else {
    requestAnimationFrame(() => layoutMomentsGradient(box));
    setTimeout(() => layoutMomentsGradient(box), 350);
  }
}
window.addEventListener('resize', () => {
  clearTimeout(window._momLayoutTimer);
  window._momLayoutTimer = setTimeout(() => layoutMomentsGradient(document.getElementById('momentsBox')), 120);
});

/* ---- Модалка добавления / редактирования метки ---- */
const WHEEL_ITEM = 34;
const momentCtx = { itemId: null, index: -1, tag: MOMENT_DEFAULT_TAG, wheels: {} };

function makeWheelStatic(el, min, max, visible, padZero){
  const padH = ((visible - 1) / 2) * WHEEL_ITEM;
  let html = '<div style="height:' + padH + 'px"></div>';
  for(let v = min; v <= max; v++){
    html += '<div class="wheel-item" data-v="' + v + '">' + (padZero ? String(v).padStart(2, '0') : v) + '</div>';
  }
  html += '<div style="height:' + padH + 'px"></div>';
  el.innerHTML = html;
  el.style.height = (visible * WHEEL_ITEM) + 'px';
  const items = el.querySelectorAll('.wheel-item');
  let activeIdx = -1, raf = 0;
  const idxNow = () => Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / WHEEL_ITEM)));
  const paint = () => {
    raf = 0;
    const i = idxNow();
    if(i === activeIdx) return;
    if(activeIdx >= 0) items[activeIdx].classList.remove('on');
    items[i].classList.add('on');
    if(activeIdx >= 0 && navigator.vibrate) { try{ navigator.vibrate(4); }catch(e){} }
    activeIdx = i;
  };
  el.addEventListener('scroll', () => { if(!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  el.addEventListener('click', e => {
    const it = e.target.closest('.wheel-item'); if(!it) return;
    el.scrollTo({ top: (+it.dataset.v - min) * WHEEL_ITEM, behavior: 'smooth' });
  });
  return {
    get(){ return min + idxNow(); },
    set(v){
      v = Math.max(min, Math.min(max, v));
      el.scrollTop = (v - min) * WHEEL_ITEM;
      paint();
    }
  };
}

/* Колесо с большим диапазоном (страницы 1–5000, кадры, эпизоды) НЕ строит тысячи элементов:
   высоту задаёт пустой «распорка»-блок, а в DOM живёт только окно вокруг текущего значения.
   Снап к значению делаем сами — CSS scroll-snap не работает с перерисовываемым окном. */
function makeWheel(el, min, max, visible, padZero){
  const n = max - min + 1;
  if(n <= 100) return makeWheelStatic(el, min, max, visible, padZero);
  const padH = ((visible - 1) / 2) * WHEEL_ITEM;
  const BUF = visible + 10;
  el.classList.add('virtual');
  el.innerHTML = '<div class="wheel-space" style="position:relative;height:' + (n * WHEEL_ITEM + 2 * padH) + 'px"></div>';
  el.style.height = (visible * WHEEL_ITEM) + 'px';
  const space = el.firstChild;
  let activeIdx = -1, raf = 0, snapT = 0, touching = false;
  const idxNow = () => Math.max(0, Math.min(n - 1, Math.round(el.scrollTop / WHEEL_ITEM)));
  const label = v => padZero ? String(v).padStart(2, '0') : v;
  // фиксированный пул узлов: узел для индекса i всегда лежит в слоте i % P — при прокрутке
  // обновляются только те узлы, что реально вышли из окна (никакого innerHTML на лету)
  const P = 2 * BUF + 1;
  let pool = '';
  for(let k = 0; k < P; k++) pool += '<div class="wheel-item" data-i="-1" style="position:absolute;left:0;right:0;display:none"></div>';
  space.innerHTML = pool;
  const nodes = Array.from(space.children);
  const draw = () => {
    const c = idxNow();
    const start = Math.max(0, Math.min(n - P, c - BUF));
    const end = Math.min(n - 1, start + P - 1);
    for(let i = start; i <= end; i++){
      const nd = nodes[i % P];
      if(+nd.dataset.i === i) continue;
      nd.dataset.i = i;
      nd.dataset.v = min + i;
      nd.style.top = (padH + i * WHEEL_ITEM) + 'px';
      nd.style.display = '';
      nd.textContent = label(min + i);
      nd.classList.toggle('on', i === activeIdx);
    }
  };
  const paint = () => {
    raf = 0;
    draw();
    const c = idxNow();
    if(c === activeIdx) return;
    const old = nodes[activeIdx >= 0 ? activeIdx % P : 0];
    if(old) old.classList.remove('on');
    const cur = nodes[c % P];
    if(cur && +cur.dataset.i === c) cur.classList.add('on');
    if(activeIdx >= 0 && navigator.vibrate) { try{ navigator.vibrate(4); }catch(e){} }
    activeIdx = c;
  };
  const snap = () => {
    clearTimeout(snapT);
    snapT = setTimeout(() => {
      if(touching) return;
      const target = idxNow() * WHEEL_ITEM;
      if(Math.abs(el.scrollTop - target) > 1) el.scrollTo({ top: target, behavior: 'smooth' });
    }, 110);
  };
  el.addEventListener('scroll', () => { if(!raf) raf = requestAnimationFrame(paint); snap(); }, { passive: true });
  el.addEventListener('touchstart', () => { touching = true; clearTimeout(snapT); }, { passive: true });
  const endTouch = () => { touching = false; snap(); };
  el.addEventListener('touchend', endTouch, { passive: true });
  el.addEventListener('touchcancel', endTouch, { passive: true });
  el.addEventListener('click', e => {
    const it = e.target.closest('.wheel-item'); if(!it) return;
    el.scrollTo({ top: (+it.dataset.v - min) * WHEEL_ITEM, behavior: 'smooth' });
  });
  draw();
  return {
    get(){ return min + idxNow(); },
    set(v){
      v = Math.max(min, Math.min(max, v));
      el.scrollTop = (v - min) * WHEEL_ITEM;
      paint();
    }
  };
}

function openMomentModal(itemId, index){
  const it = items.find(x => x.id === itemId);
  if(!it) return;
  const modal = document.getElementById('momentModal');
  const panel = document.getElementById('momentPanel');
  if(!modal || !panel) return;
  if(!Array.isArray(it.moments)) it.moments = [];
  const grp = groupOf(it.type);
  const isBook = grp === 'book', isComic = grp === 'comic';
  const isSeries = grp === 'screen' && it.type !== 'movie';
  const editing = index >= 0 && it.moments[index];
  const cur = editing ? it.moments[index] : null;
  const last = it.moments.length ? it.moments[it.moments.length - 1] : null;

  momentCtx.itemId = itemId;
  momentCtx.index = editing ? index : -1;
  momentCtx.tag = cur ? cur.tag : MOMENT_DEFAULT_TAG;

  const iconsHTML = Object.keys(MOMENT_ICONS).map(k =>
    '<button type="button" class="mi-btn' + (k === momentCtx.tag ? ' on' : '') + '" data-tag="' + k + '" style="--ic:' + MOMENT_ICONS[k].color + '">' + momentIconSVG(k) + '</button>'
  ).join('');

  panel.innerHTML =
    '<div class="notes-head"><h3>' + (editing ? 'Изменить метку' : 'Новая метка') + '</h3></div>' +
    '<div class="notes-body moment-body">' +
      '<div class="mi-scroll" id="miScroll">' + iconsHTML + '</div>' +
      (isBook
        ? '<div class="wheel-cols"><div class="wheel-col">' +
            '<div class="wheels-cap">Страница</div>' +
            '<div class="wheels"><div class="wheel wide" id="wPage"></div></div>' +
          '</div></div>'
      : isComic
        ? '<div class="wheel-cols">' +
            '<div class="wheel-col"><div class="wheels-cap">Страница</div>' +
              '<div class="wheels"><div class="wheel wide" id="wPage"></div></div></div>' +
            '<div class="wheel-col"><div class="wheels-cap">Кадр/Фрейм</div>' +
              '<div class="wheels"><div class="wheel wide" id="wFrame"></div></div></div>' +
          '</div>'
      : (isSeries
        ? '<div class="wheels-cap">Сезон : Эпизод</div>' +
          '<div class="wheels">' +
            '<div class="wheel" id="wSeason"></div><div class="wheel-colon">:</div><div class="wheel" id="wEpisode"></div>' +
          '</div>'
        : '') +
      '<div class="wheels-cap">Время</div>' +
      '<div class="wheels">' +
        '<div class="wheel" id="wHour"></div><div class="wheel-colon">:</div>' +
        '<div class="wheel" id="wMin"></div><div class="wheel-colon">:</div>' +
        '<div class="wheel" id="wSec"></div>' +
      '</div>') +
    '</div>' +
    '<div class="notes-foot moment-foot">' +
      '<button type="button" class="btn danger" id="momentCancel" title="' + (editing ? 'Удалить метку' : 'Закрыть') + '" aria-label="' + (editing ? 'Удалить метку' : 'Закрыть') + '">' + SVG_ICONS.close + '</button>' +
      '<button type="button" class="btn primary" id="momentSave" title="Сохранить" aria-label="Сохранить"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
    '</div>';

  document.body.classList.add('moment-open');
  modal.classList.add('on');

    // колёса создаём после показа модалки — иначе scrollTop не выставится
  const W = {};
  if(isBook || isComic){
    W.page = makeWheel(panel.querySelector('#wPage'), 1, 5000, 3, false);
    if(isComic) W.frame = makeWheel(panel.querySelector('#wFrame'), 1, 200, 3, false);
    momentCtx.wheels = W;
    W.page.set(cur && cur.p ? cur.p : (last && last.p ? last.p : 1));
    if(isComic) W.frame.set(cur && cur.f ? cur.f : (last && last.f ? last.f : 1));
  } else {
    const isMovie = it.type === 'movie';
    const maxHour = isMovie ? 5 : 1;

    if(isSeries){
      // Считаем, сколько реально сезонов на полке
      let maxSeason = 1;
      const parent = it.parentId ? getMainItem(it) : it;
      if (parent) {
        const seasons = getSeasons(parent.id);
        maxSeason = seasons.length ? Math.max(...seasons.map(s => s.seasonNumber)) : (it.seasonNumber || 1);
      } else {
        maxSeason = it.seasonNumber || 1;
      }
      W.season  = makeWheel(panel.querySelector('#wSeason'), 1, maxSeason, 3, false);
      W.episode = makeWheel(panel.querySelector('#wEpisode'), 1, 500, 3, false);
    }
    
    // Для кино — 5 часов, для сериалов — только 0 и 1
    W.hour = makeWheel(panel.querySelector('#wHour'), 0, maxHour, 5, false);
    W.min  = makeWheel(panel.querySelector('#wMin'), 0, 59, 5, true);
    W.sec  = makeWheel(panel.querySelector('#wSec'), 0, 59, 5, true);
    momentCtx.wheels = W;

    const t0 = cur && cur.t != null ? cur.t : 0;
    W.hour.set(Math.floor(t0 / 3600));
    W.min.set(Math.floor((t0 % 3600) / 60));
    W.sec.set(t0 % 60);
    if(isSeries){
      const s0 = cur ? (cur.s || 1) : (last && last.s ? last.s : (it.seasonNumber || 1));
      const e0 = cur ? (cur.e || 1) : (last && last.e ? last.e : 1);
      W.season.set(s0);
      W.episode.set(e0);
    }
  }

  panel.querySelector('#miScroll').onclick = e => {
    const b = e.target.closest('.mi-btn'); 
    if(!b) return;
    momentCtx.tag = b.dataset.tag;
    panel.querySelectorAll('.mi-btn').forEach(x => x.classList.toggle('on', x === b));
  };

  setTimeout(() => {
    const onBtn = panel.querySelector('.mi-btn.on');
    if (onBtn) {
      onBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    }
  }, 50);

  const refresh = () => {
    const box = document.getElementById('momentsBox');
    if(box) renderMomentsBox(box, it);
    if(box) requestAnimationFrame(() => layoutMomentsGradient(box));
    render();
  };

panel.querySelector('#momentCancel').onclick = () => {
  if(editing){
    // 1. Защита: если по какой-то причине метки нет — просто закрываем
    if (!it.moments || !it.moments[index]) {
      closeMomentModal();
      return;
    }

    // 2. Сохраняем удаляемую метку
    const deletedMoment = JSON.parse(JSON.stringify(it.moments[index]));
    const deleteIndex = index; // Запоминаем точный индекс
    
    // 3. Удаляем
    it.moments.splice(deleteIndex, 1);
    it.updatedAt = Date.now();
    save();
    closeMomentModal();
    refresh();
    
    // 4. Показываем тост с кнопкой "Отменить"
    toast('Метка удалена', 'warn', 'Отменить', () => {
      // Возвращаем на ту же позицию, где она была
      it.moments.splice(deleteIndex, 0, deletedMoment);
      it.moments = sortMoments(it.moments); // Пересортировываем
      it.updatedAt = Date.now();
      save();
      refresh();
      toast('Метка восстановлена', 'success');
    });
    
  } else {
    closeMomentModal();
  }
};
  
  panel.querySelector('#momentSave').onclick = () => {
    let m;
    let targetIt = it; 
    
    if(isBook){
      m = { p: W.page.get(), tag: momentCtx.tag };
    } else if(isComic){
      m = { p: W.page.get(), f: W.frame.get(), tag: momentCtx.tag };
      if(editing && cur){
        for(const key of Object.keys(cur)){
          if(!(key in m)) m[key] = cur[key];
        }
      }
    } else {
  const t = W.hour.get() * 3600 + W.min.get() * 60 + W.sec.get();
  const sNum = isSeries ? W.season.get() : null;
  m = {
    s: sNum,
    e: isSeries ? W.episode.get() : null,
    t: t,
    tag: momentCtx.tag
  };
  
  // Умная маршрутизация: если мы на главной карточке сериала
  if (isSeries && !isSeason(it)) {
        const seasons = getSeasons(it.id);
        const targetSeason = seasons.find(s => s.seasonNumber === sNum);
        if (targetSeason) {
          targetIt = targetSeason;
        }
      }
    }
    
    const arr = targetIt.moments ? targetIt.moments.slice() : [];
    
    if(editing && targetIt === it) {
      arr[index] = m;
    } else {
      if (editing && targetIt !== it) {
         it.moments.splice(index, 1);
      }
      arr.push(m);
    }
    
    targetIt.moments = sortMoments(arr);
    targetIt.updatedAt = Date.now();
    it.updatedAt = Date.now(); 
    save();
    closeMomentModal();
    refresh();
    
    if (targetIt !== it) {
      toast('Метка добавлена в ' + (targetIt.title || 'сезон'));
    } else {
      toast(editing ? 'Метка обновлена' : 'Метка добавлена');
    }
  };
}
function closeMomentModal(){
  const modal = document.getElementById('momentModal');
  modal.classList.remove('on');
  document.body.classList.remove('moment-open');
  // сносим колёса сразу — при следующем открытии строятся с нуля, без остатков старой прокрутки
  const panel = document.getElementById('momentPanel');
  if(panel) panel.innerHTML = '';
}
document.getElementById('momentModal').onclick = (e) => {
  if(e.target.id === 'momentModal') closeMomentModal();
};

/* ============ МОДАЛКА ЗАМЕТОК ============ */
function openNotesModal(itemId){
  const it = items.find(x => x.id === itemId);
  if(!it) return;
  const modal = document.getElementById('notesModal');
  const ta = document.getElementById('notesTextarea');
  if(!modal || !ta) return;
  ta.value = it.notes || '';
  modal.classList.add('on');
  setTimeout(() => {
    ta.focus();
    const len = ta.value.length;
    try { ta.setSelectionRange(len, len); } catch(e) {}
    ta.scrollTop = ta.scrollHeight;
  }, 60);
  document.getElementById('notesSave').onclick = () => {
    it.notes = ta.value.trim();
    it.updatedAt = Date.now();
    save();
    modal.classList.remove('on');
    if(document.getElementById('viewModal').classList.contains('on')) openView(it.id);
    render();
    toast('Заметки сохранены');
  };
  document.getElementById('notesCancel').onclick = () => modal.classList.remove('on');
  document.getElementById('notesClose').onclick = () => modal.classList.remove('on');
}
document.getElementById('notesModal').onclick = (e) => {
  if(e.target.id === 'notesModal') e.target.classList.remove('on');
};
