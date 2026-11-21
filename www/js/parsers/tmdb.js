'use strict';

/* ==========================================================
   tmdb.js — TMDB: поиск, детали, постеры, окно поиска
   ========================================================== */

/* ============ ПОИСК В TMDB ============ */
const TMDB_KEY = '96f6dc5b4b470e00a8f40ccdf42d6fa8';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

const TMDB_COUNTRIES_RU = {
  'China': 'Китай',
  'Hong Kong': 'Гонконг',
  'Taiwan': 'Тайвань',
  'South Korea': 'Южная Корея',
  'Korea': 'Корея',
  'Japan': 'Япония',
  'Thailand': 'Таиланд',
  'Vietnam': 'Вьетнам',
  'Philippines': 'Филиппины',
  'Indonesia': 'Индонезия',
  'Malaysia': 'Малайзия',
  'Singapore': 'Сингапур',
  'India': 'Индия',
  'United States of America': 'США',
  'USA': 'США',
  'United Kingdom': 'Великобритания',
  'France': 'Франция',
  'Germany': 'Германия',
  'Italy': 'Италия',
  'Spain': 'Испания',
  'Poland': 'Польша',
  'Russia': 'Россия',
  'Soviet Union': 'СССР',
  'Ukraine': 'Украина',
  'Belarus': 'Беларусь',
  'Kazakhstan': 'Казахстан',
  'Canada': 'Канада',
  'Australia': 'Австралия',
  'New Zealand': 'Новая Зеландия',
  'Brazil': 'Бразилия',
  'Mexico': 'Мексика',
  'Argentina': 'Аргентина',
  'Turkey': 'Турция',
  'Israel': 'Израиль',
  'Egypt': 'Египет',
  'South Africa': 'ЮАР',
  'Netherlands': 'Нидерланды',
  'Belgium': 'Бельгия',
  'Sweden': 'Швеция',
  'Norway': 'Норвегия',
  'Denmark': 'Дания',
  'Finland': 'Финляндия',
  'Ireland': 'Ирландия',
  'Portugal': 'Португалия',
  'Greece': 'Греция',
  'Czech Republic': 'Чехия',
  'Czechia': 'Чехия',
  'Hungary': 'Венгрия',
  'Romania': 'Румыния',
  'Bulgaria': 'Болгария',
  'Austria': 'Австрия',
  'Switzerland': 'Швейцария'
};
function countryRu(name){
  if(!name) return '';
  return TMDB_COUNTRIES_RU[name] || name;
}

