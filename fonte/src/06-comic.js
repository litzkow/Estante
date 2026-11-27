/* ================= panel detection ================= */
function detectPanels(img, W, H, dir) {
  const maxD = 1100, sc = Math.min(1, maxD / Math.max(W, H));
  const w = Math.max(16, Math.round(W * sc)), h = Math.max(16, Math.round(H * sc));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  let data; try { data = cx.getImageData(0, 0, w, h).data; } catch (e) { return []; }
  // background colour = median of the outer ring
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const R = [], G = [], B = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
    const k = (y * w + x) * 4; R.push(data[k]); G.push(data[k + 1]); B.push(data[k + 2]);
  }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  const RR = R.slice(), GG = G.slice(), BB = B.slice();
  const br = med(R), bg = med(G), bb = med(B);
  // full-bleed art (no page margin): the ring is not one colour -> treat as a single splash page
  let same = 0; for (let i = 0; i < RR.length; i++) if (Math.abs(RR[i] - br) + Math.abs(GG[i] - bg) + Math.abs(BB[i] - bb) <= 66) same++;
  const bleed = same < RR.length * 0.6;
  const N = w * h, ink = new Uint8Array(N);
  for (let i = 0, k = 0; i < N; i++, k += 4) ink[i] = (Math.abs(data[k] - br) + Math.abs(data[k + 1] - bg) + Math.abs(data[k + 2] - bb)) > 66 ? 1 : 0;
  const RP = new Int32Array((w + 1) * h), CP = new Int32Array((h + 1) * w);
  for (let y = 0; y < h; y++) { let s = 0; const o = y * (w + 1), r = y * w; for (let x = 0; x < w; x++) { s += ink[r + x]; RP[o + x + 1] = s; } }
  for (let x = 0; x < w; x++) { let s = 0; const o = x * (h + 1); for (let y = 0; y < h; y++) { s += ink[y * w + x]; CP[o + y + 1] = s; } }
  const rowInk = (y, x0, x1) => RP[y * (w + 1) + x1] - RP[y * (w + 1) + x0];
  const colInk = (x, y0, y1) => CP[x * (h + 1) + y1] - CP[x * (h + 1) + y0];
  const minGap = Math.max(2, Math.round(Math.min(w, h) * 0.0035));
  // dark map (panel borders, black gutters): lets the page be cut along a frame line or a black band
  const dark = new Uint8Array(N);
  for (let i = 0, k = 0; i < N; i++, k += 4) dark[i] = (data[k] * 30 + data[k + 1] * 59 + data[k + 2] * 11) / 100 < 85 ? 1 : 0;
  const DR = new Int32Array((w + 1) * h), DC = new Int32Array((h + 1) * w);
  for (let y = 0; y < h; y++) { let t = 0; const o = y * (w + 1), r = y * w; for (let x = 0; x < w; x++) { t += dark[r + x]; DR[o + x + 1] = t; } }
  for (let x = 0; x < w; x++) { let t = 0; const o = x * (h + 1); for (let y = 0; y < h; y++) { t += dark[y * w + x]; DC[o + y + 1] = t; } }
  const rowDark = (y, x0, x1) => DR[y * (w + 1) + x1] - DR[y * (w + 1) + x0];
  const colDark = (x, y0, y1) => DC[x * (h + 1) + y1] - DC[x * (h + 1) + y0];
  // a frame line / black gutter: almost the whole line is dark, and a little way off on both sides it is not
  // (so a dark area inside a picture is never taken for a border)
  const lineCuts = (r, horiz) => {
    const { x0, y0, x1, y1 } = r, len = horiz ? x1 - x0 : y1 - y0, a = horiz ? y0 : x0, b = horiz ? y1 : x1, span = b - a;
    const fr = p => (horiz ? rowDark(p, x0, x1) : colDark(p, y0, y1)) / Math.max(1, len);
    // a scanned border is a little tilted: count a position as dark if any of the k lines of the band is dark there
    const band = (p, k) => { let n = 0; for (let t = 0; t < len; t++) { for (let j = 0; j < k && p + j < b; j++) { const idx = horiz ? (p + j) * w + x0 + t : (y0 + t) * w + p + j; if (dark[idx]) { n++; break; } } } return n / Math.max(1, len); };
    const clear = p => (horiz ? rowInk(p, x0, x1) : colInk(p, y0, y1)) <= len * 0.5;   // mostly page colour: a gutter
    const maxT = Math.max(4, Math.round(span * 0.045)), edge = Math.round(span * 0.08), out = [];
    const thick = Math.round(Math.min(w, h) * 0.012);
    let p = a + edge;
    while (p < b - edge) {
      if (fr(p) >= 0.12 && band(p, 5) >= 0.84) {
        let q = p; while (q + 1 < b && fr(q + 1) >= 0.12 && band(q + 1, 5) >= 0.84) q++;
        const lo = fr(Math.max(a, p - 4)), hi = fr(Math.min(b - 1, q + 7));
        // a printed frame line is thin; a thick dark bar (a prison bar, a door frame, a post) is part of the picture
        const maxLine = Math.max(5, Math.round(Math.min(w, h) * 0.012)) + 1;
        let ok = q - p + 1 <= (horiz ? maxT + 3 : Math.min(maxT + 3, maxLine)) && lo < 0.6 && hi < 0.6;
        // a thin upright line can be a door or a post inside a picture: only a real border has a clean gutter beside it
        // a real frame line runs the whole height without a break; a line drawn in the art (a wall, a post) fades or breaks
                // a line drawn in the art (a wall corner, a post) is never as solid as a printed frame line
        if (ok && !horiz && q - p + 1 < thick) { let mf = 0; for (let z = p; z <= q; z++) mf = Math.max(mf, fr(z)); if (mf < 0.88) ok = false; }
        if (ok && !horiz && q - p + 1 < thick) { ok = false; for (let d = 2; d <= Math.round(span * 0.05); d++) if ((p - d >= a && clear(p - d)) || (q + d < b && clear(q + d))) { ok = true; break; } }
        if (ok) out.push([p, q + 5]);
        p = q + 1;
      } else p++;
    }
    return out;
  };
  // black gutters: panels laid on a black page. A band where nearly every pixel is dark, at least a few pixels wide,
  // with a picture (mostly not dark) on both sides
  // a black gutter belongs to a black page: past both ends of the band it is still dark
  // (a black bar drawn inside a panel stops at the panel's edge, with page colour beyond)
  const joinsBlack = (r, horiz, g0, g1) => {
    const out = (end) => {
      let hit = 0, n = 0;
      for (let k = 2; k <= 6; k++) {
        const c = end ? (horiz ? r.x1 - 1 + k : r.y1 - 1 + k) : (horiz ? r.x0 - k : r.y0 - k);
        if (c < 0 || c >= (horiz ? w : h)) return true;           // the band reaches the edge of the page
        for (let p = g0; p < g1; p++) { n++; if (horiz ? dark[p * w + c] : dark[c * w + p]) hit++; }
      }
      return hit >= n * 0.7;
    };
    return out(false) && out(true);
  };
  const darkGaps = (r, horiz) => {
    const { x0, y0, x1, y1 } = r, len = horiz ? x1 - x0 : y1 - y0, a = horiz ? y0 : x0, b = horiz ? y1 : x1, span = b - a;
    const fr = p => (horiz ? rowDark(p, x0, x1) : colDark(p, y0, y1)) / Math.max(1, len);
    const side = (p0, p1) => { let t = 0, n = 0; for (let p = Math.max(a, p0); p < Math.min(b, p1); p++) { t += fr(p); n++; } return n ? 1 - t / n : 0; };
    // only where the panels sit on a black page: the band's two ends run into black too
    const ends = horiz ? [colDark(x0, y0, y1), colDark(x1 - 1, y0, y1)].map(v => v / Math.max(1, y1 - y0)) : [rowDark(y0, x0, x1), rowDark(y1 - 1, x0, x1)].map(v => v / Math.max(1, x1 - x0));
    void ends;
    const need = Math.max(4, Math.round((horiz ? h : w) * 0.02)), out = []; let p = a + Math.round(span * 0.06);
    while (p < b - span * 0.06) {
      if (fr(p) >= 0.97) {
        let q = p; while (q + 1 < b && fr(q + 1) >= 0.97) q++;
        const wd = q - p + 1, look = Math.round(span * 0.08);
        if (wd >= need && wd <= span * 0.1 && side(p - look, p) > 0.15 && side(q + 1, q + 1 + look) > 0.15 && fr(Math.max(a, p - 3)) < 0.75 && fr(Math.min(b - 1, q + 3)) < 0.75 && joinsBlack(r, horiz, p, q + 1)) out.push([p, q + 1]);
        p = q + 1;
      } else p++;
    }
    return out;
  };
  const leaves = [];
  const trim = r => {
    let { x0, y0, x1, y1 } = r;
    const tw = Math.floor((x1 - x0) * 0.002), th = Math.floor((y1 - y0) * 0.002);
    while (y0 < y1 && rowInk(y0, x0, x1) <= tw) y0++;
    while (y1 > y0 && rowInk(y1 - 1, x0, x1) <= tw) y1--;
    while (x0 < x1 && colInk(x0, y0, y1) <= th) x0++;
    while (x1 > x0 && colInk(x1 - 1, y0, y1) <= th) x1--;
    const my = Math.round((y1 - y0) * 0.06), mx = Math.round((x1 - x0) * 0.06);
    const dR = y => rowDark(y, x0, x1) >= (x1 - x0) * 0.97, dC = x => colDark(x, y0, y1) >= (y1 - y0) * 0.97;
    for (let k = 0; k < my && y0 < y1 && dR(y0); k++) y0++;
    for (let k = 0; k < my && y1 > y0 && dR(y1 - 1); k++) y1--;
    for (let k = 0; k < mx && x0 < x1 && dC(x0); k++) x0++;
    for (let k = 0; k < mx && x1 > x0 && dC(x1 - 1); k++) x1--;
    return { x0, y0, x1, y1 };
  };
  // strict: (almost) no ink across the whole line.
  // relaxed: some ink allowed (a balloon crossing the gutter) but both ends of the line must be clear,
  // which a line inside a bordered panel never is.
  // a white strip inside one panel (between the bars of a gate, a bright window): the panel's own border runs
  // straight over it at both ends, which never happens across a real gutter
  const bridged = (r, horiz, g0, g1) => {
    const T = Math.max(3, Math.round(Math.min(w, h) * 0.01)), len = g1 - g0;
    const edgeDark = (atStart) => {
      let hit = 0;
      for (let p = g0; p < g1; p++) {
        let any = false;
        for (let k = 0; k < T && !any; k++) {
          const q = atStart ? (horiz ? r.x0 : r.y0) + k : (horiz ? r.x1 : r.y1) - 1 - k;
          any = horiz ? dark[p * w + q] : dark[q * w + p];
        }
        if (any) hit++;
      }
      return hit / Math.max(1, len);
    };
    return edgeDark(true) >= 0.8 && edgeDark(false) >= 0.8;
  };
  const gaps = (r, horiz, relaxed) => {
    const { x0, y0, x1, y1 } = r, len = horiz ? x1 - x0 : y1 - y0;
    const tol = relaxed ? Math.floor(len * 0.3) : Math.floor(len * 0.002);
    const e = Math.max(2, Math.round(len * 0.02)), need = relaxed ? Math.round(minGap * 1.5) : minGap;
    const a = horiz ? y0 : x0, b = horiz ? y1 : x1, cuts = []; let run = -1;
    for (let p = a; p <= b; p++) {
      let ok = false;
      if (p < b) {
        const v = horiz ? rowInk(p, x0, x1) : colInk(p, y0, y1);
        ok = v <= tol;
        if (ok && relaxed) ok = horiz ? (rowInk(p, x0, x0 + e) === 0 && rowInk(p, x1 - e, x1) === 0) : (colInk(p, y0, y0 + e) === 0 && colInk(p, y1 - e, y1) === 0);
      }
      if (ok) { if (run < 0) run = p; }
      else { if (run >= 0 && p - run >= need && run > a && p < b && !bridged(r, horiz, run, p)) cuts.push([run, p]); run = -1; }
    }
    return cuts;
  };
  const rec = (r, depth) => {
    r = trim(r);
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    if (rw < w * 0.03 || rh < h * 0.02) return;
    const big = rw * rh > w * h * 0.1;
    if (depth < 12) // rows first (a balloon crossing a row gutter must not turn the page into columns), then columns
    // order of the tries = reading order rules: clean gutters across the whole row first, then frame lines /
    // black gutters (open art above inset panels, a tall panel beside a stack), and only then gutters a balloon crosses
    for (const [horiz, kind] of [[true, 'gap'], [true, 'line'], [true, 'dark'], [false, 'gap'], [false, 'line'], [false, 'dark'], [true, 'relaxed'], [false, 'relaxed']]) {
      const relaxed = kind === 'relaxed';
      if (relaxed && !big) continue;
      // frame lines only shape the page (open art vs. the panels on it); inside a single panel a drawn line is never a cut
      if (kind === 'line' && rw * rh < w * h * 0.2) continue;
      const cuts = kind === 'line' ? lineCuts(r, horiz) : kind === 'dark' ? darkGaps(r, horiz) : gaps(r, horiz, relaxed); if (!cuts.length) continue;
      const segs = []; let s = horiz ? r.y0 : r.x0;
      for (const [g0, g1] of cuts) { segs.push([s, g0]); s = g1; }
      segs.push([s, horiz ? r.y1 : r.x1]);
      if (!horiz && dir === 'rtl') segs.reverse();
      for (const [a, b] of segs) rec(horiz ? { x0: r.x0, x1: r.x1, y0: a, y1: b } : { x0: a, x1: b, y0: r.y0, y1: r.y1 }, depth + 1);
      return;
    }
    leaves.push(r);
  };
  rec({ x0: 0, y0: 0, x1: w, y1: h }, 0);
  const area = w * h;
  let ps = leaves.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) >= area * 0.008);
  // bordered panels drawn on top of open art (no page-coloured gutter around them): find the closed frames
  // and show the open art (its visible part) first, then the frames in reading order
  {
    const rects = frameRects(dark, w, h, dir);
    if (rects.length) {
      const out = [];
      for (const r of ps) {
        const ra = (r.x1 - r.x0) * (r.y1 - r.y0), tol = Math.min(w, h) * 0.015;
        const kids = rects.filter(q => q.x0 >= r.x0 - tol && q.y0 >= r.y0 - tol && q.x1 <= r.x1 + tol && q.y1 <= r.y1 + tol && (q.x1 - q.x0) * (q.y1 - q.y0) < ra * 0.85);
        const cover = kids.reduce((t, q) => t + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
        // a leaf that is itself one framed panel: lines drawn inside it (doors, windows) are never panels
        const T2 = Math.max(4, Math.round(Math.min(w, h) * 0.012));
        const edge = (horiz, p0, a0, a1) => { let best = 0; for (let d = -T2; d <= T2; d++) { const p = p0 + d; if (p < 0 || p >= (horiz ? h : w)) continue; const f = (horiz ? rowDark(p, a0, a1) : colDark(p, a0, a1)) / Math.max(1, a1 - a0); if (f > best) best = f; } return best; };
        const framed = edge(true, r.y0, r.x0, r.x1) > 0.75 && edge(true, r.y1 - 1, r.x0, r.x1) > 0.75 && edge(false, r.x0, r.y0, r.y1) > 0.75 && edge(false, r.x1 - 1, r.y0, r.y1) > 0.75;
        // panels laid on open art fill the band across (or down); a couple of door or window lines inside a picture do not
        const ux = kids.length ? (Math.max(...kids.map(q => q.x1)) - Math.min(...kids.map(q => q.x0))) / (r.x1 - r.x0) : 0, uy = kids.length ? (Math.max(...kids.map(q => q.y1)) - Math.min(...kids.map(q => q.y0))) / (r.y1 - r.y0) : 0;
        const sideBySide = kids.length >= 2 && kids.every((q, i) => kids.every((z, j) => i === j || Math.min(q.y1, z.y1) - Math.max(q.y0, z.y0) > Math.min(q.y1 - q.y0, z.y1 - z.y0) * 0.4));
        const spread = kids.length < 2 || (sideBySide ? ux >= 0.7 : (ux >= 0.7 || uy >= 0.7));
        if (!framed && spread && (kids.length >= 2 || (kids.length === 1 && cover < ra * 0.35))) {
          const back = uncover([r, ...kids].map(q => ({ x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 })));
          // reading order: rows (pieces that share height), then across
          const rows = [];
          for (const q of back.sort((u, v) => u.y - v.y)) { const R = rows.find(R => R.some(z => Math.min(z.y + z.h, q.y + q.h) - Math.max(z.y, q.y) > Math.min(z.h, q.h) * 0.5)); if (R) R.push(q); else rows.push([q]); }
          for (const q of rows.flatMap(R => R.sort((u, v) => dir === 'rtl' ? v.x - u.x : u.x - v.x))) out.push({ x0: q.x, y0: q.y, x1: q.x + q.w, y1: q.y + q.h });
        } else out.push(r);
      }
      ps = out;
    }
  }
  if (ps.length > 26 || !ps.length) return [];
  // slivers (a strip cut off a panel by a slanted line or a tilted scan) belong to the panel next to them
  for (let guard = 0; guard < 8 && ps.length > 1; guard++) {
    const k = ps.findIndex(r => (r.x1 - r.x0) < w * 0.07 || (r.y1 - r.y0) < h * 0.045);
    if (k < 0) break;
    const sl = ps[k]; ps.splice(k, 1);
    let bi = 0, bd = Infinity; ps.forEach((r, i) => { const d = Math.hypot(Math.max(0, r.x0 - sl.x1, sl.x0 - r.x1), Math.max(0, r.y0 - sl.y1, sl.y0 - r.y1)); if (d < bd) { bd = d; bi = i; } });
    const q = ps[bi]; ps[bi] = { x0: Math.min(q.x0, sl.x0), y0: Math.min(q.y0, sl.y0), x1: Math.max(q.x1, sl.x1), y1: Math.max(q.y1, sl.y1) };
  }
  const white = r => { let ink = 0; for (let y = r.y0; y < r.y1; y += 2) ink += rowInk(y, r.x0, r.x1); return 100 - ink * 2 / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0)) * 100; };
  const uni = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  const dist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
  // logo / title / caption strips (mostly page colour, short): they belong with the nearest panel, never on their own
  // a panel with a drawn border on all four sides (even a mostly white one) is a real panel, never a caption strip
  const boxed = r => {
    const T2 = Math.max(4, Math.round(Math.min(w, h) * 0.012));
    const edge = (horiz, p0, a0, a1) => { let best = 0; for (let d = -T2; d <= T2; d++) { const p = p0 + d; if (p < 0 || p >= (horiz ? h : w)) continue; const f = (horiz ? rowDark(p, a0, a1) : colDark(p, a0, a1)) / Math.max(1, a1 - a0); if (f > best) best = f; } return best; };
    return edge(true, r.y0, r.x0, r.x1) > 0.7 && edge(true, r.y1 - 1, r.x0, r.x1) > 0.7 && edge(false, r.x0, r.y0, r.y1) > 0.7 && edge(false, r.x1 - 1, r.y0, r.y1) > 0.7;
  };
  for (let guard = 0; guard < 6 && ps.length > 1; guard++) {
    const cw = Math.max(...ps.map(r => r.x1)) - Math.min(...ps.map(r => r.x0));
    // a strip across the whole page between real gutters is a panel (a wide shot); pieces and short title strips are not
    const k = ps.findIndex(r => (r.y1 - r.y0) < h * 0.22 && white(r) > 40 && !boxed(r) && !((r.x1 - r.x0) >= cw * 0.85 && (r.y1 - r.y0) >= h * 0.12));
    if (k < 0) break;
    const s = ps[k]; ps.splice(k, 1);
    let bi = 0, bd = Infinity; ps.forEach((r, i) => { const d = dist(r, s); if (d < bd) { bd = d; bi = i; } });
    ps[bi] = uni(ps[bi], s);
  }
  // balloons that spill out of a panel into the gutter: their text is ink outside every panel.
  // group that ink and give it to the nearest panel, so a balloon is never cut or shown empty
  {
    const G = Math.max(4, Math.round(Math.min(w, h) / 140)), gw = Math.ceil(w / G), gh = Math.ceil(h / G);
    const inside = (x, y) => ps.some(r => x >= r.x0 - 2 && x < r.x1 + 2 && y >= r.y0 - 2 && y < r.y1 + 2);
    const cell = new Uint8Array(gw * gh);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      let n = 0;
      for (let y = cy * G; y < Math.min(h, cy * G + G); y++) for (let x = cx * G; x < Math.min(w, cx * G + G); x++) if (ink[y * w + x] && !inside(x, y)) n++;
      if (n >= 2) cell[cy * gw + cx] = 1;
    }
    const seen = new Uint8Array(gw * gh), R = 2;
    for (let i = 0; i < gw * gh; i++) {
      if (!cell[i] || seen[i]) continue;
      const st = [i]; seen[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
      while (st.length) {
        const c = st.pop(), cx = c % gw, cy = (c / gw) | 0; cnt++;
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (cell[j] && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      if (cnt < 3) continue;
      const pad = G * 2, blob = { x0: Math.max(0, x0 * G - pad), y0: Math.max(0, y0 * G - pad), x1: Math.min(w, (x1 + 1) * G + pad), y1: Math.min(h, (y1 + 1) * G + pad) };
      let bi = -1, bd = Infinity; ps.forEach((r, k) => { const d = dist(r, blob); if (d < bd) { bd = d; bi = k; } });
      if (bi >= 0 && bd < Math.min(w, h) * 0.12) ps[bi] = uni(ps[bi], blob);
    }
  }
  ps = uncover(ps.map(r => ({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }))).map(r => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }));
  // a panel alone in its band of the page (open art): it takes the whole width of the page's content
  {
    const cx0 = Math.min(...ps.map(r => r.x0)), cx1 = Math.max(...ps.map(r => r.x1));
    ps = ps.map((r, i) => ps.some((q, j) => j !== i && q.y0 < r.y1 - 2 && q.y1 > r.y0 + 2) ? r : { ...r, x0: cx0, x1: cx1 });
  }
  if (ps.length === 1 && (ps[0].x1 - ps[0].x0) * (ps[0].y1 - ps[0].y0) > area * 0.55) return [];
  // title / logo pages: the gaps between big letters look like gutters -> show the whole page
  const small = ps.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) < area * 0.04);
  if (small.length >= 3 && small.length >= ps.length / 2) return [];
  // panels must cover most of the page; otherwise it is an illustration, not a grid
  const cover = ps.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  if (cover < area * (bleed ? 0.6 : 0.35)) return [];
  if (bleed && ps.length < 2) return [];
  const px = w * 0.006, py = h * 0.006, BINS = 48;
  // whiteness profile across each panel: balloons are page-coloured, art is not.
  // a wide panel is only ever split where the line runs through art (never through a balloon)
  const prof = (r, horiz) => {
    const out = [], L = horiz ? r.x1 - r.x0 : r.y1 - r.y0, M = horiz ? r.y1 - r.y0 : r.x1 - r.x0;
    for (let b = 0; b < BINS; b++) {
      const a = Math.floor(b * L / BINS), e = Math.max(a + 1, Math.floor((b + 1) * L / BINS)); let ink = 0, tot = 0;
      for (let p = a; p < e; p++) { const v = horiz ? colInk(r.x0 + p, r.y0, r.y1) : rowInk(r.y0 + p, r.x0, r.x1); ink += v; tot += M; }
      out.push(Math.round(100 - ink / Math.max(1, tot) * 100));
    }
    return out;
  };
  return ps.map(r => {
    const x0 = Math.max(0, r.x0 - px), y0 = Math.max(0, r.y0 - py), x1 = Math.min(w, r.x1 + px), y1 = Math.min(h, r.y1 + py);
    return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h, cx: prof(r, true), cy: prof(r, false) };
  });
}

