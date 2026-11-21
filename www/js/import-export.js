'use strict';

/* ==========================================================
   import-export.js — Экспорт и импорт данных
   ========================================================== */

/* ============ ЭКСПОРТ / ИМПОРТ ============ */
function askImportMode(filesCount, incomingCount, currentCount){
  return new Promise(resolve => {
    const modal = document.getElementById('importModeModal');
    document.getElementById('importModeInfo').innerHTML =
      'Файлов: <b>' + filesCount + '</b><br>' +
      'Записей в файлах: <b>' + incomingCount + '</b><br>' +
      'Записей сейчас в приложении: <b>' + currentCount + '</b>';
    const done = v => { modal.classList.remove('on'); resolve(v); };
    document.getElementById('importModeMerge').onclick = () => done('merge');
    document.getElementById('importModeReplace').onclick = () => {
      if(confirm('Заменить все текущие записи (' + currentCount + ') записями из файла?\n\nСтарые уйдут в корзину на 7 дней, их можно будет вернуть.')) done('replace');
    };
    document.getElementById('importModeCancel').onclick = () => done(null);
    modal.onclick = e => { if(e.target === modal) done(null); };
    modal.classList.add('on');
  });
}

document.getElementById('btnExport').onclick = () => {
  const data = JSON.stringify({ version:1, exportedAt:new Date().toISOString(), items }, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `polka-backup-${d}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast('Файл выгружен');
};
document.getElementById('btnImport').onclick = () => {
  document.getElementById('fileInput').click();
};
document.getElementById('fileInput').onchange = async e => {
  const files = Array.from(e.target.files || []);
  if(!files.length) return;

  const readFile = f => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Не прочитать файл ' + f.name));
    r.readAsText(f);
  });

  try {
    let allIncoming = [];
    for(const f of files){
      const text = await readFile(f);
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : parsed.items;
      if(!Array.isArray(incoming)) throw new Error('формат не тот в ' + f.name);
      allIncoming = allIncoming.concat(incoming);
    }

    if(!allIncoming.length){ toast('Пусто'); return; }

    const mode = await askImportMode(files.length, allIncoming.length, items.length);
    if(!mode){ toast('Импорт отменён'); return; }
    const trashIdSet = new Set(trashItems.map(t => t.id));
    let trashChanged = false;

    if(mode === 'replace'){
      const now0 = Date.now();
      allIncoming.forEach(it => { if(!it.id) it.id = uid(); });
      const incomingIds = new Set(allIncoming.map(it => it.id));
      // старые карточки не пропадают насовсем, а уходят в корзину на 7 дней
      items.forEach(it => {
        if(!incomingIds.has(it.id)) trashItems.push(Object.assign({}, it, { deletedAt: now0 }));
      });
      // карточки из файла, которые лежали в корзине, считаем возвращёнными
      allIncoming.forEach(it => { if(trashIdSet.has(it.id)) it.updatedAt = now0; });
      trashItems = trashItems.filter(t => !incomingIds.has(t.id));
      CoverCache.clear().catch(() => {});
      items = allIncoming;
      // при ближайшей синхронизации облако должно принять именно этот список
      try{ localStorage.setItem('polka_prefer_local', '1'); }catch(e){}
    } else {
      // В режиме «добавить» защищаемся от явных дубликатов
      const existingIds = new Set(items.map(i => i.id));
      const existingKeys = new Set(items.map(i => (i.sourceUrl || '') + '|' + (i.title || '').toLowerCase()));
      let added = 0, skipped = 0;
      for(const it of allIncoming){
        const key = (it.sourceUrl || '') + '|' + (it.title || '').toLowerCase();
        if(it.id && existingIds.has(it.id)){ skipped++; continue; }
        if(existingKeys.has(key)){ skipped++; continue; }
        if(!it.id || existingIds.has(it.id)) it.id = uid();
        if(trashIdSet.has(it.id)){
          // карточка была в корзине — возвращаем, и она должна «победить» удаление
          it.updatedAt = Date.now();
          trashItems = trashItems.filter(t => t.id !== it.id);
          trashChanged = true;
        }
        items.push(it);
        existingIds.add(it.id);
        existingKeys.add(key);
        added++;
      }
      toast('Добавлено: ' + added + (skipped ? ', пропущено дубликатов: ' + skipped : ''));
    }

    const legacy = { anime:'series', video:'movie', game:'movie', other:'book' };
    items.forEach(it => {
      if(legacy[it.type]) it.type = legacy[it.type];
      if(!it.id) it.id = uid();
      const _n0 = Date.now();
      if(!it.createdAt) it.createdAt = _n0;
      if(!it.updatedAt) it.updatedAt = _n0;
      if(typeof it.favorite !== 'boolean') it.favorite = false;
      it.moments = normMoments(it.moments);
      if(typeof it.description !== 'string') it.description = '';
      if(typeof it.country !== 'string') it.country = '';
      if(typeof it.pages !== 'string') it.pages = '';
      if(typeof it.link !== 'string') it.link = '';
      if(typeof it.link_sub !== 'string') it.link_sub = '';
      if(typeof it.link_extras !== 'string') it.link_extras = '';
      if(typeof it.bl !== 'boolean') it.bl = false;
      if(!Array.isArray(it.tags)) it.tags = [];
      if(typeof it.hearts !== 'number') it.hearts = 0;
      if(typeof it.title_en !== 'string') it.title_en = '';
    });

    save(); if(trashChanged || mode === 'replace') saveTrash(); renderTabs(); render();
    if(mode === 'replace'){
      toast('Заменено на ' + allIncoming.length + ' записей');
    }
  } catch(err){
    toast('Ошибка: ' + err.message);
  } finally {
    e.target.value = '';
  }
};
