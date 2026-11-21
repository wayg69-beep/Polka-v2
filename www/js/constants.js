'use strict';

/* ==========================================================
   constants.js — Константы: ключи localStorage, SVG-иконки, TYPES, CATEGORIES, SECTIONS, STATUSES, SORTS, RATING_HUES
   ========================================================== */

/* ============ ДАННЫЕ ============ */
const KEY = 'polka_v1';
const CAT_KEY = 'polka_cat';
const EMERGENCY_KEY = 'polka_emergency';
const CAT_SETTINGS_KEY = 'polka_cat_settings';
  const TRASH_KEY = 'polka_trash';
const TRASH_DAYS = 7;

/* ============ SVG ИКОНКИ ============ */
const SVG_ICONS = {
  // Книга (раскрытая)
  book: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,

  // Комиксы (облачко)
  comic: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,

  // Фильм / Медиа (хлопушка)
  movie: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,

  // Музыка (нота)
  music: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,

  // Сериал (кинопленка с Play)
  series: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16"/><path d="M2 8h5M2 12h5M2 16h5M17 8h5M17 12h5M17 16h5"/><polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none"/></svg>`,

  // Дорама (луна и звезда)
  drama: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/><path d="M19 5v4M17 7h4"/></svg>`,

  // Всё (папка с документами)
  all: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9V6a2 2 0 0 1 2-2h10l2 3"/><rect x="7" y="11" width="10" height="6" rx="1"/><path d="M9 13h6M9 15h4"/></svg>`,

  // Иконка поиска (лупа)
  search: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,

  // Иконка страницы
  page: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,

  // Экспорт
  export: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,

  // Импорт
  import: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,

  // Корона (для админа)
crown: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/></svg>`,

// Облако (для синхронизации)
cloud: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,

  // Корзина
  trash: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,

// Скачивание
download: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,

// Крестик (закрыть)
close: `<svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.2em;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,

// Плюс (для кнопки FAB)
plus: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,

// Скриншот
screenshot: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,

// Вопросительный знак (если тип контента неизвестен)
help: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

const TYPES = {
  movie:  {label:'Фильм',   icon: SVG_ICONS.movie,  group:'screen'},
  series: {label:'Сериал',  icon: SVG_ICONS.series, group:'screen'},
  drama:  {label:'Дорама',  icon: SVG_ICONS.drama,  group:'screen'},
  comic:  {label:'Комикс',  icon: SVG_ICONS.comic,  group:'comic'},
  book:   {label:'Книга',   icon: SVG_ICONS.book,   group:'book'},
  music:  {label:'Музыка',  icon: SVG_ICONS.music,  group:'music'},
};

const CATEGORIES = {
  all:    {label:'Всё',      icon: SVG_ICONS.all,   types:null},
  screen: {label:'Медиа',    icon: SVG_ICONS.movie, types:['movie','series','drama']},
  comic:  {label:'Комиксы',  icon: SVG_ICONS.comic, types:['comic']},
  book:   {label:'Книги',    icon: SVG_ICONS.book,  types:['book']},
  music:  {label:'Музыка',   icon: SVG_ICONS.music, types:['music']},
};
  
const SECTIONS = [
  {key:'screen', label:'Медиа',    icon: SVG_ICONS.movie, types:['movie','series','drama']},
  {key:'comic',  label:'Комиксы',  icon: SVG_ICONS.comic, types:['comic']},
  {key:'book',   label:'Книги',    icon: SVG_ICONS.book,  types:['book']},
  {key:'music',  label:'Музыка',   icon: SVG_ICONS.music, types:['music']},
];
  
const STATUSES = {
  want:        {label:'В планах',   color:'#ff5a5a'},
  in_progress: {label:'В процессе', color:'#ffb020'},
  done:        {label:'Готово',     color:'#76EF6C'},
  dropped:     {label:'Брошено',    color:'#3bb0ff'},
};

const SORTS = {
  created: 'Сначала новые',
  created_old: 'Сначала старые',
  process: 'По процессу',
  rating:  'По оценке',
  title:   'По алфавиту',
  year:    'По году',
};

/* ============ ЦВЕТ ОЦЕНКИ ============ */
// Таблица hue для оценок 1..10. Индекс 0 не используется.
const RATING_HUES = [
  0,       // заглушка
  0,       // 1  — красный
  14.4,    // 2
  28.9,    // 3
  43.3,    // 4
  57.8,    // 5  — жёлтый
  72.2,    // 6
  86.7,    // 7
  101.1,   // 8
  108.3,   // 9  — середина между 8 и 10
  115.6    // 10 — бывший цвет 9
];
