'use strict';

/* ==========================================================
   kinogo.js — Kinogo: поиск и подстановка данных
   ========================================================== */

  /* ============ ПОИСК НА KINOGO (IFRAME BRIDGE) ============ */
function openKinogoModal(){
  const modal = document.getElementById('kinogoModal');
  const input = document.getElementById('kinogoQuery');
  const results = document.getElementById('kinogoResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeKinogoModal(){
  document.getElementById('kinogoModal').classList.remove('on');
  const frame = document.getElementById('polka-kinogo-frame');
  if(frame) frame.remove();
}
  function cleanKinogoTitle(str) {
  if (!str) return '';
  let t = String(str).trim();
  // Удаляем год в конце, например (2026) или (2026 г.)
  t = t.replace(/\s*\(\d{4}(?:\s*г\.?)?\)\s*$/i, '');
  // Удаляем сезоны/серии в конце, например (1 сезон), (1-5 сезон), (все серии)
  t = t.replace(/\s*\([^)]*(?:сезон|серии|серия)[^)]*\)\s*$/i, '');
  // Убираем пустые скобки, если остались
  t = t.replace(/\s*\(\s*\)\s*$/, '');
  return t.trim();
  }

async function runKinogoSearch(){
  const input = document.getElementById('kinogoQuery');
  const results = document.getElementById('kinogoResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  
  results.innerHTML = '<div class="tmdb-status">Ищу на Kinogo…</div>';
  
  const url = 'https://kinogo.pl/index.php?do=search&subaction=search&titleonly=3&story=' + encodeURIComponent(q);
  
  try {
    const res = await nativeFetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const cards = doc.querySelectorAll('.card.d-flex');
    
    if(!cards.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    
    const data = [];
    cards.forEach(card => {
      const a = card.querySelector('h2.card__title a');
      if(!a) return;
      
      const title = cleanKinogoTitle(a.textContent.trim());
      const url = a.href;
      const img = card.querySelector('.card__img img');
      let cover = img ? (img.getAttribute('data-src') || img.getAttribute('src')) : '';
      
      if(cover && cover.startsWith('/')) cover = 'https://kinogo.pl' + cover;
      
      data.push({ title, url, cover });
    });
    
    window._kinogoCache = data;
    
    results.innerHTML = data.map((r, idx) => `
      <div class="tmdb-result" data-idx="${idx}">
        <div class="tmdb-result-poster">
          ${r.cover ? `<img src="${esc(r.cover)}" alt="">` : SVG_ICONS.movie}
        </div>
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${esc(r.title)}</div>
          <div class="tmdb-result-meta">Kinogo</div>
        </div>
      </div>
    `).join('');

    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickKinogoResult(+el.dataset.idx);
    });
    
  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка поиска: ' + esc(e.message) + '</div>';
  }
}

  
async function pickKinogoResult(idx){
  const list = window._kinogoCache || [];
  const r = list[idx];
  if(!r) return;

  const results = document.getElementById('kinogoResults');
  results.innerHTML = '<div class="tmdb-status">Загружаю данные фильма...</div>';

  try {
    const res = await nativeFetch(r.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const getText = (el) => el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
    const getMeta = (sel) => doc.querySelector(sel)?.getAttribute('content') || '';

    const fullTitle = getText(doc.querySelector('h1'));
    const title = cleanKinogoTitle(fullTitle);
    const titleEn = getText(doc.querySelector('.pmovie__original-title'));

    let description = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');

    const possibleDescSelectors = [
      '.b-text',
      '.pmovie__text',
      '.pmovie__desc',
      '.full-text',
      '[itemprop="description"]',
      '.desc-text',
      '#full-desc'
    ];

    for (const sel of possibleDescSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const txt = getText(el);
        if (txt.length > description.length) {
          description = txt;
        }
      }
    }

    let cover = getMeta('meta[property="og:image"]');
    if (!cover) {
      const img = doc.querySelector('.pmovie__poster img, .poster img');
      if (img) {
        const src = img.getAttribute('src') || '';
        const origin = new URL(r.url).origin;
        cover = src.startsWith('/') ? origin + src : src;
      }
    }

    let year = '';
    const yearMatch = fullTitle.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];

    const tags = [];
    doc.querySelectorAll('a[href*="/tags/"], a[href*="/tag/"], [itemprop="genre"] a, .pmovie__tags a').forEach(a => {
        const t = a.textContent.trim();
        if(t && t.length < 30 && !tags.includes(t)) tags.push(t);
    });

    const d = { title, title_en: titleEn, description, cover, year, tags, link: r.url };

    await applyKinogoData(d);
    closeKinogoModal();

  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки: ' + esc(e.message) + '</div>';
    closeKinogoModal();
  }
}
  
