'use strict';

/* ==========================================================
   init.js — Запуск приложения: привязка кнопок, сайдбар, load(), первый рендер, прогревы, подписки, облачный старт
   ========================================================== */

/* ============ ПОИСК / FAB / ТУМБЛЕР ============ */
const searchClearBtn = document.getElementById('searchClear');
function updateSearchClear(){
  const inp = document.getElementById('search');
  if(!inp || !searchClearBtn) return;
  searchClearBtn.classList.toggle('visible', inp.value.length > 0);
}
document.getElementById('search').oninput = e => {
  state.search = e.target.value;
  updateSearchClear();
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(render, 180);   // не перерисовываем на каждую букву
};
if(searchClearBtn){
  searchClearBtn.onclick = () => {
    const inp = document.getElementById('search');
    if(!inp) return;
    inp.value = '';
    state.search = '';
    clearTimeout(window._searchTimer);
    updateSearchClear();
    render();
    inp.focus();
  };
}
updateSearchClear();

document.getElementById('fab').onclick = () => openForm(null);
document.getElementById('fabEmergency').onclick = () => {
  state.emergencyMode = !state.emergencyMode;
  if(state.emergencyMode) state.blOnly = false;
  try{ localStorage.setItem(EMERGENCY_KEY, state.emergencyMode ? '1' : '0'); }catch(e){}
  renderTabs();
  render();
};
document.getElementById('blToggle').onclick = () => {
  state.blOnly = !state.blOnly;
  renderGrid();
  updateBlToggle();
  renderActiveFilters();
};
  document.getElementById('favToggle').onclick = () => {
  state.favOnly = !state.favOnly;
  renderGrid();
  updateFavToggle();
  renderActiveFilters();
};

