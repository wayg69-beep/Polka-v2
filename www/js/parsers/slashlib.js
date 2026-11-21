'use strict';

/* ==========================================================
   slashlib.js — Slashlib: токен, API, поиск, подгрузка деталей, заполнение формы
   ========================================================== */

// ============ API SLASHLIB (БЕЗ UI) ============
async function getSlashlibTokenSafe() {
  let token = null;
  try {
    const t = localStorage.getItem('slashlib_token');
    const v = localStorage.getItem('slashlib_token_valid');
    if (t && v === '1') token = t;
  } catch (e) {}
  return token;
}

async function slashlibSearchApi(query, token) {
  try {
    const url = `https://api.cdnlibs.org/api/manga?site_id[]=2&page=1&limit=60&sort_by=last_chapter_at&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Site-Id': '2', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (e) { return []; }
}

async function fetchSlashlibDetailsApi(slug, token) {
  try {
    const fields = ['background', 'eng_name', 'otherNames', 'summary', 'releaseDate', 'country', 'authors', 'genres', 'tags'];
    const query = fields.map((f, i) => `fields[${i}]=${f}`).join('&');
    const apiUrl = `https://hapi.hentaicdn.org/api/manga/${slug}?${query}`;
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    if (!d) return null;

    const allTags = [];
    if (d.genres) d.genres.forEach(g => allTags.push(g.name));
    if (d.tags) d.tags.forEach(t => allTags.push(t.name));

    const getSummaryText = (summary) => {
      if (!summary) return '';
      if (typeof summary === 'string') return summary;
      const walk = (node) => {
        if (!node) return '';
        if (node.type === 'text') return node.text || '';
        if (node.type === 'hardBreak') return '\n';
        if (Array.isArray(node.content)) {
          let txt = node.content.map(walk).join('');
          if (node.type === 'paragraph') txt += '\n';
          return txt;
        }
        return '';
      };
      return walk(summary).replace(/\n{3,}/g, '\n\n').trim();
    };
    const desc = getSummaryText(d.summary);

    const getYear = (raw) => {
      if (!raw) return '';
      const m = String(raw).match(/\b(\d{4})\b/);
      return m ? m[1] : String(raw);
    };
    const yearStr = getYear(d.releaseDate);

    let pStatus = '';
    if (d.status && d.status.label) {
      const s = d.status.label.toLowerCase();
      if (s.includes('онгоинг') || s.includes('выходит')) pStatus = 'ongoing';
      else if (s.includes('завершен')) pStatus = 'completed';
      else if (s.includes('анонс')) pStatus = 'announced';
    }

    let chapterCount = '';
    try {
      const chRes = await fetch(`https://api.cdnlibs.org/api/manga/${slug}/chapters?limit=500`, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
      });
      if (chRes.ok) {
        const chJson = await chRes.json();
        if (chJson.meta && chJson.meta.total) chapterCount = String(chJson.meta.total);
        else if (Array.isArray(chJson.data)) chapterCount = String(chJson.data.length);
      }
    } catch(e) {}

    const otherNames = Array.isArray(d.otherNames)
  ? d.otherNames.map(n => typeof n === 'string' ? n : (n && n.name)).filter(Boolean)
  : [];

return {
  title: d.rus_name || d.name,
  title_en: d.eng_name || '',
  otherNames,
  cover: d.cover ? d.cover.default : '',
  description: desc,
  country: d.authors ? d.authors.map(a => a.name).join(', ') : '',
  tags: allTags,
  year: yearStr,
  pages: chapterCount,
  link: 'https://v2.shlib.life/ru/manga/' + d.slug_url,
  bl: isYaoiTags(allTags),
  projectStatus: pStatus
};
  } catch (e) {
    return null;
  }
}

/**
 * Открывает ВИДИМЫЙ InAppBrowser и ждёт, пока пользователь войдёт.
 * Забирает токен из объекта 'auth' в localStorage.
 */