async function fetchAllTmdbPosters(id, type, baseLang) {
  const langGroups = [
    [...new Set([baseLang, 'en', 'ko', 'ja', 'zh'])].join(','),
    'th,vi,id,ms,tl',
    'fr,de,es,it,pt',
    'ru,pl,tr,ar,hi'
  ];
  
  const allPosters = new Set();
  const proxy = 'https://polka-proxy.foress-tfiree.workers.dev/?url=';
  
  for (const langs of langGroups) {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=${langs},null`;
    try {
      const r = await fetch(proxy + encodeURIComponent(url));
      if (r.ok) {
        const data = await r.json();
        (data.posters || []).forEach(p => {
          if (p.file_path) allPosters.add(p.file_path);
        });
      }
    } catch (e) {
      console.warn('Ошибка запроса группы языков:', langs, e);
    }
  }
  
  return Array.from(allPosters).map(path => TMDB_IMG + '/w780' + path);
}
  // Собирает постеры из TMDB, сортирует по языкам (оригинал -> ru -> en -> остальные) и убирает дубликаты
function extractTmdbPosters(d) {
  if (!d) return [];
  const origLang = d.original_language || '';
  
  const scores = { 'ru': 1, 'en': 2 };
  if (origLang) scores[origLang] = 0;
  
  const list = [];
  
  // Принудительно добавляем главную обложку (даже если её нет в общем списке)
  if (d.poster_path) {
    list.push({ path: d.poster_path, score: -1 }); 
  }

  if (d.images && Array.isArray(d.images.posters)) {
    d.images.posters.forEach(p => {
      if (p && p.file_path && p.file_path !== d.poster_path) {
        const lang = p.iso_639_1 || '';
        list.push({
          path: p.file_path,
          score: (scores[lang] !== undefined ? scores[lang] : 99)
        });
      }
    });
  }

  list.sort((a, b) => a.score - b.score);
  
  const seen = new Set();
  const result = [];
  for (const p of list) {
    if (seen.has(p.path)) continue;
    seen.add(p.path);
    result.push(TMDB_IMG + '/w780' + p.path); // Все картинки в одном размере
  }
  return result;
}

async function tmdbSearch(query){
  const url = 'https://api.themoviedb.org/3/search/multi'
    + '?api_key=' + TMDB_KEY
    + '&language=ru-RU'
    + '&query=' + encodeURIComponent(query)
    + '&include_adult=false';
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return (data.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv');
}
async function tmdbDetails(id, type){
  const url = 'https://api.themoviedb.org/3/' + type + '/' + id
    + '?api_key=' + TMDB_KEY
    + '&language=ru-RU'
    + '&append_to_response=alternative_titles,translations,keywords,images'
+ '&include_image_language=aa,ab,ae,af,ak,am,an,ar,as,av,ay,az,ba,be,bg,bh,bi,bm,bn,bo,br,bs,ca,ce,ch,co,cr,cs,cu,cv,cy,da,de,dv,dz,ee,el,en,eo,es,et,eu,fa,ff,fi,fj,fo,fr,fy,ga,gd,gl,gn,gu,gv,ha,he,hi,ho,hr,ht,hu,hy,hz,ia,id,ie,ig,ii,ik,io,is,it,iu,ja,jv,ka,kg,ki,kj,kk,kl,km,kn,ko,kr,ks,ku,kv,kw,ky,la,lb,lg,li,ln,lo,lt,lu,lv,mg,mh,mi,mk,ml,mn,mr,ms,mt,my,na,nb,nd,ne,ng,nl,nn,no,nr,nv,ny,oc,oj,om,or,os,pa,pi,pl,ps,pt,qu,rm,rn,ro,ru,rw,sa,sc,sd,se,sg,si,sk,sl,sm,sn,so,sq,sr,ss,st,su,sv,sw,ta,te,tg,th,ti,tk,tl,tn,to,tr,ts,tt,tw,ty,ug,uk,ur,uz,ve,vi,vo,wa,wo,xh,yi,yo,za,zh,zu,null';
+ '&include_image_language=ru,en,ko,ja,zh,th,vi,id,ms,null';
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
  
function openTmdbModal(){
  const modal = document.getElementById('tmdbModal');
  const input = document.getElementById('tmdbQuery');
  const results = document.getElementById('tmdbResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}
function closeTmdbModal(){
  const modal = document.getElementById('tmdbModal');
  if(modal) modal.classList.remove('on');
}

async function runTmdbSearch(){
  const input = document.getElementById('tmdbQuery');
  const results = document.getElementById('tmdbResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  try {
    const list = await tmdbSearch(q);
    if(!list.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    results.innerHTML = list.slice(0, 15).map(r => {
      const title = r.title || r.name || r.original_title || r.original_name || '—';
      const orig  = r.original_title || r.original_name || '';
      const date  = r.release_date || r.first_air_date || '';
      const year  = date ? date.substring(0,4) : '';
      const poster = r.poster_path ? (TMDB_IMG + '/w92' + r.poster_path) : '';
      const typeLabel = r.media_type === 'movie' ? 'Фильм' : 'Сериал';
      return '<div class="tmdb-result" data-id="' + r.id + '" data-type="' + r.media_type + '">'
        + '<div class="tmdb-result-poster">'
        +   (poster ? '<img src="' + esc(poster) + '" alt="">' : SVG_ICONS.movie)
        + '</div>'
        + '<div class="tmdb-result-info">'
        +   '<div class="tmdb-result-title">' + esc(title)
        +     '<span class="tmdb-result-type">' + typeLabel + '</span></div>'
        +   '<div class="tmdb-result-meta">' + esc(orig) + (year ? ' · ' + year : '') + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickTmdbResult(el.dataset.id, el.dataset.type);
    });
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function pickTmdbResult(id, type){
  const results = document.getElementById('tmdbResults');
  results.innerHTML = '<div class="tmdb-status">Загружаю данные…</div>';
  try {
    const d = await tmdbDetails(id, type);
    await applyTmdbData(d, type);
    closeTmdbModal();
    toast('Заполнено');
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}
  

async function applyTmdbData(d, type){
  const panel = document.getElementById('panel');
  if(!panel) return;
  const draft = window._currentDraft || null;
  const setVal = (id, val) => {
    const el = panel.querySelector('#' + id);
    if(el && val !== undefined && val !== null) el.value = val;
  };

  const ruTitle  = d.title || d.name || '';
  let enTitle = '';
  const altBlock = d.alternative_titles || {};
  const altList = altBlock.titles || altBlock.results || [];
  const enAlt = altList.find(x => {
    if (x.iso_3166_1 !== 'US' && x.iso_3166_1 !== 'GB') return false;
    const t = (x.title || x.name || '').trim();
    return t.length >= 4;
  });
  if(enAlt) enTitle = enAlt.title || enAlt.name || '';
  if(!enTitle && d.translations){
    const transList = d.translations.translations || [];
    const enTrans = transList.find(t => t.iso_639_1 === 'en' && t.data);
    if(enTrans && enTrans.data){ enTitle = enTrans.data.title || enTrans.data.name || ''; }
  }
  if(!enTitle) enTitle = d.original_title || d.original_name || '';

  const date     = d.release_date || d.first_air_date || '';
  const year     = date ? date.substring(0,4) : '';
  const poster   = d.poster_path ? (TMDB_IMG + '/w780' + d.poster_path) : '';
  const overview = d.overview || '';
  const countries = (d.production_countries || []).map(c => c.name).filter(Boolean);
  const country  = countries.length ? countryRu(countries[0]) : '';
  const genres   = (d.genres || []).map(g => g.name).filter(Boolean);
  
  // Достаем IMDb ID, если он есть
  const imdbId = d.external_ids?.imdb_id || '';

  setVal('f_title', ruTitle);
  setVal('f_title_en', enTitle);
  setVal('f_year', year);
  setVal('f_country', country);
  setVal('f_description', overview);
  setVal('f_cover', poster);
  setVal('f_tags', genres.join(', '));

  setCoverPreview(poster);

  let altPosters = [];
  try {
    const baseLang = (d.original_language || 'en').split('-')[0];
    altPosters = await fetchAllTmdbPosters(d.id, type, baseLang);
  } catch(e) {
    altPosters = extractTmdbPosters(d);
  }

  const altWrap = panel.querySelector('#altCoversWrap');
  if (altWrap) {
    if (altPosters.length) {
      altWrap.innerHTML = altPosters.map(url =>
        `<div class="alt-cover-thumb ${poster === url ? 'active' : ''}" data-url="${url}"><img src="${url}" loading="lazy" alt=""></div>`
      ).join('');
      altWrap.onclick = (e) => {
        const thumb = e.target.closest('.alt-cover-thumb');
        if(!thumb) return;
        const url = thumb.dataset.url;
        const hiddenCover = panel.querySelector('#f_cover');
        if (hiddenCover) hiddenCover.value = url;
        if (draft) { draft.cover = url; draft.customCover = true; }
        setCoverPreview(url);
        altWrap.querySelectorAll('.alt-cover-thumb').forEach(t => t.classList.toggle('active', t.dataset.url === url));
      };
    } else { altWrap.innerHTML = ''; }
  }

  const kwBlock = d.keywords || {};
  const kwList = kwBlock.results || kwBlock.keywords || [];
  const isBl = kwList.some(k => k.name === "boys' love (bl)" || k.name === "boys' love" || k.name === "bl" || k.id === 289844);
  if(isBl){
    const segBl = panel.querySelector('#f_bl');
    if(segBl){
      const blBtn = segBl.querySelector('button[data-v="yes"]');
      const noBtn = segBl.querySelector('button[data-v="no"]');
      if(blBtn && noBtn){ blBtn.classList.add('on'); noBtn.classList.remove('on'); }
    }
  }

  let newType = 'movie';
  if(type === 'tv'){
    const lang = d.original_language || '';
    if(['zh','ko','ja','th','cn','tw','hk'].indexOf(lang) >= 0){ newType = 'drama'; } 
    else { newType = 'series'; }
  } else { newType = 'movie'; }

  const segType = panel.querySelector('#f_type');
  if(segType){
    const btn = segType.querySelector('button[data-v="' + newType + '"]');
    if(btn){ segType.querySelectorAll('button').forEach(x => x.classList.remove('on')); btn.classList.add('on'); }
  }

  if (draft) {
    draft.title = ruTitle;
    draft.title_en = enTitle;
    draft.year = year;
    draft.country = country;
    draft.description = overview;
    draft.cover = poster;
    draft.tags = genres;
    draft.type = newType;
    draft.bl = isBl; 
    draft.altCovers = altPosters;
    draft.customCover = false;
    draft.imdbId = imdbId; // Сохраняем IMDb ID
  }

  // ==========================================
  // АВТОПОИСК ССЫЛОК
  // ==========================================
  
  // 1. Озвучка на Kinogo
  try {
    if (newType === 'movie' || newType === 'series') {
      toast('Ищу озвучку на Kinogo...', 'success');
      const kinoLink = await autoSearchKinogo(ruTitle, enTitle, year);
      if (kinoLink) {
        setVal('f_link', kinoLink);
        if (draft) draft.link = kinoLink;
      }
    }
  } catch(e) { console.warn('Kinogo error', e); }

  // 2. Оригинал на 123movies
  try {
    if (enTitle) {
      toast('Ищу оригинал на 123movies...', 'success');
      await autoSearch123Movies(enTitle, year, panel, draft);
    }
  } catch(e) { console.warn('123movies error', e); }

  // 3. Скачивание
  const searchName = enTitle || ruTitle;
  if (newType === 'movie') {
    try {
      if (searchName && year) {
        toast('Ищу ссылки на YTS...', 'success');
        const ytsResult = await autoSearchYTS(searchName, year, panel, draft);
        if (!ytsResult) {
          await autoSearchTorrentClaw(searchName, year, panel, draft, false);
        }
      }
    } catch(e) { console.warn('YTS/TorrentClaw error', e); }
  } else if (newType === 'series' || newType === 'drama') {
    try {
      if (searchName) {
        toast('Ищу ссылки на EZTV...', 'success');
        await autoSearchEZTV(imdbId, searchName, panel, draft);
      }
    } catch(e) { console.warn('EZTV error', e); }
  }
}
  


  
  document.getElementById('tmdbClose').onclick = () => closeTmdbModal();
document.getElementById('tmdbModal').onclick = (e) => {
  if(e.target.id === 'tmdbModal') closeTmdbModal();
};
document.getElementById('tmdbQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runTmdbSearch(); }
});