/* ============ SIDEBAR ============ */
(() => {
  const burger = document.getElementById('burger');
  if(!burger) return;

  const main = document.querySelector('.main');
  const grid = document.getElementById('grid');
  let animating = false;

  burger.onclick = (e) => {
    e.stopPropagation();
    if(animating) return;

    const wasOpen = document.body.classList.contains('sidebar-open');

    // ═══ SECTIONS («Всё»): чистый CSS transform на main ═══
    if(document.body.classList.contains('sections-mode')){
      animating = true;
      document.body.classList.toggle('sidebar-open', !wasOpen);

      let done = false;
      const finish = () => {
        if(done) return;
        done = true;
        if(main) main.removeEventListener('transitionend', onEnd);
        clearTimeout(fb);
        animating = false;
      };
      const onEnd = (ev) => {
        if(ev.target === main && ev.propertyName === 'transform') finish();
      };
      if(main) main.addEventListener('transitionend', onEnd);
      const fb = setTimeout(finish, 400);
      return;
    }

    // ═══ GRID: FLIP ═══
    if(!grid) return;

    const vpH = innerHeight, vpW = innerWidth;
    const visible = [], firstRects = [], futureRects = [];

    grid.querySelectorAll('.card').forEach(card => {
      const r = card.getBoundingClientRect();
      if(r.bottom > 0 && r.top < vpH && r.right > 0 && r.left < vpW){
        visible.push(card);
        firstRects.push({ left: r.left, top: r.top });
      }
    });

    // Предрасчёт финальных позиций: временно применяем margin, меряем, откатываем
    const oldM = main.style.marginLeft;
    main.style.transition = 'none';
    main.style.marginLeft = (wasOpen ? 64 : 224) + 'px';
    document.body.classList.toggle('sidebar-open', !wasOpen);
    void main.offsetHeight;
    visible.forEach(card => {
      const r = card.getBoundingClientRect();
      futureRects.push({ left: r.left, top: r.top });
    });
    main.style.marginLeft = oldM || '';
    document.body.classList.toggle('sidebar-open', wasOpen);
    void main.offsetHeight;

    // Заморозка grid — не пересчитывает колонки во время анимации
    grid.style.width = grid.clientWidth + 'px';
    grid.style.gridTemplateColumns = getComputedStyle(grid).gridTemplateColumns;
    grid.style.justifyContent = 'start';

    // INVERT: ставим transform на карточки до старта margin
    const deltaMargin = wasOpen ? -160 : 160;
    visible.forEach((card, i) => {
      const dx = (futureRects[i].left - firstRects[i].left) - deltaMargin;
      const dy = futureRects[i].top - firstRects[i].top;
      card.style.willChange = 'transform';
      card.style.transition = 'transform .25s ease';
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });

    // Запуск margin-анимации
    animating = true;
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      main.removeEventListener('transitionend', onEnd);
      clearTimeout(fb);

      // Cleanup в одном флаше — карточки мгновенно на финальных позициях
      visible.forEach(c => {
        c.style.transition = 'none';
        c.style.transform = '';
        c.style.willChange = '';
      });
      grid.style.width = '';
      grid.style.gridTemplateColumns = '';
      grid.style.justifyContent = '';
      main.style.transition = '';
      main.style.marginLeft = '';

      void grid.offsetHeight;
      visible.forEach(c => { c.style.transition = ''; });
      animating = false;
    };
    const onEnd = (ev) => {
      if(ev.target === main && ev.propertyName === 'margin-left') finish();
    };
    main.addEventListener('transitionend', onEnd);
    const fb = setTimeout(finish, 450);

    main.style.transition = 'margin-left .25s ease';
    main.style.marginLeft = (wasOpen ? 64 : 224) + 'px';
    document.body.classList.toggle('sidebar-open', !wasOpen);
  };
})();
  document.getElementById('sidebarBackdrop').onclick = () => {
  document.body.classList.remove('sidebar-open');
};
document.addEventListener('click', (e) => {
  if(!document.body.classList.contains('sidebar-open')) return;
  if(e.target.closest('#sidebar')) return;
  document.body.classList.remove('sidebar-open');
});
/* ============ SCROLL LOCK ============ */
function updateScrollLock(){
  const open = document.querySelectorAll(
    '.sheet.on, .modal.on, .url-modal.on, .notes-modal.on, .cloud-modal.on, .cover-view-modal.on, .player-modal.on, .playlist-modal.on, .screenshot-view.on, .ocr-popup.on'
  ).length > 0;
  document.body.classList.toggle('modal-open', open);
}
document.querySelectorAll(
  '#sheet, .modal, .url-modal, .notes-modal, .cloud-modal, .cover-view-modal, .player-modal, .playlist-modal, #screenshotView, #ocrPopup'
).forEach(el => {
  new MutationObserver(updateScrollLock).observe(el, { attributes:true, attributeFilter:['class'] });
});
  
  // Следим за всеми модалками сразу (раньше список id был ручным и половину забывал: trash, cloud, dorama, knigi, flibusta, ficbook, fanfics, ao3, slashlib)
document.querySelectorAll('#sheet, .modal, .url-modal, .notes-modal, .cloud-modal, .cover-view-modal').forEach(el => {
  new MutationObserver(updateScrollLock).observe(el, { attributes:true, attributeFilter:['class'] });
});
updateScrollLock();
  

  
load();
  // ==========================================
// ПРОГРЕВ WEBVIEW ДЛЯ SLASHLIB
// ==========================================
// Чтобы при первом запросе к Slashlib не дёргался статус-бар и интерфейс,
// мы открываем пустое невидимое окно в фоне при старте приложения.
setTimeout(() => {
  try {
    const warmBrowser = cordova.InAppBrowser.open('about:blank', '_blank', 'location=no,hidden=yes,zoom=no');
    // Держим его открытым 2 секунды (чтобы движок точно инициализировался), затем закрываем
    setTimeout(() => {
      try { warmBrowser.close(); } catch(e) {}
    }, 2000);
  } catch(e) {}
}, 3000); // Запускаем через 3 секунды после старта, чтобы не тормозить загрузку самого приложения
renderTabs();
render();

