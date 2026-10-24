/* Психологические практики — офлайн-библиотека. © 2026 Елена Кирсанова */
'use strict';

const S = { items: [], byId: {}, meta: null, topics: [], topicById: {}, algs: [], algById: {}, ready: false, indexed: false, sourceFilter: '' };
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('pp_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pp_' + k, JSON.stringify(v)); } catch (e) { toast('Не удалось сохранить: память браузера недоступна'); } }
};
const favs = () => store.get('favs', []);
const isFav = id => favs().includes(id);
function toggleFav(id) { const f = favs(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); store.set('favs', f); return i < 0; }
const notes = () => store.get('notes', {});
function setNote(id, t) { const n = notes(); if (t.trim()) n[id] = t; else delete n[id]; store.set('notes', n); }
function pushRecent(id) { let r = store.get('recent', []).filter(x => x !== id); r.unshift(id); store.set('recent', r.slice(0, 20)); }

/* ---------- settings ---------- */
function applySettings() {
  const theme = store.get('theme', 'auto');
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--fs', store.get('fs', 17) + 'px');
}
applySettings();

/* ---------- text utils ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const ENDINGS = ['иями','ями','ами','ого','его','ому','ему','ыми','ими','ией','иях','ах','ях','ов','ев','ей','ий','ый','ой','ая','яя','ое','ее','ые','ие','ом','ем','ам','ям','ую','юю','ия','ья','ье','ии','ью','а','я','о','е','ы','и','у','ю','ь','й'];
function stem(w) {
  w = norm(w).replace(/[^a-zа-я0-9\-]/g, '');
  if (w.length <= 4) return w;
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  return w;
}
const STOP = new Set(['и','в','во','на','с','со','к','ко','по','о','об','от','до','за','из','у','для','при','как','что','не','или','а','но','же','ли','мой','моя','мои','это']);
function terms(q) { return norm(q).split(/[\s,.;:!?«»"()]+/).filter(w => w && !STOP.has(w)).map(stem).filter(w => w.length >= 2); }
function countOcc(hay, needle, cap) { let n = 0, i = 0; while (n < cap && (i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function highlight(html, ts) {
  if (!ts.length) return html;
  const rx = new RegExp('(' + ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')([а-яёa-z]*)', 'gi');
  return html.replace(/>([^<]+)</g, (m, txt) => '>' + txt.replace(rx, '<mark>$1$2</mark>') + '<');
}

/* ---------- data ---------- */
async function load() {
  const meta = await fetch('data/meta.json').then(r => r.json());
  S.meta = meta; S.topics = meta.topics; S.topics.forEach(t => S.topicById[t.id] = t);
  const parts = await Promise.all(meta.files.map(f => fetch('data/' + f).then(r => r.json())));
  S.items = parts.flat(); S.items.forEach(it => { S.byId[it.id] = it; it._t = norm(it.t + ' ' + it.c); });
  S.algs = await fetch('data/algorithms.json').then(r => r.json());
  S.algs.forEach(a => { S.algById[a.id] = a; a._t = norm(a.title + ' ' + a.tags.join(' ') + ' ' + a.cat); });
  S.topicCount = {}; S.items.forEach(it => it.g.forEach(g => S.topicCount[g] = (S.topicCount[g] || 0) + 1));
  S.ready = true;
  setTimeout(buildIndex, 50);
}
function buildIndex() {
  // full-text index built in small slices to keep UI responsive
  let i = 0;
  (function slice() {
    const end = Math.min(i + 120, S.items.length);
    for (; i < end; i++) { const it = S.items[i]; it._x = norm(strip(it.h)); }
    if (i < S.items.length) setTimeout(slice, 0); else { S.indexed = true; if (location.hash.startsWith('#/?q=') || location.hash.startsWith('#/search')) route(); }
  })();
}
function itemText(it) { if (!it._x) it._x = norm(strip(it.h)); return it._x; }

