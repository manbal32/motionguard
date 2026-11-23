/* The original little golfer, with self-contained paint and a readable on-screen size. */
window.MotionGolfer = (() => {
  const actors = new Set();
  const colors = { ink: '#173c2c', action: '#1c5140', shirt: '#57a27b', paper: '#ffffff' };
  const clamp = (value, min, max) => min <= max ? Math.min(max, Math.max(min, value)) : (min + max) / 2;

  function viewport(svg) {
    const values = String(svg.getAttribute?.('viewBox') ?? '0 0 400 640').trim().split(/[\s,]+/).map(Number);
    const box = values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? values : [0, 0, 400, 640];
    const rect = svg.getBoundingClientRect?.();
    const width = rect?.width > 0 ? rect.width : Number(svg.getAttribute?.('width')) || 340;
    const height = rect?.height > 0 ? rect.height : Number(svg.getAttribute?.('height')) || width * box[3] / box[2];
    // SVG meet fitting can letterbox a tall course inside a shorter mobile panel.
    return { box, height, pixelsPerUnit: Math.min(width / box[2], height / box[3]) };
  }

  function mount(svg) {
    for (const actor of actors) if (actor.root.isConnected === false) actors.delete(actor);
    const ns = svg.namespaceURI || 'http://www.w3.org/2000/svg';
    const add = (tag, attrs, parent) => {
      const element = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
      parent.append(element);
      return element;
    };
    const root = add('g', { 'aria-label': '샷을 치고 공을 따라 걷는 작은 골퍼', role: 'img', id: 'course-golfer', 'data-golfer-layer': 'foreground' }, svg);
    const character = add('g', {}, root);
    add('ellipse', { cx: 0, cy: 1, rx: 17, ry: 6, fill: colors.paper, opacity: .78 }, character);
    add('ellipse', { cx: 0, cy: 1, rx: 15, ry: 4, fill: colors.ink, opacity: .15 }, character);
    const legs = add('g', { stroke: colors.action, 'stroke-width': 7, 'stroke-linecap': 'round' }, character);
    const left = add('line', { x1: -4, y1: -19, x2: -9, y2: -3 }, legs);
    const right = add('line', { x1: 4, y1: -19, x2: 9, y2: -3 }, legs);
    add('path', { d: 'M-10 -36 Q0 -43 10 -36 L8 -18 Q0 -13 -8 -18Z', fill: colors.shirt, stroke: colors.paper, 'stroke-width': .9 }, character);
    add('circle', { cx: 0, cy: -49, r: 11, fill: colors.paper, stroke: colors.action, 'stroke-width': 2 }, character);
    add('path', { d: 'M-12 -49 Q-10 -64 5 -60 Q13 -57 12 -49Z', fill: colors.action, stroke: colors.paper, 'stroke-width': .7 }, character);
    add('rect', { x: 0, y: -52, width: 18, height: 5, rx: 2, fill: colors.action }, character);
    add('circle', { cx: 5, cy: -47, r: 1.5, fill: colors.ink }, character);
    const arms = add('g', { transform: 'translate(0 -34)' }, character);
    add('path', { d: 'M-8 0 Q1 5 12 11', fill: 'none', stroke: colors.paper, 'stroke-width': 6, 'stroke-linecap': 'round' }, arms);
    add('path', { d: 'M8 0 L12 11', fill: 'none', stroke: colors.shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }, arms);
    add('path', { d: 'M12 11 L31 37 L39 35', fill: 'none', stroke: colors.ink, 'stroke-width': 3, 'stroke-linecap': 'round' }, arms);
    let lastPose = null;

    function pose(point, phase = 'ready', progress = 0) {
      lastPose = { point, phase, progress };
      root.dataset.phase = phase;
      root.dataset.x = point[0];
      root.dataset.y = point[1];
      const { box: [x, y, width, height], pixelsPerUnit, height: pixelHeight } = viewport(svg);
      const bodyPixels = Math.max(36, Math.min(56, pixelHeight * .36));
      const scale = bodyPixels / (65 * pixelsPerUnit), padding = 4 / pixelsPerUnit;
      // Keep the full backswing inside the map without changing the real ball or shot coordinates.
      const displayX = clamp(point[0] - 32 * scale, x + 52 * scale + padding, x + width - 58 * scale - padding);
      const displayY = clamp(point[1] - 4 * scale, y + 90 * scale + padding, y + height - 8 * scale - padding);
      root.setAttribute('transform', `translate(${displayX} ${displayY}) scale(${scale})`);
      let angle = 0;
      if (phase === 'putt') angle = Math.sin(progress * Math.PI * 2) * 18;
      if (phase === 'swing') angle = progress < .45 ? -115 * Math.sin(progress / .45 * Math.PI / 2)
        : progress < .7 ? -115 * (1 - (progress - .45) / .25) : 115 * (progress - .7) / .3;
      if (phase === 'follow') angle = 115;
      arms.setAttribute('transform', `translate(0 -34) rotate(${angle})`);
      const stride = phase === 'walk' ? Math.sin(progress * Math.PI * 6) * 5 : 0;
      left.setAttribute('x2', -9 + stride);
      right.setAttribute('x2', 9 - stride);
    }
    actors.add({ root, refresh: () => { if (lastPose) pose(lastPose.point, lastPose.phase, lastPose.progress); } });
    return { pose };
  }

  window.addEventListener?.('resize', () => {
    for (const actor of actors) {
      if (actor.root.isConnected === false) actors.delete(actor);
      else actor.refresh();
    }
  }, { passive: true });
  return { mount };
})();