async function getSlashlibToken(forceLogin, onStatus) {
  if (!forceLogin) {
    let cached = null, valid = null;
    try {
      cached = localStorage.getItem('slashlib_token');
      valid  = localStorage.getItem('slashlib_token_valid');
    } catch (e) {}
    if (cached && valid === '1') return cached;
  }

  const plugin = window.Capacitor?.Plugins?.InAppBrowser;
  if (!plugin) {
    console.warn('[Slashlib] InAppBrowser недоступен');
    if (onStatus) onStatus('Ошибка: InAppBrowser не найден');
    return null;
  }

  return new Promise(async (resolve) => {
    let settled = false;
    let pollTimer = null;
    let realToken = null;

    const extractTokenScript = `
      (function() {
        try {
          var authStr = localStorage.getItem('auth');
          if (authStr) {
            var auth = JSON.parse(authStr);
            if (auth && auth.token && auth.token.access_token) {
              return auth.token.access_token;
            }
          }
        } catch (e) {}
        return null;
      })();
    `;

    const injectBanner = `
      (function() {
        if (document.getElementById('__polkaBanner')) return 'exists';
        var banner = document.createElement('div');
        banner.id = '__polkaBanner';
        banner.style.cssText =
          'position:fixed; top:60px; left:10px; z-index:2147483647;' +
          'background:linear-gradient(135deg,#7c5cff,#a48bff); color:#fff;' +
          'padding:10px 14px; border-radius:12px; font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'font-size:13px; box-shadow:0 4px 12px rgba(0,0,0,.5);' +
          'display:flex; flex-direction:column; align-items:flex-start; gap:8px;';
        banner.innerHTML =
          '<span style="font-weight:600;">Войди в аккаунт Slashlib</span>' +
          '<button id="__polkaDoneBtn" style="padding:6px 14px;background:#fff;color:#7c5cff;' +
          'border:0;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;' +
          'font-family:inherit; width:100%;">Я вошёл ✓</button>';
        document.body.appendChild(banner);
        document.getElementById('__polkaDoneBtn').onclick = function() {
          window.location.href = 'https://v2.shlib.life/__polka_done_12345__';
        };
        return 'injected';
      })();
    `;

    const finish = async () => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);

      try {
        const res = await plugin.executeScript({ script: extractTokenScript });
        if (res && res.result) realToken = JSON.parse(res.result);
      } catch(e) {}

      try { await plugin.close(); } catch(e) {}

      if (onStatus) onStatus(realToken ? 'Проверяю вход…' : 'Токен не найден');

      if (realToken) {
  try {
    localStorage.setItem('slashlib_token', realToken);
    localStorage.setItem('slashlib_token_valid', '1');
  } catch (e) {}
  // Синхронизируем в облако, если залогинена
  if (typeof Cloud !== 'undefined' && Cloud.isReady()) {
    saveTokensToCloud({
      slashlib_token: realToken,
      slashlib_token_valid: '1'
    });
  }
  resolve(realToken);
} else {
  resolve(null);
      }
    };

    try {
      await plugin.openInWebView({ url: 'https://v2.shlib.life' });

      plugin.addListener('browserPageLoaded', async () => {
        try {
          await plugin.executeScript({ script: injectBanner });
        } catch(e){}
      });

      pollTimer = setInterval(async () => {
        if (settled) return;
        try {
          const res = await plugin.executeScript({ script: extractTokenScript });
          if (res && res.result) {
            const token = JSON.parse(res.result);
            if (token) {
              realToken = token;
              finish();
            }
          }
        } catch(e) {}
      }, 2000);

    } catch(e) {
       console.error(e);
       finish();
    }
  });
}
  /**
 * Рисует кнопку «Войти в Slashlib» с обработкой ошибок.
 */
function renderSlashlibLoginPrompt(resultsEl, input, errorMsg) {
  let html = '<div class="tmdb-status">';
  if (errorMsg) html += '<div style="color:#ff8a8a;margin-bottom:10px;">' + esc(errorMsg) + '</div>';
  html +=
    'Для поиска на Slashlib нужен вход.<br>' +
    '<small style="opacity:0.75;display:inline-block;margin-top:6px;">' +
      'Откроется окно Slashlib. Войди в аккаунт, потом тапни «Я вошёл ✓» вверху страницы.' +
    '</small>' +
    '<button type="button" class="btn primary" id="slashlibLoginBtn" ' +
      'style="width:100%;max-width:240px;margin:16px auto 0;display:block;">' +
      'Войти в Slashlib' +
    '</button></div>';
  resultsEl.innerHTML = html;

  const btn = resultsEl.querySelector('#slashlibLoginBtn');
  if (!btn) return;

  btn.onclick = async () => {
    resultsEl.innerHTML =
      '<div class="tmdb-status">Открываю Slashlib…<br>' +
      '<small style="opacity:0.7;margin-top:6px;display:inline-block;">' +
        'Войди в аккаунт, потом тапни «Я вошёл ✓» вверху страницы.' +
      '</small></div>';

    const token = await getSlashlibToken(true, (msg) => {
      if (msg) resultsEl.innerHTML = '<div class="tmdb-status">' + esc(msg) + '</div>';
    });

    if (token) {
      resultsEl.innerHTML =
        '<div class="tmdb-status">Вход выполнен ✓<br>' +
        '<small style="opacity:0.75;margin-top:6px;display:inline-block;">' +
          'Введи название и нажми Enter.' +
        '</small></div>';
      setTimeout(() => { try { input.focus(); } catch (e) {} }, 300);
    } else {
      renderSlashlibLoginPrompt(resultsEl, input, 'Вход не выполнен — настоящий токен не найден.');
    }
  };
}

  /**
 * Открывает модалку поиска. Если валидного токена нет — показывает кнопку «Войти».
 */