/* ---------- search ---------- */
function matchTopics(ts) {
  // 3 — тема начинается с запроса, 2 — слово в названии темы, 1 — ключевое слово темы
  const sc = {};
  for (const t of S.topics) {
    const words = norm(t.n).split(/[\s,()]+/).filter(Boolean);
    let best = 0;
    for (const s of ts) {
      if (s.length < 4) continue;
      const wm = w => w.startsWith(s) || (w.length >= 5 && s.startsWith(w.slice(0, Math.max(5, w.length - 2))));
      if (wm(words[0])) best = Math.max(best, 3);
      else if (words.some(wm)) best = Math.max(best, 2);
      for (const k of t.k) { const first = norm(k).split(' ')[0]; if (first.length >= 4 && (s.startsWith(first) || (first.startsWith(s) && s.length >= 5))) best = Math.max(best, 1); }
    }
    if (best) sc[t.id] = best;
  }
  const max = Math.max(0, ...Object.values(sc));
  const main = Object.keys(sc).filter(k => sc[k] === max);
  const extra = Object.keys(sc).filter(k => sc[k] < max);
  return { main, extra };
}
function search(q) {
  const ts = terms(q);
  if (!ts.length) return { ts, topics: [], related: [], items: [], algs: [] };
  const mt = matchTopics(ts); const tops = mt.main;
  const rel = [...new Set([...mt.extra, ...tops.flatMap(t => S.topicById[t].r)])].filter(t => !tops.includes(t));
  const res = [];
  for (const it of S.items) {
    if (S.sourceFilter && it.s !== S.sourceFilter) continue;
    let sc = 0;
    const tHits = ts.filter(t => it._t.includes(t)).length;
    sc += tHits * 60;
    let topicSc = 0;
    it.g.forEach((g, k) => { if (tops.includes(g)) topicSc = Math.max(topicSc, 40 + Math.min(it.gs[k], 40)); else if (rel.includes(g)) topicSc = Math.max(topicSc, 6 + Math.min(it.gs[k], 20) / 4); });
    sc += topicSc;
    const x = itemText(it);
    const all = ts.every(t => it._t.includes(t) || x.includes(t));
    if (all) sc += 10 + ts.reduce((a, t) => a + countOcc(x, t, 15), 0);
    if (sc > 0 && (all || topicSc >= 40 || tHits)) res.push([sc, it]);
  }
  res.sort((a, b) => b[0] - a[0]);
  const algs = S.algs.map(a => {
    let sc = ts.filter(t => a._t.includes(t)).length * 10;
    return [sc, a];
  }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  return { ts, topics: tops, related: rel, items: res.map(r => r[1]), algs };
}

/* ---------- render helpers ---------- */
const SRC_SHORT = { p700: '700 техник', p300: '300 упражнений', malk: 'Малкина-Пых', star: 'Старак: гештальт', tg: 'Telegram', tgf: 'Telegram PDF', work: 'Рабочая тетрадь', ref: 'Справочник' };
function itemCard(it, ts = []) {
  const tags = it.g.slice(0, 3).map(g => `<span class="tag">${esc(S.topicById[g].n)}</span>`).join('');
  const d = ts.length ? highlight('>' + esc(it.d) + '<', ts).slice(1, -1) : esc(it.d);
  return `<a class="card" href="#/item/${it.id}"><h3>${esc(it.t)}</h3><p>${d}</p><div class="meta"><span class="tag src">${SRC_SHORT[it.s] || it.s}</span>${it.k === 'theory' ? '<span class="tag">теория</span>' : ''}${it.k === 'reference' ? '<span class="tag">справка</span>' : ''}${tags}</div></a>`;
}
function algCard(a) {
  return `<a class="card" href="#/alg/${a.id}"><h3>${esc(a.title)}</h3><p>${esc(a.purpose)}</p><div class="meta"><span class="tag alg">${esc(a.cat)}</span>${a.duration ? `<span class="tag">${esc(a.duration)}</span>` : ''}</div></a>`;
}
function listWithMore(arr, render, step = 40) {
  const id = 'l' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const box = document.getElementById(id); if (!box) return;
    let n = 0;
    const btn = document.createElement('button'); btn.className = 'more';
    const add = () => { box.insertAdjacentHTML('beforeend', arr.slice(n, n + step).map(render).join('')); n += step; btn.textContent = `Показать ещё (${arr.length - n})`; if (n >= arr.length) btn.remove(); };
    btn.onclick = add; box.after(btn); add();
  });
  return `<div id="${id}"></div>`;
}
function setTitle(t, back) { $('#pageTitle').textContent = t; $('#backBtn').hidden = !back; document.title = t + ' · Психологические практики'; }
function setTab(t) { document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
async function shareText(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); }
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); } }

