'use strict';
/* ==========================================================
   editor.js — Форма добавления/редактирования:
   buildEditorHTML, renderEditor, сезоны, обложки в форме, альт-обложки
   ========================================================== */

function defaultTypeForCategory() {
  if (state.category === 'book') return 'book';
  if (state.category === 'comic') return 'comic';
  if (state.category === 'music') return 'music';
  return 'movie';
}

// Слаги источников: не ломаются на хвостовом слэше, query и cdnlibs.org
function editorSlashSlug(u) {
  const m = String(u || '').match(/\/manga\/([^/?#\s]+)/i);
  return m ? m[1] : '';
}
function editorComizySlug(u) {
  const m = String(u || '').match(/comizy\.io\/([^/?#\s]+)/i);
  return m ? m[1] : '';
}

/* ============ РАЗМЕТКА ФОРМЫ ============ */

function buildEditorHTML(draft, isEdit) {
  const group = groupOf(draft.type);

  const ratingButtons = Array.from({ length: 10 }, (_, i) => {
    const v = i + 1;
    const on = draft.rating === v;
    const style = on ? ratingActiveStyle(v) : ratingIdleStyle(v);
    return `<button type="button" data-v="${v}" class="${on ? 'on' : ''}" style="${style}">${v}</button>`;
  }).join('');

  const blFieldHTML = () => {
    if (state.emergencyMode) return '';
    return '<label>Пометка</label>' +
      '<div class="seg" id="f_bl">' +
      '<button type="button" data-v="no" class="' + (!draft.bl ? 'on' : '') + '">Нет</button>' +
      '<button type="button" data-v="yes" class="bl-chip ' + (draft.bl ? 'on' : '') + '">BL</button>' +
      '</div>';
  };

  const heartsFieldHTML = () => {
    if (state.emergencyMode) return '';
    const heartsHTML = [1, 2, 3, 4, 5].map(n => {
      const filled = n <= (draft.hearts || 0);
      return '<button type="button" data-v="' + n + '" class="' + (filled ? 'filled' : '') + '">' + heartSVG(filled) + '</button>';
    }).join('');
    return '<label>Рейтинг</label><div class="hearts-input" id="f_hearts">' + heartsHTML + '</div>';
  };

  const projStatusFieldHTML = () =>
    '<label>Статус проекта</label>' +
    '<div class="seg" id="f_project_status">' +
    '<button type="button" data-v="" class="' + (!draft.projectStatus ? 'on' : '') + '">Нет</button>' +
    '<button type="button" data-v="completed" class="' + (draft.projectStatus === 'completed' ? 'on' : '') + '">Завершено</button>' +
    '<button type="button" data-v="ongoing" class="' + (draft.projectStatus === 'ongoing' ? 'on' : '') + '">Онгоинг</button>' +
    '<button type="button" data-v="announced" class="' + (draft.projectStatus === 'announced' ? 'on' : '') + '">Анонс</button>' +
    '</div>';

  let groupFields = '';

  if (group === 'screen') {
    groupFields =
      blFieldHTML() + heartsFieldHTML() + projStatusFieldHTML() +
      '<label>Название на английском</label>' +
      '<input type="text" id="f_title_en" value="' + esc(draft.title_en || '') + '" placeholder="English title…" autocomplete="off">' +
      '<div class="row-2">' +
      '<div><label>Год</label><input type="text" id="f_year" value="' + esc(draft.year) + '" inputmode="numeric"></div>' +
      '<div><label>Страна</label><input type="text" id="f_country" value="' + esc(draft.country) + '" autocomplete="off"></div>' +
      '</div>' +
      '<label>Описание</label>' +
      '<textarea class="desc" id="f_description" placeholder="Синопсис, краткая аннотация…">' + esc(draft.description) + '</textarea>' +
      '<label>Заметки</label>' +
      '<textarea id="f_notes" placeholder="Личные мысли, где остановился…">' + esc(draft.notes) + '</textarea>' +
      '<label>Теги (через запятую)</label>' +
      '<input type="text" id="f_tags" value="' + esc((draft.tags || []).join(', ')) + '" placeholder="фантастика, пересмотр" autocomplete="off">' +
      '<label>Ссылка — озвучка</label>' +
      '<input type="text" id="f_link" value="' + esc(draft.link || '') + '" placeholder="https://…" autocomplete="off">' +
      '<label>Ссылка — оригинал / субтитры</label>' +
      '<input type="text" id="f_link_sub" value="' + esc(draft.link_sub || '') + '" placeholder="https://…" autocomplete="off">' +
      '<label>Ссылка — экстры</label>' +
      '<input type="text" id="f_link_extras" value="' + esc(draft.link_extras || '') + '" placeholder="https://…" autocomplete="off">';

  } else if (group === 'comic') {
    groupFields =
      blFieldHTML() + heartsFieldHTML() + projStatusFieldHTML() +
      '<label>Название на английском</label>' +
      '<input type="text" id="f_title_en" value="' + esc(draft.title_en || '') + '" placeholder="English title…" autocomplete="off">' +
      '<label>Автор</label>' +
      '<input type="text" id="f_country" value="' + esc(draft.country) + '" autocomplete="off">' +
      '<div class="row-2">' +
      '<div><label>Год</label><input type="text" id="f_year" value="' + esc(draft.year) + '" inputmode="numeric"></div>' +
      '<div><label>Глав</label><input type="text" id="f_pages" value="' + esc(draft.pages) + '" inputmode="numeric"></div>' +
      '</div>' +
      '<label>Описание</label>' +
      '<textarea class="desc" id="f_description" placeholder="Аннотация…">' + esc(draft.description) + '</textarea>' +
      '<label>Заметки</label>' +
      '<textarea id="f_notes" placeholder="Личные мысли…">' + esc(draft.notes) + '</textarea>' +
      '<label>Теги (через запятую)</label>' +
      '<input type="text" id="f_tags" value="' + esc((draft.tags || []).join(', ')) + '" placeholder="фэнтези, романтика" autocomplete="off">' +
      '<label>Ссылка (читать)</label>' +
      '<input type="text" id="f_link" value="' + esc(draft.link || '') + '" placeholder="https://…" autocomplete="off">' +
      '<label>Ссылка на Comizy</label>' +
      '<div class="comizy-link-row">' +
      '<input type="text" id="f_link_comizy" value="' + esc(draft.link_comizy || '') + '" placeholder="https://comizy.io/…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="comizy-refresh-btn" id="btnComizyRefresh" title="Обновить главы / найти автоматически">🔄</button>' +
      '</div>' +
      '<div class="comizy-link-hint" id="comizyLinkHint"></div>';

  } else if (group === 'book') {
    groupFields =
      blFieldHTML() + heartsFieldHTML() +
      '<label>Автор</label>' +
      '<input type="text" id="f_country" value="' + esc(draft.country) + '" autocomplete="off">' +
      '<div class="row-2">' +
      '<div><label>Год</label><input type="text" id="f_year" value="' + esc(draft.year) + '" inputmode="numeric"></div>' +
      '<div><label>Страниц</label><input type="text" id="f_pages" value="' + esc(draft.pages) + '" inputmode="numeric"></div>' +
      '</div>' +
      '<label>Описание</label>' +
      '<textarea class="desc" id="f_description" placeholder="Аннотация…">' + esc(draft.description) + '</textarea>' +
      '<label>Заметки</label>' +
      '<textarea id="f_notes" placeholder="Личные мысли…">' + esc(draft.notes) + '</textarea>' +
      '<label>Теги (через запятую)</label>' +
      '<input type="text" id="f_tags" value="' + esc((draft.tags || []).join(', ')) + '" placeholder="фэнтези, перечитать" autocomplete="off">' +
      '<label>Ссылка (URL для чтения)</label>' +
      '<input type="text" id="f_link" value="' + esc(draft.link || '') + '" placeholder="https://…" autocomplete="off">';

  } else if (group === 'music') {
    groupFields =
      '<label>Исполнитель</label>' +
      '<input type="text" id="f_country" value="' + esc(draft.country) + '" autocomplete="off">' +
      '<label>Год выпуска</label>' +
      '<input type="text" id="f_year" value="' + esc(draft.year) + '" inputmode="numeric">' +
      '<label>Жанры (через запятую)</label>' +
      '<input type="text" id="f_tags" value="' + esc((draft.tags || []).join(', ')) + '" placeholder="рок, инди" autocomplete="off">' +
      '<label>Заметки</label>' +
      '<textarea id="f_notes" placeholder="Личные мысли…">' + esc(draft.notes) + '</textarea>';
  }

  const coverFieldHTML =
    '<input type="hidden" id="f_cover" value="' + esc(draft.cover) + '">' +
    '<input type="hidden" id="f_comizy_chapters" value="' + esc(JSON.stringify(draft.comizyChapters || [])) + '">';

  const headTitle = isEdit
    ? (draft.parentId ? 'Редактировать · Сезон ' + draft.seasonNumber : 'Редактировать')
    : (draft.parentId ? 'Новый сезон' : 'Новая запись');

  return `
<div class="panel-head">
  <h2>${headTitle}</h2>
  <button type="button" class="iconbtn" id="closeForm">${SVG_ICONS.close}</button>
</div>
<div class="edit-body">
  <div class="edit-layout">
    <div class="edit-left">
      <div class="cover-preview ${group === 'music' ? 'square' : ''}" id="coverPreview"></div>
      <div class="alt-covers-wrap" id="altCoversWrap"></div>
      <button type="button" class="btn ghost" id="btnFetchCovers" style="margin-top:10px; width:100%; font-size:12.5px; height:32px; padding:0;">🔄 Запросить обложки</button>
    </div>
    <div class="edit-right">
      <label>Название</label>
      <div class="title-row">
        <input type="text" id="f_title" value="${esc(draft.title)}" placeholder="Название…" autocomplete="off">
        ${group === 'screen' ? `<div class="search-source-dropdown">
          <button type="button" class="tmdb-search-btn" id="screenSearchDropdownBtn">${SVG_ICONS.search} Поиск</button>
          <div class="search-source-menu" id="screenSearchMenu">
            <button type="button" data-source="tmdb">TMDB</button>
            <button type="button" data-source="dorama">Dorama.land</button>
            <button type="button" data-source="kinogo">Kinogo</button>
          </div>
        </div>` : ''}
        ${group === 'comic' ? `<div class="search-source-dropdown">
          <button type="button" class="anilist-search-btn" id="comicSearchDropdownBtn">${SVG_ICONS.search} Поиск</button>
          <div class="search-source-menu" id="comicSearchMenu">
            <button type="button" data-source="comizy">Comizy</button>
            <button type="button" data-source="anilist">AniList</button>
            <button type="button" data-source="slashlib">Slashlib</button>
          </div>
        </div>` : ''}
        ${group === 'book' ? `<div class="search-source-dropdown">
          <button type="button" class="tmdb-search-btn" id="bookSearchDropdownBtn">${SVG_ICONS.search} Поиск</button>
          <div class="search-source-menu" id="bookSearchMenu">
            <button type="button" data-source="knigi">Knigi.ws</button>
            <button type="button" data-source="flibusta">Flibusta</button>
            <button type="button" data-source="ficbook">Ficbook</button>
            <button type="button" data-source="fanfics">Fanfics.me</button>
            <button type="button" data-source="ao3">AO3</button>
          </div>
        </div>` : ''}
      </div>
      <label>Тип</label>
      <div class="seg" id="f_type">
        ${Object.entries(TYPES).map(([k, v]) =>
          `<button type="button" data-v="${k}" data-t="${k}" class="type-chip ${draft.type === k ? 'on' : ''}">${v.icon} ${v.label}</button>`
        ).join('')}
      </div>
      <label>Статус</label>
      <div class="seg" id="f_status">
        ${Object.entries(STATUSES).map(([k, v]) => {
          const c = v.color;
          const lbl = statusLabel(k, draft.type);
          return `<button type="button" data-v="${k}" class="status-chip ${draft.status === k ? 'on' : ''}" style="--dot-c:${c};--dot-bg:${hexToRgba(c, .14)}"><span class="status-dot"></span>${esc(lbl)}</button>`;
        }).join('')}
      </div>
      <label>Оценка</label>
      <div class="stars" id="f_rating">
        ${ratingButtons}
        <button type="button" class="clear" data-v="0">Сброс</button>
      </div>
      ${groupFields}
      ${coverFieldHTML}
    </div>
  </div>
</div>
<div class="edit-footer">
  <div class="actions">
    ${isEdit ? '<button type="button" class="btn danger" id="btnDelete">Удалить</button>' : ''}
    <button type="button" class="btn ghost" id="btnCancel">Отмена</button>
    <button type="button" class="btn primary" id="btnSave">${isEdit ? 'Сохранить' : 'Добавить'}</button>
  </div>
</div>`;
}

/* ============ ОТКРЫТИЕ ФОРМЫ ============ */

function openAddSeason(parentId) {
  const parent = items.find(x => x.id === parentId);
  if (!parent) { toast('Родительская карточка не найдена'); return; }
  if (groupOf(parent.type) !== 'screen') {
    toast('Сезоны есть только у фильмов, сериалов и дорам');
    return;
  }
  const seasons = getSeasons(parentId);
  const nextNum = seasons.reduce((m, s) => Math.max(m, s.seasonNumber || 0), 0) + 1;

  const draft = {
    id: null,
    title: (parent.title ? parent.title : '') + ' Сезон ' + nextNum,
    title_en: parent.title_en || '',
    type: parent.type,
    status: 'want',
    rating: 0,
    hearts: 0,
    year: parent.year || '',
    country: parent.country || '',
    cover: parent.cover || '',
    tags: Array.isArray(parent.tags) ? parent.tags.slice() : [],
    description: parent.description || '',
    notes: '',
    bl: !!parent.bl,
    pages: '',
    link: '',
    link_sub: '',
    link_extras: '',
    favorite: false,
    moments: [],
    // Ручное создание ничего не парсит — статус проекта оставляем пустым.
    projectStatus: '',
    parentId: parentId,
    seasonNumber: nextNum,
    altCovers: [],
    customCover: false,
    tmdbId: parent.tmdbId || null,
    imdbId: parent.imdbId || ''
  };

  window._currentDraft = draft;
  const panel = document.getElementById('panel');
  renderEditor(panel, draft, false);
  document.getElementById('sheet').classList.add('on');
}

function openForm(id) {
  const isEdit = !!id;
  let draft;

  if (isEdit) {
    draft = Object.assign({}, items.find(x => x.id === id));
    if (typeof draft.title !== 'string') draft.title = '';
    if (typeof draft.pages !== 'string') draft.pages = '';
    if (!Array.isArray(draft.tags)) draft.tags = [];
    if (typeof draft.country !== 'string') draft.country = '';
    if (typeof draft.year !== 'string') draft.year = String(draft.year || '');
    if (typeof draft.link !== 'string') draft.link = '';
    if (typeof draft.link_sub !== 'string') draft.link_sub = '';
    if (typeof draft.link_extras !== 'string') draft.link_extras = '';
    if (typeof draft.title_en !== 'string') draft.title_en = '';
    if (typeof draft.description !== 'string') draft.description = '';
    if (typeof draft.notes !== 'string') draft.notes = '';
    if (typeof draft.cover !== 'string') draft.cover = '';
    if (typeof draft.hearts !== 'number') draft.hearts = 0;
    if (typeof draft.link_comizy !== 'string') draft.link_comizy = '';
    if (!Array.isArray(draft.comizyChapters)) draft.comizyChapters = [];
    if (!Array.isArray(draft.altCovers)) draft.altCovers = [];
    draft.customCover = !!draft.customCover;
    draft.comizyLocked = !!draft.comizyLocked;
    draft.comizyOff = !!draft.comizyOff;
  } else {
    draft = {
      id: null, title: '', title_en: '', type: defaultTypeForCategory(), status: 'want',
      rating: 0, hearts: 0, year: '', country: '', cover: '', tags: [],
      description: '', notes: '', bl: false, pages: '',
      link: '', link_sub: '', link_extras: '', link_comizy: '', comizyChapters: [],
      favorite: false, moments: [], projectStatus: '', altCovers: [], customCover: false
    };
  }

  const panel = document.getElementById('panel');
  window._currentDraft = draft;
  renderEditor(panel, draft, isEdit);
  document.getElementById('sheet').classList.add('on');
}

/* ============ РЕДАКТОР ============ */

function renderEditor(panel, draft, isEdit) {
  panel.innerHTML = buildEditorHTML(draft, isEdit);
  const body = panel.querySelector('.edit-body');
  if (body) body.scrollTop = 0;
  setCoverPreview(draft.cover || '');

  const segType = panel.querySelector('#f_type');
  const segStatus = panel.querySelector('#f_status');
  const segBl = panel.querySelector('#f_bl');
  const segProj = panel.querySelector('#f_project_status');
  const stars = panel.querySelector('#f_rating');
  const heartsEl = panel.querySelector('#f_hearts');

  if (heartsEl) {
    heartsEl.onclick = e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const v = +b.dataset.v;
      const cur = draft.hearts || 0;
      const newVal = (cur === v) ? 0 : v;
      draft.hearts = newVal;
      heartsEl.querySelectorAll('button').forEach(x => {
        const n = +x.dataset.v;
        const filled = n <= newVal;
        x.classList.toggle('filled', filled);
        x.innerHTML = heartSVG(filled);
      });
    };
  }

  function readInto(target) {
    const getVal = id => {
      const el = panel.querySelector('#' + id);
      return el ? el.value : undefined;
    };
    const t = getVal('f_title'); if (t !== undefined) target.title = t;
    const ten = getVal('f_title_en'); if (ten !== undefined) target.title_en = ten;
    const y = getVal('f_year'); if (y !== undefined) target.year = y;
    const c = getVal('f_country'); if (c !== undefined) target.country = c;
    const cov = getVal('f_cover'); if (cov !== undefined) target.cover = cov;
    const tg = getVal('f_tags');
    if (tg !== undefined) target.tags = tg.split(',').map(s => s.trim()).filter(Boolean);
    const d = getVal('f_description'); if (d !== undefined) target.description = d;
    const n = getVal('f_notes'); if (n !== undefined) target.notes = n;
    const p = getVal('f_pages'); if (p !== undefined) target.pages = p;
    const ln = getVal('f_link'); if (ln !== undefined) target.link = ln;
    const lns = getVal('f_link_sub'); if (lns !== undefined) target.link_sub = lns;
    const lne = getVal('f_link_extras'); if (lne !== undefined) target.link_extras = lne;
    const lcm = getVal('f_link_comizy'); if (lcm !== undefined) target.link_comizy = lcm;
    const cmch = getVal('f_comizy_chapters');
    if (cmch !== undefined) {
      try { target.comizyChapters = JSON.parse(cmch || '[]'); }
      catch (e) { target.comizyChapters = Array.isArray(target.comizyChapters) ? target.comizyChapters : []; }
    }
    if (target !== draft) {
      target.comizyLocked = !!draft.comizyLocked;
      target.comizyOff = !!draft.comizyOff;
    }
    const statusOn = segStatus.querySelector('button.on');
    if (statusOn) target.status = statusOn.dataset.v;
    const ratingOn = stars.querySelector('button.on[data-v]');
    target.rating = ratingOn ? +ratingOn.dataset.v : 0;
    if (segBl) {
      const blOn = segBl.querySelector('button.on');
      if (blOn) target.bl = blOn.dataset.v === 'yes';
    }
    if (segProj) {
      const projOn = segProj.querySelector('button.on');
      target.projectStatus = projOn ? projOn.dataset.v : '';
    }
  }

  segType.onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    readInto(draft);
    draft.type = b.dataset.v;
    if (groupOf(draft.type) === 'music') draft.bl = false;
    renderEditor(panel, draft, isEdit);
  };

  segStatus.onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    segStatus.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  };

  if (segBl) {
    segBl.onclick = e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      segBl.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    };
  }

  if (segProj) {
    segProj.onclick = e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      segProj.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    };
  }

  stars.onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const v = +b.dataset.v;
    stars.querySelectorAll('button[data-v]').forEach(x => {
      const n = +x.dataset.v;
      if (n === 0) { x.classList.remove('on'); return; }
      x.style.cssText = ratingIdleStyle(n);
      x.classList.remove('on');
    });
    if (v !== 0) { b.style.cssText = ratingActiveStyle(v); b.classList.add('on'); }
  };

  const previewEl = panel.querySelector('#coverPreview');
  if (previewEl) previewEl.onclick = () => openCoverUrlModal();

  const altWrap = panel.querySelector('#altCoversWrap');
  if (altWrap && draft.altCovers && draft.altCovers.length) {
    renderAltCoversUI(panel, draft.altCovers, draft.cover);
  }

  /* ============ КНОПКА «ЗАПРОСИТЬ ОБЛОЖКИ» ============ */
  const btnFetchCovers = panel.querySelector('#btnFetchCovers');
  if (btnFetchCovers) {
    btnFetchCovers.onclick = async (e) => {
      e.preventDefault();
      readInto(draft);

      // У сезона обложки ищем по основной карточке
      let targetObj = draft;
      if (draft.parentId) {
        const main = items.find(x => x.id === draft.parentId);
        if (main) targetObj = main;
      }

      btnFetchCovers.disabled = true;
      btnFetchCovers.textContent = '⏳ Ищу обложки...';

      try {
        /* ---------- КОМИКСЫ: Slashlib + Comizy ---------- */
        if (targetObj.type === 'comic') {
          const allCovers = new Set();

          try {
            const token = await getSlashlibTokenSafe();
            if (token) {
              let slug = editorSlashSlug(targetObj.link) || editorSlashSlug(targetObj.sourceUrl);
              if (!slug) {
                const slibResults = await slashlibSearchApi(targetObj.title_en || targetObj.title, token);
                if (slibResults && slibResults.length) slug = slibResults[0].slug_url;
              }
              if (slug) {
                const apiUrl = 'https://hapi.hentaicdn.org/api/manga/' + slug + '/covers';
                const res = await fetch(apiUrl, {
                  headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
                });
                if (res.ok) {
                  const json = await res.json();
                  (json.data || []).forEach(item => {
                    const c = item.cover;
                    if (c) {
                      const url = c.orig || c.md || c.default || c.thumbnail;
                      if (url) allCovers.add(url);
                    }
                  });
                }
              }
            }
          } catch (err) { console.warn('Slashlib covers error', err); }

          try {
            let slug = editorComizySlug(targetObj.link_comizy);
            if (!slug) {
              const match = await ComizyParser.searchAndMatch(
                targetObj.title_en || '', targetObj.title || '', targetObj.year
              );
              if (match) slug = match.slug;
            }
            if (slug) {
              const details = await ComizyParser.getMangaDetails(slug);
              if (details && details.cover) allCovers.add(details.cover);
            }
          } catch (err) { console.warn('Comizy covers error', err); }

          if (allCovers.size > 0) {
            draft.altCovers = Array.from(allCovers);
            renderAltCoversUI(panel, draft.altCovers, draft.cover);
            toast('Найдено обложек: ' + allCovers.size, 'success');
          } else {
            toast('Дополнительных обложек не найдено', 'warn');
          }
          return;
        }

        /* ---------- МЕДИА: TMDB / Dorama.land ---------- */
        let tmdb = null;

        if (targetObj.type === 'movie') {
          const yearStr = String(targetObj.year || '').trim();
          const ty = parseInt(yearStr) || 0;
          const q = encodeURIComponent(targetObj.title || '');
          const mkUrl = (withYear) =>
            'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY
            + '&language=ru-RU&query=' + q
            + (withYear && yearStr ? '&year=' + yearStr : '');

          let results = [];
          for (const withYear of [true, false]) {
            try {
              const res = await fetch(tmdbProxy(mkUrl(withYear)));
              if (res.ok) {
                const json = await res.json();
                results = json.results || [];
              }
            } catch (err) { console.warn('[fetchCovers] movie search failed:', err.message); }
            if (results.length) break;
          }

          if (results.length) {
            const ranked = rankTmdbResults(results, yearStr);
            const best = ranked.find(r => {
              if (!ty) return true;
              const y = parseInt((r.release_date || '').substring(0, 4)) || 0;
              return !y || Math.abs(y - ty) <= 1;
            }) || ranked[0];
            const details = await tmdbDetails(best.id, 'movie');
            if (details) tmdb = { details, media_type: 'movie' };
          }

        } else {
          const srcUrl = targetObj.sourceUrl || targetObj.link || '';

          if (srcUrl.includes('dorama.land')) {
            try {
              const html = await fetchProxied(srcUrl);
              const doc = new DOMParser().parseFromString(html, 'text/html');

              const h2 = doc.querySelector('h2.about-serial-header__title');
              const rawTitle = h2 ? cleanDoramaText(h2.textContent) : targetObj.title;
              let title = rawTitle
                .replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '')
                .replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '')
                .replace(/\s*смотреть онлайн.*$/i, '')
                .replace(/\(\s*\)/g, '')
                .trim();
              if (!title) title = targetObj.title;

              let country = targetObj.country || '';
              const countryEl = doc.querySelector('[itemprop="countryOfOrigin"]');
              if (countryEl) country = cleanDoramaText(countryEl.textContent).split('\n')[0].trim();

              // Год: «Год:» и og:title, а не dateCreated (там штамп генерации страницы)
              let doramaYear = doramaYearFromDoc(doc, rawTitle) || targetObj.year || '';

              let titleOrig = '';
              const spans = doc.querySelectorAll('span.font-light-18');
              for (const sp of spans) {
                const t = cleanDoramaText(sp.textContent);
                if (/[\u3000-\u9fff\uac00-\ud7af]/.test(t)) { titleOrig = t; break; }
              }

              const altTitles = [];
              const altEl = doc.querySelector('[itemprop="alternativeHeadline"]');
              if (altEl) {
                cleanDoramaText(altEl.textContent).split(/\s*\/\s*/).forEach(s => {
                  const t = cleanDoramaText(s);
                  if (t && t.length > 1) altTitles.push(t);
                });
              }
              let altBlockText = '';
              if (h2) {
                let sibling = h2.nextElementSibling;
                for (let i = 0; i < 4 && sibling; i++) {
                  const txt = cleanDoramaText(sibling.textContent || '');
                  if (txt.length > 10 && txt.split(/\s*\/\s*/).filter(Boolean).length >= 2) { altBlockText = txt; break; }
                  sibling = sibling.nextElementSibling;
                }
              }
              if (altBlockText) {
                altBlockText.split(/\s*\/\s*/).forEach(s => {
                  const t = cleanDoramaText(s);
                  if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
                });
              }

              tmdb = await findInTmdbDorama({
                title, titleOrig, year: doramaYear, country, altTitles,
                tmdbId: targetObj.tmdbId
              });
            } catch (err) {
              console.warn('[fetchCovers] dorama parse failed:', err.message);
            }
          }

          if (!tmdb) {
            const altTitles = [];
            if (targetObj.title_en && targetObj.title_en.length > 3) altTitles.push(targetObj.title_en);
            tmdb = await findInTmdbDorama({
              title: targetObj.title,
              titleOrig: '',
              year: targetObj.year,
              country: targetObj.country,
              altTitles,
              tmdbId: targetObj.tmdbId
            });
          }
        }

        if (tmdb && tmdb.details) {
          const d = tmdb.details;
          draft.tmdbId = d.id;
          if (d.external_ids && d.external_ids.imdb_id) draft.imdbId = d.external_ids.imdb_id;

          const isMovie = targetObj.type === 'movie';
          const baseLang = (d.original_language || 'en').split('-')[0];
          let posters = [];
          try {
            posters = await fetchAllTmdbPosters(d.id, isMovie ? 'movie' : 'tv', baseLang, d.poster_path);
          } catch (err) { posters = []; }
          if (!posters.length) posters = extractTmdbPosters(d);

          if (posters.length) {
            draft.altCovers = posters;
            renderAltCoversUI(panel, posters, draft.cover);
            toast('Найдено обложек: ' + posters.length);
          } else {
            toast((isMovie ? 'У этого фильма' : 'У этого сериала') + ' нет альтернативных постеров');
          }

          // Пустой год заполняем из TMDB (свой не трогаем)
          const yField = panel.querySelector('#f_year');
          if (yField && !String(yField.value || '').trim()) {
            const y = (d.first_air_date || d.release_date || '').substring(0, 4);
            if (y) { yField.value = y; draft.year = y; }
          }
        } else {
          toast((targetObj.type === 'movie' ? 'Фильм' : 'Сериал') + ' не найден в TMDB');
        }

      } catch (err) {
        console.error(err);
        toast('Ошибка: ' + err.message);
      } finally {
        btnFetchCovers.disabled = false;
        btnFetchCovers.textContent = '🔄 Запросить обложки';
      }
    };
  }

  /* ============ ВЫПАДАЮЩИЕ МЕНЮ ПОИСКА ============ */
  const bindSearchMenu = (btnId, menuId, routes) => {
    const btn = panel.querySelector('#' + btnId);
    const menu = panel.querySelector('#' + menuId);
    if (!btn || !menu) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.parentElement.classList.toggle('open');
    };
    menu.querySelectorAll('button[data-source]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        menu.parentElement.classList.remove('open');
        const fn = routes[b.dataset.source];
        if (typeof fn === 'function') fn();
      };
    });
  };

  bindSearchMenu('comicSearchDropdownBtn', 'comicSearchMenu', {
    comizy: () => openComizyModal(),
    anilist: () => openAniListModal(),
    slashlib: () => openSlashlibModal()
  });

  bindSearchMenu('bookSearchDropdownBtn', 'bookSearchMenu', {
    knigi: () => openKnigiModal(),
    flibusta: () => openFlibustaModal(),
    ficbook: () => openFicbookModal(),
    fanfics: () => openFanficsModal(),
    ao3: () => openAo3Modal()
  });

  bindSearchMenu('screenSearchDropdownBtn', 'screenSearchMenu', {
    tmdb: () => openTmdbModal(),
    dorama: () => openDoramaModal(),
    kinogo: () => openKinogoModal()
  });

  /* ============ ЗАКРЫТИЕ ============ */
  const closeBasic = () => {
    document.getElementById('sheet').classList.remove('on');
    closeCoverUrlModal();
  };
  const closeAndReturn = () => {
    closeCoverUrlModal();
    document.getElementById('sheet').classList.remove('on');
    if (isEdit) openView(draft.id);
    else if (draft.parentId) openView(draft.parentId);
  };
  panel.querySelector('#closeForm').onclick = closeAndReturn;
  panel.querySelector('#btnCancel').onclick = closeAndReturn;

  /* ============ ССЫЛКА НА COMIZY ============
     comizyLocked — ссылку задали руками: автопоиск её больше не меняет.
     comizyOff    — ссылку убрали: автопоиск её не возвращает (только кнопка 🔄). */
  const cmInput = panel.querySelector('#f_link_comizy');
  const cmBtn = panel.querySelector('#btnComizyRefresh');
  const cmHint = panel.querySelector('#comizyLinkHint');
  const cmField = panel.querySelector('#f_comizy_chapters');
  const cmSlugOf = editorComizySlug;

  if (cmInput && cmBtn) {
    const cmSetChapters = (list) => {
      draft.comizyChapters = Array.isArray(list) ? list : [];
      if (cmField) { try { cmField.value = JSON.stringify(draft.comizyChapters); } catch (e) {} }
    };

    const cmUpdateHint = () => {
      if (!cmHint) return;
      let t = '', cls = '';
      if (draft._comizyBusy) { t = 'Загружаю…'; }
      else if (draft.comizyLocked && draft.link_comizy) { t = '📌 Закреплена вручную — при обновлении не меняется'; cls = 'locked'; }
      else if (draft.comizyOff && !draft.link_comizy) { t = 'Ссылка убрана — автоматически не подтянется. Вернуть: 🔄'; cls = 'off'; }
      else if (draft.link_comizy) { t = 'Найдена автоматически. Чтобы закрепить — исправь ссылку вручную'; }
      cmHint.textContent = t;
      cmHint.className = 'comizy-link-hint ' + cls;
    };
    window._refreshComizyHint = cmUpdateHint;

    const cmBusy = (on) => {
      draft._comizyBusy = !!on;
      cmBtn.disabled = !!on;
      cmBtn.classList.toggle('spin', !!on);
      cmUpdateHint();
    };

    const cmLoadBySlug = async (slug, lock) => {
      cmBusy(true);
      try {
        const details = await ComizyParser.getMangaDetails(slug);
        if (!details || !details.hid) throw new Error('Не нашёл мангу по этой ссылке');
        let keep0 = true;
        try {
          const linkVal = panel.querySelector('#f_link') ? panel.querySelector('#f_link').value : draft.link;
          keep0 = await ComizyParser.checkSlashlibHasChapter0(linkVal);
        } catch (e) {}
        const chapters = await ComizyParser.getChapters(details.hid, { keepChapter0: keep0 });
        draft.link_comizy = 'https://comizy.io/' + slug;
        cmInput.value = draft.link_comizy;
        cmSetChapters(chapters);
        if (lock !== undefined) { draft.comizyLocked = !!lock; draft.comizyOff = false; }
        toast('Comizy: «' + details.title + '», глав ' + chapters.length, 'success');
        return true;
      } catch (e) {
        toast('Comizy: ' + (e.message || e), 'error');
        return false;
      } finally {
        cmBusy(false);
      }
    };

    const cmApplyInput = async () => {
      if (draft._comizyBusy) return;
      const v = cmInput.value.trim();
      if (!v) {
        if (draft.link_comizy || !draft.comizyOff) {
          draft.link_comizy = '';
          cmSetChapters([]);
          draft.comizyLocked = false;
          draft.comizyOff = true;
          cmUpdateHint();
        }
        return;
      }
      const slug = cmSlugOf(v);
      if (!slug) {
        toast('Ссылка должна вести на comizy.io', 'warn');
        cmInput.value = draft.link_comizy || '';
        return;
      }
      if (slug === cmSlugOf(draft.link_comizy)) {
        draft.link_comizy = 'https://comizy.io/' + slug;
        cmInput.value = draft.link_comizy;
        draft.comizyLocked = true;
        draft.comizyOff = false;
        cmUpdateHint();
        return;
      }
      const prev = draft.link_comizy || '';
      const ok = await cmLoadBySlug(slug, true);
      if (!ok) cmInput.value = prev;
    };

    cmInput.addEventListener('change', cmApplyInput);
    cmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cmInput.blur(); }
    });

    cmBtn.onclick = async (e) => {
      e.preventDefault();
      if (draft._comizyBusy) return;
      const v = cmInput.value.trim();
      const slug = cmSlugOf(v);
      if (v && !slug) { toast('Ссылка должна вести на comizy.io', 'warn'); return; }

      if (slug) {
        const isSame = slug === cmSlugOf(draft.link_comizy);
        const prev = draft.link_comizy || '';
        const ok = await cmLoadBySlug(slug, isSame ? undefined : true);
        if (!ok && !isSame) cmInput.value = prev;
        return;
      }

      const titleEl = panel.querySelector('#f_title');
      const titleEnEl = panel.querySelector('#f_title_en');
      const title = (titleEl ? titleEl.value : draft.title) || '';
      const titleEn = (titleEnEl ? titleEnEl.value : draft.title_en) || '';
      const names = [title, titleEn, ...(Array.isArray(draft.otherNames) ? draft.otherNames : [])].filter(Boolean);
      if (!names.length) { toast('Сначала заполни название', 'warn'); return; }
      const yearEl = panel.querySelector('#f_year');
      const year = (yearEl ? yearEl.value : draft.year) || '';

      cmBusy(true);
      let match = null;
      try { match = await ComizyParser.searchAndMatchByNames(names, year); }
      catch (err) { console.warn('Comizy auto-search error', err); }
      cmBusy(false);

      if (!match) { toast('На Comizy ничего подходящего не нашлось', 'warn'); return; }
      await cmLoadBySlug(match.slug, false);
    };

    cmUpdateHint();
  }

  const cmGuardPending = () => {
    if (draft._comizyBusy) { toast('Подожди, загружаю главы Comizy…', 'warn'); return true; }
    if (cmInput) {
      const cur = cmInput.value.trim();
      const saved = draft.link_comizy || '';
      const changed = cur === '' ? !!saved : cmSlugOf(cur) !== cmSlugOf(saved);
      if (changed) {
        cmInput.dispatchEvent(new Event('change'));
        toast('Проверяю ссылку Comizy — нажми «Сохранить» ещё раз', 'warn');
        return true;
      }
    }
    return false;
  };

  /* ============ СОХРАНЕНИЕ ============ */
  panel.querySelector('#btnSave').onclick = () => {
    if (cmGuardPending()) return;

    const oldCover = isEdit ? ((items.find(x => x.id === draft.id) || {}).cover || '') : '';
    const draftId = draft.id;

    readInto(draft);
    draft.customCover = !!draft.customCover;
    if (!Array.isArray(draft.altCovers)) draft.altCovers = [];

    const pendingSeasons = Array.isArray(draft._pendingSeasons) ? draft._pendingSeasons.slice() : [];
    delete draft._pendingSeasons;
    delete draft._comizyBusy;

    const title = (draft.title || '').trim();
    if (!title) {
      toast('Нужно название');
      panel.querySelector('#f_title').focus();
      return;
    }
    draft.title = title;

    ['country', 'year', 'cover', 'description', 'notes', 'pages', 'link', 'link_sub', 'link_extras', 'title_en', 'link_comizy'].forEach(k => {
      draft[k] = (draft[k] || '').toString().trim();
    });

    if (isEdit && oldCover && oldCover !== draft.cover) {
      CoverCache.deleteKey(draftId + '_card');
      CoverCache.deleteKey(draftId + '_full');
      _coverBlobUrls.delete(draftId + '_card');
      _coverBlobUrls.delete(draftId + '_full');
      _coverTriedThisSession.delete(draftId + '_card');
      _coverTriedThisSession.delete(draftId + '_full');
      _manualUrlsOk.delete(oldCover);
    }

    if (groupOf(draft.type) === 'music') draft.bl = false;
    if (typeof draft.hearts !== 'number' || draft.hearts < 0 || draft.hearts > 5) draft.hearts = 0;
    if (!isEdit && groupOf(draft.type) === 'comic' && !draft.bl && isYaoiTags(draft.tags)) draft.bl = true;

    const now = Date.now();

    if (isEdit) {
      const idx = items.findIndex(x => x.id === draft.id);
      if (idx >= 0) {
        const prevStatus = items[idx].status;
        items[idx] = Object.assign({}, items[idx], draft, { updatedAt: now });
        const saved = items[idx];
        if (saved.parentId) {
          const parent = items.find(x => x.id === saved.parentId);
          if (parent) {
            parent.updatedAt = now;
            parent.status = computeMainStatus(parent);
          }
        } else if (saved.status === 'done' && prevStatus !== 'done') {
          const seasons = getSeasons(saved.id);
          seasons.forEach(s => {
            const si = items.findIndex(x => x.id === s.id);
            if (si >= 0) { items[si].status = 'done'; items[si].updatedAt = now; }
          });
        }
      }
    } else {
      draft.id = uid();
      draft.createdAt = now;
      draft.updatedAt = now;
      if (!('parentId' in draft)) draft.parentId = null;
      if (typeof draft.seasonNumber !== 'number') draft.seasonNumber = 0;
      if (!draft.projectStatus) draft.projectStatus = '';
      items.push(draft);
      if (draft.parentId) {
        const parent = items.find(x => x.id === draft.parentId);
        if (parent) {
          parent.updatedAt = now;
          parent.status = computeMainStatus(parent);
        }
      }
    }

    // Сезоны, собранные при парсинге Dorama.land
    if (pendingSeasons.length) {
      const parentId = draft.id;
      let added = 0;
      for (const s of pendingSeasons) {
        const sNum = parseInt(s.number, 10) || 0;
        const exists = items.some(i =>
          i.parentId === parentId &&
          (((parseInt(i.seasonNumber, 10) || 0) === sNum) || (s.url && i.sourceUrl === s.url))
        );
        if (exists) continue;
        items.push({
          id: uid(),
          title: s.title || ('Сезон ' + s.number),
          title_en: s.title_en || '',
          type: draft.type,
          status: 'want',
          rating: 0,
          hearts: 0,
          year: s.year || draft.year || '',
          country: s.country || draft.country || '',
          cover: s.cover || draft.cover || '',
          tags: Array.isArray(s.tags) && s.tags.length ? s.tags.slice() : (Array.isArray(draft.tags) ? draft.tags.slice() : []),
          description: s.description || '',
          notes: '',
          bl: (typeof s.bl === 'boolean') ? s.bl : !!draft.bl,
          pages: '',
          link: s.url || '',
          link_sub: s.link_sub || '',
          link_extras: '',
          favorite: false,
          moments: [],
          parentId: parentId,
          seasonNumber: s.number,
          sourceUrl: s.url,
          projectStatus: s.projectStatus || '',
          tmdbId: draft.tmdbId || null
        });
        added++;
      }
      if (added) toast('Добавлено сезонов: ' + added);
    }

    save(); closeBasic(); renderTabs(); render();
    if (isEdit || draft.parentId) openView(draft.id);
    toast(isEdit ? 'Обновлено' : 'Добавлено');

    // Карточка создана из OCR-скриншота — предложить удалить скриншот
    if (window._pendingScreenshotForDeletion) {
      const sid = window._pendingScreenshotForDeletion;
      window._pendingScreenshotForDeletion = null;
      setTimeout(async () => {
        if (confirm('Карточка создана. Удалить скриншот из галереи?')) {
          try {
            await ScreenshotsDB.delete(sid);
            if (state.category === 'screens') renderScreensGrid();
            toast('Скриншот удалён');
          } catch (e) {}
        }
      }, 500);
    }
  };

  /* ============ УДАЛЕНИЕ ============ */
  const del = panel.querySelector('#btnDelete');
  if (del) del.onclick = () => {
    if (!confirm('Удалить «' + draft.title + '»? Карточка будет храниться в корзине 7 дней.')) return;
    const now = Date.now();
    const toTrash = [];
    const idsToRemove = new Set([draft.id]);
    const deletedSeasonParentId = draft.parentId || null;
    let childSeasons = [];

    if (!draft.parentId) {
      childSeasons = getSeasons(draft.id);
      childSeasons.forEach(s => {
        idsToRemove.add(s.id);
        toTrash.push(Object.assign({}, s, { deletedAt: now }));
      });
    }
    toTrash.push(Object.assign({}, draft, { deletedAt: now }));
    toTrash.forEach(t => trashItems.push(t));
    saveTrash();
    items = items.filter(x => !idsToRemove.has(x.id));

    if (deletedSeasonParentId) {
      const parent = items.find(x => x.id === deletedSeasonParentId);
      if (parent) {
        parent.updatedAt = now;
        parent.status = computeMainStatus(parent);
      }
    }

    save(); closeBasic(); renderTabs(); render();
    toast(childSeasons.length ? 'Перемещено в корзину (с сезонами)' : 'Перемещено в корзину');
  };
}

