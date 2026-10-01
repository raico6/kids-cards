(function () {
  'use strict';
  const STORE_KEY = 'abcCards.words.v1';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- data ----------
  function sanitize(data) {
    const out = {};
    for (const L of LETTERS) {
      const arr = Array.isArray(data && data[L]) ? data[L] : [];
      out[L] = arr.filter(w => w && typeof w.en === 'string')
        .map(w => ({ en: String(w.en).slice(0, 40), zh: String(w.zh || '').slice(0, 40), emoji: String(w.emoji || '').slice(0, 16) }));
    }
    return out;
  }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return sanitize(JSON.parse(raw)); } catch (e) { /* ignore */ }
    return sanitize(clone(window.DEFAULT_WORDS));
  }
  let words = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(words)); } catch (e) { toast('保存失败（浏览器存储不可用）'); } }
  const usable = (L) => words[L].filter(w => w.en.trim());

  // ---------- speech ----------
  let voice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => v.lang === 'en-US' && /samantha|google us|aria|jenny|zira/i.test(v.name))
      || vs.find(v => v.lang === 'en-US') || vs.find(v => /^en[-_]/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(parts) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      (Array.isArray(parts) ? parts : [parts]).forEach(t => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'en-US'; u.rate = 0.8; u.pitch = 1.1; if (voice) u.voice = voice;
        speechSynthesis.speak(u);
      });
    } catch (e) { /* ignore */ }
  }

  // ---------- screens ----------
  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }

  // ---------- home ----------
  function renderHome() {
    const box = $('tiles'); box.innerHTML = '';
    LETTERS.forEach(L => {
      const b = document.createElement('button');
      b.className = 'tile'; b.style.background = CardGen.letterPalette(L)[0];
      const first = usable(L)[0];
      const emo = first ? ((first.emoji && first.emoji.trim()) || CardGen.lookupEmoji(first.en) || '') : '';
      b.innerHTML = `<span class="big">${L}${L.toLowerCase()}</span><span class="emo">${emo}</span>`;
      b.setAttribute('aria-label', L);
      b.addEventListener('click', () => openLetter(L));
      box.appendChild(b);
    });
  }

  // ---------- card view ----------
  let curLetter = 'A', idx = 0, deck = [];
  function buildDeck(L) { deck = [{ type: 'letter', L }].concat(usable(L).map(w => ({ type: 'word', L, w }))); }
  function openLetter(L, startAtEnd) {
    curLetter = L; buildDeck(L); idx = startAtEnd ? deck.length - 1 : 0;
    show('cards'); drawCard(); speakCurrent();
  }
  function drawCard(dir) {
    const c = $('card'), item = deck[idx];
    if (item.type === 'letter') CardGen.renderLetterCard(c, item.L, usable(item.L)[0]);
    else CardGen.renderWordCard(c, item.w);
    const dots = $('dots'); dots.innerHTML = deck.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
    $('prevBtn').disabled = curLetter === 'A' && idx === 0;
    $('nextBtn').disabled = curLetter === 'Z' && idx === deck.length - 1;
    if (dir) { c.classList.remove('slide-l', 'slide-r', 'bounce'); void c.offsetWidth; c.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  function speakCurrent() {
    const item = deck[idx];
    if (item.type === 'letter') { const f = usable(item.L)[0]; speak(f ? [item.L, `${item.L} is for ${f.en}`] : [item.L]); }
    else speak([item.w.en]);
  }
  function bounce() { const c = $('card'); c.classList.remove('bounce', 'slide-l', 'slide-r'); void c.offsetWidth; c.classList.add('bounce'); speakCurrent(); }
  function go(d) {
    const n = idx + d;
    if (n >= 0 && n < deck.length) { idx = n; drawCard(d); speakCurrent(); return; }
    const li = LETTERS.indexOf(curLetter) + d;           // continue into next/previous letter
    if (li < 0 || li >= LETTERS.length) return;
    curLetter = LETTERS[li]; buildDeck(curLetter); idx = d > 0 ? 0 : deck.length - 1; drawCard(d); speakCurrent();
  }
  $('prevBtn').addEventListener('click', () => go(-1));
  $('nextBtn').addEventListener('click', () => go(1));
  $('speakBtn').addEventListener('click', bounce);
  $('homeBtn').addEventListener('click', () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); renderHome(); show('home'); });

  // tap vs swipe on the card
  (function () {
    const el = $('card'); let sx = 0, sy = 0, st = 0, active = false;
    el.addEventListener('pointerdown', e => { active = true; sx = e.clientX; sy = e.clientY; st = Date.now(); });
    el.addEventListener('pointerup', e => {
      if (!active) return; active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && Date.now() - st < 800) bounce();
    });
    el.addEventListener('pointercancel', () => { active = false; });
  })();
  document.addEventListener('keydown', e => {
    if (!$('cards').classList.contains('active')) return;
    if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); bounce(); }
  });

  // ---------- parent gate: long-press 1.5s ----------
  (function () {
    const b = $('parentBtn'); let t = null;
    const start = (e) => { e.preventDefault(); b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); t = null; openSettings(); }, 1500); };
    const end = () => { if (t) { clearTimeout(t); t = null; toast('家长请长按 1.5 秒进入设置'); } b.classList.remove('holding'); };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', end); b.addEventListener('pointerleave', () => { if (t) { clearTimeout(t); t = null; } b.classList.remove('holding'); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  })();

  // ---------- settings ----------
  let setLetter = 'A';
  function openSettings() { if ('speechSynthesis' in window) speechSynthesis.cancel(); show('settings'); renderPicker(); renderEditor(); }
  function renderPicker() {
    const p = $('letterPicker'); p.innerHTML = '';
    LETTERS.forEach(L => {
      const b = document.createElement('button'); b.textContent = L; if (L === setLetter) b.className = 'on';
      b.addEventListener('click', () => { setLetter = L; renderPicker(); renderEditor(); });
      p.appendChild(b);
    });
  }
  function fileSafe(s) { return String(s).trim().replace(/[^\w\-]+/g, '_') || 'card'; }
  function renderEditor() {
    const L = setLetter;
    $('setLetterTitle').textContent = `${L}${L.toLowerCase()}  ·  ${words[L].length} 个单词`;
    CardGen.renderLetterCard($('letterPreview'), L, usable(L)[0]);
    const list = $('wordList'); list.innerHTML = '';
    words[L].forEach((w, i) => {
      const row = document.createElement('div'); row.className = 'word-row';
      row.innerHTML = `<canvas class="thumb" width="800" height="1000"></canvas>
        <div class="fields">
          <input class="en-in" placeholder="英文单词，如 apple" autocapitalize="off" autocomplete="off" spellcheck="false">
          <input class="zh-in" placeholder="中文意思，如 苹果">
          <div class="row-btns">
            <input class="emoji-in" placeholder="emoji" title="可选：自定义 emoji">
            <button class="pill small up">↑</button>
            <button class="pill small dl">⬇ PNG</button>
            <button class="pill small warn del">删除</button>
          </div>
        </div>`;
      const thumb = row.querySelector('canvas'), en = row.querySelector('.en-in'), zh = row.querySelector('.zh-in'), em = row.querySelector('.emoji-in');
      en.value = w.en; zh.value = w.zh; em.value = w.emoji || '';
      const redraw = () => { CardGen.renderWordCard(thumb, w); CardGen.renderLetterCard($('letterPreview'), L, usable(L)[0]); };
      redraw();
      const onInput = () => { w.en = en.value; w.zh = zh.value; w.emoji = em.value; save(); redraw(); };
      [en, zh, em].forEach(inp => inp.addEventListener('input', onInput));
      row.querySelector('.del').addEventListener('click', () => { if (confirm(`删除 "${w.en || '(空)'}"？`)) { words[L].splice(i, 1); save(); renderEditor(); } });
      row.querySelector('.up').addEventListener('click', () => { if (i > 0) { [words[L][i - 1], words[L][i]] = [words[L][i], words[L][i - 1]]; save(); renderEditor(); } });
      row.querySelector('.dl').addEventListener('click', () => {
        const c = document.createElement('canvas'); CardGen.renderWordCard(c, w); CardGen.downloadCanvas(c, `${L}-${fileSafe(w.en)}.png`);
      });
      list.appendChild(row);
    });
  }
  $('addWord').addEventListener('click', () => {
    words[setLetter].push({ en: '', zh: '', emoji: '' }); save(); renderEditor();
    const ins = document.querySelectorAll('#wordList .en-in'); const last = ins[ins.length - 1]; if (last) last.focus();
  });
  $('dlLetter').addEventListener('click', () => {
    const c = document.createElement('canvas'); CardGen.renderLetterCard(c, setLetter, usable(setLetter)[0]); CardGen.downloadCanvas(c, `${setLetter}-letter.png`);
  });
  $('setBack').addEventListener('click', () => { renderHome(); show('home'); });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'abc-cards', version: 1, words }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'abc-cards-words.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('importFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result); const data = obj && obj.words ? obj.words : obj;
        if (!data || typeof data !== 'object' || !LETTERS.some(L => Array.isArray(data[L]))) throw new Error('bad');
        words = sanitize(data); save(); renderPicker(); renderEditor(); alert('导入成功！');
      } catch (err) { alert('导入失败：文件格式不正确'); }
      e.target.value = '';
    };
    r.readAsText(f);
  });
  $('resetLetter').addEventListener('click', () => { if (confirm(`把字母 ${setLetter} 恢复为默认单词？`)) { words[setLetter] = sanitize(clone(window.DEFAULT_WORDS))[setLetter]; save(); renderEditor(); } });
  $('resetAll').addEventListener('click', () => { if (confirm('全部 26 个字母恢复为默认单词？自定义内容将丢失。')) { words = sanitize(clone(window.DEFAULT_WORDS)); save(); renderEditor(); } });

  // ---------- prevent zoom / long-press menus (toddler mode) ----------
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => { if (!$('settings').classList.contains('active')) e.preventDefault(); });

  // ---------- init ----------
  renderHome();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if ($('cards').classList.contains('active')) drawCard(); });
  // debug/test hook
  window.ABC = { openLetter, openSettings, go, getWords: () => words };
})();
