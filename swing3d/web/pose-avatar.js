(() => {
  "use strict";
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const offset = (p, x, y) => [p[0] + x, p[1] + y];

  function anatomy(pose) {
    const neck = mid(pose[11], pose[12]), pelvis = mid(pose[23], pose[24]);
    const span = distance(neck, pelvis);
    const height = Math.max(8, span);
    const up = span > 1 ? [(neck[0] - pelvis[0]) / span, (neck[1] - pelvis[1]) / span] : [0, -1];
    const head = offset(neck, up[0] * height * .42, up[1] * height * .42);
    const face = [pose[0], pose[2], pose[5], pose[7], pose[8]];
    const visible = face.filter(point => point[2] >= .55);
    if (visible.length >= 2) {
      const center = visible.reduce(([x, y], p) => [x + p[0] / visible.length, y + p[1] / visible.length], [0, 0]);
      if (distance(center, head) < height * .55) {
        head[0] = center[0];
        head[1] = center[1];
      }
    }
    const ears = face.slice(3).filter(p => p[2] >= .55);
    const behind = ears.length === 2 ? mid(...ears) : ears[0];
    const direction = behind && face[0][2] >= .55 ? face[0][0] - behind[0] : 0;
    return {head, neck, pelvis, height, facing: Math.abs(direction) > height * .055 ? Math.sign(direction) : 0, up};
  }

  function paint(ctx, pose, colors, alpha = 1) {
    const {head, neck, pelvis, height: h, facing, up} = anatomy(pose);
    const side = [-up[1], up[0]];
    function finish() {
      ctx.fill();
      ctx.stroke();
    }
    function shape(points, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.closePath();
      finish();
    }
    function capsule(a, b, start, end, color) {
      const length = Math.max(.01, distance(a, b));
      const x = (b[1] - a[1]) / length, y = (a[0] - b[0]) / length;
      shape([offset(a, x * start, y * start), offset(b, x * end, y * end),
        offset(b, -x * end, -y * end), offset(a, -x * start, -y * start)], color);
      ellipse(a, start, start, 0, color);
      ellipse(b, end, end, 0, color);
    }
    function ellipse(p, rx, ry, angle, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], rx, ry, angle, 0, 2 * Math.PI);
      finish();
    }
    function limb(right, color) {
      const [hip, knee, ankle, heel, toe] = [23, 25, 27, 29, 31].map(i => pose[i + right]);
      capsule(hip, knee, h * .17, h * .105, color);
      capsule(knee, ankle, h * .105, h * .065, color);
      capsule(ankle, heel, h * .066, h * .063, colors.shoes);
      capsule(heel, toe, h * .073, h * .055, colors.shoes);
    }
    function arm(right, color) {
      const [shoulder, elbow, wrist, hand] = [11, 13, 15, 19].map(i => pose[i + right]);
      capsule(shoulder, elbow, h * .115, h * .072, color);
      capsule(elbow, wrist, h * .075, h * .047, color);
      capsule(wrist, hand, h * .065, h * .06, colors.skin);
    }
    const far = Number(pose[12][2] < pose[11][2]);
    const angle = Math.atan2(up[0], -up[1]);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = h * .025;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const hand = [0, 1].map(i => [pose[15 + i], pose[19 + i]])
      .sort((a, b) => Math.min(...b.map(p => p[2])) - Math.min(...a.map(p => p[2])))[0];
    const [wrist, index] = hand;
    const grip = distance(wrist, index);
    if (grip > 1 && hand.every(point => point[2] >= .45)) {
      const tip = offset(index, (index[0] - wrist[0]) * h * 1.7 / grip,
        (index[1] - wrist[1]) * h * 1.7 / grip);
      capsule(wrist, tip, h * .026, h * .016, colors.shoes);
      ellipse(tip, h * .085, h * .041, Math.atan2(index[1] - wrist[1], index[0] - wrist[0]) + 1,
        colors.near);
    }
    limb(far, colors.far);
    arm(far, colors.far);
    limb(1 - far, colors.near);
    const shoulders = Math.max(h * .25, distance(pose[11], pose[12]) / 2 + h * .1);
    const hips = Math.max(h * .19, distance(pose[23], pose[24]) / 2 + h * .1);
    const along = (p, w, u = 0) => offset(p, side[0] * w + up[0] * u, side[1] * w + up[1] * u);
    const waist = mid(neck, pelvis);
    capsule(neck, head, h * .095, h * .105, colors.skin);
    shape([along(neck,-shoulders), along(neck,shoulders), along(waist,hips * .8),
      along(pelvis,hips), along(pelvis,-hips), along(waist,-hips * .8)], colors.shirt);
    ellipse(pelvis, hips, h * .13, angle, colors.near);
    arm(1 - far, colors.skin);
    ellipse(head, h * .185, h * .235, angle, colors.skin);
    if (facing) {
      const chin = offset(head, 0, h * .145);
      shape([offset(head, facing * h * .13, -h * .08), offset(head, facing * h * .25, h * .027),
        offset(chin, facing * h * .11, 0)], colors.skin);
    }
    const brim = facing || 0;
    ellipse(offset(head, up[0] * h * .105, up[1] * h * .105), h * .19, h * .15, angle, colors.near);
    ellipse(offset(head, brim * h * .11, -h * .04), h * .22, h * .045, angle, colors.shirt);
    ctx.restore();
    return {head, neck, pelvis};
  }

  window.SwingPoseAvatar = Object.freeze({anatomy, paint});
})();