/* ============ ОБЛОЖКА В ФОРМЕ ============ */

function noPhotoHTML() {
  return `<svg width="100%" height="100%" viewBox="0 0 120 180" preserveAspectRatio="none" style="position:absolute;inset:0;pointer-events:none;">
    <rect x="1" y="1" width="118" height="178" rx="13" fill="none" stroke="#1f1f29" stroke-width="1.5" stroke-dasharray="3 2" pathLength="100"/>
  </svg>
  <div class="no-photo">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3a3a48" stroke-width="1.6" stroke-linecap="round">
      <circle cx="12" cy="12" r="9"/>
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5"/>
    </svg>
    <span>Нет обложки</span>
  </div>`;
}

function setCoverPreview(url) {
  const prev = document.getElementById('coverPreview');
  if (!prev) return;
  const u = (url || '').trim();
  if (!u) {
    prev.classList.remove('has-image');
    prev.innerHTML = noPhotoHTML();
    return;
  }
  prev.innerHTML = '';
  const img = document.createElement('img');
  img.alt = '';
  img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;';
  img.onerror = () => {
    prev.classList.remove('has-image');
    prev.innerHTML = noPhotoHTML();
  };
  img.onload = () => { prev.classList.add('has-image'); };
  img.src = u;
  prev.appendChild(img);
}

