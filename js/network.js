/* Network page: graph, timeline, measurements and editing mode. */
(async function () {
  const D = await MN.loadData();
  let st = MN.freshState(D);
  let current = null; // derived network currently on screen (full state)
  let shownGraph = null; // graph actually drawn (differs from `current` during play)
  let editingMovie = null;
  let playTimers = [];

  const R = 20; // node radius
  const EXT_ICON =
    '<svg class="ext" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 2H2v8h8V7"/><path d="M7 1.5h3.5V5"/><path d="M10.5 1.5 5.5 6.5"/></svg>';

  // ======================================================================
  // hover boxes
  // ======================================================================
  const tip = document.getElementById('tip');
  let hideTimer = null;

  function showTip(html, x, y, url) {
    clearTimeout(hideTimer);
    tip.innerHTML = html;
    tip.classList.add('show');
    tip.classList.toggle('clickable', !!url);
    tip.onclick = url ? () => window.open(url, '_blank', 'noopener') : null;
    tip.style.left = '0px';
    tip.style.top = '0px';
    const b = tip.getBoundingClientRect();
    const gap = 11;
    const above = y - b.height - gap >= 4;
    const top = above ? y - b.height - gap : y + gap;
    const left = Math.max(6, Math.min(window.innerWidth - b.width - 6, x - b.width / 2));
    tip.classList.toggle('below', !above);
    tip.style.setProperty('--px', Math.max(12, Math.min(b.width - 12, x - left)) + 'px');
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTipSoon(ms = 220) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => tip.classList.remove('show'), ms);
  }
  function hideTipNow() {
    clearTimeout(hideTimer);
    tip.classList.remove('show');
  }
  tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tip.addEventListener('mouseleave', () => hideTipSoon(120));

  // ======================================================================
  // graph
  // ======================================================================
  const area = document.getElementById('graph-area');
  const svg = d3.select('#graph');
  svg.append('defs')
    .append('clipPath')
    .attr('id', 'face-clip')
    .attr('clipPathUnits', 'objectBoundingBox')
    .append('circle')
    .attr('cx', 0.5)
    .attr('cy', 0.5)
    .attr('r', 0.5);
  const gZoom = svg.append('g');
  const gLinks = gZoom.append('g');
  const gHits = gZoom.append('g');
  const gNodes = gZoom.append('g');

  // zoom: mouse wheel / trackpad, drag the background to move around, or the buttons
  let zt = d3.zoomIdentity;
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 6])
    .on('zoom', (ev) => {
      zt = ev.transform;
      gZoom.attr('transform', zt);
      if (ev.sourceEvent) hideTipNow();
    });
  svg.call(zoom).on('dblclick.zoom', null);
  document.getElementById('zoom-in').addEventListener('click', () => zoom.scaleBy(svg, 1.5));
  document.getElementById('zoom-out').addEventListener('click', () => zoom.scaleBy(svg, 1 / 1.5));
  document.getElementById('zoom-reset').addEventListener('click', () => zoom.transform(svg, d3.zoomIdentity));

  const nodeObjs = new Map(); // id -> persistent {id, x, y, vx, vy}
  let W = area.clientWidth, H = area.clientHeight;
  let hovered = null;
  const pickedIds = []; // characters selected in [characters add/remove]

  const M = 10; // margin between nodes and the edge of the network area
  const clampX = (x) => Math.max(R + M, Math.min(W - R - M, x));
  const clampY = (y) => Math.max(R + M, Math.min(H - R - M, y));
  // keep nodes off the legend (top-left) and the zoom / clustering controls (bottom-left)
  const legendEl = area.querySelector('.legend');
  const ctrlEl = area.querySelector('.zoom-ctrl');
  const keepOffLegend = (n) => {
    const lw = legendEl.offsetLeft + legendEl.offsetWidth + R, lh = legendEl.offsetTop + legendEl.offsetHeight + R;
    if (n.x < lw && n.y < lh) {
      if (lw - n.x < lh - n.y) n.x = lw; else n.y = lh;
    }
    const cw = ctrlEl.offsetLeft + ctrlEl.offsetWidth + R + 6, ct = ctrlEl.offsetTop - R - 6;
    if (n.x < cw && n.y > ct) {
      if (cw - n.x < n.y - ct) n.x = cw; else n.y = ct;
    }
  };

  // [clustering] slider: 0 = spread out, 1 = tightly clustered (layout only)
  const linkDistance = (t) => 150 - 110 * t;
  const chargeStrength = (t) => -(420 - 340 * t);
  const clusterInput = document.getElementById('cluster');
  let clusterT = +clusterInput.value / 100;

  const sim = d3
    .forceSimulation()
    .velocityDecay(0.5)
    .force('link', d3.forceLink().id((d) => d.id).distance(linkDistance(clusterT)))
    .force('charge', d3.forceManyBody().strength(chargeStrength(clusterT)).distanceMax(450))
    .force('collide', d3.forceCollide(R + 7))
    .force('x', d3.forceX(W / 2).strength(0.06))
    .force('y', d3.forceY(H / 2).strength(0.08))
    .on('tick', ticked)
    .stop();

  clusterInput.addEventListener('input', () => {
    clusterT = +clusterInput.value / 100;
    sim.force('link').distance(linkDistance(clusterT));
    sim.force('charge').strength(chargeStrength(clusterT));
    sim.alpha(0.5).restart();
  });

  function ticked() {
    for (const n of sim.nodes()) {
      n.x = clampX(n.x);
      n.y = clampY(n.y);
      if (n.fx == null) keepOffLegend(n);
    }
    gLinks.selectAll('line').attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    gHits.selectAll('line').attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    gNodes.selectAll('g.node').attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  // Draws a graph. Existing nodes keep their positions; new ones start near their neighbours.
  function draw(graph, { alpha = 0.25, settle = false, frozen = false } = {}) {
    shownGraph = graph;
    const onScreen = new Set(sim.nodes().map((n) => n.id));
    const nodes = graph.nodes.map((id) => {
      let o = nodeObjs.get(id);
      if (!o) nodeObjs.set(id, (o = { id }));
      if (!onScreen.has(id) && !frozen) {
        const nb = [...(graph.neighbors.get(id) || [])].map((x) => nodeObjs.get(x)).filter((p) => p && onScreen.has(p.id));
        if (nb.length) {
          o.x = d3.mean(nb, (p) => p.x) + (Math.random() - 0.5) * 50;
          o.y = d3.mean(nb, (p) => p.y) + (Math.random() - 0.5) * 50;
        } else if (o.x == null) {
          o.x = W / 2 + (Math.random() - 0.5) * W * 0.6;
          o.y = H / 2 + (Math.random() - 0.5) * H * 0.6;
        }
        o.vx = o.vy = 0;
      }
      o.x = clampX(o.x);
      o.y = clampY(o.y);
      return o;
    });
    const links = graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, weight: e.weight, movies: e.movies }));

    gLinks
      .selectAll('line')
      .data(links, (d) => d.id)
      .join('line')
      .attr('class', 'link')
      .attr('stroke-width', (d) => MN.edgeWidth(d.weight));

    gHits
      .selectAll('line')
      .data(links, (d) => d.id)
      .join('line')
      .attr('class', 'link-hit')
      .on('mouseenter mousemove', (ev, d) => {
        if (dragging) return;
        const lines = d.movies
          .map((mid) => D.moviesById.get(mid))
          .map((m) => `<div class="movie-line">${MN.esc(m.title)} (${m.year})</div>`)
          .join('');
        showTip(lines, ev.clientX, ev.clientY - 2);
      })
      .on('mouseleave', () => hideTipSoon(80));

    const sel = gNodes
      .selectAll('g.node')
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'node');
        g.append('circle').attr('class', 'node-ring').attr('r', R);
        g.append('image')
          .attr('x', -R)
          .attr('y', -R)
          .attr('width', 2 * R)
          .attr('height', 2 * R)
          .attr('clip-path', 'url(#face-clip)')
          .attr('href', (d) => MN.faceUrl(D.charsById.get(d.id)))
          .on('error', function (ev, d) {
            const full = MN.fullImageUrl(D.charsById.get(d.id));
            if (this.getAttribute('href') !== full) this.setAttribute('href', full);
          });
        g.append('circle').attr('class', 'node-ring').attr('r', R).attr('fill', 'none').style('fill', 'none');
        g.append('circle').attr('class', 'pick-ring').attr('r', R + 3);
        return g;
      });

    sel.on('mouseenter', (ev, d) => {
      if (dragging) return;
      hovered = d.id;
      applyHighlight();
      const c = D.charsById.get(d.id);
      const box = area.getBoundingClientRect();
      showTip(
        `<span class="tip-name">${MN.esc(MN.displayName(c))}</span>${EXT_ICON}`,
        box.left + zt.applyX(d.x),
        box.top + zt.applyY(d.y) - R * zt.k - 1,
        c.url
      );
    })
      .on('click', (ev, d) => {
        if (ev.defaultPrevented) return; // was a drag
        charSearch.pickFromNetwork(d.id);
      })
      .on('mouseleave', () => {
        hovered = null;
        applyHighlight();
        hideTipSoon();
      })
      .call(dragBehaviour)
      .classed('picked', (d) => pickedIds.includes(d.id));

    sim.nodes(nodes);
    sim.force('link').links(links);
    if (frozen) {
      sim.stop();
      ticked();
    } else if (settle) {
      sim.alpha(1);
      for (let i = 0; i < 320; i++) sim.tick();
      sim.stop();
      ticked();
    } else {
      sim.alpha(alpha).restart();
    }
    applyHighlight();
  }

  function applyHighlight() {
    if (!hovered || !shownGraph || !shownGraph.neighbors.has(hovered)) {
      gNodes.selectAll('g.node').classed('faded', false);
      gLinks.selectAll('line').classed('faded', false);
      return;
    }
    const keep = new Set([hovered, ...shownGraph.neighbors.get(hovered)]);
    gNodes.selectAll('g.node').classed('faded', (d) => !keep.has(d.id));
    gLinks.selectAll('line').classed('faded', (d) => d.source.id !== hovered && d.target.id !== hovered);
  }

  let dragging = false;
  const dragBehaviour = d3
    .drag()
    .on('start', (ev, d) => {
      dragging = true;
      hideTipNow();
      if (!ev.active) sim.alphaTarget(0.15).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (ev, d) => {
      d.fx = clampX(ev.x);
      d.fy = clampY(ev.y);
    })
    .on('end', (ev, d) => {
      dragging = false;
      if (!ev.active) sim.alphaTarget(0);
      d.x = d.fx;
      d.y = d.fy;
      d.fx = null;
      d.fy = null;
    });

  new ResizeObserver(() => {
    const nw = area.clientWidth, nh = area.clientHeight;
    if (!nw || !nh || (nw === W && nh === H)) return;
    W = nw;
    H = nh;
    sim.force('x').x(W / 2);
    sim.force('y').y(H / 2);
    for (const n of sim.nodes()) { n.x = clampX(n.x); n.y = clampY(n.y); }
    ticked();
    sim.alpha(0.1).restart();
    drawSlider();
  }).observe(area);

  // ======================================================================
  // timeline
  // ======================================================================
  const slider = d3.select('#slider');
  const SP = 14; // horizontal padding inside the slider
  const yearX = (y) => {
    const w = slider.node().clientWidth;
    return SP + ((y - D.minYear) / Math.max(1, D.maxYear - D.minYear)) * (w - 2 * SP);
  };
  const xYear = (x) => {
    const w = slider.node().clientWidth;
    const t = (x - SP) / (w - 2 * SP);
    return Math.max(D.minYear, Math.min(D.maxYear, Math.round(D.minYear + t * (D.maxYear - D.minYear))));
  };
  const starPath = (() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4.4 : 10.5, a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return 'M' + pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join('L') + 'Z';
  })();

  slider.append('defs').html(
    '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1"/></pattern>'
  );
  const TRACK_Y = 26, TRACK_H = 10;
  const sTrack = slider.append('rect').attr('y', TRACK_Y).attr('height', TRACK_H).attr('fill', '#fff').attr('stroke', '#000').attr('stroke-width', 1).attr('shape-rendering', 'crispEdges');
  const sHatch = slider.append('rect').attr('y', TRACK_Y).attr('height', TRACK_H).attr('fill', 'url(#hatch)').attr('stroke', '#000').attr('stroke-width', 1).attr('shape-rendering', 'crispEdges');
  const sMin = slider.append('text').attr('y', 56).text(D.minYear);
  const sMax = slider.append('text').attr('y', 56).attr('text-anchor', 'end').text(D.maxYear);
  const sYear0 = slider.append('text').attr('y', 11).attr('text-anchor', 'middle');
  const sYear1 = slider.append('text').attr('y', 11).attr('text-anchor', 'middle');
  const blue = slider.append('path').attr('class', 'star').attr('d', starPath).attr('fill', '#0000EE');
  const red = slider.append('path').attr('class', 'star').attr('d', starPath).attr('fill', '#E00000');

  function drawSlider() {
    const w = slider.node().clientWidth;
    sTrack.attr('x', SP).attr('width', Math.max(0, w - 2 * SP));
    sMin.attr('x', SP - 6);
    sMax.attr('x', w - SP + 6);
    const x0 = yearX(st.y0), x1 = yearX(st.y1);
    sHatch.attr('x', x0).attr('width', Math.max(0, x1 - x0));
    blue.attr('transform', `translate(${x0},${TRACK_Y + TRACK_H / 2})`);
    red.attr('transform', `translate(${x1},${TRACK_Y + TRACK_H / 2})`);
    // year above each star (hidden at the ends, where the 2008 / 2026 labels already show it)
    const lab = (y) => (y === D.minYear || y === D.maxYear ? '' : y);
    if (st.y0 === st.y1) {
      sYear0.attr('x', x0).text(st.y0);
      sYear1.text('');
    } else {
      const close = x1 - x0 < 44;
      sYear0.attr('x', x0 - (close ? 18 : 0)).text(lab(st.y0));
      sYear1.attr('x', x1 + (close ? 18 : 0)).text(lab(st.y1));
    }
  }

  // drag the stars
  let dragStar = null, dragStartX = 0;
  slider.on('pointerdown', (ev) => {
    const [x] = d3.pointer(ev);
    const x0 = yearX(st.y0), x1 = yearX(st.y1);
    const d0 = Math.abs(x - x0), d1 = Math.abs(x - x1);
    if (Math.min(d0, d1) > 16) return;
    dragStar = d0 === d1 ? 'tie' : d0 < d1 ? 'blue' : 'red';
    dragStartX = x;
    slider.node().setPointerCapture(ev.pointerId);
  });
  slider.on('pointermove', (ev) => {
    if (!dragStar) return;
    const [x] = d3.pointer(ev);
    if (dragStar === 'tie') {
      if (Math.abs(x - dragStartX) < 2) return;
      dragStar = x < dragStartX ? 'blue' : 'red';
    }
    const y = xYear(x);
    let y0 = st.y0, y1 = st.y1;
    if (dragStar === 'blue') y0 = Math.min(y, st.y1);
    else y1 = Math.max(y, st.y0);
    if (y0 !== st.y0 || y1 !== st.y1 || st.phase != null) {
      st.y0 = y0;
      st.y1 = y1;
      st.phase = null; // moving a star clears the phase
      update();
    }
  });
  const endStarDrag = () => (dragStar = null);
  slider.on('pointerup', endStarDrag).on('pointercancel', endStarDrag);

  // phases
  const phasesEl = document.getElementById('phases');
  phasesEl.innerHTML = D.phases.map((p) => `<button class="tbtn" data-phase="${p}">[${p}]</button>`).join('');
  phasesEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-phase]');
    if (!b) return;
    const p = +b.dataset.phase;
    if (st.phase === p) {
      st.phase = null; // clicking the selected phase again un-selects it
    } else {
      const ys = D.movies.filter((m) => m.phase === p).map((m) => m.year);
      st.phase = p;
      st.y0 = Math.min(...ys);
      st.y1 = Math.max(...ys);
    }
    update();
  });

  // play
  document.getElementById('play').addEventListener('click', play);
  function stopPlay() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
  }
  function play() {
    stopPlay();
    hideTipNow();
    const full = MN.derive(D, st);
    const empty = { nodes: [], edges: [], neighbors: new Map() };
    draw(empty);
    renderMetrics(empty);
    const frames = full.active.map((_, k) => {
      if (k === full.active.length - 1) return full;
      return MN.buildGraph(D, full.active.slice(0, k + 1), full.castOf);
    });
    if (!frames.length) frames.push(full);
    frames.forEach((g, k) => {
      playTimers.push(
        setTimeout(() => {
          draw(g, { alpha: 0.2 });
          renderMetrics(g);
          if (k === frames.length - 1) playTimers = [];
        }, 600 + k * 1000)
      );
    });
  }

  // reset timeline: whole range, full network
  document.getElementById('treset').addEventListener('click', () => {
    st.y0 = D.minYear;
    st.y1 = D.maxYear;
    st.phase = null;
    MN.clearEdits(st);
    editingMovie = null;
    update();
  });

  // ======================================================================
  // measurements
  // ======================================================================
  const measuresEl = document.getElementById('measures');
  measuresEl.innerHTML = MN.METRICS.map(
    (m, i) =>
      `<div class="row"></div><div class="row item"><span class="label" data-i="${i}">${MN.esc(m.label)}</span>: <span class="val" data-key="${m.key}">—</span></div>`
  ).join('');
  measuresEl.querySelectorAll('.label').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const m = MN.METRICS[+el.dataset.i];
      const r = el.getBoundingClientRect();
      showTip(`<div>${MN.esc(m.def)}</div><div class="formula">${MN.esc(m.formula)}</div>`, r.left + Math.min(r.width / 2, 40), r.top - 1);
    });
    el.addEventListener('mouseleave', () => hideTipSoon(60));
  });

  function renderMetrics(graph) {
    const vals = MN.computeMetrics(graph);
    for (const m of MN.METRICS) {
      measuresEl.querySelector(`[data-key="${m.key}"]`).textContent = MN.formatMetric(m, vals[m.key]);
    }
  }

  // ======================================================================
  // editing mode
  // ======================================================================
  document.getElementById('ereset').addEventListener('click', () => {
    MN.clearEdits(st);
    editingMovie = null;
    update();
  });

  document.getElementById('erandom').addEventListener('click', () => {
    // characters of the current period (selected timeline / phase)
    const base = MN.derive(D, Object.assign(MN.deserializeState({}), { y0: st.y0, y1: st.y1, phase: st.phase }));
    const pool = d3.shuffle([...base.visible]);
    const N = pool.length;
    if (!N) return;
    const lo = Math.min(N, 5);
    const size = lo + Math.floor(Math.random() * (N - lo + 1));
    const keep = new Set(pool.slice(0, size));
    MN.clearEdits(st);
    pool.forEach((c) => { if (!keep.has(c)) st.removedChars.add(c); });
    editingMovie = null;
    update();
  });

  document.getElementById('eclear').addEventListener('click', () => {
    MN.clearEdits(st);
    st.cleared = true;
    editingMovie = null;
    update();
  });

  const saveBtn = document.getElementById('esave');
  saveBtn.addEventListener('click', () => {
    const positions = {};
    for (const n of sim.nodes()) positions[n.id] = [+(n.x / W).toFixed(4), +(n.y / H).toFixed(4)];
    const num = MN.addSave({ state: MN.serializeState(st), positions, area: [W, H] });
    saveBtn.textContent = num ? `[saved as #${num}]` : '[could not save]';
    setTimeout(() => (saveBtn.textContent = '[save]'), 1800);
  });

  // ---------- search boxes ----------
  function setupSearch(rootId, cfg) {
    const root = document.getElementById(rootId);
    const input = root.querySelector('input');
    const results = root.querySelector('.results');
    const addBtn = root.querySelector('[data-act="add"]');
    const remBtn = root.querySelector('[data-act="remove"]');
    let selIndex = -1;
    let list = [];

    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

    function exact() {
      const q = norm(input.value);
      return q ? cfg.items().find((it) => norm(cfg.label(it)) === q || cfg.alt(it).some((a) => norm(a) === q)) : null;
    }
    function refreshButtons() {
      const it = exact();
      if (!it) {
        addBtn.disabled = remBtn.disabled = true;
        return;
      }
      const inNet = cfg.inNetwork(it);
      addBtn.disabled = inNet;
      remBtn.disabled = !inNet;
    }
    function renderResults() {
      const q = norm(input.value);
      if (!q) {
        results.classList.remove('open');
        return;
      }
      list = cfg.items().filter((it) => [cfg.label(it), ...cfg.alt(it)].some((s) => norm(s).includes(q)));
      selIndex = -1;
      results.innerHTML = list.length
        ? list
            .map(
              (it, i) =>
                `<div class="result" data-i="${i}"><div class="r1">${MN.esc(cfg.line1(it))}</div><div class="r2">${MN.esc(cfg.line2(it))}</div></div>`
            )
            .join('')
        : '<div class="no-result">no results</div>';
      results.classList.add('open');
    }
    function choose(i) {
      input.value = cfg.label(list[i]);
      results.classList.remove('open');
      refreshButtons();
    }
    input.addEventListener('input', () => {
      renderResults();
      refreshButtons();
    });
    input.addEventListener('focus', () => input.value && renderResults());
    input.addEventListener('keydown', (ev) => {
      const items = results.querySelectorAll('.result');
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!items.length) return;
        ev.preventDefault();
        selIndex = (selIndex + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('sel', i === selIndex));
        items[selIndex].scrollIntoView({ block: 'nearest' });
      } else if (ev.key === 'Enter') {
        if (results.classList.contains('open') && list.length) choose(selIndex >= 0 ? selIndex : 0);
      } else if (ev.key === 'Escape') {
        results.classList.remove('open');
      }
    });
    results.addEventListener('mousedown', (ev) => {
      const r = ev.target.closest('.result');
      if (!r) return;
      ev.preventDefault();
      choose(+r.dataset.i);
    });
    input.addEventListener('blur', () => setTimeout(() => results.classList.remove('open'), 100));
    addBtn.addEventListener('click', () => {
      const it = exact();
      if (it) { cfg.add(it); update(); }
    });
    remBtn.addEventListener('click', () => {
      const it = exact();
      if (it) { cfg.remove(it); update(); }
    });
    return { refreshButtons };
  }

  const movieSearch = setupSearch('movie-search', {
    items: () => D.movies,
    label: (m) => m.title,
    alt: () => [],
    line1: (m) => `${m.title} (${m.year})`,
    line2: (m) => D.cast.get(m.id).map((c) => MN.displayName(D.charsById.get(c))).join(', '),
    inNetwork: (m) => current.active.includes(m.id),
    add: (m) => {
      st.removedMovies.delete(m.id);
      if (!current.base.has(m.id)) st.addedMovies.add(m.id);
    },
    remove: (m) => {
      st.addedMovies.delete(m.id);
      if (current.base.has(m.id)) st.removedMovies.add(m.id);
      if (editingMovie === m.id) editingMovie = null;
    },
  });

  // Characters: several can be selected at once (from the search results or by clicking
  // their picture in the network), then added or removed together.
  const charSearch = (function () {
    const root = document.getElementById('char-search');
    const input = root.querySelector('input');
    const chipsEl = root.querySelector('.chips');
    const results = root.querySelector('.results');
    const addBtn = root.querySelector('[data-act="add"]');
    const remBtn = root.querySelector('[data-act="remove"]');
    const picked = pickedIds; // character ids, in selection order
    let list = [];
    let selIndex = -1;

    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const inNet = (id) => current.visible.has(id);

    function refresh() {
      chipsEl.innerHTML = picked
        .map((id) => `<span class="chip">${MN.esc(MN.displayName(D.charsById.get(id)))}<span class="x" data-unpick="${id}" title="unselect">×</span></span>`)
        .join('');
      input.placeholder = picked.length ? '' : 'search characters, or click their pictures';
      addBtn.disabled = !picked.some((id) => !inNet(id));
      remBtn.disabled = !picked.some((id) => inNet(id));
      gNodes.selectAll('g.node').classed('picked', (d) => picked.includes(d.id));
    }
    function toggle(id) {
      const i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1);
      else picked.push(id);
      refresh();
    }
    function renderResults() {
      const q = norm(input.value);
      if (!q) {
        results.classList.remove('open');
        return;
      }
      list = D.chars.filter((c) => [MN.displayName(c), c.name, c.alias].some((s) => s && norm(s).includes(q)));
      selIndex = -1;
      results.innerHTML = list.length
        ? list
            .map((c, i) => {
              const movies = D.charMovies.get(c.id).map((m) => D.moviesById.get(m).title).join(', ') || '(no movies)';
              const mark = picked.includes(c.id) ? '[x] ' : '[ ] ';
              return `<div class="result" data-i="${i}"><div class="r1">${mark}${MN.esc(MN.displayName(c))}</div><div class="r2">${MN.esc(movies)}</div></div>`;
            })
            .join('')
        : '<div class="no-result">no results</div>';
      results.classList.add('open');
    }
    function choose(i) {
      toggle(list[i].id);
      input.value = '';
      results.classList.remove('open');
      input.focus();
    }

    input.addEventListener('input', renderResults);
    input.addEventListener('focus', () => input.value && renderResults());
    input.addEventListener('blur', () => setTimeout(() => results.classList.remove('open'), 100));
    input.addEventListener('keydown', (ev) => {
      const items = results.querySelectorAll('.result');
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!items.length) return;
        ev.preventDefault();
        selIndex = (selIndex + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('sel', i === selIndex));
        items[selIndex].scrollIntoView({ block: 'nearest' });
      } else if (ev.key === 'Enter') {
        if (results.classList.contains('open') && list.length) choose(selIndex >= 0 ? selIndex : 0);
      } else if (ev.key === 'Escape') {
        results.classList.remove('open');
      } else if (ev.key === 'Backspace' && !input.value && picked.length) {
        picked.pop();
        refresh();
      }
    });
    results.addEventListener('mousedown', (ev) => {
      const r = ev.target.closest('.result');
      if (!r) return;
      ev.preventDefault();
      choose(+r.dataset.i);
    });
    chipsEl.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-unpick]');
      if (x) toggle(x.dataset.unpick);
    });
    root.querySelector('.chipbox').addEventListener('mousedown', (ev) => {
      if (ev.target.classList.contains('chipbox') || ev.target === chipsEl) {
        ev.preventDefault();
        input.focus();
      }
    });
    addBtn.addEventListener('click', () => {
      for (const id of picked.filter((id) => !inNet(id))) {
        st.removedChars.delete(id);
        st.addedChars.add(id);
      }
      picked.length = 0;
      update();
    });
    remBtn.addEventListener('click', () => {
      for (const id of picked.filter((id) => inNet(id))) {
        st.addedChars.delete(id);
        st.removedChars.add(id);
      }
      picked.length = 0;
      update();
    });

    return {
      refreshButtons: refresh,
      pickFromNetwork(id) {
        toggle(id);
        root.scrollIntoView({ block: 'nearest' });
      },
    };
  })();

  // ---------- (currently shown) ----------
  const shownEl = document.getElementById('shown');

  function renderShown() {
    if (editingMovie && !current.active.includes(editingMovie)) editingMovie = null;
    if (!current.active.length) {
      shownEl.innerHTML = st.cleared
        ? '<div class="empty-note">the network is empty. add movies with [movies add/remove] above.</div>'
        : '<div class="empty-note">no movies in the network</div>';
      return;
    }
    shownEl.innerHTML = current.active
      .map((mid) => {
        const m = D.moviesById.get(mid);
        const ed = editingMovie === mid;
        const on = current.castOf(mid).map((c) => {
          const name = MN.esc(MN.displayName(D.charsById.get(c)));
          return `<span class="tag">${name}${ed ? `<span class="x" data-rm="${c}" title="remove from this movie">×</span>` : ''}</span>`;
        });
        const off = ed
          ? current.removedFrom(mid).map((c) => {
              const name = MN.esc(MN.displayName(D.charsById.get(c)));
              return `<span class="tag off">${name}<span class="x" data-add="${c}" title="put back in this movie">+</span></span>`;
            })
          : [];
        return `<div class="movie-box${ed ? ' editing' : ''}" data-mid="${mid}">
          <div class="title">${MN.esc(m.title)}</div>
          <div class="date">${MN.fmtDate(m.date)}</div>
          ${ed ? '<div class="edit-note">editing: × removes a character from this movie, + puts them back. double click to finish.</div>' : ''}
          <div class="tags">${on.join('') || (ed ? '' : '<span class="empty-note">(no characters)</span>')}${off.join('')}</div>
        </div>`;
      })
      .join('');
  }

  shownEl.addEventListener('dblclick', (ev) => {
    const box = ev.target.closest('.movie-box');
    if (!box) return;
    window.getSelection().removeAllRanges();
    editingMovie = editingMovie === box.dataset.mid ? null : box.dataset.mid;
    renderShown();
  });
  shownEl.addEventListener('click', (ev) => {
    const x = ev.target.closest('.x');
    if (!x) return;
    const mid = x.closest('.movie-box').dataset.mid;
    if (x.dataset.rm) {
      (st.castEdits[mid] = st.castEdits[mid] || new Set()).add(x.dataset.rm);
    } else if (x.dataset.add) {
      st.castEdits[mid].delete(x.dataset.add);
      if (!st.castEdits[mid].size) delete st.castEdits[mid];
    }
    update();
  });

  // ======================================================================
  // update cycle
  // ======================================================================
  function update(opts = {}) {
    stopPlay();
    current = MN.derive(D, st);
    draw(current, opts);
    drawSlider();
    phasesEl.querySelectorAll('[data-phase]').forEach((b) => b.classList.toggle('active', +b.dataset.phase === st.phase));
    renderMetrics(current);
    movieSearch.refreshButtons();
    charSearch.refreshButtons();
    renderShown();
  }

  // ---------- open a saved network (from the Saved networks page) ----------
  const openNum = +new URLSearchParams(location.search).get('open');
  const save = openNum ? MN.readSaves().find((s) => s.num === openNum) : null;
  if (save) {
    st = MN.deserializeState(save.state);
    for (const [id, [fx, fy]] of Object.entries(save.positions || {})) nodeObjs.set(id, { id, x: fx * W, y: fy * H });
    current = MN.derive(D, st);
    const allPlaced = current.nodes.every((id) => nodeObjs.has(id));
    update(allPlaced ? { frozen: true } : { alpha: 0.2 });
    history.replaceState(null, '', location.pathname);
  } else {
    update({ settle: true });
  }
})();