/* closed rectangular frames (a panel's drawn border): two long upright lines facing each other, joined by a line
   along the top and one along the bottom. Slightly tilted scans and small breaks in the ink are allowed. */
function frameRects(dark, w, h, dir) {
  const D = (x, y) => x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x];
  const segs = (vert) => {
    const L = vert ? w : h, M = vert ? h : w, minLen = (vert ? h : w) * (vert ? 0.1 : 0.07), out = [];
    for (let a = 0; a < L; a++) {
      let s0 = -1, gap = 0;
      for (let b = 0; b <= M; b++) {
        const on = b < M && (vert ? (D(a - 1, b) || D(a, b) || D(a + 1, b)) : (D(b, a - 1) || D(b, a) || D(b, a + 1)));
        if (on) { if (s0 < 0) s0 = b; gap = 0; }
        else if (s0 >= 0 && ++gap > 3) { const e = b - gap; if (e - s0 >= minLen) out.push({ p: a, a: s0, b: e }); s0 = -1; gap = 0; }
      }
    }
    // the same line found on neighbouring columns: keep one
    out.sort((u, v) => u.p - v.p); const m = [];
    for (const g of out) { const k = m.find(q => Math.abs(q.p - g.p) <= 3 && Math.min(q.b, g.b) - Math.max(q.a, g.a) > (g.b - g.a) * 0.6); if (k) { if (g.b - g.a > k.b - k.a) Object.assign(k, g); } else m.push({ ...g }); }
    return m;
  };
  const V = segs(true), Hs = segs(false), T = Math.max(5, Math.round(Math.min(w, h) * 0.012)), rects = [];
  const hasH = (y, x0, x1) => Hs.some(g => Math.abs(g.p - y) <= T && g.a <= x0 + T && g.b >= x1 - T);
  for (const A of V) {
    let best = null;
    for (const B of V) {
      if (B.p - A.p < w * 0.08) continue;
      const ov = Math.min(A.b, B.b) - Math.max(A.a, B.a), sh = Math.min(A.b - A.a, B.b - B.a);
      if (ov < sh * 0.85 || sh < Math.max(A.b - A.a, B.b - B.a) * 0.75) continue;
      const y0 = Math.max(A.a, B.a), y1 = Math.min(A.b, B.b);
      if (!hasH(y0, A.p, B.p) || !hasH(y1, A.p, B.p)) continue;
      if (!best || B.p < best.x1) best = { x0: A.p, x1: B.p, y0, y1 };
    }
    if (best && (best.x1 - best.x0) * (best.y1 - best.y0) >= w * h * 0.02 && (best.x1 - best.x0) * (best.y1 - best.y0) <= w * h * 0.85) rects.push(best);
  }
  // drop duplicates and frames that hold other frames (a page border is not a panel)
  const uniq = rects.filter((r, i) => !rects.some((q, j) => j < i && Math.abs(q.x0 - r.x0) <= T && Math.abs(q.x1 - r.x1) <= T && Math.abs(q.y0 - r.y0) <= T && Math.abs(q.y1 - r.y1) <= T));
  const fin = uniq.filter(r => !uniq.some(q => q !== r && q.x0 >= r.x0 - T && q.x1 <= r.x1 + T && q.y0 >= r.y0 - T && q.y1 <= r.y1 + T && (q.x1 - q.x0) * (q.y1 - q.y0) < (r.x1 - r.x0) * (r.y1 - r.y0) * 0.9));
  // reading order: rows (frames that share height), then across
  fin.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const r of fin) { const row = rows.find(R => R.some(q => Math.min(q.y1, r.y1) - Math.max(q.y0, r.y0) > Math.min(q.y1 - q.y0, r.y1 - r.y0) * 0.5)); if (row) row.push(r); else rows.push([r]); }
  return rows.flatMap(R => R.sort((a, b) => dir === 'rtl' ? b.x0 - a.x0 : a.x0 - b.x0));
}