function openSlashlibModal() {
  const modal = document.getElementById('slashlibModal');
  const input = document.getElementById('slashlibQuery');
  const results = document.getElementById('slashlibResults');
  if (!modal || !input || !results) return;

  input.value = '';

  let hasValid = false;
  try {
    const t = localStorage.getItem('slashlib_token');
    const v = localStorage.getItem('slashlib_token_valid');
    if (t && v === '1') hasValid = true;
  } catch (e) {}

  if (hasValid) {
    results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);
  } else {
    renderSlashlibLoginPrompt(results, input);
  }

  modal.classList.add('on');
}

function closeSlashlibModal() {
  document.getElementById('slashlibModal').classList.remove('on');
}

  /**
 * Тихий поиск с Bearer-токеном. Никаких окон.
 */
async function runSlashlibSearch() {
  const input = document.getElementById('slashlibQuery');
  const results = document.getElementById('slashlibResults');
  if (!input || !results) return;

  const q = input.value.trim();
  if (!q) { results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }

  let token = null;
  try {
    const t = localStorage.getItem('slashlib_token');
    const v = localStorage.getItem('slashlib_token_valid');
    if (t && v === '1') token = t;
  } catch (e) {}

  if (!token) {
    renderSlashlibLoginPrompt(results, input);
    return;
  }

  results.innerHTML = '<div class="tmdb-status">Ищу на Slashlib…</div>';

  try {
    const url =
      'https://api.cdnlibs.org/api/manga?site_id[]=2&page=1&limit=60' +
      '&sort_by=last_chapter_at&q=' + encodeURIComponent(q);

    const res = await fetch(url, {
      headers: {
        'Site-Id': '2',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        try {
          localStorage.removeItem('slashlib_token');
          localStorage.removeItem('slashlib_token_valid');
        } catch (e) {}
        renderSlashlibLoginPrompt(results, input, 'Сессия истекла. Войди снова.');
        return;
      }
      throw new Error('HTTP ' + res.status);
    }

    const json = await res.json();
    const list = (json && json.data) || [];

    if (list.length >= 30) {
      const qLow = q.toLowerCase();
      const anyMatch = list.some((r) => {
        const t = (r.rus_name || r.name || '').toLowerCase();
        return t.indexOf(qLow) >= 0;
      });
      if (!anyMatch) {
        try {
          localStorage.removeItem('slashlib_token');
          localStorage.removeItem('slashlib_token_valid');
        } catch (e) {}
        renderSlashlibLoginPrompt(results, input, 'Токен оказался гостевым. Войди в аккаунт.');
        return;
      }
    }

    if (!list.length) {
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    window._slashlibCache = list;

    results.innerHTML = list.map((r, idx) => {
      const cover = (r.cover && r.cover.thumbnail) ? r.cover.thumbnail : '';
      const title = r.rus_name || r.name || 'Без названия';
      const eng = r.eng_name || '';
      return (
        '<div class="tmdb-result" data-idx="' + idx + '">' +
          '<div class="tmdb-result-poster">' +
            (cover ? '<img src="' + esc(cover) + '" alt="">' : SVG_ICONS.book) +
          '</div>' +
          '<div class="tmdb-result-info">' +
            '<div class="tmdb-result-title">' + esc(title) + '</div>' +
            (eng ? '<div class="tmdb-result-meta" style="opacity:0.7">' + esc(eng) + '</div>' : '') +
          '</div></div>'
      );
    }).join('');

    results.querySelectorAll('.tmdb-result').forEach((el) => {
      el.onclick = () => {
        const idx = +el.dataset.idx;
        const r = window._slashlibCache[idx];
        results.innerHTML = '<div class="tmdb-status">Загружаю детали…</div>';
        loadSlashlibDetailsNative(r, results, token);
      };
    });
  } catch (e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

    
/**
 * 1. Заполнение формы (при клике на результат поиска)
 */
async function loadSlashlibDetailsNative(r, resultsEl, token) {
  if (!r || !r.slug_url) {
    resultsEl.innerHTML = '<div class="tmdb-status">Не удалось загрузить: нет slug</div>';
    return;
  }
  resultsEl.innerHTML = '<div class="tmdb-status">Загружаю данные через API…</div>';

  try {
    const fields = ['background', 'eng_name', 'otherNames', 'summary', 'releaseDate', 'country', 'authors', 'genres', 'tags'];
    const query = fields.map((f, i) => `fields[${i}]=${f}`).join('&');
    const apiUrl = `https://hapi.hentaicdn.org/api/manga/${r.slug_url}?${query}`;

    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const d = json.data;
    if (!d) throw new Error('Пустой ответ API');

    const allTags = [];
    if (d.genres) d.genres.forEach(g => allTags.push(g.name));
    if (d.tags) d.tags.forEach(t => allTags.push(t.name));

    // ПАРСИНГ ОПИСАНИЯ (все блоки + переносы)
    const getSummaryText = (summary) => {
      if (!summary) return '';
      if (typeof summary === 'string') return summary;
      const walk = (node) => {
        if (!node) return '';
        if (node.type === 'text') return node.text || '';
        if (node.type === 'hardBreak') return '\n';
        if (Array.isArray(node.content)) {
          let txt = node.content.map(walk).join('');
          if (node.type === 'paragraph') txt += '\n';
          return txt;
        }
        return '';
      };
      return walk(summary).replace(/\n{3,}/g, '\n\n').trim();
    };
    const desc = getSummaryText(d.summary);

    // ПАРСИНГ ГОДА (только 4 цифры)
    const getYear = (raw) => {
      if (!raw) return '';
      const m = String(raw).match(/\b(\d{4})\b/);
      return m ? m[1] : String(raw);
    };
    const yearStr = getYear(d.releaseDate);

    let pStatus = '';
    if (d.status && d.status.label) {
      const s = d.status.label.toLowerCase();
      if (s.includes('онгоинг') || s.includes('выходит')) pStatus = 'ongoing';
      else if (s.includes('завершен')) pStatus = 'completed';
      else if (s.includes('анонс')) pStatus = 'announced';
    }

    // ЗАПРОС ГЛАВ
    let chapterCount = '';
    try {
      const chRes = await fetch(`https://api.cdnlibs.org/api/manga/${r.slug_url}/chapters?limit=500`, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
      });
      if (chRes.ok) {
        const chJson = await chRes.json();
        if (chJson.meta && chJson.meta.total) {
          chapterCount = String(chJson.meta.total);
        } else if (Array.isArray(chJson.data)) {
          chapterCount = String(chJson.data.length);
        }
      }
    } catch(e) { console.warn('Не удалось получить главы:', e); }

    fillSlashlibForm({
      title: d.rus_name || d.name,
      title_en: d.eng_name || '',
      cover: d.cover ? d.cover.default : '',
      description: desc,
      country: d.authors ? d.authors.map(a => a.name).join(', ') : '',
      tags: allTags,
      year: yearStr,
      pages: chapterCount,
      link: 'https://v2.shlib.life/ru/manga/' + d.slug_url,
      bl: isYaoiTags(allTags),
      projectStatus: pStatus
    });

    const modal = document.getElementById('slashlibModal');
    if (modal) modal.classList.remove('on');
    toast('Заполнено через API Slashlib', 'success');

  } catch(e) {
    resultsEl.innerHTML = '<div class="tmdb-status">Ошибка API: ' + esc(String(e.message)) + '</div>';
  }
}
  



  /**
 * Заполнение формы полученными данными.
 */
function fillSlashlibForm(d) {
  const panel = document.getElementById('panel');
  if (!panel) return;

  const setVal = (id, val) => {
    const el = panel.querySelector('#' + id);
    if (el && val) el.value = val;
  };

  setVal('f_title', d.title);
  setVal('f_title_en', d.title_en);
  setVal('f_year', d.year);
  setVal('f_country', d.country);
  setVal('f_cover', d.cover);
  setVal('f_link', d.link);
  setVal('f_tags', (d.tags || []).join(', '));
  setVal('f_description', d.description);
  setVal('f_pages', d.pages);

  if (d.cover) setCoverPreview(d.cover);

  const segType = panel.querySelector('#f_type');
  if (segType) {
    const comicBtn = segType.querySelector('button[data-v="comic"]');
    if (comicBtn) {
      segType.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      comicBtn.classList.add('on');
    }
  }
  const draft = window._currentDraft;
  if (draft) draft.type = 'comic';

  if (draft) draft.projectStatus = d.projectStatus || '';
  const segProj = panel.querySelector('#f_project_status');
  if (segProj) {
    segProj.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', (b.dataset.v || '') === (d.projectStatus || ''));
    });
  }

  const segBl = panel.querySelector('#f_bl');
  if (segBl && d.bl) {
    const yes = segBl.querySelector('button[data-v="yes"]');
    const no = segBl.querySelector('button[data-v="no"]');
    if (yes) yes.classList.add('on');
    if (no) no.classList.remove('on');
    if (draft) draft.bl = true;
  }
}


  
  
  document.getElementById('slashlibClose').onclick = closeSlashlibModal;
document.getElementById('slashlibModal').onclick = (e) => {
  if(e.target.id === 'slashlibModal') closeSlashlibModal();
};
document.getElementById('slashlibQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runSlashlibSearch(); }
});
