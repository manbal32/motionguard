import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

const T = window.THREE;
const skin = new T.Color(0xb28b73);
const shirt = new T.Color(0x586f66);
const trousers = new T.Color(0x283849);
const shoes = new T.Color(0x5b5a53);
const highlight = new T.Color(0xd19142);
const iris = new T.Color(0x484543);

export async function loadAvatars(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("아바타 본 매핑을 불러올 수 없습니다.");
  const config = await response.json();
  const gltf = await new GLTFLoader().loadAsync(new URL(config.asset, response.url).href);
  const original = gltf.scene;
  try {
    return [bind(original, config, false), bind(original, config, true)];
  } finally {
    const geometries = new Set();
    const materials = new Set();
    original.traverse(node => {
      if (node.isMesh) {
        geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
}

function bind(source, config, ghost) {
  // Clone the scene graph and skeleton so that comparison and actual poses are independent.
  const root = clone(source);
  root.scale.setScalar(config.scale);
  root.rotation.y = config.yaw;
  root.updateMatrixWorld(true);
  const q = new T.Quaternion();
  const parentQ = new T.Quaternion();
  const world = new T.Vector3();
  const axis = new T.Vector3();
  const aim = new T.Vector3();
  const local = new T.Vector3();
  const gripDirection = new T.Vector3();
  const shaftDirection = new T.Vector3();
  const palmNormal = new T.Vector3();
  const handBasis = new T.Matrix4();
  const turn = new T.Quaternion();
  const roles = new Map();

  function bone(name, role) {
    const node = root.getObjectByName(name);
    if (!node?.isBone) throw new Error("GLB 본을 찾을 수 없습니다: " + name);
    roles.set(node, role);
    return {
      node,
      restWorld: node.getWorldQuaternion(new T.Quaternion()),
      restLocal: node.quaternion.clone(),
    };
  }

  const hips = bone(config.bones.hips, "hips");
  const spine = bone(config.bones.spine, "torso");
  const head = bone(config.bones.head, "head");
  const limbs = ["left", "right"].map((side, index) => {
    const map = config.bones[side];
    return {
      upper: bone(map.upperArm, "sleeve"),
      lower: bone(map.forearm, "forearm"),
      hand: bone(map.hand, "hand"),
      thigh: bone(map.thigh, "leg"),
      knee: bone(map.knee, index === 0 ? "kneeL" : "kneeR"),
      foot: bone(map.foot, index === 0 ? "shoe" : "heelR"),
      fingers: (map.fingers ?? []).map(name => bone(name, "hand")),
      curl: new T.Vector3(...(map.curlAxis ?? [1, 0, 0])).normalize(),
      palmDepth: map.palmDepth ?? 0.055,
    };
  });
  for (const limb of limbs) {
    for (const [a, b] of [[limb.upper, limb.lower], [limb.lower, limb.hand]]) {
      a.direction = b.node.position.clone().normalize();
    }
  }

  const material = new T.MeshStandardMaterial(ghost
    ? { color: 0xb1b4ad, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.8 }
    : { vertexColors: true, roughness: 0.8, metalness: 0 });
  if (!ghost) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = "attribute float garmentRoughness; varying float vGarmentRoughness;\n"
        + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvGarmentRoughness = garmentRoughness;");
      shader.fragmentShader = "varying float vGarmentRoughness;\n"
        + shader.fragmentShader.replace("#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor = vGarmentRoughness;");
    };
  }
  const surfaces = [];
  const headBounds = new T.Box3();
  const footBounds = limbs.map(() => new T.Box3());
  const point = new T.Vector3();
  const skinRegions = new Set(["head", "hand", "forearm"]);
  root.traverse(node => {
    if (!node.isSkinnedMesh) return;
    node.geometry = node.geometry.clone();
    node.material = material;
    node.castShadow = !ghost;
    node.receiveShadow = !ghost;
    node.frustumCulled = false;
    const weights = node.geometry.getAttribute("skinWeight");
    const joints = node.geometry.getAttribute("skinIndex");
    const colors = new T.Float32BufferAttribute(new Float32Array(weights.count * 3), 3);
    const regions = Array.from({ length: weights.count }, (_, i) => {
      let index = 0;
      for (let j = 1; j < 4; j++) {
        if (weights.array[i * 4 + j] > weights.array[i * 4 + index]) index = j;
      }
      let joint = node.skeleton.bones[joints.array[i * 4 + index]];
      while (joint && !roles.has(joint)) joint = joint.parent;
      return roles.get(joint) ?? "torso";
    });
    const positions = node.geometry.getAttribute("position");
    const roughness = regions.map((region, i) => {
      if (region === "head" && !/eye/i.test(node.name)) {
        headBounds.expandByPoint(node.localToWorld(point.fromBufferAttribute(positions, i)));
      }
      if (region === "shoe" || region === "heelR") {
        footBounds[region === "shoe" ? 0 : 1].expandByPoint(node.localToWorld(point.fromBufferAttribute(positions, i)));
        return 0.65;
      }
      return skinRegions.has(region) ? 0.7 : 0.8;
    });
    node.geometry.setAttribute("garmentRoughness", new T.Float32BufferAttribute(roughness, 1));
    node.geometry.setAttribute("color", colors);
    surfaces.push({ colors, regions, name: node.name, geometry: node.geometry });
  });
  if (!surfaces.length) throw new Error("GLB에 스킨 메시가 없습니다.");

  function colorize(channel) {
    if (ghost) return;
    const selected = { lean: "torso", shiftX: "hips" }[channel] ?? channel;
    const color = new T.Color();
    const gray = new T.Color();
    for (const { colors, regions, name } of surfaces) {
      for (const [index, region] of regions.entries()) {
        let base = trousers;
        if (skinRegions.has(region)) base = skin;
        if (region === "sleeve" || region === "torso") base = shirt;
        if (region === "shoe" || region === "heelR") base = shoes;
        if (name.toLowerCase().includes("eyebrow")) base = shoes;
        if (name.toLowerCase() === "eyes") base = iris;
        color.copy(base);
        if (selected) {
          const arm = ["sleeve", "forearm", "hand"].includes(region);
          if (selected === region || (selected === "swing" && arm) || (selected === "wrist" && region === "hand")) color.copy(highlight);
          else {
            const lightness = (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 2;
            color.lerp(gray.setScalar(lightness), 0.35);
          }
        }
        colors.setXYZ(index, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
  }
  colorize();

  const contactAnchors = limbs.map((limb, index) => {
    const bounds = footBounds[index];
    if (bounds.isEmpty()) return new T.Vector3();
    const anchor = bounds.getCenter(new T.Vector3());
    anchor.y = bounds.min.y;
    return limb.foot.node.worldToLocal(anchor);
  });
  let hair;
  if (!headBounds.isEmpty()) {
    const size = headBounds.getSize(new T.Vector3());
    const center = headBounds.getCenter(new T.Vector3());
    // Follow the existing head bone. The shell is only a visual accessory.
    const geometry = new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.53);
    const hairMaterial = new T.MeshStandardMaterial(ghost
      ? {color: 0xa6aaa4, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.95}
      : {color: 0x332b26, roughness: 0.95});
    hair = new T.Mesh(geometry, hairMaterial);
    hair.name = "Golfer hair";
    hair.position.copy(root.worldToLocal(point.set(center.x, headBounds.max.y - size.y * 0.25, center.z - size.z * 0.075)));
    hair.scale.set(size.x * 0.49, size.y * 0.29, size.z * 0.49);
    hair.castShadow = !ghost;
    root.add(hair);
    head.node.attach(hair);
  }

  function orient(binding, rotation) {
    const { node } = binding;
    node.parent.getWorldQuaternion(parentQ).invert();
    node.quaternion.copy(parentQ.multiply(rotation));
    node.updateWorldMatrix(false, false);
  }

  function place(binding, position) {
    binding.node.position.copy(binding.node.parent.worldToLocal(local.copy(position)));
    binding.node.updateWorldMatrix(false, false);
  }

  function drive(binding, target) {
    target.getWorldQuaternion(q).multiply(binding.restWorld);
    orient(binding, q);
  }

  function aimAt(binding, target) {
    const { node, direction, restLocal } = binding;
    node.parent.getWorldQuaternion(q).multiply(restLocal);
    axis.copy(direction).applyQuaternion(q);
    aim.copy(target).sub(node.getWorldPosition(world)).normalize();
    if (aim.lengthSq() > 0) {
      turn.setFromUnitVectors(axis, aim);
      orient(binding, turn.multiply(q));
    }
  }

  function update(driver) {
    driver.hips.getWorldPosition(world);
    place(hips, world);
    drive(hips, driver.hips);
    drive(spine, driver.torso);
    drive(head, driver.head);
    for (const [i, limb] of limbs.entries()) {
      const arm = driver.arms[i];
      drive(limb.thigh, arm.knee.parent);
      drive(limb.knee, arm.knee);
      drive(limb.foot, arm.ankle);

      // The procedural two-bone solver supplies the shoulder, elbow and grip anchors.
      const shoulder = arm.upperMesh.localToWorld(new T.Vector3(0, -0.165, 0));
      const elbow = arm.elbowJoint.getWorldPosition(new T.Vector3());
      const hand = arm.handJoint.getWorldPosition(new T.Vector3());
      place(limb.upper, shoulder);
      aimAt(limb.upper, elbow);
      place(limb.lower, elbow);
      shaftDirection.set(0, i === 0 ? 1 : -1, 0).transformDirection(driver.wrist.matrixWorld);
      gripDirection.copy(hand).sub(elbow).normalize();
      gripDirection.addScaledVector(shaftDirection, -gripDirection.dot(shaftDirection)).normalize();
      if (gripDirection.lengthSq() < 1e-8) {
        gripDirection.set(1, 0, 0).transformDirection(driver.wrist.matrixWorld);
      }
      palmNormal.crossVectors(gripDirection, shaftDirection).normalize();
      hand.addScaledVector(gripDirection, -limb.palmDepth);
      aimAt(limb.lower, hand);
      place(limb.hand, hand);
      q.setFromRotationMatrix(handBasis.makeBasis(palmNormal, gripDirection, shaftDirection));
      orient(limb.hand, q);
      for (const finger of limb.fingers) {
        finger.node.quaternion.copy(finger.restLocal).multiply(q.setFromAxisAngle(limb.curl, 0.95));
      }
    }
    root.updateMatrixWorld(true);
  }

  return {
    root, update, colorize,
    footContact(index, out) {
      return limbs[index].foot.node.localToWorld(out.copy(contactAnchors[index]));
    },
    dispose() {
      surfaces.forEach(surface => surface.geometry.dispose());
      material.dispose();
      hair?.geometry.dispose();
      hair?.material.dispose();
      root.removeFromParent();
    },
  };
}
