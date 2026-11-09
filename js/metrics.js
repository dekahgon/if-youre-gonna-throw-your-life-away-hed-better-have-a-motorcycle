/* Weighted network measurements.
   Edge weight w_ij = number of movies shared. Distance-based metrics use edge length 1 / w_ij.

   To add a metric, append an entry to MN.METRICS with
   { key, label, def, formula, compute(ctx) } — compute returns a number, or null to show "—". */
(function () {
  const MN = (window.MN = window.MN || {});

  // ---------- graph helpers ----------

  // nodes: array of ids; edges: [{source, target, weight}] (ids)
  function makeGraph(nodes, edges) {
    const idx = new Map(nodes.map((id, i) => [id, i]));
    const adj = nodes.map(() => new Map());
    let m = 0;
    for (const e of edges) {
      const a = idx.get(typeof e.source === 'object' ? e.source.id : e.source);
      const b = idx.get(typeof e.target === 'object' ? e.target.id : e.target);
      if (a == null || b == null || a === b || adj[a].has(b)) continue;
      adj[a].set(b, e.weight);
      adj[b].set(a, e.weight);
      m++;
    }
    return { n: nodes.length, m, adj };
  }

  // adjacency-list graph from a subset of node indices
  function subgraph(G, list) {
    const map = new Map(list.map((v, i) => [v, i]));
    const adj = list.map(() => new Map());
    let m = 0;
    list.forEach((v, i) => {
      for (const [u, w] of G.adj[v]) {
        const j = map.get(u);
        if (j != null && !adj[i].has(j)) {
          adj[i].set(j, w);
          adj[j].set(i, w);
          m++;
        }
      }
    });
    return { n: list.length, m, adj };
  }

  // Dijkstra with edge length 1/w (O(n²); n is small)
  function dijkstra(G, s) {
    const n = G.n;
    const dist = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    dist[s] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of G.adj[u]) {
        const nd = best + 1 / w;
        if (nd < dist[v] - 1e-12) dist[v] = nd;
      }
    }
    return dist;
  }

  function allPairs(G) {
    if (!G._dist) G._dist = G.adj.map((_, i) => dijkstra(G, i));
    return G._dist;
  }

  function components(G) {
    const seen = new Uint8Array(G.n);
    const comps = [];
    for (let s = 0; s < G.n; s++) {
      if (seen[s]) continue;
      const comp = [s];
      seen[s] = 1;
      for (let k = 0; k < comp.length; k++)
        for (const v of G.adj[comp[k]].keys()) if (!seen[v]) { seen[v] = 1; comp.push(v); }
      comps.push(comp);
    }
    return comps;
  }

  // ---------- measures ----------

  // Weighted clustering (Onnela et al.), weights normalised by the maximum weight.
  function clustering(G) {
    if (G.n === 0) return null;
    let maxw = 0;
    for (const a of G.adj) for (const w of a.values()) maxw = Math.max(maxw, w);
    if (maxw === 0) return 0;
    let total = 0;
    for (let i = 0; i < G.n; i++) {
      const nb = [...G.adj[i].keys()];
      const k = nb.length;
      if (k < 2) continue;
      let s = 0;
      for (let a = 0; a < k; a++)
        for (let b = 0; b < k; b++) {
          if (a === b) continue;
          const wjk = G.adj[nb[a]].get(nb[b]);
          if (!wjk) continue;
          s += Math.cbrt((G.adj[i].get(nb[a]) / maxw) * (G.adj[i].get(nb[b]) / maxw) * (wjk / maxw));
        }
      total += s / (k * (k - 1));
    }
    return total / G.n;
  }

  function globalEfficiency(G) {
    if (G.n < 2) return null;
    const D = allPairs(G);
    let s = 0;
    for (let i = 0; i < G.n; i++) for (let j = 0; j < G.n; j++) if (i !== j && isFinite(D[i][j])) s += 1 / D[i][j];
    return s / (G.n * (G.n - 1));
  }

  function localEfficiency(G) {
    if (G.n < 2) return null;
    let s = 0;
    for (let i = 0; i < G.n; i++) {
      const nb = [...G.adj[i].keys()];
      if (nb.length < 2) continue;
      s += globalEfficiency(subgraph(G, nb));
    }
    return s / G.n;
  }

  function largestComponent(G) {
    const comps = components(G);
    return comps.reduce((a, b) => (b.length > a.length ? b : a), []);
  }

  function avgShortestPath(G) {
    const comp = largestComponent(G);
    const nc = comp.length;
    if (nc < 2) return null;
    const H = nc === G.n ? G : subgraph(G, comp);
    const D = allPairs(H);
    let s = 0;
    for (let i = 0; i < nc; i++) for (let j = 0; j < nc; j++) if (i !== j) s += D[i][j];
    return s / (nc * (nc - 1));
  }

  // ---------- small-world coefficient ----------

  function seededRandom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Random graph with the same n and m (G(n, m)), real weights shuffled onto the edges.
  function randomLike(G, weights, rnd) {
    const n = G.n;
    const adj = Array.from({ length: n }, () => new Map());
    const w = weights.slice();
    for (let i = w.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [w[i], w[j]] = [w[j], w[i]];
    }
    let placed = 0;
    while (placed < G.m) {
      const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
      if (a === b || adj[a].has(b)) continue;
      adj[a].set(b, w[placed]);
      adj[b].set(a, w[placed]);
      placed++;
    }
    return { n, m: G.m, adj };
  }

  function sigma(G, ctx) {
    if (G.n < 3 || G.m === 0) return null;
    if ((2 * G.m) / G.n <= 1) return null;
    const C = ctx.get('clustering');
    const L = ctx.get('avg_path');
    if (!C || !L) return null;
    const weights = [];
    G.adj.forEach((a, i) => a.forEach((w, j) => { if (j > i) weights.push(w); }));
    const rnd = seededRandom(ctx.signature);
    let Cr = 0, Lr = 0, nL = 0;
    for (let k = 0; k < 10; k++) {
      const R = randomLike(G, weights, rnd);
      Cr += clustering(R);
      const l = avgShortestPath(R);
      if (l) { Lr += l; nL++; }
    }
    Cr /= 10;
    if (!Cr || !nL) return null;
    Lr /= nL;
    return C / Cr / (L / Lr);
  }

  // ---------- the list shown in [measurements] ----------

  MN.METRICS = [
    {
      key: 'clustering',
      label: 'clustering',
      def: "How often a character's co-stars have also appeared with each other, giving more weight to pairs who share many movies. It averages, over all characters, how strongly the triangles around them are actually filled in.",
      formula: 'C = (1/n) Σ_i [1 / (k_i(k_i − 1))] Σ_{j,k} (ŵ_ij · ŵ_ik · ŵ_jk)^(1/3), ŵ = w / max(w)',
      compute: (c) => clustering(c.G),
    },
    {
      key: 'global_eff',
      label: 'global efficiency',
      def: 'How easily information could travel across the whole network, where strong ties (many shared movies) count as shorter links. It averages the inverse weighted distance between every pair of characters, so unreachable pairs count as 0.',
      formula: 'E_glob = 1/(n(n − 1)) Σ_{i≠j} 1/d_ij, d_ij = shortest path with edge length 1/w',
      compute: (c) => globalEfficiency(c.G),
    },
    {
      key: 'local_eff',
      label: 'local efficiency',
      def: "How well a character's neighbours stay connected, through strong ties, if that character is removed. It is the weighted global efficiency of each character's neighbourhood, averaged over all characters.",
      formula: "E_loc = (1/n) Σ_i E_glob(G_i), G_i = subgraph of i's neighbours",
      compute: (c) => localEfficiency(c.G),
    },
    {
      key: 'nodes',
      label: 'number of nodes',
      int: true,
      def: 'The number of characters currently shown. Isolated characters are included.',
      formula: 'n',
      compute: (c) => c.G.n,
    },
    {
      key: 'edges',
      label: 'number of edges',
      int: true,
      def: 'The number of pairs of characters who share at least one movie. Each pair counts once, however many movies they share.',
      formula: 'm',
      compute: (c) => c.G.m,
    },
    {
      key: 'avg_degree',
      label: 'average degree',
      def: 'The average number of other characters each character has appeared with. Each co-star counts once, however many movies they share.',
      formula: 'k̄ = 2m / n',
      compute: (c) => (c.G.n === 0 ? null : (2 * c.G.m) / c.G.n),
    },
    {
      key: 'density',
      label: 'density',
      def: 'The share of all possible connections that actually exist. 1 means every character has appeared with every other one.',
      formula: 'D = 2m / (n(n − 1))',
      compute: (c) => (c.G.n < 2 ? null : (2 * c.G.m) / (c.G.n * (c.G.n - 1))),
    },
    {
      key: 'avg_path',
      label: 'average shortest path length',
      def: 'The average weighted distance between two characters, where sharing more movies makes a link shorter. It is computed inside the largest connected component, since unreachable pairs have no distance.',
      formula: 'L = 1/(n_c(n_c − 1)) Σ_{i≠j} d_ij, edge length 1/w, over the largest component of n_c nodes',
      compute: (c) => avgShortestPath(c.G),
    },
    {
      key: 'components',
      label: 'number of connected components',
      int: true,
      def: 'How many separate groups the network breaks into. An isolated character counts as a group of its own.',
      formula: 'count of maximal connected subgraphs',
      compute: (c) => components(c.G).length,
    },
    {
      key: 'sigma',
      label: 'small-world coefficient (σ)',
      def: 'Compares the network with random networks of the same size, number of edges and edge weights. A value above 1 means it is a small world: much more clustered than random, with similarly short paths.',
      formula: 'σ = (C / C_r) / (L / L_r), C_r and L_r = averages over 10 random graphs with the same n and m and the real weights shuffled onto the edges (largest component)',
      compute: (c) => sigma(c.G, c),
    },
  ];

  // Computes every metric for a graph {nodes, edges}. Returns {key: number|null}.
  MN.computeMetrics = function (graph) {
    const nodes = [...graph.nodes].sort();
    const G = makeGraph(nodes, graph.edges);
    const signature =
      nodes.join(',') + '#' + graph.edges.map((e) => (e.id || e.source + '|' + e.target) + ':' + e.weight).sort().join(',');
    const cache = new Map();
    const ctx = {
      G,
      signature,
      get(key) {
        if (!cache.has(key)) {
          const def = MN.METRICS.find((d) => d.key === key);
          let v = null;
          try { v = def.compute(ctx); } catch (e) { console.error(e); }
          cache.set(key, v == null || !isFinite(v) ? null : v);
        }
        return cache.get(key);
      },
    };
    const out = {};
    for (const d of MN.METRICS) out[d.key] = ctx.get(d.key);
    return out;
  };

  MN.formatMetric = (def, v) => (v == null ? '—' : def.int ? String(v) : v.toFixed(3));

  // exposed for testing
  MN._metricsInternals = { makeGraph, clustering, globalEfficiency, localEfficiency, avgShortestPath, components };
})();