/* a background picture with panels on top of it: keep only the part of it you can see (the biggest uncovered strip),
   and show it before the panels that sit on it */
function uncover(list) {
  const inside = (q, p) => q.x >= p.x - p.w * 0.05 && q.y >= p.y - p.h * 0.05 && q.x + q.w <= p.x + p.w * 1.05 && q.y + q.h <= p.y + p.h * 1.05;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i], kids = list.filter((q, j) => j !== i && inside(q, p) && q.w * q.h < p.w * p.h * 0.9);
    if (!kids.length) { out.push(p); continue; }
    const U = kids.reduce((u, q) => ({ x0: Math.min(u.x0, q.x), y0: Math.min(u.y0, q.y), x1: Math.max(u.x1, q.x + q.w), y1: Math.max(u.y1, q.y + q.h) }), { x0: 1e9, y0: 1e9, x1: -1, y1: -1 });
    const c = [{ x: p.x, y: p.y, w: p.w, h: U.y0 - p.y }, { x: p.x, y: U.y1, w: p.w, h: p.y + p.h - U.y1 }, { x: p.x, y: p.y, w: U.x0 - p.x, h: p.h }, { x: U.x1, y: p.y, w: p.x + p.w - U.x1, h: p.h }].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (c.w > 0 && c.h > 0 && c.w * c.h > p.w * p.h * 0.12) out.push(c);
  }
  return out;
}

/* the panels from the picture analysis (exact borders, reading order from the page's rows and columns) and the
   panels the AI saw (it catches panels the analysis missed or cut in two) are combined:
   the analysis order wins, an AI box that holds several analysed pieces joins them, an AI-only panel is put
   right after the panel the AI read before it, and an analysed panel the AI forgot is kept in its place */
function mergePanels(hs, as, W, H) {
  const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  as = as.filter(r => r.w > W * 0.04 && r.h > H * 0.03);
  const pad = r => { const m = W * 0.012; return { x: Math.max(0, r.x - m), y: Math.max(0, r.y - m), w: Math.min(W, r.w + 2 * m), h: Math.min(H, r.h + 2 * m) }; };
  if (!hs.length) return uncover(as.map(pad));
  const items = hs.map((h, k) => ({ pos: k, r: h, gone: false }));
  let lastPos = -1;
  for (const a of as) {
    const cov = hs.map((h, k) => k).filter(k => inter(a, hs[k]) >= hs[k].w * hs[k].h * 0.6);
    if (cov.length >= 2) {
      // one panel the picture analysis cut in pieces: join them (only when the AI box is about that size)
      const x0 = Math.min(...cov.map(k => hs[k].x)), y0 = Math.min(...cov.map(k => hs[k].y)), x1 = Math.max(...cov.map(k => hs[k].x + hs[k].w)), y1 = Math.max(...cov.map(k => hs[k].y + hs[k].h));
      const U = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (a.w * a.h <= U.w * U.h * 1.4 && cov.every(k => !items[k].gone)) { cov.forEach(k => items[k].gone = true); items.push({ pos: Math.min(...cov), r: U, gone: false }); }
      lastPos = Math.max(...cov); continue;
    }
    if (cov.length === 1) { lastPos = cov[0]; continue; }
    // a panel only the AI saw (the analysis missed it): only where no analysed panel already is
    const over = hs.reduce((t, h) => t + inter(a, h), 0);
    if (over < a.w * a.h * 0.25 && a.w * a.h > W * H * 0.03) { items.push({ pos: lastPos + 0.5, r: pad(a), gone: false }); lastPos += 0.01; }
  }
  return uncover(items.filter(i => !i.gone).sort((p, q) => p.pos - q.pos).map(i => i.r));
}

/* split very wide / very tall panels so text stays big on the screen */
function splitPanel(p, sa, dir) {
  if (!S.cSplit) return [p];
  const r = (p.w / p.h) / sa, ov = 0.12;
  const mk = (n, horiz) => {
    const prof = horiz ? p.cx : p.cy;
    // older cached pages have no profile: keep the whole panel rather than risk cutting a balloon
    if (!prof || !prof.length) return [p];
    const B = prof.length, cuts = [];
    for (let k = 1; k < n; k++) {
      const ideal = k / n * B, win = Math.round(B * 0.2);
      let best = -1, bs = Infinity;
      for (let b = Math.max(1, Math.round(ideal - win)); b <= Math.min(B - 2, Math.round(ideal + win)); b++) {
        const sc = (prof[b - 1] + prof[b] * 2 + prof[b + 1]) / 4 + Math.abs(b - ideal) * 0.8;
        if (sc < bs) { bs = sc; best = b; }
      }
      // the best line still crosses a lot of white (a balloon): do not split at all
      if (best < 0 || (prof[best - 1] + prof[best] * 2 + prof[best + 1]) / 4 > 40) return [p];
      cuts.push((best + 0.5) / B);
    }
    const L = horiz ? p.w : p.h, o = L * 0.05, out = [], edges = [0, ...cuts, 1];
    for (let k = 0; k < edges.length - 1; k++) {
      const a = Math.max(0, edges[k] * L - (k ? o : 0)), b = Math.min(L, edges[k + 1] * L + (k < edges.length - 2 ? o : 0));
      out.push(horiz ? { x: p.x + a, y: p.y, w: b - a, h: p.h } : { x: p.x, y: p.y + a, w: p.w, h: b - a });
    }
    if (horiz && dir === 'rtl') out.reverse();
    void ov; return out;
  };
  if (r > 2.3) return mk(Math.min(3, Math.max(2, Math.round(Math.sqrt(r)))), true);
  if (1 / r > 2.3) return mk(Math.min(3, Math.max(2, Math.round(Math.sqrt(1 / r)))), false);
  return [p];
}

/* ================= comic source ================= */
async function comicSource(rec, blob) {
  if (rec.format === 'pdf') {
    const pdf = await openPdf(blob);
    // sharp enough to zoom into a panel, without wasting time beyond what a scan holds
    const tw = () => Math.round(Math.min(2000, Math.max(1500, Math.min(innerWidth, innerHeight) * (devicePixelRatio || 1) * 1.35)));
    let q = Promise.resolve();
    const render = i => (q = q.then(async () => {
      const k = 'cpg:' + rec.id + ':' + i;
      const have = await DB.getPic(k).catch(() => null);
      if (have && have.blob && have.blob.size > 1000) return have.blob;
      const cv = await renderPdfPage(pdf, i + 1, tw(), 4000);
      const b = await canvasBlob(cv, 'image/jpeg', 0.86); cv.width = cv.height = 0;
      PageCache.add(k, b); return b;
    }));
    return {
      count: pdf.numPages,
      async page(i) { const b = await render(i); const url = URL.createObjectURL(b); const img = await loadImg(url); try { await img.decode(); } catch (e) { } return { url, img, w: img.naturalWidth, h: img.naturalHeight }; },
      async thumb(i) { const cv = await renderPdfPage(pdf, i + 1, 200); return canvasBlob(cv, 'image/jpeg', 0.75); },
      close() { try { closePdf(pdf); } catch (e) { } },
    };
  }
  const zip = await JSZip.loadAsync(blob);
  const names = zipImages(zip);
  if (!names.length) throw new Error(t('errNoImages', { f: rec.title }));
  const pageBlob = async i => new Blob([await zip.file(names[i]).async('blob')], { type: mimeOf(names[i]) });
  return {
    count: names.length,
    async page(i) { const url = URL.createObjectURL(await pageBlob(i)); const img = await loadImg(url); try { await img.decode(); } catch (e) { } return { url, img, w: img.naturalWidth, h: img.naturalHeight }; },
    async thumb(i) { const url = URL.createObjectURL(await pageBlob(i)); try { const im = await loadImg(url); return await thumbFrom(im, im.naturalWidth, im.naturalHeight, 200); } finally { URL.revokeObjectURL(url); } },
    close() { },
  };
}

/* Lettering: the translation is written into each balloon the way a letterer would.
   The balloon's inside is found exactly (the paper inside its outline, with the old letters as holes in it),
   so the outline and the art around it are never touched. The new text uses the size of the original letters,
   one hand-lettering font for the whole book, words in bold italic where the original stressed them,
   lines shaped by the balloon, never a word broken. Two balloons joined by a neck each keep their own half. */