// Прелоад обложек: отложен на 15 сек, чтобы не конкурировать с первым рендером
// и первыми кликами. pre.decode() убран — на мобиле оно блокирует главный поток.
setTimeout(() => {
  const queue = items.filter(it => it.cover && !_coverBlobUrls.get(it.id + '_card'));
  let cursor = 0;
  const worker = async () => {
    while(cursor < queue.length){
      const it = queue[cursor++];
      const key = it.id + '_card';
      try {
        const width = coverWidthFor('card');
        await (/image\.tmdb\.org|s4\.anilist\.co/.test(it.cover)
          ? ensureCover(key, it.cover, width)
          : ensureManualCover(key, it.cover, width));
      } catch(e){}
    }
  };
  Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
}, 15000);
  // Теперь, когда Cloud создан, save() может сообщать ему об изменениях
onDataChanged = () => Cloud.markDirty();

// Инициализация после загрузки
CloudUI.init();
Cloud.startPeriodic();
// Домены: периодический pull из Supabase
if (typeof DomainsCloud !== 'undefined') {
  DomainsCloud.startPeriodic();
}
Cloud.updateStatusDot();

// То, что не успели отправить в прошлый раз
try{ Cloud._dirty = localStorage.getItem('polka_dirty') === '1'; }catch(e){}
// Чьи это данные на устройстве (для старых входов, где это ещё не записано)
try{
  const _c0 = cloudGet();
  if(_c0 && _c0.user_id && !localStorage.getItem('polka_owner')) localStorage.setItem('polka_owner', _c0.user_id);
}catch(e){}
// Синхронизация при запуске: забрать чужие правки и отправить свои
// Восстанавливаем сессию Supabase при загрузке
(async () => {
  try {
    const { data: { session }, error: sessErr } = await sb.auth.getSession();
    if (session) {
  const { data: profile, error: profErr } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  const prev = cloudGet() || {};
  const serverAv = safeAvatar((profile && profile.avatar) || '');
  const localAv  = safeAvatar(prev.avatar || '');

  // Та же страховка: не принимаем и не пишем в профиль наш технический email
  const looksLikeHash = s => /^[a-f0-9]{64}@polka\.app$/i.test(String(s || '').trim());
  const serverName = (profile && profile.display_name && !looksLikeHash(profile.display_name))
    ? String(profile.display_name).trim() : '';
  const prevName = (!looksLikeHash(prev.display_name))
    ? String(prev.display_name || '').trim() : '';
  const dispName = serverName || prevName || '';

  // Assign — чтобы не потерять lastBackupAt / lastError.
  // Аватарку не затираем пустым значением: если в облаке её нет, остаётся локальная.
  cloudSet(Object.assign({}, prev, {
    user_id: session.user.id,
    display_name: dispName,
    avatar: serverAv || localAv,
    skipped: false
  }));
  CloudUI.updateButton();

  // Строки профиля нет (PGRST116), имя сломано/пусто, или локально есть аватарка,
  // а в облаке нет — дозаливаем (тихо). Хэш@polka.app сюда не попадёт.
  const profMissing = !profile && profErr && profErr.code === 'PGRST116';
  const nameBroken  = profile && (!profile.display_name || looksLikeHash(profile.display_name));
  if((profMissing || nameBroken || (profile && localAv && !serverAv)) && dispName){
    saveProfile({ display_name: dispName, avatar: serverAv || localAv }, true);
  }
setTimeout(() => Cloud.sync(false), 1200);
      loadTokensFromCloud();
if (typeof DiscHashesCloud !== 'undefined') DiscHashesCloud.pullAndMerge();
  } else if (!sessErr && cloudGet() && cloudGet().user_id) {
      // Вход был по-старому (до закрытой базы): в приложении «залогинена», а сессии в Supabase нет —
      // из-за этого каждый бэкап падал с «Нет сессии». Сбрасываем и просим войти заново.
      cloudClear();
      try{ localStorage.removeItem('polka_owner'); }catch(e2){}
      CloudUI.updateButton();
      toast('☁️ Облако стало защищённым — войди в него заново, данные на устройстве целы');
    }
  } catch(e) {
    console.log('[session restore] failed:', e.message);
  }
})();
// Чистим кэш обложек от карточек, которых больше нет
setTimeout(() => {
  const ids = items.concat(trashItems).map(x => x.id);
  if(ids.length) CoverCache.pruneOrphans(ids);
}, 20000);

