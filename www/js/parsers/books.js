'use strict';

/* ==========================================================
   books.js — Книги: Knigi.ws, Flibusta, Ficbook, Fanfics.me, AO3, скачивание файлов
   ========================================================== */

  


/* ============ ПОИСК НА KNIGI.WS ============ */

function openKnigiModal(){
  const modal = document.getElementById('knigiModal');
  const input = document.getElementById('knigiQuery');
  const results = document.getElementById('knigiResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeKnigiModal(){
  const modal = document.getElementById('knigiModal');
  if(modal) modal.classList.remove('on');
}

async function runKnigiSearch(){
  const input = document.getElementById('knigiQuery');
  const results = document.getElementById('knigiResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  
  try {
    const searchUrl = 'https://knigi.ws/index.php?do=search&subaction=search&story=' + encodeURIComponent(q);
    const html = await fetchProxied(searchUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const links = Array.from(doc.querySelectorAll('a[href*=".html"]'));
    const bookLinks = links.filter(a => a.href.includes('knigi.ws/') && !a.href.includes('/faq/') && !a.href.includes('/download.html')).slice(0, 10);
    
    if(!bookLinks.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    const list = bookLinks.map((a, idx) => ({
      idx: idx,
      title: a.textContent.trim() || 'Без названия',
      url: a.href
    }));

    window._knigiCache = list;
    
    results.innerHTML = list.map(r => `
      <div class="tmdb-result" data-idx="${r.idx}">
        <div class="tmdb-result-poster" style="font-size:24px; color:#9a9aa8;">${SVG_ICONS.book}</div>
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${esc(r.title)}</div>
          <div class="tmdb-result-meta">Knigi.ws</div>
        </div>
      </div>
    `).join('');

    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickKnigiResult(+el.dataset.idx);
    });
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function pickKnigiResult(idx){
  const list = window._knigiCache || [];
  const r = list[idx];
  if(!r) return;
  
  const panel = document.getElementById('panel');
  const results = document.getElementById('knigiResults');
  
  results.innerHTML = '<div class="tmdb-status">Загружаю данные книги…</div>';
  
  try {
    const pageHtml = await fetchProxied(r.url);
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    
    const titleEl = doc.querySelector('h1');
    let title = titleEl ? titleEl.textContent.trim() : r.title;
    title = title.replace(/\s*-\s*читать онлайн.*$/i, '').trim();

    const ogImg = doc.querySelector('meta[property="og:image"]');
    const cover = ogImg ? ogImg.getAttribute('content') : '';

    let description = '';
    let maxLength = 0;
    doc.querySelectorAll('div, p, span').forEach(el => {
      if(el.children.length === 0){
        const text = el.textContent.trim();
        if(text.length > maxLength && text.length > 100) {
          maxLength = text.length;
          description = text;
        }
      }
    });
    if(!description) {
      const ogDesc = doc.querySelector('meta[property="og:description"]');
      description = ogDesc ? ogDesc.getAttribute('content') : '';
    }

    const authorEl = doc.querySelector('a[href*="/avtor/"], .author a, .autor a');
    const author = authorEl ? authorEl.textContent.trim() : '';

    let pages = '';
    let year = '';
    const bodyText = doc.body.textContent || '';

    const pagesMatch = bodyText.match(/Страницы:\s*(\d+)/i);
    if(pagesMatch) pages = pagesMatch[1];

    const yearMatch = bodyText.match(/Год:\s*(\d{4})/i);
    if(yearMatch) year = yearMatch[1];

    let downloadLink = '';
    const dlLinks = Array.from(doc.querySelectorAll('a[href*="do=download"]'));
    if(dlLinks.length > 0) {
      const rawLink = dlLinks[0].href;
      downloadLink = 'https://polka-proxy.foress-tfiree.workers.dev/?download=' + encodeURIComponent(rawLink);
    } else {
      downloadLink = r.url;
    }

    const setVal = (id, val) => {
      const el = panel.querySelector('#' + id);
      if(el && val !== undefined && val !== null) el.value = val;
    };

    setVal('f_title', title);
    setVal('f_country', author);
    setVal('f_pages', pages);
    setVal('f_year', year);
    if(description) setVal('f_description', description);
    if(cover) setVal('f_cover', cover);
    setVal('f_link', downloadLink);

    if(cover) setCoverPreview(cover);
    
    closeKnigiModal();
    toast('Заполнено с Knigi.ws', 'success');
  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки: ' + esc(e.message) + '</div>';
  }
}


// ===== Обработчики кнопок (они потерялись!) =====
document.getElementById('knigiClose').onclick = closeKnigiModal;
document.getElementById('knigiModal').onclick = (e) => {
  if(e.target.id === 'knigiModal') closeKnigiModal();
};
const knigiInput = document.getElementById('knigiQuery');
if (knigiInput) {
  knigiInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runKnigiSearch(); }
  });
}

/* ============ СКАЧИВАНИЕ ФАЙЛОВ ЧЕРЕЗ ПРОКСИ ============ */
async function downloadViaProxy(proxyUrl, filename){
  try {
    toast('Начинаю скачивание...', 'success');
    const r = await fetch(proxyUrl);
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();

    const contentDisp = r.headers.get('content-disposition') || '';
console.log('[DL] Content-Disposition:', contentDisp);

if(contentDisp) {
  const filenameMatch = contentDisp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
  if (filenameMatch) {
    let realName = filenameMatch[1].replace(/['"]/g, '').trim();
    try { realName = decodeURIComponent(realName); } catch(e){}
    console.log('[DL] Настоящее имя на сервере:', realName);
    
    const expected = filename.replace(/\.[^.]+$/, '').toLowerCase().trim();
    const actual = realName.toLowerCase().trim();
    
    if(expected && actual && !actual.includes(expected) && !expected.includes(actual)) {
      const proceed = confirm(
        '⚠️ ВНИМАНИЕ! Подмена файла!\n\n' +
        'Ты искала: ' + filename + '\n' +
        'Сервер отдаёт: ' + realName + '\n\n' +
        'Скорее всего, книга удалена с Флибусты, и вместо неё подсовывают другую.\n\n' +
        'Всё равно скачать?'
      );
      if(!proceed) {
        toast('❌ Скачивание отменено');
        return;
      }
      filename = realName;
    }
  }
}
    
    // Если файл слишком маленький (меньше 5 КБ) — значит, это ошибка
if(blob.size < 5000) {
  const text = await blob.text();
  console.error('Ошибка скачивания (маленький файл):', text.slice(0, 500));
  throw new Error('Флибуста вернула ошибку вместо файла');
}

// Проверяем fb2-метаданные: убеждаемся, что скачалась та книга.
// (Флибуста иногда отдаёт другую книгу для удалённых по DMCA)
try {
  const head = await blob.slice(0, 8000).text();
  const titleMatch = head.match(/<book-title>([^<]+)<\/book-title>/i);
  if(titleMatch){
    const realTitle = titleMatch[1].trim();
    console.log('[DL] Название в файле:', realTitle);
    const expected = filename.replace(/\.[^.]+$/, '').toLowerCase().trim();
    const actual = realTitle.toLowerCase().trim();
    const matches = expected && actual && (
      actual.includes(expected) || expected.includes(actual) ||
      actual.split(/\s+/).some(w => w.length > 3 && expected.includes(w))
    );
    if(!matches){
      const proceed = confirm(
        '⚠️ Возможно, не та книга!\n\n' +
        'Ты открывала: ' + filename + '\n' +
        'В файле: ' + realTitle + '\n\n' +
        'Возможно, оригинал удалён с Флибусты по жалобе, и сервер подсунул другую книгу.\n\n' +
        'OK — скачать всё равно\n' +
        'Отмена — отменить'
      );
      if(!proceed){
        toast('❌ Скачивание отменено');
        return;
      }
      // Переименовываем под настоящую книгу
      filename = realTitle.replace(/[\\\/:*?"<>|]/g, '_').trim().slice(0, 60) + '.fb2';
    }
  }
} catch(e){
  console.log('[DL] Не удалось прочитать метаданные:', e.message);
}

    // Принудительно ставим application/octet-stream — чтобы браузер
    // не додумывал расширение (.html) от типа text/html
    const cleanBlob = new Blob([blob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(cleanBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('✅ Файл скачан!');
  } catch(e) {
    console.error('[DL] Ошибка:', e);
    toast('Ошибка: ' + e.message);
  }
}

  /* ============ ДВИЖОК СБОРКИ И СКАЧИВАНИЯ FICBOOK ============ */
function escapeXmlFic(s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({
    '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;'
  }[c]));
}

function extractTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach(e => e.remove());
  doc.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
  doc.querySelectorAll('p, div').forEach(e => e.append('\n'));
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

async function downloadFicbookFic(url, title, author, btnEl) {
  const originalText = btnEl.innerHTML;
btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Скачиваю...`;
btnEl.disabled = true;
btnEl.classList.remove('success');
  
  try {
    // 1. Загружаем страницу фанфика (оглавление)
    const baseHtml = await fetchProxied(url);
    const baseDoc = new DOMParser().parseFromString(baseHtml, 'text/html');
    
    // 2. Ищем главы
    let parts = [];
    const partLinks = Array.from(baseDoc.querySelectorAll('.list-of-fanfic-parts a.part-link'));
    if (partLinks.length) {
      parts = partLinks
        .filter(a => !a.classList.contains('line-link'))
        .map(a => {
          const href = a.getAttribute('href');
          return {
            url: new URL(href, 'https://ficbook.net').href,
            title: (a.querySelector('h3')?.textContent || a.textContent || '').trim() || 'Глава'
          };
        });
    } else {
      // Если оглавления нет — это одночастник
      parts = [{ url: url, title: title }];
    }
    
    const chapters = [];
    
    // 3. Качаем каждую главу
    for (let i = 0; i < parts.length; i++) {
      btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Скачиваю главу ${i+1}/${parts.length}`;
      const p = parts[i];
      
      let html = '';
      if (p.url === url) {
         html = baseHtml;
      } else {
         html = await fetchProxied(p.url);
      }
      
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      let contentNode = doc.querySelector('.part_text');
      let text = '';
      if (contentNode) {
        text = extractTextFromHtml(contentNode.innerHTML);
      } else {
        text = '[Текст не найден]';
      }
      
      let noteTop = '';
      const noteTopNode = doc.querySelector('.part-comment-top');
      if (noteTopNode) {
        noteTop = extractTextFromHtml(noteTopNode.innerHTML);
      }
      
      chapters.push({ title: p.title, text, noteTop });
      
      // Небольшая пауза, чтобы не забанили
      if (i < parts.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // 4. Собираем FB2
    let body = '';
for (const chap of chapters) {
  body += `<section>\n<title><p>${escapeXmlFic(chap.title)}</p></title>\n`;
  if (chap.noteTop) body += `<p><strong>Примечание:</strong> ${escapeXmlFic(chap.noteTop)}</p>\n`;
  
  // Разбиваем текст на абзацы по переносам строки
  const paragraphs = chap.text.split('\n').map(p => p.trim()).filter(Boolean);
  for(const p of paragraphs) {
    body += `<p>${escapeXmlFic(p)}</p>\n`;
  }
  
  body += `</section>\n`;
}
    
    const fb2 = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>fanfiction</genre>
      <author><nickname>${escapeXmlFic(author || 'Неизвестен')}</nickname></author>
      <book-title>${escapeXmlFic(title)}</book-title>
      <lang>ru</lang>
    </title-info>
    <document-info>
      <author><nickname>Polka</nickname></author>
      <id>${Date.now()}</id>
      <version>1.0</version>
    </document-info>
  </description>
  <body>
${body}
  </body>
</FictionBook>`;
    
    const blob = new Blob([fb2], { type: 'application/x-fictionbook+xml;charset=utf-8' });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = title.replace(/[\\/:*?"<>|]/g, '_').trim() + '.fb2';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(dlUrl), 60000);
    
    btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Готово`;
btnEl.classList.add('success');
toast('Скачано: ' + title);
  } catch(e) {
    console.error(e);
    btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Ошибка`;
btnEl.classList.remove('success');
toast('Ошибка: ' + e.message);
  } finally {
    setTimeout(() => {
  btnEl.innerHTML = originalText;
  btnEl.disabled = false;
  btnEl.classList.remove('success');
}, 3000);
  }
}

/* ============ ПОИСК НА FLIBUSTA ============ */
function openFlibustaModal(){
  const modal = document.getElementById('flibustaModal');
  const input = document.getElementById('flibustaQuery');
  const results = document.getElementById('flibustaResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeFlibustaModal(){
  const modal = document.getElementById('flibustaModal');
  if(modal) modal.classList.remove('on');
}

async function runFlibustaSearch(){
  const input = document.getElementById('flibustaQuery');
  const results = document.getElementById('flibustaResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  
  try {
    let list = [];
    const seenIds = new Set();
    const qWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // ===== 1. Поиск по книгам =====
    const bookUrl = 'https://flibusta.club/booksearch?ask=' + encodeURIComponent(q);
    const bookHtml = await fetchProxied(bookUrl);
    const bookDoc = new DOMParser().parseFromString(bookHtml, 'text/html');
    const bookResults = parseFlibustaBooks(bookDoc);
    bookResults.forEach(b => { if(!seenIds.has(b.id)){ seenIds.add(b.id); list.push(b); } });
    
    // ===== 2. Если книг нет — ищем авторов в блоке "Найденные писатели" =====
    if(list.length === 0){
      console.log('[FlibustaSearch] Книг нет, ищу авторов…');
      
      let authorLinks = [];
      // Ищем заголовок "Найденные писатели:"
      const allEls = Array.from(bookDoc.querySelectorAll('b, strong, h1, h2, h3, p, div'));
      const headerEl = allEls.find(el => {
        const t = (el.textContent || '').trim();
        return t === 'Найденные писатели:' || t === 'Найденные авторы:';
      });
      
      if(headerEl) {
        // Берем родителя или следующий элемент
        let container = headerEl.parentElement;
        if (container.tagName === 'BODY' || container.tagName === 'HTML' || container.classList.contains('content')) {
           container = headerEl.nextElementSibling || headerEl;
        }
        authorLinks = Array.from(container.querySelectorAll('a[href^="/a/"]'));
      }
      
      // Если нашли блок — парсим. Если нет — ищем везде, но с фильтром.
      if (authorLinks.length === 0) {
          authorLinks = Array.from(bookDoc.querySelectorAll('a[href^="/a/"]'));
      }
      
      const authors = [];
      for(const a of authorLinks){
        // Пропускаем ссылки из сайдбара (навигация, популярные авторы)
        if (a.closest('#sidebar') || a.closest('.sidebar') || a.closest('.right')) continue;
        
        const m = (a.getAttribute('href')||'').match(/^\/a\/(\d+)/);
        if(!m) continue;
        
        let name = (a.textContent||'').trim().replace(/\s*\(\d+\)\s*$/, '');
        if(!name || name.length < 2) continue;
        
        // Жёсткая проверка: имя должно содержать хотя бы одно слово из запроса
        const nameLow = name.toLowerCase();
        const matches = qWords.length > 0 && qWords.some(w => nameLow.includes(w));
        
        if(matches){
          authors.push({ id: m[1], name });
        }
      }
      
      console.log('[FlibustaSearch] Найдено авторов:', authors.length, authors.map(a => a.name));
      
      for(const author of authors.slice(0, 3)){
        try {
          console.log('[FlibustaSearch] Загружаю книги автора:', author.name);
          const booksHtml = await fetchProxied('https://flibusta.club/a/' + author.id);
          const booksDoc = new DOMParser().parseFromString(booksHtml, 'text/html');
          const authorBooks = parseFlibustaBooks(booksDoc);
          
          authorBooks.forEach(b => {
            if(!seenIds.has(b.id)){
              seenIds.add(b.id);
              b.author = b.author || author.name;
              list.push(b);
            }
          });
        } catch(e){
          console.log('[FlibustaSearch] Ошибка загрузки книг автора ' + author.name + ':', e.message);
        }
      }
    }
    
    if(!list.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    
    list = list.slice(0, 20).map((b, idx) => ({ ...b, idx }));
    window._flibustaCache = list;
    
    results.innerHTML = list.map(r => `
      <div class="tmdb-result" data-idx="${r.idx}">
        <div class="tmdb-result-poster" style="font-size:24px">${SVG_ICONS.book}</div>
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${esc(r.title)}</div>
          <div class="tmdb-result-meta">${esc(r.author || 'Flibusta')}</div>
        </div>
      </div>
    `).join('');

    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickFlibustaResult(+el.dataset.idx);
    });
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

// Хелпер: парсит книги из HTML-документа (страница поиска или страница автора)
function parseFlibustaBooks(doc){
  const allLinks = Array.from(doc.querySelectorAll('a[href*="/b/"]'));
  const bookMap = new Map();
  
  for(const a of allLinks){
    // Игнорируем ссылки из боковых панелей (популярные, новинки и т.д.)
    if (a.closest('#sidebar') || a.closest('.sidebar') || a.closest('.right')) continue;
    
    const rawHref = a.getAttribute('href') || '';
    let pathname;
    try { pathname = new URL(rawHref, 'https://flibusta.club').pathname; }
    catch(e){ continue; }
    
    const m = pathname.match(/^\/b\/(\d+)/);
    if(!m) continue;
    const id = m[1];
    
    let text = (a.textContent || '').trim();
    let titleAttr = (a.getAttribute('title') || '').trim();
    const isReadBtn = /читать|онлайн|бесплатно|скачать/i.test(text);
    
    if(isReadBtn){
      const container = a.closest('.book_left') || a.parentElement.parentElement;
      if(container){
        const siblingLinks = Array.from(container.querySelectorAll('a[href*="/b/' + id + '"]'));
        for(const sl of siblingLinks){
          const slText = (sl.textContent || '').trim();
          if(slText && !/читать|онлайн|бесплатно|скачать|fb2|epub/i.test(slText)){
            text = slText;
            break;
          }
        }
        if(/читать|онлайн/i.test(text)){
          const img = container.querySelector('img');
          if(img){
            const imgTitle = (img.getAttribute('title') || img.getAttribute('alt') || '').trim();
            if(imgTitle) text = imgTitle;
          }
        }
      }
      if(/читать|онлайн/i.test(text) && titleAttr && !/читать|онлайн/i.test(titleAttr)){
        text = titleAttr;
      }
    }
    
    let score = 0;
    if (/^\/b\/\d+\/?$/.test(pathname)) score += 2;
    if (!isReadBtn && text.length > 2) score += 3;
    if (titleAttr && !isReadBtn) score += 2;
    
    let author = '';
    let node = a.parentElement;
    for(let i = 0; i < 4 && node; i++){
      const auLink = node.querySelector('a[href*="/a/"]');
      if(auLink){ author = (auLink.textContent || '').trim(); break; }
      node = node.parentElement;
    }
    
    const existing = bookMap.get(id);
    if(!existing || score > existing.score){
      bookMap.set(id, { id, title: text || titleAttr || 'Книга #' + id, author, score });
    }
  }
  
  return Array.from(bookMap.values())
    .filter(b => b.title && !/^(читать|онлайн|бесплатно|скачать)$/i.test(b.title));
            }

async function pickFlibustaResult(idx){
  const list = window._flibustaCache || [];
  const r = list[idx];
  if(!r) return;
  
  const panel = document.getElementById('panel');
  const results = document.getElementById('flibustaResults');
  
  results.innerHTML = '<div class="tmdb-status">Загружаю данные книги…</div>';
  
  try {
    const bookUrl = 'https://flibusta.club/b/' + r.id;
    const pageHtml = await fetchProxied(bookUrl);
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    
    // Название
    const titleEl = doc.querySelector('.book_name h1');
    const title = titleEl ? titleEl.textContent.trim() : r.title;

    // Автор
    const authorEl = doc.querySelector('.row.author .row_content a');
    const author = authorEl ? authorEl.textContent.trim() : '';

    // Обложка
    const imgEl = doc.querySelector('.book_img img');
    let cover = '';
    if(imgEl){
      const src = imgEl.getAttribute('src');
      if(src) cover = src.startsWith('http') ? src : 'https://flibusta.club' + src;
    }

    // Год
    const yearEl = doc.querySelector('.row.year_public .row_content');
    let year = '';
    if(yearEl){
      const yearMatch = yearEl.textContent.match(/\d{4}/);
      if(yearMatch) year = yearMatch[0];
    }

    // Жанры (теги)
    const genreEls = doc.querySelectorAll('.row.genre .row_content a');
    const tags = Array.from(genreEls).map(a => a.textContent.trim()).filter(Boolean);

    // Описание — клонируем и берём textContent, чтобы АВТОМАТИЧЕСКИ
// раскодировать ВСЕ HTML-сущности (&nbsp;, &laquo;, &mdash; и т.д.)
const descEl = doc.querySelector('.b_biblio_book_annotation');
let description = '';
if(descEl){
  const clone = descEl.cloneNode(true);
  clone.innerHTML = clone.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');
  description = (clone.textContent || '')
    .replace(/\u00a0/g, ' ')   // неразрывный пробел → обычный
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Используем скрытый эндпоинт /f/ для прямого скачивания файла!
let directDownload = 'https://flibusta.club/b/' + r.id + '/f/?format=fb2';
const downloadLink = directDownload;
console.log('[Flibusta] Прямая ссылка на файл:', directDownload);

    // Заполняем форму
    const setVal = (id, val) => {
      const el = panel.querySelector('#' + id);
      if(el && val !== undefined && val !== null) el.value = val;
    };

    setVal('f_title', title);
    setVal('f_country', author);
    setVal('f_year', year);
    setVal('f_description', description);
    setVal('f_cover', cover);
    setVal('f_tags', tags.join(', '));
    setVal('f_link', directDownload);

    if(cover) setCoverPreview(cover);
    
    closeFlibustaModal();
    toast('Заполнено с Flibusta');
  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки: ' + esc(e.message) + '</div>';
  }
}

// Обработчики кнопок
document.getElementById('flibustaClose').onclick = closeFlibustaModal;
document.getElementById('flibustaModal').onclick = (e) => {
  if(e.target.id === 'flibustaModal') closeFlibustaModal();
};
const flibustaInput = document.getElementById('flibustaQuery');
if (flibustaInput) {
  flibustaInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runFlibustaSearch(); }
  });
}

  /* ============ ПОИСК НА FICBOOK ============ */
function openFicbookModal(){
  const modal = document.getElementById('ficbookModal');
  const input = document.getElementById('ficbookQuery');
  const results = document.getElementById('ficbookResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeFicbookModal(){
  const modal = document.getElementById('ficbookModal');
  if(modal) modal.classList.remove('on');
}

  /* ============ ПОИСК НА FANFICS.ME ============ */
function openFanficsModal(){
  const modal = document.getElementById('fanficsModal');
  const input = document.getElementById('fanficsQuery');
  const results = document.getElementById('fanficsResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeFanficsModal(){
  const modal = document.getElementById('fanficsModal');
  if(modal) modal.classList.remove('on');
}

  /* ============ ПОИСК НА AO3 (Archive of Our Own) ============ */
function openAo3Modal(){
  const modal = document.getElementById('ao3Modal');
  const input = document.getElementById('ao3Query');
  const results = document.getElementById('ao3Results');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeAo3Modal(){
  const modal = document.getElementById('ao3Modal');
  if(modal) modal.classList.remove('on');
}

async function runAo3Search(){
  const input = document.getElementById('ao3Query');
  const results = document.getElementById('ao3Results');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу на AO3…</div>';
  
  try {
    const searchUrl = 'https://archiveofourown.org/works/search?work_search%5Bquery%5D=' + encodeURIComponent(q);
    const res = await nativeFetch(searchUrl, { 'Accept': 'text/html,application/xhtml+xml' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = Array.from(doc.querySelectorAll('li.work.blurb.group'));
    
    if (!items.length) {
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено (или тех. работы на AO3)</div>';
      return;
    }
    
    const list = [];
    items.forEach(blurb => {
      const titleLink = blurb.querySelector('h4.heading a:first-child');
      if(!titleLink) return;
      const href = titleLink.getAttribute('href');
      const title = titleLink.textContent.trim();

      const authorLink = blurb.querySelector('h4.heading a[rel="author"]');
      const author = authorLink ? authorLink.textContent.trim() : 'Аноним';

      const fandomLink = blurb.querySelector('h5.fandoms a.tag');
      const fandom = fandomLink ? fandomLink.textContent.trim() : '';

      let rating = '';
      const ratingEl = blurb.querySelector('.required-tags .rating-explicit, .required-tags .rating-mature, .required-tags .rating-teen-and-up-audiences, .required-tags .rating-general-audience');
      if(ratingEl) {
        if(ratingEl.classList.contains('rating-explicit')) rating = 'Explicit';
        else if(ratingEl.classList.contains('rating-mature')) rating = 'Mature';
        else if(ratingEl.classList.contains('rating-teen-and-up-audiences')) rating = 'Teen';
        else if(ratingEl.classList.contains('rating-general-audience')) rating = 'General';
      }

      let category = '';
      const catEls = blurb.querySelectorAll('.required-tags span.category');
      if (catEls.length > 1) {
        category = 'Multi';
      } else if (catEls.length === 1) {
        category = catEls[0].getAttribute('title') || catEls[0].textContent.trim() || '';
      }

      let year = '';
      const datetimeEl = blurb.querySelector('p.datetime');
      if(datetimeEl && datetimeEl.getAttribute('datetime')) {
        const ym = datetimeEl.getAttribute('datetime').match(/\d{4}/);
        if(ym) year = ym[0];
      }

      let description = '';
      const summaryEl = blurb.querySelector('blockquote.summary');
      if(summaryEl) description = summaryEl.textContent.replace(/\s+/g, ' ').trim();

      const tags = [];
      if(fandom) tags.push(fandom);
      blurb.querySelectorAll('.tags.commas li a.tag').forEach(a => {
        const t = a.textContent.trim();
        if(t && !tags.includes(t)) tags.push(t);
      });

      list.push({ title, author, fandom, rating, category, year, description, tags, href, url: 'https://archiveofourown.org' + href });
    });

    window._ao3Cache = list;
    
    results.innerHTML = list.map((r, idx) => {
      let cats = r.category ? r.category.split(', ') : [];
      if (cats.length > 1) cats = ['Multi'];
      
      return `
      <div class="tmdb-result" data-idx="${idx}" style="display:flex; align-items:flex-start; padding:10px 12px;">
        <div class="tmdb-result-poster" style="font-size:24px; color:#9a9aa8;">${SVG_ICONS.book}</div>
        <div class="tmdb-result-info" data-idx="${idx}" style="flex:1; cursor:pointer;">
          <div class="tmdb-result-title">${esc(r.title)}</div>
          <div class="tmdb-result-meta" style="margin-top:3px;">${esc(r.author)}</div>
          <div class="tmdb-result-meta" style="white-space:normal; margin-top:4px; font-size:11px; opacity:0.9; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            ${cats.map(c => {
               let style = 'background:hsla(270, 60%, 50%, .15); color:hsl(270, 80%, 70%);';
               const cl = c.toLowerCase();
               if (cl.includes('f/m')) style = 'background:hsla(140, 60%, 50%, .15); color:hsl(140, 80%, 65%);';
               else if (cl.includes('f/f')) style = 'background:hsla(330, 60%, 50%, .15); color:hsl(330, 80%, 70%);';
               else if (cl.includes('m/m')) style = 'background:hsla(200, 60%, 50%, .15); color:hsl(200, 80%, 70%);';
               else if (cl.includes('gen')) style = 'background:hsla(30, 60%, 40%, .15); color:hsl(30, 70%, 65%);';
               return `<span style="${style} padding:1px 6px; border-radius:4px; font-weight:600;">${esc(c)}</span>`;
            }).join('')}
            ${(r.category && (r.fandom || r.rating)) ? '<span style="opacity:0.5;">·</span>' : ''}
            ${r.fandom ? `<span style="display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; flex:1;">${esc(r.fandom)}</span>` : ''}
            ${r.rating ? `<span style="background:rgba(255,255,255,.1); padding:1px 5px; border-radius:4px;">${esc(r.rating)}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    results.querySelectorAll('.tmdb-result-info').forEach(el => {
      el.onclick = () => pickAo3Result(+el.dataset.idx);
    });
    
  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

  
async function pickAo3Result(idx){
  const list = window._ao3Cache || [];
  const r = list[idx];
  if(!r) return;
  
  const panel = document.getElementById('panel');
  const setVal = (id, val) => { const el = panel.querySelector('#' + id); if(el && val) el.value = val; };

  setVal('f_title', r.title);
  setVal('f_year', r.year);
  setVal('f_country', r.author);
  setVal('f_description', r.description);
  setVal('f_tags', r.tags.join(', '));
  setVal('f_link', r.url);

  // BL: ставим, если в категории есть M/M, F/F или Multi
  const cat = (r.category || '').toLowerCase();
  const isBl = cat.includes('m/m') || cat.includes('f/f') || cat.includes('multi');
  
  if (isBl) {
    const segBl = panel.querySelector('#f_bl');
    if (segBl) {
      segBl.querySelector('button[data-v="yes"]')?.classList.add('on');
      segBl.querySelector('button[data-v="no"]')?.classList.remove('on');
    }
    const draft = window._currentDraft;
    if(draft) draft.bl = true;
  } else {
    const segBl = panel.querySelector('#f_bl');
    if (segBl) {
      segBl.querySelector('button[data-v="no"]')?.classList.add('on');
      segBl.querySelector('button[data-v="yes"]')?.classList.remove('on');
    }
    const draft = window._currentDraft;
    if(draft) draft.bl = false;
  }

  // Принудительно ставим тип "Книга"
  const segType = panel.querySelector('#f_type');
  if (segType) {
    const bookBtn = segType.querySelector('button[data-v="book"]');
    if (bookBtn) {
      segType.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      bookBtn.classList.add('on');
    }
  }
  const draft = window._currentDraft;
  if(draft) draft.type = 'book';

  closeAo3Modal();
  toast('Заполнено с AO3', 'success');
}  
  
document.getElementById('ao3Close').onclick = closeAo3Modal;
document.getElementById('ao3Modal').onclick = (e) => {
  if(e.target.id === 'ao3Modal') closeAo3Modal();
};
document.getElementById('ao3Query').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runAo3Search(); }
});

  
async function runFanficsSearch(){
  const input = document.getElementById('fanficsQuery');
  const results = document.getElementById('fanficsResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  
  try {
    // Правильный URL для поиска фанфиков
    const searchUrl = 'https://fanfics.me/search?subject=fic&str=' + encodeURIComponent(q);
    const html = await fetchProxied(searchUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Ищем все карточки результатов
    const tables = Array.from(doc.querySelectorAll('.FicTbl'));
    if(!tables.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    const list = [];
    tables.forEach(table => {
      const a = table.querySelector('.FicTable_Title h4 a');
      if(!a || !a.getAttribute('href').startsWith('/fic')) return;

      const title = a.textContent.trim();
      const href = a.getAttribute('href');
      const categoryEl = table.querySelector('.FicTable_Title span.small');
      const category = categoryEl ? categoryEl.textContent.replace(/[()]/g, '').trim() : '';
      
      let year = '';
      const dateEl = table.querySelector('.DateUpdate');
      if(dateEl) {
        const ym = dateEl.textContent.match(/\b(19\d\d|20[0-2]\d)\b/);
        if(ym) year = ym[1];
      }

      // Описание: берём .FicTbl_sammary, убираем кнопку ">>" и показываем скрытый текст
      let description = '';
      const summEl = table.querySelector('.FicTbl_sammary');
      if(summEl) {
        const clone = summEl.cloneNode(true);
        const subLink = clone.querySelector('[id$="_summary_sub_link"]');
        if(subLink) subLink.remove();
        clone.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
        description = clone.textContent.replace(/\s+/g, ' ').trim();
      }

      // Мета-данные
      let author = '', fandom = '', rating = '', genres = '';
      const metaEl = table.querySelector('.FicTbl_meta');
      if(metaEl) {
        const metaText = metaEl.textContent;
        
        const authorMatch = metaText.match(/Автор:\s*(.*?)(?:\n|Фандом:)/i);
        if(authorMatch) author = authorMatch[1].replace('фанфик опубликован анонимно', 'Аноним').trim();
        
        const fandomLink = metaEl.querySelector('a[href*="/fandom"]');
        if(fandomLink) fandom = fandomLink.textContent.trim();
        
        const ratingMatch = metaText.match(/Рейтинг:\s*(NC-21|NC-17|R|PG-13|PG|G)/i);
        if(ratingMatch) rating = ratingMatch[1];
        
        const genresMatch = metaText.match(/Жанры:\s*(.*?)(?:\n|Размер:)/i);
        if(genresMatch) genres = genresMatch[1].trim();
      }

      list.push({ title, href, category, year, description, author, fandom, rating, genres, url: 'https://fanfics.me' + href });
    });

    if(!list.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    window._fanficsCache = list;
    
    results.innerHTML = list.map((r, idx) => {
  let catStyle = 'background:hsla(270, 60%, 50%, .15); color:hsl(270, 80%, 70%);';
  const c = String(r.category || '').toLowerCase().trim();
  if (c === 'гет') {
    catStyle = 'background:hsla(140, 60%, 50%, .15); color:hsl(140, 80%, 65%);';
  } else if (c === 'фемслэш') {
    catStyle = 'background:hsla(330, 60%, 50%, .15); color:hsl(330, 80%, 70%);';
  } else if (c === 'слэш') {
    catStyle = 'background:hsla(200, 60%, 50%, .15); color:hsl(200, 80%, 70%);';
  } else if (c === 'джен') {
    catStyle = 'background:hsla(30, 60%, 40%, .15); color:hsl(30, 70%, 65%);';
  } else if (c.includes('другие')) {
    catStyle = 'background:hsla(160, 60%, 40%, .15); color:hsl(160, 80%, 65%);';
  } else if (c === 'смешанная') {
    catStyle = 'background:hsla(50, 60%, 50%, .15); color:hsl(50, 80%, 68%);';
  } else if (c === 'статья') {
    catStyle = 'background:hsla(220, 15%, 50%, .15); color:hsl(220, 15%, 65%);';
  }

  return `
  <div class="tmdb-result" style="display:flex; align-items:flex-start; padding:10px 12px;">
    <div class="tmdb-result-poster" style="font-size:24px; color:#9a9aa8;">${SVG_ICONS.book}</div>
    <div class="tmdb-result-info" data-idx="${idx}" style="flex:1; cursor:pointer;">

      <div class="tmdb-result-title" style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
        <span style="-webkit-line-clamp:2; display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; flex:1; word-break:break-word;">${esc(r.title)}</span>
        ${r.rating ? `<span class="tmdb-result-type" style="margin-left:0; flex-shrink:0; margin-top:1px;">${esc(r.rating)}</span>` : ''}
      </div>

      <div class="tmdb-result-meta" style="margin-top:3px;">${esc(r.author || 'Автор не указан')}</div>

      ${(r.category || r.fandom) ? `
      <div class="tmdb-result-meta" style="white-space:normal; margin-top:4px; font-size:11px; opacity:0.9; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
        ${r.category ? `<span style="${catStyle} padding:1px 6px; border-radius:4px; font-weight:600;">${esc(r.category)}</span>` : ''}
        ${(r.category && r.fandom) ? '<span style="opacity:0.5;">·</span>' : ''}
        ${r.fandom ? `<span style="display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; flex:1;">${esc(r.fandom)}</span>` : ''}
      </div>
      ` : ''}

    </div>
  </div>`;
}).join('');

    results.querySelectorAll('.tmdb-result-info').forEach(el => {
  el.onclick = () => pickFanficsResult(+el.dataset.idx);
});
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
    }
async function pickFanficsResult(idx){
  const list = window._fanficsCache || [];
  const r = list[idx];
  if(!r) return;
  
  const panel = document.getElementById('panel');
  const setVal = (id, val) => { const el = panel.querySelector('#' + id); if(el && val) el.value = val; };

  // Собираем теги из жанров и фандома
  const tagsArray = [];
  if(r.fandom) tagsArray.push(r.fandom);
  if(r.genres) tagsArray.push(...r.genres.split(',').map(s => s.trim()));
  
  // Заполняем форму
  setVal('f_title', r.title);
  setVal('f_year', r.year);
  setVal('f_country', r.author);
  setVal('f_description', r.description);
  setVal('f_tags', tagsArray.join(', '));
  setVal('f_link', r.url);

  // BL-пометка, если слэш
  if (r.category.toLowerCase() === 'слэш') {
    const segBl = panel.querySelector('#f_bl');
    if (segBl) {
      segBl.querySelector('button[data-v="yes"]')?.classList.add('on');
      segBl.querySelector('button[data-v="no"]')?.classList.remove('on');
    }
    const draft = window._currentDraft;
    if(draft) draft.bl = true;
  }

  // Переключаем тип на "Книга" (на случай если искали из другого раздела)
  const segType = panel.querySelector('#f_type');
  if (segType) {
    const bookBtn = segType.querySelector('button[data-v="book"]');
    if (bookBtn) {
      segType.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      bookBtn.classList.add('on');
    }
  }
  const draft = window._currentDraft;
  if(draft) draft.type = 'book';

  closeFanficsModal();
  toast('Заполнено с Fanfics.me', 'success');
}
document.getElementById('fanficsClose').onclick = closeFanficsModal;
document.getElementById('fanficsModal').onclick = (e) => {
  if(e.target.id === 'fanficsModal') closeFanficsModal();
};
document.getElementById('fanficsQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runFanficsSearch(); }
});

async function runFicbookSearch(){
  const input = document.getElementById('ficbookQuery');
  const results = document.getElementById('ficbookResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  
  try {
    const searchUrl = 'https://ficbook.net/search_fanfics?query=' + encodeURIComponent(q);
    const html = await fetchProxied(searchUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    doc.querySelectorAll('aside, .sidebar, .right-sidebar, .right-column, .promo, .promoted, [class*="promo"]').forEach(el => el.remove());

    const links = Array.from(doc.querySelectorAll('a.visit-link[href^="/readfic/"]'));
    const seenIds = new Set();
    const list = [];
    
    for(const a of links){
      const href = a.getAttribute('href') || '';
      if (href.includes('from_promo=')) continue;

      const m = href.match(/^\/readfic\/([a-f0-9\-]+)/);
      if(!m) continue;
      const id = m[1];
      if(seenIds.has(id)) continue;
      
      const title = (a.textContent || '').trim();
      if(!title || title.length < 2) continue;

      // Ищем контейнер, в котором лежат все данные (обычно это div с классом fanfic-main-info)
      const card = a.closest('div');
      const infoBlock = card ? card.querySelector('.fanfic-main-info') : null;
      if(!infoBlock) continue;

      // Собираем все dl-блоки, чтобы не зависеть от их порядка
      const dls = Array.from(infoBlock.querySelectorAll('dl.fanfic-inline-info'));

      // Автор
      let author = '';
      const authorDl = dls.find(dl => dl.querySelector('dt')?.textContent.includes('Автор'));
      if (authorDl) author = authorDl.querySelector('dd a[href^="/authors/"]')?.textContent.trim() || '';

      // Фандом
      let fandom = '';
      const fandomDl = dls.find(dl => dl.querySelector('dt')?.textContent.includes('Фэндом'));
      if (fandomDl) {
        const fandomLinks = Array.from(fandomDl.querySelectorAll('dd a[href^="/fanfiction/"]'));
        fandom = fandomLinks.map(el => el.textContent.trim()).join(', ');
      }

      // Категория и Рейтинг
      let category = '';
      let rating = '';
      const catEl = infoBlock.querySelector('div[class*="direction-"]');
      if (catEl) category = catEl.textContent.trim();
      const ratingEl = infoBlock.querySelector('div[class*="ds-label-rating-"]');
      if (ratingEl) rating = ratingEl.textContent.trim();

      // Обложка (берем десктопную версию из source, чтобы не было обрезки)
      let cover = '';
      const pictureEl = infoBlock.querySelector('picture.fanfic-hat-cover-picture');
      if (pictureEl) {
        const desktopSource = pictureEl.querySelector('source[media*="min-width: 481px"]');
        if (desktopSource && desktopSource.getAttribute('srcset')) {
          cover = desktopSource.getAttribute('srcset');
        } else {
          const imgEl = pictureEl.querySelector('img');
          if (imgEl) {
            cover = imgEl.getAttribute('src') || '';
            // Если вдруг source не нашёлся, просто меняем мобильную "m_" на десктопную "d_"
            cover = cover.replace('/m_', '/d_');
          }
        }
      }

      // Описание
      let description = '';
      const descEl = infoBlock.querySelector('.fanfic-description-text, .description.word-break');
      if (descEl) description = descEl.textContent.trim();

      // Страницы (из блока "Размер")
      let pages = '';
      const sizeDl = dls.find(dl => dl.querySelector('dt')?.textContent.includes('Размер'));
      if (sizeDl) {
        const sizeText = sizeDl.querySelector('dd')?.textContent || '';
        const pageMatch = sizeText.match(/написано\s*(\d+)\s*страниц/i);
        if (pageMatch) pages = pageMatch[1];
      }

      // Год (из блока "Дата обновления")
      let year = '';
      const dateDl = dls.find(dl => dl.querySelector('dt')?.textContent.includes('Дата обновления'));
      if (dateDl) {
        const dateText = dateDl.querySelector('dd')?.textContent || '';
        const yearMatch = dateText.match(/\d{4}/);
        if (yearMatch) year = yearMatch[0];
      }

      // Теги
      const tagsArray = [];
      const tagsContainer = infoBlock.querySelector('.tags');
      if (tagsContainer) {
        tagsContainer.querySelectorAll('a.tag').forEach(tag => {
          const txt = tag.textContent.trim();
          if (txt && !tagsArray.includes(txt)) tagsArray.push(txt);
        });
      }
      
      seenIds.add(id);
      list.push({ 
        id, title, author, fandom, category, rating, 
        cover, description, pages, year, tags: tagsArray, 
        url: 'https://ficbook.net/readfic/' + id 
      });
      
      if(list.length >= 15) break;
    }
    
    if(!list.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    window._ficbookCache = list;
    
    // Рендерим результаты
    results.innerHTML = list.map((r, idx) => {
      let catStyle = 'background:hsla(270, 60%, 50%, .15); color:hsl(270, 80%, 70%);';
      const c = String(r.category || '').toLowerCase().trim();
      if (c === 'гет') catStyle = 'background:hsla(140, 60%, 50%, .15); color:hsl(140, 80%, 65%);';
      else if (c === 'фемслэш') catStyle = 'background:hsla(330, 60%, 50%, .15); color:hsl(330, 80%, 70%);';
      else if (c === 'слэш') catStyle = 'background:hsla(200, 60%, 50%, .15); color:hsl(200, 80%, 70%);';
      else if (c === 'джен') catStyle = 'background:hsla(30, 60%, 40%, .15); color:hsl(30, 70%, 65%);';
      else if (c.includes('другие')) catStyle = 'background:hsla(160, 60%, 40%, .15); color:hsl(160, 80%, 65%);';
      else if (c === 'смешанная') catStyle = 'background:hsla(50, 60%, 50%, .15); color:hsl(50, 80%, 68%);';
      else if (c === 'статья') catStyle = 'background:hsla(220, 15%, 50%, .15); color:hsl(220, 15%, 65%);';

      return `
      <div class="tmdb-result" style="display:flex; align-items:flex-start; padding:10px 12px;">
      <div class="tmdb-result-poster" style="font-size:24px; color:#9a9aa8;">${SVG_ICONS.book}</div>
        <div class="tmdb-result-info" data-idx="${idx}" style="flex:1; cursor:pointer;">
          
          <div class="tmdb-result-title" style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
            <span style="-webkit-line-clamp:2; display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; flex:1; word-break:break-word;">${esc(r.title)}</span>
            ${r.rating ? `<span class="tmdb-result-type" style="margin-left:0; flex-shrink:0; margin-top:1px;">${esc(r.rating)}</span>` : ''}
          </div>
          
          <div class="tmdb-result-meta" style="margin-top:3px;">${esc(r.author || 'Автор не указан')}</div>
          
          ${(r.category || r.fandom) ? `
          <div class="tmdb-result-meta" style="white-space:normal; margin-top:4px; font-size:11px; opacity:0.9; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            ${r.category ? `<span style="${catStyle} padding:1px 6px; border-radius:4px; font-weight:600;">${esc(r.category)}</span>` : ''}
            ${(r.category && r.fandom) ? '<span style="opacity:0.5;">·</span>' : ''}
            ${r.fandom ? `<span style="display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; flex:1;">${esc(r.fandom)}</span>` : ''}
          </div>
          ` : ''}
          
        </div>
      </div>
      `;
    }).join('');

    results.querySelectorAll('.tmdb-result-info').forEach(el => {
      el.onclick = () => pickFicbookResult(+el.dataset.idx);
    });
    
  } catch(e){
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}
  
async function pickFicbookResult(idx){
  const list = window._ficbookCache || [];
  const r = list[idx];
  if(!r) return;
  
  const panel = document.getElementById('panel');
  const setVal = (id, val) => { 
    const el = panel.querySelector('#' + id); 
    if(el && val !== undefined && val !== null) el.value = val; 
  };

  // Заполняем форму
  setVal('f_title', r.title);
  setVal('f_year', r.year);
  setVal('f_country', r.author);
  setVal('f_description', r.description);
  setVal('f_pages', r.pages);
  setVal('f_link', r.url);
  
  // Заполняем теги (если массив есть — склеиваем через запятую, если нет — фандом)
  if (r.tags && r.tags.length > 0) {
    setVal('f_tags', r.tags.join(', '));
  } else if (r.fandom) {
    setVal('f_tags', r.fandom);
  }

  // Подтягиваем обложку
  if (r.cover) {
    setVal('f_cover', r.cover);
    setCoverPreview(r.cover);
    const draft = window._currentDraft;
    if(draft) draft.cover = r.cover;
  }

  // BL-пометка, если слэш
  if (r.category && r.category.toLowerCase().includes('слэш')) {
    const segBl = panel.querySelector('#f_bl');
    if (segBl) {
      segBl.querySelector('button[data-v="yes"]')?.classList.add('on');
      segBl.querySelector('button[data-v="no"]')?.classList.remove('on');
    }
    const draft = window._currentDraft;
    if(draft) draft.bl = true;
  }

  // Переключаем тип на "Книга"
  const segType = panel.querySelector('#f_type');
  if (segType) {
    const bookBtn = segType.querySelector('button[data-v="book"]');
    if (bookBtn) {
      segType.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      bookBtn.classList.add('on');
    }
  }
  const draft = window._currentDraft;
  if(draft) draft.type = 'book';

  closeFicbookModal();
  toast('Заполнено с Ficbook', 'success');
}
  
document.getElementById('ficbookClose').onclick = closeFicbookModal;
document.getElementById('ficbookModal').onclick = (e) => {
  if(e.target.id === 'ficbookModal') closeFicbookModal();
};
const ficbookInput = document.getElementById('ficbookQuery');
if (ficbookInput) {
  ficbookInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runFicbookSearch(); }
  });
}
