'use strict';

/* ==========================================================
   utils.js — Утилиты: поиск, uid, esc, toast, обёртки обложек, цвета оценок, сердечки, сетевые помощники (nativeFetch, fetchProxied)
   ========================================================== */

function hueFor(v){
  const i = Math.max(1, Math.min(10, Math.round(v || 0)));
  return RATING_HUES[i] || 0;
}
function ratingIdleStyle(v){
  const h = hueFor(v).toFixed(1);
  return `background:hsla(${h}, 40%, 30%, 0.10);border-color:hsla(${h}, 45%, 35%, 0.22);color:hsla(${h}, 55%, 60%, 0.42)`;
}
function ratingActiveStyle(v){
  const h = hueFor(v).toFixed(1);
  const bright = `hsl(${h}, 80%, 68%)`;
  const bg = `hsla(${h}, 70%, 50%, .16)`;
  return `background:${bg};` +
    `border-color:color-mix(in srgb, ${bright} 55%, transparent);` +
    `color:${bright};` +
    `box-shadow:` +
      `inset 0 0 4px color-mix(in srgb, ${bright} 35%, transparent),` +
      `0 0 3px color-mix(in srgb, ${bright} 55%, transparent),` +
      `0 0 8px color-mix(in srgb, ${bright} 30%, transparent)`;
}