function openCoverUrlModal() {
  const modal = document.getElementById('coverUrlModal');
  const input = document.getElementById('coverUrlInput');
  const hidden = document.getElementById('f_cover');
  if (!modal || !input) return;
  input.value = hidden ? (hidden.value || '') : '';
  modal.classList.add('on');
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

function closeCoverUrlModal() {
  const m = document.getElementById('coverUrlModal');
  if (m) m.classList.remove('on');
}

document.getElementById('coverUrlOk').onclick = () => {
  const url = document.getElementById('coverUrlInput').value.trim();
  const hidden = document.getElementById('f_cover');
  if (hidden) hidden.value = url;
  const draft = window._currentDraft;
  if (draft) { draft.cover = url; draft.customCover = true; }
  setCoverPreview(url);
  closeCoverUrlModal();
};

document.getElementById('coverUrlModal').onclick = (e) => {
  if (e.target.id === 'coverUrlModal') closeCoverUrlModal();
};

function renderAltCoversUI(panel, posters, activeUrl) {
  const altWrap = panel.querySelector('#altCoversWrap');
  if (!altWrap) return;
  if (posters && posters.length) {
    altWrap.innerHTML = posters.map(url =>
      `<div class="alt-cover-thumb ${activeUrl === url ? 'active' : ''}" data-url="${url}"><img src="${url}" loading="lazy" alt=""></div>`
    ).join('');
    altWrap.onclick = (e) => {
      const thumb = e.target.closest('.alt-cover-thumb');
      if (!thumb) return;
      const url = thumb.dataset.url;
      const hiddenCover = panel.querySelector('#f_cover');
      if (hiddenCover) hiddenCover.value = url;
      const draft = window._currentDraft;
      if (draft) { draft.cover = url; draft.customCover = true; }
      setCoverPreview(url);
      altWrap.querySelectorAll('.alt-cover-thumb').forEach(t => t.classList.toggle('active', t.dataset.url === url));
    };
  } else {
    altWrap.innerHTML = '';
  }
}

// Закрытие выпадающих меню поиска по клику мимо — для всех групп, один раз
if (!window._searchDropdownOutsideBound) {
  window._searchDropdownOutsideBound = true;
  document.addEventListener('pointerdown', (e) => {
    document.querySelectorAll('.search-source-dropdown.open').forEach(m => {
      if (!m.contains(e.target)) m.classList.remove('open');
    });
  });
}