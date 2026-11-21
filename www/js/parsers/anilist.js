'use strict';

/* ==========================================================
   anilist.js — AniList: поиск и подстановка данных
   ========================================================== */

/* ============ ПОИСК В ANILIST ============ */
const ANILIST_URL = 'https://graphql.anilist.co';

const ANILIST_COUNTRY_RU = {
  'JP': 'Япония',
  'KR': 'Южная Корея',
  'CN': 'Китай',
  'TW': 'Тайвань'
};

function stripHtml(s){
  if(!s) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function anilistSearch(query){
  const q = `
    query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          title { romaji english native userPreferred }
          description
          coverImage { extraLarge large }
          startDate { year }
          countryOfOrigin
          genres
          tags { name rank }
          staff(perPage: 4) { edges { role node { name { full } } } }
          chapters
          volumes
          format
        }
      }
    }
  `;
  const r = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: q, variables: { search: query } })
  });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if(j.errors && j.errors.length) throw new Error(j.errors[0].message);
  return (j.data && j.data.Page && j.data.Page.media) || [];
}
  
function openAniListModal(){
  const modal = document.getElementById('anilistModal');
  const input = document.getElementById('anilistQuery');
  const results = document.getElementById('anilistResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}
function closeAniListModal(){
  const modal = document.getElementById('anilistModal');
  if(modal) modal.classList.remove('on');
}

async function runAniListSearch(){
  const input = document.getElementById('anilistQuery');
  const results = document.getElementById('anilistResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  try {
    const list = await anilistSearch(q);
    if(!list.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    window._anilistCache = list;
    results.innerHTML = list.map((r, i) => {
      const t = r.title || {};
      const title = t.userPreferred || t.english || t.romaji || t.native || '—';
      const orig = t.native || t.romaji || '';
      const year = (r.startDate && r.startDate.year) ? r.startDate.year : '';
      const poster = (r.coverImage && (r.coverImage.large || r.coverImage.extraLarge)) || '';
      let format = 'Манга';
      if(r.format === 'MANHWA') format = 'Манхва';
      else if(r.format === 'MANHUA') format = 'Маньхуа';
      else if(r.format === 'ONE_SHOT') format = 'Ваншот';
      else if(r.format === 'NOVEL') format = 'Ранобэ';
      return '<div class="tmdb-result" data-idx="' + i + '">'
        + '<div class="tmdb-result-poster">'
        +   (poster ? '<img src="' + esc(poster) + '" alt="">' : SVG_ICONS.book)
        + '</div>'
        + '<div class="tmdb-result-info">'
        +   '<div class="tmdb-result-title">' + esc(title)
        +     '<span class="tmdb-result-type">' + format + '</span></div>'
        +   '<div class="tmdb-result-meta">' + esc(orig) + (year ? ' · ' + year : '') + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickAniListResult(+el.dataset.idx);
    });
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

function pickAniListResult(idx){
  const list = window._anilistCache || [];
  const r = list[idx];
  if(!r) return;
  applyAniListData(r);
  closeAniListModal();
  toast('Заполнено');
}

function applyAniListData(d){
  const panel = document.getElementById('panel');
  if(!panel) return;
  const draft = window._currentDraft || null;
  const setVal = (id, val) => {
    const el = panel.querySelector('#' + id);
    if(el && val !== undefined && val !== null) el.value = val;
  };

  const t = d.title || {};
  // Русское название — если есть, но AniList редко его знает.
  // В userPreferred обычно ромадзи или английское — что сообщество выбрало.
  // Для основного поля «Название» оставляем то, что в userPreferred,
  // а англ. кладём в title_en.
  const mainTitle = t.userPreferred || t.english || t.romaji || t.native || '';
  const enTitle   = t.english || t.romaji || '';

  const cover = (d.coverImage && (d.coverImage.extraLarge || d.coverImage.large)) || '';
  const desc  = stripHtml(d.description || '');
  const year  = (d.startDate && d.startDate.year) ? String(d.startDate.year) : '';
  const country = ANILIST_COUNTRY_RU[d.countryOfOrigin] || d.countryOfOrigin || '';
  const chapters = d.chapters ? String(d.chapters) : '';
  const genres = (d.genres || []).slice();

  // Теги — берём только релевантные, с высоким rank
  const tags = (d.tags || [])
    .filter(x => (x.rank || 0) >= 60)
    .map(x => x.name)
    .slice(0, 10);

  // Автор — берём первую роль Story или Story & Art
  let author = '';
  const staff = (d.staff && d.staff.edges) || [];
  const storyEdge = staff.find(e => /story/i.test(e.role || '')) || staff[0];
  if(storyEdge && storyEdge.node && storyEdge.node.name){
    author = storyEdge.node.name.full || '';
  }

  setVal('f_title', mainTitle);
  setVal('f_title_en', enTitle);
  setVal('f_year', year);
  setVal('f_country', author); // для комиксов поле «страна» = автор
  setVal('f_pages', chapters);
  setVal('f_description', desc);
  setVal('f_cover', cover);
  setVal('f_tags', tags.join(', '));

  setCoverPreview(cover);

  // BL — если в тегах есть яой/слэш/boys love
  const allTags = (d.tags || []).map(x => x.name.toLowerCase());
  const isBl = allTags.some(n =>
    n.includes("boys' love") || n.includes("boys love") ||
    n === 'yaoi' || n === 'shounen ai' || n === 'shounen-ai'
  );
  if(isBl){
    const segBl = panel.querySelector('#f_bl');
    if(segBl){
      const blBtn = segBl.querySelector('button[data-v="yes"]');
      const noBtn = segBl.querySelector('button[data-v="no"]');
      if(blBtn && noBtn){
        blBtn.classList.add('on');
        noBtn.classList.remove('on');
      }
    }
    if(draft) draft.bl = true;
  }
}

document.getElementById('anilistClose').onclick = () => closeAniListModal();
document.getElementById('anilistModal').onclick = (e) => {
  if(e.target.id === 'anilistModal') closeAniListModal();
};
document.getElementById('anilistQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runAniListSearch(); }
});
