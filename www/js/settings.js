'use strict';

/* ==========================================================
   settings.js — Настройки категории
   ========================================================== */

/* ============ НАСТРОЙКИ КАТЕГОРИИ ============ */
function openCategorySettings(){
  const draft = Object.assign({ status: 'all', sort: 'recent', persistSort: true, typeInclude: [], typeExclude: [] }, categorySettings[state.category] || {});
  const modal = document.getElementById('catSettingsModal');
  const nameEl = document.getElementById('catSettingsName');
  const stBox = document.getElementById('catSetStatus');
  const soBox = document.getElementById('catSetSort');
  if(!modal || !stBox || !soBox) return;

  // === БЛОК ТОКЕНА VK (только на вкладке "Музыка") ===
  const vkSection = document.getElementById('vkTokenSection');
  const vkBtn = document.getElementById('vkTokenBtn');
  const vkForm = document.getElementById('vkTokenForm');
  const vkInput = document.getElementById('vkTokenInput');
  const vkSave = document.getElementById('vkTokenSave');

  if (vkSection) {
    if (state.category === 'music') {
      vkSection.style.display = '';
      const hasToken = !!localStorage.getItem('vk_token');
      vkBtn.textContent = hasToken ? 'Обновить токен' : 'Добавить токен';
      vkForm.style.display = 'none';
      vkInput.value = '';
      vkBtn.onclick = () => {
        const isOpen = vkForm.style.display === 'block';
        vkForm.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) setTimeout(() => vkInput.focus(), 50);
      };
      vkSave.onclick = () => {
  const val = vkInput.value.trim();
  if (!val) { toast('Вставьте токен', 'warn'); return; }
  localStorage.setItem('vk_token', val);
  // Синхронизируем в облако, если залогинена
  if (Cloud.isReady()) {
    saveTokensToCloud({ vk_token: val });
  }
  vkBtn.textContent = 'Обновить токен';
  vkForm.style.display = 'none';
  vkInput.value = '';
  toast('Токен сохранён', 'success');
};
    } else {
      vkSection.style.display = 'none';
    }
  }
  // === КОНЕЦ БЛОКА ===

  const cat = CATEGORIES[state.category];
  if(nameEl) nameEl.textContent = cat ? cat.label : '';
  const statusTabs = [{ key: 'all', label: 'Все' }];
  for(const k in STATUSES) statusTabs.push({ key: k, label: statusLabelForCategory(k, state.category) });
  stBox.innerHTML = statusTabs.map(t =>
    `<button type="button" data-v="${t.key}" class="${draft.status === t.key ? 'on' : ''}">${esc(t.label)}</button>`
  ).join('');

  let sortHtml = '';
  for(const [k, label] of Object.entries(SORTS)) {
    if(k === 'created_old') continue;
    if(k === 'created') {
      const isOld = draft.sort === 'created_old';
      const icon = isOld ? '↓' : '↑';
      const text = isOld ? 'Сначала старые' : 'Сначала новые';
      const val = isOld ? 'created_old' : 'created';
      const isOn = isOld || draft.sort === 'created';
      sortHtml += `<button type="button" data-v="${val}" data-toggle="true" class="${isOn ? 'on' : ''}">${text} ${icon}</button>`;
    } else {
      sortHtml += `<button type="button" data-v="${k}" class="${draft.sort === k ? 'on' : ''}">${esc(label)}</button>`;
    }
  }
  soBox.innerHTML = sortHtml;

  const typeBox = document.getElementById('catSetTypeFilter');
  if(typeBox){
    const checkSvg = `<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const banSvg = `<svg class="icon-ban" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;  
    typeBox.innerHTML = Object.entries(TYPES).map(([k, v]) => {
      let cls = '';
      if (draft.typeInclude.includes(k)) cls = 'include';
      else if (draft.typeExclude.includes(k)) cls = 'exclude';
      return `<button type="button" class="type-toggle-chip ${cls}" data-type="${k}">${v.label} ${checkSvg}${banSvg}</button>`;
    }).join('');

    typeBox.onclick = (e) => {
      const b = e.target.closest('button[data-type]');
      if(!b) return;
      const t = b.dataset.type;
      if (draft.typeInclude.includes(t)) {
        draft.typeInclude = draft.typeInclude.filter(x => x !== t);
        draft.typeExclude.push(t);
        b.className = 'type-toggle-chip exclude';
      } else if (draft.typeExclude.includes(t)) {
        draft.typeExclude = draft.typeExclude.filter(x => x !== t);
        b.className = 'type-toggle-chip';
      } else {
        draft.typeInclude.push(t);
        b.className = 'type-toggle-chip include';
      }
    };
  }

  const filterBox = document.getElementById('catSetFilters');
  if(filterBox){
    const favBtn = document.getElementById('catFilterFav');
    const blBtn  = document.getElementById('catFilterBl');
    if(favBtn){
      favBtn.classList.toggle('on', state.favOnly);
      favBtn.onclick = () => {
        state.favOnly = !state.favOnly;
        favBtn.classList.toggle('on', state.favOnly);
        updateFavToggle();
      };
    }
    if(blBtn){
      blBtn.classList.toggle('on', state.blOnly);
      blBtn.onclick = () => {
        state.blOnly = !state.blOnly;
        blBtn.classList.toggle('on', state.blOnly);
        updateBlToggle();
      };
    }
  }

  stBox.onclick = e => {
    const b = e.target.closest('button[data-v]'); if(!b) return;
    draft.status = b.dataset.v;
    stBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  };

  soBox.onclick = e => {
    const b = e.target.closest('button[data-v]'); if(!b) return;
    if (b.dataset.toggle === 'true') {
      draft.sort = draft.sort === 'created' ? 'created_old' : 'created';
      if (draft.sort === 'created_old') {
        b.dataset.v = 'created_old';
        b.innerHTML = 'Сначала старые ↓';
      } else {
        b.dataset.v = 'created';
        b.innerHTML = 'Сначала новые ↑';
      }
      soBox.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    } else {
      draft.sort = b.dataset.v;
      soBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }
  };

  const close = () => modal.classList.remove('on');
  document.getElementById('catSetCancel').onclick = close;
  const persistCheckbox = document.getElementById('catSetPersistSort');
  if(persistCheckbox) {
    persistCheckbox.checked = draft.persistSort !== false;
  }

  document.getElementById('catSetSave').onclick = () => {
    const persist = persistCheckbox ? persistCheckbox.checked : true;
    categorySettings[state.category] = { 
      status: draft.status, 
      sort: persist ? draft.sort : 'recent',
      persistSort: persist,
      typeInclude: draft.typeInclude || [],
      typeExclude: draft.typeExclude || []
    };
    saveCategorySettings();
    state.status = draft.status;
    state.sort   = persist ? draft.sort : 'recent';
    close();
    render();
    toast('Настройки сохранены');
  };
  modal.classList.add('on');
}
  
  document.getElementById('btnCategorySettings').onclick = () => openCategorySettings();
  // Кнопки данных (только на мобиле, живут в настройках)
(function(){
  const ex = document.getElementById('mExport');
  const im = document.getElementById('mImport');
  const ml = document.getElementById('mMangaLib');
  if(ex) ex.onclick = () => document.getElementById('btnExport').click();
  if(im) im.onclick = () => document.getElementById('btnImport').click();
  if(ml) ml.onclick = () => {
    document.getElementById('catSettingsModal').classList.remove('on');
    setTimeout(() => document.getElementById('btnMangaLib').click(), 100);
  };
})();
document.getElementById('catSettingsModal').onclick = (e) => {
  if(e.target.id === 'catSettingsModal') e.target.classList.remove('on');
};
