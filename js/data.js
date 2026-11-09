/* Shared data loading, network derivation and saved-network storage.
   Used by the Network page and the Saved networks page. */
(function () {
  const MN = (window.MN = window.MN || {});

  // ---------- CSV loading ----------

  // Accepts comma- or semicolon-separated files, with or without a BOM.
  function parseTable(text) {
    text = text.replace(/^﻿/, '');
    const header = text.split(/\r?\n/)[0];
    const delim = header.split(';').length > header.split(',').length ? ';' : ',';
    return d3.dsvFormat(delim).parse(text, (row) => {
      const o = {};
      for (const k in row) o[k.replace(/^﻿/, '').trim()] = (row[k] || '').trim();
      return o;
    });
  }

  // Accepts YYYY-MM-DD, DD/MM/YYYY and DD/MM/YY.
  function parseDate(s) {
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return new Date(y, +m[2] - 1, +m[1]);
    }
    return new Date(s);
  }

  const pick = (row, ...keys) => {
    for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
    return '';
  };

  MN.loadData = async function () {
    const [mt, ct, at] = await Promise.all(
      ['movies', 'characters', 'appearances'].map((n) =>
        fetch('data/' + n + '.csv', { cache: 'no-cache' }).then((r) => r.text())
      )
    );

    const movies = parseTable(mt)
      .map((r) => {
        const date = parseDate(pick(r, 'release_date', 'date'));
        return {
          id: pick(r, 'id', 'movie_id'),
          title: pick(r, 'title'),
          date,
          year: date.getFullYear(),
          phase: +pick(r, 'phase'),
        };
      })
      .filter((m) => m.id)
      .sort((a, b) => a.date - b.date);

    const chars = parseTable(ct)
      .map((r) => ({
        id: pick(r, 'id', 'character_id'),
        name: pick(r, 'name'),
        alias: pick(r, 'alias'),
        url: pick(r, 'wikipedia_url', 'url'),
        image: pick(r, 'image'),
      }))
      .filter((c) => c.id);

    const moviesById = new Map(movies.map((m) => [m.id, m]));
    const charsById = new Map(chars.map((c) => [c.id, c]));
    const cast = new Map(movies.map((m) => [m.id, []]));
    const charMovies = new Map(chars.map((c) => [c.id, []]));

    for (const r of parseTable(at)) {
      const c = pick(r, 'character_id'), m = pick(r, 'movie_id');
      if (!charsById.has(c) || !moviesById.has(m)) {
        console.warn('appearances.csv: unknown id, row skipped:', c, m);
        continue;
      }
      if (!cast.get(m).includes(c)) {
        cast.get(m).push(c);
        charMovies.get(c).push(m);
      }
    }
    for (const list of charMovies.values()) list.sort((a, b) => moviesById.get(a).date - moviesById.get(b).date);

    const years = movies.map((m) => m.year);
    return {
      movies,
      chars,
      moviesById,
      charsById,
      cast,
      charMovies,
      phases: [...new Set(movies.map((m) => m.phase))].filter((p) => !isNaN(p)).sort((a, b) => a - b),
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
    };
  };

  // ---------- display helpers ----------

  MN.displayName = (c) =>
    c.alias && c.alias.trim().toLowerCase() !== c.name.trim().toLowerCase() ? `${c.name} (${c.alias})` : c.name;

  MN.faceUrl = (c) => 'images/faces/' + c.image;
  MN.fullImageUrl = (c) => 'images/characters/' + c.image;

  const pad = (n) => String(n).padStart(2, '0');
  MN.fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  MN.esc = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---------- state ----------
  // st = { y0, y1, phase, addedMovies:Set, removedMovies:Set, addedChars:Set, removedChars:Set, castEdits:{movieId:Set} }

  MN.freshState = (D) => ({
    y0: D.minYear,
    y1: D.maxYear,
    phase: null,
    cleared: false, // [clear]: start from an empty network; only added movies are shown
    addedMovies: new Set(),
    removedMovies: new Set(),
    addedChars: new Set(),
    removedChars: new Set(),
    castEdits: {},
  });

  MN.clearEdits = (st) => {
    st.cleared = false;
    st.addedMovies.clear();
    st.removedMovies.clear();
    st.addedChars.clear();
    st.removedChars.clear();
    st.castEdits = {};
  };

  MN.serializeState = (st) => ({
    y0: st.y0,
    y1: st.y1,
    phase: st.phase,
    cleared: !!st.cleared,
    addedMovies: [...st.addedMovies],
    removedMovies: [...st.removedMovies],
    addedChars: [...st.addedChars],
    removedChars: [...st.removedChars],
    castEdits: Object.fromEntries(Object.entries(st.castEdits).map(([k, v]) => [k, [...v]])),
  });

  MN.deserializeState = (o) => ({
    y0: o.y0,
    y1: o.y1,
    phase: o.phase == null ? null : o.phase,
    cleared: !!o.cleared,
    addedMovies: new Set(o.addedMovies || []),
    removedMovies: new Set(o.removedMovies || []),
    addedChars: new Set(o.addedChars || []),
    removedChars: new Set(o.removedChars || []),
    castEdits: Object.fromEntries(Object.entries(o.castEdits || {}).map(([k, v]) => [k, new Set(v)])),
  });

  // ---------- network derivation ----------

  // Builds nodes + weighted edges from a list of movie ids.
  MN.buildGraph = function (D, movieIds, castOf, nodeSet) {
    const edges = new Map();
    const nodes = new Set(nodeSet || []);
    for (const mid of movieIds) {
      const cs = castOf(mid);
      cs.forEach((c) => nodes.add(c));
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const [a, b] = cs[i] < cs[j] ? [cs[i], cs[j]] : [cs[j], cs[i]];
          const key = a + '|' + b;
          let e = edges.get(key);
          if (!e) edges.set(key, (e = { id: key, source: a, target: b, weight: 0, movies: [] }));
          e.weight++;
          e.movies.push(mid);
        }
    }
    const neighbors = new Map([...nodes].map((n) => [n, new Set()]));
    for (const e of edges.values()) {
      neighbors.get(e.source).add(e.target);
      neighbors.get(e.target).add(e.source);
    }
    return { nodes: [...nodes], edges: [...edges.values()], neighbors };
  };

  // Turns the timeline + edits into the network that is displayed.
  MN.derive = function (D, st) {
    const base = new Set(
      st.cleared ? [] : D.movies
        .filter((m) => (st.phase != null ? m.phase === st.phase : m.year >= st.y0 && m.year <= st.y1))
        .map((m) => m.id)
    );
    const pool = new Set([...base, ...st.addedMovies]);
    const active = D.movies.filter((m) => pool.has(m.id) && !st.removedMovies.has(m.id)).map((m) => m.id);

    // A character is shown if one of their movies is in the selected period (or was added),
    // even when that movie was later removed: they then stay on screen as an isolated node.
    const visible = new Set();
    for (const mid of pool) for (const c of D.cast.get(mid)) if (!st.removedChars.has(c)) visible.add(c);
    for (const c of st.addedChars) if (!st.removedChars.has(c) && D.charsById.has(c)) visible.add(c);

    const castOf = (mid) =>
      D.cast.get(mid).filter((c) => visible.has(c) && !(st.castEdits[mid] && st.castEdits[mid].has(c)));
    const removedFrom = (mid) =>
      D.cast.get(mid).filter((c) => visible.has(c) && st.castEdits[mid] && st.castEdits[mid].has(c));

    const g = MN.buildGraph(D, active, castOf, visible);
    return Object.assign(g, { base, pool, active, visible, castOf, removedFrom });
  };

  // ---------- saved networks (this browser only) ----------

  const SAVES = 'marvel-network-saves';
  const COUNTER = 'marvel-network-save-counter';

  MN.readSaves = function () {
    try {
      return JSON.parse(localStorage.getItem(SAVES) || '[]');
    } catch (e) {
      return [];
    }
  };
  MN.writeSaves = function (list) {
    try {
      localStorage.setItem(SAVES, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  };
  MN.addSave = function (save) {
    const list = MN.readSaves();
    let counter = 0;
    try {
      counter = +localStorage.getItem(COUNTER) || 0;
    } catch (e) {}
    counter = Math.max(counter, ...list.map((s) => s.num), 0) + 1;
    save.num = counter;
    save.savedAt = new Date().toISOString();
    list.push(save);
    if (!MN.writeSaves(list)) return null;
    try {
      localStorage.setItem(COUNTER, String(counter));
    } catch (e) {}
    return counter;
  };
  MN.deleteSave = function (num) {
    MN.writeSaves(MN.readSaves().filter((s) => s.num !== num));
  };

  // Edge thickness: 1px for one movie, +1.1px per extra movie, capped at 9px.
  MN.edgeWidth = (w) => Math.min(9, 1 + (w - 1) * 1.1);
})();