// Подтягиваем inbox при старте
setTimeout(() => { Cloud.pullInbox(true); }, 1500);

// И раз в минуту, пока приложение открыто
setInterval(() => { if (!document.hidden) Cloud.pullInbox(true); }, 60 * 1000);

// И при возврате на страницу (например, из браузера) — ОДИН обработчик.
// Раньше второй обработчик был вложен в первый и плодил копии при каждом возврате в приложение.
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible'){
    Cloud.pullInbox(true);
    Cloud.syncIfStale();
    if(Cloud._dirty && Cloud.isReady()) Cloud.sync(false);
    if (typeof DiscHashesCloud !== 'undefined') DiscHashesCloud.pullAndMerge();
    if (typeof DomainsCloud !== 'undefined') DomainsCloud.syncIfStale();
  } else if(Cloud._dirty && Cloud.isReady()){
    Cloud.sync(false);
  }
});

CloudBanner.init();
Player.init();

  // =========================================
// BACK BUTTON / GESTURE (жест "назад" от края)
// =========================================
(async () => {
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) {
    console.warn('[Back] @capacitor/app не установлен');
    return;
  }
  try {
    await AppPlugin.addListener('backButton', () => {
  // ═══ NEW ═══
  const ocrPopup = document.getElementById('ocrPopup');
  if (ocrPopup && ocrPopup.classList.contains('on')) { closeOcrPopup(); return; }
  const screenshotView = document.getElementById('screenshotView');
  if (screenshotView && screenshotView.classList.contains('on')) { closeScreenshotView(); return; }
  // 1. Плейлист открыт — закрываем его
const playlistModal = document.getElementById('playlistModal');
if (playlistModal && playlistModal.classList.contains('on')) {
  Player.closePlaylist();
  return;
}
// 2. Большой плеер открыт — сворачиваем (даже если за ним читалка)
const playerModal = document.getElementById('playerModal');
if (playerModal && playerModal.classList.contains('on')) {
  Player.minimize();
  return;
}
// 3. Читалка открыта — закрываем её
const readerModal = document.getElementById('readerModal');
if (readerModal && readerModal.classList.contains('on')) {
  try { SlashLibReader.close(); } catch(e){ console.warn(e); }
  return;
}
      // 3. Сайдбар открыт
      if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
        return;
      }
      // 4. Любая модалка
      const modals = document.querySelectorAll(
        '.modal.on, .sheet.on, .notes-modal.on, .url-modal.on, .cloud-modal.on, .cover-view-modal.on'
      );
      if (modals.length > 0) {
        modals[modals.length - 1].classList.remove('on');
        return;
      }
      // 5. Ничего не открыто — выход
      AppPlugin.exitApp();
    });
  } catch(e) {
    console.error('[Back] Ошибка:', e);
  }
})();
  /* Читалка: инициализация на старте приложения, но отложенно —
   чтобы не мешать первому рендеру Полки и не дёргать интерфейс.
   К моменту первого тапа «Читать» обработчики уже висят,
   и open() не делает синхронной работы между кадрами. */
setTimeout(() => SlashLibReader.init(), 1500);
  /* Прогрев StatusBar-плагина: первый вызов через Capacitor Bridge
   самый долгий (плагин инициализируется лениво). Дёргаем заранее,
   чтобы в момент первого тапа по экрану читалки всё шло по горячему пути. */
setTimeout(async () => {
  const SB = window.Capacitor?.Plugins?.StatusBar;
  if (!SB) return;
  try {
    await SB.show();   // просто убеждаемся, что бар на месте (без пляски)
  } catch(e) {}
}, 4000);
