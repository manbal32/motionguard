/* global THREE */
window.Swing3D = (() => {
  let active;
  const upper = 0.33;
  const lower = 0.34;
  const clubs = [
    { name: "드라이버", length: 0.95, plane: -0.60, vx: -17.5, vy: 13.4, carry: 168 },
    { name: "7번 아이언", length: 0.80, plane: -0.50, vx: -13.2, vy: 12.2, carry: 112 },
    { name: "웨지", length: 0.70, plane: -0.42, vx: -7.4, vy: 11.5, carry: 58 },
  ];
  const courses = [
    { name: "제주 해안", sky: 0x98cedf, fog: 0.024, grass: 0x315a3a, stripe: 0x3a6542,
      sun: 0xffedcd, intensity: 1.35, ambient: 0.8 },
    { name: "가평 산악", sky: 0xb7c8ad, fog: 0.043, grass: 0x32533d, stripe: 0x42694b,
      sun: 0xffd391, intensity: 1.4, ambient: 1.35 },
    { name: "야간 레인지", sky: 0x131e35, fog: 0.031, grass: 0x263f37, stripe: 0x365449,
      sun: 0xa5c9ff, intensity: 0, ambient: 0.42 },
  ];
  const cameras = [
    ["정면", [0, 0.65, 4.8], [0, 1, 0]],
    ["다운 더 라인", [4.8, 0.65, 0.2], [0, 1, 0]],
    ["하이 앵글", [2.5, 3.6, 3.6], [0, 1, 0]],
    ["손목 클로즈업", [0.3, 0.35, 2.3], [0, 1.25, 0.2]],
  ];

  function dispose() {
    active?.();
    active = undefined;
  }

  function mount(el, data, opts = {}) {
    dispose();
    const T = THREE;
    const scene = new T.Scene();
    scene.background = new T.Color(0x182830);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 240);
    camera.position.set(2.7, 1.8, 5.3);
    camera.lookAt(0, 1, 0);
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
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
      node.castShadow = true;
      node.receiveShadow = true;
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
      const shoulder = new T.Vector3(side * 0.26, 0.02, 0);
      mesh(chest, new T.SphereGeometry(0.067, 16, 12), 0x53a798).position.copy(shoulder);
      return {
        side, knee, ankle, shoulder,
        elbowJoint: mesh(chest, new T.SphereGeometry(0.039, 16, 12), 0xd9ac8c),
        handJoint: mesh(chest, new T.SphereGeometry(0.032, 16, 12), 0xd9ac8c),
        upperMesh: limb(chest, upper, 0.052, 0x53a798),
        lowerMesh: limb(chest, lower, 0.039, 0xd9ac8c),
      };
    });

    const plane = group(chest, 0, 0, 0.17);
    const swing = group(plane);
    const wrist = group(swing, 0, -0.52);
    const shaft = mesh(wrist, new T.CylinderGeometry(0.013, 0.009, 1, 10), 0xd8e0e6);
    const tip = group(wrist);
    box(tip, 0.12, 0.058, 0.08, 0x7597ae, 0.036);
    const ball = mesh(scene, new T.SphereGeometry(0.026, 16, 12), 0xffffff);
    const terrain = group(scene);
    const ground = box(terrain, 210, 0.08, 84, 0xffffff, -82, -0.055);
    const stripes = Array.from({ length: 9 }, (_, i) =>
      box(terrain, 200, 0.009, 1.4, 0xffffff, -80, -0.012, (i - 4) * 2.8));
    const coastline = box(terrain, 210, 0.09, 36, 0x47849c, -82, -0.06, -50);
    const hills = group(terrain);
    for (let i = 0; i < 9; i++) {
      const hill = mesh(hills, new T.IcosahedronGeometry(1, 1), 0x526d56, -i * 19 + 12, 0, -28 - i % 2 * 8);
      hill.scale.set(16, 7 + i % 3 * 4, 12);
    }
    const rangeMarkers = group(terrain);
    for (const distance of [12, 24, 36, 48]) {
      box(rangeMarkers, 0.18, 0.025, 11, 0x7c9c80, -distance, -0.003);
    }
    terrain.traverse(node => { node.castShadow = false; });
    const ambient = new T.HemisphereLight(0xf4f9ff, 0x536457);
    const light = new T.DirectionalLight();
    light.position.set(3, 5, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.normalBias = 0.025;
    const floodlights = [-6, 5].flatMap(x => [-5, 5].map(z => {
      const lamp = new T.PointLight(0xd2e4ff, 1.15, 28);
      lamp.position.set(x, 5, z);
      scene.add(lamp);
      return lamp;
    }));
    scene.add(ambient, light);

    function setCourse(index) {
      const course = courses[index];
      scene.background.set(course.sky);
      scene.fog = new T.FogExp2(course.sky, course.fog);
      ground.material.color.set(course.grass);
      stripes.forEach(stripe => stripe.material.color.set(course.stripe));
      coastline.visible = index === 0;
      hills.visible = index === 1;
      rangeMarkers.visible = index === 2;
      floodlights.forEach(lamp => { lamp.visible = index === 2; });
      light.color.set(course.sun);
      light.intensity = course.intensity;
      ambient.intensity = course.ambient;
    }

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.innerHTML = '<button type="button">일시 정지</button>'
      + '<input type="range" aria-label="재생 위치" min="0" max="1" step="0.001" value="0">'
      + '<label class="model-option"><input type="checkbox"> 손목 코킹 보정 (모델값)</label>';
    const [play, seek, toggle] = controls.querySelectorAll("button, input");
    function select(labelText, options) {
      const label = document.createElement("label");
      label.textContent = labelText + " ";
      const field = document.createElement("select");
      for (const [index, name] of options.entries()) {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = name;
        field.append(option);
      }
      label.append(field);
      controls.append(label);
      return field;
    }

    const clubSelect = select("클럽 (프리셋)", clubs.map(club => club.name));
    const courseSelect = select("코스", courses.map(course => course.name));
    const cameraSelect = select("카메라", cameras.map(([name]) => name));
    const followLabel = document.createElement("label");
    const follow = document.createElement("input");
    follow.type = "checkbox";
    followLabel.append(follow, " 볼 추적");
    const carry = document.createElement("output");
    carry.className = "model-option";
    controls.append(followLabel, carry);
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

    const gripCenter = new T.Vector3();
    const reach = new T.Vector3();
    const wristPoint = new T.Vector3();
    const reachable = upper + lower - 1e-5;
    for (const arm of arms) arm.grip = new T.Vector3();

    function fitGrip() {
      // Keep both hands on the same club when the nominal arc exceeds arm reach.
      chest.worldToLocal(wrist.getWorldPosition(gripCenter));
      for (const arm of arms) {
        chest.worldToLocal(wrist.localToWorld(arm.grip.set(0, arm.side * 0.038, 0)));
        arm.grip.sub(gripCenter);
      }
      for (let pass = 0; pass < 12; pass++) {
        let adjusted = false;
        for (const arm of arms) {
          reach.copy(gripCenter).add(arm.grip).sub(arm.shoulder);
          const distance = reach.length();
          if (distance > reachable) {
            gripCenter.addScaledVector(reach, reachable / distance - 1);
            adjusted = true;
          }
        }
        if (!adjusted) break;
      }
      wrist.position.copy(swing.worldToLocal(chest.localToWorld(wristPoint.copy(gripCenter))));
      for (const arm of arms) arm.grip.add(gripCenter);
    }

    function solveArm(arm) {
      const { side, shoulder, upperMesh, lowerMesh, grip } = arm;
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
      arm.elbowJoint.position.copy(elbow);
      arm.handJoint.position.copy(hand);
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
      wrist.position.set(0, -0.52, 0);
      figure.updateMatrixWorld(true);
      fitGrip();
      for (const arm of arms) solveArm(arm);
    }

    const trace = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x60dbe6 }));
    const flightLine = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xffcf86 }));
    const launch = new T.Vector3();
    const target = new T.Vector3();
    const view = new T.Spherical();
    const offset = new T.Vector3();
    scene.add(trace, flightLine);
    let club = clubs[0];
    let flightDuration;
    function flightPosition(seconds, out) {
      return out.set(launch.x + club.vx * seconds, launch.y + club.vy * seconds - 4.5 * seconds ** 2,
        launch.z - 1.1 * seconds - 0.275 * seconds ** 2);
    }

    function setClub() {
      club = clubs[Number(clubSelect.value)];
      shaft.scale.y = club.length;
      shaft.position.y = -club.length / 2;
      tip.position.y = -club.length;
      plane.rotation.set(club.plane, -0.22, 0);
      carry.textContent = "캐리 프리셋 " + club.carry + " m";
      updateTrace();
    }

    function updateTrace() {
      const points = track.map((_, i) => {
        applyPose((meta.hold + (meta.dur - meta.hold) * i / (track.length - 1)) / meta.dur);
        return tip.getWorldPosition(new T.Vector3());
      });
      trace.geometry.dispose();
      trace.geometry = new T.BufferGeometry().setFromPoints(points);
      applyPose(events.impact);
      tip.getWorldPosition(launch);
      ball.position.copy(launch);
      flightDuration = (club.vy + Math.sqrt(Math.max(0, club.vy ** 2 + 18 * (launch.y - 0.026)))) / 9;
      const pointsInFlight = Array.from({ length: 65 }, (_, i) =>
        flightPosition(i / 64 * flightDuration, new T.Vector3()));
      flightLine.geometry.dispose();
      flightLine.geometry = new T.BufferGeometry().setFromPoints(pointsInFlight);
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

    let baseDistance;
    let drag;
    function setCamera() {
      const [, position, focus] = cameras[Number(cameraSelect.value)];
      view.setFromVector3(offset.fromArray(position));
      baseDistance = view.radius;
      target.fromArray(focus);
    }

    const canvas = renderer.domElement;
    canvas.onpointerdown = event => {
      drag = [event.clientX, event.clientY];
      canvas.setPointerCapture(event.pointerId);
    };
    canvas.onpointermove = event => {
      if (!drag) return;
      view.theta -= (event.clientX - drag[0]) * 0.008;
      view.phi = T.MathUtils.clamp(view.phi - (event.clientY - drag[1]) * 0.008, 0.12, 1.52);
      drag = [event.clientX, event.clientY];
    };
    canvas.onpointerup = canvas.onlostpointercapture = () => { drag = undefined; };
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      baseDistance = T.MathUtils.clamp(baseDistance * Math.exp(event.deltaY * 0.001), 1.25, 12);
    }, { passive: false });

    function playbackDuration() {
      return Math.max(meta.dur, events.impact * meta.dur + flightDuration) + 0.35;
    }

    function draw(now) {
      const fullDuration = playbackDuration();
      time = Math.min(time, fullDuration);
      if (playing && previous !== undefined) time = (time + (now - previous) / 1000) % fullDuration;
      previous = now;
      seek.value = time / fullDuration;
      applyPose(Math.min(1, time / meta.dur));
      const flightTime = T.MathUtils.clamp(time - events.impact * meta.dur, 0, flightDuration);
      const u = flightTime / flightDuration;
      flightPosition(flightTime, ball.position);
      flightLine.geometry.setDrawRange(0, Math.floor(u * 64) + 1);
      const tracking = follow.checked ? u : 0;
      view.radius = baseDistance + 4.5 * tracking;
      camera.position.copy(target).add(offset.setFromSpherical(view));
      // Limit how far the camera can turn away from the golfer as the ball recedes.
      offset.copy(target).lerp(ball.position, 0.30 * tracking).sub(target).clampLength(0, 1.25);
      offset.add(target);
      offset.y = Math.max(target.y, offset.y);
      camera.lookAt(offset);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    }

    play.textContent = playing ? "일시 정지" : "재생";
    play.onclick = () => {
      playing = !playing;
      play.textContent = playing ? "일시 정지" : "재생";
    };
    seek.oninput = () => {
      time = Number(seek.value) * playbackDuration();
    };
    toggle.onchange = updateTrace;
    clubSelect.onchange = setClub;
    courseSelect.onchange = () => setCourse(Number(courseSelect.value));
    cameraSelect.onchange = setCamera;

    el.replaceChildren(renderer.domElement, controls);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    setClub();
    setCourse(0);
    setCamera();
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
