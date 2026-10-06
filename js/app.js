(function () {
  'use strict';
  const $app = document.getElementById('app');
  const KEY = 'grade1math.v1';
  const LV = { b: ['Warm-up', '🌱'], c: ['Practice', '✏️'], s: ['Challenge', '⭐'], o: ['Dragon challenge', '🐉'] };
  /* Every lesson has a monster to tame (js/monsters.js); the last lesson of each week is a Big Boss. */
  const monsterFor = L => Monsters.forLesson(L);
  document.body.insertAdjacentHTML('afterbegin', Monsters.sprite());
  const monPic = (L, cls, shadow) => { const m = monsterFor(L); return Monsters.use(m.i, m.boss, (cls || '') + (shadow ? ' shadow' : '')); };
  /* Words for the grown-up-written labels in lesson data, in the knight story. */
  const themeText = html => String(html).replace('<b>Olympiad tip:</b>', '<b>🐉 Challenge hint:</b>').replace('<b>Scientist tip:</b>', '<b>🔬 Science hint:</b>').replace('<b>Hands-on:</b>', '<b>👐 Try it:</b>');

  const SUBJECTS = [
    { key: 'math', name: 'Maths', realm: 'Number Keep', icon: '🧮', prefix: '', weeks: window.CURRICULUM || [], blurb: 'The Number Keep is full of number monsters. Solve puzzles and make monster friends.' },
    { key: 'eng', name: 'English', realm: 'Story Forest', icon: '📚', prefix: 'e', weeks: window.ENGLISH || [], blurb: 'The Story Forest hides word monsters. Read, spell and make monster friends.' },
    { key: 'sci', name: 'Science', realm: 'Dragon Lab', icon: '🔬', prefix: 's', weeks: window.SCIENCE || [], blurb: 'The Dragon Lab bubbles with science monsters. Ask questions and try things with monster friends.' }
  ];
  const SUBJ = {}; const BYID = {};
  SUBJECTS.forEach(sb => {
    sb.lessons = []; SUBJ[sb.key] = sb;
    sb.weeks.forEach(w => w.lessons.forEach((l, d) => { const L = Object.assign({ subj: sb.key, n: sb.lessons.length, week: w.week, day: d + 1, theme: w.theme }, l); L.id = sb.prefix + L.n; sb.lessons.push(L); BYID[L.id] = L; }));
  });
  const ALL = SUBJECTS.flatMap(sb => sb.lessons);
  /* Questions wired to a generator (js/data/gens.js) get fresh numbers each time they are asked. */
  function resolve(L, qi) {
    const base = L.q[qi], name = L.subj === 'math' && (window.GENS || {})[L.n + ':' + qi], gen = name && window.GEN[name];
    if (!gen) return base;
    try {
      const out = gen();
      if (!out || out.a == null || /undefined|NaN|Infinity/.test(JSON.stringify(out))) return base;
      return Object.assign({ l: base.l, gen: name }, out);
    } catch (e) { return base; }
  }
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  /* ---------- state ---------- */
  let S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || typeof S !== 'object') S = {};
    S.done = S.done || {}; S.right = S.right || {}; S.days = S.days || []; S.name = S.name || ''; S.plan = S.plan || 'rotate';
    S.skills = S.skills || {}; S.goal = S.goal | 0 || 3; S.hero = S.hero || {}; S.placed = S.placed || {}; S.removed = S.removed || {}; S.bee = Bee.norm(S.bee);
    if (S.pos && S.pos.id == null && S.pos.n != null) S.pos = { id: String(S.pos.n), step: S.pos.step | 0 }; // saved before subjects existed
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } if (window.Cloud) Cloud.pushSoon(); }
  load();
  // Optional Google sign-in (js/cloud.js): the cloud copy is merged in and the app redraws when it changes.
  if (window.Cloud) Cloud.attach({ get: () => S, apply: m => {
    // update in place, so a lesson that is open keeps writing into the same objects
    if ((m.resetAt || 0) > (S.resetAt || 0)) { S.right = {}; S.bee = Bee.blank(); }
    const right = S.right; Object.keys(m.right || {}).forEach(id => { right[id] = Object.assign(right[id] || {}, m.right[id]); });
    if (m.bee) S.bee = S.bee ? Object.assign(S.bee, m.bee) : m.bee;   // a spelling drill in progress keeps writing into the same object
    Object.keys(m).forEach(k => { if (k !== 'right' && k !== 'pos' && k !== 'bee') S[k] = m[k]; });
    load2(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ }
    if (['', 'map', 'review', 'parent'].includes((location.hash || '#/').slice(2).split('/')[0])) route(); // never redraw in the middle of a lesson
  } });
  // Safari can drop site data after ~7 idle days unless storage is persisted or the app is added to the Home Screen.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* unsupported */ }
  // Flush on every way Safari can background or close the page (iOS rarely fires unload).
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const isWeekend = () => [0, 6].includes(new Date().getDay());
  const nextIdx = sb => { const i = sb.lessons.findIndex(l => !S.done[l.id]); return i < 0 ? sb.lessons.length : i; };
  const doneCount = sb => sb ? sb.lessons.filter(l => S.done[l.id]).length : Object.keys(S.done).length;
  const starCount = () => Object.values(S.right).reduce((a, r) => a + Object.keys(r).length, 0);
  function markDay() { const t = todayStr(); if (!S.days.includes(t)) { S.days.push(t); save(); } }
  const streak = () => Adapt.streak(S.days, todayStr()); // weekends never break it; one missed weekday in five is forgiven

  /* ---------- helpers ---------- */
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (tag === 'button') e.type = 'button';
    if (/(^| )(fb|bee-feedback)( |$)/.test((attrs || {}).class || '')) { e.setAttribute('role', 'status'); e.setAttribute('aria-live', 'polite'); }
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), evt => {
        const adultControl = k === 'onclick' && /already know|mark as known|not done|Start this lesson over|Choose lessons to change/i.test(e.textContent);
        if (adultControl && window.GATE && !GATE.isUnlocked()) return GATE.require(() => v(evt), () => go('#/'));
        v(evt);
      }); else e.setAttribute(k, v);
    });
    kids.flat().forEach(c => e.append(c && c.nodeType ? c : document.createTextNode(c == null ? '' : c)));
    return e;
  };
  const vis = html => Visuals.expand(html);
  const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const doneLine = r => (r.skipped ? 'Marked as already known' : 'Completed') + (r.when ? ' ' + fmtDate(r.when) : '');
  const scoreText = r => r.skipped ? 'already known' : r.noscore ? 'done (score not saved)' : `${r.correct}/${r.total} correct`;
  const scoreShort = r => r.skipped ? 'known' : r.noscore ? 'done' : `${r.correct}/${r.total}`;
  /* "Already learned elsewhere": mark lessons done without any answers. Stars and streak are not affected, and real results are never overwritten. */
  const markKnown = L => { if (S.done[L.id]) return false; S.done[L.id] = { correct: 0, total: L.q.length, when: todayStr(), skipped: true, at: Date.now() }; return true; };
  const tomb = id => { S.removed = S.removed || {}; S.removed[id] = Date.now(); }; // lets the cloud know this was deliberate
  const unmarkKnown = L => { if (S.done[L.id] && S.done[L.id].skipped) { delete S.done[L.id]; tomb(L.id); return true; } return false; };
  /* "Unlearn": undo a completion (real or marked known). Stars for solved questions stay unless the lesson is started over. */
  const unmarkDone = L => { if (S.done[L.id]) { delete S.done[L.id]; tomb(L.id); return true; } return false; };
  const startOver = L => { unmarkDone(L); delete S.right[L.id]; };
  const lessonsUpTo = (sb, week) => sb.lessons.filter(l => l.week <= week);
  const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, '').replace(/[.!]+$/, '');
  function isCorrect(q, given) {
    const g = norm(given); if (!g) return false;
    const answers = [].concat(q.a).map(norm);
    if (answers.includes(g)) return true;
    const gm = g.match(/^\$?(-?\d+(?:\.\d+)?)[a-z$¢]*$/); // allow "8cm", "$5"
    return !!gm && answers.some(a => /^-?\d+(\.\d+)?$/.test(a) && parseFloat(a) === parseFloat(gm[1]));
  }
  const answerText = q => [].concat(q.a)[0] + (q.u ? ' ' + q.u : '');

  /* ---------- review picking ---------- */
  /* Look Back = skills the child found tricky or that are due again (spaced repetition), then earlier lessons at 1, 3, 7 and 14 lessons ago. */
  function lookBackQs(L0) {
    const out = [], n = L0.n, list = SUBJ[L0.subj].lessons, seen = new Set([L0.id]);
    Adapt.dueSkills(S, todayStr(), L0.id).slice(0, 2).forEach(d => {
      const L = BYID[d.id]; if (!L || seen.has(L.id)) return; seen.add(L.id);
      const qi = Adapt.pickQuestion(L, d.e, n);
      out.push({ L, qi, q: resolve(L, qi), why: d.weak ? 'monster rematch: tricky last time' : 'monster rematch: time for a refresher' });
    });
    [1, 3, 7, 14].forEach((k, i) => {
      const L = list[n - k]; if (!L || out.length >= 4 || seen.has(L.id)) return; seen.add(L.id);
      const pool = L.q.map((q, qi) => ({ q, qi })).filter(x => (i < 3 ? 'bc' : 'so').includes(x.q.l));
      const pick = pool[(n + k) % pool.length];
      out.push({ L, qi: pick.qi, q: resolve(L, pick.qi), ago: k });
    });
    return out;
  }
  /* A lower-level question from the same lesson (or fresh numbers), offered after two wrong tries. */
  function easierItem(it) {
    const tried = it.tried || [], idx = Adapt.easierIndex(it.L, it.qi, tried);
    if (idx >= 0) return { L: it.L, qi: idx, q: resolve(it.L, idx), tried: tried.concat(it.qi, idx) };
    if (it.L.subj === 'math' && (window.GENS || {})[it.L.n + ':' + it.qi]) return { L: it.L, qi: it.qi, q: resolve(it.L, it.qi), tried: tried.concat(it.qi), same: true };
    return null;
  }
  function mixedQs(lessons, count) {
    const all = [];
    lessons.forEach(L => L.q.forEach((q, qi) => all.push({ L, qi, q: resolve(L, qi) })));
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, count);
  }

  /* ---------- question widget ---------- */
  function questionEl(item, opts) {
    const { q } = item; opts = opts || {};
    let tries = 0, solved = false, tracked = false, easierShown = false;
    // Every question teaches the app what is easy or tricky (Adapt.record keeps a review box per skill).
    const track = ok => { if (tracked) return; tracked = true; Adapt.record(S, item.L.id, item.qi, ok, todayStr()); save(); if (opts.onResult) opts.onResult(ok); };
    const box = h('div', { class: 'q' });
    const lv = LV[q.l];
    const fb = h('div', { class: 'fb' });
    const extra = h('div');
    box.append(h('span', { class: 'qmon', html: monPic(item.L) }), h('span', { class: 'lv ' + q.l }, lv[1] + ' ' + lv[0]));
    if (opts.tag) box.append(' ', h('span', { class: 'muted small' }, opts.tag));
    box.append(h('div', { class: 'text' }, q.q));
    const qp = q.gen ? q.p : (q.p || (item.L.subj === 'math' ? (window.QPICS || {})[item.L.n + ':' + item.qi] : null));
    if (qp) box.append(h('div', { class: 'qpic', html: vis(qp) }));

    function showSol() { if (q.s) extra.append(h('div', { class: 'sol' }, '💡 ' + q.s)); }
    function win() {
      solved = true; box.classList.remove('wrong'); box.classList.add('right');
      track(tries === 0);
      fb.className = 'fb ok'; fb.textContent = ['You got it! ', 'Nice work! ', 'Correct! ', 'Great thinking! '][(item.qi + tries) % 4] + '✅';
      extra.replaceChildren(); showSol();
      if (opts.onRight) opts.onRight();
      box.querySelectorAll('input,button.chk').forEach(x => x.disabled = true);
    }
    function lose() {
      tries++; track(false); box.classList.add('wrong'); fb.className = 'fb no';
      fb.textContent = tries === 1 ? 'Not quite, brave knight. Have another go!' : 'Hmm, not yet. Try the hint, or tap Show answer.';
      extra.replaceChildren();
      const bar = h('div', { class: 'ans', style: 'margin-top:8px' });
      if (q.h) bar.append(h('button', { class: 'btn alt small', onclick: () => { hintEl.style.display = 'block'; } }, '💭 Hint'));
      if (tries >= 2) bar.append(h('button', { class: 'btn alt small', onclick: reveal }, 'Show answer'));
      if (tries >= 2 && !easierShown && !opts.noEasier) bar.append(h('button', { class: 'btn alt small', onclick: e => {
        const nx = easierItem(item); e.target.disabled = true;
        if (!nx) { e.target.textContent = 'No easier one left'; return; }
        easierShown = true;
        box.after(questionEl(nx, { tag: nx.same ? 'another one like it' : 'an easier one to build up', noEasier: !!nx.same }));
      } }, '🪜 Try an easier one'));
      extra.append(bar);
      if (q.h) extra.append(hintEl);
    }
    const hintEl = h('div', { class: 'hint', style: 'display:none' }, '💭 ' + (q.h || ''));
    function reveal() {
      solved = true; fb.className = 'fb'; fb.textContent = 'Answer: ' + answerText(q);
      extra.replaceChildren(); showSol();
      box.querySelectorAll('input,button.chk,.opts button').forEach(x => x.disabled = true);
    }
    function submit(val) { if (solved) return; if (isCorrect(q, val)) win(); else lose(); }

    if (q.o) {
      const wrap = h('div', { class: 'opts' });
      // Shuffle choices so the right answer is not always in the same spot, but keep naturally ordered sets (numbers, yes/no, odd/even, single letters) as written.
      const fixed = q.o.every(o => /^\d+$/.test(o) || o.length <= 1) || ['yes', 'no', 'odd', 'even', 'true', 'false', 'cm', 'm'].some(w => q.o.includes(w) && q.o.length === 2);
      (fixed ? q.o : q.o.map(o => [Math.random(), o]).sort((x, y) => x[0] - y[0]).map(x => x[1])).forEach(o => wrap.append(h('button', { onclick: e => { if (solved) return; submit(o); e.target.classList.add(solved && box.classList.contains('right') ? 'good' : 'picked'); } }, o)));
      box.append(wrap);
    } else {
      const input = h('input', { type: 'text', inputmode: (/^\d+$/.test(String([].concat(q.a)[0])) ? 'numeric' : 'text'), autocomplete: 'off', 'aria-label': 'Your answer', placeholder: 'Answer' });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(input.value); });
      box.append(h('div', { class: 'ans' }, input, q.u ? h('span', { class: 'muted' }, q.u) : '', h('button', { class: 'btn chk', onclick: () => submit(input.value) }, '⚔️ Check')));
    }
    box.append(fb, extra);
    return box;
  }

  /* ---------- views ---------- */
  function setNav(name) { document.querySelectorAll('[data-nav]').forEach(a => { const active = a.dataset.nav === name; a.classList.toggle('on', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
  const pillOf = L => `${SUBJ[L.subj].icon} ${SUBJ[L.subj].name} · Level ${L.week} · ${DAYS[L.day - 1]} · ${L.theme}`;
  let pick = null; // Set of lesson ids while choosing lessons to mark as known on the map
  function tile(L) {
    const done = S.done[L.id], nx = nextIdx(SUBJ[L.subj]) === L.n, choosing = !!pick;
    const a = h('a', { class: 'tile ' + (monsterFor(L).boss ? 'boss ' : '') + (done ? 'done ' : '') + (nx ? 'next ' : '') + (choosing ? 'pickable ' : '') + (choosing && pick.has(L.id) ? 'picked' : ''), href: '#/lesson/' + L.id },
      h('span', { class: 'tile-mon', html: monPic(L, '', !done && !nx) }), h('small', {}, `Level ${L.week} · quest ${L.day}${monsterFor(L).boss ? ' · 👑 boss' : ''}`), h('b', {}, (done ? '✅ ' : nx && !pick ? '▶ ' : '') + L.t),
      done ? h('small', {}, scoreText(done)) : '',
      done && done.when ? h('span', { class: 'stamp' }, '✔ ' + doneLine(done)) : '');
    if (choosing) a.addEventListener('click', e => { e.preventDefault(); if (pick.has(L.id)) pick.delete(L.id); else pick.add(L.id); route(); });
    return a;
  }
  function subjTabs(base, cur, withAll) {
    return h('div', { class: 'subj-tabs' }, (withAll ? [{ key: 'all', icon: '🌟', name: 'All' }] : []).concat(SUBJECTS).map(sb => h('a', { class: sb.key === cur ? 'on ' + sb.key : sb.key, href: '#/' + base + '/' + sb.key }, `${sb.icon} ${sb.name}`)));
  }
  /* Which subjects are "today's" work. Maths every weekday; English on Mon/Wed/Fri and Science on Tue/Thu (the plan can be changed in Parent corner). */
  function todayPlan() {
    const dow = new Date().getDay(), weekend = dow === 0 || dow === 6, plan = S.plan || 'rotate';
    let main = ['math'];
    if (plan === 'all') main = ['math', 'eng', 'sci'];
    else if (plan === 'rotate') main = ['math', [1, 3, 5].includes(dow) ? 'eng' : 'sci'];
    return { weekend, main: weekend ? [] : main, optional: SUBJECTS.map(x => x.key).filter(k => weekend || !main.includes(k)) };
  }
  /* ---- home: a friendly little knight, quest cards, monster book ---- */
  const MONSTER = `<svg class="mon" viewBox="0 0 100 100" aria-hidden="true"><path d="M22 30 L30 6 L44 24 Z M78 30 L70 6 L56 24 Z" fill="#f4ead2" stroke="#c9b98f" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="30" cy="94" rx="12" ry="6" fill="#ff9f43"/><ellipse cx="70" cy="94" rx="12" ry="6" fill="#ff9f43"/><path d="M50 14 C80 14 92 38 90 60 C88 84 72 94 50 94 C28 94 12 84 10 60 C8 38 20 14 50 14Z" fill="#8f6bff"/><ellipse cx="50" cy="74" rx="26" ry="17" fill="#b9a2ff"/><circle cx="24" cy="44" r="4" fill="#7551e6"/><circle cx="78" cy="38" r="3.4" fill="#7551e6"/><circle cx="72" cy="60" r="3" fill="#7551e6"/><circle cx="37" cy="46" r="12" fill="#fff"/><circle cx="63" cy="46" r="12" fill="#fff"/><circle class="pupil" cx="39" cy="48" r="6" fill="#2b2a4c"/><circle class="pupil" cx="61" cy="48" r="6" fill="#2b2a4c"/><circle cx="41" cy="45.5" r="2" fill="#fff"/><circle cx="63" cy="45.5" r="2" fill="#fff"/><path d="M34 68 Q50 84 66 68 Z" fill="#3b1f66"/><path d="M42 69.5 V75 M58 69.5 V75" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
  const knightHtml = () => KnightWear.svg(S.hero.worn);
  const ICONS = {
    math: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="6" width="26" height="26" rx="6" fill="#7fe0c2" stroke="#fff" stroke-width="3"/><rect x="4" y="34" width="26" height="26" rx="6" fill="#ffd84d" stroke="#fff" stroke-width="3"/><rect x="34" y="34" width="26" height="26" rx="6" fill="#ff7a90" stroke="#fff" stroke-width="3"/><g font-family="ui-rounded,system-ui" font-weight="800" font-size="20" fill="#fff" text-anchor="middle"><text x="31" y="27">3</text><text x="17" y="55">1</text><text x="47" y="55">2</text></g></svg>`,
    eng: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 14 Q32 4 32 14 V56 Q32 46 6 56 Z" fill="#fff"/><path d="M58 14 Q32 4 32 14 V56 Q32 46 58 56 Z" fill="#ffe6a3"/><path d="M32 14 V56" stroke="#0f9d8a" stroke-width="3"/><text x="19" y="42" font-family="ui-rounded,system-ui" font-weight="800" font-size="22" fill="#0f9d8a" text-anchor="middle">A</text><text x="45" y="42" font-family="ui-rounded,system-ui" font-weight="800" font-size="22" fill="#e0862b" text-anchor="middle">b</text></svg>`,
    sci: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M25 6 h14 v18 l15 27 q4 9 -6 9 h-32 q-10 0 -6 -9 l15 -27 z" fill="#fff" fill-opacity=".92"/><path d="M17 44 h30 l7 12 q1 3 -3 3 h-38 q-4 0 -3 -3 z" fill="#7fe0c2"/><circle cx="28" cy="38" r="3" fill="#fff"/><circle cx="37" cy="30" r="2.4" fill="#fff"/><circle cx="34" cy="46" r="2" fill="#fff"/></svg>`
  };
  /* A random fun fact each time; never the same one twice in a row, even across page loads. */
  const nextFact = () => {
    const T = window.TRIVIA || [`Knights in shining armour were once children who trained hard, just like you.`]; let last = -1;
    try { last = +sessionStorage.getItem('lastFact'); } catch (e) { /* private mode */ }
    let i; do { i = Math.floor(Math.random() * T.length); } while (T.length > 1 && i === last);
    try { sessionStorage.setItem('lastFact', String(i)); } catch (e) { /* private mode */ }
    return T[i];
  };
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
  function subjCard(sb, primary) {
    const n = nextIdx(sb), L = sb.lessons[n], icon = h('div', { class: 'sc-icon', html: L ? monPic(L) : ICONS[sb.key] });
    if (!L) return h('section', { class: 'sc ' + sb.key }, icon, h('div', { class: 'sc-body' }, h('h2', {}, sb.name), h('p', {}, 'You finished every lesson!')), h('a', { class: 'go', href: '#/map/' + sb.key }, 'Map'));
    const cont = S.pos && S.pos.id === L.id && S.pos.step > 0;
    const card = h('section', { class: 'sc ' + sb.key + (primary ? '' : ' extra') }, icon,
      h('div', { class: 'sc-body' }, h('span', { class: 'sc-tag' }, sb.name + ' · ' + sb.realm + (primary ? '' : ' · extra')), h('h2', {}, L.t),
        h('div', { class: 'meter light' }, h('i', { style: `width:${doneCount(sb) / sb.lessons.length * 100}%` })), h('small', {}, `Meet ${monsterFor(L).name} · Quest ${n + 1}`)),
      h('a', { class: 'go', href: '#/lesson/' + L.id }, cont ? 'Keep going' : 'Start!'));
    const skip = h('button', { class: 'linkbtn', onclick: () => { if (confirm(`Mark "${L.t}" as already known? It will count as done without any questions. You can undo this.`)) { markKnown(L); const nx = sb.lessons.find(l => !S.done[l.id]); S.pos = nx ? { id: nx.id, step: 0 } : null; save(); route(); } } }, 'I already know this one');
    const check = doneCount(sb) === 0 && !S.placed[sb.key] ? h('a', { class: 'linkbtn', href: '#/placement/' + sb.key }, 'Not sure where to start? Take a quick check') : '';
    return h('div', { class: 'sc-wrap' }, card, window.GATE && GATE.isUnlocked() ? skip : '', check);
  }

  /* A newly earned piece of armour (one per 3 study days) is worn straight away and announced once. */
  function knightNews() {
    const fresh = KnightWear.sync(S.hero, S.days.length); if (!fresh.length) return null; save();
    return h('div', { class: 'news' }, h('b', {}, '🎉 New armour for your knight: '), fresh.map(a => a.name).join(', '), '! ', h('span', { class: 'muted small' }, 'It is wearing it now. Tap "Armoury" to change.'));
  }
  function wardrobe(onChange) {
    const n = KnightWear.earned(S.days.length), box = h('div', { class: 'ward' });
    KnightWear.ACC.forEach((a, i) => {
      const got = i < n, on = got && (S.hero.worn || {})[a.slot] === a.id;
      const b = h('button', { class: 'acc' + (on ? ' on' : '') + (got ? '' : ' locked'), 'aria-pressed': String(on), title: got ? a.name : `Unlocks after ${(i + 1) * KnightWear.EVERY} study days`,
        onclick: () => { if (KnightWear.toggle(S.hero, a.id, S.days.length)) { save(); onChange(); } } },
        h('span', { class: 'acc-pic', html: got ? KnightWear.svg({ [a.slot]: a.id }, null, a.name) : '🔒' }), h('small', {}, got ? a.name : `After ${(i + 1) * KnightWear.EVERY} days`));
      if (!got) b.disabled = true;
      box.append(b);
    });
    return box;
  }
  const friendCount = () => ALL.filter(L => S.done[L.id] && !S.done[L.id].skipped).length;
  function goalCard() {
    const st = streak(), wk = Adapt.week(S.days, todayStr()), goal = Math.min(5, Math.max(1, S.goal)), left = goal - wk.count, nxt = KnightWear.untilNext(S.days.length);
    const rk = Monsters.rank(doneCount());
    const card = h('section', { class: 'goal' },
      h('div', { class: 'rank' }, h('b', {}, `${rk.icon} Rank: ${rk.name}`), rk.name === 'Page' ? h('small', {}, 'A Page is a new knight in training.') : rk.name === 'Squire' ? h('small', {}, 'A Squire is a knight’s helper.') : '', h('div', { class: 'meter' }, h('i', { style: `width:${rk.pct}%` })), h('small', { class: 'muted' }, rk.next ? `${rk.next.left} more quest${rk.next.left > 1 ? 's' : ''} to become a ${rk.next.name}` : 'The highest rank!')),
      h('div', { class: 'goal-top' }, h('b', {}, `🔥 ${st} ${st === 1 ? 'day' : 'days'} in a row`), h('span', { class: 'muted small' }, `Quest goal: ${goal} evening${goal > 1 ? 's' : ''} this week`)),
      h('div', { class: 'goal-days' }, wk.days.map((d, i) => h('div', { class: 'gd' + (d.on ? ' on' : '') + (d.today ? ' today' : '') }, h('small', {}, DAYS[i]), h('span', {}, d.on ? '⭐' : '')))),
      h('p', { class: 'goal-msg' }, left <= 0 ? '🎯 Quest goal reached. Well done, brave knight!' : `${left} more evening${left > 1 ? 's' : ''} to reach this week's quest goal.`),
      h('p', { class: 'goal-gear' }, nxt ? `🛡️ New armour after ${nxt} more study day${nxt > 1 ? 's' : ''}. (${KnightWear.earned(S.days.length)} of ${KnightWear.ACC.length} collected)` : '🛡️ Your knight has every piece of armour!'));
    return { card };
  }
  /* The sign-in chip in the header: who is signed in, and whether their progress is being saved to the cloud. */
  function drawAcct() {
    const el = document.getElementById('acct'); if (!el || !window.Cloud) return;
    const c = Cloud.status(); let cls, label, tip;
    if (c.signedIn) {
      const nm = (c.name || c.email.split('@')[0]).split(' ')[0];
      cls = c.state === 'synced' ? 'ok' : c.state === 'syncing' || c.state === 'loading' ? 'busy' : 'bad';
      label = nm; tip = `Signed in as ${c.email}. ` + (c.state === 'synced' ? 'Progress is saved to the cloud.' : c.state === 'syncing' ? 'Saving...' : c.message || 'Not saved to the cloud right now.');
    } else if (c.checking) { cls = 'busy'; label = '...'; tip = 'Checking sign-in'; }
    else { cls = 'out'; label = 'Sign in'; tip = 'Not signed in: progress is only on this device. Grown-ups can sign in with Google to keep it safe.'; }
    el.className = 'acct ' + cls; el.title = tip; el.setAttribute('aria-label', tip);
    el.replaceChildren(h('span', { class: 'acct-dot', 'aria-hidden': 'true' }), h('span', { class: 'acct-name' }, (c.signedIn ? '👤 ' : '🔒 ') + label));
  }
  if (window.Cloud) { Cloud.onChange(drawAcct); drawAcct(); }
  /* The child's name is saved as it is typed (and when the box is left), so it is never lost by forgetting a Save button. */
  function bindName(input, note) {
    let t = null;
    const commit = () => { clearTimeout(t); const v = input.value.trim().slice(0, 30); if (v === (S.name || '')) return; S.name = v; S.setAt = Date.now(); save(); if (note) note.textContent = v ? 'Saved ✓' : 'Name cleared'; };
    input.addEventListener('input', () => { if (note) note.textContent = 'Saving...'; clearTimeout(t); t = setTimeout(commit, 500); });
    input.addEventListener('change', commit); input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); input.blur(); } });
  }
  function viewHome() {
    setNav('home');
    const frag = h('div'), plan = todayPlan();
    const news = knightNews(); // may give the knight new armour, so do it before the knight is drawn
    const fact = h('span', {}), hop = () => { const o = frag.querySelector('.kn-wrap'); if (o) { o.classList.remove('hop'); void o.offsetWidth; o.classList.add('hop'); } };
    const another = () => { fact.textContent = nextFact(); const panel = fact.closest('details'); if (panel) panel.open = true; hop(); };
    fact.textContent = nextFact();
    frag.append(h('section', { class: 'hello' }, h('button', { class: 'kn-wrap', 'aria-label': 'Tap the knight for a fun fact', onclick: another, html: knightHtml() }),
      h('div', { class: 'bubble' }, h('h1', {}, `${greeting()}, ${S.name || 'brave knight'}!`),
        h('p', {}, 'Pick a quest. Let’s play!'), h('details', { class: 'home-fact' }, h('summary', {}, 'Tell me a fun fact!'), h('p', { class: 'fact' }, h('b', {}, 'Did you know? '), fact), h('button', { class: 'linkbtn', onclick: another }, 'Tell me another!'))), h('div', { class: 'buddy', html: MONSTER })));
    if (news) frag.append(news);
    if (!S.name) { const hi = h('input', { type: 'text', 'aria-label': 'Your name', placeholder: 'Type your name', maxlength: 30, style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' }), ok = h('span', { class: 'muted small', role: 'status' }); bindName(hi, ok); frag.append(h('section', { class: 'card' }, h('h3', {}, 'What is your name, brave knight?'), h('div', { class: 'ans' }, hi, h('button', { class: 'btn', onclick: () => { hi.blur(); if (S.name) route(); } }, 'That is me!'), ok))); }
    const refreshKnight = () => { const o = frag.querySelector('.kn-wrap'); if (o) o.innerHTML = knightHtml(); };
    const gc = goalCard(), wardEl = h('div', { class: 'ward-wrap', style: 'display:none' });
    const drawWard = () => wardEl.replaceChildren(wardrobe(() => { refreshKnight(); drawWard(); }));
    drawWard();
    frag.append(gc.card, h('button', { class: 'linkbtn', style: 'margin:6px 0 0', onclick: () => { wardEl.style.display = wardEl.style.display === 'none' ? 'block' : 'none'; } }, '🛡️ Open the armoury'), wardEl);
    if (window.BeeUI) frag.append(BeeUI.homeCard());
    frag.append(h('h2', { class: 'sect' }, plan.weekend ? 'Pick a quest' : 'Today\'s quests'));
    plan.main.forEach(k => frag.append(subjCard(SUBJ[k], true)));
    if (plan.optional.length) {
      frag.append(h('h2', { class: 'sect' }, plan.main.length ? 'Want more quests?' : 'All quests'));
      plan.optional.forEach(k => frag.append(subjCard(SUBJ[k], false)));
    }
    frag.append(h('div', { class: 'chips' },
      h('div', { class: 'chip' }, h('b', {}, '🪙 ' + starCount()), 'gold coins'),
      h('div', { class: 'chip' }, h('b', {}, S.days.length), S.days.length === 1 ? 'study day' : 'study days'),
      h('div', { class: 'chip' }, h('b', {}, `${friendCount()}/${ALL.length}`), 'monster friends')));
    frag.append(h('a', { class: 'quick', href: '#/review' }, h('span', { class: 'quick-die', html: '⚔️' }), h('span', {}, h('b', {}, 'Monster training'), h('br'), 'Practise with questions from lessons you have done')));
    const book = h('section', { class: 'book' }, h('h2', { class: 'sect' }, 'My monster book'), h('p', { class: 'muted book-note' }, 'Finish a quest to make a monster friend. Big Bosses wear crowns.'));
    SUBJECTS.forEach(sb => {
      const nx = nextIdx(sb);
      book.append(h('div', { class: 'book-row' }, h('div', { class: 'book-label' }, h('b', {}, sb.name), h('small', {}, `${doneCount(sb)} of ${sb.lessons.length}`)),
        h('div', { class: 'stickers' }, sb.lessons.map(L => { const r = S.done[L.id], m = monsterFor(L); return h('a', { class: `stk ${sb.key} ${r ? (r.skipped ? 'known' : 'got') : ''} ${L.n === nx ? 'next' : ''}${m.boss ? ' bossk' : ''}`, href: '#/lesson/' + L.id, title: r && !r.skipped ? `${m.name}: ${L.t}` : (r ? L.t : `A monster is waiting: ${L.t}`), 'aria-label': L.t + (r ? ' (done)' : ''), html: monPic(L, '', !r) + (r && r.skipped ? '<b class="chk">✓</b>' : '') }); }))));
    });
    frag.append(book);
    const intro = frag.querySelector('.hello');
    intro.classList.add('home-guide');
    const firstHeading = Array.from(frag.children).find(el => el.tagName === 'H2');
    const questNodes = []; let collecting = false;
    Array.from(frag.children).forEach(el => { if (el === firstHeading) collecting = true; if (collecting && (el.tagName === 'H2' || el.classList.contains('sc-wrap') || el.classList.contains('sc'))) questNodes.push(el); else if (collecting) collecting = false; });
    intro.remove();
    frag.prepend(intro, ...questNodes);
    app(frag);
  }

  function viewMap(key) {
    setNav('map');
    const sb = SUBJ[key] || SUBJECTS[0];
    const adult = window.GATE && GATE.isUnlocked();
    if (!adult || (pick && pick.subj !== sb.key)) pick = null;
    const frag = h('div', {}, h('h1', {}, 'Quest Map'), subjTabs('map', sb.key), h('p', { class: 'muted' }, `${sb.blurb} 8 levels, 5 quests each. The last quest of every level is a Big Boss. Tap a quest to open it.`));
    if (!pick && doneCount(sb) === 0) frag.append(h('div', { class: 'known-card' }, h('span', {}, 'Not sure where to start? A short check (2 questions at a time) finds the right lesson.'), h('a', { class: 'btn', href: '#/placement/' + sb.key }, 'Take the quick check')));
    if (adult && !pick) frag.append(h('div', { class: 'known-card' }, h('span', {}, 'Learned some already, or pressed done by mistake?'), h('button', { class: 'btn', onclick: () => { pick = new Set(); pick.subj = sb.key; route(); } }, 'Choose lessons to change')));
    else if (adult && pick) {
      const ids = [...pick], toKnow = ids.filter(id => !S.done[id]), toReset = ids.filter(id => S.done[id]);
      frag.append(h('div', { class: 'pickbar' }, h('b', {}, ids.length ? `${ids.length} chosen` : 'Tap the lessons to change'),
        h('button', Object.assign({ class: 'btn', onclick: () => { if (confirm(`Mark ${toKnow.length} lesson${toKnow.length > 1 ? 's' : ''} as already known? They will count as done without any questions. You can undo this.`)) { toKnow.forEach(id => markKnown(BYID[id])); pick = null; save(); route(); } } }, toKnow.length ? {} : { disabled: 'disabled' }), `Mark as known${toKnow.length ? ' (' + toKnow.length + ')' : ''}`),
        h('button', Object.assign({ class: 'btn alt', onclick: () => { if (confirm(`Mark ${toReset.length} lesson${toReset.length > 1 ? 's' : ''} as not done? Scores and dates for them are removed. Stars for solved questions are kept.`)) { toReset.forEach(id => unmarkDone(BYID[id])); pick = null; save(); route(); } } }, toReset.length ? {} : { disabled: 'disabled' }), `↩ Mark as not done${toReset.length ? ' (' + toReset.length + ')' : ''}`),
        h('button', { class: 'btn alt', onclick: () => { pick = null; route(); } }, 'Cancel')));
    }
    const currentWeek = (sb.lessons.find(l => !S.done[l.id]) || sb.lessons[sb.lessons.length - 1]).week;
    sb.weeks.forEach(w => {
      const level = h('details', Object.assign({ class: 'map-level fold' }, w.week === currentWeek || pick ? { open: '' } : {}));
      const wl = sb.lessons.filter(l => l.week === w.week), wd = wl.filter(l => S.done[l.id]);
      const last = wd.map(l => S.done[l.id].when).sort().pop();
      const todo = wl.filter(l => !S.done[l.id]), known = wl.filter(l => S.done[l.id] && S.done[l.id].skipped);
      level.append(h('summary', { class: 'weekh' }, h('span', {}, `🏰 Level ${w.week}: ${w.theme}`),
        h('span', { class: 'wk' + (wd.length === wl.length ? ' ok' : '') }, wd.length === wl.length ? `✅ Level cleared ${fmtDate(last)}` : `${wd.length}/${wl.length} quests done`)), h('p', { class: 'muted' }, w.blurb), (() => { const bl = wl[wl.length - 1], bm = monsterFor(bl); return h('p', { class: 'bossline' }, h('span', { class: 'boss-pic', html: monPic(bl, '', !S.done[bl.id]) }), `👑 Big Boss of this level: ${bm.name}` + (S.done[bl.id] ? ' (your friend!)' : '')); })(),
        adult ? h('div', { class: 'known-row' },
          todo.length ? h('button', { class: 'btn alt small', onclick: () => { if (confirm(`Mark the ${todo.length} unfinished lesson${todo.length > 1 ? 's' : ''} in Level ${w.week} as already known? They will count as done without questions. You can undo this.`)) { todo.forEach(markKnown); save(); route(); } } }, `✔ Already know all of Level ${w.week}`) : '',
          known.length ? h('button', { class: 'btn alt small', onclick: () => { known.forEach(unmarkKnown); save(); route(); } }, `↩ Undo ${known.length} marked as known`) : '',
          wd.length ? h('button', { class: 'btn alt small', onclick: () => { if (confirm(`Mark all ${wd.length} finished lesson${wd.length > 1 ? 's' : ''} in Level ${w.week} as not done? Scores and dates for them are removed. Stars for solved questions are kept.`)) { wd.forEach(unmarkDone); save(); route(); } } }, `↩ Mark Level ${w.week} as not done`) : '') : '');
      level.append(h('div', { class: 'grid' }, wl.map(tile)));
      frag.append(level);
    });
    app(frag);
  }

  /* Longer explanation, worked example, common mistakes, talk prompts and vocabulary (js/data/deep-*.js). */
  function deepSections(L, body) {
    const d = (window.DEEP || {})[L.id]; if (!d) return;
    const sec = (cls, title, ...kids) => body.append(h('section', { class: 'deep ' + cls }, h('h3', {}, title), ...kids));
    sec('why', '📖 Read together', d.why.map(p => h('p', { html: p })));
    sec('worked', '✏️ Try it step by step: ' + d.worked.t, h('ol', {}, d.worked.s.map(t => h('li', { html: t }))));
    sec('watch', '🐉 Watch out for', h('ul', {}, d.watch.map(t => h('li', { html: t }))));
    sec('talk', '🏰 Talk about it', h('ul', {}, d.talk.map(t => h('li', { html: t }))));
    sec('words', '📜 Words to know', h('div', { class: 'wordlist' }, d.words.map(w => h('div', { class: 'word' }, h('b', {}, w[0]), h('span', {}, w[1])))));
  }
  /* Free outside resources found by web search (js/data/links.js). */
  function linkSection(L, body) {
    const ls = (window.LINKS || {})[L.id]; if (!ls || !ls.length) return;
    body.append(h('section', { class: 'deep links' }, h('h3', {}, '🗺️ Explore more (free websites)'),
      h('ul', {}, ls.map(x => h('li', {}, h('a', { href: x[1], target: '_blank', rel: 'noopener noreferrer' }, x[0]), h('span', { class: 'muted' }, ' · ' + x[2])))),
      h('p', { class: 'muted small' }, 'These are outside websites. A grown-up should open them first. Some pages have adverts, and pages can change or move.')));
  }

  /* The battle scene at the top of a lesson: the knight against the lesson's monster. Solving puzzles calms the monster until it becomes a friend. */
  function arena(L) {
    const mon = monsterFor(L), total = L.q.length, right = () => S.right[L.id] || {}, sb = SUBJ[L.subj];
    const foe = h('div', { class: 'ar-foe' }), calm = h('i'), msg = h('div', { class: 'ar-msg' }), pct = h('span', { class: 'ar-pct' });
    const box = h('section', { class: `arena realm-${L.subj}${mon.boss ? ' boss' : ''}` },
      h('div', { class: 'ar-realm' }, `${sb.icon} ${sb.realm}${mon.boss ? ' · 👑 Boss challenge' : ''}`),
      h('div', { class: 'ar-scene' }, h('div', { class: 'ar-knight', html: knightHtml() }), h('div', { class: 'ar-vs' }, 'VS'), foe),
      h('div', { class: 'ar-calm' }, h('span', {}, 'Puzzles solved'), h('div', { class: 'meter' }, calm), pct), msg);
    function update(hit) {
      const g = Math.min(total, Object.keys(right()).length), d = S.done[L.id], friend = !!d || g >= total, ratio = friend ? 1 : g / total;
      foe.innerHTML = Monsters.svg(mon.i, { boss: mon.boss, tamed: friend });
      calm.style.width = Math.round(ratio * 100) + '%'; pct.textContent = Math.round(ratio * 100) + '%';
      box.classList.toggle('tamed', friend);
      msg.textContent = d && d.skipped ? `${mon.name} is already your friend.` : friend ? `${mon.name} is your new friend!` : g ? `${g} of ${total} puzzles solved. Keep helping ${mon.name}!` : `Help ${mon.name} solve the puzzles!`;
      if (hit) { box.classList.remove('hit'); void box.offsetWidth; box.classList.add('hit'); }
    }
    update(false);
    return { el: box, update };
  }

  function viewLesson(id) {
    setNav('home');
    const L = BYID[id]; if (!L) return go('#/');
    const sb = SUBJ[L.subj];
    const stepsBase = [['🛡️ Look Back', 'lb'], ['📜 Learn', 'learn'], ['✏️ Practice', 'prac'], ['🐉 Challenge', 'chal'], ['🏰 Wrap-up', 'wrap']];
    let cur = S.pos && S.pos.id === id ? Math.min(S.pos.step | 0, stepsBase.length - 1) : 0; const seen = new Set();
    const wrap = h('div');
    const right = S.right[id] = S.right[id] || {};
    const Q = L.q.map((_, qi) => resolve(L, qi)); // fixed for this visit so numbers do not change between steps
    const counts = () => Object.keys(right).length;
    const pracIdx = Q.map((q, qi) => qi).filter(qi => 'bc'.includes(Q[qi].l));
    const pracSolved = () => pracIdx.filter(qi => right[qi]).length;
    const chalLocked = () => !S.done[id] && !Adapt.practiceSolid(pracIdx.length, pracSolved()); // Challenge opens once Practice is mostly solved
    let ar = null;
    function draw() {
      wrap.replaceChildren();
      ar = arena(L);
      if (cur > 0) ar.el.classList.add('arena-compact');
      const steps = stepsBase.map(st => st[1] === 'chal' && chalLocked() ? ['🔒 Challenge', 'chal'] : st);
      wrap.append(h('span', { class: 'pill dark ' + L.subj }, pillOf(L)), h('h1', {}, L.t), ar.el);
      if (S.done[id]) {
        wrap.append(h('div', { class: 'badge-done' }, `✅ ${doneLine(S.done[id])}${S.done[id].skipped ? '' : ' · ' + scoreText(S.done[id])}`));
        if (window.GATE && GATE.isUnlocked()) wrap.append(h('div', { class: 'known-row' },
          h('button', { class: 'btn alt small', onclick: () => { if (confirm('Mark this lesson as not done? The score and date are removed. Stars for solved questions are kept.')) { unmarkDone(L); save(); draw(); } } }, '↩ Mark as not done'),
          Object.keys(S.right[id] || {}).length ? h('button', { class: 'btn alt small', onclick: () => { if (confirm('Start this lesson over? The score, date and all stars for this lesson are removed.')) { startOver(L); Object.keys(right).forEach(k => delete right[k]); save(); draw(); } } }, '🔄 Start this lesson over') : ''));
      } else if (window.GATE && GATE.isUnlocked()) {
        wrap.append(h('div', { class: 'known-card' }, h('span', {}, 'Learned this before, somewhere else?'), h('button', { class: 'btn', onclick: () => { if (confirm('Mark this lesson as already known? It will count as done without any questions. You can undo this.')) { markKnown(L); S.pos = { id: (sb.lessons[L.n + 1] || L).id, step: 0 }; save(); go('#/map/' + L.subj); } } }, '✔ I already know this')));
      }
      wrap.append(h('div', { class: 'steps' }, steps.map((st, i) => h('button', { 'aria-current': i === cur ? 'step' : 'false', class: (i === cur ? 'on ' : '') + (seen.has(i) && i !== cur ? 'done' : ''), onclick: () => { cur = i; draw(); window.scrollTo(0, 0); } }, st[0]))));
      seen.add(cur); S.pos = { id, step: cur }; save();
      const body = h('section', { class: 'card' });
      const kind = steps[cur][1];
      if (kind === 'lb') {
        const qs = lookBackQs(L);
        body.append(h('h2', {}, '🛡️ Look Back'));
        if (!qs.length) body.append(h('p', {}, 'This is one of the first lessons, so there is nothing to look back on yet. Let us begin!'));
        else {
          body.append(h('p', { class: 'muted' }, 'Before something new, remember something old.'));
          qs.forEach(x => body.append(h('div', { class: 'callout' }, h('b', {}, x.L.t + ': '), x.L.key), questionEl(x, { tag: x.why || `from ${x.ago} lesson${x.ago > 1 ? 's' : ''} ago` })));
        }
      } else if (kind === 'learn') {
        body.append(h('h2', {}, '📜 Today we learn: ' + L.sk), h('div', { class: 'key' }, '⚔️ Your quest: ' + L.goal));
        const pics = L.subj === 'math' ? (window.PICS || {})[L.n] || [] : [];
        L.learn.forEach((p, i) => {
          body.append(h('div', { class: 'learn-p', html: vis(p) }));
          pics.filter(x => x[0] === i).forEach(x => body.append(h('div', { html: vis(x[1]) })));
        });
        deepSections(L, body);
        body.append(h('div', { class: 'key' }, '📜 Scroll of wisdom: ' + L.key), h('div', { class: 'callout do', html: themeText(L.do) }), h('div', { class: 'callout oly', html: themeText(L.tip) }),
          h('div', { class: 'callout small', html: '<b>Parent note:</b> ' + L.parent }));
        linkSection(L, body);
      } else if (kind === 'chal' && chalLocked()) {
        body.append(h('h2', {}, '🔒 The Dragon\'s Gate is still closed'),
          h('p', {}, `It opens when you have solved most of the Practice questions. You have solved ${pracSolved()} of ${pracIdx.length} so far.`),
          h('p', { class: 'muted' }, 'Try the Practice puzzles first. Then come back for this challenge!'),
          h('button', { class: 'btn', onclick: () => { cur = 2; draw(); window.scrollTo(0, 0); } }, '⚔️ Back to Practice'));
      } else if (kind === 'prac' || kind === 'chal') {
        const set = Q.map((q, qi) => ({ q, qi })).filter(x => (kind === 'prac' ? 'bc' : 'so').includes(x.q.l));
        body.append(h('h2', {}, kind === 'prac' ? '✏️ Practice' : '🐉 Dragon challenge'),
          h('p', { class: 'muted' }, kind === 'prac' ? (L.subj === 'math' ? 'Draw a picture if you get stuck.' : 'Read the question. Need help? Read it again.') : 'These are harder. Think, try, and use hints if you need them.'));
        set.forEach(x => {
          const el = questionEl({ q: x.q, qi: x.qi, L }, { onRight: () => { right[x.qi] = true; markDay(); save(); ar.update(true); } });
          if (right[x.qi]) el.append(h('div', { class: 'muted small' }, '🪙 You won a coin for this one before.'));
          body.append(el);
        });
      } else {
        const total = L.q.length, got = counts(), nx = sb.lessons[L.n + 1];
        body.append(h('h2', {}, '🏰 Wrap-up'),
          h('p', { class: 'bigstars' }, '⭐'.repeat(Math.round((got / total) * 5)) + '☆'.repeat(5 - Math.round((got / total) * 5))),
          h('p', {}, `You solved ${got} of ${total} puzzles. ${got >= total ? 'You helped ' + monsterFor(L).name + '!' : 'Keep helping ' + monsterFor(L).name + '!'}`),
          h('div', { class: 'key' }, '📜 ' + L.key), h('p', {}, 'Tell a grown-up in your own words what you learned today.'),
          got < total ? h('p', { class: 'muted' }, 'Some questions are still unsolved. Go back and try them, or finish now. They will come back in Look Back.') : '');
        body.append(h('button', { class: 'btn', onclick: () => { S.done[id] = { correct: counts(), total, when: (S.done[id] && S.done[id].when) || todayStr(), last: todayStr(), at: Date.now() }; S.pos = { id: nx ? nx.id : id, step: 0 }; markDay(); save(); go('#/done/' + id); } }, S.done[id] ? 'Save again' : '🏰 Finish quest'));
      }
      wrap.append(body);
      const nav = h('div', { class: 'ans' });
      if (cur > 0) nav.append(h('button', { class: 'btn alt', onclick: () => { cur--; draw(); window.scrollTo(0, 0); } }, '◀ Back'));
      if (cur < steps.length - 1) nav.append(h('button', { class: 'btn', onclick: () => { cur++; draw(); window.scrollTo(0, 0); } }, 'Next ▶'));
      wrap.append(nav);
    }
    draw(); app(wrap);
  }

  function viewDone(id) {
    setNav('home');
    const L = BYID[id]; if (!L) return go('#/');
    const nx = SUBJ[L.subj].lessons[L.n + 1], r = S.done[id], mon = monsterFor(L);
    const news = knightNews();
    app(h('div', {}, news || '', h('section', { class: 'card hero ' + L.subj }, h('h1', {}, mon.boss ? '👑 Big Boss quest complete!' : '🏰 Quest complete!'), h('p', {}, `${SUBJ[L.subj].icon} ${L.t}: ${r ? scoreText(r) : ''}`),
      r && !r.skipped ? h('div', { class: 'newmon' }, h('span', { class: 'newmon-face', html: Monsters.svg(mon.i, { boss: mon.boss, tamed: true }) }), h('span', {}, h('b', {}, mon.boss ? `${mon.name}, the Big Boss, is your new friend!` : `${mon.name} is your new monster friend!`), h('br'), 'Find it in your monster book on the home page.')) : '',
      h('div', { class: 'sparkles', 'aria-hidden': 'true' }, ['✨', '⭐', '🎉', '✨', '⭐', '🎉', '✨', '⭐'].map((e, k) => h('span', { style: `left:${8 + k * 12}%;animation-delay:${(k % 4) * 0.25}s` }, e))),
      nx ? h('p', {}, 'Next time: ' + nx.t) : h('p', {}, `🎓 That was the last ${SUBJ[L.subj].name} quest!`), h('a', { class: 'btn light', href: '#/' }, 'Back home'))));
  }

  /* ---- quick placement check: 2 questions from every 5th lesson, stops at the first miss ---- */
  function viewPlacement(key) {
    setNav('home');
    const sb = SUBJ[key]; if (!sb) return go('#/');
    const probes = Adapt.probes(sb.lessons.length), passed = [], wrap = h('div');
    function finish() {
      const k = Adapt.placement(probes, passed), todo = sb.lessons.slice(0, k).filter(l => !S.done[l.id]);
      S.placed[sb.key] = todayStr(); save();
      wrap.replaceChildren(h('h1', {}, 'Trial finished'), todo.length
        ? h('section', { class: 'card' }, h('p', {}, `Great work! The first ${k} ${sb.name} lessons look easy for you (up to "${sb.lessons[k - 1].t}").`),
          h('p', { class: 'muted' }, 'Skipping marks them as already known. You can undo it any time from the map, and they still show up in Look Back.'),
          h('button', { class: 'btn', onclick: () => { todo.forEach(markKnown); const nx = sb.lessons.find(l => !S.done[l.id]); S.pos = nx ? { id: nx.id, step: 0 } : null; save(); go('#/'); } }, `Skip ${todo.length} lesson${todo.length > 1 ? 's' : ''} and start at lesson ${k + 1}`), ' ',
          h('a', { class: 'btn alt', href: '#/' }, 'No, start from the beginning'))
        : h('section', { class: 'card' }, h('p', {}, 'Starting from the first lesson is best for now. Nothing was changed.'), h('a', { class: 'btn', href: '#/' }, 'Back home')));
    }
    function ask(pi) {
      const L = sb.lessons[probes[pi]], results = [];
      const qs = L.q.map((q, qi) => ({ q, qi })).filter(x => 'bc'.includes(x.q.l)).sort((a, b) => (b.q.l === 'c') - (a.q.l === 'c')).slice(0, 2);
      let ok = true;
      const next = h('button', { class: 'btn', onclick: () => { passed.push(ok); if (ok && pi + 1 < probes.length) ask(pi + 1); else finish(); } }, pi + 1 < probes.length ? 'Next ▶' : 'See my result ▶');
      next.disabled = true;
      const onResult = first => { results.push(first); if (!first) ok = false; if (results.length === qs.length) next.disabled = false; };
      wrap.replaceChildren(h('h1', {}, `Find your starting quest: ${sb.name}`), h('p', { class: 'muted' }, `Step ${pi + 1} of ${probes.length}. Give it a try! This helps us find your first quest.`),
        ...qs.map(x => questionEl({ L, qi: x.qi, q: resolve(L, x.qi) }, { tag: 'squire trial', onResult, noEasier: true })),
        h('div', { class: 'ans', style: 'margin-top:14px' }, next, h('button', { class: 'btn alt', onclick: finish }, 'Stop here')));
      window.scrollTo(0, 0);
    }
    if (!probes.length) return go('#/');
    ask(0); app(wrap);
  }

  function viewReview(key) {
    setNav('review');
    const frag = h('div', {}, h('h1', {}, '🛡️ Look Back'), subjTabs('review', key || 'all', true));
    const pool = ALL.filter(l => (!key || key === 'all' || l.subj === key) && (S.done[l.id] || (S.pos && S.pos.id === l.id)));
    const doneList = pool.filter(l => S.done[l.id]);
    frag.append(h('p', { class: 'muted' }, 'Revisit old ideas. Spaced repetition (seeing things again after some days) is how memory sticks.'));
    const quiz = h('section', { class: 'card' }, h('h2', {}, '⚔️ Training arena'), h('p', {}, 'Six random questions from lessons you have already started.'));
    const qbox = h('div');
    quiz.append(h('button', { class: 'btn', onclick: () => { const qs = mixedQs(pool, 6); qbox.replaceChildren(...(qs.length ? qs.map(x => questionEl(x, { tag: 'from: ' + x.L.t })) : [h('p', { class: 'muted' }, 'Finish a lesson first, then come back.')])); } }, 'Start training'), qbox);
    frag.append(quiz);
    const due = Adapt.dueSkills(S, todayStr()).filter(d => BYID[d.id] && (!key || key === 'all' || BYID[d.id].subj === key));
    if (due.length) {
      const dbox = h('div');
      frag.append(h('section', { class: 'card' }, h('h2', {}, '🐲 Monster rematches'), h('p', { class: 'muted' }, 'These monsters are back because a question was tricky, or it has been a while. Seeing them again at growing gaps (1, 2, 4, 7, 14, 30 days) is what makes them stick.'),
        h('ul', {}, due.slice(0, 8).map(d => h('li', { class: 'rematch' }, h('span', { class: 'rm-pic', html: monPic(BYID[d.id]) }), `${BYID[d.id].t} `, h('span', { class: 'pill dark' }, d.weak ? 'tricky' : 'due')))),
        h('button', { class: 'btn', onclick: () => { const qs = due.slice(0, 6).map(d => { const L = BYID[d.id], qi = Adapt.pickQuestion(L, d.e, Math.floor(Math.random() * 97)); return { L, qi, q: resolve(L, qi) }; }); dbox.replaceChildren(...qs.map(x => questionEl(x, { tag: 'from: ' + x.L.t }))); } }, 'Practise these'), dbox));
    }
    frag.append(h('section', { class: 'card' }, h('h2', {}, '📜 Scroll of facts'),
      doneList.length ? doneList.map(L => h('div', { class: 'recap', style: 'margin:8px 0' }, h('span', {}, h('b', {}, `${SUBJ[L.subj].icon} ${L.t}: `), L.key, h('br'), h('small', { class: 'muted' }, '✔ ' + doneLine(S.done[L.id]))), h('a', { class: 'btn alt small', href: '#/lesson/' + L.id }, 'Redo'))) : h('p', { class: 'muted' }, 'Finish a lesson and its recap card appears here.')));
    app(frag);
  }

  /* Parents: who has access (each with their own Google account), invites, and cloud-save status (js/cloud.js, js/family.js). */
  function familyCard() {
    if (!window.Cloud) return h('span');
    const box = h('section', { class: 'card cloud' });
    const when = t => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    const email = h('input', { type: 'email', inputmode: 'email', autocomplete: 'off', placeholder: 'Other parent\'s Gmail address', 'aria-label': 'Email address to invite', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line);min-width:0;flex:1 1 220px' });
    let note = '';
    const say = t => { note = t; draw(); };
    const draw = () => {
      const c = Cloud.status(), kids = [h('h2', {}, '👨‍👩‍👧 Parents and cloud save')];
      kids.push(h('p', {}, 'Signed in as ', h('b', {}, c.email || '...'), '. Progress is saved to the family and follows your child to any device.'),
        h('p', { class: 'muted' }, c.state === 'syncing' ? 'Saving...' : c.state === 'denied' || c.state === 'error' ? '⚠️ ' + c.message : c.at ? `✅ Saved at ${when(c.at)}. It saves by itself after every change and every couple of minutes.` : ''));
      if (c.family) {
        kids.push(h('h3', {}, 'Parents with access'), h('ul', { class: 'plain' }, c.family.members.map(m => h('li', { class: 'parent-row' }, h('span', {}, m.email, m.you ? ' (you)' : '', m.owner ? ' · started the family' : ''),
          m.you ? '' : h('button', { class: 'btn alt small', onclick: async () => { if (confirm(`Remove ${m.email}? They will no longer see this progress.`)) { const r = await Cloud.removeParent(m.uid); say(r.ok ? `${m.email} was removed.` : r.reason); } } }, 'Remove')))));
        if (c.family.pending.length) kids.push(h('h3', {}, 'Waiting to join'), h('ul', { class: 'plain' }, c.family.pending.map(p => h('li', { class: 'parent-row' }, h('span', {}, p), h('button', { class: 'btn alt small', onclick: async () => { const r = await Cloud.revoke(p); say(r.ok ? 'Invite cancelled.' : r.reason); } }, 'Cancel invite')))));
        kids.push(h('h3', {}, 'Invite another parent'), h('p', { class: 'muted small' }, 'They sign in with their own Google account using this exact address. Only that account can accept.'),
          h('div', { class: 'ans' }, email, h('button', { class: 'btn', onclick: async () => { const r = await Cloud.invite(email.value); if (r.ok) { email.value = ''; say(`Invited ${r.invite}. Ask them to open this app and tap Grown-ups.`); } else say(r.reason); } }, 'Invite')));
      }
      if (note) kids.push(h('p', { class: 'note' }, note));
      kids.push(h('div', { class: 'ans', style: 'margin-top:14px' }, h('button', { class: 'btn alt', onclick: () => Cloud.syncNow() }, 'Save now (optional)'), h('button', { class: 'btn alt', onclick: async () => { if (confirm('Sign out on this device? Progress stays here and in the cloud. The Grown-ups area locks.')) { await Cloud.signOut(); go('#/'); } } }, 'Sign out')));
      box.replaceChildren(...kids);
    };
    let shown = false;
    const onChange = () => { if (box.isConnected) shown = true; else if (shown) { Cloud.offChange(onChange); return; } draw(); };
    Cloud.onChange(onChange); Cloud.preload(); draw();
    return box;
  }
  function viewParent() {
    setNav('parent');
    const frag = h('div', {}, h('h1', {}, '🏰 The Keep (for grown-ups)'), h('p', {}, h('button', { class: 'btn alt small', onclick: () => { GATE.lock(); go('#/'); } }, '🔒 Lock grown-ups area now'), h('span', { class: 'muted small' }, '  It also locks itself after 10 minutes.')));
    const nm = h('input', { type: 'text', value: S.name, 'aria-label': 'Child name', placeholder: 'Child\'s name', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' });
    const nmNote = h('span', { class: 'muted small', role: 'status' }, 'Saved as you type'); bindName(nm, nmNote);
    const pl = h('select', { 'aria-label': 'Daily plan', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line);max-width:100%' },
      [['rotate', 'Maths every day + English (Mon, Wed, Fri) or Science (Tue, Thu)'], ['all', 'All three subjects every day'], ['math', 'Maths every day, others optional']].map(([v, t]) => h('option', Object.assign({ value: v }, S.plan === v ? { selected: 'selected' } : {}), t)));
    const gl = h('select', { 'aria-label': 'Weekly goal', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' }, [1, 2, 3, 4, 5].map(n => h('option', Object.assign({ value: n }, S.goal === n ? { selected: 'selected' } : {}), `${n} evening${n > 1 ? 's' : ''} a week`)));
    frag.append(h('section', { class: 'card' }, h('h2', {}, 'Setup'), h('div', { class: 'ans' }, nm, nmNote),
      h('h3', { style: 'margin-top:24px' }, 'Daily plan'), h('div', { class: 'ans' }, pl, h('button', { class: 'btn', onclick: () => { S.plan = pl.value; S.setAt = Date.now(); save(); alert('Saved'); } }, 'Save plan')),
      h('h3', { style: 'margin-top:24px' }, 'Weekly goal'), h('div', { class: 'ans' }, gl, h('button', { class: 'btn', onclick: () => { S.goal = +gl.value; S.setAt = Date.now(); save(); alert('Saved'); } }, 'Save goal')),
      h('p', { class: 'muted small' }, 'Study evenings per week (any day with a solved question or a finished lesson counts). Every 3 study days the knight earns a new piece of armour.'),
      h('p', { class: 'muted small' }, 'Each subject moves forward one lesson at a time, so a subject that is studied 3 times a week takes about 13 weeks to finish.')));
    frag.append(h('section', { class: 'card' }, h('h2', {}, 'How the curriculum works'),
      h('ul', {}, h('li', {}, h('b', {}, 'Maths: '), 'Singapore-style concrete, pictorial, abstract (CPA) with bar models, number bonds and ten-frames. Goes beyond P1 into 3-digit numbers, multiplication, fractions of sets and Venn diagrams, plus olympiad tools (parity, Gauss pairing, working backwards, pigeonhole).'),
        h('li', {}, h('b', {}, 'English: '), 'phonics, sight words, sentences, grammar (nouns, verbs, tenses, pronouns), reading comprehension, vocabulary, and olympiad-style analogies, spelling puzzles and idioms.'),
        h('li', {}, h('b', {}, 'Science: '), 'living things, plants, body, materials, forces, Earth and sky, the environment, and fair-test thinking. Beyond school level at this age, and each lesson has a safe hands-on activity.'),
        h('li', {}, h('b', {}, 'Rhythm: '), 'About 25 minutes per subject. Progress is lesson-based, so missed days do not skip content.'),
        h('li', {}, h('b', {}, 'Coach tips: '), 'Ask "How do you know?", let them draw, praise effort, and read questions aloud together for English and Science.'),
        h('li', {}, h('b', {}, 'Levels: '), '🌱 Warm-up, ✏️ Practice, ⭐ Challenge, 🐉 Dragon challenge.'))));
    frag.append(h('section', { class: 'card' }, h('h2', {}, 'A good evening (about 25 minutes per subject)'),
      h('ol', {}, h('li', {}, '5 min: Look Back questions from earlier lessons'), h('li', {}, '8 min: Learn the new idea with the pictures and do the hands-on activity'),
        h('li', {}, '8 min: Practice (warm-up and core questions)'), h('li', {}, '4 min: Challenge (stretch and olympiad puzzles). Wrong answers are fine, thinking is the point.'))));
    frag.append(familyCard());
    if (window.BeeUI) frag.append(BeeUI.parentCard());
    const skipSel = h('select', { 'aria-label': 'Subject to update', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line);max-width:100%' }, SUBJECTS.map(sb => h('option', { value: sb.key }, `${sb.icon} ${sb.name}`)));
    const weekSel = h('select', { 'aria-label': 'Levels to update', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' }, [1, 2, 3, 4, 5, 6, 7, 8].map(n => h('option', { value: n }, `Levels 1 to ${n}`)));
    frag.append(h('section', { class: 'card' }, h('h2', {}, 'Already learned some of this, or marked by mistake?'),
      h('p', { class: 'muted' }, 'Mark lessons as done without questions when your child has already learned them elsewhere. Lessons already completed here keep their real scores. Marked lessons still appear in Look Back so old ideas are refreshed, and you can undo any time from the map.'),
      h('div', { class: 'ans' }, skipSel, weekSel, h('button', { class: 'btn', onclick: () => {
        const sb = SUBJ[skipSel.value], list = lessonsUpTo(sb, +weekSel.value).filter(l => !S.done[l.id]);
        if (!list.length) return alert('Everything in that range is already done.');
        if (confirm(`Mark ${list.length} ${sb.name} lesson${list.length > 1 ? 's' : ''} (levels 1 to ${weekSel.value}) as already known?`)) { list.forEach(markKnown); const nx = sb.lessons.find(l => !S.done[l.id]); if (nx) S.pos = { id: nx.id, step: 0 }; save(); alert(`Done. ${list.length} lesson${list.length > 1 ? 's' : ''} marked.`); route(); }
      } }, 'Mark as known'), h('button', { class: 'btn alt', onclick: () => {
        const sb = SUBJ[skipSel.value], list = lessonsUpTo(sb, +weekSel.value).filter(l => S.done[l.id]);
        if (!list.length) return alert('Nothing in that range is marked done.');
        if (confirm(`Mark ${list.length} ${sb.name} lesson${list.length > 1 ? 's' : ''} (levels 1 to ${weekSel.value}) as not done? Scores and dates for them are removed. Stars for solved questions are kept.`)) { list.forEach(unmarkDone); save(); alert(`Done. ${list.length} lesson${list.length > 1 ? 's' : ''} reset.`); route(); }
      } }, '↩ Mark as not done'))));
    SUBJECTS.forEach(sb => {
      const t = h('table', {}, h('tr', {}, h('th', {}, 'Lesson'), h('th', {}, 'Score'), h('th', {}, 'Completed'), h('th', {}, 'Answers')));
      sb.lessons.forEach(L => t.append(h('tr', {}, h('td', {}, `W${L.week}·${DAYS[L.day - 1]} ${L.t}`), h('td', {}, S.done[L.id] ? scoreShort(S.done[L.id]) : '-'), h('td', {}, S.done[L.id] ? fmtDate(S.done[L.id].when) : '-'), h('td', {}, h('a', { href: '#/key/' + L.id }, 'Key')))));
      frag.append(h('section', { class: 'card' }, h('h2', {}, `${sb.icon} ${sb.name}: progress and answer keys`), t));
    });
    const io = h('textarea', { 'aria-label': 'Progress backup code', rows: 3, style: 'width:100%', placeholder: 'Paste saved progress here to restore' });
    frag.append(h('section', { class: 'card' }, h('h2', {}, 'Backup / new device'),
      h('button', { class: 'btn alt', onclick: () => { io.value = JSON.stringify(S); io.select(); } }, 'Show progress code'), ' ',
      h('button', { class: 'btn alt', onclick: () => { try { const o = JSON.parse(io.value); if (!o.done) throw 0; S = o; load2(); save(); alert('Restored'); go('#/'); } catch (e) { alert('That code was not valid.'); } } }, 'Restore from code'), io,
      h('p', {}, h('button', { class: 'btn', style: 'background:var(--bad)', onclick: () => { if (confirm('Reset everything? This erases all lesson progress, stars, armour, placement results, spelling bee progress, imported word lists and settings for this family. It syncs to your other devices. Parent accounts stay connected. This cannot be undone.')) { S = Merge.reset(S, Date.now()); load2(); save(); go('#/'); } } }, 'Reset everything'))));
    const sections = Array.from(frag.querySelectorAll(':scope > section'));
    const categories = ['Setup', 'Progress', 'Spelling', 'Family', 'Data'];
    const groups = categories.map((name, i) => h('details', Object.assign({ class: 'parent-section fold', id: 'parent-' + name.toLowerCase() }, i === 0 ? { open: '' } : {}), h('summary', {}, name)));
    sections.forEach(section => {
      const title = (section.querySelector('h2') || {}).textContent || '';
      const category = /Parents and cloud/.test(title) ? 3 : /Spelling Bee/.test(title) ? 2 : /Backup/.test(title) ? 4 : /progress and answer|Already learned/.test(title) ? 1 : 0;
      const supportingGuide = category === 0 && title !== 'Setup';
      const subjectReport = /progress and answer/.test(title);
      if (supportingGuide || subjectReport) {
        const heading = section.querySelector('h2'); heading.remove();
        groups[category].append(h('details', { class: 'fold' }, h('summary', {}, title), section));
      } else groups[category].append(section);
      section.querySelectorAll('table td').forEach(td => { td.dataset.label = ['Lesson', 'Score', 'Completed', 'Answers'][td.cellIndex]; });
    });
    const manageMaps = h('div', { class: 'ans' }, SUBJECTS.map(sb => h('a', { class: 'btn alt', href: '#/map/' + sb.key }, 'Manage ' + sb.name + ' lessons')));
    groups[1].append(manageMaps);
    groups.forEach(group => frag.append(group));
    app(frag);
  }
  function load2() { S.done = S.done || {}; S.right = S.right || {}; S.days = S.days || []; S.name = S.name || ''; S.plan = S.plan || 'rotate'; S.skills = S.skills || {}; S.goal = S.goal | 0 || 3; S.hero = S.hero || {}; S.placed = S.placed || {}; S.removed = S.removed || {}; S.bee = Bee.norm(S.bee); if (S.pos && S.pos.id == null && S.pos.n != null) S.pos = { id: String(S.pos.n), step: S.pos.step | 0 }; }

  function viewKey(id) {
    setNav('parent');
    const L = BYID[id]; if (!L) return go('#/parent');
    app(h('div', {}, h('a', { href: '#/parent' }, '◀ Parent corner'), h('h1', {}, `Answer key: ${L.t}`),
      h('section', { class: 'card', html: '<p>' + L.tip + '</p>' }),
      h('section', { class: 'card' }, L.subj === 'math' ? h('p', { class: 'muted small' }, 'Questions marked "random" get new numbers every time. The answer and working are shown to your child after they answer; below is one example.') : '',
        L.q.map((_, i) => { const q = resolve(L, i); return h('div', { style: 'margin:14px 0' }, h('b', {}, `${i + 1}. ${LV[q.l][1]} `), q.gen ? h('span', { class: 'pill dark' }, 'random') : '', ' ', h('span', { style: 'white-space:pre-line' }, q.q), h('div', {}, h('b', {}, 'Answer: '), answerText(q)), q.s ? h('div', { class: 'muted small' }, q.s) : ''); }))));
  }

  /* ---------- router ---------- */
  function app(node) { document.body.classList.toggle('learning', /^#\/lesson\/|^#\/bee\/(drill|mock|hard)/.test(location.hash)); $app.replaceChildren(node); window.scrollTo(0, 0); const title = $app.querySelector('h1, h2'); if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); } }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    const p = (location.hash || '#/').slice(2).split('/');
    const gated = p[0] === 'parent' || p[0] === 'key';
    if (gated && window.GATE && !GATE.isUnlocked()) { // grown-ups area: ask for the -ology word first
      setNav('parent'); app(h('section', { class: 'card' }, h('h1', {}, 'Grown-ups'), h('p', { class: 'muted' }, 'This area is for adults.')));
      return GATE.require(route, () => go('#/'));
    }
    if (gated && window.GATE) GATE.touch();
    const rl = p[0] === 'lesson' ? (BYID[p[1]] || {}).subj : p[0] === 'map' ? (SUBJ[p[1]] ? p[1] : 'math') : p[0] === 'placement' ? p[1] : p[0] === 'bee' ? 'bee' : '';
    document.body.dataset.realm = rl || 'home';
    ({ '': viewHome, bee: () => BeeUI.view(p[1], p[2]), placement: () => viewPlacement(p[1]), map: () => viewMap(p[1]), lesson: () => viewLesson(p[1]), done: () => viewDone(p[1]), review: () => viewReview(p[1]), parent: viewParent, key: () => viewKey(p[1]) }[p[0]] || viewHome)();
  }
  window.AppKit = { h, get S() { return S; }, save, go, app, setNav, todayStr, markDay, knightHtml };
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