const Letter = {
  font: '"Letreiro","Patrick Hand SC","Comic Neue",system-ui,sans-serif',
  async ready() { try { await document.fonts.load('400 30px "Letreiro"'); } catch (e) { } },
  // gasps, grunts and other sounds people make stay as the letterer drew them
  interj(t) {
    const w = String(t || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!w.length || w.length > 3) return false;
    const R = /^(G+A+S+P+|U+G+H+|U+H+|A+R+G+H+|A+R+G+|A+H+|O+H+|O+O+F+|H+M+|H+U+H+|E+H+|S+I+G+H+|G+R+R+|G+U+H+|G+A+R+|G+L+I+K+|G+L+A+K+|N+G+H+|H+N+N+|H+N+G+|U+N+H+|W+H+O+A+|W+H+E+W+|P+S+S+T+|S+H+H+|H+A+(H+A+)*|H+E+(H+E+)*|C+O+U+G+H+|S+N+I+F+F+|S+O+B+|G+U+L+P+|Y+A+W+N+|B+L+A+H+|B+L+E+H+|A+C+K+|E+E+K+|G+A+H+|G+A+K+|H+R+K+|H+U+R+K+|K+A+F+|U+R+K+|Y+E+A+R+G+H+)$/;
    return w.every(x => R.test(x));
  },
  same(a, b) { const n = x => String(x || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, ''); return n(a) === n(b); },
  capRatio(cx) {
    if (!this._cap) { cx.font = `400 100px ${this.font}`; const m = cx.measureText('HEMNO'); this._cap = (m.actualBoundingBoxAscent > 20 ? m.actualBoundingBoxAscent : 70) / 100; }
    return this._cap;
  },
  region(lum, W, H, box, f = 1) {
    let [y0, x0, y1, x1] = box.map(Number);
    x0 = clamp(x0 / 1000 * W, 0, W); x1 = clamp(x1 / 1000 * W, 0, W); y0 = clamp(y0 / 1000 * H, 0, H); y1 = clamp(y1 / 1000 * H, 0, H);
    const bw = x1 - x0, bh = y1 - y0; if (bw < 6 || bh < 6) return null;
    const ex = Math.max(W * 0.04, bw * 0.9) * f, ey = Math.max(H * 0.03, bh * 1.1) * f;
    const R = { x0: Math.max(0, Math.floor(x0 - ex)), y0: Math.max(0, Math.floor(y0 - ey)), x1: Math.min(W, Math.ceil(x1 + ex)), y1: Math.min(H, Math.ceil(y1 + ey)) };
    const rw = R.x1 - R.x0, rh = R.y1 - R.y0, n = rw * rh, L = new Uint8Array(n);
    for (let y = 0; y < rh; y++) { const o = (y + R.y0) * W + R.x0; for (let x = 0; x < rw; x++) L[y * rw + x] = lum[o + x]; }
    const bx0 = Math.floor(x0 - R.x0), bx1 = Math.ceil(x1 - R.x0), by0 = Math.floor(y0 - R.y0), by1 = Math.ceil(y1 - R.y0);
    let mean = 0, cnt = 0; for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { mean += L[y * rw + x]; cnt++; }
    mean /= Math.max(1, cnt);
    const dark = mean < 100, bg0 = dark ? (v => v < 80) : (v => v >= 185);
    // a thin or faded outline can have gaps a pixel or two wide: paper counts only where its neighbours are paper too
    const P = new Uint8Array(n);
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) { const k = y * rw + x; P[k] = bg0(L[k]) && bg0(L[k - 1]) && bg0(L[k + 1]) && bg0(L[k - rw]) && bg0(L[k + rw]) ? 1 : 0; }
    // pieces of balloon-coloured paper, started from inside the box: the piece most of the box falls in is the balloon
    const lab = new Int32Array(n), hits = [0], st = [];
    let nl = 0;
    for (let y = by0; y < by1; y += 2) for (let x = bx0; x < bx1; x += 2) {
      const k = y * rw + x; if (!P[k]) continue;
      if (!lab[k]) {
        nl++; hits.push(0); lab[k] = nl; st.push(k);
        while (st.length) {
          const q = st.pop(), qx = q % rw;
          if (qx + 1 < rw && !lab[q + 1] && P[q + 1]) { lab[q + 1] = nl; st.push(q + 1); }
          if (qx > 0 && !lab[q - 1] && P[q - 1]) { lab[q - 1] = nl; st.push(q - 1); }
          if (q + rw < n && !lab[q + rw] && P[q + rw]) { lab[q + rw] = nl; st.push(q + rw); }
          if (q >= rw && !lab[q - rw] && P[q - rw]) { lab[q - rw] = nl; st.push(q - rw); }
        }
      }
      hits[lab[k]]++;
    }
    let best = 0; for (let i = 1; i <= nl; i++) if (hits[i] > (hits[best] || 0)) best = i;
    if (!best) return null;
    let touch = 0, paper = 0;
    for (let k = 0; k < n; k++) if (lab[k] === best) { const x = k % rw, y = (k / rw) | 0; if (x <= 1 || y <= 1 || x >= rw - 2 || y >= rh - 2) touch++; }
    // a big balloon (or two joined) can reach past the area first looked at: look again wider before calling it open
    const open = touch > (rw + rh) * 2 * 0.03;
    if (open && f === 1) return this.region(lum, W, H, box, 2.6);
    if (open) { for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (bg0(L[y * rw + x])) paper++; if (paper < cnt * 0.5) return null; }
    const I = new Uint8Array(n);
    if (!open) {
      // everything the outside cannot reach without crossing the balloon's paper is inside the balloon (the old letters too)
      const O = new Uint8Array(n);
      const push = k => { if (!O[k] && lab[k] !== best) { O[k] = 1; st.push(k); } };
      for (let x = 0; x < rw; x++) { push(x); push((rh - 1) * rw + x); }
      for (let y = 0; y < rh; y++) { push(y * rw); push(y * rw + rw - 1); }
      while (st.length) { const k = st.pop(), x = k % rw; if (x + 1 < rw) push(k + 1); if (x > 0) push(k - 1); if (k + rw < n) push(k + rw); if (k >= rw) push(k - rw); }
      for (let k = 0; k < n; k++) if (!O[k]) I[k] = 1;
      // letters touching the outline: ink with balloon paper close on both sides (across or up and down) is a letter too
      const D = Math.max(6, Math.round(H * 0.013)), isC = k => lab[k] === best;
      const near = (x, y, dx, dy) => { for (let i = 1; i <= D; i++) { const xx = x + dx * i, yy = y + dy * i; if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) return false; const k = yy * rw + xx; if (isC(k)) return true; if (bg0(L[k]) && !I[k]) return false; } return false; };
      const add = [];
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const k = y * rw + x; if (I[k] || bg0(L[k])) continue; let adj = false; for (const j of [k - 1, k + 1, k - rw, k + rw]) if (j >= 0 && j < n && I[j]) { adj = true; break; } if (!adj) continue; if ((near(x, y, -1, 0) && near(x, y, 1, 0)) || (near(x, y, 0, -1) && near(x, y, 0, 1))) add.push(k); }
      for (const k of add) I[k] = 1;
    }
    // a balloon left open (it runs into a gutter, the page margin or white art) is only worked on close around its words:
    // its paper there, and the letters (small pieces of ink); outlines and lines of the art are long and are kept
    const env = open ? Math.max(8, H * 0.016) : Math.max(12, H * 0.05);
    const ea = Math.floor(bx0 - env), eb = Math.ceil(bx1 + env), ec = Math.floor(by0 - env), ed = Math.ceil(by1 + env);
    const inEnv = (x, y) => x >= ea && x <= eb && y >= ec && y <= ed;
    let E = null;
    if (open) {
      E = new Uint8Array(n);
      for (let y = Math.max(0, ec); y <= Math.min(rh - 1, ed); y++) for (let x = Math.max(0, ea); x <= Math.min(rw - 1, eb); x++) if (bg0(L[y * rw + x])) I[y * rw + x] = 1;
      const seen = new Uint8Array(n), maxH = H * 0.024, maxW = W * 0.3, mark = k => { const kx = k % rw, ky = (k / rw) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = kx + dx, yy = ky + dy; if (xx >= 0 && yy >= 0 && xx < rw && yy < rh && (bg0(L[yy * rw + xx]) || E[yy * rw + xx] === 2)) { if (!E[yy * rw + xx]) E[yy * rw + xx] = 1; } } E[k] = 2; };
      for (let y = Math.max(0, ec); y <= Math.min(rh - 1, ed); y++) for (let x = Math.max(0, ea); x <= Math.min(rw - 1, eb); x++) {
        const s0 = y * rw + x; if (seen[s0] || bg0(L[s0])) continue;
        const comp = [s0]; seen[s0] = 1; let cx0 = x, cx1 = x, cy0 = y, cy1 = y, big = false;
        for (let i = 0; i < comp.length; i++) {
          const k = comp[i], kx = k % rw, ky = (k / rw) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = kx + dx, yy = ky + dy; if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) { big = true; continue; }
            const j = yy * rw + xx; if (seen[j] || bg0(L[j])) continue; seen[j] = 1; comp.push(j);
            if (xx < cx0) cx0 = xx; if (xx > cx1) cx1 = xx; if (yy < cy0) cy0 = yy; if (yy > cy1) cy1 = yy;
          }
          if (cy1 - cy0 > maxH || cx1 - cx0 > maxW) big = true;
          if (big && comp.length > 20000) break;
        }
        if (!big && inEnv(cx0, cy0) && inEnv(cx1, cy1)) for (const k of comp) { I[k] = 1; mark(k); }
        else {
          // a letter touching an outline or a line of the art: only its part inside the words' own box goes
          const inBox = comp.filter(k => { const kx = k % rw, ky = (k / rw) | 0; return kx >= bx0 - 7 && kx <= bx1 + 7 && ky >= by0 - 2 && ky <= by1 + 2; });
          // (never a dark area of the art reaching into the box's corners: those pieces are large and solid)
          if (inBox.length && comp.length < 20000 && inBox.length <= comp.length * 0.2 && inBox.length <= 600 * (H / 1400) ** 2) for (const k of inBox) { I[k] = 1; mark(k); }
        }
      }
    } else for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (I[y * rw + x] && !inEnv(x, y)) I[y * rw + x] = 0;
    const K = new Uint8Array(n); for (let k = 0; k < n; k++) if (I[k] && lab[k] !== best && !bg0(L[k])) K[k] = 1;
    const fillAt = []; for (let k = 0; k < n; k += 3) if (I[k] && lab[k] === best) fillAt.push(k);
    return { R, rw, rh, I, E, K, L, dark, open, fillAt, box: { x0, y0, x1, y1 } };
  },
  // one line of the balloon: the stretch of inside around the balloon's middle
  span(g, y, pad) {
    const r = Math.round(y); if (r < 0 || r >= g.rh) return null;
    const cxm = (g.box.x0 + g.box.x1) / 2 - g.R.x0;
    let bestA = -1, bestB = -1, a = -1, hit = false;
    for (let x = 0; x <= g.rw; x++) {
      const on = x < g.rw && g.M[r * g.rw + x];
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        const b = x - 1, has = a <= cxm && b >= cxm;
        if (!hit && (has || b - a > bestB - bestA)) { bestA = a; bestB = b; hit = has; }
        a = -1;
      }
    }
    if (bestA < 0) return null;
    if (g.open && g.tR > g.tL) { bestA = Math.max(bestA, g.tL - g.capE * 1.3); bestB = Math.min(bestB, g.tR + g.capE * 1.3); if (bestB <= bestA) return null; }
    const p = pad + (bestB - bestA) * 0.04; return { a: bestA + p, b: bestB - p };
  },
  // does a line's box touch any ink that stays on the page?
  hits(g, x0, x1, y0, y1) {
    if (!g.ob) return false;
    let c = 0; const xa = Math.max(0, Math.floor(x0)), xb = Math.min(g.rw - 1, Math.ceil(x1)), ya = Math.max(0, Math.floor(y0)), yb = Math.min(g.rh - 1, Math.ceil(y1));
    if (xa > xb || ya > yb || x0 < 0 || y0 < 0 || x1 > g.rw || y1 > g.rh) return true;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (g.ob[y * g.rw + x] && ++c > 2) return true;
    return false;
  },
  words(s, up) {
    const out = []; let emph = false, cur = '', curE = false;
    const flush = () => { if (cur) out.push({ t: cur, e: curE }); cur = ''; };
    for (const ch of String(s).replace(/\s+/g, ' ').trim()) {
      // a closing asterisk keeps the punctuation right after it on the same word ("*CAI BEM*.")
      if (ch === '*') { if (!emph && cur) flush(); emph = !emph; continue; }
      if (ch === ' ') { flush(); continue; }
      if (!cur) curE = emph; cur += ch;
    }
    flush();
    return out.map(w => ({ t: up ? w.t.toLocaleUpperCase('pt-BR') : w.t, e: w.e }));
  },
  fontFor(size) { return `400 ${size}px ${this.font}`; },
  wordW(cx, w, size) { cx.font = this.fontFor(size); return (cx.measureText(w.t).width * (w.e ? 1.06 : 1) + size * 0.05) * (this.sx || 1); },
  layout(cx, g, words, size, lh, pad) {
    const sp = (cx.font = this.fontFor(size), cx.measureText(' ').width * (this.sx || 1));
    const cs = [g.tc, (g.top + g.bot) / 2, g.tc - lh / 2, g.tc + lh / 2, g.tc - lh, g.tc + lh];
    for (let n = 1; n <= 16; n++) for (const cyc of cs) {
      const top = cyc - n * lh / 2; if (top < g.top - 1 || top + n * lh > g.bot + 1) continue;
      const lines = []; let i = 0, ok = true;
      for (let k = 0; k < n && i < words.length; k++) {
        const yA = top + k * lh + lh * 0.12, yB = top + (k + 1) * lh - lh * 0.12;
        const s1 = this.span(g, yA, pad), s2 = this.span(g, yB, pad), s3 = this.span(g, (yA + yB) / 2, pad);
        if (!s1 || !s2 || !s3) { ok = false; break; }
        const a = Math.max(s1.a, s2.a, s3.a), b = Math.min(s1.b, s2.b, s3.b), w = b - a; if (w <= 0) { ok = false; break; }
        const line = [words[i]]; let lw = this.wordW(cx, words[i], size); if (lw > w) { ok = false; break; }
        i++;
        while (i < words.length) { const ww = this.wordW(cx, words[i], size); if (lw + sp + ww > w) break; line.push(words[i]); lw += sp + ww; i++; }
        if (this.hits(g, (a + b) / 2 - lw / 2 - 2, (a + b) / 2 + lw / 2 + 2, top + k * lh + lh / 2 - size * this._cap * 0.75, top + k * lh + lh / 2 + size * this._cap * 0.62)) { ok = false; break; }
        lines.push({ words: line, w: lw, x: (a + b) / 2, y: top + k * lh + lh / 2 });
      }
      if (ok && i >= words.length && lines.length === n) return { lines, sp };
    }
    return null;
  },
  async render(pg, data) {
    await this.ready();
    const W = pg.w, H = pg.h, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(pg.img, 0, 0, W, H);
    const id = cx.getImageData(0, 0, W, H), px = id.data, lum = new Uint8Array(W * H);
    for (let i = 0, k = 0; i < lum.length; i++, k += 4) lum[i] = (px[k] * 30 + px[k + 1] * 59 + px[k + 2] * 11) / 100;
    const jobs = [];
    for (const it of data.items || []) {
      if (!it.tr || !Array.isArray(it.box) || it.box.length !== 4) continue;
      if (it.kind === 'sfx' || this.same(it.tr, it.text) || this.interj(it.text)) continue;
      const g = this.region(lum, W, H, it.box); if (!g) continue;
      const up = (String(it.text).match(/[A-Z]/g) || []).length >= (String(it.text).match(/[a-z]/g) || []).length;
      jobs.push({ g, words: this.words(it.tr, up), orig: String(it.text).replace(/[*\n]/g, ' ').replace(/\s+/g, ' ').trim() });
    }
    // balloons joined by a neck share one inside: each pixel goes to the balloon whose words are nearest
    const med = a => { if (!a.length) return 0; const v = a.slice().sort((p, q) => p - q); return v[v.length >> 1]; };
    const own = new Int16Array(W * H).fill(-1);
    const dist = (j, x, y) => { const b = jobs[j].g.box; return Math.max(0, b.x0 - x, x - b.x1) + Math.max(0, b.y0 - y, y - b.y1); };
    jobs.forEach((j, ji) => { const g = j.g; for (let y = 0; y < g.rh; y++) for (let x = 0; x < g.rw; x++) if (g.I[y * g.rw + x]) { const p = (y + g.R.y0) * W + x + g.R.x0, o = own[p]; if (o < 0 || dist(ji, x + g.R.x0, y + g.R.y0) < dist(o, x + g.R.x0, y + g.R.y0)) own[p] = ji; } });
    jobs.forEach((j, ji) => {
      const g = j.g; g.M = new Uint8Array(g.rw * g.rh); let t = g.rh, b = -1;
      for (let y = 0; y < g.rh; y++) for (let x = 0; x < g.rw; x++) if (g.I[y * g.rw + x] && own[(y + g.R.y0) * W + x + g.R.x0] === ji) { g.M[y * g.rw + x] = 1; if (y < t) t = y; if (y > b) b = y; }
      g.t0 = t; g.b0 = b;
      // ink that stays on the page (outlines, panel borders, the art, other balloons): new letters may never touch it
      g.ob = new Uint8Array(g.rw * g.rh);
      for (let k = 0; k < g.ob.length; k++) { const v = g.L[k]; if ((g.dark ? v > 150 : v < 120) && !(g.E ? g.E[k] : g.I[k])) g.ob[k] = 1; }
      // the size and place of the original letters in this balloon: rows of ink, grouped into lines
      const rc = [], x0 = Math.floor(g.box.x0 - g.R.x0), x1 = Math.ceil(g.box.x1 - g.R.x0);
      for (let y = 0; y < g.rh; y++) { let c = 0; for (let x = Math.max(0, x0); x < Math.min(g.rw, x1); x++) { const k = y * g.rw + x; if (g.K[k] && g.M[k]) c++; } rc.push(c); }
      const thr = Math.max(2, Math.max(0, ...rc) * 0.12), runs = []; let r0 = -1;
      for (let y = 0; y <= g.rh; y++) { const on = y < g.rh && rc[y] >= thr; if (on && r0 < 0) r0 = y; if (!on && r0 >= 0) { if (y - r0 >= 3) runs.push([r0, y]); r0 = -1; } }
      g.lineW = runs.reduce((a, r) => { let lo = g.rw, hi = -1; for (let y = r[0]; y < r[1]; y++) for (let x = 0; x < g.rw; x++) { const k = y * g.rw + x; if (g.K[k] && g.M[k]) { if (x < lo) lo = x; if (x > hi) hi = x; } } return hi > lo ? a + hi - lo + 1 : a; }, 0);
      g.nLines = runs.length;
      // where the original words were: a balloon left open (cut by the panel edge) is lettered only there, so the
      // new words can never run out of the balloon into the gutter or the art
      if (runs.length) {
        g.tTop = runs[0][0]; g.tBot = runs[runs.length - 1][1];
        let lo = g.rw, hi = -1; for (let y = g.tTop; y < g.tBot; y++) for (let x = 0; x < g.rw; x++) { const k = y * g.rw + x; if (g.K[k] && g.M[k]) { if (x < lo) lo = x; if (x > hi) hi = x; } }
        g.tL = lo; g.tR = hi;
      }
      g.capH = med(runs.map(r => r[1] - r[0])); g.pitch = runs.length > 1 ? med(runs.slice(1).map((r, i) => r[0] - runs[i][0])) : 0;
      g.tc = runs.length ? (runs[0][0] + runs[runs.length - 1][1]) / 2 : (t + b) / 2;
    });
    // one letter size for the page, taken from the original lettering
    const cr = this.capRatio(cx);
    const caps = jobs.map(j => j.g.capH).filter(h => h >= 4).sort((a, b) => a - b);
    const pageCap = caps.length ? caps[caps.length >> 1] : W * 0.011;
    const pitches = jobs.map(j => j.g.pitch && j.g.capH ? j.g.pitch / j.g.capH : 0).filter(r => r > 1.05 && r < 2.2).sort((a, b) => a - b);
    // how wide the original letters are, so the new ones fill a line the same way
    const sxs = jobs.map(j => { const g = j.g; if (!g.lineW || g.capH < 4 || !j.orig) return 0; const size = g.capH / cr; cx.font = this.fontFor(size); const w = cx.measureText(j.orig).width - (g.nLines - 1) * cx.measureText(' ').width; return w > 0 ? g.lineW / w : 0; }).filter(v => v > 0.5 && v < 2).sort((a, b) => a - b);
    this.sx = clamp(sxs.length ? sxs[sxs.length >> 1] : 1, 0.9, 1.35);
    const pr = clamp(pitches.length ? pitches[pitches.length >> 1] : 1.45, 1.25, 1.7);
    for (const j of jobs) {
      const g = j.g, cap0 = g.capH >= 4 && Math.abs(g.capH - pageCap) > pageCap * 0.3 ? clamp(g.capH, pageCap * 0.75, pageCap * 1.35) : pageCap;
      for (const f of [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]) {
        const cap = cap0 * f, size = cap / cr, lh = cap * pr, pad = Math.max(2, cap * 0.45);
        let t0 = g.t0, b0 = g.b0; g.capE = cap0;
        if (g.open && g.tR > g.tL) { t0 = Math.max(t0, g.tTop - cap0 * 0.9); b0 = Math.min(b0, g.tBot + cap0 * 0.9); }
        g.top = t0 + cap * 0.55; g.bot = b0 - cap * 0.55; if (g.bot - g.top < lh * 0.9) { g.top = t0 + 1; g.bot = b0 - 1; }
        const lay = this.layout(cx, g, j.words, size, lh, pad);
        if (lay) { j.lay = lay; j.size = size; break; }
      }
      if (!j.lay) continue;
    }
    for (const j of jobs) {
      if (!j.lay) continue;
      const g = j.g;
      // paper colour of this balloon
      const pick = c => { const v = g.fillAt.map(k => { const x = k % g.rw, y = (k / g.rw) | 0; return px[((y + g.R.y0) * W + x + g.R.x0) * 4 + c]; }).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : (g.dark ? 0 : 255); };
      j.fill = [pick(0), pick(1), pick(2)];
      for (let y = 0; y < g.rh; y++) for (let x = 0; x < g.rw; x++) if ((g.M[y * g.rw + x] || (g.I[y * g.rw + x] && !jobs[own[(y + g.R.y0) * W + x + g.R.x0]].lay)) && (!g.E || g.E[y * g.rw + x])) { const k = ((y + g.R.y0) * W + x + g.R.x0) * 4; px[k] = j.fill[0]; px[k + 1] = j.fill[1]; px[k + 2] = j.fill[2]; }
    }
    cx.putImageData(id, 0, 0);
    for (const j of jobs) {
      if (!j.lay) continue;
      const g = j.g, size = j.size, ink = (g.dark || (j.fill[0] + j.fill[1] + j.fill[2]) / 3 < 110) ? '#fff' : '#161616';
      cx.save(); cx.translate(g.R.x0, g.R.y0); cx.font = this.fontFor(size); cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
      cx.fillStyle = cx.strokeStyle = ink; cx.lineJoin = 'round';
      const base = size * this.capRatio(cx) / 2;
      for (const l of j.lay.lines) {
        let x = l.x - l.w / 2;
        for (const w of l.words) {
          const ww = this.wordW(cx, w, size);
          cx.save(); cx.translate(x + size * 0.025, l.y + base); cx.scale(this.sx || 1, 1);
          if (w.e) { cx.transform(1, 0, -0.2, 1, 0, 0); cx.scale(1.06, 1); cx.lineWidth = size * 0.05; cx.strokeText(w.t, 0, 0); }
          else { cx.lineWidth = size * 0.035; cx.strokeText(w.t, 0, 0); }
          cx.fillText(w.t, 0, 0);
          cx.restore();
          x += ww + j.lay.sp;
        }
      }
      cx.restore();
    }
    const blob = await canvasBlob(cv, 'image/jpeg', 0.9); cv.width = cv.height = 0; return blob;
  },
};

