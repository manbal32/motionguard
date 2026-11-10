/* global THREE */
window.Swing3D = (() => {
  let active;
  const upper = 0.33;
  const lower = 0.34;

  function dispose() {
    active?.();
    active = undefined;
  }

  function mount(el, data, opts = {}) {
    dispose();
    const T = THREE;
    const scene = new T.Scene();
    scene.background = new T.Color(0x182830);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(2.7, 1.8, 5.3);
    camera.lookAt(0, 1, 0);
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    function group(parent, x = 0, y = 0, z = 0) {
      const node = new T.Group();
      node.position.set(x, y, z);
      parent.add(node);
      return node;
    }

    function mesh(parent, geometry, color, x = 0, y = 0, z = 0) {
      const node = new T.Mesh(geometry, new T.MeshStandardMaterial({ color }));
      node.position.set(x, y, z);
      parent.add(node);
      return node;
    }

    function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
      return mesh(parent, new T.BoxGeometry(w, h, d), color, x, y, z);
    }

    function limb(parent, length, radius, color) {
      return mesh(parent, new T.CapsuleGeometry(radius, length - 2 * radius, 4, 8), color);
    }

    const figure = group(scene);
    const hips = group(figure, 0, 0.88);
    box(hips, 0.34, 0.20, 0.21, 0x405c72);
    const torso = group(hips);
    const chest = group(torso, 0, 0.40);
    mesh(torso, new T.SphereGeometry(1, 20, 12), 0x53a798, 0, 0.26)
      .scale.set(0.235, 0.29, 0.128);
    const head = group(chest, 0, 0.25);
    mesh(head, new T.SphereGeometry(0.105, 20, 12), 0xd9ac8c).scale.y = 1.2;
    box(head, 0.18, 0.027, 0.15, 0xe6e8dd, 0, 0.063, 0.072);

    const arms = [-1, 1].map(side => {
      const leg = group(hips, side * 0.15);
      const knee = group(leg, 0, -0.40);
      const ankle = group(knee, 0, -0.39);
      limb(leg, 0.40, 0.075, 0x405c72).position.y = -0.20;
      limb(knee, 0.39, 0.058, 0x405c72).position.y = -0.195;
      box(ankle, 0.13, 0.095, 0.24, 0xd9e4e3, 0, -0.045, 0.06);
      return {
        side, knee, ankle,
        shoulder: new T.Vector3(side * 0.205, 0.02, 0),
        upperMesh: limb(chest, upper, 0.052, 0x53a798),
        lowerMesh: limb(chest, lower, 0.039, 0xd9ac8c),
      };
    });

    const plane = group(chest, 0, 0, 0.17);
    plane.rotation.set(-0.60, -0.22, 0);
    const swing = group(plane);
    const wrist = group(swing, 0, -0.37);
    mesh(wrist, new T.CylinderGeometry(0.013, 0.009, 0.95, 10), 0xd8e0e6, 0, -0.475);
    const tip = group(wrist, 0, -0.95);
    box(tip, 0.12, 0.058, 0.08, 0x7597ae, 0.036);
    const ball = mesh(scene, new T.SphereGeometry(0.026, 16, 12), 0xffffff);
    const ground = new T.GridHelper(8, 32, 0x607b81, 0x354c54);
    scene.add(ground, new T.HemisphereLight(0xf4f9ff, 0x536457, 1.5));
    const light = new T.DirectionalLight(0xffeddb, 1.5);
    light.position.set(3, 5, 4);
    scene.add(light);

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.innerHTML = '<button type="button">일시 정지</button>'
      + '<input type="range" aria-label="재생 위치" min="0" max="1" step="0.001" value="0">'
      + '<label class="model-option"><input type="checkbox"> 손목 코킹 보정 (모델값)</label>';
    const [play, seek, toggle] = controls.querySelectorAll("button, input");
    toggle.checked = opts.wristCorrection ?? true;
    const axis = new T.Vector3(0, 1, 0);
    const hand = new T.Vector3();
    const direction = new T.Vector3();
    const pole = new T.Vector3();
    const elbow = new T.Vector3();
    const segment = new T.Vector3();

    function placeLimb(node, from, to) {
      node.position.copy(from).lerp(to, 0.5);
      node.quaternion.setFromUnitVectors(axis, segment.subVectors(to, from).normalize());
    }

    function solveArm(arm) {
      const { side, shoulder, upperMesh, lowerMesh } = arm;
      const grip = new T.Vector3(0, side * 0.038, 0);
      chest.worldToLocal(wrist.localToWorld(grip));
      direction.subVectors(grip, shoulder).normalize();
      const distance = T.MathUtils.clamp(shoulder.distanceTo(grip), lower - upper + 1e-5, upper + lower - 1e-5);
      hand.copy(shoulder).addScaledVector(direction, distance);
      pole.set(side * 0.55, -1, -0.45);
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
      elbow.copy(shoulder).addScaledVector(direction, along)
        .addScaledVector(pole, Math.sqrt(Math.max(0, upper ** 2 - along ** 2)));
      placeLimb(upperMesh, shoulder, elbow);
      placeLimb(lowerMesh, elbow, hand);
    }

    const { channels, events, meta, track } = data;
    const indices = Object.fromEntries(channels.map((channel, i) => [channel, i]));
    function applyPose(time) {
      const fraction = T.MathUtils.clamp((time * meta.dur - meta.hold) / (meta.dur - meta.hold), 0, 1);
      const sample = fraction * (track.length - 1);
      const index = Math.floor(sample);
      const a = track[index];
      const b = track[Math.min(index + 1, track.length - 1)];
      const read = key => T.MathUtils.lerp(a[indices[key]], b[indices[key]], sample - index);
      hips.rotation.y = read("hips");
      hips.position.x = read("shiftX");
      torso.rotation.set(read("lean"), read("torso"), 0);
      const headRelease = T.MathUtils.smoothstep(time, events.impact, events.finish);
      head.rotation.y = -read("torso") * 0.78 * (1 - headRelease);
      arms[0].knee.rotation.x = read("kneeL");
      arms[1].knee.rotation.x = read("kneeR");
      arms[1].ankle.rotation.x = -read("heelR") * 0.9;
      swing.rotation.z = read("swing");
      wrist.rotation.z = read("wrist") + (toggle.checked ? 0.32 * read("swing") : 0);
      figure.updateMatrixWorld(true);
      for (const arm of arms) solveArm(arm);
    }

    const trace = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x60dbe6 }));
    scene.add(trace);
    function updateTrace() {
      const points = track.map((_, i) => {
        applyPose((meta.hold + (meta.dur - meta.hold) * i / (track.length - 1)) / meta.dur);
        return tip.getWorldPosition(new T.Vector3());
      });
      trace.geometry.dispose();
      trace.geometry = new T.BufferGeometry().setFromPoints(points);
      applyPose(events.impact);
      tip.getWorldPosition(ball.position);
    }

    let time = 0;
    let playing = opts.autoplay ?? true;
    let previous;
    let frame;
    function resize() {
      const width = Math.max(1, el.clientWidth);
      const height = Math.round(width * 10 / 16);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function draw(now) {
      if (playing && previous !== undefined) time = (time + (now - previous) / 1000 / meta.dur) % 1;
      previous = now;
      seek.value = time;
      applyPose(time);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    }

    play.textContent = playing ? "일시 정지" : "재생";
    play.onclick = () => {
      playing = !playing;
      play.textContent = playing ? "일시 정지" : "재생";
    };
    seek.oninput = () => { time = Number(seek.value); };
    toggle.onchange = updateTrace;

    el.replaceChildren(renderer.domElement, controls);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    updateTrace();
    frame = requestAnimationFrame(draw);
    active = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      controls.remove();
    };
  }

  return { mount, dispose };
})();
