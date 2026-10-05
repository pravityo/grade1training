/* Spelling bee screens: Bee HQ, the daily drill battle, mock bee, word trail, and the grown-ups settings.
   Logic is in js/bee.js and the words in js/data/beewords.js. Sound uses the browser's built-in speech (Safari included). */
(function () {
  'use strict';
  const kit = () => window.AppKit, h = (...a) => kit().h(...a);
  const today = () => kit().todayStr();
  const bee = () => { const S = kit().S; if (!S.bee || !S.bee.words) S.bee = Bee.norm(S.bee); return S.bee; };
  const save = () => { bee().setAt = bee().setAt || 0; kit().save(); };
  let cache = null;
  const list = () => { const key = bee().lists.map(l => l.id + ':' + l.words.length).join(','); if (!cache || cache.key !== key) cache = { key, items: Bee.flatten(BEE_GROUPS, bee().lists) }; return cache.items; };
  const pl = () => Bee.pool(bee(), list());          // the words for the lists and levels that are switched on
  const tierTag = x => h('span', { class: 'tier t' + x.tier }, `${Bee.TIERS[x.tier].emoji} ${Bee.TIERS[x.tier].name}`);
  const byWord = w => list().find(x => x.w === w);
  const MONSTER_NAMES = () => Monsters.LIST.map(m => m.name);

  /* ---------- speech ---------- */
  const Speech = (() => {
    const ok = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    let voice = null;
    const pick = () => { if (!ok) return; const vs = speechSynthesis.getVoices(); if (!vs.length) return; voice = vs.find(v => /^en[-_]US$/i.test(v.lang) && /samantha|ava|allison|nicky|zoe|google us|female|aaron/i.test(v.name)) || vs.find(v => /^en[-_]US$/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; };
    if (ok) { pick(); speechSynthesis.onvoiceschanged = pick; }
    const on = () => ok && bee().sound !== false;
    function say(text, rate, done) {
      if (!on()) { if (done) done(); return; }
      try {
        speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate || 0.85; if (voice) u.voice = voice;
        if (done) { u.onend = done; u.onerror = done; } speechSynthesis.speak(u);
      } catch (e) { if (done) done(); }
    }
    function spell(word, done) {   // letter by letter, then the word
      if (!on()) { if (done) done(); return; }
      try {
        speechSynthesis.cancel(); const seq = word.toUpperCase().split('').concat([word]);
        seq.forEach((t, i) => { const u = new SpeechSynthesisUtterance(i < word.length ? t + '.' : t); u.lang = 'en-US'; u.rate = i < word.length ? 0.7 : 0.85; if (voice) u.voice = voice; if (i === seq.length - 1 && done) { u.onend = done; u.onerror = done; } speechSynthesis.speak(u); });
      } catch (e) { if (done) done(); }
    }
    return { ok, on, say, spell, stop() { if (ok) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } } };
  })();

  /* ---------- little pieces ---------- */
  const meter = (pct, cls) => h('div', { class: 'meter ' + (cls || '') }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
  const letters = (w, cls) => h('span', { class: 'bee-letters ' + (cls || '') }, w.split('').map((c, i) => h('span', { class: 'bl bl' + (i % 5) }, c)));
  const blanked = (text, w) => text.replace(new RegExp(w, 'ig'), '_ _ _');
  const wordOf = x => x.w;
  const monsterIdx = n => (n * 7 + 3) % Monsters.LIST.length;

  /* The same helper everywhere: hear the word, its meaning and a sentence, like a bee pronouncer. Every word has all three.
     mode 'full' (meeting a word): meaning and sentence are always written out, word included.
     mode 'ask' (spelling it): tapping Meaning or Sentence says it and shows it with the word hidden. With sound off they are shown at once. */
  function pronouncer(item, big, mode) {
    mode = mode || 'ask'; const full = mode === 'full', show = full || !Speech.on();
    const defEl = h('p', { class: 'pr-line' }), sentEl = h('p', { class: 'pr-line sentence' });
    const txt = (x) => full ? x : blanked(x, item.w);
    const fill = (el, label, text) => { el.replaceChildren(h('b', {}, label + ': '), txt(text)); };
    const showDef = () => { if (item.def) fill(defEl, 'Meaning', item.def); }, showSent = () => { if (item.sent) fill(sentEl, 'Sentence', item.sent); };
    if (show) { showDef(); showSent(); }
    const row = h('div', { class: 'pron' }), b = (label, fn, cls) => row.append(h('button', { class: 'btn alt ' + (cls || ''), onclick: fn }, label));
    b('🔊 Word', () => Speech.say(item.w, 0.8), big ? 'big' : '');
    if (item.def) b('📖 Meaning', () => { showDef(); Speech.say('Meaning: ' + item.def + '.', 0.9); });
    if (item.sent) b('💬 Sentence', () => { showSent(); Speech.say(item.sent, 0.9); });
    b('🐢 Slowly', () => Speech.say(item.w, 0.55));
    const out = h('div', { class: 'pr-text' }, defEl, sentEl);
    const box = h('div', { class: 'pronbox' }, row, out);
    if (!Speech.on()) box.append(h('p', { class: 'muted small' }, Speech.ok ? '🔇 Sound is off, so a grown-up can read the word aloud.' : '🔇 This device cannot speak, so a grown-up can read the word aloud.'));
    return box;
  }
  /* Without sound, a grown-up can read the word: a hidden word to peek at for a moment. */
  function silentHelp(item) {
    if (Speech.on()) return '';
    const peek = h('span', { class: 'peek' }, '••••');
    return h('div', { class: 'silent' }, h('button', { class: 'linkbtn', onclick: () => { peek.textContent = item.w; setTimeout(() => { peek.textContent = '••••'; }, 3000); } }, 'Grown-up: show the word for 3 seconds'), peek);
  }

  /* Letter tiles: tap to build the word. A couple of extra letters make it a puzzle. */
  function tilesInput(item, onSubmit, opts) {
    opts = opts || {}; const w = item.w, n = w.length;
    const extra = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(c => !w.includes(c));
    const decoys = Bee.shuffle(extra).slice(0, item.tier === 1 ? 1 : 2);
    const bank = Bee.shuffle(w.split('').concat(decoys)).map((c, i) => ({ c, i, used: false }));
    const slots = Array(n).fill(null), box = h('div', { class: 'bee-build' }), row = h('div', { class: 'slots' }), tray = h('div', { class: 'tray' });
    const check = h('button', { class: 'btn', onclick: () => finish() }, opts.label || '✔ Check');
    const draw = () => {
      row.replaceChildren(...slots.map((t, k) => h('button', { class: 'bee-slot' + (t ? ' full' : ''), 'aria-label': t ? 'letter ' + t.c + ', tap to remove' : 'empty', onclick: () => { if (t) { t.used = false; slots[k] = null; draw(); } } }, t ? (t.c === ' ' ? '␣' : t.c) : '')));
      tray.replaceChildren(...bank.map(t => h('button', { class: 'tile-l' + (t.used ? ' used' : ''), onclick: () => { if (t.used) return; const k = slots.indexOf(null); if (k < 0) return; t.used = true; slots[k] = t; draw(); } }, t.c === ' ' ? '␣' : t.c)));
      check.disabled = slots.includes(null);
    };
    const finish = () => { if (slots.includes(null)) return; onSubmit(slots.map(t => t.c).join('')); };
    draw(); box.append(row, tray, h('div', { class: 'ans' }, check, h('button', { class: 'btn alt', onclick: () => { bank.forEach(t => { t.used = false; }); slots.fill(null); draw(); } }, '↺ Clear')));
    return box;
  }
  function typeInput(item, onSubmit, opts) {
    opts = opts || {};
    const input = h('input', { type: 'text', class: 'bee-input', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Type the word', placeholder: 'Type the word' });
    const go = () => { const v = input.value.trim().toLowerCase(); if (v) onSubmit(v); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 50);
    return h('div', { class: 'ans' }, input, h('button', { class: 'btn', onclick: go }, opts.label || '✔ Check'));
  }

  /* ---------- Bee HQ ---------- */
  function statusLine() {
    const B = bee(), left = Bee.daysLeft(B, today()), c = Bee.counts(B, pl());
    if (left == null) return h('p', { class: 'bee-count' }, h('b', {}, '🗓️ No bee date yet. '), 'A grown-up can set it in the Grown-ups area.');
    if (left < 0) return h('p', { class: 'bee-count' }, h('b', {}, 'The big bee day has passed. '), 'Great work! Keep practising for the next one.');
    return h('div', { class: 'bee-count' }, h('div', { class: 'big-count' }, left === 0 ? 'Today is the big bee!' : left), left === 0 ? '' : h('span', {}, left === 1 ? 'day until the big bee' : 'days until the big bee'));
  }
  function homeCard() {
    if (!window.Bee) return h('span');
    const B = bee(), done = B.days.includes(today()), r = Bee.rank(B.xp), st = Adapt.streak(B.days, today());
    return h('a', { class: 'beecard', href: '#/bee' }, h('span', { class: 'bc-icon' }, '🐝'),
      h('span', { class: 'bc-body' }, h('b', {}, 'Spelling'), h('br'), done ? `✅ Today's spelling is done. ${st} day${st === 1 ? '' : 's'} in a row!` : (Bee.daysLeft(B, today()) != null && Bee.daysLeft(B, today()) >= 0 ? `${Bee.daysLeft(B, today())} days to go. Today's spelling is waiting!` : 'Today\'s spelling is waiting!'),
        h('br'), h('small', {}, `${r.icon} ${r.name} · ${B.xp} points`)), h('span', { class: 'bc-go' }, done ? 'More' : 'Start'));
  }
  function view(sub, arg) {
    const K = kit(); K.setNav('bee');
    if (sub === 'drill') return startDrill(); if (sub === 'mock') return startMock(); if (sub === 'words') return trail();
    if (sub === 'group') return groupView(arg); if (sub === 'hard') return startHard();
    const B = bee(), L = pl(), c = Bee.counts(B, L), r = Bee.rank(B.xp), st = Adapt.streak(B.days, today()), doneToday = B.days.includes(today());
    const wrap = h('div', { class: 'bee' });
    wrap.append(h('h1', {}, '🐝 Spelling'),
      h('section', { class: 'card bee-hero' }, statusLine(),
        h('div', { class: 'bee-prog' }, h('div', { class: 'row' }, h('b', {}, `${c.mastered} of ${c.total} words you know`), h('small', {}, `${c.seen} tried`)), h('div', { class: 'meter dbl' }, h('i', { class: 'a', style: `width:${c.seen / c.total * 100}%` }), h('i', { class: 'b', style: `width:${c.mastered / c.total * 100}%` }))),
        h('div', { class: 'bee-rank' }, h('b', {}, `${r.icon} ${r.name}`), meter(r.pct, 'gold'), h('small', { class: 'muted' }, r.next ? `${r.next.left} points to become a ${r.next.name}` : 'The top rank!')),
        h('div', { class: 'chips small' }, h('div', { class: 'chip' }, h('b', {}, '🔥 ' + st), st === 1 ? 'day in a row' : 'days in a row'), h('div', { class: 'chip' }, h('b', {}, B.xp), 'points'), h('div', { class: 'chip' }, h('b', {}, B.drills), B.drills === 1 ? 'practice finished' : 'practices finished'))));
    const pv = Bee.buildSession(B, L, today());
    wrap.append(h('a', { class: 'drillbtn', href: '#/bee/drill' }, h('span', { class: 'db-mon', html: Monsters.svg(monsterIdx(B.drills)) }), h('span', { class: 'db-body' }, h('b', {}, doneToday ? '✏️ More spelling' : "✏️ Today's spelling"), h('br'), `${pv.order.length} words · ${pv.fresh.length} new, ${pv.order.length - pv.fresh.length} to remember`, h('br'), h('small', {}, `Spell with ${MONSTER_NAMES()[monsterIdx(B.drills)]}`)), h('span', { class: 'db-go' }, 'Go!')));
    if (doneToday) wrap.append(h('p', { class: 'muted center' }, '✅ You already did today\'s drill. Want to try some more words?'));
    const hard = Bee.hardWords(B, L);
    wrap.append(h('div', { class: 'bee-tiles' },
      h('a', { class: 'bee-bt', href: '#/bee/mock' }, h('span', {}, '🏆'), h('b', {}, 'Practice spelling bee'), h('small', {}, `12 words, 3 hearts. Best: ${B.mockBest}/12`)),
      h('a', { class: 'bee-bt', href: '#/bee/words' }, h('span', {}, '🗺️'), h('b', {}, 'Word Trail'), h('small', {}, 'All the word groups')),
      hard.length ? h('a', { class: 'bee-bt', href: '#/bee/hard' }, h('span', {}, '🎯'), h('b', {}, 'Tricky words'), h('small', {}, `${hard.length} to practise`)) : ''));
    // settings that a child can flip
    wrap.append(h('section', { class: 'card' }, h('h2', {}, 'How do you want to spell?'), modeChips(() => view()),
      h('label', { class: 'soundtoggle' }, h('input', Object.assign({ type: 'checkbox', onchange: e => { bee().sound = e.target.checked; save(); if (!e.target.checked) Speech.stop(); } }, B.sound !== false ? { checked: 'checked' } : {})), ' 🔊 Hear the words'),
      Speech.ok ? '' : h('p', { class: 'muted small' }, 'This device cannot speak, so a grown-up will need to read the words.')));
    // word lists and levels
    const all = list(), listDefs = [{ id: 'grade1', name: 'Bee practice words' }].concat(B.lists.map(l => ({ id: l.id, name: l.name })));
    const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) { if (arr.length > 1) arr.splice(i, 1); } else arr.push(v); B.setAt = Date.now(); save(); view(); };
    wrap.append(h('section', { class: 'card' }, h('h2', {}, '📚 Which words?'), h('p', { class: 'muted small' }, 'Tick the word lists to practise. A grown-up can add more lists in the Grown-ups area, for example the school bee list.'),
      h('div', { class: 'checks' }, listDefs.map(d => { const n = all.filter(x => x.lists.includes(d.id)).length; return h('label', { class: 'check' }, h('input', Object.assign({ type: 'checkbox', onchange: () => toggle(B.active, d.id) }, B.active.includes(d.id) ? { checked: 'checked' } : {})), ` ${d.name} `, h('small', {}, `(${n} words)`)); })),
      h('div', { class: 'checks' }, [1, 2, 3].map(t => { const n = all.filter(x => x.tier === t && x.lists.some(id => B.active.includes(id))).length; return h('label', { class: 'check t' + t }, h('input', Object.assign({ type: 'checkbox', onchange: () => toggle(B.tiers, t) }, B.tiers.includes(t) ? { checked: 'checked' } : {})), ` ${Bee.TIERS[t].emoji} ${Bee.TIERS[t].name} `, h('small', {}, `(${n})`)); })),
      h('p', { class: 'muted small' }, `${L.length} words in your practice now. Simple words are short and follow the sound rules, advanced ones are longer or have a tricky part, and expert ones are long or very tricky.`),
      L.length ? '' : h('p', { class: 'feedback-warn' }, '⚠️ Nothing to practise with this choice. Tick a list and a level.')));
    // trophies
    wrap.append(h('section', { class: 'card' }, h('h2', {}, '🏆 Trophy shelf'), h('div', { class: 'trophies' }, Bee.TROPHIES.map(t => { const got = B.trophies[t.id]; return h('div', { class: 'bee-trophy' + (got ? ' got' : '') }, h('span', { class: 't-emoji' }, got ? t.emoji : '🔒'), h('b', {}, t.name), h('small', {}, got ? 'Earned!' : t.desc)); }))));
    // tamed word monsters
    const fr = B.friends;
    wrap.append(h('section', { class: 'card' }, h('h2', {}, '🐲 Your word monster friends'), fr.length ? h('div', { class: 'friends' }, fr.map((i, k) => h('div', { class: 'friend', title: MONSTER_NAMES()[i] }, h('span', { html: Monsters.svg(i, { tamed: true }) }), h('small', {}, MONSTER_NAMES()[i])))) : h('p', { class: 'muted' }, 'Finish spelling with a heart left to make a monster friend.')));
    wrap.append(h('p', { class: 'muted small center' }, 'Your word garden has our practice words and One Bee words. Your school bee may use different words. Ask a grown-up about your school list.'));
    const progress = wrap.querySelector('.bee-hero'), drill = wrap.querySelector('.drillbtn');
    const nextMilestone = [25, 50, 100, 250, 500, 1000, c.total].filter(n => n <= c.total).sort((a, b) => a - b).find(n => n > c.mastered);
    const encouragement = h('section', { class: 'bee-daily' }, h('h2', {}, doneToday ? 'You practised today!' : 'A little practice every day'), h('p', {}, nextMilestone ? `${c.mastered} word${c.mastered === 1 ? '' : 's'} you know. Next goal: ${nextMilestone}!` : 'You reached every word goal. Nice work!'));
    const lifetime = h('details', { class: 'fold' }, h('summary', {}, 'Your progress and bee date'), progress);
    wrap.querySelector('h1').after(drill, encouragement);
    wrap.append(lifetime);
    K.app(wrap);
  }
  function modeChips(after) {
    const B = bee();
    return h('div', { class: 'bee-modes' }, [['tiles', '🔤 Letter tiles', 'Tap the letters'], ['type', '⌨️ Type it', 'Use the keyboard'], ['say', '🗣️ Spell aloud', 'Say each letter, then check']].map(([k, a, b]) => h('button', { class: 'bee-mode' + (B.mode === k ? ' on' : ''), 'aria-pressed': String(B.mode === k), onclick: () => { B.mode = k; save(); if (after) after(); } }, h('b', {}, a), h('small', {}, b))));
  }

  function wordBrowser(items) {
    const B = bee(), box = h('section', { class: 'bee-browser card' });
    let page = 0; const size = 40;
    const search = h('input', { type: 'search', 'aria-label': 'Search words', placeholder: 'Find a word', oninput: () => { page = 0; draw(); } });
    const difficulty = h('select', { 'aria-label': 'Word difficulty', onchange: () => { page = 0; draw(); } }, [[0, 'All levels'], [1, 'Simple'], [2, 'Advanced'], [3, 'Expert']].map(([value, text]) => h('option', { value }, text)));
    const state = h('select', { 'aria-label': 'Word progress', onchange: () => { page = 0; draw(); } }, [['all', 'All words'], ['new', 'New'], ['learning', 'Learning'], ['mastered', 'Words I know']].map(([value, text]) => h('option', { value }, text)));
    const info = h('p', { role: 'status', 'aria-live': 'polite', tabindex: -1, class: 'muted small' }), grid = h('div', { class: 'wordgrid' }), nav = h('div', { class: 'ans' });
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = items.filter(x => (!query || x.w.includes(query)) && (!+difficulty.value || x.tier === +difficulty.value) && (state.value === 'all' || Bee.status(B.words[x.w]) === state.value));
      const shown = filtered.slice(page * size, (page + 1) * size);
      info.textContent = filtered.length ? `Words ${page * size + 1}–${page * size + shown.length} of ${filtered.length}` : 'No words match. Try another search or level.';
      grid.replaceChildren(...shown.map(x => h('div', { class: 'bee-wchip ' + Bee.status(B.words[x.w]) }, h('b', {}, x.w), h('small', {}, Bee.status(B.words[x.w])), h('button', { class: 'btn alt small', 'aria-label': 'Hear ' + x.w, onclick: () => Speech.say(x.w, 0.8) }, '🔊 Hear'), h('button', { class: 'btn alt small', 'aria-label': 'Meet ' + x.w, onclick: () => runSession({ kind: 'group', title: 'Meet a word', words: [x], fresh: [x], hearts: 0 }) }, '📖 Meet'), h('a', { href: '#/bee/group/' + x.gid }, 'Group'))));
      nav.replaceChildren(h('button', { class: 'btn alt', disabled: page === 0 ? '' : null, onclick: () => { if (page > 0) { page--; draw(); info.focus(); info.scrollIntoView({ block: 'start' }); } } }, 'Previous words'), h('button', { class: 'btn', disabled: (page + 1) * size >= filtered.length ? '' : null, onclick: () => { if ((page + 1) * size < filtered.length) { page++; draw(); info.focus(); info.scrollIntoView({ block: 'start' }); } } }, 'More words'));
      nav.querySelectorAll('button').forEach((button, i) => { button.disabled = i === 0 ? page === 0 : (page + 1) * size >= filtered.length; });
    };
    box.append(h('h2', {}, 'Find your words'), h('div', { class: 'bee-filters' }, h('label', {}, 'Search', search), h('label', {}, 'Level', difficulty), h('label', {}, 'Progress', state)), info, grid, nav);
    draw(); return box;
  }

  /* ---------- word trail ---------- */
  function trail() {
    const B = bee(), K = kit(), wrap = h('div', { class: 'bee' }), all = list();
    wrap.append(h('a', { href: '#/bee' }, '◀ Bee HQ'), h('h1', {}, '🗺️ Word Trail'), h('p', { class: 'muted' }, 'Word groups by list and level. Tap a group to see its words or practise it.'));
    wrap.append(wordBrowser(all));
    const groups = h('details', { class: 'fold' }, h('summary', {}, 'Browse spelling groups'));
    const gids = []; all.forEach(x => { if (!gids.includes(x.gid)) gids.push(x.gid); });
    let lastList = null;
    gids.forEach(gid => {
      const items = all.filter(x => x.gid === gid), f = items[0], list0 = f.custom ? f.listName : 'Bee practice words';
      if (list0 !== lastList) { groups.append(h('h2', { class: 'sect' }, list0)); lastList = list0; }
      const mast = items.filter(x => Bee.isMastered(B.words[x.w])).length, met = items.filter(x => B.words[x.w]).length;
      groups.append(h('a', { class: 'group', href: '#/bee/group/' + gid }, h('span', { class: 'g-emoji' }, f.emoji), h('span', { class: 'g-body' }, h('b', {}, f.custom ? Bee.TIERS[f.tier].name : f.gname), ' ', tierTag(f), h('br'), meter(mast / items.length * 100, 'gold'), h('small', {}, `${mast} you know · ${met} tried · ${items.length} words`))));
    });
    wrap.append(groups);
    K.app(wrap);
  }
  function groupView(id) {
    const B = bee(), K = kit(), items = list().filter(x => x.gid === id);
    if (!items.length) return K.go('#/bee/words');
    const f = items[0], big = items.length > 60;
    const wrap = h('div', { class: 'bee' }, h('a', { href: '#/bee/words' }, '◀ Word Trail'), h('h1', {}, `${f.emoji} ${f.gname}`), h('p', { class: 'key' }, '💡 ' + f.tip),
      h('button', { class: 'btn', onclick: () => runSession({ kind: 'group', title: f.gname, words: Bee.shuffle(items).slice(0, 15), fresh: [], hearts: 0 }) }, '⚔️ Practise this group' + (big ? ' (15 words)' : '')));
    wrap.append(wordBrowser(items));
    K.app(wrap);
  }

  /* ---------- starting sessions ---------- */
  function startDrill() {
    const B = bee(), s = Bee.buildSession(B, pl(), today());
    if (!s.order.length) { alert('There are no words to practise. Turn on a word list and at least one level in Bee HQ.'); return kit().go('#/bee'); }
    if (!B.start) { B.start = today(); save(); }
    runSession({ kind: 'drill', title: "Today's spelling", words: s.order, fresh: s.fresh, hearts: 5 });
  }
  function startMock() { runSession({ kind: 'mock', title: 'Practice spelling bee', words: Bee.mockWords(bee(), pl()), fresh: [], hearts: 3 }); }
  function startHard() { const w = Bee.hardWords(bee(), pl()).slice(0, 10); if (!w.length) return kit().go('#/bee'); runSession({ kind: 'hard', title: 'Tricky words', words: Bee.shuffle(w), fresh: [], hearts: 0 }); }

  /* ---------- the session: meet new words, then battle ---------- */
  function runSession(cfg) {
    const K = kit(), B = bee(), wrap = h('div', { class: 'bee' });
    const monIdx = cfg.kind === 'drill' ? monsterIdx(B.drills) : (cfg.kind === 'mock' ? 9 : (B.drills + 5) % 20), boss = (cfg.kind === 'drill' && (B.drills + 1) % 5 === 0) || cfg.kind === 'mock';
    const monName = (boss ? 'Boss ' : '') + MONSTER_NAMES()[monIdx];
    const total = cfg.words.length;
    const st = { hearts: cfg.hearts, maxHearts: cfg.hearts, combo: 0, best: 0, xp: 0, i: 0, outcomes: [], queue: cfg.words.slice(), retried: new Set(), out: false };
    const show = node => { Speech.stop(); K.app(h('div', { class: 'bee' }, node)); };

    /* meet the new words: the word, its letters, meaning and sentence are all shown, then a try from memory */
    function study(k) {
      if (k >= cfg.fresh.length) return battle();
      const x = cfg.fresh[k], card = h('div', { class: 'card studycard' });
      card.append(h('div', { class: 'muted small' }, `New word ${k + 1} of ${cfg.fresh.length} `, tierTag(x)),
        h('h2', {}, 'Meet your new word'), h('div', { class: 'sw' }, letters(x.w, 'huge')),
        h('div', { class: 'pron' }, h('button', { class: 'btn alt', onclick: () => Speech.spell(x.w) }, '🔤 Say the letters')),
        pronouncer(x, true, 'full'), h('p', { class: 'key' }, `${x.emoji} ${x.tip}`),
        h('p', { class: 'muted' }, 'Look at the letters and say them. When you are ready, spell it from memory.'),
        h('button', { class: 'btn', onclick: () => remember(x, k) }, 'I am ready, try it ➜'),
        k > 0 ? h('button', { class: 'btn alt', onclick: () => study(k - 1) }, '◀ Back') : '');
      show(card); Speech.say(x.w, 0.8);
    }
    function remember(x, k) {
      show(h('div', { class: 'card studycard' }, h('div', { class: 'muted small' }, `New word ${k + 1} of ${cfg.fresh.length} `, tierTag(x)),
        h('h3', {}, 'Now spell it from memory'), pronouncer(x, false, 'ask'), silentHelp(x), memory(x, k),
        h('button', { class: 'btn alt', onclick: () => study(k) }, '👀 Look at the word again')));
      Speech.say(x.w, 0.8);
    }
    // Oral practice is self-checked; no microphone or speech recognition is used.
    function oralInput(x, onCheck) {
      const reveal = h('div', {});
      return h('div', {}, h('p', { class: 'muted' }, 'Say each letter out loud. Then look and check.'),
        h('p', { class: 'muted small' }, 'The app does not listen. You or a grown-up checks your spelling.'),
        h('button', { class: 'btn', onclick: () => {
          reveal.replaceChildren(h('div', { class: 'reveal' }, letters(x.w)), h('div', { class: 'ans' },
            h('button', { class: 'btn', onclick: () => onCheck(true) }, '✅ I spelled it right'),
            h('button', { class: 'btn alt', onclick: () => onCheck(false) }, '❌ Not yet')));
          Speech.spell(x.w);
        } }, '👀 Show me the letters'), reveal);
    }
    function memory(x, k) {
      const done = ok => h('div', { class: 'bee-feedback ' + (ok ? 'ok' : 'no') }, ok ? '✅ You remembered it!' : ['Look again: ', letters(x.w)], h('div', { class: 'ans' }, h('button', { class: 'btn', onclick: () => study(k + 1) }, k + 1 < cfg.fresh.length ? 'Next new word ➜' : 'Start spelling ✏️')));
      const holder = h('div', {});
      const submit = v => { holder.replaceChildren(done(v === x.w)); };
      holder.append(B.mode === 'say' ? oralInput(x, ok => holder.replaceChildren(done(ok))) : B.mode === 'type' ? typeInput(x, submit) : tilesInput(x, submit));
      return holder;
    }

    /* the battle */
    function battle() { if (st.i >= st.queue.length) return finish(); word(); }
    function arena() {
      const left = st.queue.length - st.i;
      return h('div', { class: 'arena realm-math bee-arena' + (boss ? ' boss' : ''), id: 'bee-arena' },
        h('div', { class: 'ar-realm' }, `${boss ? '👑 ' : '✏️ '}${cfg.title}`),
        h('div', { class: 'ar-scene' }, h('div', { class: 'ar-knight', html: K.knightHtml() }), h('div', { class: 'ar-vs' }, 'WITH'), h('div', { class: 'ar-foe', html: Monsters.svg(monIdx, { boss }) })),
        h('div', { class: 'ar-calm' }, h('span', {}, monName), meter(left / st.queue.length * 100, 'foe'), h('span', {}, `${left} left`)),
        h('div', { class: 'bee-hud' }, cfg.hearts ? h('span', { class: 'hearts', 'aria-label': st.hearts + ' hearts' }, '❤️'.repeat(st.hearts) + '🖤'.repeat(st.maxHearts - st.hearts)) : h('span', {}), h('span', { class: 'xp' }, `⭐ ${st.xp}`), st.combo > 1 ? h('span', { class: 'bee-combo' }, `🔥 x${st.combo}`) : h('span', {})));
    }
    function word() {
      const x = st.queue[st.i], sect = h('div', {}), fb = h('div', {}), inputBox = h('div', {});
      let tries = 0;
      const mode = B.mode || 'tiles';
      const again = st.retried.has(x.w);   // a word missed earlier and asked once more counts as practice, not a fresh first try
      const finishWord = outcome0 => {
        const outcome = again && outcome0 === 'first' ? 'second' : outcome0;
        Bee.record(B, x.w, outcome, today());
        const sc = Bee.score(outcome, st.combo); st.combo = sc.combo; st.best = Math.max(st.best, st.combo); st.xp += sc.pts; B.xp += sc.pts; B.maxCombo = Math.max(B.maxCombo || 0, st.best); st.outcomes.push({ x, outcome });
        if (outcome === 'miss') { if (cfg.hearts) st.hearts--; if (cfg.kind === 'drill' && !again) { st.retried.add(x.w); st.queue.push(x); } }
        save();
        const hit = outcome !== 'miss', a = document.getElementById('bee-arena'); if (a) { a.classList.remove('hit'); void a.offsetWidth; if (hit) a.classList.add('hit'); }
        const over = cfg.kind === 'mock' && st.hearts <= 0;
        fb.replaceChildren(h('div', { class: 'bee-feedback ' + (hit ? 'ok' : 'no') }, hit ? (outcome === 'first' ? `✅ Correct! +${sc.pts}${st.combo > 1 ? `  🔥 combo x${st.combo}` : ''}` : `✅ You got it! +${sc.pts}`) : `The word is: `, hit ? '' : letters(x.w),
          hit ? '' : h('p', { class: 'muted' }, cfg.kind === 'mock' ? 'That word was tricky. Keep going!' : 'Now spell it once to remember it.'),
          hit || cfg.kind === 'mock' ? '' : retype()),
          hit || cfg.kind === 'mock' ? next(over) : '');
        inputBox.replaceChildren();
        const hu = document.querySelector('.bee-hud'); if (hu) hu.replaceWith(arena().querySelector('.bee-hud'));
        if (!hit) Speech.spell(x.w); else Speech.say(['Nice!', 'Great job!', 'Correct!', 'Awesome!'][st.i % 4], 1);
      };
      const next = over => h('div', { class: 'ans' }, h('button', { class: 'btn', onclick: () => { st.i++; if (over) return finish(); battle(); } }, st.i + 1 >= st.queue.length ? 'Finish ➜' : 'Next word ➜'));
      const retype = () => { const holder = h('div', {}); const sub = v => { if (v === x.w) { holder.replaceChildren(h('p', { class: 'good' }, '✅ That is it!'), next(false)); } else { holder.replaceChildren(h('p', { class: 'muted' }, 'Almost. Look at the word above and try again.'), input2()); } }; const input2 = () => (mode === 'say' ? oralInput(x, ok => { if (ok) { holder.replaceChildren(h('p', { class: 'good' }, '✅ Nice practice!'), next(false)); } else { holder.replaceChildren(input2()); } }) : mode === 'type' ? typeInput(x, sub, { label: '✔ Check' }) : tilesInput(x, sub)); holder.append(input2()); return holder; };
      const submit = v => {
        tries++;
        if (v === x.w) return finishWord(tries === 1 ? 'first' : 'second');
        if (tries === 1 && cfg.kind !== 'mock') {   // one more go, with the first letter as a clue
          fb.replaceChildren(h('div', { class: 'bee-feedback try' }, `Not quite. Try again! It starts with "${x.w[0]}".`)); Speech.say('Try again', 1); inputBox.replaceChildren(input()); return;
        }
        finishWord('miss');
      };
      const input = () => mode === 'type' ? typeInput(x, submit) : tilesInput(x, submit);
      const sayMode = () => oralInput(x, ok => finishWord(ok ? 'first' : 'miss'));
      inputBox.append(mode === 'say' ? sayMode() : input());
      sect.append(arena(), h('div', { class: 'card wordcard' }, h('div', { class: 'muted small' }, `Word ${Math.min(st.i + 1, st.queue.length)} of ${st.queue.length}${cfg.kind === 'mock' ? ' · ' + Bee.TIERS[x.tier].emoji + ' ' + Bee.TIERS[x.tier].name + ' round' : ''}`), h('h2', {}, cfg.kind === 'mock' ? '🐝 Spell the word' : 'Spell the word'), tierTag(x), pronouncer(x, true, 'ask'), silentHelp(x), modeSwitch(), inputBox, fb));
      show(sect); Speech.say(x.w, 0.8);
    }
    const modeSwitch = () => h('div', { class: 'bee-modes small' }, [['tiles', '🔤'], ['type', '⌨️'], ['say', '🗣️']].map(([k, e]) => h('button', { class: 'bee-mode' + (B.mode === k ? ' on' : ''), 'aria-pressed': String(B.mode === k), 'aria-label': k === 'say' ? 'Spell aloud' : k === 'type' ? 'Type it' : 'Letter tiles', onclick: () => { B.mode = k; save(); word(); } }, e)));

    /* the end */
    function finish() {
      Speech.stop();
      const outs = st.outcomes, firsts = outs.filter(o => o.outcome === 'first').length, misses = outs.filter(o => o.outcome === 'miss').length, tamed = cfg.hearts ? st.hearts > 0 && !(cfg.kind === 'mock' && st.out) : true;
      let bonus = 0, fresh = [], line = '';
      const eliminated = cfg.kind === 'mock' && st.hearts <= 0;
      if (cfg.kind === 'drill') {
        B.drills++; const perfect = outs.length > 0 && outs.every(o => o.outcome === 'first'); if (perfect) B.perfect++;
        bonus = 20 + (perfect ? 30 : 0); if (tamed) { B.friends.push(monIdx); }
        line = perfect ? 'You spelled every word on your first try!' : tamed ? `${monName} is your new friend!` : `Those words were tricky. Let’s try them again!`;
      } else if (cfg.kind === 'mock') {
        const score = outs.filter(o => o.outcome !== 'miss').length; B.mockBest = Math.max(B.mockBest, score); bonus = 10;
        line = eliminated ? `This round is done. Let’s practise the tricky words!` : score === total ? 'You spelled all 12 words!' : 'You made it through every round!';
      } else line = 'Nice practice!';
      B.xp += bonus; st.xp += bonus;
      if (!B.days.includes(today())) B.days.push(today());
      kit().markDay();
      fresh = Bee.award(B, list(), today(), Adapt.streak(B.days, today()));
      save();
      const r = Bee.rank(B.xp), c = Bee.counts(B, pl());
      const summary = []; outs.forEach(o => { const f = summary.find(y => y.x.w === o.x.w); if (!f) summary.push({ x: o.x, outcome: o.outcome }); else if (o.outcome === 'miss' || f.outcome === 'miss') f.outcome = 'miss'; else if (o.outcome === 'second') f.outcome = 'second'; });
      const sp = h('div', { class: 'sparkles', 'aria-hidden': 'true' }, ['✨', '⭐', '🐝', '✨', '🎉', '🐝', '✨', '⭐'].map((e, k) => h('span', { style: `left:${8 + k * 12}%;animation-delay:${(k % 4) * 0.25}s` }, e)));
      show(h('div', {}, h('section', { class: 'card hero bee-done' }, h('h1', {}, eliminated ? '🐝 Good try!' : tamed ? '🏆 Nice work!' : '🐝 Nice work!'), h('p', {}, line),
        cfg.kind === 'drill' || cfg.kind === 'mock' ? h('div', { class: 'newmon' }, h('span', { class: 'newmon-face', html: Monsters.svg(monIdx, { boss, tamed: tamed && !eliminated }) }), h('span', {}, h('b', {}, `${summary.length} words practised`), h('br'), `${summary.filter(o => o.outcome === 'first').length} of ${summary.length} words right on the first try`)) : h('p', {}, h('b', {}, `${st.xp} points earned`)),
        sp, h('details', { class: 'bee-rewards' }, h('summary', {}, 'Your points and progress'), h('p', {}, `${st.xp} points earned`), h('p', {}, `${r.icon} ${r.name}` + (r.next ? ` · ${r.next.left} points to ${r.next.name}` : '')), h('p', {}, `${c.mastered} of ${c.total} words you know`))),
        fresh.length ? h('div', { class: 'news' }, h('b', {}, '🏆 New trophy: '), fresh.map(t => `${t.emoji} ${t.name}`).join(', ')) : '',
        h('section', { class: 'card' }, h('h3', {}, 'Your words'), h('div', { class: 'wordgrid' }, summary.map(o => h('div', { class: 'bee-wchip ' + (o.outcome === 'first' ? 'mastered' : 'learning') }, h('b', {}, o.x.w), h('small', {}, o.outcome === 'first' ? '✅ first try' : o.outcome === 'second' ? '✅ second try' : '📌 keep practising')))),
          h('div', { class: 'ans' }, h('a', { class: 'btn', href: '#/bee' }, '🐝 Back to spelling'), misses ? h('button', { class: 'btn alt', onclick: () => runSession({ kind: 'hard', title: 'Missed words', words: Bee.shuffle([...new Set(outs.filter(o => o.outcome === 'miss').map(o => o.x))]), fresh: [], hearts: 0 }) }, 'Try the tricky words') : '', cfg.kind === 'mock' ? h('a', { class: 'btn alt', href: '#/bee/mock' }, 'Try the practice bee again') : h('button', { class: 'btn', onclick: () => { const used = new Set(st.queue.map(x => x.w)); const remaining = pl().filter(x => !used.has(x.w)); const pool = remaining.length ? remaining : pl(); let extra = Bee.buildSession(B, pool, today(), { size: 5, newMax: 5 }); if (!extra.order.length) extra = Bee.buildSession(B, pl(), today(), { size: 5, newMax: 5 }); runSession({ kind: 'drill', title: 'Five more words', words: extra.order, fresh: extra.fresh, hearts: 5 }); } }, 'Try 5 more words')))));
    }
    if (!total) return kit().go('#/bee');
    if (cfg.fresh.length) study(0); else battle();
  }

  /* ---------- Grown-ups: settings, own word list, and how it is going ---------- */
  function parentCard() {
    if (!window.Bee) return h('span');
    const B = bee(), L = list(), c = Bee.counts(B, L), box = h('section', { class: 'card' });
    const date = h('input', { type: 'date', 'aria-label': 'Spelling bee date', value: B.date || '', style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' });
    const sel = (opts, cur) => h('select', { style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line)' }, opts.map(([v, t]) => h('option', Object.assign({ value: v }, String(cur) === String(v) ? { selected: 'selected' } : {}), t)));
    const size = sel([[8, '8 words'], [10, '10 words'], [12, '12 words'], [15, '15 words']], B.size), newMax = sel([[3, '3 new words'], [4, '4 new words'], [6, '6 new words'], [8, '8 new words'], [10, '10 new words']], B.newMax);
    size.setAttribute('aria-label', 'Words per drill'); newMax.setAttribute('aria-label', 'New words per day');
    const area = h('textarea', { 'aria-label': 'Words to import', rows: 6, style: 'width:100%', placeholder: 'One word per line. Optional: word | meaning | sentence\nexample: friend | someone you like | My friend came to play.' });
    const msg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }), preview = h('div'), lists = h('div'), name = h('input', { type: 'text', 'aria-label': 'Word list name', placeholder: 'List name, e.g. 2026 school list', maxlength: 40, style: 'font:inherit;padding:8px 12px;border-radius:10px;border:2px solid var(--line);width:100%;margin-bottom:8px' });
    const file = h('input', { type: 'file', accept: '.txt,.csv,.tsv,.pdf,text/plain,text/csv,application/pdf', style: 'display:none' });
    const lvl = t => Bee.TIERS[t].emoji + ' ' + Bee.TIERS[t].name;
    const drawLists = () => {
      lists.replaceChildren(...B.lists.map(l => { const n = [0, 0, 0, 0]; l.words.forEach(x => { n[Bee.tierOf(x[3]) || Bee.autoTier(x[0])]++; });
        return h('p', {}, h('b', {}, l.name), ` : ${l.words.length} words (${n[1]} simple, ${n[2]} advanced, ${n[3]} expert) `, h('button', { class: 'btn alt small', onclick: () => { if (confirm(`Remove the list "${l.name}"?`)) { B.lists = B.lists.filter(z => z.id !== l.id); B.active = B.active.filter(id => id !== l.id); if (!B.active.length) B.active = ['grade1']; B.setAt = Date.now(); save(); drawLists(); } } }, 'Remove')); }));
      if (!B.lists.length) lists.append(h('p', { class: 'muted' }, 'No lists of your own yet.'));
    };
    const finish = (words, skipped) => {
      if (!words.length) { msg.textContent = 'No valid words found. Use letters only.'; return; }
      const l = Bee.addList(B, name.value || 'My list', words); B.setAt = Date.now(); save(); name.value = ''; preview.replaceChildren(); drawLists();
      msg.textContent = `Saved "${l.name}" with ${l.words.length} words. It is off until you tick it on the Bee page.${skipped && skipped.length ? ' Skipped: ' + skipped.slice(0, 8).join(', ') : ''}`;
    };
    const addPasted = () => { const r = Bee.parseWords(area.value); area.value = ''; finish(r.added, r.skipped); };
    const showPreview = rows => {
      let mode = 'row', minLen = 3, edit;
      const draw = () => {
        const ws = Bee.extractFromRows(rows, mode, minLen);
        edit.value = ws.join('\n'); cnt.textContent = `${ws.length} words found. Check and edit the list, one word per line.`;
      };
      const cnt = h('p', {}); edit = h('textarea', { rows: 8, style: 'width:100%' });
      const m = h('select', { style: 'font:inherit;padding:8px', onchange: () => { mode = m.value; draw(); } }, [['row', 'First word of each line'], ['cell', 'First word of each column'], ['all', 'Every word']].map(([v, t]) => h('option', { value: v }, t)));
      const n = h('select', { style: 'font:inherit;padding:8px', onchange: () => { minLen = +n.value; draw(); } }, [2, 3, 4].map(v => h('option', Object.assign({ value: v }, v === 3 ? { selected: 'selected' } : {}), `at least ${v} letters`)));
      preview.replaceChildren(h('h4', {}, 'Preview'), h('div', { class: 'ans' }, m, n), cnt, edit, h('div', { class: 'ans' }, h('button', { class: 'btn', onclick: () => { const r = Bee.parseWords(edit.value); finish(r.added, r.skipped); } }, 'Save as a list'), h('button', { class: 'btn alt', onclick: () => preview.replaceChildren() }, 'Cancel')));
      draw();
    };
    const pdfRows = async f => {
      if (!window.pdfjsLib) await new Promise((ok, no) => { const sc = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' }); sc.onload = ok; sc.onerror = () => no(new Error('The PDF reader could not load. Check the internet connection.')); document.head.append(sc); });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise, rows = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const items = (await (await doc.getPage(p)).getTextContent()).items.filter(t => t.str.trim()), lines = [];
        items.forEach(t => { const y = Math.round(t.transform[5] / 3); let ln = lines.find(z => z.y === y); if (!ln) lines.push(ln = { y, c: [] }); ln.c.push({ x: t.transform[4], s: t.str.trim() }); });
        lines.sort((a, b) => b.y - a.y).forEach(ln => rows.push(ln.c.sort((a, b) => a.x - b.x).map(c => c.s)));
      }
      return rows;
    };
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return; msg.textContent = 'Reading ' + f.name + ' ...'; if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
      try { const rows = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? await pdfRows(f) : Bee.rowsFromText(await f.text()); msg.textContent = ''; showPreview(rows); }
      catch (e) { msg.textContent = 'Could not read that file: ' + (e.message || e); }
      file.value = '';
    });
    drawLists();
    const weak = Bee.hardWords(B, L).slice(0, 12);
    const pace = Bee.pace(B, L, today());
    box.append(h('h2', {}, '🐝 Spelling Bee'), pace ? h('p', { class: 'muted' }, 'Practice plan: ' + (pace.status === 'ahead' ? 'Ahead of plan' : pace.status === 'on track' ? 'On track' : 'More review time may be helpful')) : '',
      h('p', { class: 'muted' }, `${c.mastered} of ${c.total} words you know, ${c.seen} tried. ${B.drills} practices finished, ${B.xp} points.`),
      h('div', { class: 'ans' }, h('label', {}, 'Bee date: '), date, h('button', { class: 'btn', onclick: () => { B.date = date.value || null; if (!B.start) B.start = today(); B.setAt = Date.now(); save(); alert('Saved'); } }, 'Save date')),
      h('div', { class: 'ans', style: 'margin-top:14px' }, h('label', {}, 'Words per drill: '), size, h('label', {}, ' New words per day (at most): '), newMax, h('button', { class: 'btn', onclick: () => { B.size = +size.value; B.newMax = +newMax.value; B.setAt = Date.now(); save(); alert('Saved'); } }, 'Save')),
      h('p', { class: 'muted small' }, 'Each drill mixes new words with words that are due for review. In the last 7 days before the bee there are no new words, only review of the words already met.'),
      weak.length ? h('p', {}, h('b', {}, 'Words that need more practice: '), weak.map(x => x.w).join(', ')) : '',
      h('h3', { style: 'margin-top:20px' }, 'Word lists'), h('p', { class: 'muted small' }, `Built in: our own grade 1 practice list (${BEE_GROUPS.reduce((n, g) => n + g.words.length, 0)} words). The practice pool also includes the One Bee sections from the supplied 2026 school list and the 2020 Words of the Champions PDF. Extra words use speech without definitions or example sentences unless already in our practice list. Add other lists here from a file or by pasting: imported lists stay in this family account. Every word gets a level (Simple, Advanced or Expert) from its length and spelling traps. Add | 1, 2 or 3 at the end of a line to set a level yourself. Switch lists on and off on the Bee page.`),
      h('p', { class: 'muted small' }, 'One Bee sources: ', (window.BEE_EXTRA_LISTS || []).flatMap(l => l.sources.map((source, i) => h('span', {}, i ? ' · ' : '', h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.name))))),
      lists, h('h4', {}, 'Add words'), name, area,
      h('div', { class: 'ans' }, h('label', { class: 'btn alt' }, 'Choose a file (.txt, .csv, .pdf)', file), h('button', { class: 'btn', onclick: addPasted }, 'Add pasted words')), msg, preview,
      h('p', {}, h('button', { class: 'btn alt small', onclick: () => { if (confirm('Erase all spelling bee progress, points and trophies? This cannot be undone.')) { const keep = { date: B.date, lists: B.lists }; Object.assign(kit().S, { bee: Object.assign(Bee.blank(), keep, { setAt: Date.now() }) }); save(); alert('Spelling bee progress was reset.'); kit().go('#/parent'); } } }, 'Reset spelling bee progress')));
    return box;
  }

  window.BeeUI = { view, homeCard, parentCard, Speech };
})();