/* rendered comic pages kept on the device (PDF comics open instantly the second time); oldest go first */
const PageCache = {
  MAX: 220,
  async add(k, blob) {
    try {
      await DB.putPic(k, 1, blob);
      const list = ((await DB.get('kv', 'cpg:list').catch(() => null)) || []).filter(x => x !== k); list.push(k);
      while (list.length > this.MAX) await DB.del('kv', list.shift()).catch(() => { });
      await DB.put('kv', 'cpg:list', list);
    } catch (e) { }
  },
};

/* ================= comic reader ================= */
const Comic = {
  rec: null, src: null, cache: new Map(), page: 0, step: 0, steps: [], cur: null, token: 0,
  z: { s: 1, x: 0, y: 0 }, zb: null, uiT: null,
  get mode() { return (this.rec && this.rec.prefs.mode) || S.cMode; },
  get dir() { return (this.rec && this.rec.prefs.dir) || S.cDir; },
  init() {
    this.stage = $('#c-stage'); this.zoomer = $('#c-zoom'); this.cam = $('#c-cam'); this.spot = $('#c-spot');
    gestures(this.stage, {
      tap: (x, y) => {
        const W = this.stage.clientWidth, zone = x / W, now = performance.now();
        // double tap on a panel while seeing the whole page: guided reading starts at that panel (like Comixology)
        if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 40) {
          clearTimeout(this.tapT); this.lastTap = null;
          if ((S.cDbl || 'zoom') === 'zoom') return this.dblZoom(x, y);
          this.enterPanelAt(x, y); return;
        }
        this.lastTap = { t: now, x, y };
        const act = () => {
          if (zone > 0.3 && zone < 0.7) return this.toggleUI();
          const fwd = zone >= 0.7;
          (this.dir === 'rtl' ? !fwd : fwd) ? this.next() : this.prev();
        };
        const r = this.steps[this.step];
        // wait a moment so a second tap can become a double tap (zoom)
        if ((S.cDbl || 'zoom') === 'zoom' || (r && r.full && this.mode === 'quadros' && this.steps.length > 1)) { clearTimeout(this.tapT); this.tapT = setTimeout(act, 260); } else act();
      },
      swipe: d => { if (this.z.s > 1.05) return; const fwd = d === 'left'; (this.dir === 'rtl' ? !fwd : fwd) ? this.next() : this.prev(); },
      down: () => { this.zb = Object.assign({}, this.z); this.dragAxis = null; },
      pan: (dx, dy) => {
        if (this.z.s > 1.02) { this.z.x = this.zb.x + dx; this.z.y = this.zb.y + dy; this.applyZoom(false); return; }
        // whole page on screen: the page follows the finger and the next one comes in from the side, like paper
        if (!this.dragAxis) this.dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (this.dragAxis === 'x' && this.canDrag()) this.dragMove(dx);
      },
      panEnd: (dx, dy) => { if (this.z.s > 1.02) return true; if (this.dragging) { this.dragEnd(dx); return true; } return false; },
      pinchStart: () => { this.zb = Object.assign({}, this.z); },
      pinchMove: (k, c, c0) => {
        const s = clamp(this.zb.s * k, 1, 6), f = s / this.zb.s;
        this.z.s = s; this.z.x = c.x - (c0.x - this.zb.x) * f; this.z.y = c.y - (c0.y - this.zb.y) * f; this.applyZoom(false);
      },
      pinchEnd: () => { if (this.z.s < 1.06) this.resetZoom(true); },
    });
    $('#c-mode').onclick = () => this.cycleMode();
    $('#c-set').onclick = () => this.settings();
    $('#c-grid').onclick = () => this.pagesSheet();
    $('#c-tr').onclick = () => this.toggleTr();
    $('#c-tr').classList.toggle('hide', !AI.fn);
    $('#c-bmk').onclick = () => this.toggleBookmark();
    const rg = $('#c-range');
    rg.oninput = () => { $('#c-label').textContent = t('pageXofY', { a: rg.value, b: this.src.count }); };
    rg.onchange = () => this.goto(+rg.value - 1, 0);
    $('#v-comic .r-back').onclick = () => this.close();
  },
  async open(rec, blob) {
    this.rec = rec; rec.prefs = rec.prefs || {};
    busy(t('opening'));
    try { this.src = await comicSource(rec, blob); } finally { busy(null); }
    this.cache.clear(); this.cur = null; this.cam.replaceChildren();
    $('#c-title').textContent = bTitle(rec);
    const rg = $('#c-range'); rg.max = this.src.count; rg.min = 1;
    App.show('v-comic');
    this.showUI(true);
    Resume.apply(rec);
    const pos = rec.pos || {};
    // earlier versions could leave the translation switched off for good: once per comic, back to automatic
    if (!rec.prefs.trFix1) { rec.prefs.trFix1 = true; delete rec.prefs.trPick; saveRec(rec).catch(() => { }); }
    this.autoTr(rec);
    $('#c-tr').classList.toggle('on', !!rec.prefs.tr);
    await this.goto(clamp(pos.page || 0, 0, this.src.count - 1), pos.step || 0, false);
    if (!(await DB.get('kv', 'hint:comic'))) { DB.put('kv', 'hint:comic', 1); this.hint(); }
  },
  hint() {
    const back = t('hintBack'), fwd = t('hintNext');
    const h = el('div', { class: 'hint' }, el('div', { text: this.dir === 'rtl' ? fwd : back }), el('div', { text: t('hintMenu') }), el('div', { text: this.dir === 'rtl' ? back : fwd }));
    $('#v-comic').append(h); setTimeout(() => h.remove(), 3200);
  },
  size() { return { SW: this.stage.clientWidth || innerWidth, SH: this.stage.clientHeight || innerHeight }; },
  key(i) { return 'pn:' + this.rec.id + ':' + i + ':' + this.dir + ':v30'; },
  load(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    const p = (async () => {
      const pg = await this.src.page(i);
      let panels = await DB.get('kv', this.key(i));
      if (!Array.isArray(panels)) { panels = detectPanels(pg.img, pg.w, pg.h, this.dir); DB.put('kv', this.key(i), panels); }
      pg.i = i; pg.panels = panels; return pg;
    })();
    p.catch(() => this.cache.delete(i));
    this.cache.set(i, p); return p;
  },
  evict(center) {
    for (const [k, p] of this.cache) if (Math.abs(k - center) > 4) { this.cache.delete(k); p.then(pg => { if (this.cur !== pg) URL.revokeObjectURL(pg.url); }).catch(() => { }); }
  },
  computeSteps(pg) {
    const W = pg.w, H = pg.h, { SW, SH } = this.size(), full = { x: 0, y: 0, w: W, h: H, full: true };
    const m = this.mode;
    if (m === 'pagina') return [full];
    if (m === 'largura') {
      const s = SW / W, vis = SH / s;
      if (vis >= H * 0.97) return [full];
      const n = Math.max(2, Math.ceil((H - vis * 0.1) / (vis * 0.9))), st = (H - vis) / (n - 1);
      return Array.from({ length: n }, (_, k) => ({ x: 0, y: k * st, w: W, h: vis, strip: true }));
    }
    let ps = pg.panels.map(p => ({ x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H, cx: p.cx, cy: p.cy }));
    const ai = pg.tr && Array.isArray(pg.tr.panels) && pg.tr.panels.length ? pg.tr.panels : (Array.isArray(pg.ap) && pg.ap.length ? pg.ap : null);
    if (ai) ps = mergePanels(ps, ai.map(([y0, x0, y1, x1]) => ({ x: x0 / 1000 * W, y: y0 / 1000 * H, w: (x1 - x0) / 1000 * W, h: (y1 - y0) / 1000 * H })), W, H);
    if (ai && ps.length === 1 && ps[0].w * ps[0].h > W * H * 0.5) return [full];
    if (ps.length <= 1) return [full];
    const out = S.cFullFirst ? [full] : [];
    const sa = SW / SH;
    for (const p of ps) out.push(...splitPanel(p, sa, this.dir));
    return out;
  },
  // ---------- two pages side by side (tablet or phone lying down, whole-page mode), cover alone, like an open book ----------
  spreadOn() { const { SW, SH } = this.size(); return this.mode === 'pagina' && S.cSpread !== false && SW > SH * 1.15; },
  viewStart(i) { return this.spreadOn() && i > 0 ? i - ((i - 1) % 2) : i; },
  viewLen(i) { const s = this.viewStart(i); return this.spreadOn() && s > 0 && s + 1 < this.src.count ? 2 : 1; },
  nbr(side) { const s = this.viewStart(this.page); return side > 0 ? s + this.viewLen(s) : this.viewStart(s - 1); },
  async loadView(i) {
    const s = this.viewStart(i), n = this.viewLen(s), a = await this.load(s);
    if (n < 2) return a;
    const b = await this.load(s + 1);
    // a page that is already a double spread (wider than tall) is shown alone
    if (a.w > a.h || b.w > b.h) return a;
    const k = this.vkey = 'v' + s;
    if (this.vcache && this.vcache.key === k) return this.vcache.v;
    const sb = a.h / b.h, v = { spread: true, i: s, w: a.w + b.w * sb, h: a.h, url: a.url, panels: [], parts: [{ pg: a, x: 0, s: 1 }, { pg: b, x: a.w, s: sb }] };
    this.vcache = { key: k, v }; return v;
  },
  async goto(i, step, animate = true, instant = false) {
    const tok = ++this.token;
    const ld = setTimeout(() => $('#c-load').classList.remove('hide'), 250);
    let pg;
    i = this.viewStart(i);
    try { pg = await this.loadView(i); }
    catch (e) { clearTimeout(ld); $('#c-load').classList.add('hide'); toast(t('pageFail')); return; }
    if (!this.rec.prefs.tr && !this.rec.prefs.trPick && AI.fn) { this.autoTr(this.rec); $('#c-tr').classList.toggle('on', !!this.rec.prefs.tr); }
    if (this.rec.prefs.tr && AI.fn) {
      const parts = pg.spread ? pg.parts.map(p => p.pg) : [pg];
      if (parts.some(p => !p.timg)) {
        clearTimeout(ld); const L = $('#c-load'); L.classList.remove('hide'); L.classList.add('tr');
        try { await Promise.all(parts.map(p => this.trImage(p))); }
        catch (e) { if (!this.trWarned || Date.now() - this.trWarned > 20000) { this.trWarned = Date.now(); toast(t('cTrFail') + ' · ' + (e && e.code ? AI.errText(e) : String((e && e.message) || e).slice(0, 90)), 6000); } }
        L.classList.remove('tr');
      }
    }
    else if (AI.fn && !pg.spread && !pg.ap && S.cAiPanels !== false && this.mode === 'quadros') {
      const lt = setTimeout(() => $('#c-load').classList.remove('hide'), 300);
      try { await Promise.race([this.aiPanels(pg), new Promise(r => setTimeout(r, 12000))]); } catch (e) { }
      clearTimeout(lt);
    }
    clearTimeout(ld); $('#c-load').classList.add('hide');
    if (tok !== this.token) return;
    const trOn = !!(this.rec.prefs.tr && (pg.spread ? pg.parts.every(p => p.pg.timg) : pg.timg));
    const changed = this.cur !== pg || this.curTr !== trOn;
    this.cur = pg; this.page = i; this.curTr = trOn;
    if (changed) {
      let node;
      if (pg.spread) {
        node = el('div', { class: 'c-spread', style: { width: pg.w + 'px', height: pg.h + 'px' } }); node.style.setProperty('--gut', pg.parts[1].x + 'px');
        for (const p of pg.parts) { const im = this.shown(p.pg); Object.assign(im.style, { position: 'absolute', left: p.x + 'px', top: '0px', width: p.pg.w * p.s + 'px', height: p.pg.h * p.s + 'px' }); node.append(im); }
      } else { node = this.shown(pg); node.style.position = ''; node.style.left = node.style.top = ''; node.style.width = pg.w + 'px'; node.style.height = pg.h + 'px'; }
      if (instant || pg.spread) { node.style.opacity = '1'; node.style.transition = 'none'; this.cam.replaceChildren(node); }
      else { node.style.opacity = '0'; node.style.transition = 'opacity .18s'; this.cam.replaceChildren(node); requestAnimationFrame(() => { node.style.opacity = '1'; }); }
      this.drawTr(pg);
    }
    this.steps = this.computeSteps(pg);
    this.step = step === 'last' ? this.steps.length - 1 : clamp(step | 0, 0, this.steps.length - 1);
    if (instant && changed && this.steps[this.step] && !this.steps[this.step].full && S.anim) {
      // arrived by sliding: the whole page is showing, so glide from it into the panel
      const k = this.step; this.steps.splice(k, 0, { x: 0, y: 0, w: pg.w, h: pg.h, full: true, tmp: true });
      this.step = k; this.apply(false); this.steps.splice(k, 1);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (this.cur === pg) this.apply(true); }));
    } else this.apply(changed ? false : animate);
    this.afterMove();
    this.evict(i);
    this.prefetch(i + this.viewLen(i) - 1);
  },
  // the next pages are prepared one after the other in the background (and their balloons translated)
  prefetch(i) {
    const tok = this.token, order = [i + 1, i + 2, i - 1, i + 3, i + 4].filter(n => n >= 0 && n < this.src.count);
    (async () => {
      for (const n of order) {
        if (tok !== this.token) return;
        try { const pg = await this.load(n); if (n <= i + 3 && AI.fn && !GemTTS.over()) { if (this.rec.prefs.tr) await this.trImage(pg).catch(() => { }); else if (this.mode === 'quadros') await this.aiPanels(pg).catch(() => { }); } } catch (e) { }
      }
    })();
  },
  safe() {
    if (!this.safeEl) { this.safeEl = el('div', { style: { position: 'fixed', left: 0, top: 0, width: '1px', height: '1px', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } }); document.body.append(this.safeEl); }
    const cs = getComputedStyle(this.safeEl); return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  },
  rectFor(r) {
    const { SW, SH } = this.size(), sa = this.safe();
    // the clock, Wi-Fi and battery at the top and the home bar at the bottom never cover a panel
    const top = sa.t + (r.full || r.strip ? 0 : 6), bot = sa.b + (r.full || r.strip ? 0 : 6), AH = SH - top - bot;
    const pad = r.full || r.strip ? 0 : Math.min(14, SW * 0.03);
    const s = Math.min((SW - 2 * pad) / r.w, (AH - 2 * pad) / r.h);
    const sx = (SW - r.w * s) / 2, sy = top + (AH - r.h * s) / 2;
    return { s, tx: sx - r.x * s, ty: sy - r.y * s, sx, sy, sw: r.w * s, sh: r.h * s };
  },
  apply(animate) {
    const r = this.steps[this.step]; if (!r) return;
    const q = this.rectFor(r);
    const tr = animate && S.anim ? 'transform .42s cubic-bezier(.25,.8,.25,1)' : 'none';
    const trs = animate && S.anim ? 'all .42s cubic-bezier(.25,.8,.25,1)' : 'none';
    this.cam.style.transition = tr; this.spot.style.transition = trs;
    this.cam.style.transform = `translate(${q.tx}px,${q.ty}px) scale(${q.s})`;
    Object.assign(this.spot.style, { left: q.sx + 'px', top: q.sy + 'px', width: q.sw + 'px', height: q.sh + 'px', boxShadow: `0 0 0 300vmax rgba(0,0,0,${(!r.full && !r.strip) ? ({ off: 0, dim: 0.78, black: 1 }[S.cBox || (S.cSpot ? 'dim' : 'off')]) : 0})` });
    this.resetZoom(false);
    this.minimap(r);
  },
  // ---------- page turn that follows the finger ----------
  canDrag() {
    const r = this.steps[this.step]; if (!r || this.turning) return false;
    if (this.mode === 'pagina' || this.steps.length === 1) return true;
    // guided reading: the swipe goes panel by panel (the page moves on by itself after the last panel)
    if (this.mode === 'quadros') return false;
    return !!(r.strip && this.step === 0);
  },
  peekEl() { let p = $('#c-peek'); if (!p) { p = el('div', { id: 'c-peek' }); this.stage.prepend(p); } return p; },
  async showPeek(side) {
    // side +1 = the page after (comes from the right in western comics), -1 = the page before
    const n = this.nbr(side), p = this.peekEl(); p.dataset.side = side;
    if (n < 0 || n >= this.src.count) { p.replaceChildren(); return null; }
    let v; try { v = await this.loadView(n); } catch (e) { return null; }
    if (p.dataset.side != side) return v;
    const { SW, SH } = this.size(), s = Math.min(SW / v.w, SH / v.h), ox = (SW - v.w * s) / 2, oy = (SH - v.h * s) / 2;
    const parts = v.spread ? v.parts : [{ pg: v, x: 0, s: 1 }];
    p.replaceChildren(...parts.map(q => { const im = el('img', { src: (this.rec.prefs.tr && q.pg.turl) || q.pg.url, alt: '' }); Object.assign(im.style, { width: q.pg.w * q.s * s + 'px', height: q.pg.h * q.s * s + 'px', left: ox + q.x * s + 'px', top: oy + 'px' }); return im; }));
    return v;
  },
  dragMove(dx) {
    const W = this.stage.clientWidth, rtl = this.dir === 'rtl';
    const side = (dx < 0) !== rtl ? 1 : -1;
    const atEdge = (side > 0 && this.nbr(1) >= this.src.count) || (side < 0 && this.page <= 0);
    const x = atEdge ? dx * 0.25 : dx;                // rubber band at the first / last page
    this.dragging = true;
    if (this.peekSide !== side) { this.peekSide = side; this.showPeek(side); }
    const p = this.peekEl(); p.style.display = 'block'; p.style.transition = 'none'; this.zoomer.style.transition = 'none';
    this.zoomer.style.transform = `translate3d(${x}px,0,0)`;
    p.style.transform = `translate3d(${x + (dx < 0 ? W : -W)}px,0,0)`;
    this.lastDx = dx;
  },
  dragEnd(dx) {
    const W = this.stage.clientWidth, rtl = this.dir === 'rtl', side = this.peekSide;
    this.dragging = false; this.peekSide = 0;
    const atEdge = (side > 0 && this.nbr(1) >= this.src.count) || (side < 0 && this.page <= 0);
    if (!atEdge && Math.abs(dx) > W * 0.18) return this.slide(side, dx);
    // not far enough: the page springs back
    const p = this.peekEl(), tr = 'transform .32s cubic-bezier(.2,.9,.3,1)';
    this.zoomer.style.transition = tr; p.style.transition = tr;
    this.zoomer.style.transform = 'translate3d(0,0,0)'; p.style.transform = `translate3d(${dx < 0 ? W : -W}px,0,0)`;
    setTimeout(() => { if (!this.dragging) p.style.display = 'none'; }, 340);
    if (atEdge && side > 0 && Math.abs(dx) > W * 0.25) this.finish();
  },
  // slide to the page next to this one; from is where the finger left it (0 when it is a tap)
  async slide(side, from = 0) {
    if (this.turning) return; this.turning = true;
    const W = this.stage.clientWidth, rtl = this.dir === 'rtl', n = this.nbr(side);
    const out = (side > 0) !== rtl ? -1 : 1;           // the current page leaves to this side
    const p = this.peekEl();
    try {
      if (S.anim && !reduceMotion()) {
        await this.showPeek(side);
        p.style.display = 'block'; p.style.transition = 'none'; this.zoomer.style.transition = 'none';
        const start = from || 0;
        this.zoomer.style.transform = `translate3d(${start}px,0,0)`; p.style.transform = `translate3d(${start - out * W}px,0,0)`;
        void p.offsetWidth;
        const left = Math.abs(out * W - start) / W, ms = Math.round(180 + 200 * Math.min(1, left));
        const tr = `transform ${ms}ms cubic-bezier(.25,.8,.25,1)`;
        this.zoomer.style.transition = tr; p.style.transition = tr;
        this.zoomer.style.transform = `translate3d(${out * W}px,0,0)`; p.style.transform = 'translate3d(0,0,0)';
        await new Promise(r => setTimeout(r, ms + 20));
      }
      // land on the whole page first; a guided reader then glides into the first panel
      const pg = await this.loadView(n);
      const steps = this.computeSteps(pg), fullIdx = steps.findIndex(s => s.full);
      const target = side > 0 ? (fullIdx >= 0 ? fullIdx : 0) : (this.mode === 'quadros' ? steps.length - 1 : 0);
      await this.goto(n, target, false, true);
    } finally {
      this.zoomer.style.transition = 'none'; this.zoomer.style.transform = 'none';
      p.style.display = 'none'; p.style.transition = 'none'; p.replaceChildren();
      this.turning = false;
    }
  },
  enterPanelAt(x, y) {
    const r = this.steps[this.step]; if (!r) return;
    const st = this.stage.getBoundingClientRect(), q = this.rectFor(r);
    const px = (x - st.left - q.tx) / q.s, py = (y - st.top - q.ty) / q.s;
    const k = this.steps.findIndex(s => !s.full && px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h);
    if (k >= 0) { this.step = k; this.apply(true); this.afterMove(); }
    else if (!r.full) { const f = this.steps.findIndex(s => s.full); if (f >= 0) { this.step = f; this.apply(true); this.afterMove(); } }
  },
  // panels in reading order from the AI (pages that are translated already get this in the same request)
  aiPanels(pg) {
    if (pg.spread || this.rec.prefs.tr || !AI.fn || S.cAiPanels === false || GemTTS.over()) return Promise.resolve(null);
    if (pg.apP) return pg.apP;
    const key = 'cpn:' + this.rec.id + ':' + pg.i + ':' + this.dir;
    pg.apP = (async () => {
      const c = await DB.get('kv', key).catch(() => null); if (Array.isArray(c)) { pg.ap = c; return c; }
      const sc = Math.min(1, 1100 / Math.max(pg.w, pg.h)), cv = document.createElement('canvas');
      cv.width = Math.round(pg.w * sc); cv.height = Math.round(pg.h * sc); cv.getContext('2d').drawImage(pg.img, 0, 0, cv.width, cv.height);
      const blob = await canvasBlob(cv, 'image/jpeg', 0.8); cv.width = cv.height = 0;
      const prompt = `This is one page of a comic${this.dir === 'rtl' ? ' (manga, read right to left)' : ''}. Find every speech balloon, thought balloon and caption/narration box with text. Leave out sound effects and the sounds people make (gasps, grunts, groans, sighs, screams: GASP!, UGH, ARGH, HMM, GLIK, AHH!, HUH?, OH!): they stay as drawn and must not be translated.
For each one give its box as [ymin, xmin, ymax, xmax] normalized 0-1000 to this image: around all of its words, from the first letter to the last of every line (nothing left out), but never past the balloon's outline; the exact original text, and a natural ${lang} translation that keeps tone, humour and character voice and is about as short as the original, so it fits the same balloon (if the text is already in ${lang}, repeat it).
Words the letterer drew in bold or bold italic for emphasis: wrap them in asterisks in both text and translation, like *THIS*, on the matching word of the translation.
Rules: one item per balloon, never merge two balloons, never split one balloon; keep names of people and places as they are; keep the same wording for recurring expressions; list items in reading order (${this.dir === 'rtl' ? 'right to left' : 'left to right'}, top to bottom, panel by panel); conf is your confidence 0-1 that the text was read correctly.
Also list every panel of the page in reading order as tight boxes [ymin, xmin, ymax, xmax] normalized 0-1000 (follow the art's reading flow: a wide panel on top comes before the row below it; a tall panel at the left comes before the panels stacked at its right; a full-page splash is one panel; leave out page margins and gutters. When smaller panels sit on top of a bigger background picture, list the background picture first, as its visible part only (where it is not covered by the panels on top), then the panels on top in their own reading order.)
Return only JSON: {"lang":"source language code","panels":[[..],..],"items":[{"box":[..],"kind":"speech|thought|caption|sfx","text":"..","tr":"..","conf":0.9}]}`;
      const { text } = await AI.vision(blob, prompt, { json: true, temperature: 0.1, noThink: true, models: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest'] });
      const j = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim());
      const panels = (j.panels || []).filter(b => Array.isArray(b) && b.length === 4 && b.every(v => isFinite(+v)) && b[2] > b[0] && b[3] > b[1]).map(b => b.map(Number));
      DB.put('kv', key, panels).catch(() => { }); pg.ap = panels; return panels;
    })();
    pg.apP.catch(() => { pg.apP = null; });
    return pg.apP;
  },
  shown(pg) { return (this.rec.prefs.tr && pg.timg) ? pg.timg : pg.img; },
  // the page with the translation lettered in; made once, kept on the device
  trImage(pg) {
    if (!this.rec.prefs.tr || !AI.fn) return Promise.resolve(null);
    const key = 'ctimg:' + this.rec.id + ':' + pg.i + ':' + this.trLang() + ':v4';
    if (pg.tKey === key && pg.tPromise) return pg.tPromise;
    pg.tKey = key;
    pg.tPromise = (async () => {
      let blob = null, stage = 'cache';
      try {
        const have = await DB.getPic(key).catch(() => null); if (have && have.blob && have.blob.size > 1000) blob = have.blob;
        if (!blob) {
          let data = null; stage = 'ai';
          for (let k = 0; k < 2 && !data; k++) { try { data = await this.trData(pg, k > 0); } catch (e) { if (k || /quota|budget|limite|key/i.test(String(e && e.message))) throw e; } }
          pg.tr = data;
          if (!data || !(data.items || []).length) return null;
          stage = 'letter';
          try { blob = await Letter.render(pg, data); }
          catch (e) {
            // a phone short of memory: letter a smaller copy of the page
            this.diag(e, 'letter-full', pg);
            const sc = Math.min(1, 1100 / pg.w), cv = document.createElement('canvas'); cv.width = Math.round(pg.w * sc); cv.height = Math.round(pg.h * sc);
            cv.getContext('2d').drawImage(pg.img, 0, 0, cv.width, cv.height);
            blob = await Letter.render({ img: cv, w: cv.width, h: cv.height }, data); cv.width = cv.height = 0;
          }
          PageCache.add(key, blob);
        } else pg.tr = await DB.get('kv', 'ctr5:' + this.rec.id + ':' + pg.i + ':' + this.trLang()).catch(() => null);
        stage = 'show';
        const url = URL.createObjectURL(blob), img = await loadImg(url); try { await img.decode(); } catch (e) { }
        pg.turl = url; pg.timg = img; return img;
      } catch (e) { this.diag(e, stage, pg); throw e; }
    })();
    pg.tPromise.catch(() => { pg.tPromise = null; pg.tKey = null; });
    return pg.tPromise;
  },
  // what went wrong with a page's translation is written to the family library (diag/<device>.json), so it can be looked into
  diag(e, stage, pg) {
    try {
      const now = Date.now(); if (this.diagAt && now - this.diagAt < 30000) return; this.diagAt = now;
      const x = { at: new Date().toISOString(), stage, msg: String((e && e.message) || e).slice(0, 300), code: e && e.code, stack: String((e && e.stack) || '').slice(0, 900), page: pg && pg.i, w: pg && pg.w, h: pg && pg.h, model: S.gemModel || '', ua: navigator.userAgent, title: this.rec && this.rec.title };
      if (typeof Family !== 'undefined' && Family.putJSON) Family.putJSON('diag/' + GemTTS.devId() + '.json', x, 'Estante: diagnóstico da tradução').catch(() => { });
    } catch (er) { }
  },
  // a comic in another language opens with its balloons already in the app language (only pages you open are paid for)
  autoTr(rec) {
    if (rec.prefs.trPick || !AI.fn) return;
    const app = S.lang === 'en' ? 'en' : 'pt', src = (rec.lang || '').slice(0, 2).toLowerCase();
    // language not known yet: translate anyway (a balloon already in the app language is left as it is, for free)
    if (src !== app) { rec.prefs.tr = true; rec.prefs.trTo = app; rec.prefs.trAuto = true; }
    else if (rec.prefs.trAuto) { rec.prefs.tr = false; rec.prefs.trAuto = false; }
  },
  // ---------- translated balloons (AI reads the page, finds each balloon and translates it) ----------
  trLang() { return (this.rec.prefs.trTo) || (S.lang === 'en' ? 'en' : 'pt'); },
  async toggleTr() {
    if (!AI.fn) return;
    const on = !this.rec.prefs.tr;
    if (on) {
      const pick = await new Promise(res => Sheets.open({ title: t('cTrTitle'), body: b => b.append(
        el('p', { class: 'muted', style: { lineHeight: 1.5, marginTop: 0 }, text: t('cTrIntro') }),
        el('button', { class: 'btn primary block', text: t('cTrTo') + ' Português', onclick: () => { Sheets.close(); res('pt'); } }),
        el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('cTrTo') + ' English', onclick: () => { Sheets.close(); res('en'); } })), onClose: () => res(null) }));
      if (!pick) return;
      this.rec.prefs.trTo = pick;
    }
    this.rec.prefs.tr = on; this.rec.prefs.trPick = true; await saveRec(this.rec);
    $('#c-tr').classList.toggle('on', on);
    if (this.cur) { const p = this.page, st = this.step; this.cur = null; this.goto(p, st, false); }
  },
  async trData(pg, force) {
    const key = 'ctr5:' + this.rec.id + ':' + pg.i + ':' + this.trLang();
    if (!force) { const c = await DB.get('kv', key).catch(() => null); if (c) return c; }
    if (GemTTS.over()) throw new Error(t('gemBudgetHit', { b: GemTTS.money(GemTTS.budget()) }));
    // the same page asked twice at once (prefetch + opening it) is translated only once
    this.trBusy = this.trBusy || new Map();
    if (this.trBusy.has(key)) return this.trBusy.get(key);
    const job = this.trJob(pg, key); this.trBusy.set(key, job);
    try { return await job; } finally { this.trBusy.delete(key); }
  },
  async trJob(pg, key) {
    const sc = Math.min(1, 1400 / Math.max(pg.w, pg.h)), cv = document.createElement('canvas');
    cv.width = Math.round(pg.w * sc); cv.height = Math.round(pg.h * sc); cv.getContext('2d').drawImage(pg.img, 0, 0, cv.width, cv.height);
    const blob = await canvasBlob(cv, 'image/jpeg', 0.85);
    const lang = this.trLang() === 'en' ? 'English' : 'Brazilian Portuguese';
    const prompt = `This is one page of a comic${this.dir === 'rtl' ? ' (manga, read right to left)' : ''}. Find every speech balloon, thought balloon and caption/narration box with text. Leave out sound effects and the sounds people make (gasps, grunts, groans, sighs, screams: GASP!, UGH, ARGH, HMM, GLIK, AHH!, HUH?, OH!): they stay as drawn and must not be translated.
For each one give its box as [ymin, xmin, ymax, xmax] normalized 0-1000 to this image: tightly around the words inside the balloon, never past the balloon's outline; the exact original text, and a natural ${lang} translation that keeps tone, humour and character voice, about as long as the original so it fits the same balloon (if the text is already in ${lang}, repeat it).
Rules: one item per balloon, never merge two balloons, never split one balloon; keep names of people and places as they are; keep names of people and places as they are; keep the same wording for recurring expressions; list items in reading order (${this.dir === 'rtl' ? 'right to left' : 'left to right'}, top to bottom, panel by panel); conf is your confidence 0-1 that the text was read correctly.
Also list every panel of the page in reading order as tight boxes [ymin, xmin, ymax, xmax] normalized 0-1000 (follow the art's reading flow: a wide panel on top comes before the row below it; a tall panel at the left comes before the panels stacked at its right; a full-page splash is one panel; leave out page margins and gutters. When smaller panels sit on top of a bigger background picture, list the background picture first, as its visible part only (where it is not covered by the panels on top), then the panels on top in their own reading order.)
Return only JSON: {"lang":"source language code","panels":[[..],..],"items":[{"box":[..],"kind":"speech|thought|caption|sfx","text":"..","tr":"..","conf":0.9}]}`;
    // continuity: the pages just before this one, as already translated, so names, terms and each voice stay the same
    let ctx = '';
    try {
      const prev = [];
      for (const k of [pg.i - 2, pg.i - 1]) { if (k < 0) continue; const d = await DB.get('kv', 'ctr5:' + this.rec.id + ':' + k + ':' + this.trLang()).catch(() => null); if (d && d.items) prev.push(...d.items.filter(x => x.tr && !Letter.same(x.tr, x.text))); }
      const pairs = prev.slice(-14).map(x => String(x.text).replace(/\s+/g, ' ').slice(0, 140) + ' => ' + String(x.tr).replace(/\s+/g, ' ').slice(0, 160));
      if (pairs.length) ctx = '\nThe pages just before this one were translated like this; keep names, recurring terms and each character\'s way of speaking consistent with them:\n' + pairs.join('\n');
    } catch (e) { }
    const { text } = await AI.vision(blob, prompt + ctx, { json: true, temperature: 0.2, noThink: true, models: S.cTrEco ? ['gemini-flash-lite-latest', 'gemini-flash-latest'] : ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest'] });
    const j = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim());
    // now and then the reply lists each balloon as a run of loose values ([box], kind, text, translation, conf): read those too
    let raw = Array.isArray(j.items) ? j.items : [];
    if (raw.some(x => !x || typeof x !== 'object' || Array.isArray(x))) {
      const fixed = []; let cur = null;
      for (const x of raw) {
        if (Array.isArray(x) && x.length === 4 && x.every(v => isFinite(+v))) { cur = { box: x, kind: 'speech', s: [] }; fixed.push(cur); }
        else if (x && typeof x === 'object' && !Array.isArray(x)) { cur = null; fixed.push(x); }
        else if (cur && typeof x === 'string') { if (/^(speech|thought|caption|sfx)$/.test(x) && !cur.s.length) cur.kind = x; else cur.s.push(x); }
        else if (cur && typeof x === 'number') cur.conf = x;
      }
      raw = fixed.map(x => x.s ? { box: x.box, kind: x.kind, text: x.s[0] || '', tr: x.s[1] || '', conf: x.conf } : x);
    }
    const items = raw.filter(it => Array.isArray(it.box) && it.box.length === 4 && (it.tr || it.text));
    // a reply that had balloons but none could be read is not kept: the page is asked again
    if (raw.length && !items.length) throw new Error('unreadable reply');
    const panels = (j.panels || []).filter(b => Array.isArray(b) && b.length === 4 && b.every(v => isFinite(+v)) && b[2] > b[0] && b[3] > b[1]).map(b => b.map(Number));
    const data = { lang: j.lang || '', items, panels };
    DB.put('kv', key, data).catch(() => { });
    return data;
  },
  drawTr() { this.cam.querySelectorAll('.ctr-layer').forEach(x => x.remove()); },
  linesSheet() {
    const pg = this.cur, d = pg && pg.tr;
    Sheets.open({ title: t('cLines'), body: b => {
      if (!d || !d.items.length) { b.append(el('p', { class: 'muted', text: this.rec.prefs.tr ? t('cLinesNone') : t('cLinesOff') })); return; }
      b.append(...d.items.map((it, i) => el('div', { class: 'cline' + ((it.conf ?? 1) < 0.6 ? ' low' : '') },
        el('small', { text: (i + 1) + ' · ' + t('cKind_' + (it.kind || 'speech')) + ((it.conf ?? 1) < 0.6 ? ' · ' + t('cLow') : '') }),
        el('div', { class: 'co', text: String(it.text || '').replace(/\*/g, '') }), el('div', { class: 'ct', text: String(it.tr || '').replace(/\*/g, '') }))),
        el('button', { class: 'btn block', style: { marginTop: '12px' }, text: t('cRedo'), onclick: async () => { Sheets.close(); try { await this.trData(pg, true); this.drawTr(pg); } catch (e) { toast(AI.errText(e)); } } }));
    } });
  },
  minimap(r) {
    let m = $('#c-map');
    if (!m) { m = el('div', { id: 'c-map' }, el('img'), el('i')); $('#v-comic').append(m); }
    const pg = this.cur; if (!pg) return;
    const show = this.mode === 'quadros' && !r.full && this.steps.length > 1;
    m.classList.toggle('on', show); if (!show) return;
    const img = m.firstChild; if (img.src !== pg.url) img.src = pg.url;
    const MW = 58, MH = MW * pg.h / pg.w; m.style.width = MW + 'px'; m.style.height = MH + 'px';
    Object.assign(m.lastChild.style, { left: (r.x / pg.w * MW) + 'px', top: (r.y / pg.h * MH) + 'px', width: (r.w / pg.w * MW) + 'px', height: (r.h / pg.h * MH) + 'px' });
  },
  applyZoom(anim) {
    this.zoomer.style.transition = anim ? 'transform .25s ease' : 'none';
    this.zoomer.style.transform = `translate(${this.z.x}px,${this.z.y}px) scale(${this.z.s})`;
  },
  resetZoom(anim) { this.z = { s: 1, x: 0, y: 0 }; this.applyZoom(anim); },
  // double tap: zoom in on that spot; double tap again: back to the whole view
  dblZoom(x, y) {
    if (this.z.s > 1.05) return this.resetZoom(true);
    const r = this.stage.getBoundingClientRect(), zr = this.zoomer.getBoundingClientRect();
    const px = x - (zr.left - r.left), py = y - (zr.top - r.top), S2 = 2.5;
    this.z = { s: S2, x: this.z.x + px * (1 - S2), y: this.z.y + py * (1 - S2) };
    this.applyZoom(true);
  },
  next() {
    if (this.z.s > 1.05) this.resetZoom(true);
    if (this.step < this.steps.length - 1) { this.step++; this.apply(true); this.afterMove(); }
    else if (this.nbr(1) < this.src.count) this.turnTo(1);
    else this.finish();
  },
  // between pages: slide when the whole page is on screen; from a zoomed panel, pull back to the page first
  async turnTo(side) {
    if (this.turning) return;
    const r = this.steps[this.step];
    if (r && !r.full && this.mode === 'quadros' && S.anim && !reduceMotion()) {
      const f = this.steps.findIndex(s => s.full);
      if (f >= 0) { this.step = f; this.apply(true); await new Promise(res => setTimeout(res, 380)); }
      else { this.cam.style.transition = 'opacity .2s'; }
    }
    await this.slide(side);
  },
  prev() {
    if (this.z.s > 1.05) this.resetZoom(true);
    if (this.step > 0) { this.step--; this.apply(true); this.afterMove(); }
    else if (this.page > 0) this.turnTo(-1);
    else toast(t('atStart'));
  },
  finish() {
    if (!this.rec.finished) { this.rec.finished = true; this.rec.pct = 1; saveRec(this.rec); }
    Sheets.open({
      title: t('theEnd'), center: true, body: b => b.append(el('p', { class: 'muted', style: { lineHeight: 1.5, margin: '0 0 18px' }, text: t('endComic', { t: this.rec.title }) }),
        el('div', { style: { display: 'flex', gap: '10px' } },
          el('button', { class: 'btn', style: { flex: 1 }, text: t('stay'), onclick: () => Sheets.close() }),
          el('button', { class: 'btn primary', style: { flex: 1 }, text: t('toShelf'), onclick: () => { Sheets.close(); this.close(); } })))
    });
  },
  afterMove() {
    const n = this.src.count, i = this.page;
    $('#c-range').value = i + 1;
    let lbl = this.cur && this.cur.spread ? t('pagesXYofN', { a: i + 1, b: i + 2, n }) : t('pageXofY', { a: i + 1, b: n });
    const cur = this.steps[this.step];
    if (this.mode === 'quadros' && this.steps.length > 1) {
      const panelSteps = this.steps.filter(s => !s.full).length;
      const k = this.steps.slice(0, this.step + 1).filter(s => !s.full).length;
      lbl += cur.full ? ' · ' + t('fullPage') : ' · ' + t('panelXofY', { a: k, b: panelSteps });
    }
    $('#c-label').textContent = lbl;
    this.rotHint(cur);
    const dots = $('#c-steps'); dots.replaceChildren();
    if (this.steps.length > 1 && this.steps.length <= 24) for (let k = 0; k < this.steps.length; k++) dots.append(el('i', { class: k === this.step ? 'on' : '' }));
    const ic = { quadros: 'panels', pagina: 'page', largura: 'width' }[this.mode];
    $('#c-mode').replaceChildren(icon(ic), t('mode_' + this.mode));
    const bm = (this.rec.bookmarks || []).some(b => b.page === i);
    $('#c-bmk').replaceChildren(icon(bm ? 'bookmarkF' : 'bookmark'));
    $('#c-bmk').style.color = bm ? 'var(--accent)' : '';
    // progress
    this.rec.pos = { page: i, step: this.step };
    const pct = n <= 1 ? 1 : (i + (this.steps.length > 1 ? this.step / this.steps.length : 0)) / (n - 1);
    this.rec.pct = clamp(i >= n - 1 ? 1 : pct, 0, 1); this.rec.posAt = Date.now();
    Resume.save(this.rec);
    saveRecSoon(this.rec);
  },
  // a wide panel on a phone held upright (or a tall one lying down) reads much bigger the other way:
  // a small hint, now and then; turning the phone keeps you on the same panel
  rotHint(r) {
    if (!r || r.full || this.mode !== 'quadros' || S.cRotHint === false) return;
    const { SW, SH } = this.size(), pa = r.w / r.h, sa = SW / SH;
    const gain = Math.min(pa, 1 / sa) / Math.max(1e-3, Math.min(pa, sa)) > 1 && (pa > 1.25 && sa < 0.8 ? (pa / sa) : (pa < 0.8 && sa > 1.25 ? (sa / pa) : 0));
    if (!gain || gain < 2.2 || Date.now() - (this.rotAt || 0) < 30000) return;
    this.rotAt = Date.now();
    let h = $('#c-rot'); if (!h) { h = el('div', { id: 'c-rot' }); $('#v-comic').append(h); }
    h.textContent = sa < 1 ? t('cRotLand') : t('cRotPort'); h.classList.add('on');
    clearTimeout(this.rotT); this.rotT = setTimeout(() => h.classList.remove('on'), 2200);
  },
  toggleUI() { $('#v-comic').classList.contains('ui-off') ? this.showUI() : this.hideUI(); },
  showUI(auto) { $('#v-comic').classList.remove('ui-off'); clearTimeout(this.uiT); if (auto) this.uiT = setTimeout(() => this.hideUI(), 2800); },
  hideUI() { clearTimeout(this.uiT); $('#v-comic').classList.add('ui-off'); },
  cycleMode() {
    const order = ['quadros', 'largura', 'pagina'];
    this.setMode(order[(order.indexOf(this.mode) + 1) % 3]);
    toast(t('modeToast_' + this.mode));
  },
  setMode(m) { this.rec.prefs.mode = m; saveRec(this.rec, { sync: false }); if (this.cur) { this.steps = this.computeSteps(this.cur); this.step = 0; this.apply(true); this.afterMove(); } },
  setDir(d) {
    this.rec.prefs.dir = d; saveRec(this.rec, { sync: false });
    this.cache.clear(); const p = this.page; this.cur = null; this.goto(p, 0, false);
  },
  relayout() {
    if (!this.cur) return;
    if (this.viewStart(this.page) !== this.page || !!this.cur.spread !== (this.viewLen(this.page) > 1)) { this.cur = null; return this.goto(this.page, 0, false); }
    const k = this.step; this.steps = this.computeSteps(this.cur); this.step = clamp(k, 0, this.steps.length - 1); this.apply(false); this.afterMove(); },
  toggleBookmark() {
    const bms = this.rec.bookmarks = this.rec.bookmarks || [];
    const i = bms.findIndex(b => b.page === this.page);
    if (i >= 0) { bms.splice(i, 1); toast(t('bmRemoved')); }
    else { bms.push({ id: uid(), page: this.page, created: Date.now() }); bms.sort((a, b) => a.page - b.page); toast(t('bmAdded', { p: this.page + 1 })); }
    saveRec(this.rec); this.afterMove();
  },
  settings() {
    Sheets.open({
      title: t('comicSettings'), body: b => {
        b.append(
          wGroup(t('readMode'), wSeg([['quadros', t('mode_quadros'), 'panels'], ['largura', t('mode_largura'), 'width'], ['pagina', t('mode_pagina'), 'page']], this.mode, v => this.setMode(v))),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 0 0' }, text: t('modeHelp') }),
          wGroup(t('direction'), wSeg([['ltr', t('western'), 'ltr'], ['rtl', t('manga'), 'rtl']], this.dir, v => this.setDir(v))),
          wGroup(t('panelView'),
            wToggle(t('fullFirst'), t('fullFirstSub'), S.cFullFirst, v => { setS('cFullFirst', v); this.relayout(); }),
            wToggle(t('splitWide'), t('splitWideSub2'), S.cSplit, v => { setS('cSplit', v); this.relayout(); }),
            wToggle(t('cAiPanelsT'), t('cAiPanelsSub'), S.cAiPanels !== false, v => { setS('cAiPanels', v); this.relayout(); }),
            wToggle(t('cTrEcoT'), t('cTrEcoSub'), !!S.cTrEco, v => setS('cTrEco', v)),
            wToggle(t('cRotT'), t('cRotSub'), S.cRotHint !== false, v => setS('cRotHint', v)),
            wToggle(t('cSpreadT'), t('cSpreadSub'), S.cSpread !== false, v => { setS('cSpread', v); this.cur = null; this.goto(this.page, 0, false); }),
            el('button', { class: 'btn block', style: { margin: '10px 0' }, onclick: () => { Sheets.closeAll(); this.linesSheet(); } }, icon('translate'), t('cLines')),
            el('div', { style: { margin: '12px 0 6px', fontSize: '14px', fontWeight: 600 }, text: t('cDblT') }),
            wSeg([['zoom', t('cDblZoom')], ['panel', t('cDblPanel')]], S.cDbl || 'zoom', v => setS('cDbl', v)),
            el('div', { style: { margin: '12px 0 6px', fontSize: '14px', fontWeight: 600 }, text: t('cBoxT') }),
            wSeg([['off', t('cBoxOff')], ['dim', t('cBoxDim')], ['black', t('cBoxBlack')]], S.cBox || (S.cSpot ? 'dim' : 'off'), v => { setS('cBox', v); this.apply(false); }),
            wToggle(t('animZoom'), null, S.anim, v => setS('anim', v)),
            wToggle(t('defaultsAll'), t('defaultsAllSub'), false, v => { if (v) { setS('cMode', this.mode); setS('cDir', this.dir); toast(t('savedDefaults')); } })),
          comfortGroup());
      }
    });
  },
  pagesSheet() {
    const self = this; let obs;
    const s = Sheets.open({
      title: t('pages'), wide: true, onClose: () => obs && obs.disconnect(), body: b => {
        const bms = (this.rec.bookmarks || []);
        const tabs = el('div', { class: 'tabs2' });
        const box = el('div');
        const showGrid = (onlyBm) => {
          box.replaceChildren();
          const g = el('div', { class: 'thumbs' });
          const list = onlyBm ? bms.map(x => x.page) : Array.from({ length: this.src.count }, (_, i) => i);
          if (!list.length) { box.append(el('div', { class: 'list' }, el('div', { class: 'empty-l', text: t('noBookmarksComic') }))); return; }
          obs && obs.disconnect();
          obs = new IntersectionObserver(ents => { for (const en of ents) if (en.isIntersecting) { obs.unobserve(en.target); fill(en.target); } }, { root: b, rootMargin: '300px' });
          for (const i of list) {
            const btn = el('button', { class: i === this.page ? 'cur' : '', onclick: () => { Sheets.close(s); this.goto(i, 0, false); } }, el('span', { text: String(i + 1) }), bms.some(x => x.page === i) ? el('i', { class: 'bm' }) : null);
            btn.dataset.i = i; g.append(btn); obs.observe(btn);
          }
          box.append(g);
          setTimeout(() => { const c = g.querySelector('.cur'); c && c.scrollIntoView({ block: 'center' }); }, 50);
        };
        async function fill(btn) {
          const i = +btn.dataset.i, key = 'th:' + self.rec.id + ':' + i;
          let blob = await DB.get('kv', key);
          if (!(blob instanceof Blob)) { try { blob = await self.src.thumb(i); DB.put('kv', key, blob); } catch (e) { return; } }
          const u = URL.createObjectURL(blob); const im = el('img', { src: u, alt: '' }); im.onload = () => URL.revokeObjectURL(u); btn.prepend(im);
        }
        tabs.append(wSeg([['all', t('allPages')], ['bm', t('bookmarks') + (bms.length ? ` (${bms.length})` : '')]], 'all', v => showGrid(v === 'bm')));
        b.append(tabs, box); showGrid(false);
      }
    });
  },
  close() {
    saveRecSoon.flush();
    saveRec(this.rec);
    this.token++;
    for (const p of this.cache.values()) p.then(pg => URL.revokeObjectURL(pg.url)).catch(() => { });
    this.cache.clear(); this.cur = null; this.cam.replaceChildren();
    this.src && this.src.close(); this.src = null;
    Pause.stop(); App.show('v-lib'); Lib.render();
  },
  key2(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.dir === 'rtl' && e.key === 'ArrowRight' ? this.prev() : this.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.dir === 'rtl' && e.key === 'ArrowLeft' ? this.next() : this.prev(); }
    else if (e.key === 'Escape') this.close();
  },
};
