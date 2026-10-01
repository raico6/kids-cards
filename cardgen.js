// Client-side card image generator (canvas). No network, no API key.
(function () {
  const W = 800, H = 1000;
  const FONT = '"Baloo 2","Nunito","Arial Rounded MT Bold","Helvetica Neue",Arial,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';
  const PALETTE = [
    ['#FF6B6B', '#FFD3D3'], ['#FF9F43', '#FFE3C7'], ['#FECA57', '#FFF3C4'], ['#1DD1A1', '#C9F7EA'],
    ['#54A0FF', '#D4E7FF'], ['#5F27CD', '#E1D5FA'], ['#FF6FB5', '#FFD6EB'], ['#00B8D4', '#C8F4FB'],
    ['#10AC84', '#CDEFE5'], ['#EE5253', '#FCD5D5'], ['#7B61FF', '#E3DCFF'], ['#F368E0', '#FDDCF8']
  ];

  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function paletteFor(key) { return PALETTE[hash(String(key).toLowerCase()) % PALETTE.length]; }
  function letterPalette(L) { return PALETTE[(L.toUpperCase().charCodeAt(0) - 65 + 12) % PALETTE.length]; }

  function lookupEmoji(word) {
    const map = window.EMOJI_MAP || {};
    const w = String(word || '').trim().toLowerCase();
    if (!w) return null;
    if (map[w]) return map[w];
    const cands = [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/[\s_]+/g, '-'), w.replace(/[-_]+/g, ' '), w.replace(/[\s\-_]+/g, '')];
    for (const c of cands) if (map[c]) return map[c];
    const parts = w.split(/[\s\-_]+/).reverse();
    for (const p of parts) if (map[p]) return map[p];
    return null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function star(ctx, cx, cy, r, n = 5) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = Math.PI / n * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function heart(ctx, cx, cy, s) {
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.35);
    ctx.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.4, cy - s, cx, cy - s * 0.4);
    ctx.bezierCurveTo(cx + s * 0.4, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.35); ctx.closePath();
  }
  function confetti(ctx, rand, colors, count, area) {
    for (let i = 0; i < count; i++) {
      const x = area.x + rand() * area.w, y = area.y + rand() * area.h, r = 10 + rand() * 22;
      ctx.globalAlpha = 0.35 + rand() * 0.35; ctx.fillStyle = colors[i % colors.length];
      const t = Math.floor(rand() * 4);
      if (t === 0) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      else if (t === 1) { star(ctx, x, y, r * 1.2); ctx.fill(); }
      else if (t === 2) { heart(ctx, x, y, r); ctx.fill(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(rand() * Math.PI); roundRect(ctx, -r, -r * 0.5, r * 2, r, r * 0.4); ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  function fitText(ctx, text, maxW, size, weight = '800', family = FONT) {
    do { ctx.font = `${weight} ${size}px ${family}`; if (ctx.measureText(text).width <= maxW) break; size -= 4; } while (size > 20);
    return size;
  }
  function background(ctx, main, light, seed) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, light); g.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rand = rng(seed);
    confetti(ctx, rand, [main, '#FFD93D', '#6BCB77', '#4D96FF', '#FF6B6B'], 26, { x: 0, y: 0, w: W, h: H });
    // white rounded panel
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    roundRect(ctx, 40, 40, W - 80, H - 80, 60); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore();
    ctx.lineWidth = 14; ctx.strokeStyle = main; roundRect(ctx, 40, 40, W - 80, H - 80, 60); ctx.stroke();
  }
  function drawEmoji(ctx, emoji, cx, cy, size) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${size}px ${EMOJI_FONT}`; ctx.fillText(emoji, cx, cy + size * 0.05); ctx.restore();
  }
  // Illustrated fallback for words without an emoji: a big blob with the first letter and shapes.
  function drawFallback(ctx, word, main, light, cx, cy, R) {
    const rand = rng(hash(word) + 7);
    ctx.save();
    // sunburst
    ctx.translate(cx, cy);
    for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = i % 2 ? light : '#FFF6D6'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 1.15, -R * 0.2); ctx.lineTo(R * 1.15, R * 0.2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // blob
    ctx.save(); ctx.beginPath();
    const pts = 10;
    for (let i = 0; i <= pts; i++) {
      const a = (Math.PI * 2 / pts) * i, rr = R * (0.82 + rand() * 0.12);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(cx + Math.cos(a - Math.PI / pts) * R, cy + Math.sin(a - Math.PI / pts) * R, x, y);
    }
    ctx.closePath(); ctx.fillStyle = main; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 20; ctx.fill(); ctx.restore();
    // orbiting shapes
    const cols = ['#FFD93D', '#6BCB77', '#4D96FF', '#FF6B6B', '#FFFFFF'];
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, d = R * (0.95 + rand() * 0.15), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      ctx.fillStyle = cols[i % cols.length]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
      if (i % 3 === 0) { star(ctx, x, y, 34); } else if (i % 3 === 1) { ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); } else { heart(ctx, x, y, 30); }
      ctx.fill(); ctx.stroke();
    }
    // letter with cute face
    const L = (word.trim()[0] || '?').toUpperCase();
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${R * 1.2}px ${FONT}`; ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.strokeText(L, cx, cy - R * 0.05); ctx.fillStyle = '#FFFFFF'; ctx.fillText(L, cx, cy - R * 0.05);
    ctx.restore();
    // eyes + smile under the letter
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(cx - R * 0.5, cy + R * 0.45, 10, 0, Math.PI * 2); ctx.arc(cx + R * 0.5, cy + R * 0.45, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy + R * 0.48, R * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,150,0.6)';
    ctx.beginPath(); ctx.arc(cx - R * 0.7, cy + R * 0.55, 16, 0, Math.PI * 2); ctx.arc(cx + R * 0.7, cy + R * 0.55, 16, 0, Math.PI * 2); ctx.fill();
  }

  function renderWordCard(canvas, item) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const word = String(item.en || '').trim() || '?';
    const [main, light] = paletteFor(word);
    background(ctx, main, light, hash(word));
    const emoji = (item.emoji && item.emoji.trim()) || lookupEmoji(word);
    const cx = W / 2, cy = 400;
    if (emoji) {
      ctx.beginPath(); ctx.arc(cx, cy, 270, 0, Math.PI * 2); ctx.fillStyle = light; ctx.fill();
      drawEmoji(ctx, emoji, cx, cy, 360);
    } else {
      drawFallback(ctx, word, main, light, cx, cy, 240);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const size = fitText(ctx, word, W - 160, 150);
    ctx.fillStyle = main; ctx.fillText(word, cx, 820 - (150 - size) * 0.3);
    // highlight first letter? keep simple; Chinese below
    if (item.zh) { fitText(ctx, item.zh, W - 160, 64, '700'); ctx.fillStyle = '#777'; ctx.fillText(item.zh, cx, 905); }
    return canvas;
  }

  function renderLetterCard(canvas, letter, firstItem) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const L = letter.toUpperCase();
    const [main, light] = letterPalette(L);
    background(ctx, main, light, hash('letter' + L));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 400px ${FONT}`;
    ctx.lineWidth = 22; ctx.strokeStyle = light; ctx.strokeText(L + L.toLowerCase(), W / 2, 380);
    ctx.fillStyle = main; ctx.fillText(L + L.toLowerCase(), W / 2, 380);
    if (firstItem && firstItem.en) {
      const emoji = (firstItem.emoji && firstItem.emoji.trim()) || lookupEmoji(firstItem.en);
      if (emoji) drawEmoji(ctx, emoji, W / 2, 680, 170);
      else { const [m2, l2] = paletteFor(firstItem.en); drawFallback(ctx, firstItem.en, m2, l2, W / 2, 680, 90); }
      const phrase = `${L} is for ${firstItem.en}`;
      ctx.textBaseline = 'alphabetic'; fitText(ctx, phrase, W - 160, 84); ctx.fillStyle = '#444'; ctx.fillText(phrase, W / 2, 870);
      if (firstItem.zh) { ctx.font = `700 46px ${FONT}`; ctx.fillStyle = '#888'; ctx.fillText(firstItem.zh, W / 2, 925); }
    }
    return canvas;
  }

  function downloadCanvas(canvas, filename) {
    const a = document.createElement('a');
    a.download = filename; a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.CardGen = { W, H, renderWordCard, renderLetterCard, lookupEmoji, downloadCanvas, letterPalette, paletteFor };
})();
