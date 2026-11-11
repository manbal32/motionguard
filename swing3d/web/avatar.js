import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

const T = window.THREE;
const skin = new T.Color(0xb28b73);
const shirt = new T.Color(0x547269);
const trousers = new T.Color(0x394651);
const shoes = new T.Color(0x30363c);
const highlight = new T.Color(0xd19142);
const neutral = new T.Color(0x68737a);
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
      upper: bone(map.upperArm, "swing"),
      lower: bone(map.forearm, "swing"),
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
    ? { color: 0x9ac9f2, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.8 }
    : { vertexColors: true, roughness: 0.8, metalness: 0 });
  const surfaces = [];
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
    node.geometry.setAttribute("color", colors);
    surfaces.push({ colors, regions, name: node.name, geometry: node.geometry });
  });
  if (!surfaces.length) throw new Error("GLB에 스킨 메시가 없습니다.");

  function colorize(channel) {
    if (ghost) return;
    const selected = { lean: "torso", shiftX: "hips" }[channel] ?? channel;
    const color = new T.Color();
    for (const { colors, regions, name } of surfaces) {
      for (const [index, region] of regions.entries()) {
        let base = trousers;
        if (region === "head" || region === "hand") base = skin;
        if (region === "swing" || region === "torso") base = shirt;
        if (region === "shoe" || region === "heelR") base = shoes;
        if (name.toLowerCase().includes("eyebrow")) base = shoes;
        if (name.toLowerCase() === "eyes") base = iris;
        color.copy(base);
        if (selected) {
          if (selected === region || (selected === "swing" && region === "hand")) color.copy(highlight);
          else color.lerp(neutral, 0.63);
        }
        colors.setXYZ(index, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
  }
  colorize();

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
    dispose() {
      surfaces.forEach(surface => surface.geometry.dispose());
      material.dispose();
      root.removeFromParent();
    },
  };
}
