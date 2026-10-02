(function () {
  'use strict';
  const STORE_KEY = 'abcCards.words.v1';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TTS_AUDIO_HOST = 'lzsdmntehhzjvacxkpza.supabase.co';
  function wordSlug(en) {
    return String(en || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function validWordText(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 40) return false;
    return /^[A-Za-z]+(?:['-][A-Za-z]+)*(?: +[A-Za-z]+(?:['-][A-Za-z]+)*)*$/.test(t);
  }
  function safeAudioUrl(v, slug) {
    const s = String(v || '').trim();
    if (!s || !slug) return '';
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:' || u.hostname !== TTS_AUDIO_HOST) return '';
      if (u.pathname !== '/storage/v1/object/public/tts/audio/tts/' + slug + '.mp3') return '';
      if (u.search && !/^\?v=\d{1,16}$/.test(u.search)) return u.origin + u.pathname;
      return u.origin + u.pathname + (u.search || '');
    } catch (e) { return ''; }
  }

  // ---------- data ----------
  function sanitize(data) {
    const out = {};
    for (const L of LETTERS) {
      const arr = Array.isArray(data && data[L]) ? data[L] : [];
      out[L] = arr.filter(w => w && typeof w.en === 'string').map(w => {
        const en = String(w.en).slice(0, 40);
        const item = { en, zh: String(w.zh || '').slice(0, 40), emoji: String(w.emoji || '').slice(0, 16) };
        const audio = safeAudioUrl(w.audio, wordSlug(en));
        if (audio) item.audio = audio;
        return item;
      });
    }
    return out;
  }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return sanitize(JSON.parse(raw)); } catch (e) { /* ignore */ }
    return sanitize(clone(window.DEFAULT_WORDS));
  }
  let words = load();
  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(words)); }
    catch (e) { toast('保存失败（浏览器存储不可用）'); }
  }
  function save() { persistLocal(); markDirty(); scheduleCloudSave(); }
  const usable = (L) => words[L].filter(w => w.en.trim());

  // ---------- speech ----------
  // Playback: built-in mp3, then a cloud recording stored on the word, then Web Speech.
  const player = new Audio();
  player.preload = 'auto';
  player.setAttribute('playsinline', '');
  const recordedWords = new Set();
  if (window.DEFAULT_WORDS) {
    LETTERS.forEach(L => (window.DEFAULT_WORDS[L] || []).forEach(w => {
      if (w && w.en) recordedWords.add(wordSlug(w.en));
    }));
  }
  function stopTalking() {
    try { player.pause(); } catch (e) { /* ignore */ }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  }
  let playToken = 0;
  function playUrl(url, onFail) {
    const token = ++playToken;
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    let abs = url;
    try { abs = new URL(url, document.baseURI).href; } catch (e) { /* keep url */ }
    const fail = () => {
      if (token !== playToken) return;
      playToken++;
      if (onFail) onFail();
    };
    player.onerror = () => {
      const code = player.error && player.error.code;
      if (code === 1) return;
      fail();
    };
    try {
      if (player.src !== abs) player.src = abs;
      else player.currentTime = 0;
    } catch (e) { player.src = abs; }
    const pending = player.play();
    if (pending && typeof pending.catch === 'function') {
      pending.catch((err) => {
        if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
        fail();
      });
    }
  }
  function clipFor(item) {
    if (!item) return null;
    if (item.type === 'letter') return 'audio/letters/' + String(item.L || '').toLowerCase() + '.mp3';
    const slug = wordSlug(item.w && item.w.en);
    if (slug && recordedWords.has(slug)) return 'audio/words/' + slug + '.mp3';
    const audio = item.w && safeAudioUrl(item.w.audio, slug);
    if (audio) return audio;
    return null;
  }
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
    try { player.pause(); } catch (e) { /* ignore */ }
    try {
      speechSynthesis.cancel();
      (Array.isArray(parts) ? parts : [parts]).forEach(t => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'en-US'; u.rate = 0.8; u.pitch = 1.1; if (voice) u.voice = voice;
        speechSynthesis.speak(u);
      });
    } catch (e) { /* ignore */ }
  }
  function preloadAudio() {
    const urls = LETTERS.map(L => 'audio/letters/' + L.toLowerCase() + '.mp3');
    const run = () => { urls.forEach(u => { fetch(u).catch(() => {}); }); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 500);
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
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
    usable(L).forEach(w => {
      const slug = wordSlug(w.en);
      if (recordedWords.has(slug)) fetch('audio/words/' + slug + '.mp3').catch(() => {});
      else {
        const audio = safeAudioUrl(w.audio, slug);
        if (audio) fetch(audio).catch(() => {});
      }
    });
  }
  function drawCard(dir) {
    const c = $('card'), item = deck[idx];
    if (item.type === 'letter') CardGen.renderLetterCard(c, item.L);
    else CardGen.renderWordCard(c, item.w);
    const dots = $('dots'); dots.innerHTML = deck.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
    $('prevBtn').disabled = curLetter === 'A' && idx === 0;
    $('nextBtn').disabled = curLetter === 'Z' && idx === deck.length - 1;
    if (dir) { c.classList.remove('slide-l', 'slide-r', 'bounce'); void c.offsetWidth; c.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  function speakCurrent() {
    const item = deck[idx];
    const url = clipFor(item);
    if (url) {
      playUrl(url, () => {
        if (deck[idx] !== item) return;
        if (item && item.type === 'word' && item.w) speak([item.w.en]);
      });
      return;
    }
    if (item && item.type === 'word' && item.w) speak([item.w.en]);
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
  $('homeBtn').addEventListener('click', () => { stopTalking(); renderHome(); show('home'); });

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
  function openSettings() { stopTalking(); show('settings'); renderPicker(); renderEditor(); try { backfillTts(); } catch (e) { /* recording is optional */ } }
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
    CardGen.renderLetterCard($('letterPreview'), L);
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
          <div class="audio-line"><span class="audio-status"></span><button type="button" class="pill small regen">重新生成</button></div>
        </div>`;
      const thumb = row.querySelector('canvas'), en = row.querySelector('.en-in'), zh = row.querySelector('.zh-in'), em = row.querySelector('.emoji-in');
      en.value = w.en; zh.value = w.zh; em.value = w.emoji || '';
      const redraw = () => { CardGen.renderWordCard(thumb, w); CardGen.renderLetterCard($('letterPreview'), L); };
      redraw();
      const onInput = () => {
        const prev = wordSlug(w.en);
        w.en = en.value; w.zh = zh.value; w.emoji = em.value;
        if (wordSlug(w.en) !== prev && w.audio) delete w.audio;
        if (wordSlug(w.en) !== prev) scheduleTts(w, false);
        save(); redraw(); updateAudioRow(row, w);
      };
      [en, zh, em].forEach(inp => inp.addEventListener('input', onInput));
      row.querySelector('.del').addEventListener('click', () => { if (confirm(`删除 "${w.en || '(空)'}"？`)) { words[L].splice(i, 1); save(); renderEditor(); } });
      row.querySelector('.up').addEventListener('click', () => { if (i > 0) { [words[L][i - 1], words[L][i]] = [words[L][i], words[L][i - 1]]; save(); renderEditor(); } });
      row.querySelector('.dl').addEventListener('click', () => {
        const c = document.createElement('canvas'); CardGen.renderWordCard(c, w); CardGen.downloadCanvas(c, `${L}-${fileSafe(w.en)}.png`);
      });
      row.querySelector('.regen').addEventListener('click', () => {
        if (w.audio) delete w.audio;
        ttsUnavailable = false;
        scheduleTts(w, true, 0);
        updateAudioRow(row, w);
      });
      updateAudioRow(row, w);
      list.appendChild(row);
    });
  }
  $('addWord').addEventListener('click', () => {
    words[setLetter].push({ en: '', zh: '', emoji: '' }); save(); renderEditor();
    const ins = document.querySelectorAll('#wordList .en-in'); const last = ins[ins.length - 1]; if (last) last.focus();
  });
  $('dlLetter').addEventListener('click', () => {
    const c = document.createElement('canvas'); CardGen.renderLetterCard(c, setLetter); CardGen.downloadCanvas(c, `${setLetter}-letter.png`);
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

  // ---------- print (parent): A4, 2×3, same canvas cards ----------
  const PRINT_COLS = 2, PRINT_ROWS = 3, PRINT_PER = PRINT_COLS * PRINT_ROWS;
  const printOn = {};
  LETTERS.forEach(L => { printOn[L] = true; });
  function printItems() {
    const wantL = $('incLetter').checked, wantW = $('incWord').checked, items = [];
    LETTERS.forEach(L => {
      if (!printOn[L]) return;
      if (wantL) items.push({ type: 'letter', L });
      if (wantW) usable(L).forEach(w => items.push({ type: 'word', L, w }));
    });
    return items;
  }
  function paintPrintCard(item) {
    const canvas = document.createElement('canvas');
    if (item.type === 'letter') CardGen.renderLetterCard(canvas, item.L);
    else CardGen.renderWordCard(canvas, item.w);
    const img = document.createElement('img');
    img.alt = item.type === 'letter' ? `${item.L} letter` : `${item.w.en} ${item.w.zh || ''}`.trim();
    img.src = canvas.toDataURL('image/png');
    return img;
  }
  function renderPrint() {
    const box = $('printLetters');
    if (!box.childElementCount) {
      LETTERS.forEach(L => {
        const b = document.createElement('button');
        b.textContent = L; b.className = printOn[L] ? 'on' : '';
        b.addEventListener('click', () => { printOn[L] = !printOn[L]; renderPrint(); });
        box.appendChild(b);
      });
    } else {
      [...box.children].forEach((b, i) => b.classList.toggle('on', !!printOn[LETTERS[i]]));
    }
    const items = printItems();
    const pages = $('printPages'); pages.innerHTML = '';
    const pageCount = Math.ceil(items.length / PRINT_PER);
    $('printCount').textContent = items.length ? `共 ${items.length} 张 · ${pageCount} 页` : '请选择字母，并勾选字母卡或单词卡';
    $('doPrint').disabled = !items.length;
    if (!items.length) {
      const p = document.createElement('p'); p.className = 'print-empty'; p.textContent = '没有可打印的卡片';
      pages.appendChild(p); return;
    }
    for (let p = 0; p < items.length; p += PRINT_PER) {
      const page = document.createElement('div'); page.className = 'print-page';
      const grid = document.createElement('div'); grid.className = 'print-grid';
      const slice = items.slice(p, p + PRINT_PER);
      for (let i = 0; i < PRINT_PER; i++) {
        const cell = document.createElement('div'); cell.className = 'print-card';
        if (slice[i]) cell.appendChild(paintPrintCard(slice[i]));
        grid.appendChild(cell);
      }
      page.appendChild(grid); pages.appendChild(page);
    }
  }
  function openPrint() {
    stopTalking();
    show('print');
    $('printCount').textContent = '正在排版…';
    const run = () => { if ($('print').classList.contains('active')) renderPrint(); };
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(run);
    else setTimeout(run, 30);
  }
  $('openPrint').addEventListener('click', openPrint);
  $('printBack').addEventListener('click', () => { $('printPages').innerHTML = ''; show('settings'); });
  $('lettersAll').addEventListener('click', () => { LETTERS.forEach(L => { printOn[L] = true; }); renderPrint(); });
  $('lettersNone').addEventListener('click', () => { LETTERS.forEach(L => { printOn[L] = false; }); renderPrint(); });
  $('incLetter').addEventListener('change', renderPrint);
  $('incWord').addEventListener('change', renderPrint);
  $('doPrint').addEventListener('click', () => { if (printItems().length) window.print(); });
  window.addEventListener('beforeprint', () => { stopTalking(); });

  // ---------- prevent zoom / long-press menus (toddler mode) ----------
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => { if (!$('settings').classList.contains('active') && !$('print').classList.contains('active')) e.preventDefault(); });

  // ---------- cloud sync (parent). localStorage stays the offline cache. ----------
  const META_KEY = 'abcCards.sync.v1';
  function readMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) {
        const m = JSON.parse(raw);
        return { updatedAt: m.updatedAt || null, dirty: !!m.dirty, lastSyncedAt: m.lastSyncedAt || null };
      }
    } catch (e) { /* ignore */ }
    return { updatedAt: null, dirty: !!localStorage.getItem(STORE_KEY), lastSyncedAt: null };
  }
  let meta = readMeta();
  function writeMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } }
  function markDirty() { meta.dirty = true; meta.updatedAt = new Date().toISOString(); writeMeta(); }
  function sameWords(a, b) { return JSON.stringify(sanitize(a)) === JSON.stringify(sanitize(b)); }
  function wordsFromPayload(data) {
    if (!data || typeof data !== 'object') return sanitize(null);
    const inner = data.words && typeof data.words === 'object' && !Array.isArray(data.words) ? data.words : data;
    return sanitize(inner);
  }
  function timeOf(v) { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; }
  function formatWhen(iso) {
    if (!iso) return '还没有';
    try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return '还没有'; }
  }
  function emailRedirectTo() {
    try {
      const u = new URL(location.href);
      u.hash = '';
      if (u.hostname === 'raico6.github.io') return 'https://raico6.github.io/kids-cards/';
      return u.origin + u.pathname + u.search;
    } catch (e) { return 'https://raico6.github.io/kids-cards/'; }
  }

  let cloud = null, session = null, conflict = null, cloudTimer = null, pushing = false, syncStatus = '—';
  const ttsState = new Map();
  const ttsTimers = new Map();
  let ttsUnavailable = false;
  function updateAudioRow(row, w) {
    if (!row || !w) return;
    const slug = wordSlug(w.en);
    row.dataset.slug = slug;
    const status = row.querySelector('.audio-status');
    const regen = row.querySelector('.regen');
    const builtin = !!(slug && recordedWords.has(slug));
    const cloudAudio = safeAudioUrl(w.audio, slug);
    const pending = !!(slug && ttsState.get(slug) === 'pending');
    let label = '';
    if (String(w.en || '').trim()) {
      if (builtin || cloudAudio) label = '已有录音';
      else if (pending) label = '录音生成中';
      else label = '用手机语音';
    }
    if (status) status.textContent = label;
    if (regen) {
      regen.hidden = !(session && validWordText(w.en) && !builtin);
      regen.disabled = pending;
    }
  }
  function refreshAudioRows() {
    if (!$('settings').classList.contains('active')) return;
    document.querySelectorAll('#wordList .word-row').forEach((row, i) => {
      const w = words[setLetter] && words[setLetter][i];
      if (w) updateAudioRow(row, w);
    });
  }
  function ttsFailedHard(error) {
    const response = error && error.context;
    const status = response && response.status;
    if (status === 400 || status === 401 || status === 429) return false;
    return true;
  }
  function scheduleTts(word, force, delay) {
    if (!word) return;
    const slug = wordSlug(word.en);
    if (!slug || !validWordText(word.en)) return;
    if (!force && recordedWords.has(slug)) return;
    if (!force && safeAudioUrl(word.audio, slug)) return;
    if (!session || !cloud) return;
    if (ttsUnavailable && !force) return;
    const wait = typeof delay === 'number' ? delay : 800;
    const prevTimer = ttsTimers.get(slug);
    if (prevTimer) clearTimeout(prevTimer);
    ttsState.set(slug, 'pending');
    refreshAudioRows();
    const timer = setTimeout(() => { ttsTimers.delete(slug); runTts(word, slug, !!force); }, wait);
    ttsTimers.set(slug, timer);
  }
  async function runTts(word, slug, force) {
    if (!cloud || !session || wordSlug(word.en) !== slug) { ttsState.delete(slug); refreshAudioRows(); return; }
    ttsState.set(slug, 'pending');
    try {
      const res = await cloud.functions.invoke('tts', { body: { text: String(word.en).trim(), force: !!force } });
      if (!res || res.error || !res.data || !res.data.url) throw (res && res.error) || new Error('tts');
      if (wordSlug(word.en) !== slug) return;
      const url = safeAudioUrl(res.data.url, slug);
      if (!url) throw new Error('url');
      word.audio = url;
      ttsState.delete(slug);
      ttsUnavailable = false;
      save();
      fetch(url).catch(() => {});
    } catch (err) {
      if (wordSlug(word.en) === slug) ttsState.delete(slug);
      if (!force && ttsFailedHard(err)) ttsUnavailable = true;
    }
    refreshAudioRows();
  }
  function backfillTts() {
    if (!session || !cloud || conflict || ttsUnavailable) return;
    LETTERS.forEach(L => words[L].forEach(w => scheduleTts(w, false, 1000)));
  }
  function setStatus(text) { syncStatus = text; const el = $('syncStatus'); if (el) el.textContent = text; const when = $('syncWhen'); if (when) when.textContent = formatWhen(meta.lastSyncedAt); }
  function renderSync() {
    const loggedIn = !!(session && session.user);
    const form = $('syncForm'), box = $('syncSession'), fight = $('syncConflict');
    if (form) form.hidden = loggedIn;
    if (box) box.hidden = !loggedIn;
    if (fight) fight.hidden = !conflict;
    const who = $('syncWho'); if (who) who.textContent = loggedIn ? (session.user.email || '') : '';
    setStatus(syncStatus);
  }
  function refreshViews() {
    if ($('home').classList.contains('active')) renderHome();
    if ($('settings').classList.contains('active')) { renderPicker(); renderEditor(); }
    if ($('cards').classList.contains('active')) {
      buildDeck(curLetter);
      if (idx >= deck.length) idx = Math.max(0, deck.length - 1);
      drawCard();
    }
    if ($('print').classList.contains('active')) renderPrint();
  }
  function applyRemote(row) {
    words = wordsFromPayload(row.data);
    persistLocal();
    meta.dirty = false;
    meta.updatedAt = row.updated_at || meta.updatedAt;
    meta.lastSyncedAt = row.updated_at || new Date().toISOString();
    writeMeta();
    conflict = null;
    refreshViews();
    setStatus('已同步');
    renderSync();
    try { backfillTts(); } catch (e) { /* recording is optional */ }
  }
  function scheduleCloudSave() {
    if (!cloud || !session || conflict) return;
    if (navigator.onLine === false) { setStatus('离线，稍后同步'); return; }
    setStatus('同步中');
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { cloudTimer = null; pushNow(); }, 1000);
  }
  async function pushNow() {
    if (pushing || !cloud || !session || conflict) return;
    if (navigator.onLine === false) { setStatus('离线，稍后同步'); return; }
    const stamp = meta.updatedAt || new Date().toISOString();
    if (!meta.updatedAt) { meta.updatedAt = stamp; writeMeta(); }
    const payload = sanitize(words);
    pushing = true;
    setStatus('同步中');
    try {
      const { error } = await cloud.from('word_lists').upsert({
        user_id: session.user.id, data: payload, updated_at: stamp
      }, { onConflict: 'user_id' });
      if (error) throw error;
      if (meta.updatedAt === stamp && sameWords(words, payload)) {
        meta.dirty = false; meta.lastSyncedAt = stamp; writeMeta(); setStatus('已同步');
      } else scheduleCloudSave();
    } catch (e) {
      setStatus(navigator.onLine === false ? '离线，稍后同步' : '同步失败');
    } finally { pushing = false; renderSync(); }
  }
  async function reconcile() {
    if (!cloud || !session) return;
    if (navigator.onLine === false) { setStatus('离线，稍后同步'); renderSync(); return; }
    setStatus('同步中');
    let row = null;
    try {
      const res = await cloud.from('word_lists').select('data, updated_at').eq('user_id', session.user.id).maybeSingle();
      if (res.error) throw res.error;
      row = res.data;
    } catch (e) {
      setStatus(navigator.onLine === false ? '离线，稍后同步' : '同步失败');
      renderSync();
      return;
    }
    if (!row) {
      if (!meta.updatedAt) { meta.updatedAt = new Date().toISOString(); writeMeta(); }
      meta.dirty = true; writeMeta();
      await pushNow();
      return;
    }
    const remote = wordsFromPayload(row.data);
    if (sameWords(words, remote)) {
      meta.dirty = false; meta.updatedAt = row.updated_at || meta.updatedAt; meta.lastSyncedAt = row.updated_at || meta.lastSyncedAt;
      writeMeta(); conflict = null; setStatus('已同步'); renderSync();
      try { backfillTts(); } catch (e) { /* recording is optional */ }
      return;
    }
    if (meta.dirty) {
      conflict = { data: row.data, updated_at: row.updated_at };
      setStatus('请选择保留哪一份'); renderSync(); return;
    }
    if (timeOf(row.updated_at) >= timeOf(meta.updatedAt)) applyRemote(row);
    else { meta.dirty = true; writeMeta(); await pushNow(); }
  }
  function stripAuthParams() {
    try {
      const u = new URL(location.href);
      let changed = false;
      ['code', 'error', 'error_code', 'error_description'].forEach(k => { if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; } });
      if (u.hash && /access_token|error|refresh_token/.test(u.hash)) { u.hash = ''; changed = true; }
      if (changed) history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* ignore */ }
  }
  function noteAuthError() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('error') || (u.hash && u.hash.indexOf('error') >= 0)) {
        const note = $('syncNote'); if (note) note.textContent = '登录链接无效或已过期，请重新发送。';
      }
    } catch (e) { /* ignore */ }
  }
  let reconcileGen = 0;
  function queueReconcile() {
    const gen = ++reconcileGen;
    setTimeout(() => { if (gen === reconcileGen) reconcile().catch(() => setStatus('同步失败')); }, 0);
  }
  function handleAuth(event, next) {
    session = next || null;
    if (!session) { conflict = null; syncStatus = '—'; renderSync(); return; }
    renderSync();
    if (event === 'TOKEN_REFRESHED') return;
    stripAuthParams();
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') queueReconcile();
  }
  function initCloud() {
    noteAuthError();
    const cfg = window.SUPABASE_CONFIG;
    if (!window.supabase || !window.supabase.createClient || !cfg || !cfg.url || !cfg.publishableKey) {
      const note = $('syncNote'); if (note) note.textContent = '云同步暂时不可用';
      const btn = $('syncSend'); if (btn) btn.disabled = true;
      return;
    }
    try {
      cloud = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
      });
    } catch (e) {
      const note = $('syncNote'); if (note) note.textContent = '云同步暂时不可用';
      return;
    }
    try {
      cloud.auth.onAuthStateChange((event, next) => { try { handleAuth(event, next); } catch (err) { setStatus('同步失败'); } });
    } catch (e) {
      const note = $('syncNote'); if (note) note.textContent = '云同步暂时不可用';
    }
  }
  $('syncForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = ($('syncEmail').value || '').trim();
    const note = $('syncNote');
    if (!cloud) { if (note) note.textContent = '云同步暂时不可用'; return; }
    if (!email || email.indexOf('@') < 0) { if (note) note.textContent = '请输入有效的邮箱'; return; }
    $('syncSend').disabled = true;
    if (note) note.textContent = '正在发送…';
    cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: emailRedirectTo() } }).then((res) => {
      if (res && res.error) throw res.error;
      if (note) note.textContent = '登录链接已发送，请用这个浏览器打开邮件里的链接。';
    }).catch(() => { if (note) note.textContent = '发送失败，请稍后再试。'; })
      .then(() => { $('syncSend').disabled = false; });
  });
  $('syncOut').addEventListener('click', () => {
    const done = () => { session = null; conflict = null; syncStatus = '—'; const note = $('syncNote'); if (note) note.textContent = '已退出登录'; renderSync(); };
    if (!cloud) { done(); return; }
    cloud.auth.signOut().then(done, done);
  });
  $('syncUseCloud').addEventListener('click', () => { if (conflict) applyRemote(conflict); });
  $('syncUseLocal').addEventListener('click', () => {
    if (!conflict) return;
    conflict = null; meta.dirty = true; if (!meta.updatedAt) meta.updatedAt = new Date().toISOString(); writeMeta();
    renderSync(); pushNow();
  });
  window.addEventListener('online', () => { if (session && meta.dirty && !conflict) scheduleCloudSave(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session && meta.dirty && !conflict && navigator.onLine !== false) scheduleCloudSave();
  });

  // ---------- init ----------
  renderHome();
  renderSync();
  preloadAudio();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if ($('cards').classList.contains('active')) drawCard(); });
  try { initCloud(); } catch (e) { /* toddler screens keep working from localStorage */ }
  // debug/test hook
  window.ABC = {
    openLetter, openSettings, openPrint, go, getWords: () => words,
    sync: () => ({ status: syncStatus, dirty: meta.dirty, conflict: !!conflict, lastSyncedAt: meta.lastSyncedAt, email: session && session.user && session.user.email })
  };
})();
