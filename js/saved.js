/* Saved networks page: a grid of cards, each with a miniature of the saved network. */
(async function () {
  const D = await MN.loadData();
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function miniature(save) {
    const st = MN.deserializeState(save.state);
    const g = MN.derive(D, st);
    const [AW, AH] = save.area || [900, 800];
    const pos = new Map();
    g.nodes.forEach((id, i) => {
      const p = save.positions && save.positions[id];
      pos.set(id, p ? [p[0] * AW, p[1] * AH] : [AW / 2 + 30 * Math.cos(i), AH / 2 + 30 * Math.sin(i)]);
    });

    const R = 20;
    const svg = el('svg', { class: 'mini', preserveAspectRatio: 'xMidYMid meet' });
    if (g.nodes.length) {
      const xs = [...pos.values()].map((p) => p[0]), ys = [...pos.values()].map((p) => p[1]);
      const pad = R + 8;
      const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
      svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(...xs) + pad - x0} ${Math.max(...ys) + pad - y0}`);
    } else {
      svg.setAttribute('viewBox', `0 0 ${AW} ${AH}`);
    }
    const clipId = 'clip-' + save.num;
    const defs = el('defs', {});
    const cp = el('clipPath', { id: clipId, clipPathUnits: 'objectBoundingBox' });
    cp.appendChild(el('circle', { cx: 0.5, cy: 0.5, r: 0.5 }));
    defs.appendChild(cp);
    svg.appendChild(defs);

    for (const e of g.edges) {
      const [ax, ay] = pos.get(e.source), [bx, by] = pos.get(e.target);
      svg.appendChild(el('line', { class: 'link', x1: ax, y1: ay, x2: bx, y2: by, 'stroke-width': MN.edgeWidth(e.weight), 'stroke-linecap': 'round' }));
    }
    for (const id of g.nodes) {
      const [x, y] = pos.get(id);
      const c = D.charsById.get(id);
      svg.appendChild(el('circle', { cx: x, cy: y, r: R, fill: '#fff', stroke: '#000', 'stroke-width': 1 }));
      const img = el('image', { x: x - R, y: y - R, width: 2 * R, height: 2 * R, 'clip-path': `url(#${clipId})`, href: MN.faceUrl(c) });
      img.addEventListener('error', () => {
        if (img.getAttribute('href') !== MN.fullImageUrl(c)) img.setAttribute('href', MN.fullImageUrl(c));
      }, { once: true });
      svg.appendChild(img);
      svg.appendChild(el('circle', { cx: x, cy: y, r: R, fill: 'none', stroke: '#000', 'stroke-width': 1 }));
    }
    return svg;
  }

  function render() {
    const saves = MN.readSaves().sort((a, b) => a.num - b.num);
    grid.innerHTML = '';
    empty.hidden = saves.length > 0;
    for (const s of saves) {
      const card = document.createElement('div');
      card.className = 'card';
      card.appendChild(miniature(s));
      const foot = document.createElement('div');
      foot.className = 'foot';
      foot.innerHTML = `<div class="title">saved network #${s.num}</div><div class="when">${MN.fmtDate(new Date(s.savedAt))}</div><button class="tbtn del">[delete]</button>`;
      card.appendChild(foot);
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('.del')) return;
        location.href = 'network.html?open=' + s.num;
      });
      foot.querySelector('.del').addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`delete saved network #${s.num}?`)) {
          MN.deleteSave(s.num);
          render();
        }
      });
      grid.appendChild(card);
    }
  }

  render();
})();