async function applyKinogoData(d){
  const panel = document.getElementById('panel');
  if(!panel) return;
  const setVal = (id, val) => {
    const el = panel.querySelector('#' + id);
    if(el && val !== undefined && val !== null) el.value = val;
  };

  setVal('f_title', d.title);
  setVal('f_title_en', d.title_en);
  setVal('f_year', d.year);
  setVal('f_description', d.description);
  setVal('f_link', d.link);
  setVal('f_tags', d.tags.join(', '));

  if(d.cover) setCoverPreview(d.cover);

  const results = document.getElementById('kinogoResults');
  if(results) results.innerHTML = '<div class="tmdb-status">Ищу обложку в TMDB...</div>';

  let tmdbPoster = null;
  let tmdbAlts = [];

  try {
    const titleRu = (d.title || '').trim();
    const titleEn = (d.title_en || '').trim();
    const yearStr = (d.year || '').trim();

    // Приоритет: Английское название (если есть и не на кириллице), затем Русское
    let query = titleRu;
    if (titleEn && titleEn.length > 2 && !/[\u0400-\u04FF]/.test(titleEn)) {
        query = titleEn;
    }

    let yearParam = yearStr ? `&year=${yearStr}` : '';
    let tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(query)}${yearParam}`;
    console.log('[Kinogo] TMDB Search 1 (с годом):', tmdbUrl);

    let res = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
    let json = await res.json();

    // Если пусто, пробуем без года
    if (!json.results || json.results.length === 0) {
        console.log('[Kinogo] Пусто с годом, ищу без года...');
        tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(query)}`;
        res = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
        json = await res.json();
    }

    // Если всё еще пусто, пробуем русское (если искали по английскому)
    if ((!json.results || json.results.length === 0) && query === titleEn && titleRu) {
        console.log('[Kinogo] Пусто по английскому, ищу по русскому...');
        tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(titleRu)}${yearParam}`;
        res = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
        json = await res.json();
    }

    if (json.results && json.results.length > 0) {
      const best = json.results[0];
      console.log('[Kinogo] Найден фильм в TMDB:', best);

      if (best.poster_path) {
        tmdbPoster = TMDB_IMG + '/w780' + best.poster_path;

        // Запрашиваем детали для альтернативных обложек
        try {
            const detailsUrl = `https://api.themoviedb.org/3/movie/${best.id}?api_key=${TMDB_KEY}&language=ru-RU&append_to_response=images&include_image_language=ru,en,null`;
            const detRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(detailsUrl));
            if (detRes.ok) {
              const details = await detRes.json();
              if (typeof extractTmdbPosters === 'function') {
                  tmdbAlts = extractTmdbPosters(details);
              }
            }
        } catch(err) {
            console.warn('[Kinogo] Ошибка при получении доп. обложек:', err);
        }
      } else {
          console.warn('[Kinogo] Фильм найден, но у него нет poster_path');
      }
    } else {
        console.warn('[Kinogo] TMDB ничего не нашел ни по одному из вариантов.');
    }
  } catch(e) {
    console.error('[Kinogo] Ошибка при поиске TMDB:', e);
  }

  if (tmdbPoster) {
    setVal('f_cover', tmdbPoster);
    setCoverPreview(tmdbPoster);
    const draft = window._currentDraft;
    if (draft) {
      draft.cover = tmdbPoster;
      draft.altCovers = tmdbAlts;
      draft.customCover = false;
    }
    if (typeof renderAltCoversUI === 'function') {
        renderAltCoversUI(panel, tmdbAlts, tmdbPoster);
    }
    toast('Обложка взята с TMDB', 'success');
  } else {
    setVal('f_cover', d.cover);
    const draft = window._currentDraft;
    if (draft) {
      draft.cover = d.cover;
      draft.altCovers = [];
      draft.customCover = false;
    }
    if (typeof renderAltCoversUI === 'function') {
        renderAltCoversUI(panel, [], d.cover);
    }
    toast('Обложка с TMDB не найдена, взята с Kinogo', 'warn');
  }

  const segType = panel.querySelector('#f_type');
  if(segType){
    const btn = segType.querySelector('button[data-v="movie"]');
    if(btn){
      segType.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
    }
  }
  const draft = window._currentDraft;
  if(draft) draft.type = 'movie';

  // АВТОПОИСК ОРИГИНАЛА НА 123MOVIES
  if (d.title_en) {
    toast('Ищу оригинал на 123movies...', 'success');
    await autoSearch123Movies(d.title_en, d.year, panel, draft);
  }

  // АВТОПОИСК ССЫЛКИ НА СКАЧИВАНИЕ (YTS)
  if (d.title_en && d.year) {
    toast('Ищу ссылку на скачивание...', 'success');
    await autoSearchYTS(d.title_en, d.year, panel, draft);
  }
}  
// Обработчики кнопок
document.getElementById('kinogoClose').onclick = closeKinogoModal;
document.getElementById('kinogoModal').onclick = (e) => {
  if(e.target.id === 'kinogoModal') closeKinogoModal();
};
document.getElementById('kinogoQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runKinogoSearch(); }
});