/* ============ ПОИСК ============ */
function normSearch(str){
  return String(str ?? '').toLowerCase().replace(/ё/g, 'е');
}
const EN_TO_RU = {
  'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з',
  '[':'х',']':'ъ',
  'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',
  ';':'ж',"'":'э',
  'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',
  ',':'б','.':'ю'
};
function enToRu(str){
  return String(str ?? '').split('').map(ch => EN_TO_RU[ch] || ch).join('');
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  // Нормализация названия для сравнения (без учёта регистра, ё→е, знаков)
function normTitleForCompare(s){
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normYearForCompare(s){
  const m = String(s || '').match(/\d{4}/);
  return m ? m[0] : '';
}

// Обертка URL картинки через wsrv.nl
// width — ширина в пикселях, blur — размытие, если нужно
function coverProxy(url, width, blur){
  if(!url) return '';
  let u = url.replace(/^https?:\/\//, '');
  let p = 'https://wsrv.nl/?url=' + encodeURIComponent(u);
  if(width) p += '&w=' + width + '&we';   // &we — не растягивать маленькие картинки
  if(blur) p += '&blur=' + blur;
  return p;
}

// Размеры обложек: карточка в списке / окно просмотра. Полноэкранный просмотр
// (тап по обложке) догружает ещё более чёткую версию — см. openCoverFullscreen.
function coverWidthFor(kind){
  const big = window.innerWidth >= 700;      // планшет / десктоп
  if(kind === 'card') return big ? 400 : 300;
  return big ? 900 : 720;
}
// Для TMDB в полноэкранном просмотре берём оригинал (планшет/десктоп) или w780 (телефон)
function hiResCoverUrl(url){
  const m = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)[^\/]+(\/.+)$/.exec(url || '');
  if(m) return m[1] + (window.innerWidth >= 700 ? 'original' : 'w780') + m[2];
  return url;
}

/* ============ УТИЛИТЫ ============ */
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

  function parseLrc(lrc){
  if(!lrc) return [];
  const lines = [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*([^\[]*)/g;
  let m;
  while((m = re.exec(lrc)) !== null){
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const msStr = m[3] || '0';
    const ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
    const t = min * 60 + sec + ms / 1000;
    const text = m[4].trim();
    if(text) lines.push({ t, text });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
  }

let toastHideTimer = null;
let toastClearTimer = null;

function toast(msg, type, actionText, actionCallback) {
  const t = document.getElementById('toast');
  if(!t) return;
  
  if(!msg || !String(msg).trim()) msg = 'Готово';

  let icon = '';
  let extraClass = '';

  if (!type) {
    if (msg.includes('✅')) { type = 'success'; msg = msg.replace('✅', '').trim(); }
    else if (msg.includes('❌')) { type = 'error'; msg = msg.replace('❌', '').trim(); }
    else if (msg.includes('⚠️')) { type = 'warn'; msg = msg.replace('⚠️', '').trim(); }
  }

  if (msg.includes('👑')) {
    icon = SVG_ICONS.crown;
    msg = msg.replace('👑', '').trim();
    if(!type) extraClass = ' warn';
  } else if (msg.includes('☁️')) {
    icon = SVG_ICONS.cloud;
    msg = msg.replace('☁️', '').trim();
    if(!type) extraClass = ' success';
  }

  if (!icon) {
    if (type === 'success') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    } else if (type === 'warn') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    }
  }

  t.className = 'toast' + (type ? ' ' + type : '') + extraClass;
  
  // Добавляем кнопку, если передан actionText
  let actionHtml = '';
  if (actionText) {
    actionHtml = `<button type="button" class="toast-action" id="toastActionBtn">${esc(actionText)}</button>`;
  }
  
  t.innerHTML = icon + `<span style="flex:1;">${esc(msg)}</span>` + actionHtml;
  
  // Привязываем клик по кнопке
  if (actionText && actionCallback) {
    const btn = t.querySelector('#toastActionBtn');
    if (btn) {
      btn.onclick = () => {
        t.classList.remove('on');
        clearTimeout(toastHideTimer);
        clearTimeout(toastClearTimer);
        actionCallback();
      };
    }
  }

  t.classList.add('on');
  
  clearTimeout(toastHideTimer); 
  clearTimeout(toastClearTimer);
  
  // Если есть кнопка отмены, держим тост на экране чуть дольше (4 секунды)
  const timeout = actionText ? 4000 : 2800;
  
  toastHideTimer = setTimeout(() => {
    t.classList.remove('on');
    toastClearTimer = setTimeout(() => {
      t.innerHTML = '';
    }, 300);
  }, timeout);
}
  
function heartSVG(filled, cls){
  const c = cls ? ' class="' + cls + '"' : '';
  return '<svg' + c + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
}
function heartsRowHTML(n){
  let out = '';
  for(let i = 1; i <= 5; i++){
    const filled = i <= n;
    out += heartSVG(filled, filled ? 'filled' : '');
  }
  return out;
}
function statusLabel(key, type){
  const s = STATUSES[key];
  if(!s) return '—';
  if(key === 'done' && type){
    const g = groupOf(type);
    if(g === 'book' || g === 'comic') return 'Прочитано';
    if(g === 'music') return 'Прослушано';
    return 'Посмотрено';
  }
  return s.label;
}
function statusColor(key){
  return (STATUSES[key] && STATUSES[key].color) || '#888';
}
function hexToRgba(hex, a){
  const h = String(hex).replace('#','');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
  // Определяет, похоже ли на BL по тегам
function isYaoiTags(tags){
  if(!Array.isArray(tags)) return false;
  const needles = [
    'яой','яои','yaoi',
    'слэш','слеш','slash',
    'сёнэн-ай','сэнен-ай','сёнен-ай','сенен-ай','shounen-ai','shonen-ai','shounen ai','shonen ai',
    'boys love','boys\' love','boys-love','boyslove','bl'
  ];
  return tags.some(t => needles.includes(String(t).toLowerCase().trim()));
}
  /* ============ ЛИЧНЫЙ ПРОКСИ ============ */
async function nativeFetch(url, headers = {}) {
  const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;
  if (!CHttp) {
    console.warn('CapacitorHttp недоступен, падаем на обычный fetch');
    return fetch(url, { headers });
  }
  
  const res = await CHttp.get({ url, headers });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
    json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data)
  };
}

  
async function fetchProxied(url) {
  try {
    const r = await nativeFetch(url, {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    if (text.includes('<!DOCTYPE html>') && url.includes('.json')) {
      throw new Error('Получен HTML вместо JSON');
    }
    return text;
  } catch (e) {
    console.error('Ошибка fetchProxied:', e.message);
    throw new Error('Запрос не удался: ' + e.message);
  }
}
