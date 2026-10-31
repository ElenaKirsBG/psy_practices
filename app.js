/* Психокабинет — практики, алгоритмы сессий и журнал консультаций. © 2026 Елена Кирсанова. Все права защищены. */
'use strict';

const APP_NAME = 'Психокабинет';
const APP_VERSION = '4.0.0';
const CACHE_NAME = 'psykab-v4';
const CORE_COUNT = 16;

const S = { items: [], byId: {}, meta: null, topics: [], topicById: {}, algs: [], algById: {}, ready: false, indexed: false, kindFilter: '' };
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');

/* ================= хранилище ================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem('pp_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pp_' + k, JSON.stringify(v)); return true; } catch (e) { toast('Не удалось сохранить: память устройства заполнена'); return false; } }
};
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const favs = () => store.get('favs', []);
const isFav = id => favs().includes(id);
function toggleFav(id) { const f = favs(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); store.set('favs', f); return i < 0; }
const notes = () => store.get('notes', {});
function setNote(id, t) { const n = notes(); if (t.trim()) n[id] = t; else delete n[id]; store.set('notes', n); }
function pushRecent(id) { let r = store.get('recent', []).filter(x => x !== id); r.unshift(id); store.set('recent', r.slice(0, 20)); }

/* ================= настройки оформления ================= */
const FONTS = {
  lora: { n: 'Lora (с засечками)', v: '"Lora", Georgia, serif' },
  iowan: { n: 'Классический', v: '"Iowan Old Style", "Palatino", Georgia, serif' },
  georgia: { n: 'Georgia', v: 'Georgia, "Times New Roman", serif' },
  sans: { n: 'Без засечек', v: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif' },
  avenir: { n: 'Avenir', v: '"Avenir Next", Avenir, "Segoe UI", sans-serif' }
};
const ACCENTS = ['#5d7d70', '#3f6b8a', '#7a5c8e', '#a0654a', '#8a6a45', '#b0506a', '#4f7a3f', '#2f2f2f'];
const INKS = ['', '#2a2925', '#1c2a3a', '#3a2f22', '#24302b', '#000000'];
function applySettings() {
  const st = store.get('settings', {});
  const root = document.documentElement;
  const theme = st.theme || 'auto';
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  root.style.setProperty('--fs', (st.fs || 17) + 'px');
  if (st.accent) { root.style.setProperty('--accent', st.accent); root.style.setProperty('--accent-soft', st.accent + '22'); } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-soft'); }
  if (st.ink && theme !== 'dark') root.style.setProperty('--ink', st.ink); else root.style.removeProperty('--ink');
  root.style.setProperty('--serif', (FONTS[st.font] || FONTS.lora).v);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = st.accent || '#5d7d70';
}
applySettings();
function setSetting(k, v) { const st = store.get('settings', {}); if (v === '' || v == null) delete st[k]; else st[k] = v; store.set('settings', st); applySettings(); }

/* ================= текст ================= */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const ENDINGS = ['иями','ями','ами','ого','его','ому','ему','ыми','ими','ией','иях','ах','ях','ов','ев','ей','ий','ый','ой','ая','яя','ое','ее','ые','ие','ом','ем','ам','ям','ую','юю','ия','ья','ье','ии','ью','а','я','о','е','ы','и','у','ю','ь','й'];
function stem(w) { w = norm(w).replace(/[^a-zа-я0-9\-]/g, ''); if (w.length <= 4) return w; for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length); return w; }
const STOP = new Set(['и','в','во','на','с','со','к','ко','по','о','об','от','до','за','из','у','для','при','как','что','не','или','а','но','же','ли','мой','моя','мои','это']);
function terms(q) { return norm(q).split(/[\s,.;:!?«»"()]+/).filter(w => w && !STOP.has(w)).map(stem).filter(w => w.length >= 2); }
function countOcc(hay, needle, cap) { let n = 0, i = 0; while (n < cap && (i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function highlight(html, ts) {
  if (!ts.length) return html;
  const rx = new RegExp('(' + ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')([а-яёa-z]*)', 'gi');
  return html.replace(/>([^<]+)</g, (m, txt) => '>' + txt.replace(rx, '<mark>$1$2</mark>') + '<');
}
/* простая разметка для своих практик: "## Заголовок", "- пункт", "1. шаг" */
function markupToHtml(t) {
  const out = []; let ul = [];
  const flush = () => { if (ul.length) { out.push('<ul>' + ul.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'); ul = []; } };
  String(t || '').split('\n').forEach(l => {
    const s = l.trim();
    if (!s) { flush(); return; }
    if (/^#{1,3}\s/.test(s)) { flush(); out.push('<h3>' + esc(s.replace(/^#+\s*/, '')) + '</h3>'); return; }
    if (/^[-•*]\s/.test(s)) { ul.push(s.replace(/^[-•*]\s*/, '')); return; }
    flush();
    out.push(/^\d{1,2}[.)]\s/.test(s) ? '<p class="n">' + esc(s) + '</p>' : '<p>' + esc(s) + '</p>');
  });
  flush(); return out.join('');
}
const lines = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const parseD = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
const weekday = d => d ? WD[parseD(d).getDay()] : '';
const dateLong = d => { const x = parseD(d); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const dateShort = d => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowTime = () => { const d = new Date(); const m = Math.round(d.getMinutes() / 15) * 15; d.setMinutes(m); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ================= данные ================= */
async function load() {
  const meta = await fetch('data/meta.json').then(r => r.json());
  S.meta = meta; S.baseTopics = meta.topics;
  const parts = await Promise.all(meta.files.map(f => fetch('data/' + f).then(r => r.json())));
  S.baseItems = parts.flat(); S.baseItems.forEach(it => { it.g0 = it.g; it.gs0 = it.gs; });
  S.baseAlgs = await fetch('data/algorithms.json').then(r => r.json());
  rebuild();
  S.ready = true;
  setTimeout(buildIndex, 50);
}
/* объединяет встроенные материалы со своими практиками, темами и переносами */
function rebuild() {
  const utopics = store.get('utopics', []);
  S.topics = [...S.baseTopics, ...utopics.map(t => ({ id: t.id, n: t.n, g: 'Мои темы', k: [t.n], r: [], own: true }))];
  S.topicById = {}; S.topics.forEach(t => S.topicById[t.id] = t);
  const ov = store.get('ov', {});
  const upr = store.get('upr', []).map(p => ({ id: p.id, t: p.t, c: 'Мои практики', h: markupToHtml(p.txt), k: 'own', g0: p.g || [], gs0: (p.g || []).map(() => 60), s: 'own', d: strip(markupToHtml(p.txt)).slice(0, 200), own: true }));
  S.items = [...upr, ...S.baseItems];
  S.byId = {};
  S.items.forEach(it => {
    const o = ov[it.id];
    let g = it.g0.slice(), gs = it.gs0.slice();
    if (o) {
      if (o.rm) o.rm.forEach(t => { const i = g.indexOf(t); if (i >= 0) { g.splice(i, 1); gs.splice(i, 1); } });
      if (o.add) o.add.forEach(t => { if (!g.includes(t)) { g.unshift(t); gs.unshift(60); } });
    }
    it.g = g.filter(t => S.topicById[t]); it.gs = gs.slice(0, it.g.length);
    it._t = norm(it.t + ' ' + (it.c || ''));
    if (it.own) it._x = norm(strip(it.h));
    S.byId[it.id] = it;
  });
  const ualg = store.get('ualg', []).map(a => ({ ...a, own: true }));
  S.algs = [...ualg, ...S.baseAlgs];
  S.algById = {}; S.algs.forEach(a => { S.algById[a.id] = a; a._t = norm(a.title + ' ' + (a.tags || []).join(' ') + ' ' + a.cat); });
  S.topicCount = {}; S.items.forEach(it => it.g.forEach(g => S.topicCount[g] = (S.topicCount[g] || 0) + 1));
}
function buildIndex() {
  let i = 0;
  (function slice() {
    const end = Math.min(i + 120, S.items.length);
    for (; i < end; i++) { const it = S.items[i]; if (!it._x) it._x = norm(strip(it.h)); }
    if (i < S.items.length) setTimeout(slice, 0); else { S.indexed = true; if (location.hash.startsWith('#/?q=')) route(); }
  })();
}
const itemText = it => it._x || (it._x = norm(strip(it.h)));

/* ================= поиск ================= */
function matchTopics(ts) {
  const sc = {};
  for (const t of S.topics) {
    const words = norm(t.n).split(/[\s,()]+/).filter(Boolean);
    let best = 0;
    for (const s of ts) {
      if (s.length < 4) continue;
      const wm = w => w.startsWith(s) || (w.length >= 5 && s.startsWith(w.slice(0, Math.max(5, w.length - 2))));
      if (wm(words[0])) best = Math.max(best, 3); else if (words.some(wm)) best = Math.max(best, 2);
      for (const k of t.k) { const first = norm(k).split(' ')[0]; if (first.length >= 4 && (s.startsWith(first) || (first.startsWith(s) && s.length >= 5))) best = Math.max(best, 1); }
    }
    if (best) sc[t.id] = best;
  }
  const max = Math.max(0, ...Object.values(sc));
  return { main: Object.keys(sc).filter(k => sc[k] === max), extra: Object.keys(sc).filter(k => sc[k] < max) };
}
function kindOk(it) {
  const f = S.kindFilter;
  if (!f) return true;
  if (f === 'own') return !!it.own;
  if (f === 'group') return it.s === 'p300';
  if (f === 'ref') return it.k === 'reference' || it.k === 'theory';
  if (f === 'ind') return it.s !== 'p300' && it.k !== 'reference' && it.k !== 'theory';
  return true;
}
function search(q) {
  const ts = terms(q);
  if (!ts.length) return { ts, topics: [], related: [], items: [], algs: [] };
  const mt = matchTopics(ts), tops = mt.main;
  const rel = [...new Set([...mt.extra, ...tops.flatMap(t => S.topicById[t].r)])].filter(t => !tops.includes(t));
  const res = [];
  for (const it of S.items) {
    if (!kindOk(it)) continue;
    const tHits = ts.filter(t => it._t.includes(t)).length;
    let sc = tHits * 60, topicSc = 0;
    it.g.forEach((g, k) => { if (tops.includes(g)) topicSc = Math.max(topicSc, 40 + Math.min(it.gs[k] || 0, 40)); else if (rel.includes(g)) topicSc = Math.max(topicSc, 6 + Math.min(it.gs[k] || 0, 20) / 4); });
    sc += topicSc;
    const x = itemText(it);
    const all = ts.every(t => it._t.includes(t) || x.includes(t));
    if (all) sc += 10 + ts.reduce((a, t) => a + countOcc(x, t, 15), 0);
    if (it.own) sc += 5;
    if (sc > 0 && (all || topicSc >= 40 || tHits)) res.push([sc, it]);
  }
  res.sort((a, b) => b[0] - a[0]);
  const algs = S.algs.map(a => [ts.filter(t => a._t.includes(t)).length * 10, a]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  return { ts, topics: tops, related: rel, items: res.map(r => r[1]), algs };
}

/* ================= общие элементы ================= */
function kindTag(it) {
  if (it.own) return '<span class="tag own">моя практика</span>';
  if (it.k === 'reference') return '<span class="tag">справка</span>';
  if (it.k === 'theory') return '<span class="tag">теория</span>';
  if (it.s === 'p300') return '<span class="tag">для группы</span>';
  return '';
}
function itemCard(it, ts = []) {
  const tags = it.g.slice(0, 3).map(g => `<span class="tag">${esc(S.topicById[g].n)}</span>`).join('');
  const d = ts.length ? highlight('>' + esc(it.d) + '<', ts).slice(1, -1) : esc(it.d);
  return `<a class="card" href="#/item/${it.id}"><h3>${esc(it.t)}</h3><p>${d}</p><div class="meta">${kindTag(it)}${tags}</div></a>`;
}
function algCard(a) {
  return `<a class="card" href="#/alg/${a.id}"><h3>${esc(a.title)}</h3><p>${esc(a.purpose || '')}</p><div class="meta"><span class="tag alg">${esc(a.cat)}</span>${a.own ? '<span class="tag own">мой алгоритм</span>' : ''}${a.duration ? `<span class="tag">${esc(a.duration)}</span>` : ''}</div></a>`;
}
function listWithMore(arr, render, step = 40) {
  const id = 'l' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const box = document.getElementById(id); if (!box) return;
    let n = 0; const btn = document.createElement('button'); btn.className = 'more';
    const add = () => { box.insertAdjacentHTML('beforeend', arr.slice(n, n + step).map(render).join('')); n += step; btn.textContent = `Показать ещё (${arr.length - n})`; if (n >= arr.length) btn.remove(); };
    btn.onclick = add; box.after(btn); add();
  });
  return `<div id="${id}"></div>`;
}
function setTitle(t, back) { $('#pageTitle').textContent = t; $('#backBtn').hidden = !back; document.title = t === APP_NAME ? APP_NAME : t + ' · ' + APP_NAME; }
function setTab(t) { document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }
async function shareText(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(text);
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); } }
/* сохранить или отправить файл: на iPhone откроется меню «Поделиться» (Файлы, мессенджеры, почта) */
async function saveOrShare(blob, filename, mode) {
  const file = new File([blob], filename, { type: blob.type });
  if (mode !== 'download' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Файл сохранён: ' + filename);
}
const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/></svg>'
};

/* ---------- модальное окно ---------- */
function sheet(html, onMount) {
  const wrap = document.createElement('div'); wrap.className = 'sheetwrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(wrap); document.body.classList.add('noscroll');
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { wrap.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  onMount && onMount(wrap.querySelector('.sheet'), close);
  return close;
}
function confirmBox(text, okLabel, onOk) {
  sheet(`<h3 class="sheettitle">${esc(text)}</h3><div class="toolbar"><button class="btn danger" id="ok">${esc(okLabel)}</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => { el.querySelector('#ok').onclick = () => { close(); onOk(); }; });
}

/* ================= ПОИСК ================= */
const QUICK = ['Выгорание', 'Тревога', 'Самоценность', 'Отношения', 'Границы', 'Страх', 'Горе', 'Травма', 'Психосоматика', 'Внутренний критик', 'Гнев', 'Стыд', 'Вина', 'Прокрастинация', 'Депрессия', 'Сон', 'Деньги', 'Дети'];
function viewSearch(q = '') {
  setTab('search'); setTitle(APP_NAME, false);
  view.innerHTML = `
    <div class="searchbox">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Симптом, тема или техника: выгорание, отношения…" value="${esc(q)}">
      <button class="iconbtn clear" id="clr" aria-label="Очистить" ${q ? '' : 'hidden'}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="filters" id="filters"></div>
    <div id="res"></div>`;
  const inp = $('#q'), clr = $('#clr');
  renderFilters();
  let h;
  inp.addEventListener('input', () => { clr.hidden = !inp.value; clearTimeout(h); h = setTimeout(() => { S.lastQuery = inp.value; history.replaceState(null, '', inp.value ? '#/?q=' + encodeURIComponent(inp.value) : '#/'); renderResults(inp.value); }, 220); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  clr.onclick = () => { inp.value = ''; clr.hidden = true; history.replaceState(null, '', '#/'); renderResults(''); inp.focus(); };
  renderResults(q);
}
function renderFilters() {
  const f = $('#filters'); if (!f) return;
  const ks = [['', 'Все'], ['ind', 'Индивидуальная работа'], ['group', 'Для группы'], ['own', 'Мои практики'], ['ref', 'Справка и теория']];
  f.innerHTML = ks.map(([k, n]) => `<button class="chip ${S.kindFilter === k ? 'on' : ''}" data-k="${k}">${esc(n)}</button>`).join('');
  f.onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; S.kindFilter = b.dataset.k; renderFilters(); renderResults($('#q').value); };
}
function renderResults(q) {
  const box = $('#res');
  if (!q.trim()) {
    const recent = store.get('recent', []).map(id => S.byId[id] || S.algById[id]).filter(Boolean).slice(0, 6);
    const fv = favs().map(id => S.byId[id] || S.algById[id]).filter(Boolean).slice(0, 4);
    box.innerHTML = `
      <p class="hint">${S.items.length} практик и техник, ${S.algs.length} алгоритмов сессий. Всё работает без интернета.</p>
      <div class="toolbar"><a class="btn primary" href="#/journal/new">${ICON.plus}Запись в журнал</a><a class="btn" href="#/new/practice">${ICON.plus}Своя практика</a></div>
      <div class="sectionlabel">Частые запросы</div>
      <div class="chips">${QUICK.map(w => `<a class="chip" href="#/?q=${encodeURIComponent(w)}">${w}</a>`).join('')}</div>
      ${fv.length ? `<div class="sectionlabel">Избранное · <a href="#/favorites">все</a></div>${fv.map(x => x.title ? algCard(x) : itemCard(x)).join('')}` : ''}
      ${recent.length ? `<div class="sectionlabel">Недавно открытые</div>${recent.map(x => x.title ? algCard(x) : itemCard(x)).join('')}` : ''}`;
    return;
  }
  const r = search(q);
  let html = '';
  if (r.topics.length) {
    const main = r.topics.map(t => S.topicById[t]);
    html += `<div class="topicbanner"><h2>${main.map(t => esc(t.n)).join(' · ')}</h2><p>Сначала практики по теме, затем — по связанным темам и полному тексту.</p></div>`;
    html += `<div class="chips">${main.map(t => `<a class="chip main" href="#/topic/${t.id}">${esc(t.n)} <span class="n">${S.topicCount[t.id] || 0}</span></a>`).join('')}${r.related.slice(0, 8).map(id => `<a class="chip rel" href="#/topic/${id}">${esc(S.topicById[id].n)} <span class="n">${S.topicCount[id] || 0}</span></a>`).join('')}</div>`;
  }
  if (r.algs.length) html += `<div class="sectionlabel">Алгоритмы сессий</div>` + r.algs.slice(0, 4).map(algCard).join('');
  html += `<div class="sectionlabel">Практики и техники · ${r.items.length}${S.indexed ? '' : ' (индексирую полный текст…)'}</div>`;
  if (!r.items.length) html += `<div class="empty">Ничего не найдено. Попробуйте другое слово или общий термин: «тревога», «тело», «семья».</div>`;
  box.innerHTML = html + (r.items.length ? listWithMore(r.items, it => itemCard(it, r.ts)) : '');
}

/* ================= ПРАКТИКА ================= */
function viewItem(id) {
  const it = S.byId[id]; if (!it) return viewNotFound();
  pushRecent(id); setTab(''); setTitle(it.own ? 'Моя практика' : 'Практика', true);
  const ts = S.lastQuery ? terms(S.lastQuery) : [];
  const fav = isFav(id);
  const rel = it.own ? [] : S.items.filter(x => x !== it && x.c && x.c === it.c && x.s === it.s).slice(0, 5);
  view.innerHTML = `<article class="article">
    <h2 class="title">${esc(it.t)}</h2>
    ${it.c ? `<div class="sub">${esc(it.c)}</div>` : ''}
    <div class="toolbar">
      <button class="btn fav ${fav ? 'on' : ''}" id="fav">${ICON.star}<span>${fav ? 'В избранном' : 'В избранное'}</span></button>
      <button class="btn" id="topics">${ICON.tag}Темы</button>
      <button class="btn" id="share">${ICON.share}Поделиться</button>
      <button class="btn" id="copy">${ICON.copy}Копировать</button>
      <a class="btn" href="#/journal/new?tech=${encodeURIComponent(it.t)}">${ICON.book}В журнал</a>
      ${it.own ? `<a class="btn" href="#/edit/practice/${it.id}">${ICON.edit}Изменить</a>` : `<button class="btn" id="dup">${ICON.edit}Изменить копию</button>`}
    </div>
    <div class="chips" id="tchips">${it.g.map(g => `<a class="chip" href="#/topic/${g}">${esc(S.topicById[g].n)}</a>`).join('') || '<span class="small">Тема не назначена — нажмите «Темы»</span>'}</div>
    <div class="body">${highlight(it.h, ts)}</div>
    <div class="notes"><div class="sectionlabel">Мои заметки</div><textarea id="note" placeholder="Ваши наблюдения, вариации, для каких клиентов подходит…">${esc(notes()[id] || '')}</textarea></div>
    ${rel.length ? `<div class="related"><div class="sectionlabel">Ещё из этого раздела</div>${rel.map(x => itemCard(x)).join('')}</div>` : ''}
  </article>`;
  const plain = () => it.t + '\n\n' + htmlToText(it.h);
  $('#fav').onclick = () => { const on = toggleFav(id); $('#fav').classList.toggle('on', on); $('#fav span').textContent = on ? 'В избранном' : 'В избранное'; toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); };
  $('#share').onclick = () => shareText(it.t, plain());
  $('#copy').onclick = () => copyText(plain());
  $('#topics').onclick = () => topicSheet([id]);
  if (!it.own) $('#dup').onclick = () => { const p = { id: uid('u_p_'), t: it.t + ' (моя версия)', txt: htmlToMarkup(it.h), g: it.g.slice() }; const a = store.get('upr', []); a.unshift(p); store.set('upr', a); rebuild(); location.hash = '#/edit/practice/' + p.id; };
  let nh; $('#note').addEventListener('input', e => { clearTimeout(nh); nh = setTimeout(() => setNote(id, e.target.value), 400); });
}
function htmlToText(h) {
  return h.replace(/<h3>(.*?)<\/h3>/g, '\n$1\n').replace(/<li>/g, '• ').replace(/<\/(li|p|tr)>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}
function htmlToMarkup(h) {
  return h.replace(/<h3>(.*?)<\/h3>/g, '\n## $1\n').replace(/<li>/g, '- ').replace(/<\/(li|p|tr)>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<\/ul>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- перенос / дублирование по темам ---------- */
function topicSheet(ids) {
  const items = ids.map(id => S.byId[id]);
  const cur = new Set(items.flatMap(i => i.g));
  const groups = {}; S.topics.forEach(t => (groups[t.g] = groups[t.g] || []).push(t));
  sheet(`<h3 class="sheettitle">Темы практики${ids.length > 1 ? ` (${ids.length})` : ''}</h3>
    <p class="small">Сейчас: ${[...cur].map(t => `<span class="tag">${esc(S.topicById[t].n)}</span>`).join(' ') || 'нет тем'}</p>
    <p class="small"><b>Дублировать</b> — практика останется в текущих темах и появится в отмеченных. <b>Перенести</b> — практика будет только в отмеченных темах.</p>
    <div class="newtopic"><input id="nt" placeholder="Новая тема, например «Работа с клиентами-подростками»"><button class="btn" id="ntb">${ICON.plus}Создать</button></div>
    <div class="topicpick">${Object.entries(groups).map(([g, ts]) => `<div class="lbl">${esc(g)}</div>${ts.map(t => `<label class="pick"><input type="checkbox" value="${t.id}"><span>${esc(t.n)}${cur.has(t.id) ? ' <em>· текущая</em>' : ''}</span></label>`).join('')}`).join('')}</div>
    <div class="sheetbar"><button class="btn primary" id="dupb">Дублировать в отмеченные</button><button class="btn" id="movb">Перенести в отмеченные</button><button class="btn" id="rstb">Вернуть исходные</button></div>`,
    (el, close) => {
      const picked = () => [...el.querySelectorAll('.topicpick input:checked')].map(i => i.value);
      el.querySelector('#ntb').onclick = () => {
        const n = el.querySelector('#nt').value.trim(); if (!n) return;
        const ut = store.get('utopics', []); const t = { id: uid('u_t_'), n }; ut.push(t); store.set('utopics', ut); rebuild();
        close(); topicSheet(ids); setTimeout(() => { const cb = document.querySelector(`.topicpick input[value="${t.id}"]`); if (cb) { cb.checked = true; cb.scrollIntoView({ block: 'center' }); } }, 50);
      };
      const apply = mode => {
        const sel = picked(); if (!sel.length && mode !== 'reset') { toast('Отметьте хотя бы одну тему'); return; }
        const ov = store.get('ov', {});
        ids.forEach(id => {
          const it = S.byId[id];
          if (mode === 'reset') { delete ov[id]; return; }
          const o = ov[id] || { add: [], rm: [] };
          if (mode === 'dup') { o.add = [...new Set([...(o.add || []), ...sel])]; o.rm = (o.rm || []).filter(t => !sel.includes(t)); }
          if (mode === 'move') { o.add = sel.slice(); o.rm = [...new Set([...it.g0.filter(t => !sel.includes(t))])]; }
          ov[id] = o;
        });
        store.set('ov', ov); rebuild(); close(); route();
        toast(mode === 'dup' ? 'Практика добавлена в темы' : mode === 'move' ? 'Практика перенесена' : 'Темы восстановлены');
      };
      el.querySelector('#dupb').onclick = () => apply('dup');
      el.querySelector('#movb').onclick = () => apply('move');
      el.querySelector('#rstb').onclick = () => apply('reset');
    });
}

/* ================= ТЕМЫ ================= */
function viewTopics() {
  setTab('topics'); setTitle('Темы и симптомы', false);
  const groups = {}; S.topics.forEach(t => (groups[t.g] = groups[t.g] || []).push(t));
  view.innerHTML = `<p class="hint">Нажмите тему, чтобы увидеть практики и связанные темы. Любую практику можно продублировать или перенести в другую тему кнопкой «Темы» на её странице.</p>
    <div class="toolbar"><button class="btn primary" id="addt">${ICON.plus}Создать свою тему</button></div>` +
    Object.entries(groups).map(([g, ts]) => `<div class="sectionlabel">${esc(g)}</div><div class="chips">${ts.map(t => `<a class="chip ${t.own ? 'ownchip' : ''}" href="#/topic/${t.id}">${esc(t.n)} <span class="n">${S.topicCount[t.id] || 0}</span></a>`).join('')}</div>`).join('');
  $('#addt').onclick = () => sheet(`<h3 class="sheettitle">Новая тема</h3><input id="tn" class="field" placeholder="Название темы"><div class="sheetbar"><button class="btn primary" id="ok">Создать</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => { el.querySelector('#tn').focus(); el.querySelector('#ok').onclick = () => { const n = el.querySelector('#tn').value.trim(); if (!n) return; const ut = store.get('utopics', []); ut.push({ id: uid('u_t_'), n }); store.set('utopics', ut); rebuild(); close(); viewTopics(); }; });
}
function viewTopic(id) {
  const t = S.topicById[id]; if (!t) return viewNotFound();
  setTab('topics'); setTitle(t.n, true);
  const list = S.items.filter(it => it.g.includes(id)).sort((a, b) => (b.gs[b.g.indexOf(id)] || 0) - (a.gs[a.g.indexOf(id)] || 0));
  const algs = t.own ? [] : S.algs.filter(a => terms(t.n).some(s => a._t.includes(s)) || t.k.slice(0, 3).some(k => a._t.includes(stem(k))));
  view.innerHTML = `<div class="topicbanner"><h2>${esc(t.n)}</h2><p>${list.length} практик.${t.own ? '' : ' Связанные темы помогут расширить подбор.'}</p></div>
    ${t.own ? `<div class="toolbar"><button class="btn" id="ren">${ICON.edit}Переименовать</button><button class="btn danger" id="del">${ICON.trash}Удалить тему</button></div>` : ''}
    <div class="chips">${t.r.map(r => `<a class="chip rel" href="#/topic/${r}">${esc(S.topicById[r].n)} <span class="n">${S.topicCount[r] || 0}</span></a>`).join('')}</div>
    ${algs.length ? `<div class="sectionlabel">Алгоритмы сессий</div>${algs.slice(0, 4).map(algCard).join('')}` : ''}
    <div class="sectionlabel">Практики</div>${list.length ? listWithMore(list, it => itemCard(it)) : '<div class="empty">Пока пусто. Откройте любую практику → «Темы» → отметьте эту тему.</div>'}`;
  if (t.own) {
    $('#ren').onclick = () => sheet(`<h3 class="sheettitle">Переименовать тему</h3><input id="tn" class="field" value="${esc(t.n)}"><div class="sheetbar"><button class="btn primary" id="ok">Сохранить</button><button class="btn" data-close>Отмена</button></div>`,
      (el, close) => el.querySelector('#ok').onclick = () => { const ut = store.get('utopics', []); const x = ut.find(u => u.id === id); x.n = el.querySelector('#tn').value.trim() || x.n; store.set('utopics', ut); rebuild(); close(); viewTopic(id); });
    $('#del').onclick = () => confirmBox('Удалить тему «' + t.n + '»? Практики останутся в библиотеке.', 'Удалить', () => { store.set('utopics', store.get('utopics', []).filter(u => u.id !== id)); rebuild(); location.hash = '#/topics'; });
  }
}

/* ================= АЛГОРИТМЫ ================= */
function viewAlgorithms() {
  setTab('algorithms'); setTitle('Алгоритмы сессий', false);
  const cats = {}; S.algs.forEach(a => (cats[a.own ? 'Мои алгоритмы' : a.cat] = cats[a.own ? 'Мои алгоритмы' : a.cat] || []).push(a));
  view.innerHTML = `<p class="hint">Пошаговые алгоритмы: порядок проведения, готовые фразы, вопросы и зачем они нужны. Вопросы можно отмечать по ходу сессии, шаблоны — копировать.</p>
    <div class="toolbar"><a class="btn primary" href="#/new/alg">${ICON.plus}Свой алгоритм</a></div>` +
    Object.entries(cats).map(([c, as]) => `<div class="sectionlabel">${esc(c)}</div>${as.map(algCard).join('')}`).join('');
}
function findPracticeByTitle(t) {
  const n = norm(t).replace(/[«»"]/g, '');
  const nt = i => norm(i.t).replace(/[«»"]/g, '');
  return S.items.find(i => nt(i) === n) || S.items.find(i => nt(i).includes(n)) || S.items.find(i => n.includes(nt(i)) && i.t.length > 8);
}
function viewAlg(id) {
  const a = S.algById[id]; if (!a) return viewNotFound();
  pushRecent(id); setTab('algorithms'); setTitle(a.own ? 'Мой алгоритм' : 'Алгоритм сессии', true);
  const fav = isFav(id), checks = store.get('chk_' + id, {});
  const links = (a.links || []).map(findPracticeByTitle).filter(Boolean);
  const stepHtml = a.steps.map((s, i) => `<details class="step" ${i === 0 ? 'open' : ''}><summary>${esc(s.name)}</summary><div class="inner">
      ${s.why ? `<p class="why"><b>Зачем:</b> ${esc(s.why)}</p>` : ''}
      ${s.say && s.say.length ? `<div class="lbl">Что сказать</div>${s.say.map(x => `<p class="say">${esc(x)}</p>`).join('')}` : ''}
      ${s.ask && s.ask.length ? `<div class="lbl">Вопросы клиенту</div><div class="ask">${s.ask.map((x, j) => `<label><input type="checkbox" data-k="${i}_${j}" ${checks[i + '_' + j] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>` : ''}
      ${s.notes && s.notes.length ? `<div class="lbl">Обратить внимание</div><ul class="notelist">${s.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div></details>`).join('');
  view.innerHTML = `<article class="article">
    <h2 class="title">${esc(a.title)}</h2>
    <div class="alghead"><p class="purpose">${esc(a.purpose || '')}</p>${a.duration ? `<div class="dur">⏱ ${esc(a.duration)}</div>` : ''}</div>
    <div class="toolbar">
      <button class="btn fav ${fav ? 'on' : ''}" id="fav">${ICON.star}<span>${fav ? 'В избранном' : 'В избранное'}</span></button>
      <button class="btn" id="share">${ICON.share}Поделиться</button>
      <a class="btn" href="#/journal/new?tech=${encodeURIComponent(a.title)}">${ICON.book}В журнал</a>
      ${a.own ? `<a class="btn" href="#/edit/alg/${a.id}">${ICON.edit}Изменить</a>` : `<button class="btn" id="dup">${ICON.edit}Изменить копию</button>`}
      <button class="btn" id="openall">Раскрыть всё</button>
      <button class="btn" id="reset">Сбросить отметки</button>
    </div>
    ${stepHtml}
    ${a.after && a.after.length ? `<div class="sectionlabel">После сессии</div><ul class="notelist">${a.after.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.tips && a.tips.length ? `<div class="sectionlabel">Советы</div><ul class="notelist">${a.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.template ? `<div class="sectionlabel">Шаблон</div><div class="template">${esc(a.template)}</div><div class="toolbar"><button class="btn primary" id="copytpl">Копировать шаблон</button><button class="btn" id="sharetpl">Отправить шаблон</button></div>` : ''}
    ${links.length ? `<div class="sectionlabel">Практики для этой сессии</div>${links.map(x => itemCard(x)).join('')}` : ''}
    <div class="notes"><div class="sectionlabel">Мои заметки к алгоритму</div><textarea id="note" placeholder="Ваши дополнения, удачные формулировки…">${esc(notes()[id] || '')}</textarea></div>
  </article>`;
  const plain = () => a.title + '\n\n' + (a.purpose || '') + '\n' + (a.duration ? 'Длительность: ' + a.duration + '\n' : '') + '\n' + a.steps.map(s => s.name + '\n' + (s.why ? 'Зачем: ' + s.why + '\n' : '') + (s.say || []).map(x => '— ' + x).join('\n') + ((s.say || []).length ? '\n' : '') + (s.ask || []).map(x => '• ' + x).join('\n') + ((s.ask || []).length ? '\n' : '') + (s.notes || []).map(x => '! ' + x).join('\n')).join('\n\n') + (a.template ? '\n\n' + a.template : '');
  $('#fav').onclick = () => { const on = toggleFav(id); $('#fav').classList.toggle('on', on); $('#fav span').textContent = on ? 'В избранном' : 'В избранное'; };
  $('#share').onclick = () => shareText(a.title, plain());
  $('#openall').onclick = () => document.querySelectorAll('details.step').forEach(d => d.open = true);
  $('#reset').onclick = () => { store.set('chk_' + id, {}); document.querySelectorAll('.ask input').forEach(c => c.checked = false); };
  if (!a.own) $('#dup').onclick = () => { const c = JSON.parse(JSON.stringify(a)); delete c._t; c.id = uid('u_a_'); c.title += ' (моя версия)'; c.own = true; const arr = store.get('ualg', []); arr.unshift(c); store.set('ualg', arr); rebuild(); location.hash = '#/edit/alg/' + c.id; };
  view.querySelectorAll('.ask input').forEach(c => c.onchange = () => { const ch = store.get('chk_' + id, {}); ch[c.dataset.k] = c.checked; store.set('chk_' + id, ch); });
  if (a.template) { $('#copytpl').onclick = () => copyText(a.template); $('#sharetpl').onclick = () => shareText(a.title, a.template); }
  let nh; $('#note').addEventListener('input', e => { clearTimeout(nh); nh = setTimeout(() => setNote(id, e.target.value), 400); });
}

/* ================= СВОИ ПРАКТИКИ ================= */
function viewEditPractice(id) {
  const arr = store.get('upr', []);
  const p = id ? arr.find(x => x.id === id) : { id: uid('u_p_'), t: '', txt: '', g: [] };
  if (!p) return viewNotFound();
  setTab(''); setTitle(id ? 'Редактирование практики' : 'Новая практика', true);
  let sel = new Set(p.g || []);
  const groups = {}; S.topics.forEach(t => (groups[t.g] = groups[t.g] || []).push(t));
  view.innerHTML = `<div class="form">
    <label class="fl">Название<input class="field" id="pt" value="${esc(p.t)}" placeholder="Например: «Письмо себе из будущего»"></label>
    <div class="fl">Темы <span class="small">(можно выбрать несколько)</span></div>
    <div class="chips" id="pg">${Object.values(groups).flat().map(t => `<button type="button" class="chip ${sel.has(t.id) ? 'on' : ''}" data-t="${t.id}">${esc(t.n)}</button>`).join('')}</div>
    <label class="fl">Описание и ход выполнения
      <textarea class="field big" id="px" placeholder="## Цель\nСнизить тревогу…\n\n## Ход выполнения\n1. Предложите клиенту…\n2. …\n\n## Вопросы\n- Что вы чувствуете?">${esc(p.txt)}</textarea></label>
    <p class="small">Подсказка: строка с «## » — заголовок раздела; «- » — пункт списка; «1. » — шаг.</p>
    <div class="toolbar"><button class="btn primary" id="save">Сохранить</button>${id ? `<button class="btn danger" id="del">${ICON.trash}Удалить</button>` : ''}<button class="btn" id="cancel">Отмена</button></div>
  </div>`;
  $('#pg').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on'); };
  $('#cancel').onclick = () => history.back();
  $('#save').onclick = () => {
    p.t = $('#pt').value.trim(); p.txt = $('#px').value; p.g = [...sel];
    if (!p.t) { toast('Введите название'); return; }
    const a = store.get('upr', []); const i = a.findIndex(x => x.id === p.id); if (i >= 0) a[i] = p; else a.unshift(p);
    if (store.set('upr', a)) { rebuild(); toast('Сохранено'); location.replace('#/item/' + p.id); }
  };
  if (id) $('#del').onclick = () => confirmBox('Удалить практику «' + p.t + '»?', 'Удалить', () => { store.set('upr', store.get('upr', []).filter(x => x.id !== id)); rebuild(); location.replace('#/mine'); });
}

/* ================= СВОИ АЛГОРИТМЫ ================= */
function viewEditAlg(id) {
  const arr = store.get('ualg', []);
  const a = id ? JSON.parse(JSON.stringify(arr.find(x => x.id === id) || null)) : { id: uid('u_a_'), title: '', cat: 'Мои алгоритмы', purpose: '', duration: '', steps: [{ name: '', why: '', say: [], ask: [], notes: [] }], after: [], tips: [], template: '', tags: [], links: [] };
  if (!a) return viewNotFound();
  setTab('algorithms'); setTitle(id ? 'Редактирование алгоритма' : 'Новый алгоритм', true);
  const cats = [...new Set(S.algs.map(x => x.cat))];
  const stepForm = (s, i) => `<div class="stepform" data-i="${i}">
      <div class="stephead"><b>Шаг ${i + 1}</b><span><button type="button" class="iconbtn" data-up="${i}" aria-label="Выше"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="iconbtn" data-rm="${i}" aria-label="Удалить шаг">${ICON.trash}</button></span></div>
      <input class="field" data-f="name" value="${esc(s.name)}" placeholder="Название шага, например «1. Контакт и рамка (5 мин)»">
      <textarea class="field" data-f="why" placeholder="Зачем этот шаг">${esc(s.why)}</textarea>
      <textarea class="field" data-f="say" placeholder="Что сказать — каждая фраза с новой строки">${esc((s.say || []).join('\n'))}</textarea>
      <textarea class="field" data-f="ask" placeholder="Вопросы клиенту — каждый с новой строки">${esc((s.ask || []).join('\n'))}</textarea>
      <textarea class="field" data-f="notes" placeholder="На что обратить внимание — с новой строки">${esc((s.notes || []).join('\n'))}</textarea>
    </div>`;
  const render = () => {
    view.innerHTML = `<div class="form">
      <label class="fl">Название<input class="field" id="at" value="${esc(a.title)}" placeholder="Например: «Сессия при ревности»"></label>
      <label class="fl">Раздел<input class="field" id="ac" list="cats" value="${esc(a.cat)}"><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="fl">Цель сессии<textarea class="field" id="ap">${esc(a.purpose)}</textarea></label>
      <label class="fl">Длительность<input class="field" id="ad" value="${esc(a.duration)}" placeholder="50–60 минут"></label>
      <div class="sectionlabel">Шаги</div>
      <div id="steps">${a.steps.map(stepForm).join('')}</div>
      <button type="button" class="more" id="addstep">+ Добавить шаг</button>
      <label class="fl">После сессии <span class="small">(с новой строки)</span><textarea class="field" id="aa">${esc((a.after || []).join('\n'))}</textarea></label>
      <label class="fl">Советы <span class="small">(с новой строки)</span><textarea class="field" id="atips">${esc((a.tips || []).join('\n'))}</textarea></label>
      <label class="fl">Шаблон (протокол, анкета, домашнее задание)<textarea class="field big mono" id="atpl">${esc(a.template || '')}</textarea></label>
      <label class="fl">Ключевые слова для поиска <span class="small">(через запятую)</span><input class="field" id="atags" value="${esc((a.tags || []).join(', '))}"></label>
      <div class="toolbar"><button class="btn primary" id="save">Сохранить</button>${id ? `<button class="btn danger" id="del">${ICON.trash}Удалить</button>` : ''}<button class="btn" id="cancel">Отмена</button></div>
    </div>`;
    $('#addstep').onclick = () => { collect(); a.steps.push({ name: '', why: '', say: [], ask: [], notes: [] }); render(); };
    $('#steps').onclick = e => {
      const rm = e.target.closest('[data-rm]'), up = e.target.closest('[data-up]');
      if (rm) { collect(); a.steps.splice(+rm.dataset.rm, 1); if (!a.steps.length) a.steps.push({ name: '', why: '', say: [], ask: [], notes: [] }); render(); }
      if (up && +up.dataset.up > 0) { collect(); const i = +up.dataset.up; [a.steps[i - 1], a.steps[i]] = [a.steps[i], a.steps[i - 1]]; render(); }
    };
    $('#cancel').onclick = () => history.back();
    $('#save').onclick = () => {
      collect();
      if (!a.title.trim()) { toast('Введите название'); return; }
      a.steps = a.steps.filter(s => s.name || s.why || s.say.length || s.ask.length || s.notes.length);
      const arr2 = store.get('ualg', []); const i = arr2.findIndex(x => x.id === a.id); if (i >= 0) arr2[i] = a; else arr2.unshift(a);
      if (store.set('ualg', arr2)) { rebuild(); toast('Сохранено'); location.replace('#/alg/' + a.id); }
    };
    if (id) $('#del').onclick = () => confirmBox('Удалить алгоритм «' + a.title + '»?', 'Удалить', () => { store.set('ualg', store.get('ualg', []).filter(x => x.id !== id)); rebuild(); location.replace('#/algorithms'); });
  };
  const collect = () => {
    a.title = $('#at').value.trim(); a.cat = $('#ac').value.trim() || 'Мои алгоритмы'; a.purpose = $('#ap').value.trim(); a.duration = $('#ad').value.trim();
    a.after = lines($('#aa').value); a.tips = lines($('#atips').value); a.template = $('#atpl').value; a.tags = $('#atags').value.split(',').map(s => s.trim()).filter(Boolean);
    a.steps = [...document.querySelectorAll('.stepform')].map(f => { const g = k => f.querySelector(`[data-f="${k}"]`).value; return { name: g('name').trim(), why: g('why').trim(), say: lines(g('say')), ask: lines(g('ask')), notes: lines(g('notes')) }; });
  };
  render();
}

/* ================= ЖУРНАЛ КОНСУЛЬТАЦИЙ, КЛИЕНТЫ, ФИНАНСЫ ================= */
const journal = () => store.get('journal', []);
const sortJ = arr => arr.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
const CUR = { RUB: '₽', EUR: '€', USD: '$', BGN: 'лв', GBP: '£', KZT: '₸', UAH: '₴', BYN: 'Br', GEL: '₾', AMD: '֏', TRY: '₺', ILS: '₪', AED: 'AED', PLN: 'zł', CZK: 'Kč', RSD: 'дин', CHF: 'CHF', CAD: 'C$', UZS: 'сум', KGS: 'сом', AZN: '₼', MDL: 'лей', THB: '฿', CNY: '¥' };
const CUR_NAMES = { RUB: 'Рубль', EUR: 'Евро', USD: 'Доллар США', BGN: 'Болгарский лев', GBP: 'Фунт', KZT: 'Тенге', UAH: 'Гривна', BYN: 'Бел. рубль', GEL: 'Лари', AMD: 'Драм', TRY: 'Турецкая лира', ILS: 'Шекель', AED: 'Дирхам ОАЭ', PLN: 'Злотый', CZK: 'Чешская крона', RSD: 'Сербский динар', CHF: 'Франк', CAD: 'Канадский доллар', UZS: 'Узб. сум', KGS: 'Сом', AZN: 'Манат', MDL: 'Молд. лей', THB: 'Бат', CNY: 'Юань' };
const PAY = { paid: 'Оплачено', unpaid: 'Не оплачено', package: 'Из пакета', free: 'Бесплатно' };
const TARIFF = { regular: 'Обычный', discount: 'Со скидкой', free: 'Бесплатный' };
/* отмены: кто отменил; оплата отменённой сессии (по умолчанию — без оплаты) */
const CANCEL = { client: 'Отменена клиентом', psy: 'Отменена психологом' };
const PAY_CX = { none: 'Без оплаты', paid: 'Оплачено', unpaid: 'Не оплачено', package: 'Списать из пакета' };
const CX_REASONS = ['Болезнь', 'Забыл(а) о встрече', 'Не пришёл(ла) без предупреждения', 'Работа / командировка', 'Семейные обстоятельства', 'Технические проблемы связи', 'Финансовые причины', 'Перенос на другую дату', 'Болезнь психолога', 'Отпуск психолога', 'Форс-мажор'];
const held = arr => arr.filter(e => !e.cancel);
const cxOf = arr => arr.filter(e => e.cancel);
function cxTag(e) { return e.cancel ? `<span class="paytag cx">${CANCEL[e.cancel] || 'Отменена'}</span>` : ''; }
function cxLine(e) { return e.cancel ? `<p class="cxr">✕ ${CANCEL[e.cancel]}${e.cancelReason ? ': ' + esc(e.cancelReason) : ''}</p>` : ''; }
function cxSummary(arr) { const c = cxOf(arr), a = c.filter(e => e.cancel === 'client').length; return c.length ? `${c.length} (клиент ${a} · психолог ${c.length - a})` : '0'; }
const defCur = () => store.get('settings', {}).cur || 'RUB';
const defPrice = () => +(store.get('settings', {}).price || 0);
const money = (n, c) => (Math.round((+n || 0) * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + (CUR[c] || c || '');
const curOptions = sel => Object.keys(CUR).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${CUR[k]} ${k} — ${CUR_NAMES[k]}</option>`).join('');
const clientsDb = () => store.get('clients', {});
const getClient = name => Object.assign({ mode: 'regular', price: defPrice(), cur: defCur(), disc: 0, phone: '', tg: '', note: '' }, clientsDb()[name] || {});
function saveClient(name, data) { const c = clientsDb(); c[name] = data; store.set('clients', c); }
const packages = () => store.get('packages', []);
const ymd = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
function periodRange(p) {
  const d = parseD(today());
  if (p === 'month') return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (p === 'prev') return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
  if (p === 'year') return [d.getFullYear() + '-01-01', d.getFullYear() + '-12-31'];
  return ['', ''];
}
const allClientNames = () => [...new Set([...journal().map(e => e.client), ...Object.keys(clientsDb()), ...packages().map(p => p.client)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
/* баланс пакета клиента: куплено сессий − списано */
function pkgBalance(name) {
  const bought = packages().filter(p => p.client === name).reduce((a, p) => a + (+p.count || 0), 0);
  const used = journal().filter(e => e.client === name && e.pay === 'package').length;
  return { bought, used, left: bought - used };
}
/* долги: неоплаченные сессии */
function debts(name) {
  const list = journal().filter(e => e.pay === 'unpaid' && (!name || e.client === name)).sort((a, b) => a.date.localeCompare(b.date));
  const byCur = {}; list.forEach(e => byCur[e.cur || defCur()] = (byCur[e.cur || defCur()] || 0) + (+e.price || 0));
  return { list, byCur };
}
const sumText = byCur => Object.entries(byCur).filter(([, v]) => v).map(([c, v]) => money(v, c)).join(' + ') || '0';
/* все поступления: оплаченные сессии (по дате оплаты) + покупки пакетов */
function receipts(from, to, name) {
  const r = [];
  journal().forEach(e => { if (e.pay === 'paid' && +e.price) r.push({ date: e.paidDate || e.date, client: e.client, kind: (e.cancel ? 'Отмена ' : 'Сессия ') + dateShort(e.date), amount: +e.price, cur: e.cur || defCur(), ref: '#/journal/edit/' + e.id }); });
  packages().forEach(p => { if (+p.amount) r.push({ date: p.date, client: p.client, kind: `Пакет ${p.count} ${plural(+p.count, ['сессия', 'сессии', 'сессий'])}`, amount: +p.amount, cur: p.cur || defCur(), ref: '#/client/' + encodeURIComponent(p.client) }); });
  return r.filter(x => (!from || x.date >= from) && (!to || x.date <= to) && (!name || x.client === name)).sort((a, b) => b.date.localeCompare(a.date));
}
function payTag(e) {
  if (!e.pay || e.pay === 'none') return '';
  const cls = { paid: 'ok', unpaid: 'debt', package: 'pkg', free: 'free' }[e.pay];
  const amt = e.pay === 'free' ? '' : e.pay === 'package' ? '' : (+e.price ? money(e.price, e.cur) + ' · ' : '');
  return `<span class="paytag ${cls}">${amt}${PAY[e.pay]}</span>`;
}
function journalNav(active) {
  const d = debts().list.length;
  return `<div class="segnav"><a href="#/journal" class="${active === 'j' ? 'on' : ''}">Записи</a><a href="#/clients" class="${active === 'c' ? 'on' : ''}">Клиенты</a><a href="#/finance" class="${active === 'f' ? 'on' : ''}">Финансы${d ? ` <span class="badge">${d}</span>` : ''}</a></div>`;
}

/* ---------- список записей ---------- */
function viewJournal(qs) {
  setTab('journal'); setTitle('Журнал консультаций', false);
  const p = new URLSearchParams(qs || '');
  const f = { q: p.get('q') || '', from: p.get('from') || '', to: p.get('to') || '', pay: p.get('pay') || '' };
  view.innerHTML = journalNav('j') + `
    <div class="toolbar"><a class="btn primary" href="#/journal/new">${ICON.plus}Новая запись</a><button class="btn" id="exp">${ICON.share}Выгрузить в Word / PDF</button></div>
    <div class="searchbox small"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="jq" type="search" placeholder="Поиск: клиент, запрос, техника…" value="${esc(f.q)}"></div>
    <div class="period"><label>с <input type="date" id="jf" value="${f.from}"></label><label>по <input type="date" id="jt" value="${f.to}"></label><button class="chip" id="jm">Этот месяц</button><button class="chip" id="ja">Всё</button></div>
    <div class="chips" id="jpay">${[['', 'Все'], ['paid', 'Оплачено'], ['unpaid', 'Не оплачено'], ['package', 'Из пакета'], ['free', 'Бесплатно'], ['cancel', 'Отменённые']].map(([k, n]) => `<button class="chip ${k === 'cancel' ? 'cxchip ' : ''}${f.pay === k ? 'on' : ''}" data-pay="${k}">${n}</button>`).join('')}</div>
    <div id="jlist"></div>`;
  let payF = f.pay;
  const render = () => {
    const q = norm($('#jq').value.trim()), from = $('#jf').value, to = $('#jt').value;
    const list = sortJ(journal()).filter(e => (!from || e.date >= from) && (!to || e.date <= to) && (!payF || (payF === 'cancel' ? !!e.cancel : e.pay === payF)) && (!q || norm([e.client, e.topic, e.tech, e.note, e.cancelReason].join(' ')).includes(q)));
    const clients = new Set(list.map(e => e.client).filter(Boolean));
    const nh = held(list).length, nc = list.length - nh;
    let html = `<p class="small">${nh} ${plural(nh, ['консультация', 'консультации', 'консультаций'])}${nc ? ` · <b class="debt">отменено ${nc}</b>` : ''}${clients.size ? `, ${clients.size} ${plural(clients.size, ['клиент', 'клиента', 'клиентов'])}` : ''}</p>`;
    let cur = '';
    list.forEach(e => {
      if (e.date !== cur) { cur = e.date; html += `<div class="sectionlabel">${dateLong(e.date)}, ${weekday(e.date)}</div>`; }
      html += `<a class="card jcard${e.cancel ? ' cancelled' : ''}" href="#/journal/edit/${e.id}"><div class="jtop"><span class="jtime">${esc(e.time || '—')}</span><b>${esc(e.client || 'Без имени')}</b>${cxTag(e)}${payTag(e)}</div>
        ${cxLine(e)}${e.topic ? `<p><span class="jl">Запрос:</span> ${esc(e.topic)}</p>` : ''}${e.tech ? `<p><span class="jl">Техники:</span> ${esc(e.tech)}</p>` : ''}${e.note ? `<p class="jnote">${esc(e.note)}</p>` : ''}</a>`;
    });
    if (!list.length) html += `<div class="empty">${journal().length ? 'Нет записей по выбранным условиям.' : 'Журнал пуст. Нажмите «Новая запись», чтобы внести первую консультацию.'}</div>`;
    $('#jlist').innerHTML = html;
    const qs2 = new URLSearchParams(); if ($('#jq').value) qs2.set('q', $('#jq').value); if (from) qs2.set('from', from); if (to) qs2.set('to', to); if (payF) qs2.set('pay', payF);
    history.replaceState(null, '', '#/journal' + (qs2.toString() ? '?' + qs2 : ''));
  };
  $('#jq').oninput = render; $('#jf').onchange = render; $('#jt').onchange = render;
  $('#jpay').onclick = e => { const b = e.target.closest('[data-pay]'); if (!b) return; payF = b.dataset.pay; document.querySelectorAll('#jpay .chip').forEach(x => x.classList.toggle('on', x === b)); render(); };
  $('#jm').onclick = () => { const [a, b] = periodRange('month'); $('#jf').value = a; $('#jt').value = b; render(); };
  $('#ja').onclick = () => { $('#jf').value = ''; $('#jt').value = ''; $('#jq').value = ''; render(); };
  $('#exp').onclick = () => exportSheet($('#jf').value, $('#jt').value, $('#jq').value);
  render();
}
function plural(n, f) { n = Math.abs(n); const m10 = n % 10, m100 = n % 100; return f[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 1 : 2]; }

/* ---------- запись консультации ---------- */
function viewJournalEdit(id, qs) {
  const arr = journal();
  const p = new URLSearchParams(qs || '');
  const isNew = !id;
  const e = id ? arr.find(x => x.id === id) : { id: uid('j_'), date: today(), time: nowTime(), client: p.get('client') || '', topic: '', tech: p.get('tech') || '', note: '', price: '', cur: defCur(), pay: 'paid', paidDate: '' };
  if (!e) return viewNotFound();
  if (!e.cur) e.cur = defCur();
  if (!e.pay) e.pay = e.cancel ? 'none' : 'paid';
  setTab('journal'); setTitle(id ? 'Запись консультации' : 'Новая консультация', true);
  const clients = allClientNames();
  const topicsList = [...new Set([...arr.map(x => x.topic).filter(Boolean), ...S.topics.map(t => t.n)])];
  view.innerHTML = `<div class="form">
    ${e.cancel ? `<div class="cxbanner">✕ ${CANCEL[e.cancel]}${e.cancelReason ? ' — ' + esc(e.cancelReason) : ''}</div>` : ''}
    <div class="row2"><label class="fl">Дата<input class="field" type="date" id="jd" value="${e.date}"></label><label class="fl">Время<input class="field" type="time" id="jtm" value="${esc(e.time)}"></label></div>
    <p class="wd" id="jwd">${e.date ? weekday(e.date) : ''}</p>
    <label class="fl">Клиент (имя или код)<input class="field" id="jc" list="clist" value="${esc(e.client)}" placeholder="Например: Анна К. или К-017"><datalist id="clist">${clients.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <p class="small" id="cinfo"></p>
    <label class="fl">Запрос / тема консультации<input class="field" id="jtp" list="tlist" value="${esc(e.topic)}" placeholder="Например: тревога перед выступлениями"><datalist id="tlist">${topicsList.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="fl">Техники<textarea class="field" id="jte" placeholder="Какие техники и практики использовали">${esc(e.tech)}</textarea></label>
    <div class="toolbar"><button class="btn" id="pick">${ICON.plus}Добавить технику из библиотеки</button></div>
    <div class="cxbox${e.cancel ? ' on' : ''}" id="cxbox">
      <div class="lbl">Сессия</div>
      <div class="seg" id="jst"><button type="button" data-s="" class="${!e.cancel ? 'on' : ''}">Состоялась</button><button type="button" data-s="client" class="${e.cancel === 'client' ? 'on' : ''}">Отменена клиентом</button><button type="button" data-s="psy" class="${e.cancel === 'psy' ? 'on' : ''}">Отменена психологом</button></div>
      <label class="fl" id="cxrow">Причина отмены<input class="field" id="jcx" list="cxlist" value="${esc(e.cancelReason || '')}" placeholder="Например: болезнь, забыл(а), перенос"><datalist id="cxlist">${CX_REASONS.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
    </div>
    <label class="fl">Заметка<textarea class="field big" id="jn" placeholder="Ключевые моменты, инсайты, домашнее задание, план на следующую встречу">${esc(e.note)}</textarea></label>
    <div class="paybox">
      <div class="lbl">Оплата</div>
      <div class="seg" id="jpay"></div>
      <div class="row2" id="pricerow"><label class="fl">Стоимость<input class="field" type="number" inputmode="decimal" min="0" step="any" id="jpr" value="${esc(e.price)}" placeholder="0"></label><label class="fl">Валюта<select class="field" id="jcur">${curOptions(e.cur)}</select></label></div>
      <label class="fl" id="pdrow">Дата оплаты<input class="field" type="date" id="jpd" value="${e.paidDate || e.date}"></label>
      <p class="small" id="payhint"></p>
    </div>
    <div class="toolbar"><button class="btn primary" id="save">Сохранить</button>${id ? `<button class="btn" id="copyj">${ICON.copy}Следующая встреча</button><button class="btn danger" id="del">${ICON.trash}Удалить</button>` : ''}<button class="btn" id="cancel">Отмена</button></div>
    ${id && e.client ? `<div class="toolbar"><a class="btn" href="#/client/${encodeURIComponent(e.client)}">Карточка клиента</a></div><div class="sectionlabel">Другие консультации клиента</div>${sortJ(arr).filter(x => x.client === e.client && x.id !== e.id).slice(0, 10).map(x => `<a class="card jcard${x.cancel ? ' cancelled' : ''}" href="#/journal/edit/${x.id}"><div class="jtop"><span class="jtime">${dateShort(x.date)}</span><b>${esc(x.topic || 'без темы')}</b>${cxTag(x)}${payTag(x)}</div>${x.tech ? `<p>${esc(x.tech)}</p>` : ''}</a>`).join('') || '<p class="small">Это первая запись.</p>'}` : ''}
  </div>`;
  let pay = e.pay, cx = e.cancel || '';
  const syncPay = () => {
    const opts = cx ? PAY_CX : PAY;
    if (!opts[pay]) pay = cx ? 'none' : 'paid';
    $('#jpay').innerHTML = Object.entries(opts).map(([k, n]) => `<button type="button" data-p="${k}" class="${pay === k ? 'on' : ''}">${n}</button>`).join('');
    $('#cxbox').classList.toggle('on', !!cx); $('#cxrow').hidden = !cx;
    document.querySelectorAll('#jst button').forEach(b => b.classList.toggle('on', b.dataset.s === cx));
    $('#pricerow').hidden = pay === 'free' || pay === 'package' || pay === 'none';
    $('#pdrow').hidden = pay !== 'paid';
    const name = $('#jc').value.trim();
    let hint = '';
    if (pay === 'package') { const b = pkgBalance(name); const left = b.left - (e.pay === 'package' && !isNew ? 0 : 1); hint = name ? (b.bought ? `После этой сессии в пакете останется: ${left} ${plural(left, ['сессия', 'сессии', 'сессий'])}${left < 0 ? ' — пакет исчерпан, добавьте новый в карточке клиента' : ''}.` : 'У клиента нет пакета. Добавьте пакет в карточке клиента.') : ''; }
    if (pay === 'unpaid') hint = 'Сессия попадёт в «Долги» (Финансы), клиенту можно отправить напоминание.';
    if (pay === 'free') hint = 'Бесплатная сессия не учитывается в поступлениях.';
    if (cx && pay === 'none') hint = cx === 'client' ? 'Отмена без оплаты. Если по вашим правилам поздняя отмена оплачивается — выберите «Оплачено» или «Не оплачено» (попадёт в долги), либо «Списать из пакета».' : 'Отмена психологом — без оплаты.';
    else if (cx && pay === 'unpaid') hint = 'Оплата за отмену попадёт в «Долги», клиенту можно отправить напоминание.';
    $('#payhint').textContent = hint;
  };
  const clientInfo = (autofill) => {
    const name = $('#jc').value.trim(); if (!name) { $('#cinfo').innerHTML = ''; return; }
    const c = getClient(name), b = pkgBalance(name), d = debts(name);
    const parts = [];
    if (clientsDb()[name]) parts.push('Тариф: ' + TARIFF[c.mode] + (c.mode === 'discount' ? ` ${c.disc}%` : ''));
    if (b.bought) parts.push(`пакет: осталось ${b.left}`);
    if (d.list.length) parts.push(`<b class="debt">долг: ${sumText(d.byCur)}</b>`);
    $('#cinfo').innerHTML = parts.length ? parts.join(' · ') + ` · <a href="#/client/${encodeURIComponent(name)}">карточка</a>` : (allClientNames().includes(name) ? '' : 'Новый клиент — настройки тарифа можно задать в его карточке (Журнал → Клиенты).');
    if (autofill) {
      if (cx) { /* для отменённой сессии статус оплаты не меняем, только цену */ }
      else if (c.mode === 'free') pay = 'free';
      else if (b.left > 0) pay = 'package';
      else pay = 'paid';
      const base = +c.price || defPrice();
      $('#jpr').value = c.mode === 'discount' ? Math.round(base * (1 - (+c.disc || 0) / 100) * 100) / 100 : (base || '');
      $('#jcur').value = c.cur || defCur();
      syncPay();
    }
  };
  $('#jpay').onclick = ev => { const b = ev.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; syncPay(); };
  $('#jst').onclick = ev => { const b = ev.target.closest('[data-s]'); if (!b) return; const was = cx; cx = b.dataset.s; if (cx && !was) pay = 'none'; else if (!cx && was) { pay = 'paid'; clientInfo(true); } syncPay(); };
  $('#jc').addEventListener('change', () => clientInfo(true));
  $('#jd').onchange = () => { $('#jwd').textContent = $('#jd').value ? weekday($('#jd').value) : ''; if (pay === 'paid' && isNew) $('#jpd').value = $('#jd').value; };
  clientInfo(isNew && !!e.client); syncPay();
  if (isNew && !e.client) { $('#jpr').value = defPrice() || ''; }
  $('#cancel').onclick = () => history.back();
  $('#pick').onclick = () => pickTechnique(t => { const v = $('#jte').value.trim(); $('#jte').value = v ? v + '; ' + t : t; });
  $('#save').onclick = () => {
    const x = { id: e.id, date: $('#jd').value || today(), time: $('#jtm').value, client: $('#jc').value.trim(), topic: $('#jtp').value.trim(), tech: $('#jte').value.trim(), note: $('#jn').value.trim(),
      pay, price: (pay === 'free' || pay === 'package' || pay === 'none') ? 0 : (+$('#jpr').value || 0), cur: $('#jcur').value, paidDate: pay === 'paid' ? ($('#jpd').value || $('#jd').value) : '',
      cancel: cx, cancelReason: cx ? $('#jcx').value.trim() : '' };
    const a = journal(); const i = a.findIndex(y => y.id === x.id); if (i >= 0) a[i] = x; else a.push(x);
    if (store.set('journal', a)) { toast('Запись сохранена'); location.replace('#/journal'); }
  };
  if (id) {
    $('#del').onclick = () => confirmBox('Удалить эту запись журнала?', 'Удалить', () => { store.set('journal', journal().filter(x => x.id !== id)); location.replace('#/journal'); });
    $('#copyj').onclick = () => { location.hash = '#/journal/new?client=' + encodeURIComponent(e.client); };
  }
}
function pickTechnique(onPick) {
  sheet(`<h3 class="sheettitle">Техника из библиотеки</h3><div class="searchbox"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="pq" type="search" placeholder="Название или тема"></div><div id="pres" class="pres"></div>`,
    (el, close) => {
      const inp = el.querySelector('#pq'), box = el.querySelector('#pres');
      const show = () => {
        const q = inp.value.trim();
        const fv = favs().map(id => S.byId[id] || S.algById[id]).filter(Boolean);
        const res = q ? [...search(q).algs.slice(0, 3), ...search(q).items.slice(0, 30)] : fv;
        box.innerHTML = (q ? '' : '<p class="small">Избранное (или начните вводить название):</p>') + res.map(x => `<button class="pickrow" data-t="${esc(x.title || x.t)}">${esc(x.title || x.t)}</button>`).join('') || '<p class="small">Ничего не найдено</p>';
      };
      let h; inp.oninput = () => { clearTimeout(h); h = setTimeout(show, 200); };
      box.onclick = e => { const b = e.target.closest('[data-t]'); if (b) { onPick(b.dataset.t); close(); } };
      show(); setTimeout(() => inp.focus(), 50);
    });
}

/* ---------- клиенты ---------- */
function viewClients() {
  setTab('journal'); setTitle('Клиенты', false);
  const names = allClientNames();
  view.innerHTML = journalNav('c') + `<div class="toolbar"><button class="btn primary" id="addc">${ICON.plus}Новый клиент</button></div>
    <div class="searchbox small"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="cq" type="search" placeholder="Поиск клиента"></div><div id="clist"></div>`;
  const render = () => {
    const q = norm($('#cq').value.trim());
    const rows = names.filter(n => !q || norm(n).includes(q)).map(n => {
      const c = getClient(n), all = journal().filter(e => e.client === n), js = held(all), ncx = all.length - js.length, last = sortJ(js)[0], b = pkgBalance(n), d = debts(n);
      return `<a class="card jcard" href="#/client/${encodeURIComponent(n)}"><div class="jtop"><b>${esc(n)}</b>${clientsDb()[n] && c.mode !== 'regular' ? `<span class="paytag ${c.mode === 'free' ? 'free' : 'pkg'}">${TARIFF[c.mode]}${c.mode === 'discount' ? ' ' + c.disc + '%' : ''}</span>` : ''}${d.list.length ? `<span class="paytag debt">долг ${sumText(d.byCur)}</span>` : ''}</div>
        <p>${js.length} ${plural(js.length, ['сессия', 'сессии', 'сессий'])}${ncx ? ` · <span class="debt">отмен ${ncx}</span>` : ''}${last ? ' · последняя ' + dateShort(last.date) : ''}${b.bought ? ` · пакет: осталось ${b.left}` : ''}</p></a>`;
    });
    $('#clist').innerHTML = rows.join('') || '<div class="empty">Клиенты появятся здесь после первой записи в журнале или кнопкой «Новый клиент».</div>';
  };
  $('#cq').oninput = render; render();
  $('#addc').onclick = () => sheet(`<h3 class="sheettitle">Новый клиент</h3><input id="cn" class="field" placeholder="Имя или код клиента"><div class="sheetbar"><button class="btn primary" id="ok">Создать</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => { el.querySelector('#cn').focus(); el.querySelector('#ok').onclick = () => { const n = el.querySelector('#cn').value.trim(); if (!n) return; if (!clientsDb()[n]) saveClient(n, getClient(n)); close(); location.hash = '#/client/' + encodeURIComponent(n); }; });
}
function viewClient(name) {
  setTab('journal'); setTitle(name, true);
  const c = getClient(name);
  const jsAll = sortJ(journal().filter(e => e.client === name)), js = held(jsAll), jcx = cxOf(jsAll);
  const b = pkgBalance(name), d = debts(name);
  const paid = {}; receipts('', '', name).forEach(r => paid[r.cur] = (paid[r.cur] || 0) + r.amount);
  const cnt = k => js.filter(e => e.pay === k).length;
  const pk = packages().filter(p => p.client === name).sort((a, b2) => b2.date.localeCompare(a.date));
  view.innerHTML = `
    <div class="statgrid">
      <div class="stat"><span>Сессий</span><b>${js.length}</b><small>оплач. ${cnt('paid')} · пакет ${cnt('package')} · беспл. ${cnt('free')}</small></div>
      <div class="stat"><span>Оплачено всего</span><b>${sumText(paid)}</b></div>
      <div class="stat ${d.list.length ? 'bad' : ''}"><span>Долг</span><b>${d.list.length ? sumText(d.byCur) : 'нет'}</b>${d.list.length ? `<small>${d.list.length} ${plural(d.list.length, ['сессия', 'сессии', 'сессий'])}</small>` : ''}</div>
      <div class="stat"><span>Пакет</span><b>${b.bought ? `осталось ${b.left}` : 'нет'}</b>${b.bought ? `<small>куплено ${b.bought} · списано ${b.used}</small>` : ''}</div>
      ${jcx.length ? `<div class="stat cx"><span>Отменено</span><b>${jcx.length}</b><small>клиентом ${jcx.filter(e => e.cancel === 'client').length} · психологом ${jcx.filter(e => e.cancel === 'psy').length}</small></div>` : ''}
    </div>
    <div class="toolbar"><a class="btn primary" href="#/journal/new?client=${encodeURIComponent(name)}">${ICON.plus}Новая запись</a>${d.list.length ? `<button class="btn" id="remind">Напомнить об оплате</button><button class="btn" id="payall">Отметить долг оплаченным</button>` : ''}<button class="btn" id="addpk">${ICON.plus}Пакет</button></div>
    <div class="setting"><h3>Тариф и контакты</h3><div class="form">
      <div class="seg" id="cmode">${Object.entries(TARIFF).map(([k, n]) => `<button type="button" data-m="${k}" class="${c.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="row2"><label class="fl">Стоимость сессии<input class="field" type="number" inputmode="decimal" min="0" step="any" id="cp" value="${esc(c.price)}"></label><label class="fl">Валюта<select class="field" id="cc">${curOptions(c.cur)}</select></label></div>
      <label class="fl" id="cdrow">Скидка, %<input class="field" type="number" inputmode="decimal" min="0" max="100" id="cd" value="${esc(c.disc)}"></label>
      <p class="small" id="cfinal"></p>
      <div class="row2"><label class="fl">WhatsApp / телефон<input class="field" type="tel" id="cph" value="${esc(c.phone)}" placeholder="+7 900 000-00-00"></label><label class="fl">Telegram<input class="field" id="ctg" value="${esc(c.tg)}" placeholder="@username"></label></div>
      <label class="fl">Заметка о клиенте<textarea class="field" id="cnote" placeholder="Договорённости, график, особенности оплаты">${esc(c.note)}</textarea></label>
      <div class="toolbar"><button class="btn primary" id="csave">Сохранить</button><button class="btn" id="cren">${ICON.edit}Переименовать</button></div>
    </div></div>
    ${pk.length ? `<div class="sectionlabel">Пакеты</div>${pk.map(p => `<div class="card jcard"><div class="jtop"><span class="jtime">${dateShort(p.date)}</span><b>${p.count} ${plural(+p.count, ['сессия', 'сессии', 'сессий'])}</b><span class="paytag ok">${money(p.amount, p.cur)}</span><button class="iconbtn" data-delpk="${p.id}" aria-label="Удалить пакет">${ICON.trash}</button></div>${p.note ? `<p>${esc(p.note)}</p>` : ''}</div>`).join('')}` : ''}
    <div class="sectionlabel">Консультации</div>
    ${jsAll.map(x => `<a class="card jcard${x.cancel ? ' cancelled' : ''}" href="#/journal/edit/${x.id}"><div class="jtop"><span class="jtime">${dateShort(x.date)}</span><b>${esc(x.topic || 'без темы')}</b>${cxTag(x)}${payTag(x)}</div>${cxLine(x)}${x.tech ? `<p>${esc(x.tech)}</p>` : ''}</a>`).join('') || '<p class="small">Консультаций пока нет.</p>'}`;
  let mode = c.mode;
  const upd = () => {
    document.querySelectorAll('#cmode button').forEach(x => x.classList.toggle('on', x.dataset.m === mode));
    $('#cdrow').hidden = mode !== 'discount';
    const base = +$('#cp').value || 0, cur = $('#cc').value;
    $('#cfinal').textContent = mode === 'free' ? 'Все сессии клиента будут отмечаться как бесплатные.' : mode === 'discount' ? `Стоимость со скидкой: ${money(base * (1 - (+$('#cd').value || 0) / 100), cur)}` : base ? `Стоимость сессии: ${money(base, cur)}` : '';
  };
  $('#cmode').onclick = ev => { const x = ev.target.closest('[data-m]'); if (!x) return; mode = x.dataset.m; upd(); };
  ['#cp', '#cd', '#cc'].forEach(s => $(s).oninput = upd); upd();
  $('#csave').onclick = () => { saveClient(name, { mode, price: +$('#cp').value || 0, cur: $('#cc').value, disc: +$('#cd').value || 0, phone: $('#cph').value.trim(), tg: $('#ctg').value.trim(), note: $('#cnote').value.trim() }); toast('Сохранено'); viewClient(name); };
  $('#cren').onclick = () => sheet(`<h3 class="sheettitle">Переименовать клиента</h3><input id="cn" class="field" value="${esc(name)}"><p class="small">Имя изменится во всех записях журнала и пакетах.</p><div class="sheetbar"><button class="btn primary" id="ok">Сохранить</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => el.querySelector('#ok').onclick = () => {
      const n = el.querySelector('#cn').value.trim(); if (!n || n === name) { close(); return; }
      store.set('journal', journal().map(x => x.client === name ? { ...x, client: n } : x));
      store.set('packages', packages().map(x => x.client === name ? { ...x, client: n } : x));
      const db = clientsDb(); if (db[name]) { db[n] = db[name]; delete db[name]; store.set('clients', db); }
      close(); location.replace('#/client/' + encodeURIComponent(n));
    });
  $('#addpk').onclick = () => packageSheet(name);
  view.querySelectorAll('[data-delpk]').forEach(x => x.onclick = () => confirmBox('Удалить этот пакет?', 'Удалить', () => { store.set('packages', packages().filter(p => p.id !== x.dataset.delpk)); viewClient(name); }));
  if (d.list.length) {
    $('#remind').onclick = () => remindSheet(name);
    $('#payall').onclick = () => markPaid(d.list.map(e => e.id), () => viewClient(name));
  }
}
function packageSheet(name) {
  const c = getClient(name);
  sheet(`<h3 class="sheettitle">Оплата пакета · ${esc(name)}</h3>
    <div class="row2"><label class="fl">Дата оплаты<input class="field" type="date" id="pd" value="${today()}"></label><label class="fl">Сессий в пакете<input class="field" type="number" min="1" id="pn" value="5"></label></div>
    <div class="row2"><label class="fl">Сумма пакета<input class="field" type="number" inputmode="decimal" min="0" step="any" id="pa" value="${(+c.price || defPrice()) * 5 || ''}"></label><label class="fl">Валюта<select class="field" id="pc">${curOptions(c.cur)}</select></label></div>
    <label class="fl">Комментарий<input class="field" id="pnote" placeholder="Например: скидка 10% за пакет"></label>
    <p class="small">Сумма пакета учитывается в поступлениях на дату оплаты. Сессии с отметкой «Из пакета» списываются автоматически.</p>
    <div class="sheetbar"><button class="btn primary" id="ok">Сохранить пакет</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => {
      el.querySelector('#pn').oninput = () => { const pr = +c.price || defPrice(); if (pr) el.querySelector('#pa').value = pr * (+el.querySelector('#pn').value || 0); };
      el.querySelector('#ok').onclick = () => {
        const p = { id: uid('pk_'), client: name, date: el.querySelector('#pd').value || today(), count: +el.querySelector('#pn').value || 1, amount: +el.querySelector('#pa').value || 0, cur: el.querySelector('#pc').value, note: el.querySelector('#pnote').value.trim() };
        const a = packages(); a.push(p); store.set('packages', a); close(); toast('Пакет добавлен'); route();
      };
    });
}
function markPaid(ids, done) {
  sheet(`<h3 class="sheettitle">Отметить оплату</h3><label class="fl">Дата оплаты<input class="field" type="date" id="md" value="${today()}"></label><div class="sheetbar"><button class="btn primary" id="ok">Оплачено</button><button class="btn" data-close>Отмена</button></div>`,
    (el, close) => el.querySelector('#ok').onclick = () => {
      const dt = el.querySelector('#md').value || today();
      store.set('journal', journal().map(e => ids.includes(e.id) ? { ...e, pay: 'paid', paidDate: dt } : e));
      close(); toast('Оплата отмечена'); done && done();
    });
}
function reminderText(name) {
  const d = debts(name);
  const lines = d.list.map(e => `• ${dateShort(e.date)} — ${money(e.price, e.cur)}${e.cancel ? ' (поздняя отмена)' : ''}`);
  return `Здравствуйте! Мягко напоминаю об оплате ${d.list.length > 1 ? 'консультаций' : 'консультации'}:\n${lines.join('\n')}\nИтого к оплате: ${sumText(d.byCur)}.\nСпасибо! Если оплата уже прошла — пожалуйста, не обращайте внимания на это сообщение.`;
}
function remindSheet(name) {
  const c = getClient(name);
  const digits = (c.phone || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
  const tg = (c.tg || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  sheet(`<h3 class="sheettitle">Напоминание об оплате · ${esc(name)}</h3>
    <textarea class="field big" id="rt">${esc(reminderText(name))}</textarea>
    <div class="sheetbar">
      ${digits ? `<button class="btn primary" id="rwa">WhatsApp</button>` : ''}
      ${tg ? `<button class="btn primary" id="rtg">Telegram</button>` : ''}
      <button class="btn" id="rsh">${ICON.share}Отправить…</button><button class="btn" id="rcp">${ICON.copy}Копировать</button>
    </div>
    ${!digits && !tg ? '<p class="small">Добавьте клиенту телефон или Telegram в карточке, чтобы открывать чат одной кнопкой.</p>' : ''}
    ${tg ? '<p class="small">Для Telegram текст копируется автоматически — вставьте его в открывшийся чат.</p>' : ''}`,
    (el) => {
      const txt = () => el.querySelector('#rt').value;
      if (digits) el.querySelector('#rwa').onclick = () => window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(txt()), '_blank');
      if (tg) el.querySelector('#rtg').onclick = async () => { try { await navigator.clipboard.writeText(txt()); toast('Текст скопирован'); } catch (e) { } window.open('https://t.me/' + tg, '_blank'); };
      el.querySelector('#rsh').onclick = () => shareText('Напоминание об оплате', txt());
      el.querySelector('#rcp').onclick = () => copyText(txt());
    });
}

/* ---------- финансы и аналитика ---------- */
function viewFinance(qs) {
  setTab('journal'); setTitle('Финансы', false);
  const p = new URLSearchParams(qs || '');
  let per = p.get('p') || 'month';
  let [from, to] = per === 'custom' ? [p.get('from') || '', p.get('to') || ''] : periodRange(per);
  const render = () => {
    const rc = receipts(from, to);
    const byCur = {}; rc.forEach(r => { const x = byCur[r.cur] = byCur[r.cur] || { total: 0, sess: 0, pkg: 0, n: 0 }; x.total += r.amount; x.n++; if (r.kind.startsWith('Пакет')) x.pkg += r.amount; else x.sess += r.amount; });
    const jsAll = journal().filter(e => (!from || e.date >= from) && (!to || e.date <= to)), js = held(jsAll), jcx = cxOf(jsAll);
    const cnt = k => js.filter(e => e.pay === k).length;
    const lost = {}; jcx.filter(e => e.pay === 'none' && e.cancel === 'client').forEach(e => { const c = getClient(e.client); const base = c.mode === 'free' ? 0 : c.mode === 'discount' ? (+c.price || defPrice()) * (1 - (+c.disc || 0) / 100) : (+c.price || defPrice()); if (base) lost[c.cur || defCur()] = (lost[c.cur || defCur()] || 0) + base; });
    const d = debts();
    // по месяцам
    const months = {}; rc.forEach(r => { const m = r.date.slice(0, 7); months[m] = months[m] || {}; months[m][r.cur] = (months[m][r.cur] || 0) + r.amount; });
    const mKeys = Object.keys(months).sort().reverse().slice(0, 12);
    const maxBy = {}; mKeys.forEach(m => Object.entries(months[m]).forEach(([c, v]) => maxBy[c] = Math.max(maxBy[c] || 0, v)));
    // по клиентам
    const byCl = {}; rc.forEach(r => { const k = r.client || 'Без имени'; byCl[k] = byCl[k] || {}; byCl[k][r.cur] = (byCl[k][r.cur] || 0) + r.amount; });
    const debtByCl = {}; d.list.forEach(e => { const k = e.client || 'Без имени'; debtByCl[k] = debtByCl[k] || { byCur: {}, n: 0, oldest: e.date }; debtByCl[k].byCur[e.cur || defCur()] = (debtByCl[k].byCur[e.cur || defCur()] || 0) + (+e.price || 0); debtByCl[k].n++; });
    const days = dt => Math.round((parseD(today()) - parseD(dt)) / 864e5);
    $('#fin').innerHTML = `
      <div class="sectionlabel">Поступило ${from || to ? `· ${from ? dateShort(from) : '…'} — ${to ? dateShort(to) : '…'}` : '· за всё время'}</div>
      ${Object.keys(byCur).length ? `<div class="statgrid">${Object.entries(byCur).map(([c, x]) => `<div class="stat money"><span>${CUR[c] || c} ${c}</span><b>${money(x.total, c)}</b><small>сессии ${money(x.sess, c)}${x.pkg ? ` · пакеты ${money(x.pkg, c)}` : ''}</small></div>`).join('')}</div>` : '<p class="small">За этот период поступлений нет.</p>'}
      <div class="statgrid four">
        <div class="stat"><span>Сессий</span><b>${js.length}</b></div><div class="stat"><span>Оплачено</span><b>${cnt('paid')}</b></div>
        <div class="stat"><span>Из пакета</span><b>${cnt('package')}</b></div><div class="stat"><span>Бесплатно</span><b>${cnt('free')}</b></div>
      </div>
      ${jcx.length ? `<div class="sectionlabel">Отмены за период</div><div class="statgrid">
        <div class="stat cx"><span>Отменено клиентом</span><b>${jcx.filter(e => e.cancel === 'client').length}</b><small>оплачено/в долг: ${jcx.filter(e => e.cancel === 'client' && (e.pay === 'paid' || e.pay === 'unpaid' || e.pay === 'package')).length}</small></div>
        <div class="stat cx"><span>Отменено психологом</span><b>${jcx.filter(e => e.cancel === 'psy').length}</b></div>
        ${Object.keys(lost).length ? `<div class="stat cx"><span>Недополучено (отмены без оплаты)</span><b>${sumText(lost)}</b><small>по тарифу клиента</small></div>` : ''}
      </div><div class="card">${sortJ(jcx).map(e => `<a class="crow" href="#/journal/edit/${e.id}"><span>${dateShort(e.date)} · ${esc(e.client || '—')}<small class="debt">${CANCEL[e.cancel]}${e.cancelReason ? ': ' + esc(e.cancelReason) : ''}</small></span><b>${e.pay === 'none' ? '—' : PAY_CX[e.pay]}</b></a>`).join('')}</div>` : ''}
      <div class="sectionlabel">Долги · все неоплаченные сессии</div>
      ${Object.keys(debtByCl).length ? Object.entries(debtByCl).sort((a, b) => a[1].oldest.localeCompare(b[1].oldest)).map(([n, x]) => `<div class="card jcard debtcard"><div class="jtop"><b><a href="#/client/${encodeURIComponent(n)}">${esc(n)}</a></b><span class="paytag debt">${sumText(x.byCur)}</span></div>
          <p>${x.n} ${plural(x.n, ['сессия', 'сессии', 'сессий'])} · самая ранняя ${dateShort(x.oldest)} (${days(x.oldest)} ${plural(days(x.oldest), ['день', 'дня', 'дней'])} назад)</p>
          <div class="toolbar"><button class="btn primary" data-rem="${esc(n)}">Напомнить</button><button class="btn" data-paid="${esc(n)}">Оплачено</button></div></div>`).join('') : '<p class="small">Долгов нет 🎉</p>'}
      ${mKeys.length ? `<div class="sectionlabel">По месяцам</div><div class="card">${mKeys.map(m => { const [y, mm] = m.split('-'); return `<div class="mrow"><div class="mname">${MONTHS_N[+mm - 1]} ${y}</div><div class="mbars">${Object.entries(months[m]).map(([c, v]) => `<div class="bar"><span style="width:${Math.max(4, v / maxBy[c] * 100)}%"></span><em>${money(v, c)}</em></div>`).join('')}</div></div>`; }).join('')}</div>` : ''}
      ${Object.keys(byCl).length ? `<div class="sectionlabel">По клиентам</div><div class="card">${Object.entries(byCl).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).map(([n, v]) => `<a class="crow" href="#/client/${encodeURIComponent(n)}"><span>${esc(n)}</span><b>${sumText(v)}</b></a>`).join('')}</div>` : ''}
      ${rc.length ? `<div class="sectionlabel">Все поступления · ${rc.length}</div><div class="card">${rc.map(r => `<a class="crow" href="${r.ref}"><span>${dateShort(r.date)} · ${esc(r.client || '—')}<small>${esc(r.kind)}</small></span><b>${money(r.amount, r.cur)}</b></a>`).join('')}</div>` : ''}`;
    $('#fin').querySelectorAll('[data-rem]').forEach(b => b.onclick = () => remindSheet(b.dataset.rem));
    $('#fin').querySelectorAll('[data-paid]').forEach(b => b.onclick = () => markPaid(debts(b.dataset.paid).list.map(e => e.id), render));
    const qs2 = new URLSearchParams({ p: per }); if (per === 'custom') { if (from) qs2.set('from', from); if (to) qs2.set('to', to); }
    history.replaceState(null, '', '#/finance?' + qs2);
  };
  view.innerHTML = journalNav('f') + `
    <div class="chips" id="fp">${[['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['year', 'Этот год'], ['all', 'Всё время']].map(([k, n]) => `<button class="chip ${per === k ? 'on' : ''}" data-p="${k}">${n}</button>`).join('')}</div>
    <div class="period"><label>с <input type="date" id="ff" value="${from}"></label><label>по <input type="date" id="ft" value="${to}"></label></div>
    <div class="toolbar"><button class="btn" id="frep">${ICON.share}Отчёт в Word / PDF</button><a class="btn" href="#/settings">Валюта и цена по умолчанию</a></div>
    <div id="fin"></div>`;
  $('#fp').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; per = b.dataset.p; [from, to] = periodRange(per); $('#ff').value = from; $('#ft').value = to; document.querySelectorAll('#fp .chip').forEach(x => x.classList.toggle('on', x === b)); render(); };
  const custom = () => { per = 'custom'; from = $('#ff').value; to = $('#ft').value; document.querySelectorAll('#fp .chip').forEach(x => x.classList.remove('on')); render(); };
  $('#ff').onchange = custom; $('#ft').onchange = custom;
  $('#frep').onclick = () => financeReport(from, to);
  render();
}
const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
function financeReport(from, to) {
  sheet(`<h3 class="sheettitle">Финансовый отчёт</h3><p class="small">Период: ${from || to ? `${from ? dateShort(from) : '…'} — ${to ? dateShort(to) : '…'}` : 'всё время'}. В отчёт войдут все поступления, итоги по каждой валюте отдельно и список долгов.</p>
    <div class="seg" id="efmt"><button data-f="docx" class="on">Word (.docx)</button><button data-f="pdf">PDF</button></div>
    <div class="sheetbar"><button class="btn primary" id="eshare">${ICON.share}Отправить / сохранить</button><button class="btn" id="esave">Скачать на устройство</button></div>`,
    el => {
      let fmt = 'docx';
      el.querySelector('#efmt').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; fmt = b.dataset.f; el.querySelectorAll('#efmt button').forEach(x => x.classList.toggle('on', x === b)); };
      const go = async mode => {
        const rc = receipts(from, to).reverse();
        const tot = {}; rc.forEach(r => tot[r.cur] = (tot[r.cur] || 0) + r.amount);
        const d = debts();
        const rows = rc.map(r => [dateShort(r.date), r.client || '', r.kind, money(r.amount, r.cur), r.cur]);
        Object.entries(tot).forEach(([c, v]) => rows.push(['', 'ИТОГО ' + c, '', money(v, c), c]));
        d.list.forEach(e => rows.push([dateShort(e.date), e.client || '', e.cancel ? 'ДОЛГ (поздняя отмена)' : 'ДОЛГ (не оплачено)', money(e.price, e.cur), e.cur || defCur()]));
        const fx = journal().filter(e => e.cancel && (!from || e.date >= from) && (!to || e.date <= to)).sort((a, b) => a.date.localeCompare(b.date));
        fx.forEach(e => { const r = [dateShort(e.date), e.client || '', (CANCEL[e.cancel] || 'Отменена') + (e.cancelReason ? ': ' + e.cancelReason : ''), e.pay === 'none' ? 'без оплаты' : (PAY_CX[e.pay] || '').toLowerCase(), e.pay === 'paid' || e.pay === 'unpaid' ? e.cur || defCur() : '']; r.red = true; rows.push(r); });
        if (!rows.length) { toast('Нет данных за период'); return; }
        const period = from || to ? `${from ? dateShort(from) : '…'} — ${to ? dateShort(to) : '…'}` : 'за всё время';
        const sub = `Период: ${period}. Поступило: ${sumText(tot)}. Долги: ${d.list.length ? sumText(d.byCur) : 'нет'}.${fx.length ? ` Отмен: ${fx.length} (выделены красным).` : ''} Сформировано ${dateShort(today())}.`;
        const footer = '© ' + new Date().getFullYear() + ' Елена Кирсанова. Все права защищены. Конфиденциально.';
        const fname = 'Финансовый_отчёт_' + (from || 'начало') + '_' + (to || today()) + '.' + fmt;
        try {
          toast('Готовлю файл…');
          const head = ['Дата', 'Клиент', 'За что', 'Сумма', 'Валюта'], widths = [0.12, 0.25, 0.33, 0.18, 0.12];
          const blob = fmt === 'docx' ? Exporter.docx('Финансовый отчёт', sub, head, rows, widths, footer) : await Exporter.pdf('Финансовый отчёт', sub, head, rows, widths, footer);
          await saveOrShare(blob, fname, mode);
        } catch (err) { toast('Ошибка выгрузки: ' + err.message); }
      };
      el.querySelector('#eshare').onclick = () => go('share');
      el.querySelector('#esave').onclick = () => go('download');
    });
}

/* ---------- выгрузка журнала ---------- */
function exportSheet(from, to, q) {
  sheet(`<h3 class="sheettitle">Выгрузка журнала</h3>
    <div class="row2"><label class="fl">С даты<input class="field" type="date" id="ef" value="${from || ''}"></label><label class="fl">По дату<input class="field" type="date" id="et" value="${to || ''}"></label></div>
    <div class="chips"><button class="chip" data-p="month">Этот месяц</button><button class="chip" data-p="prev">Прошлый месяц</button><button class="chip" data-p="year">Этот год</button><button class="chip" data-p="all">Всё время</button></div>
    <label class="fl">Только клиент <span class="small">(необязательно)</span><input class="field" id="ec" list="eclist" value=""><datalist id="eclist">${allClientNames().map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="pick"><input type="checkbox" id="epay" checked><span>Включить колонку «Оплата»</span></label>
    <label class="pick"><input type="checkbox" id="ecx" checked><span>Включить отменённые сессии (выделяются красным)</span></label>
    <div class="lbl">Формат</div>
    <div class="seg" id="efmt"><button data-f="docx" class="on">Word (.docx)</button><button data-f="pdf">PDF</button></div>
    <div class="sheetbar"><button class="btn primary" id="eshare">${ICON.share}Отправить / сохранить</button><button class="btn" id="esave">Скачать на устройство</button></div>
    <p class="small">«Отправить / сохранить» открывает меню телефона: «Сохранить в Файлы», WhatsApp, Telegram, почта и т.д.</p>`,
    (el) => {
      let fmt = 'docx';
      el.querySelector('#efmt').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; fmt = b.dataset.f; el.querySelectorAll('#efmt button').forEach(x => x.classList.toggle('on', x === b)); };
      el.querySelector('.chips').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const [f, tt] = periodRange(b.dataset.p); el.querySelector('#ef').value = f; el.querySelector('#et').value = tt; };
      const go = async mode => {
        const f = el.querySelector('#ef').value, tt = el.querySelector('#et').value, cl = el.querySelector('#ec').value.trim(), withPay = el.querySelector('#epay').checked, withCx = el.querySelector('#ecx').checked;
        const qq = norm(q || '');
        const list = journal().filter(e => (!f || e.date >= f) && (!tt || e.date <= tt) && (!cl || e.client === cl) && (withCx || !e.cancel) && (!qq || norm([e.client, e.topic, e.tech, e.note].join(' ')).includes(qq)))
          .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
        if (!list.length) { toast('Нет записей за выбранный период'); return; }
        const period = f || tt ? `${f ? dateShort(f) : '…'} — ${tt ? dateShort(tt) : '…'}` : 'за всё время';
        const title = 'Журнал консультаций' + (cl ? ' · ' + cl : '');
        const tot = {}; list.forEach(e => { if (e.pay === 'paid' && +e.price) tot[e.cur || defCur()] = (tot[e.cur || defCur()] || 0) + +e.price; });
        const ncx = cxOf(list).length;
        const sub = `Период: ${period}. Проведено: ${list.length - ncx}${ncx ? `, отменено: ${ncx} (клиентом ${list.filter(e => e.cancel === 'client').length}, психологом ${list.filter(e => e.cancel === 'psy').length})` : ''}.${withPay ? ' Оплачено за сессии: ' + sumText(tot) + '.' : ''} Сформировано ${dateShort(today())}.`;
        const payCell = e => e.pay ? (e.pay === 'paid' || e.pay === 'unpaid' ? money(e.price, e.cur) + ' · ' : '') + ((e.cancel ? PAY_CX : PAY)[e.pay] || '').toLowerCase() : '';
        const head = ['Дата', 'День недели', 'Время', 'Клиент', 'Запрос / тема', 'Техники', 'Заметка', ...(withPay ? ['Оплата'] : [])];
        const rows = list.map(e => { const r = [dateShort(e.date), weekday(e.date), e.time || '', e.client || '', (e.cancel ? 'ОТМЕНЕНА ' + (e.cancel === 'client' ? 'клиентом' : 'психологом') + (e.cancelReason ? ': ' + e.cancelReason : '') + (e.topic ? '\n' : '') : '') + (e.topic || ''), e.tech || '', e.note || '', ...(withPay ? [payCell(e)] : [])]; r.red = !!e.cancel; return r; });
        const widths = withPay ? [0.075, 0.1, 0.05, 0.1, 0.14, 0.165, 0.24, 0.13] : [0.08, 0.09, 0.055, 0.11, 0.17, 0.2, 0.295];
        const footer = '© ' + new Date().getFullYear() + ' Елена Кирсанова. Все права защищены. Конфиденциально.';
        const fname = 'Журнал_консультаций_' + (f || 'начало') + '_' + (tt || today()) + (cl ? '_' + cl.replace(/[^\wа-яё\-]+/gi, '_') : '') + '.' + fmt;
        try {
          toast('Готовлю файл…');
          const blob = fmt === 'docx' ? Exporter.docx(title, sub, head, rows, widths, footer) : await Exporter.pdf(title, sub, head, rows, widths, footer);
          await saveOrShare(blob, fname, mode);
        } catch (err) { toast('Ошибка выгрузки: ' + err.message); }
      };
      el.querySelector('#eshare').onclick = () => go('share');
      el.querySelector('#esave').onclick = () => go('download');
    });
}

/* ================= ИЗБРАННОЕ, МОИ МАТЕРИАЛЫ, ЕЩЁ ================= */
function viewFavorites() {
  setTab('more'); setTitle('Избранное', true);
  const f = favs().map(id => S.byId[id] || S.algById[id]).filter(Boolean);
  const withNotes = Object.keys(notes()).map(id => S.byId[id] || S.algById[id]).filter(Boolean);
  view.innerHTML = (f.length ? f.map(x => x.title ? algCard(x) : itemCard(x)).join('') : `<div class="empty">Здесь появятся практики и алгоритмы, отмеченные звёздочкой.</div>`) +
    (withNotes.length ? `<div class="sectionlabel">С моими заметками</div>${withNotes.map(x => x.title ? algCard(x) : itemCard(x)).join('')}` : '');
}
function viewMine() {
  setTab('more'); setTitle('Мои практики и алгоритмы', true);
  const pr = S.items.filter(i => i.own), al = S.algs.filter(a => a.own);
  view.innerHTML = `<div class="toolbar"><a class="btn primary" href="#/new/practice">${ICON.plus}Новая практика</a><a class="btn primary" href="#/new/alg">${ICON.plus}Новый алгоритм</a></div>
    <div class="sectionlabel">Мои практики · ${pr.length}</div>${pr.map(x => itemCard(x)).join('') || '<p class="small">Пока нет. Создайте свою или нажмите «Изменить копию» на любой практике.</p>'}
    <div class="sectionlabel">Мои алгоритмы · ${al.length}</div>${al.map(algCard).join('') || '<p class="small">Пока нет. Создайте свой или нажмите «Изменить копию» на любом алгоритме.</p>'}`;
}
function viewMore() {
  setTab('more'); setTitle('Ещё', false);
  const row = (href, icon, t, d) => `<a class="card menurow" href="${href}"><span class="mi">${icon}</span><span><h3>${t}</h3><p>${d}</p></span></a>`;
  view.innerHTML =
    row('#/finance', '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>', 'Финансы и клиенты', 'Поступления по валютам, долги, напоминания, пакеты') +
    row('#/favorites', ICON.star, 'Избранное', `${favs().length} материалов со звёздочкой и с заметками`) +
    row('#/mine', ICON.edit, 'Мои практики и алгоритмы', 'Создание, редактирование, свои версии') +
    row('#/topics', ICON.tag, 'Мои темы', 'Создание тем, перенос и дублирование практик') +
    row('#/settings', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>', 'Настройки', 'Цвет, шрифт, размер текста, выгрузка журнала, архив') +
    `<p class="copy">${APP_NAME} · версия ${APP_VERSION}<br>© 2026 Елена Кирсанова. Все права защищены.</p>`;
}

/* ================= НАСТРОЙКИ ================= */
function viewSettings() {
  setTab('more'); setTitle('Настройки', true);
  const st = store.get('settings', {});
  const theme = st.theme || 'auto', fs = st.fs || 17;
  const themes = [['auto', 'Как в системе'], ['light', 'Светлая'], ['sepia', 'Сепия'], ['sage', 'Шалфей'], ['dark', 'Тёмная']];
  view.innerHTML = `
    <div class="setting"><h3>Тема оформления</h3><div class="seg" id="th">${themes.map(([k, n]) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="setting"><h3>Цвет акцента</h3><div class="swatches" id="ac">${ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" class="${st.accent === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}<label class="swatch-custom" title="Свой цвет"><input type="color" id="acc" value="${st.accent || '#5d7d70'}"></label><button class="btn" data-c="">По умолчанию</button></div></div>
    <div class="setting"><h3>Цвет текста</h3><div class="swatches" id="ink">${INKS.filter(Boolean).map(c => `<button style="background:${c}" data-c="${c}" class="${st.ink === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}<label class="swatch-custom" title="Свой цвет"><input type="color" id="inkc" value="${st.ink || '#2a2925'}"></label><button class="btn" data-c="">По умолчанию</button></div><p class="small">В тёмной теме используется светлый текст.</p></div>
    <div class="setting"><h3>Шрифт</h3><div class="seg" id="fo">${Object.entries(FONTS).map(([k, f]) => `<button data-f="${k}" class="${(st.font || 'lora') === k ? 'on' : ''}" style="font-family:${f.v.replace(/"/g, "'")}">${f.n}</button>`).join('')}</div></div>
    <div class="setting"><h3>Размер текста · <span id="fsv">${fs}</span></h3><input type="range" id="fs" min="14" max="24" step="1" value="${fs}"><p class="preview">Пример текста практики: «Сделайте глубокий вдох и обратите внимание на то, что происходит в теле».</p></div>
    <div class="setting"><h3>Оплата по умолчанию</h3><p class="small">Подставляется в новые записи журнала, если у клиента не задан свой тариф.</p><div class="row2"><label class="fl">Стоимость сессии<input class="field" type="number" inputmode="decimal" min="0" step="any" id="dprice" value="${esc(st.price || '')}" placeholder="0"></label><label class="fl">Валюта<select class="field" id="dcur">${curOptions(st.cur || 'RUB')}</select></label></div></div>
    <div class="setting"><h3>Журнал консультаций</h3><p class="small">Записей: ${journal().length}. Выгрузка таблицей в Word или PDF — сохранить на устройство или отправить через мессенджеры.</p><div class="toolbar"><button class="btn primary" id="jexp">${ICON.share}Выгрузить журнал</button></div></div>
    <div class="setting"><h3>Архив данных</h3><p class="small">Журнал, свои практики, алгоритмы и темы, переносы, избранное, заметки и настройки хранятся только на этом устройстве. Выгрузите архив, чтобы сохранить копию или перенести всё на iPad/другой телефон.</p>
      <div class="toolbar"><button class="btn primary" id="arcx">Выгрузить архив</button><label class="btn">Загрузить архив<input type="file" id="arci" accept="application/json,.json" hidden></label></div></div>
    <div class="setting"><h3>Офлайн-режим</h3><p class="small" id="offinfo">Проверяю…</p><div class="toolbar"><button class="btn" id="upd">Проверить обновление</button></div></div>
    <div class="setting"><h3>Установка на iPhone</h3><p class="small">Откройте сайт в Safari → «Поделиться» → «На экран „Домой“». После первого открытия с интернетом приложение работает полностью офлайн.</p></div>
    <p class="copy">${APP_NAME} · версия ${APP_VERSION}<br>© 2026 Елена Кирсанова. Все права защищены.</p>`;
  $('#th').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; setSetting('theme', b.dataset.t === 'auto' ? '' : b.dataset.t); viewSettings(); };
  $('#ac').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; setSetting('accent', b.dataset.c); viewSettings(); };
  $('#acc').onchange = e => { setSetting('accent', e.target.value); viewSettings(); };
  $('#ink').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; setSetting('ink', b.dataset.c); viewSettings(); };
  $('#inkc').onchange = e => { setSetting('ink', e.target.value); viewSettings(); };
  $('#fo').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; setSetting('font', b.dataset.f === 'lora' ? '' : b.dataset.f); viewSettings(); };
  $('#fs').oninput = e => { $('#fsv').textContent = e.target.value; setSetting('fs', +e.target.value); };
  $('#jexp').onclick = () => exportSheet('', '', '');
  $('#dprice').onchange = e => { setSetting('price', +e.target.value || ''); toast('Сохранено'); };
  $('#dcur').onchange = e => { setSetting('cur', e.target.value); toast('Сохранено'); };
  $('#arcx').onclick = () => {
    const data = { app: APP_NAME, version: APP_VERSION, created: new Date().toISOString(), data: {} };
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('pp_')) data.data[k] = localStorage.getItem(k); }
    saveOrShare(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'Психокабинет_архив_' + today() + '.json', 'share');
  };
  $('#arci').onchange = async e => {
    try {
      const raw = JSON.parse(await e.target.files[0].text());
      const d = raw.data || raw;
      const keys = Object.keys(d).filter(k => k.startsWith('pp_'));
      if (!keys.length) throw new Error('не тот файл');
      confirmBox(`Загрузить архив (${keys.length} разделов)? Текущие данные на этом устройстве будут заменены данными из архива.`, 'Загрузить', () => {
        keys.forEach(k => localStorage.setItem(k, d[k])); applySettings(); rebuild(); toast('Архив загружен'); viewSettings();
      });
    } catch (err) { toast('Не удалось прочитать архив'); }
    e.target.value = '';
  };
  $('#upd').onclick = async () => { if (navigator.serviceWorker && navigator.serviceWorker.controller) { const r = await navigator.serviceWorker.getRegistration(); await r.update(); toast('Проверено. Новая версия применится при следующем запуске.'); } else toast('Офлайн-режим ещё не готов'); };
  offlineInfo();
}
async function offlineInfo() {
  const el = $('#offinfo'); if (!el) return;
  if (!('serviceWorker' in navigator)) { el.textContent = 'Браузер не поддерживает офлайн-режим.'; return; }
  try { const keys = await (await caches.open(CACHE_NAME)).keys(); el.textContent = keys.length >= CORE_COUNT ? `Готов: сохранено ${keys.length} файлов, всё доступно без интернета.` : `Загружается: ${keys.length} из ${CORE_COUNT} файлов…`; }
  catch (e) { el.textContent = 'Статус недоступен.'; }
}
function viewNotFound() { setTitle('Не найдено', true); view.innerHTML = `<div class="empty">Материал не найден. <a href="#/">На главную</a></div>`; }

/* ================= маршруты ================= */
function route() {
  if (!S.ready) return;
  document.querySelectorAll('.sheetwrap').forEach(s => s.remove()); document.body.classList.remove('noscroll');
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const h = decodeURIComponent(path);
  window.scrollTo(0, 0);
  let m;
  if (h === '/' || h === '') { const q = new URLSearchParams(qs || '').get('q') || ''; S.lastQuery = q; return viewSearch(q); }
  if ((m = h.match(/^\/item\/(.+)$/))) return viewItem(m[1]);
  if ((m = h.match(/^\/alg\/(.+)$/))) return viewAlg(m[1]);
  if ((m = h.match(/^\/topic\/(.+)$/))) return viewTopic(m[1]);
  if (h === '/topics') return viewTopics();
  if (h === '/algorithms') return viewAlgorithms();
  if (h === '/journal') return viewJournal(qs);
  if (h === '/journal/new') return viewJournalEdit(null, qs);
  if ((m = h.match(/^\/journal\/edit\/(.+)$/))) return viewJournalEdit(m[1]);
  if (h === '/clients') return viewClients();
  if ((m = h.match(/^\/client\/(.+)$/))) return viewClient(m[1]);
  if (h === '/finance') return viewFinance(qs);
  if (h === '/new/practice') return viewEditPractice(null);
  if ((m = h.match(/^\/edit\/practice\/(.+)$/))) return viewEditPractice(m[1]);
  if (h === '/new/alg') return viewEditAlg(null);
  if ((m = h.match(/^\/edit\/alg\/(.+)$/))) return viewEditAlg(m[1]);
  if (h === '/favorites') return viewFavorites();
  if (h === '/mine') return viewMine();
  if (h === '/more') return viewMore();
  if (h === '/settings') return viewSettings();
  viewNotFound();
}
window.addEventListener('hashchange', route);
$('#backBtn').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };

/* ================= офлайн ================= */
function updateBadge() {
  const b = $('#offlineBadge'); if (!('caches' in window)) return;
  caches.open(CACHE_NAME).then(c => c.keys()).then(k => { if (k.length >= CORE_COUNT) { b.textContent = 'офлайн'; b.classList.add('ok'); } else b.textContent = navigator.onLine ? 'сохраняю…' : ''; }).catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => setTimeout(updateBadge, 1500)).catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'cached') updateBadge(); });
}
load().then(() => { $('#loading') && $('#loading').remove(); route(); updateBadge(); })
  .catch(err => { view.innerHTML = `<div class="empty">Не удалось загрузить библиотеку. Откройте приложение один раз при наличии интернета.<br><small>${esc(err.message)}</small></div>`; });
