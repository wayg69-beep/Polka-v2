'use strict';

/* ==========================================================
   trash.js — Корзина
   ========================================================== */

  /* ============ КОРЗИНА ============ */
function renderTrash(){
  const list = document.getElementById('trashList');
  if(!list) return;

  // «purged» — служебные «надгробия» окончательно удалённых карточек, их не показываем.
  // В режиме «скрыть BL» BL-карточки в корзине тоже прячем.
  const shown = trashItems.filter(t => !t.purged && !(state.emergencyMode && t.bl));

  if(!shown.length){
    list.innerHTML = '<div class="trash-empty">Корзина пуста</div>';
    return;
  }

  // Сортируем: свежие сверху
  const sorted = shown.slice().sort((a,b) => (b.deletedAt||0) - (a.deletedAt||0));

  list.innerHTML = sorted.map(it => {
const T = TYPES[it.type] || {label:'—', icon: SVG_ICONS.help};
    const daysAgo = Math.floor((Date.now() - it.deletedAt) / (1000*60*60*24));
    const daysLeft = Math.max(0, TRASH_DAYS - daysAgo);
    const when = daysAgo <= 0 ? 'Удалено сегодня'
               : daysAgo === 1 ? 'Удалено вчера'
               : 'Удалено ' + daysAgo + ' дн. назад';
    const cover = it.cover
      ? `<img src="${esc(it.cover)}" loading="lazy" alt="">`
      : `<span>${T.icon}</span>`;

    return `
      <div class="trash-item">
        <div class="trash-cover">${cover}</div>
        <div class="trash-info">
          <div class="trash-title">${esc(it.title || 'Без названия')}</div>
          <div class="trash-meta">${when} · осталось ${daysLeft} дн.</div>
        </div>
        <button class="trash-btn restore" data-restore="${esc(it.id)}" title="Восстановить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button class="trash-btn delete" data-delete="${esc(it.id)}" title="Удалить навсегда">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-restore]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.restore;
      const it = trashItems.find(x => x.id === id);
      if(!it) return;

      delete it.deletedAt;
      // «обновлено сейчас» — чтобы облако не решило, что карточка всё ещё удалена
      it.updatedAt = Date.now();

      items.push(it);
      trashItems = trashItems.filter(x => x.id !== id);

      save(); saveTrash();
      renderTabs(); render(); renderTrash();
      toast('Карточка восстановлена');
    };
  });

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.delete;
      if(!confirm('Удалить навсегда? Восстановить будет нельзя.')) return;

      const it = trashItems.find(x => x.id === id);
      if(it){
        CoverCache.deleteForItem(it.id);
        _coverBlobUrls.delete(it.id + '_card');
        _coverBlobUrls.delete(it.id + '_full');
        if(it.cover) _manualUrlsOk.delete(it.cover);
      }

      // Оставляем «надгробие»: иначе облако вернёт карточку в корзину обратно
      trashItems = trashItems.map(x => x.id === id ? { id: x.id, deletedAt: Date.now(), purged: true } : x);
      saveTrash(); renderTrash();
      toast('Удалено навсегда');
    };
  });
}

// Инициализация кнопок
document.getElementById('btnTrash').onclick = () => {
  document.getElementById('trashModal').classList.add('on');
  renderTrash();
};
const mTrash = document.getElementById('mTrash');
if(mTrash){
  mTrash.onclick = () => {
    document.getElementById('catSettingsModal').classList.remove('on');
    setTimeout(() => document.getElementById('btnTrash').click(), 100);
  };
}
document.getElementById('trashCloseBtn').onclick = () => {
  document.getElementById('trashModal').classList.remove('on');
};
document.getElementById('trashEmptyBtn').onclick = () => {
  // в режиме «скрыть BL» чистим только то, что видно
  const targets = trashItems.filter(t => !t.purged && !(state.emergencyMode && t.bl));
  if(!targets.length) return;
  if(!confirm('Очистить корзину? Все удалённые карточки исчезнут навсегда.')) return;

  const ids = new Set(targets.map(t => t.id));
  targets.forEach(it => {
    CoverCache.deleteForItem(it.id);
    _coverBlobUrls.delete(it.id + '_card');
    _coverBlobUrls.delete(it.id + '_full');
    if(it.cover) _manualUrlsOk.delete(it.cover);
  });
  const now = Date.now();
  trashItems = trashItems.map(x => ids.has(x.id) ? { id: x.id, deletedAt: now, purged: true } : x);
  saveTrash(); renderTrash();
  toast('Корзина очищена');
};
document.getElementById('trashModal').onclick = (e) => {
  if(e.target.id === 'trashModal') e.target.classList.remove('on');
};
