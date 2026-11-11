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
    { name: "제주 해안", sky: 0x98cedf, fog: 0.008, grass: 0x315a3a, stripe: 0x3a6542,
      sun: 0xffedcd, intensity: 1.35, ambient: 0.8 },
    { name: "가평 산악", sky: 0xb7c8ad, fog: 0.011, grass: 0x32533d, stripe: 0x42694b,
      sun: 0xffd391, intensity: 1.4, ambient: 1.35 },
    { name: "야간 레인지", sky: 0x131e35, fog: 0.013, grass: 0x263f37, stripe: 0x365449,
      sun: 0xa5c9ff, intensity: 0, ambient: 0.42 },
  ];
  const cameras = [
    ["정면", [0, 0.60, 5.4], [0, 1, 0]],
    ["다운 더 라인", [5.4, 0.60, 0.2], [0, 1, 0]],
    ["하이 앵글", [2.5, 3.6, 3.6], [0, 1, 0]],
    ["손목 클로즈업", [0.3, 0.35, 2.3], [0, 1.25, 0.2]],
  ];

  const cameraIds = ["front", "dtl", "high", "wrist"];
  const modelPoses = window.SwingReference;
  const unitless = new Set(["shiftX", "heelR"]);

  function modelReference(reference, events) {
    if (reference !== "model") throw new Error("지원하지 않는 기준 스윙입니다: " + reference);
    const times = [events.address, events.top, events.down, events.impact, events.finish];
    return (key, time) => {
      const values = modelPoses[key];
      const right = times.findIndex(boundary => time < boundary);
      const value = right <= 0 ? values[right === 0 ? 0 : 4]
        : THREE.MathUtils.lerp(values[right - 1], values[right],
          THREE.MathUtils.smoothstep(time, times[right - 1], times[right]));
      return unitless.has(key) ? value : THREE.MathUtils.degToRad(value);
    };
  }

  function dispose() {
    active?.();
    active = undefined;
  }

  function mount(el, data, opts = {}) {
    dispose();
    const T = THREE;
    const findings = opts.findings?.findings ?? [];
    for (const item of findings) {
      if ("channel" in item && ((item.channel === "wrist" && data.meta.wrist_source !== "index")
          || !Object.hasOwn(modelPoses, item.channel) || !data.channels.includes(item.channel))) {
        throw new Error("3D 결함에 사용할 수 없는 채널입니다: " + item.channel);
      }
      if ("range" in item && (!Array.isArray(item.range) || item.range.length !== 2
          || !item.range.every(Number.isFinite)
          || !(0 <= item.range[0] && item.range[0] < item.range[1] && item.range[1] <= 1))) {
        throw new Error("3D 결함 구간은 0~1 사이의 오름차순이어야 합니다.");
      }
    }
    const referencePose = modelReference(opts.reference ?? opts.findings?.reference ?? "model", data.events);
    const scene = new T.Scene();
    scene.background = new T.Color(0x182830);
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 240);
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
    const pelvisMesh = box(hips, 0.32, 0.19, 0.20, 0x424b54);
    const torso = group(hips);
    const chest = group(torso, 0, 0.40);
    const shirt = 0x56736a;
    const trousers = 0x424b54;
    const skin = 0xb78e74;
    const cap = 0x454c4d;
    const shoe = 0x373d43;
    const torsoMesh = mesh(torso, new T.LatheGeometry([
      new T.Vector2(0.13, 0.02), new T.Vector2(0.145, 0.11), new T.Vector2(0.17, 0.23),
      new T.Vector2(0.23, 0.37), new T.Vector2(0.195, 0.43), new T.Vector2(0.075, 0.48),
    ], 24), shirt);
    torsoMesh.scale.z = 0.57;
    torsoMesh.material.roughness = 0.8;
    mesh(chest, new T.CylinderGeometry(0.052, 0.064, 0.13, 16), skin, 0, 0.105)
      .material.roughness = 0.7;
    const head = group(chest, 0, 0.23);
    const face = mesh(head, new T.SphereGeometry(0.102, 24, 16), skin);
    face.scale.set(0.88, 1.19, 0.93);
    face.material.roughness = 0.7;
    mesh(head, new T.SphereGeometry(0.025, 12, 8), skin, 0, -0.008, 0.091).scale.y = 1.35;
    for (const side of [-1, 1]) {
      mesh(head, new T.SphereGeometry(0.016, 10, 8), skin, side * 0.085, -0.008);
      mesh(head, new T.SphereGeometry(0.006, 8, 6), shoe, side * 0.032, 0.020, 0.086);
    }
    mesh(head, new T.SphereGeometry(0.098, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.065)
      .scale.set(1, 0.68, 1);
    mesh(head, new T.CylinderGeometry(0.098, 0.098, 0.013, 24), cap, 0, 0.063, 0.046)
      .scale.set(0.95, 1, 1.02);

    const arms = [-1, 1].map(side => {
      const leg = group(hips, side * 0.15);
      const knee = group(leg, 0, -0.40);
      const ankle = group(knee, 0, -0.39);
      limb(leg, 0.40, 0.075, trousers).position.y = -0.20;
      limb(knee, 0.39, 0.058, trousers).position.y = -0.195;
      const shoeUpper = mesh(ankle, new T.SphereGeometry(1, 16, 10), shoe, 0, -0.042, 0.052);
      shoeUpper.scale.set(0.066, 0.044, 0.125);
      box(ankle, 0.126, 0.019, 0.23, 0x797a73, 0, -0.078, 0.051);
      box(ankle, 0.113, 0.028, 0.076, shoe, 0, -0.083, -0.024);
      const shoulder = new T.Vector3(side * 0.26, 0.02, 0);
      mesh(chest, new T.SphereGeometry(0.067, 16, 12), shirt).position.copy(shoulder);
      const handJoint = mesh(chest, new T.SphereGeometry(0.032, 16, 12), skin);
      handJoint.scale.set(1, 1.3, 0.78);
      handJoint.material.roughness = 0.7;
      return {
        side, knee, ankle, shoulder,
        elbowJoint: mesh(chest, new T.SphereGeometry(0.039, 16, 12), skin),
        handJoint,
        upperMesh: limb(chest, upper, 0.052, shirt),
        lowerMesh: limb(chest, lower, 0.039, skin),
      };
    });

    const plane = group(chest, 0, 0, 0.17);
    const swing = group(plane);
    const wrist = group(swing, 0, -0.52);
    const shaft = mesh(wrist, new T.CylinderGeometry(0.013, 0.009, 1, 10), 0xd8e0e6);
    const tip = group(wrist);
    const headProfile = new T.Shape();
    headProfile.moveTo(-0.028, -0.018);
    headProfile.quadraticCurveTo(-0.034, 0.006, -0.012, 0.018);
    headProfile.quadraticCurveTo(0.029, 0.026, 0.068, 0.019);
    headProfile.quadraticCurveTo(0.083, 0.012, 0.077, -0.007);
    headProfile.quadraticCurveTo(0.072, -0.021, 0.055, -0.022);
    headProfile.lineTo(-0.028, -0.018);
    const clubHead = mesh(tip, new T.ExtrudeGeometry(headProfile, {
      depth: 0.047, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2,
    }), 0xb9babc, 0, 0, -0.024);
    clubHead.material.metalness = 0.64;
    clubHead.material.roughness = 0.32;
    const planeMeshes = new Set();
    plane.traverse(node => planeMeshes.add(node));
    const segments = [];
    const modelFigure = figure.clone(true);
    let avatars;
    let disposed = false;
    const mappedNodes = new Map();
    const actualDriver = { hips, torso, head, wrist, arms };
    let ghostDriver;
    const modelSegments = [];
    const sourceColors = new Map();
    figure.traverse(node => {
      segments.push(node);
      if (node.isMesh) {
        const color = node.material.color;
        if (color.getHex() === skin) node.material.roughness = 0.7;
        if ([shirt, trousers, cap].includes(color.getHex())) node.material.roughness = 0.8;
        sourceColors.set(node, color.clone());
      }
    });
    const ghostMaterial = new T.MeshStandardMaterial({
      color: 0x9ac9f2, transparent: true, opacity: 0.38, depthWrite: false,
    });
    modelFigure.traverse(node => {
      modelSegments.push(node);
      if (node.isMesh) {
        node.material = ghostMaterial;
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    segments.forEach((node, i) => mappedNodes.set(node, modelSegments[i]));
    ghostDriver = {
      hips: mappedNodes.get(hips), torso: mappedNodes.get(torso), head: mappedNodes.get(head), wrist: mappedNodes.get(wrist),
      arms: arms.map(arm => Object.fromEntries(
        ["knee", "ankle", "upperMesh", "elbowJoint", "handJoint"].map(key => [key, mappedNodes.get(arm[key])]),
      )),
    };
    modelFigure.visible = false;
    scene.add(modelFigure);
    // The scene uses metres. A 4.3 cm ball is about 2.46% of a 1.75 m golfer's height.
    const ballRadius = 0.0215;
    const ball = mesh(scene, new T.SphereGeometry(ballRadius, 16, 12), 0xffffff);
    ball.material.roughness = 0.55;
    const shadeCanvas = document.createElement("canvas");
    shadeCanvas.width = shadeCanvas.height = 64;
    const shadeContext = shadeCanvas.getContext("2d");
    const shadeGradient = shadeContext.createRadialGradient(32, 32, 3, 32, 32, 32);
    shadeGradient.addColorStop(0, "rgba(0,0,0,.82)");
    shadeGradient.addColorStop(0.35, "rgba(0,0,0,.55)");
    shadeGradient.addColorStop(1, "rgba(0,0,0,0)");
    shadeContext.fillStyle = shadeGradient;
    shadeContext.fillRect(0, 0, 64, 64);
    const shadeTexture = new T.CanvasTexture(shadeCanvas);
    const contacts = arms.map(() => {
      const shade = new T.Mesh(new T.PlaneGeometry(0.29, 0.42), new T.MeshBasicMaterial({
        map: shadeTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      shade.rotation.x = -Math.PI / 2;
      scene.add(shade);
      return shade;
    });
    const contactPosition = new T.Vector3();
    const terrain = group(scene);
    // A repeatable turf tile, with variation in the course mesh kept below tee level.
    let seed = 611;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const turfCanvas = document.createElement("canvas");
    turfCanvas.width = turfCanvas.height = 128;
    const turfContext = turfCanvas.getContext("2d");
    turfContext.fillStyle = "#d6d8ce";
    turfContext.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5000; i++) {
      const brightness = 120 + Math.floor(random() * 135);
      turfContext.fillStyle = "rgb(" + brightness + "," + brightness + "," + brightness + ")";
      turfContext.fillRect(random() * 128, random() * 128, 1, 1 + random() * 3);
    }
    const turfTexture = new T.CanvasTexture(turfCanvas);
    turfTexture.wrapS = turfTexture.wrapT = T.RepeatWrapping;
    turfTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const fairway = new T.MeshStandardMaterial({ map: turfTexture, roughness: 1, vertexColors: true });
    const rough = new T.MeshStandardMaterial({ map: turfTexture, roughness: 1 });
    const roughGround = new T.Mesh(new T.PlaneGeometry(174, 100), rough);
    roughGround.rotation.x = -Math.PI / 2;
    roughGround.position.set(-74, -0.115, 0);
    roughGround.receiveShadow = true;
    terrain.add(roughGround);

    const positions = [];
    const uv = [];
    const indicesTerrain = [];
    const turfColors = [];
    const bands = [];
    const laneCenter = distance => 3 * Math.sin(Math.max(0, distance - 6) * 0.034);
    for (let row = 0; row <= 122; row++) {
      const distance = row - 8;
      const halfWidth = T.MathUtils.lerp(10.5, 4.0, T.MathUtils.clamp(distance / 112, 0, 1));
      for (let col = 0; col <= 12; col++) {
        const z = laneCenter(distance) + (col / 6 - 1) * halfWidth;
        const height = distance < 5 ? 0 : -0.044 + 0.038 * Math.sin(distance * 0.22 + z * 0.52);
        positions.push(-distance, height, z);
        uv.push(distance * 0.72, z * 0.72);
        turfColors.push(0, 0, 0);
        bands.push(Math.floor(Math.max(0, distance) / 4) % 2);
        if (row < 122 && col < 12) {
          const at = row * 13 + col;
          indicesTerrain.push(at, at + 13, at + 1, at + 1, at + 13, at + 14);
        }
      }
    }
    const laneGeometry = new T.BufferGeometry();
    laneGeometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    laneGeometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    laneGeometry.setAttribute("color", new T.Float32BufferAttribute(turfColors, 3));
    laneGeometry.setIndex(indicesTerrain);
    laneGeometry.computeVertexNormals();
    const lane = new T.Mesh(laneGeometry, fairway);
    lane.receiveShadow = true;
    terrain.add(lane);

    box(terrain, 3.8, 0.015, 4.6, 0x71815c, 0.8, -0.007, 0);
    const tee = box(terrain, 3.64, 0.018, 4.42, 0x486747, 0.8, -0.006, 0);
    const teeTexture = turfTexture.clone();
    teeTexture.repeat.set(3, 3);
    teeTexture.needsUpdate = true;
    tee.material.map = teeTexture;
    for (const side of [-1, 1]) {
      mesh(terrain, new T.CylinderGeometry(0.035, 0.051, 0.043, 10), side < 0 ? 0xc5bca7 : 0x604b42,
        -1.1, 0.025, side * 1.95);
    }
    for (let i = 0; i < 13; i++) {
      const divot = mesh(terrain, new T.CircleGeometry(0.05 + random() * 0.10, 7), 0x666048,
        -1.3 - random() * 3.1, 0.015, (random() - 0.5) * 3.5);
      divot.rotation.x = -Math.PI / 2;
      divot.scale.x = 1.7;
    }
    const detail = new T.Object3D();
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.12, 0.2, 2.7, 6),
      new T.MeshStandardMaterial({ color: 0x575044 }), 58);
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 58);
    for (let i = 0; i < trunks.count; i++) {
      const distance = i < 42 ? 30 + random() * 31 : 84 + random() * 59;
      const z = (i % 2 ? 1 : -1) * (9 + random() * 10) + laneCenter(distance);
      const size = 0.75 + random() * 1.1;
      detail.position.set(-distance, 1.25 * size, z);
      detail.rotation.set(0, random() * Math.PI, 0);
      detail.scale.setScalar(size);
      detail.updateMatrix();
      trunks.setMatrixAt(i, detail.matrix);
      detail.position.y += 2.3 * size;
      detail.scale.set(1.55 * size, 2.3 * size, 1.55 * size);
      detail.updateMatrix();
      crowns.setMatrixAt(i, detail.matrix);
      crowns.setColorAt(i, new T.Color().setHSL(0.28 + random() * 0.06, 0.22, 0.24 + random() * 0.13));
    }
    terrain.add(trunks, crowns);

    const greenZ = laneCenter(109);
    mesh(terrain, new T.CylinderGeometry(1, 1, 0.06, 48), 0x779369, -109, 0.01, greenZ)
      .scale.set(7, 1, 5);
    mesh(terrain, new T.CylinderGeometry(0.04, 0.04, 3.4, 8), 0xe6e1cc, -109, 1.72, greenZ);
    const flag = box(terrain, 0.055, 0.65, 1.05, 0xa85944, -109, 3.09, greenZ + 0.51);
    flag.rotation.y = 0.2;

    // Meet the rough at z=-50; the water must not cover the land or hover above it.
    const coastline = mesh(terrain, new T.PlaneGeometry(174, 100), 0x557d88, -74, -0.116, -100);
    coastline.rotation.x = -Math.PI / 2;
    coastline.material.roughness = 0.5;
    const hills = group(terrain);
    for (let i = 0; i < 8; i++) {
      const hill = mesh(hills, new T.IcosahedronGeometry(1, 1), 0x526b59,
        -122 - i * 3.7, 0, (i - 3.5) * 8);
      hill.scale.set(10, 7 + i % 3 * 4, 10);
    }
    const rangeMarkers = group(terrain);
    for (const distance of [18, 33, 48]) {
      box(rangeMarkers, 0.045, 0.54, 1.5, 0xc2cbb4, -distance, 0.24, 6);
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
      rough.color.set(course.grass).multiplyScalar(0.68);
      const tones = [new T.Color(course.grass), new T.Color(course.stripe)];
      const colors = laneGeometry.getAttribute("color");
      bands.forEach((band, i) => colors.setXYZ(i, tones[band].r, tones[band].g, tones[band].b));
      colors.needsUpdate = true;
      crowns.material.color.set(index === 2 ? 0x8799b0 : 0xffffff);
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
    if (data.channels.includes("confidence")) {
      const legend = document.createElement("span");
      legend.className = "trace-legend";
      legend.textContent = "클럽 궤도는 추적 신뢰도가 낮은 구간을 생략합니다.";
      controls.append(legend);
    }
    toggle.checked = data.meta.wrist_source !== "index" && (opts.wristCorrection ?? true);
    toggle.disabled = data.meta.wrist_source === "index";
    let finding;
    let mode = "actual";
    const coaching = document.createElement("section");
    coaching.className = "coaching";
    coaching.hidden = findings.length === 0;

    function addElement(parent, tag, text) {
      const node = document.createElement(tag);
      node.textContent = text;
      parent.append(node);
      return node;
    }

    if (findings.length) addElement(coaching, "h2", "스윙 분석");
    const findingList = addElement(coaching, "ul", "");
    const findingButtons = new Map();
    for (const item of findings) {
      const row = addElement(findingList, "li", "");
      if (item.channel && item.range) {
        const button = addElement(row, "button", item.label);
        button.type = "button";
        button.onclick = () => selectFinding(item);
        findingButtons.set(item.id, button);
      } else {
        addElement(row, "span", item.label);
      }
      if (item.youtube?.length) {
        const links = addElement(row, "div", "");
        links.className = "practice-links";
        for (const query of item.youtube) {
          const link = addElement(links, "a", query);
          link.href = "https://www.youtube.com/results?" + new URLSearchParams({ search_query: query });
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
      }
    }
    if (opts.externalFindings) findingList.hidden = true;
    const comparison = addElement(coaching, "div", "");
    comparison.hidden = true;
    const modeButtons = new Map();
    for (const [value, label] of [["actual", "실제"], ["exaggerated", "과장"], ["compare", "나란히"]]) {
      const button = addElement(comparison, "button", label);
      button.type = "button";
      button.onclick = () => {
        setMode(value);
        if (value !== "actual") focusFinding();
      };
      modeButtons.set(value, button);
    }
    const scaleLabel = addElement(comparison, "label", "과장 배율 ");
    const multiplier = addElement(scaleLabel, "input", "");
    Object.assign(multiplier, { type: "range", min: "1", max: "3", step: "0.1", value: "2.5" });
    const scaleValue = addElement(scaleLabel, "output", "2.5×");
    multiplier.oninput = () => { scaleValue.textContent = Number(multiplier.value).toFixed(1) + "×"; };
    const warning = addElement(comparison, "p", "교육용 과장이며 측정값이 아닙니다.");
    warning.className = "model-option";
    const reading = addElement(comparison, "p", "");
    const compareLabel = addElement(comparison, "p", "불투명 아바타는 실제 스윙, 반투명 아바타는 교본형 기준입니다.");
    const highlight = new T.Color(0xd98a2b);
    const neutral = new T.Color(0x85939a);
    const modelOffset = new T.Vector3();

    function setMode(value) {
      mode = value;
      modelFigure.visible = mode === "compare";
      warning.hidden = mode !== "exaggerated";
      compareLabel.hidden = mode !== "compare";
      scaleLabel.hidden = mode !== "exaggerated";
      for (const [name, button] of modeButtons) button.setAttribute("aria-pressed", String(name === mode));
    }

    function selectFinding(item) {
      finding = item;
      multiplier.value = {low: 1.5, medium: 2, high: 2.5}[item.severity] ?? 2;
      multiplier.oninput();
      findingBand.hidden = Math.abs(item.measured - item.reference) < 8;
      updateRuler();
      comparison.hidden = false;
      cameraSelect.value = cameraIds.indexOf(item.camera);
      setCamera();
      for (const [id, button] of findingButtons) button.setAttribute("aria-pressed", String(id === item.id));
      const regions = {
        swing: arms.flatMap(arm => [arm.upperMesh, arm.lowerMesh, arm.elbowJoint, arm.handJoint]),
        wrist: arms.map(arm => arm.handJoint),
        torso: [torsoMesh], lean: [torsoMesh], hips: [pelvisMesh], shiftX: [pelvisMesh],
        kneeL: [arms[0].knee.children[1]], kneeR: [arms[1].knee.children[1]],
        heelR: arms[1].ankle.children,
      };
      for (const [node, color] of sourceColors) {
        node.material.color.copy(color).lerp(neutral, 0.62);
        if (Math.abs(item.measured - item.reference) >= 8 && regions[item.channel]?.includes(node)) node.material.color.copy(highlight);
      }
      avatars?.[0].colorize(Math.abs(item.measured - item.reference) >= 8 ? item.channel : undefined);
      focusFinding();
    }

    function focusFinding() {
      if (!finding) return;
      const [start, end] = finding.range;
      time = (start + end) / 2 * data.meta.dur;
      playing = false;
      play.textContent = "재생";
    }

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
        chest.worldToLocal(wrist.localToWorld(arm.grip.set(0, arm.side * 0.049, 0)));
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
    function measuredAt(time) {
      const fraction = T.MathUtils.clamp((time * meta.dur - meta.hold) / (meta.dur - meta.hold), 0, 1);
      const sample = fraction * (track.length - 1);
      const index = Math.floor(sample);
      const a = track[index];
      const b = track[Math.min(index + 1, track.length - 1)];
      return key => T.MathUtils.lerp(a[indices[key]], b[indices[key]], sample - index);
    }

    function applyPose(time, read = measuredAt(time), original = read) {
      hips.rotation.y = read("hips");
      hips.position.x = read("shiftX");
      torso.rotation.set(read("lean"), read("torso"), 0);
      const headRelease = T.MathUtils.smoothstep(time, events.impact, events.finish);
      head.rotation.y = -original("torso") * 0.78 * (1 - headRelease);
      arms[0].knee.rotation.x = read("kneeL");
      arms[1].knee.rotation.x = read("kneeR");
      arms[1].ankle.rotation.x = -read("heelR") * 0.9;
      swing.rotation.z = read("swing");
      wrist.rotation.z = read("wrist") + (toggle.checked ? 0.32 * original("swing") : 0);
      wrist.position.set(0, -0.52, 0);
      figure.updateMatrixWorld(true);
      fitGrip();
      for (const arm of arms) solveArm(arm);
    }

    const trace = new T.Mesh(new T.BufferGeometry(), new T.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: T.DoubleSide,
      vertexShader: `
        attribute vec3 tangent;
        attribute float width;
        attribute float edge;
        void main() {
          vec4 center = modelViewMatrix * vec4(position, 1.0);
          vec3 direction = (modelViewMatrix * vec4(tangent, 0.0)).xyz;
          vec3 sideways = cross(direction, -center.xyz);
          center.xyz += sideways * (width * edge / max(length(sideways), 0.00001));
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: `
        void main() {
          gl_FragColor = vec4(0.91, 0.91, 0.88, 0.28);
        }
      `,
    }));
    trace.frustumCulled = false;
    trace.visible = false;

    function ribbonGeometry(points) {
      const positions = [];
      const tangents = [];
      const widths = [];
      const edges = [];
      const triangles = [];
      const sampleTime = (meta.dur - meta.hold) / (points.length - 1);
      const steps = 5;

      // Build separate splines so rejected points cannot bend or bridge visible segments.
      function addRun(run) {
        if (run.length < 2) return;
        const divisions = (run.length - 1) * steps;
        const centers = new T.CatmullRomCurve3(run, false, "centripetal").getPoints(divisions);
        for (let i = 0; i <= divisions; i++) {
          const before = Math.max(0, i - 1);
          const after = Math.min(divisions, i + 1);
          const tangent = centers[after].clone().sub(centers[before]);
          const speed = tangent.length() * steps / ((after - before) * sampleTime);
          const halfWidth = Math.min(0.005, 0.0012 + speed * 0.00022);
          const j = positions.length / 3;
          for (const edge of [-1, 1]) {
            positions.push(...centers[i].toArray());
            tangents.push(...tangent.toArray());
            widths.push(halfWidth);
            edges.push(edge);
          }
          if (i > 0) triangles.push(j - 2, j - 1, j, j, j - 1, j + 1);
        }
      }

      let run = [];
      points.forEach((point, index) => {
        const confidence = indices.confidence === undefined ? 0 : track[index][indices.confidence];
        if (confidence >= 0.45) run.push(point);
        else {
          addRun(run);
          run = [];
        }
      });
      addRun(run);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("tangent", new T.Float32BufferAttribute(tangents, 3));
      geometry.setAttribute("width", new T.Float32BufferAttribute(widths, 1));
      geometry.setAttribute("edge", new T.Float32BufferAttribute(edges, 1));
      geometry.setIndex(triangles);
      return geometry;
    }
    const flightLine = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xa0a09a }));
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
      updateRuler();
    }

    function updateTrace() {
      const points = track.map((_, i) => {
        applyPose((meta.hold + (meta.dur - meta.hold) * i / (track.length - 1)) / meta.dur);
        return tip.getWorldPosition(new T.Vector3());
      });
      trace.geometry.dispose();
      trace.geometry = ribbonGeometry(points);
      applyPose(events.impact);
      tip.getWorldPosition(launch);
      ball.position.copy(launch);
      flightDuration = (club.vy + Math.sqrt(Math.max(0, club.vy ** 2 + 18 * (launch.y - ballRadius)))) / 9;
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

    const jointNodes = arms.flatMap(arm => [arm.upperMesh, arm.elbowJoint, arm.handJoint, arm.knee, arm.ankle]);
    const jointGeometry = new T.BufferGeometry().setAttribute("position",
      new T.Float32BufferAttribute(new Float32Array(jointNodes.length * 3), 3));
    const jointDots = new T.Points(jointGeometry, new T.PointsMaterial({color:0xe9e7e0, size:0.035}));
    jointDots.frustumCulled = false;
    jointDots.visible = false;
    scene.add(jointDots);
    const planeGuide = new T.Mesh(new T.RingGeometry(1.17, 1.18, 64),
      new T.MeshBasicMaterial({color:0xa9ada7, transparent:true, opacity:0.45, side:T.DoubleSide, depthWrite:false}));
    planeGuide.visible = false;
    plane.add(planeGuide);
    const phaseGhosts = new T.LineSegments(new T.BufferGeometry(),
      new T.LineBasicMaterial({color:0xe9e7e0, transparent:true, opacity:0.24, depthWrite:false}));
    phaseGhosts.visible = false;
    scene.add(phaseGhosts);
    const jointWorld = new T.Vector3();

    function displaySwitch(label, checked, change) {
      const wrapper = document.createElement("label");
      const field = document.createElement("input");
      field.type = "checkbox";
      field.checked = checked;
      field.onchange = () => change(field.checked);
      wrapper.append(field, " " + label);
      controls.append(wrapper);
    }
    displaySwitch("클럽 궤도", false, checked => { trace.visible = checked; });
    displaySwitch("관절점", false, checked => { jointDots.visible = checked; });
    displaySwitch("스윙 플레인", false, checked => { planeGuide.visible = checked; });
    displaySwitch("국면 잔상", false, checked => {
      phaseGhosts.visible = checked;
      if (!checked) return;
      const segments = [];
      for (const phase of ["top", "down", "impact"]) {
        applyPose(events[phase]);
        figure.updateMatrixWorld(true);
        for (const arm of arms) {
          for (const [a, b] of [[arm.upperMesh, arm.elbowJoint], [arm.elbowJoint, arm.handJoint],
            [arm.knee.parent, arm.knee], [arm.knee, arm.ankle], [hips, head]]) {
            segments.push(a.getWorldPosition(new T.Vector3()), b.getWorldPosition(new T.Vector3()));
          }
        }
      }
      phaseGhosts.geometry.dispose();
      phaseGhosts.geometry = new T.BufferGeometry().setFromPoints(segments);
    });

    function playbackDuration() {
      return Math.max(meta.dur, events.impact * meta.dur + flightDuration) + 0.35;
    }

    function reviewPose(normalizedTime) {
      const measured = measuredAt(normalizedTime);
      if (!finding) {
        applyPose(normalizedTime, measured);
        return;
      }
      const channel = finding.channel;
      const reference = key => referencePose(key, normalizedTime);
      const actual = measured(channel);
      let shown = actual;
      if (mode === "exaggerated") {
        const [start, end] = finding.range;
        const ramp = Math.min(0.02, (end - start) / 3);
        const blend = T.MathUtils.smoothstep(normalizedTime, start, start + ramp)
          * (1 - T.MathUtils.smoothstep(normalizedTime, end - ramp, end));
        const scale = 1 + blend * (Number(multiplier.value) - 1);
        const baseline = reference(channel);
        shown = blend > 0 ? baseline + (actual - baseline) * scale : actual;
      }
      if (mode === "compare") {
        applyPose(normalizedTime, reference);
        for (let i = 1; i < segments.length; i++) {
          modelSegments[i].position.copy(segments[i].position);
          modelSegments[i].quaternion.copy(segments[i].quaternion);
          modelSegments[i].scale.copy(segments[i].scale);
        }
      }
      applyPose(normalizedTime, key => key === channel ? shown : measured(key), measured);
      const format = value => {
        const degrees = T.MathUtils.radToDeg(value).toFixed(1);
        return degrees + (unitless.has(channel) ? "° 환산" : "°");
      };
      let text = "실제 측정값 " + format(actual);
      if (mode === "exaggerated") text += " · 과장 표시 " + format(shown);
      if (mode !== "actual") text += " · 교본 기준 " + format(reference(channel));
      if (indices.confidence !== undefined && measured("confidence") < 0.45) text += " · 추적 신뢰도 낮음";
      if (reading.textContent !== text) reading.textContent = text;
    }

    const ruler = document.createElement("div");
    ruler.className = "viewer-ruler";
    const findingBand = document.createElement("span");
    findingBand.className = "finding-band";
    findingBand.hidden = true;
    ruler.append(findingBand);
    const phaseMarks = [];
    for (const [key, title] of Object.entries({address:"어드레스", top:"탑", down:"다운", impact:"임팩트", finish:"피니시"})) {
      const mark = document.createElement("button");
      mark.type = "button";
      mark.textContent = title;
      phaseMarks.push([mark, events[key]]);
      mark.onclick = () => { time = events[key] * meta.dur; playing = false; play.textContent = "재생"; };
      ruler.append(mark);
    }
    const timeline = document.createElement("div");
    timeline.className = "viewer-timeline";
    seek.replaceWith(timeline);
    timeline.append(seek, ruler);

    function updateRuler() {
      const scale = 100 * meta.dur / playbackDuration();
      for (const [mark, time] of phaseMarks) mark.style.left = time * scale + "%";
      if (finding) {
        findingBand.style.left = finding.range[0] * scale + "%";
        findingBand.style.width = (finding.range[1] - finding.range[0]) * scale + "%";
      }
    }

    let recording;

    function record(onProgress) {
      if (disposed || recording) return Promise.reject(new Error("녹화를 시작할 수 없습니다."));
      const source = renderer.domElement;
      const capture = document.createElement("canvas");
      capture.width = source.width;
      capture.height = source.height;
      if (!window.MediaRecorder || !capture.captureStream) return Promise.reject(new Error("WebM 저장을 지원하는 Chrome 또는 Edge에서 다시 시도해 주세요."));
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) return Promise.reject(new Error("이 브라우저는 WebM 녹화를 지원하지 않습니다."));
      const stream = capture.captureStream(30);
      let recorder;
      try { recorder = new MediaRecorder(stream, { mimeType }); }
      catch (error) { stream.getTracks().forEach(track => track.stop()); return Promise.reject(error); }
      const state = {
        recorder, stream, capture, context: capture.getContext("2d"), onProgress,
        start: undefined, previousTime: time, previousPlaying: playing,
        label: mode === "exaggerated" ? "교육용 과장" : "",
        filename: "swing3d_" + (finding?.id ?? "swing") + "_" + (mode === "exaggerated" ? Number(multiplier.value).toFixed(1) : "1.0") + "x.webm",
      };
      const chunks = [];
      return new Promise((resolve, reject) => {
        function done(error) {
          if (recording !== state) return;
          recording = undefined;
          stream.getTracks().forEach(track => track.stop());
          el.inert = false;
          time = state.previousTime;
          playing = state.previousPlaying;
          previous = undefined;
          if (error) reject(error);
          else if (!chunks.length) reject(new Error("녹화된 프레임이 없습니다."));
          else resolve({ blob: new Blob(chunks, {type:"video/webm"}), filename: state.filename });
        }
        state.cancel = () => {
          if (recorder.state !== "inactive") recorder.stop();
          done(new Error("녹화가 취소됐습니다."));
        };
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => done();
        recorder.onerror = () => done(new Error("WebM 녹화에 실패했습니다."));
        el.inert = true;
        playing = false;
        time = 0;
        recording = state;
        try { recorder.start(); } catch (error) { done(error); }
      });
    }

    function captureFrame(now, fullDuration) {
      if (!recording || recording.recorder.state !== "recording") return;
      const { context, capture, label, recorder, onProgress } = recording;
      context.drawImage(renderer.domElement, 0, 0, capture.width, capture.height);
      if (label) {
        const px = Math.max(22, Math.round(capture.height * 0.048));
        context.font = "600 " + px + 'px "IBM Plex Sans KR", sans-serif';
        context.textBaseline = "top";
        context.fillStyle = "#0b0e0d";
        context.fillRect(14, 14, context.measureText(label).width + 24, px + 20);
        context.fillStyle = "#e9e7e0";
        context.fillText(label, 26, 24);
      }
      onProgress?.(Math.min(100, Math.round(100 * time / fullDuration)));
      if (now - recording.start >= fullDuration * 1000) recorder.stop();
    }

    function draw(now) {
      const fullDuration = playbackDuration();
      time = Math.min(time, fullDuration);
      if (recording) {
        recording.start ??= now;
        time = Math.min(fullDuration, (now - recording.start) / 1000);
      } else if (playing && previous !== undefined) time = (time + (now - previous) / 1000) % fullDuration;
      previous = now;
      seek.value = time / fullDuration;
      reviewPose(Math.min(1, time / meta.dur));
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
      if (modelFigure.visible) {
        modelOffset.set(1, 0, 0).applyQuaternion(camera.quaternion);
        modelOffset.y = 0;
        modelFigure.position.copy(modelOffset.normalize().multiplyScalar(cameraSelect.value === "3" ? 0.72 : 1.18));
      }
      figure.updateMatrixWorld(true);
      if (modelFigure.visible) modelFigure.updateMatrixWorld(true);
      if (avatars) {
        avatars[0].update(actualDriver);
        avatars[1].root.visible = modelFigure.visible;
        if (modelFigure.visible) avatars[1].update(ghostDriver);
      }
      for (const [i, arm] of arms.entries()) {
        if (avatars) avatars[0].footContact(i, contactPosition);
        else arm.ankle.localToWorld(contactPosition.set(0, -0.085, 0.045));
        const groundHeight = 0.005;
        const height = Math.max(0, contactPosition.y - groundHeight);
        contacts[i].position.set(contactPosition.x, groundHeight, contactPosition.z);
        contacts[i].material.opacity = T.MathUtils.clamp(0.95 - 2.8 * height, 0.10, 0.95);
        contacts[i].scale.setScalar(1 + Math.min(height, 0.35));
      }
      if (jointDots.visible) {
        const points = jointGeometry.getAttribute("position");
        jointNodes.forEach((node, index) => {
          node.getWorldPosition(jointWorld);
          points.setXYZ(index, jointWorld.x, jointWorld.y, jointWorld.z);
        });
        points.needsUpdate = true;
      }
      renderer.render(scene, camera);
      captureFrame(now, fullDuration);
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

    el.replaceChildren(renderer.domElement, controls, coaching);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    setClub();
    setCourse(0);
    setCamera();
    setMode("actual");
    const firstFinding = findings.find(item => item.channel && item.range);
    if (firstFinding) selectFinding(firstFinding);
    frame = requestAnimationFrame(draw);
    import("./avatar.js").then(module => module.loadAvatars("assets/golfer-rig.json")).then(loaded => {
      if (disposed) {
        loaded.forEach(avatar => avatar.dispose());
        return;
      }
      avatars = loaded;
      for (const [i, avatar] of avatars.entries()) {
        scene.add(avatar.root);
        const nodes = i === 0 ? segments : modelSegments;
        nodes.forEach((node, index) => {
          if (node.isMesh && !planeMeshes.has(segments[index])) node.visible = false;
        });
      }
      avatars[0].colorize(finding && Math.abs(finding.measured - finding.reference) >= 8 ? finding.channel : undefined);
    }).catch(error => console.warn("기본 아바타로 재생합니다.", error));
    active = () => {
      recording?.cancel();
      disposed = true;
      avatars?.forEach(avatar => avatar.dispose());
      cancelAnimationFrame(frame);
      observer.disconnect();
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      shadeTexture.dispose();
      turfTexture.dispose();
      teeTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      controls.remove();
      coaching.remove();
    };
    return {
      record,
      select(id) {
        const item = findings.find(item => item.id === id && item.channel && item.range);
        if (item) { selectFinding(item); setMode("exaggerated"); }
      },
    };
  }

  return { mount, dispose };
})();