/* ---------- views ---------- */
const QUICK = ['Выгорание', 'Тревога', 'Самоценность', 'Отношения', 'Границы', 'Страх', 'Горе', 'Травма', 'Психосоматика', 'Внутренний критик', 'Гнев', 'Стыд', 'Вина', 'Прокрастинация', 'Депрессия', 'Сон', 'Деньги', 'Дети'];

function viewSearch(q = '') {
  setTab('search'); setTitle('Психологические практики', false);
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
  inp.addEventListener('input', () => { clr.hidden = !inp.value; clearTimeout(h); h = setTimeout(() => { history.replaceState(null, '', inp.value ? '#/?q=' + encodeURIComponent(inp.value) : '#/'); renderResults(inp.value); }, 220); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  clr.onclick = () => { inp.value = ''; clr.hidden = true; history.replaceState(null, '', '#/'); renderResults(''); inp.focus(); };
  renderResults(q);
}
function renderFilters() {
  const f = $('#filters'); if (!f) return;
  const srcs = [['', 'Все источники'], ...Object.keys(S.meta.sources).map(k => [k, SRC_SHORT[k] || k])];
  f.innerHTML = srcs.map(([k, n]) => `<button class="chip ${S.sourceFilter === k ? 'on' : ''}" data-src="${k}">${esc(n)}</button>`).join('');
  f.onclick = e => { const b = e.target.closest('[data-src]'); if (!b) return; S.sourceFilter = b.dataset.src; renderFilters(); renderResults($('#q').value); };
}
function renderResults(q) {
  const box = $('#res');
  if (!q.trim()) {
    const recent = store.get('recent', []).map(id => S.byId[id] || S.algById[id]).filter(Boolean).slice(0, 6);
    box.innerHTML = `
      <p class="hint">В библиотеке ${S.items.length} практик и техник из ${Object.keys(S.meta.sources).length} источников и ${S.algs.length} алгоритмов сессий. Всё работает без интернета.</p>
      <div class="sectionlabel">Частые запросы</div>
      <div class="chips">${QUICK.map(w => `<a class="chip" href="#/?q=${encodeURIComponent(w)}">${w}</a>`).join('')}</div>
      ${recent.length ? `<div class="sectionlabel">Недавно открытые</div>${recent.map(x => x.title ? algCard(x) : itemCard(x)).join('')}` : ''}`;
    return;
  }
  const r = search(q);
  let html = '';
  if (r.topics.length) {
    const main = r.topics.map(t => S.topicById[t]);
    html += `<div class="topicbanner"><h2>${main.map(t => esc(t.n)).join(' · ')}</h2><p>Практики по теме собраны первыми, затем — по связанным темам и полному тексту.</p></div>`;
    html += `<div class="chips">${main.map(t => `<a class="chip main" href="#/topic/${t.id}">${esc(t.n)} <span class="n">${S.topicCount[t.id] || 0}</span></a>`).join('')}${r.related.slice(0, 8).map(id => `<a class="chip rel" href="#/topic/${id}">${esc(S.topicById[id].n)} <span class="n">${S.topicCount[id] || 0}</span></a>`).join('')}</div>`;
  }
  if (r.algs.length) html += `<div class="sectionlabel">Алгоритмы сессий</div>` + r.algs.slice(0, 4).map(algCard).join('');
  html += `<div class="sectionlabel">Практики и техники · ${r.items.length}${S.indexed ? '' : ' (индексирую полный текст…)'}</div>`;
  if (!r.items.length) html += `<div class="empty">Ничего не найдено. Попробуйте другое слово или общий термин: «тревога», «тело», «семья».</div>`;
  box.innerHTML = html + (r.items.length ? listWithMore(r.items, it => itemCard(it, r.ts)) : '');
}

function viewItem(id, q) {
  const it = S.byId[id]; if (!it) return viewNotFound();
  pushRecent(id); setTab(''); setTitle(SRC_SHORT[it.s] || 'Практика', true);
  const ts = q ? terms(q) : (S.lastQuery ? terms(S.lastQuery) : []);
  const tags = it.g.map(g => `<a class="chip" href="#/topic/${g}">${esc(S.topicById[g].n)}</a>`).join('');
  const fav = isFav(id);
  // related: same top topic, same chapter
  const rel = S.items.filter(x => x !== it && x.c === it.c && x.s === it.s).slice(0, 5);
  view.innerHTML = `<article class="article">
    <h2 class="title">${esc(it.t)}</h2>
    <div class="sub">${esc(S.meta.sources[it.s])}${it.c ? ' · ' + esc(it.c) : ''}</div>
    <div class="toolbar">
      <button class="btn fav ${fav ? 'on' : ''}" id="fav"><svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>${fav ? 'В избранном' : 'В избранное'}</button>
      <button class="btn" id="share"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg>Поделиться</button>
      <button class="btn" id="copy"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>Копировать</button>
    </div>
    <div class="chips">${tags}</div>
    <div class="body">${highlight(it.h, ts)}</div>
    <div class="notes"><div class="sectionlabel">Мои заметки</div><textarea id="note" placeholder="Ваши наблюдения, вариации, для каких клиентов подходит…">${esc(notes()[id] || '')}</textarea></div>
    ${rel.length ? `<div class="related"><div class="sectionlabel">Ещё из этого раздела</div>${rel.map(x => itemCard(x)).join('')}</div>` : ''}
  </article>`;
  const plain = () => it.t + '\n' + (it.c ? it.c + '\n' : '') + '\n' + htmlToText(it.h) + '\n\nИсточник: ' + S.meta.sources[it.s];
  $('#fav').onclick = () => { const on = toggleFav(id); const b = $('#fav'); b.classList.toggle('on', on); b.lastChild.textContent = on ? 'В избранном' : 'В избранное'; toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); };
  $('#share').onclick = () => shareText(it.t, plain());
  $('#copy').onclick = () => copyText(plain());
  let nh; $('#note').addEventListener('input', e => { clearTimeout(nh); nh = setTimeout(() => setNote(id, e.target.value), 400); });
}
function htmlToText(h) {
  return h.replace(/<h3>(.*?)<\/h3>/g, '\n$1\n').replace(/<li>/g, '• ').replace(/<\/(li|p|tr)>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}

function viewTopics() {
  setTab('topics'); setTitle('Темы и симптомы', false);
  const groups = {};
  S.topics.forEach(t => (groups[t.g] = groups[t.g] || []).push(t));
  view.innerHTML = `<p class="hint">Практики автоматически разложены по темам. Нажмите тему, чтобы увидеть все подходящие практики и связанные темы.</p>` +
    Object.entries(groups).map(([g, ts]) => `<div class="sectionlabel">${esc(g)}</div><div class="chips">${ts.map(t => `<a class="chip" href="#/topic/${t.id}">${esc(t.n)} <span class="n">${S.topicCount[t.id] || 0}</span></a>`).join('')}</div>`).join('') +
    `<div class="sectionlabel">Источники</div><div class="chips">${Object.keys(S.meta.sources).map(k => `<a class="chip" href="#/source/${k}">${esc(SRC_SHORT[k])} <span class="n">${S.items.filter(i => i.s === k).length}</span></a>`).join('')}</div>`;
}
function viewTopic(id) {
  const t = S.topicById[id]; if (!t) return viewNotFound();
  setTab('topics'); setTitle(t.n, true);
  const list = S.items.filter(it => it.g.includes(id)).sort((a, b) => b.gs[b.g.indexOf(id)] - a.gs[a.g.indexOf(id)]);
  const algs = S.algs.filter(a => terms(t.n).some(s => a._t.includes(s)) || t.k.slice(0, 3).some(k => a._t.includes(stem(k))));
  view.innerHTML = `<div class="topicbanner"><h2>${esc(t.n)}</h2><p>${list.length} практик. Связанные темы помогут расширить подбор.</p></div>
    <div class="chips">${t.r.map(r => `<a class="chip rel" href="#/topic/${r}">${esc(S.topicById[r].n)} <span class="n">${S.topicCount[r] || 0}</span></a>`).join('')}</div>
    ${algs.length ? `<div class="sectionlabel">Алгоритмы сессий</div>${algs.slice(0, 4).map(algCard).join('')}` : ''}
    <div class="sectionlabel">Практики</div>${listWithMore(list, it => itemCard(it))}`;
}
function viewSource(k) {
  setTab('topics'); setTitle(SRC_SHORT[k] || 'Источник', true);
  const list = S.items.filter(i => i.s === k);
  const chapters = [...new Set(list.map(i => i.c))];
  view.innerHTML = `<div class="topicbanner"><h2>${esc(S.meta.sources[k])}</h2><p>${list.length} материалов</p></div>` +
    chapters.map(c => `<details class="step"><summary>${esc(c || 'Без раздела')} <span class="small">· ${list.filter(i => i.c === c).length}</span></summary><div class="inner">${list.filter(i => i.c === c).map(i => `<a class="card" href="#/item/${i.id}"><h3>${esc(i.t)}</h3></a>`).join('')}</div></details>`).join('');
}

function viewAlgorithms() {
  setTab('algorithms'); setTitle('Алгоритмы сессий', false);
  const cats = {}; S.algs.forEach(a => (cats[a.cat] = cats[a.cat] || []).push(a));
  view.innerHTML = `<p class="hint">Пошаговые алгоритмы: порядок проведения, готовые фразы, вопросы и зачем они нужны. Вопросы можно отмечать по ходу сессии, шаблоны — копировать.</p>` +
    Object.entries(cats).map(([c, as]) => `<div class="sectionlabel">${esc(c)}</div>${as.map(algCard).join('')}`).join('');
}
function findPracticeByTitle(t) {
  const n = norm(t).replace(/[«»"]/g, '');
  return S.items.find(i => norm(i.t).replace(/[«»"]/g, '') === n) || S.items.find(i => norm(i.t).replace(/[«»"]/g, '').includes(n)) || S.items.find(i => n.includes(norm(i.t).replace(/[«»"]/g, '')) && i.t.length > 8);
}
function viewAlg(id) {
  const a = S.algById[id]; if (!a) return viewNotFound();
  pushRecent(id); setTab('algorithms'); setTitle('Алгоритм сессии', true);
  const fav = isFav(id);
  const checks = store.get('chk_' + id, {});
  const links = (a.links || []).map(findPracticeByTitle).filter(Boolean);
  const stepHtml = a.steps.map((s, i) => `<details class="step" ${i === 0 ? 'open' : ''}><summary>${esc(s.name)}</summary><div class="inner">
      ${s.why ? `<p class="why"><b>Зачем:</b> ${esc(s.why)}</p>` : ''}
      ${s.say.length ? `<div class="lbl">Что сказать</div>${s.say.map(x => `<p class="say">${esc(x)}</p>`).join('')}` : ''}
      ${s.ask.length ? `<div class="lbl">Вопросы клиенту</div><div class="ask">${s.ask.map((x, j) => `<label><input type="checkbox" data-k="${i}_${j}" ${checks[i + '_' + j] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>` : ''}
      ${s.notes.length ? `<div class="lbl">Обратить внимание</div><ul class="notelist">${s.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div></details>`).join('');
  view.innerHTML = `<article class="article">
    <h2 class="title">${esc(a.title)}</h2>
    <div class="alghead"><p class="purpose">${esc(a.purpose)}</p>${a.duration ? `<div class="dur">⏱ ${esc(a.duration)}</div>` : ''}</div>
    <div class="toolbar">
      <button class="btn fav ${fav ? 'on' : ''}" id="fav"><svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>${fav ? 'В избранном' : 'В избранное'}</button>
      <button class="btn" id="share"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg>Поделиться</button>
      <button class="btn" id="openall">Раскрыть всё</button>
      <button class="btn" id="reset">Сбросить отметки</button>
    </div>
    ${stepHtml}
    ${a.after.length ? `<div class="sectionlabel">После сессии</div><ul class="notelist">${a.after.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.tips.length ? `<div class="sectionlabel">Советы</div><ul class="notelist">${a.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.template ? `<div class="sectionlabel">Шаблон</div><div class="template" id="tpl">${esc(a.template)}</div><div class="toolbar"><button class="btn primary" id="copytpl">Копировать шаблон</button><button class="btn" id="sharetpl">Отправить шаблон</button></div>` : ''}
    ${links.length ? `<div class="sectionlabel">Практики для этой сессии</div>${links.map(x => itemCard(x)).join('')}` : ''}
    <div class="notes"><div class="sectionlabel">Мои заметки к алгоритму</div><textarea id="note" placeholder="Ваши дополнения, удачные формулировки…">${esc(notes()[id] || '')}</textarea></div>
  </article>`;
  const plain = () => a.title + '\n\n' + a.purpose + '\n' + (a.duration ? 'Длительность: ' + a.duration + '\n' : '') + '\n' + a.steps.map(s => s.name + '\n' + (s.why ? 'Зачем: ' + s.why + '\n' : '') + s.say.map(x => '— ' + x).join('\n') + (s.say.length ? '\n' : '') + s.ask.map(x => '• ' + x).join('\n') + (s.ask.length ? '\n' : '') + s.notes.map(x => '! ' + x).join('\n')).join('\n\n') + (a.template ? '\n\n' + a.template : '');
  $('#fav').onclick = () => { const on = toggleFav(id); const b = $('#fav'); b.classList.toggle('on', on); b.lastChild.textContent = on ? 'В избранном' : 'В избранное'; };
  $('#share').onclick = () => shareText(a.title, plain());
  $('#openall').onclick = () => document.querySelectorAll('details.step').forEach(d => d.open = true);
  $('#reset').onclick = () => { store.set('chk_' + id, {}); document.querySelectorAll('.ask input').forEach(c => c.checked = false); };
  view.querySelectorAll('.ask input').forEach(c => c.onchange = () => { const ch = store.get('chk_' + id, {}); ch[c.dataset.k] = c.checked; store.set('chk_' + id, ch); });
  if (a.template) { $('#copytpl').onclick = () => copyText(a.template); $('#sharetpl').onclick = () => shareText(a.title, a.template); }
  let nh; $('#note').addEventListener('input', e => { clearTimeout(nh); nh = setTimeout(() => setNote(id, e.target.value), 400); });
}

function viewFavorites() {
  setTab('favorites'); setTitle('Избранное', false);
  const f = favs().map(id => S.byId[id] || S.algById[id]).filter(Boolean);
  const n = notes(); const withNotes = Object.keys(n).map(id => S.byId[id] || S.algById[id]).filter(Boolean);
  view.innerHTML = (f.length ? f.map(x => x.title ? algCard(x) : itemCard(x)).join('') : `<div class="empty">Здесь появятся практики и алгоритмы, отмеченные звёздочкой.</div>`) +
    (withNotes.length ? `<div class="sectionlabel">С моими заметками</div>${withNotes.map(x => x.title ? algCard(x) : itemCard(x)).join('')}` : '');
}

function viewSettings() {
  setTab('settings'); setTitle('Настройки', false);
  const theme = store.get('theme', 'auto'), fs = store.get('fs', 17);
  const themes = [['auto', 'Как в системе'], ['light', 'Светлая'], ['sepia', 'Сепия'], ['sage', 'Шалфей'], ['dark', 'Тёмная']];
  view.innerHTML = `
    <div class="setting"><h3>Оформление</h3><div class="seg" id="th">${themes.map(([k, n]) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="setting"><h3>Размер текста</h3><div class="seg" id="fs">${[15, 17, 19, 21].map(s => `<button data-s="${s}" class="${fs === s ? 'on' : ''}" style="font-size:${s}px">Аа</button>`).join('')}</div></div>
    <div class="setting"><h3>Офлайн-режим</h3><p class="small" id="offinfo">Проверяю…</p><div class="toolbar"><button class="btn" id="upd">Проверить обновление</button></div></div>
    <div class="setting"><h3>Резервная копия</h3><p class="small">Избранное, заметки и отметки хранятся только на этом устройстве. Сохраните копию, чтобы перенести их на другое устройство.</p>
      <div class="toolbar"><button class="btn" id="exp">Сохранить копию</button><label class="btn">Загрузить копию<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <div class="setting"><h3>Источники</h3><ul class="srclist">${Object.entries(S.meta.sources).map(([k, v]) => `<li><a href="#/source/${k}">${esc(v)}</a> — ${S.items.filter(i => i.s === k).length}</li>`).join('')}</ul>
      <p class="small">Материалы принадлежат их авторам и используются для личной профессиональной работы.</p></div>
    <div class="setting"><h3>Как установить на iPhone</h3><p class="small">Откройте сайт в Safari → кнопка «Поделиться» → «На экран „Домой“». После первого открытия с интернетом приложение работает полностью офлайн.</p></div>
    <p class="small" style="text-align:center;margin-top:20px">Психологические практики · версия ${APP_VERSION}<br>© 2026 Елена Кирсанова. Все права защищены.</p>`;
  $('#th').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; store.set('theme', b.dataset.t); applySettings(); viewSettings(); };
  $('#fs').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; store.set('fs', +b.dataset.s); applySettings(); viewSettings(); };
  $('#exp').onclick = () => {
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('pp_')) data[k] = localStorage.getItem(k); }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], 'praktiki-backup-' + new Date().toISOString().slice(0, 10) + '.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Резервная копия' }).catch(() => {});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
  };
  $('#imp').onchange = async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); Object.entries(data).forEach(([k, v]) => k.startsWith('pp_') && localStorage.setItem(k, v)); toast('Копия загружена'); applySettings(); viewSettings(); }
    catch (err) { toast('Не удалось прочитать файл'); }
  };
  $('#upd').onclick = async () => { if (navigator.serviceWorker && navigator.serviceWorker.controller) { const r = await navigator.serviceWorker.getRegistration(); await r.update(); toast('Проверено. Если есть новая версия, она применится при следующем запуске.'); } else toast('Офлайн-режим ещё не готов'); };
  offlineInfo();
}
async function offlineInfo() {
  const el = $('#offinfo'); if (!el) return;
  if (!('serviceWorker' in navigator)) { el.textContent = 'Браузер не поддерживает офлайн-режим.'; return; }
  try { const c = await caches.open(CACHE_NAME); const keys = await c.keys(); el.textContent = keys.length >= CORE_COUNT ? `Готов: сохранено ${keys.length} файлов, библиотека доступна без интернета.` : `Загружается: ${keys.length} из ${CORE_COUNT} файлов…`; }
  catch (e) { el.textContent = 'Статус недоступен.'; }
}
function viewNotFound() { setTitle('Не найдено', true); view.innerHTML = `<div class="empty">Материал не найден. <a href="#/">На главную</a></div>`; }

/* ---------- router ---------- */
function route() {
  if (!S.ready) return;
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  window.scrollTo(0, 0);
  let m;
  if ((m = h.match(/^\/\?q=(.*)$/))) { S.lastQuery = m[1]; return viewSearch(m[1]); }
  if (h === '/' || h === '') { S.lastQuery = ''; return viewSearch(''); }
  if ((m = h.match(/^\/item\/(.+)$/))) return viewItem(m[1]);
  if ((m = h.match(/^\/alg\/(.+)$/))) return viewAlg(m[1]);
  if ((m = h.match(/^\/topic\/(.+)$/))) return viewTopic(m[1]);
  if ((m = h.match(/^\/source\/(.+)$/))) return viewSource(m[1]);
  if (h === '/topics') return viewTopics();
  if (h === '/algorithms') return viewAlgorithms();
  if (h === '/favorites') return viewFavorites();
  if (h === '/settings') return viewSettings();
  viewNotFound();
}
window.addEventListener('hashchange', route);
$('#backBtn').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };

/* ---------- offline (service worker) ---------- */
const APP_VERSION = '1.0.0';
const CACHE_NAME = 'praktiki-v1';
const CORE_COUNT = 14;
function updateBadge() {
  const b = $('#offlineBadge');
  if (!('caches' in window)) return;
  caches.open(CACHE_NAME).then(c => c.keys()).then(k => { if (k.length >= CORE_COUNT) { b.textContent = 'офлайн'; b.classList.add('ok'); } else { b.textContent = navigator.onLine ? 'сохраняю…' : ''; } }).catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => setTimeout(updateBadge, 1500)).catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'cached') updateBadge(); });
}

load().then(() => { $('#loading') && $('#loading').remove(); route(); updateBadge(); })
  .catch(err => { view.innerHTML = `<div class="empty">Не удалось загрузить библиотеку. Откройте приложение один раз при наличии интернета.<br><small>${esc(err.message)}</small></div>`; });
