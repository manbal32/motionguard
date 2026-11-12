/* global SwingReference, SwingFindings, SwingExaggeration, SwingPoseAvatar */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const video = byId("original");
  const canvas = byId("joints");
  const ctx = canvas.getContext("2d");
  const alternate = byId("exaggerated");
  const alternateContext = alternate.getContext("2d");
  const factor = byId("compare-factor");
  const paneLabel = byId("compare-pane-label");
  const styles = getComputedStyle(document.documentElement);
  const bones = {
    torso: [[11,12]], hips: [[23,24]], wrist: [[13,15],[14,16]], swing: [[13,15],[14,16]],
    lean: [[33,34]], shiftX: [[35,36]], kneeL: [[23,25],[25,27]], kneeR: [[24,26],[26,28]], heelR: [[28,30]],
  };
  let comparison;
  let activeFinding;
  const phases = [
    ["address", "어드레스"], ["top", "백스윙 탑"], ["down", "다운스윙"],
    ["impact", "임팩트"], ["finish", "피니시"],
  ];
  const channels = [["swing", "스윙각"], ["torso", "몸통 회전"], ["hips", "골반 회전"],
    ["lean", "기울기"], ["wrist", "손목"]];
  const FACE_LANDMARKS = new Set([
    "NOSE", "LEFT_EYE_INNER", "RIGHT_EYE_INNER", "LEFT_EYE", "RIGHT_EYE",
    "LEFT_EYE_OUTER", "RIGHT_EYE_OUTER", "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
  ]);
  const links = [
    [11,12],[11,13],[13,15],[15,19],[12,14],[14,16],[16,20],
    [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],
    [24,26],[26,28],[28,30],[30,32]];
  const drawnJoints = new Set(links.flat());
  let selected;
  let mediaUrl;
  let duration;
  let request;
  let evidence;
  let viewer;
  let viewerAssets;
  let loopBounds;
  const loop = byId("compare-loop");
  const summaryPanel = byId("summary-review");
  const summaryFields = [...summaryPanel.querySelectorAll("textarea")];
  const approve = byId("summary-approve");
  const preview = byId("upload-preview");
  let messages = [];
  let chatRequest;
  let providerMode = "demo";
  const consent = byId("coach-consent");
  const message = byId("coach-message");
  const coachStatus = byId("coach-status");
  const coachForm = byId("coach-form");
  const desktopKeyboard = matchMedia("(pointer: fine)");
  let composing = false;

  function showMode() {
    byId("coach-mode").textContent = consent.checked && providerMode === "gemini" ? "Gemini 연결 설정됨" : "데모 모드";
  }

  fetch("/api/coaching/status").then(response => response.json()).then(data => {
    providerMode = data.mode;
    showMode();
  }).catch(showMode);
  consent.addEventListener("change", showMode);

  async function coachPost(path, data, signal) {
    const response = await fetch("/api/coaching/" + path, {
      method: "POST", headers: {"Content-Type": "application/json"}, signal,
      body: JSON.stringify({ ...(path === "analyze" ? {} : {messages}), ...data, allow_external: consent.checked }),
    });
    return readResponse(response);
  }

  function chatLine(label, value) {
    const line = node("li");
    line.append(node("strong", label), node("span", value));
    byId("coach-log").append(line);
    const log = byId("coach-log");
    log.scrollTop = log.scrollHeight;
    return line;
  }

  message.addEventListener("compositionstart", () => { composing = true; });
  message.addEventListener("compositionend", () => { composing = false; });
  message.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229 || composing) return;
    event.preventDefault();
    if (!event.repeat) coachForm.requestSubmit();
  });

  coachForm.addEventListener("submit", async event => {
    event.preventDefault();
    const value = message.value.trim();
    if (!selected || selected.csv || request || chatRequest || composing || !value) return;
    if (messages.length >= 20) {
      coachStatus.textContent = "상담 10턴을 기록했습니다. 분석하기를 눌러 주세요.";
      return;
    }
    const controller = new AbortController();
    summaryPanel.hidden = true;
    chatRequest = controller;
    byId("coach-send").disabled = byId("start").disabled = consent.disabled = true;
    message.readOnly = true;
    coachForm.setAttribute("aria-busy", "true");
    messages.push({role: "user", text: value});
    const line = chatLine("나", value);
    coachStatus.textContent = "답변을 기다리는 중입니다.";
    try {
      const reply = await coachPost("chat", {}, controller.signal);
      if (controller.signal.aborted) return;
      messages.push({role: "assistant", text: reply.text});
      chatLine(reply.mode === "gemini" ? "Gemini 코치" : "데모 응답", reply.text);
      message.value = "";
      coachStatus.textContent = reply.reason ? (consent.checked ? reply.reason : "외부 전송 없이 데모로 진행합니다.") : "";
    } catch (error) {
      if (controller.signal.aborted) return;
      messages.pop();
      line.remove();
      coachStatus.textContent = error.message + " 입력한 메시지를 다시 보낼 수 있습니다.";
    } finally {
      if (chatRequest === controller) {
        chatRequest = undefined;
        byId("coach-send").disabled = byId("start").disabled = consent.disabled = false;
        message.readOnly = false;
        coachForm.removeAttribute("aria-busy");
        if (desktopKeyboard.matches && (document.activeElement === message || document.activeElement === document.body)) {
          message.focus({preventScroll: true});
        }
      }
    }
  });

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function quantity(value, unit) {
    const el = node("span", value, "num");
    el.append(node("small", unit));
    return el;
  }

  function report(stage, percent) {
    byId("status").textContent = stage;
    byId("progress-bar").value = percent;
    byId("percent").replaceChildren(quantity(String(percent), "%"));
  }

  function select(file, csv = false) {
    if (request || !file) return;
    summaryPanel.hidden = true;
    preview.pause();
    preview.removeAttribute("src");
    preview.hidden = true;
    chatRequest?.abort();
    chatRequest = undefined;
    composing = message.readOnly = false;
    coachForm.removeAttribute("aria-busy");
    messages = [];
    message.value = coachStatus.textContent = "";
    byId("coach-log").replaceChildren();
    byId("coach-panel").hidden = true;
    byId("coach-send").disabled = consent.disabled = false;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = undefined;
    evidence = undefined;
    comparison = activeFinding = undefined;
    loopBounds = undefined;
    loop.disabled = true;
    loop.setAttribute("aria-pressed", "false");
    selected = undefined;
    duration = undefined;
    for (const id of ["zoom-person", "toggle-joints", "compare-reference"]) byId(id).setAttribute("aria-pressed", "true");
    byId("overlay").hidden = byId("phases").hidden = true;
    for (const id of ["findings", "swing-view", "export"]) byId(id).hidden = true;
    window.Swing3D?.dispose();
    byId("swing-details").open = false;
    viewer = undefined;
    byId("start").disabled = true;
    report("대기 중", 0);
    byId("file-info").replaceChildren(node("span", file.name), " · ",
      quantity((file.size / 1e6).toFixed(2), "MB"));
    if (file.size === 0 || file.size > (csv ? 16 * 1024 * 1024 : 150e6)) {
      report("파일 크기를 확인하고 제한 이내의 파일을 선택해 주세요.", 0);
      return;
    }
    if (csv) {
      selected = { file, csv };
      byId("start").disabled = false;
      return;
    }
    if (!/\.(mp4|mov)$/i.test(file.name)) {
      report("MP4 또는 MOV 영상으로 다시 선택해 주세요.", 0);
      return;
    }
    const candidate = URL.createObjectURL(file);
    mediaUrl = candidate;
    video.src = candidate;
    video.onloadedmetadata = () => {
      if (candidate !== mediaUrl) return;
      duration = video.duration;
      byId("file-info").append(" · ", quantity(duration.toFixed(2), "초"));
      if (!Number.isFinite(duration) || duration > 30) {
        report("영상을 30초 이하로 잘라 다시 선택해 주세요.", 0);
        return;
      }
      selected = { file, csv };
      byId("start").disabled = false;
      preview.src = candidate;
      preview.hidden = false;
      byId("coach-panel").hidden = false;
      showMode();
    };
    video.onerror = () => {
      if (candidate === mediaUrl) report("이 영상은 브라우저에서 읽을 수 없습니다. H.264 MP4로 저장해 다시 선택해 주세요.", 0);
    };
  }

  async function readResponse(response) {
    if (!response.ok || !response.headers.get("Content-Type")?.includes("application/x-ndjson")) {
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.reason);
      return data;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    let result;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += value;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          const event = JSON.parse(line);
          if (event.type === "progress") report(event.stage, event.percent);
          if (event.type === "error") throw new Error(event.reason);
          if (event.type === "result") result = event.data;
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!result) throw new Error("분석 응답이 끝나지 않았습니다.");
    return result;
  }

  async function reviewSummary() {
    if (!selected || request || chatRequest) return;
    if (selected.csv) return analyze();
    const controller = new AbortController();
    request = controller;
    byId("start").disabled = byId("coach-send").disabled = consent.disabled = true;
    summaryPanel.hidden = true;
    report("상담 요약 준비", 0);
    try {
      const result = await coachPost("summary", {}, controller.signal);
      for (const input of summaryFields) {
        input.value = result.summary[input.name];
        input.readOnly = true;
      }
      byId("summary-origin").textContent = result.mode === "gemini" ? "Gemini 요약 · 확인이 필요합니다"
        : "로컬 정리 · " + (result.reason ?? "사용자 입력을 확인해 주세요.");
      summaryPanel.hidden = false;
      byId("summary-heading").focus();
      report("상담 요약 확인 대기", 0);
    } catch (error) {
      report("요약을 불러오지 못했습니다. 분석하기로 다시 시도해 주세요. " + error.message, 0);
    } finally {
      request = undefined;
      byId("start").disabled = byId("coach-send").disabled = consent.disabled = false;
    }
  }

  byId("summary-edit").onclick = () => {
    for (const input of summaryFields) input.readOnly = false;
    summaryFields[0].focus();
  };
  byId("summary-cancel").onclick = () => {
    summaryPanel.hidden = true;
    report("상담 요약을 닫았습니다.", 0);
    byId("start").focus();
  };
  approve.onclick = () => {
    if (!summaryPanel.hidden) analyze(Object.fromEntries(summaryFields.map(input => [input.name, input.value])));
  };

  async function analyze(approvedSummary) {
    if (!selected || request || chatRequest) return;
    const { file, csv } = selected;
    if (!csv && !approvedSummary) return;
    const controller = new AbortController();
    request = controller;
    byId("start").disabled = byId("video").disabled = byId("csv").disabled = true;
    byId("cancel").disabled = false;
    byId("coach-send").disabled = consent.disabled = true;
    approve.disabled = byId("summary-edit").disabled = byId("summary-cancel").disabled = true;
    for (const input of summaryFields) input.readOnly = true;
    preview.pause();
    report(csv ? "좌표 읽기" : "좌표 추출 준비", 0);
    try {
      const response = await fetch(csv ? "/api/track" : "/api/video", {
        method: "POST", body: file, signal: controller.signal,
        headers: { Accept: csv ? "application/json" : "application/x-ndjson" },
      });
      const track = await readResponse(response);
      if (controller.signal.aborted) return;
      evidence = track.evidence;
      activeFinding = undefined;
      comparison = { track, reference: SwingReference.expand(track), displayed: track.track, options: [] };
      if (evidence) setupVideo();
      setupStills(track);
      let coaching;
      if (!csv) {
        report("상담과 영상 계측 종합 중", 97);
        coaching = await coachPost("analyze", {track_id: track.track_id, approved: true,
          conversation_summary: approvedSummary}, controller.signal);
      }
      report("계측 완료", 100);
      await setupFindings(track, coaching);
      summaryPanel.hidden = true;

    } catch (error) {
      report(controller.signal.aborted ? "분석을 취소했습니다." : (error.message || "분석에 실패했습니다.")
        + " 전신이 보이는 MP4를 선택하거나 좌표 CSV로 다시 시도해 주세요.", 0);
    } finally {
      request = undefined;
      byId("start").disabled = byId("video").disabled = byId("csv").disabled = false;
      byId("cancel").disabled = true;
      byId("coach-send").disabled = consent.disabled = false;
      approve.disabled = byId("summary-edit").disabled = byId("summary-cancel").disabled = false;
    }
  }

  function jump(frame) {
    if (!evidence) return;
    video.pause();
    // Seek just inside the requested frame rather than on a rounded frame boundary.
    video.currentTime = Math.min(duration, (frame + 0.05) / evidence.fps);
  }

  function updateOverlay(mediaTime = video.currentTime) {
    if (!evidence || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight || alternate.width !== video.videoWidth) {
      canvas.width = alternate.width = video.videoWidth;
      canvas.height = alternate.height = video.videoHeight;
    }
    byId("compare-stage").style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
    const frame = Math.max(0, Math.min(evidence.frames.length - 1, Math.floor(mediaTime * evidence.fps + 0.001)));
    canvas.dataset.frame = alternate.dataset.frame = String(frame);
    const { width, height } = canvas;
    const time = byId("timecode");
    time.replaceChildren(quantity(video.currentTime.toFixed(2), "s"), " · ", quantity(String(frame), "프레임"));
    byId("seek").value = String(video.currentTime);
    const phase = phases.find(([key]) => evidence.phase_frames[key] === frame)
      ?? phases.findLast(([key]) => evidence.phase_frames[key] <= frame);
    byId("phase-label").textContent = phase?.[1] ?? "어드레스 전";
    ctx.clearRect(0, 0, width, height);
    alternateContext.clearRect(0, 0, width, height);
    const points = evidence.frames[frame];
    const sample = sampleIndex(frame);
    updateValues(sample);
    if (!points) {
      byId("compare-cue").textContent = "이 프레임에서 관절을 추적하지 못했습니다.";
      return;
    }
    const zoom = byId("zoom-person").getAttribute("aria-pressed") === "true" ? evidence.overlay_crop?.[2] ?? 1 : 1;
    const scale = video.clientWidth / width / zoom;
    if (!(scale > 0)) return;
    const measured = points.map(([x,y,visibility]) => [x * width, y * height, visibility]);
    const baseline = comparison.track.track[sample];
    const desired = comparison.displayed[sample];
    const displayed = project(measured, baseline, channel => desired[comparison.track.channels.indexOf(channel)]);
    const skeleton = project(measured, baseline, channel => baseline[comparison.track.channels.indexOf(channel)]);
    const overlayReference = byId("compare-reference").getAttribute("aria-pressed") === "true";
    const heightPoints = measured.filter((point, i) => !FACE_LANDMARKS.has(evidence.landmark_names[i]) && point[2] >= 0.45);
    const ys = heightPoints.map(point => point[1]);
    const personHeight = ys.length > 1 ? (Math.max(...ys) - Math.min(...ys)) * scale : 0;
    const line = Math.min(1.4, Math.max(0.35, personHeight * 0.009));
    const diameter = Math.min(3, Math.max(0.8, personHeight * 0.019));
    const reference = overlayReference && activeFinding && !activeFinding.positive ? project(measured, baseline, channel =>
      channel === activeFinding.channel ? comparison.reference[sample][SwingReference.channels.indexOf(channel)]
        : baseline[comparison.track.channels.indexOf(channel)]) : null;
    const show = byId("toggle-joints").getAttribute("aria-pressed") === "true";
    if (show) paint(ctx, skeleton, reference, scale, line, diameter);
    const colors = {far: styles.getPropertyValue("--ink-3").trim(), near: "#66716b",
      shirt: styles.getPropertyValue("--ink-2").trim(), skin: "#c8c9c1", shoes: "#a9ada7"};
    if (reference && hasDeviation(sample)) SwingPoseAvatar.paint(alternateContext, reference, colors, .24);
    SwingPoseAvatar.paint(alternateContext, displayed, colors);
    canvas.dataset.pelvis = SwingPoseAvatar.anatomy(skeleton).pelvis.join(",");
    alternate.dataset.pelvis = SwingPoseAvatar.anatomy(displayed).pelvis.join(",");
    paint(alternateContext, displayed, reference, scale, line, diameter);
    paintCue(skeleton, displayed, scale);
  }

  function sampleIndex(frame) {
    const start = comparison.track.meta.source_frames?.[0] ?? 0;
    return Math.max(0, Math.min(comparison.track.track.length - 1, frame - start));
  }

  function midpoint(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2])];
  }

  // Apply display deltas in image pixels, keeping the measured pelvis as the common origin.
  function project(points, baseline, value) {
    const pose = points.map(point => point.slice());
    const delta = channel => {
      const difference = value(channel) - baseline[comparison.track.channels.indexOf(channel)];
      return Math.max(-Math.PI / 6, Math.min(Math.PI / 6, difference));
    };
    const pelvis = midpoint(pose[23], pose[24]);
    const shoulders = midpoint(pose[11], pose[12]);
    function rotate(indices, pivot, angle) {
      if (!angle) return;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const index of indices) {
        const point = pose[index];
        const x = point[0] - pivot[0], y = point[1] - pivot[1];
        point[0] = pivot[0] + x * cos - y * sin;
        point[1] = pivot[1] + x * sin + y * cos;
      }
    }
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Limit the displacement of the two torso attachments to 15% of their measured lengths.
    function turnTorso(indices, pivot, angle, attachments) {
      const bound = Math.min(...attachments.map(([moving, fixed]) =>
        2 * Math.asin(Math.min(1, 0.075 * distance(pose[moving], pose[fixed]) /
          Math.max(1e-9, distance(pose[moving], pivot))))));
      rotate(indices, pivot, Math.sign(angle) * Math.min(Math.abs(angle), bound));
    }
    const upper = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
    turnTorso(upper, shoulders, delta("torso"), [[11,23],[12,24]]);
    turnTorso(upper, pelvis, delta("lean"), [[11,23],[12,24]]);
    // Keep each ankle and shoe at its measured position. Resolve knees against those fixed endpoints.
    if (delta("hips")) {
      const solve = fraction => {
        [pose[23], pose[24]] = [points[23].slice(), points[24].slice()];
        turnTorso([23,24], pelvis, delta("hips") * fraction, [[23,11],[24,12]]);
        return [0, 1].map(side => {
          const [hip, knee, ankle] = [23,25,27].map(i => points[i + side]);
          const moved = pose[23 + side];
          const a = distance(hip, knee), b = distance(knee, ankle), d = distance(moved, ankle);
          if (d < 1e-6 || d > a + b || d < Math.abs(a - b)) return null;
          const x = (ankle[0] - moved[0]) / d, y = (ankle[1] - moved[1]) / d;
          const along = (a * a - b * b + d * d) / (2 * d);
          const turn = Math.sign((ankle[0] - hip[0]) * (knee[1] - hip[1]) - (ankle[1] - hip[1]) * (knee[0] - hip[0])) || 1;
          const off = turn * Math.sqrt(Math.max(0, a * a - along * along));
          return [moved[0] + x * along - y * off, moved[1] + y * along + x * off, knee[2]];
        });
      };
      let knees = solve(1);
      if (!knees.every(Boolean)) {
        let low = 0, high = 1;
        for (let i = 0; i < 18; i++) {
          const mid = (low + high) / 2;
          if (solve(mid).every(Boolean)) low = mid;
          else high = mid;
        }
        knees = solve(low);
      }
      if (knees.every(Boolean)) [pose[25], pose[26]] = knees;
      else [pose[23], pose[24]] = [points[23].slice(), points[24].slice()];
    }
    rotate([13,15,17,19,21], pose[11], delta("swing"));
    rotate([14,16,18,20,22], pose[12], delta("swing"));
    rotate([15,17,19,21], pose[13], delta("wrist"));
    rotate([16,18,20,22], pose[14], delta("wrist"));
    // A single 2D view cannot alter knee flex or heel lift with fixed contact and limb lengths.
    // paintCue shows the difference without moving those anchors.
    pose.push(midpoint(pose[11], pose[12]), pelvis,
      [pelvis[0] + delta("shiftX") * canvas.width, pelvis[1] - canvas.height * 0.12, pelvis[2]],
      [pelvis[0] + delta("shiftX") * canvas.width, pelvis[1] + canvas.height * 0.12, pelvis[2]]);
    return pose;
  }

  function paint(context, pose, reference, scale, line, diameter) {
    function segment(points, [a,b], color, width, opacity) {
      context.strokeStyle = color;
      context.lineWidth = width / scale;
      context.globalAlpha = opacity * Math.min(points[a][2], points[b][2]);
      context.beginPath();
      context.moveTo(points[a][0], points[a][1]);
      context.lineTo(points[b][0], points[b][1]);
      context.stroke();
    }
    const highlighted = bones[activeFinding?.channel] ?? [];
    if (reference) {
      context.setLineDash([4 / scale, 3 / scale]);
      for (const link of highlighted) segment(reference, link, styles.getPropertyValue("--ink-2").trim(), 1.6, 1);
      context.setLineDash([]);
    }
    const ink = styles.getPropertyValue("--ink").trim();
    if (context === ctx) {
      const contrast = styles.getPropertyValue("--ground").trim();
      for (const link of links) segment(pose, link, contrast, line + 1.2, 1);
      const {head, neck} = SwingPoseAvatar.anatomy(pose);
      segment([[...neck, .85], [...head, .85]], [0, 1], styles.getPropertyValue("--ink-2").trim(), line, 1);
      context.beginPath();
      context.ellipse(head[0], head[1], 2 / scale, 2 / scale, 0, 0, 2 * Math.PI);
      context.stroke();
    }
    for (const link of links) segment(pose, link, ink, line, 1);
    const signal = getComputedStyle(document.documentElement).getPropertyValue("--signal").trim();
    if (hasDeviation(comparison.sample)) {
      for (const link of highlighted) segment(pose, link, signal, line * 3.2, 1);
    } else if (activeFinding?.positive && inFindingRange(comparison.sample)) {
      for (const link of highlighted) segment(pose, link, ink, line * 2.2, 1);
    }
    context.fillStyle = ink;
    for (const [index, [x, y, confidence]] of pose.slice(0, evidence.landmark_names.length).entries()) {
      if (!drawnJoints.has(index) || FACE_LANDMARKS.has(evidence.landmark_names[index])) continue;
      context.globalAlpha = Math.max(0, Math.min(1, confidence));
      context.beginPath();
      context.arc(x, y, diameter / (2 * scale), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function inFindingRange(sample) {
    if (!activeFinding) return false;
    const { meta, track } = comparison.track;
    const time = (meta.hold + (meta.dur - meta.hold) * sample / Math.max(1, track.length - 1)) / meta.dur;
    return time >= activeFinding.range[0] && time <= activeFinding.range[1];
  }

  function hasDeviation(sample) {
    if (activeFinding?.positive || !inFindingRange(sample)) return false;
    const { channel } = activeFinding;
    const measured = comparison.track.track[sample][comparison.track.channels.indexOf(channel)];
    const reference = comparison.reference[sample][SwingReference.channels.indexOf(channel)];
    return Math.abs(measured - reference) >= (["shiftX", "heelR"].includes(channel) ? 0.02 : 8 * Math.PI / 180);
  }

  function paintCue(measured, shown, scale) {
    const output = byId("compare-cue");
    output.textContent = "";
    if (activeFinding?.positive && inFindingRange(comparison.sample)) {
      output.textContent = "유지할 동작 · " + activeFinding.label;
      return;
    }
    if (!hasDeviation(comparison.sample)) return;
    const channel = activeFinding.channel;
    const index = comparison.track.channels.indexOf(channel);
    const actual = comparison.track.track[comparison.sample][index];
    const target = comparison.reference[comparison.sample][SwingReference.channels.indexOf(channel)];
    const normalized = channel === "shiftX" || channel === "heelR";
    const difference = (actual - target) * (normalized ? 1 : 180 / Math.PI);
    output.replaceChildren(activeFinding.label + " · 참고 대비 ", quantity(difference.toFixed(normalized ? 3 : 1), normalized ? "정규화" : "°"));
    const joints = [...new Set(bones[channel].flat())];
    const movement = i => Math.hypot(shown[i][0] - measured[i][0], shown[i][1] - measured[i][1]);
    const joint = joints.reduce((a, b) => movement(b) > movement(a) ? b : a);
    if (Number(factor.value) === 1) return;
    const c = alternateContext;
    const position = measured[joint];
    const start = Math.atan2(measured[joints[0]][1] - measured[joints.at(-1)][1], measured[joints[0]][0] - measured[joints.at(-1)][0]);
    const size = 19 / scale;
    const visible = movement(joint) * scale >= 3;
    const turn = Math.sign(difference) * Math.min(1.3, Math.max(.38, Math.abs(actual - target) * (normalized ? 8 : 1)));
    if (!visible) output.append(" · 발과 관절 연결을 유지하며 호와 화살표로 차이를 표시합니다.");
    c.save();
    c.strokeStyle = styles.getPropertyValue("--signal").trim();
    c.lineWidth = 1.6 / scale;
    c.beginPath();
    let x, y, heading;
    if (visible) {
      [x, y] = shown[joint];
      heading = Math.atan2(y - position[1], x - position[0]);
      c.moveTo(position[0], position[1]);
      c.lineTo(x, y);
    } else {
      c.ellipse(position[0], position[1], size, size, 0, start, start + turn, turn < 0);
      x = position[0] + size * Math.cos(start + turn);
      y = position[1] + size * Math.sin(start + turn);
      heading = start + turn + Math.sign(turn) * Math.PI / 2;
    }
    for (const angle of [-.55, .55]) {
      c.moveTo(x, y);
      c.lineTo(x - 6 / scale * Math.cos(heading + angle), y - 6 / scale * Math.sin(heading + angle));
    }
    c.stroke();
    c.restore();
  }

  function updateValues(sample) {
    comparison.sample = sample;
    const output = byId("compare-values");
    if (!activeFinding) { output.textContent = ""; return; }
    const channel = activeFinding.channel;
    const index = comparison.track.channels.indexOf(channel);
    const measured = comparison.track.track[sample][index];
    const reference = comparison.reference[sample][SwingReference.channels.indexOf(channel)];
    const displayed = comparison.displayed[sample][index];
    const normalized = channel === "shiftX" || channel === "heelR";
    const show = value => quantity((value * (normalized ? 1 : 180 / Math.PI)).toFixed(normalized ? 3 : 1), normalized ? "정규화" : "°");
    const entry = (label, value, style) => {
      const item = node("span", label + " ", style);
      item.append(show(value));
      return item;
    };
    output.replaceChildren(node("strong", SwingFindings.channels[channel] ?? channel),
      entry("측정", measured), entry("교본", reference, "reference"),
      entry("차이", measured - reference), entry(activeFinding.positive ? "유지 표시" : "과장 표시", displayed,
        hasDeviation(sample) ? "delta" : ""));
    const card = [...byId("finding-options").querySelectorAll("button")].find(button => button.dataset.finding === activeFinding.id);
    if (card) card.querySelector(".finding-numbers").replaceChildren(entry("측정", measured), entry("교본", reference, "reference"));
  }

  function changeFactor() {
    if (!comparison) return;
    comparison.displayed = SwingExaggeration.apply(comparison.track, comparison.reference,
      activeFinding?.positive ? null : activeFinding, Number(factor.value));
    const value = (activeFinding?.positive ? 1 : Number(factor.value)).toFixed(1);
    byId("compare-caption").replaceChildren(activeFinding?.positive ? "유지 " : "과장 ", quantity(value, "×"));
    byId("compare-factor-value").replaceChildren(quantity(value, "×"));
    if (evidence) updateOverlay();
    else updateValues(comparison.sample ?? 0);
  }

  function chooseFinding(id, seek = true) {
    activeFinding = comparison.options.find(item => item.id === id);
    if (!activeFinding) return;
    for (const button of byId("finding-options").querySelectorAll("button")) {
      const numbers = button.querySelector(".finding-numbers");
      if (!button.findingNumbers) button.findingNumbers = numbers.cloneNode(true);
      if (button.dataset.finding !== id) numbers.replaceWith(button.findingNumbers.cloneNode(true));
      button.setAttribute("aria-pressed", String(button.dataset.finding === id));
    }
    const { meta } = comparison.track;
    const start = meta.source_frames?.[0] ?? 0;
    const frameAt = time => start + Math.max(0, Math.min(comparison.track.track.length - 1,
      (time * meta.dur - meta.hold) * (comparison.track.track.length - 1) / (meta.dur - meta.hold)));
    const [left, right] = activeFinding.range.map(frameAt);
    const band = byId("compare-range");
    band.classList.toggle("positive-range", !!activeFinding.positive);
    if (evidence) {
      const timeline = evidence.fps * duration;
      loopBounds = [left / evidence.fps, Math.min(duration, (right + 1) / evidence.fps)];
      loop.disabled = loopBounds[1] <= loopBounds[0];
      band.style.left = 100 * left / timeline + "%";
      band.style.width = 100 * (right - left) / timeline + "%";
    }
    band.hidden = !evidence;
    comparison.sample = sampleIndex(Math.round((left + right) / 2));
    factor.disabled = !!activeFinding.positive;
    factor.value = activeFinding.positive ? 1 : SwingExaggeration.levels[activeFinding.severity] ?? 2;
    paneLabel.textContent = activeFinding.positive ? "같은 프레임 · 유지할 동작" : "같은 프레임 · 교육용 과장";
    const warning = byId("compare-warning");
    warning.classList.toggle("positive-note", !!activeFinding.positive);
    warning.textContent = activeFinding.positive ? "오른쪽은 같은 프레임의 실측 관절로 재구성한 유지 동작입니다."
      : "오른쪽은 교육용 과장이며 측정값이 아닙니다 · 왼쪽 수치가 실제 측정입니다";
    changeFactor();
    if (evidence && seek) jump(activeFinding.frame ?? Math.round(frameAt((activeFinding.range[0] + activeFinding.range[1]) / 2)));
  }

  function updateZoom() {
    const zoom = byId("zoom-person").getAttribute("aria-pressed") === "true";
    const [x, y, size] = zoom && evidence?.overlay_crop ? evidence.overlay_crop : [0, 0, 1];
    byId("video-layer").style.transform = alternate.style.transform = `translate(${-100 * x / size}%, ${-100 * y / size}%) scale(${1 / size})`;
  }

  function setupVideo() {
    updateZoom();
    const ticks = byId("ticks");
    ticks.replaceChildren();
    byId("seek").max = String(duration);
    for (const [key, label] of phases) {
      const frame = evidence.phase_frames[key];
      const tick = node("button", label);
      tick.dataset.position = Math.min(100, frame / evidence.fps / duration * 100);
      tick.addEventListener("click", () => jump(frame));
      ticks.append(tick);
    }
    byId("overlay").hidden = false;
    layoutTicks();
    jump(evidence.phase_frames.address);
    updateOverlay();
  }

  function layoutTicks() {
    const ticks = byId("ticks");
    const width = ticks.clientWidth;
    const rows = [[], []];
    for (const button of [...ticks.children].reverse()) {
      button.style.visibility = "";
      const start = Math.min(Math.max(0, width - button.offsetWidth), width * parseFloat(button.dataset.position) / 100);
      const end = start + button.offsetWidth;
      button.style.left = start + "px";
      const row = rows.findIndex(items => items.every(([a, b]) => end + 2 <= a || start >= b + 2));
      button.style.visibility = row < 0 ? "hidden" : "";
      button.style.top = row === 1 ? "12px" : "0";
      if (row >= 0) rows[row].push([start, end]);
    }
  }

  new ResizeObserver(layoutTicks).observe(byId("ticks"));

  function setupStills(track) {
    const stills = byId("stills");
    stills.replaceChildren();
    const low = phases.filter(([key]) => track.meta.phase_confidence?.[key] < 0.45);
    byId("confidence").textContent = low.length
      ? "추적 신뢰도 낮음 · " + low.map(([, label]) => label).join(" · ")
      : "각도는 영상의 관절 좌표에서 추정한 값입니다.";
    for (const [phase, label] of phases) {
      const record = node("article", undefined, "phase-record");
      const position = (track.events[phase] * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold);
      const start = track.meta.source_frames?.[0] ?? 0;
      const frame = evidence?.phase_frames[phase] ?? track.meta.phase_frames?.[phase]
        ?? start + Math.round(position * (track.track.length - 1));
      const sample = Math.max(0, Math.min(track.track.length - 1, frame - start));
      const title = node("h3", label);
      if (evidence) {
        const button = node("button");
        const image = node("img");
        image.src = "/api/still/" + encodeURIComponent(evidence.id) + "/" + phase;
        image.alt = label + " 원본 프레임";
        image.addEventListener("error", () => image.replaceWith(node("p", "스틸컷을 읽지 못했습니다. 영상을 다시 분석해 주세요.")), { once: true });
        button.append(image, title, quantity(String(frame), "프레임"));
        button.lastChild.classList.add("frame");
        button.addEventListener("click", () => jump(frame));
        record.append(button);
      } else {
        record.append(title, quantity(String(frame), "프레임"));
      }
      const table = node("table");
      table.setAttribute("aria-label", label + " 각도");
      const headings = table.createTHead().insertRow();
      for (const text of ["채널", "측정", "교본"]) headings.append(node("th", text));
      const body = table.createTBody();
      for (const [channel, channelLabel] of channels) {
        const row = body.insertRow();
        const measured = track.track[sample][track.channels.indexOf(channel)] * 180 / Math.PI;
        const reference = comparison.reference[sample][SwingReference.channels.indexOf(channel)] * 180 / Math.PI;
        const isMeasured = channel !== "wrist" || track.meta.wrist_source === "index";
        const heading = node("th", channelLabel);
        heading.scope = "row";
        row.append(heading);
        const input = row.insertCell();
        input.append(isMeasured ? quantity(measured.toFixed(1), "°") : node("span", "—", "reference"));
        const model = row.insertCell();
        model.append(quantity(reference.toFixed(1), "°"));
        model.className = "reference";
        if (isMeasured && Math.abs(measured - reference) >= 8) input.className = "delta";
      }
      record.append(table);
      stills.append(record);
    }
    byId("phases").hidden = false;
  }

  async function setupFindings(track, coaching) {
    const doc = coaching ?? await SwingFindings.load(track);
    byId("findings").hidden = false;
    byId("swing-view").hidden = false;
    byId("overlay").hidden = false;
    byId("comparison-panes").hidden = byId("video-transport").hidden = !evidence;
    byId("comparison-unavailable").hidden = !!evidence;
    byId("compare-range").hidden = true;
    byId("compare-values").replaceChildren();
    activeFinding = undefined;
    loopBounds = undefined;
    loop.disabled = true;
    loop.setAttribute("aria-pressed", "false");
    factor.value = 1;
    paneLabel.textContent = "같은 프레임 · 교육용 과장";
    byId("compare-warning").classList.remove("positive-note");
    byId("compare-warning").textContent = "오른쪽은 교육용 과장이며 측정값이 아닙니다 · 왼쪽 수치가 실제 측정입니다";
    comparison.options = SwingFindings.choices(byId("finding-options"), doc, track, chooseFinding);
    factor.disabled = comparison.options.length === 0;
    if (comparison.options.length) chooseFinding(comparison.options[0].id);
    else changeFactor();
    SwingFindings.render(byId("finding-body"), track, doc, id => {
      chooseFinding(id);
      byId("overlay").scrollIntoView({ block: "start" });
    });
    window.Swing3D?.dispose();
    viewer = undefined;
    byId("swing-details").open = false;
    comparison.findings = doc;
    byId("export").hidden = false;
    byId("record").disabled = false;
    byId("record-progress").textContent = "";
    const reportLink = byId("open-report");
    reportLink.href = "/report/" + encodeURIComponent(track.track_id)
      + (coaching?.report_id ? "?coaching=" + coaching.report_id : "");
    reportLink.onclick = async event => {
      if (!coaching?.report_id || !evidence || video.readyState < 2) return;
      event.preventDefault();
      video.pause();
      if (video.seeking) await new Promise(resolve => video.addEventListener("seeked", resolve, {once: true}));
      updateOverlay();
      const snapshot = document.createElement("canvas");
      snapshot.width = 960;
      const height = snapshot.height = Math.round(480 * video.videoHeight / video.videoWidth);
      const draw = snapshot.getContext("2d");
      const [x, y, size] = byId("zoom-person").getAttribute("aria-pressed") === "true" ? evidence.overlay_crop : [0, 0, 1];
      const crop = [x * video.videoWidth, y * video.videoHeight, size * video.videoWidth, size * video.videoHeight];
      draw.fillStyle = styles.getPropertyValue("--ground").trim();
      draw.fillRect(0, 0, 960, height);
      draw.drawImage(video, ...crop, 0, 0, 480, height);
      draw.drawImage(canvas, ...crop, 0, 0, 480, height);
      draw.drawImage(alternate, ...crop, 480, 0, 480, height);
      try {
        sessionStorage.setItem("motionguard:" + coaching.report_id, JSON.stringify({
          image: snapshot.toDataURL("image/jpeg", 0.88), factor: Number(factor.value),
          frame: Math.floor(video.currentTime * evidence.fps + 0.001), label: activeFinding?.label,
          positive: !!activeFinding?.positive,
          values: [...byId("compare-values").children].map(item => item.textContent).join(" · "),
        }));
      } catch {
        // The report still has the measured phase stills if session storage is unavailable.
      }
      location.assign(reportLink.href);
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = node("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error("3D 스크립트 로딩 실패")); };
      document.head.append(script);
    });
  }

  async function openViewer() {
    if (viewer || !comparison?.findings) return viewer;
    const current = comparison;
    const host = byId("viewer");
    try {
      viewerAssets ??= (async () => {
        if (!window.THREE) await loadScript("/vendor/three/three.min.js");
        if (!window.Swing3D) await loadScript("/swing3d.js");
      })().catch(error => { viewerAssets = undefined; throw error; });
      await viewerAssets;
      if (comparison !== current) return;
      viewer ??= window.Swing3D.mount(host, current.track, {
        findings: current.findings, autoplay: false, externalFindings: true,
      });
      return viewer;
    } catch {
      host.textContent = "3D를 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.";
    }
  }
  byId("swing-details").addEventListener("toggle", event => {
    if (event.currentTarget.open) openViewer();
  });

  byId("record").addEventListener("click", async () => {
    const button = byId("record");
    const status = byId("record-progress");
    button.disabled = true;
    byId("swing-details").open = true;
    if (!await openViewer()) {
      button.disabled = false;
      status.textContent = "3D를 열지 못했습니다.";
      return;
    }
    button.disabled = byId("start").disabled = byId("video").disabled = byId("csv").disabled = true;
    const upload = byId("upload");
    upload.inert = true;
    try {
      const { blob, filename } = await viewer.record(percent => {
        status.replaceChildren("녹화 중 · ", quantity(String(percent), "%"));
      });
      const url = URL.createObjectURL(blob);
      const link = node("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = "WebM 저장 완료";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      upload.inert = false;
      button.disabled = byId("start").disabled = byId("video").disabled = byId("csv").disabled = false;
    }
  });

  factor.addEventListener("input", changeFactor);
  byId("compare-reference").addEventListener("click", event => {
    const button = event.currentTarget;
    button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
    updateOverlay();
  });
  byId("video").addEventListener("change", event => select(event.target.files[0]));
  byId("csv").addEventListener("change", event => select(event.target.files[0], true));
  const drop = byId("drop");
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.dataset.dragging = ""; });
  drop.addEventListener("dragleave", () => { delete drop.dataset.dragging; });
  drop.addEventListener("drop", event => {
    event.preventDefault();
    delete drop.dataset.dragging;
    select(event.dataTransfer.files[0]);
  });
  byId("start").addEventListener("click", reviewSummary);
  byId("cancel").addEventListener("click", () => request?.abort());
  byId("play").addEventListener("click", () => {
    if (video.paused) {
      wrapLoop(true);
      video.play().catch(() => report("영상을 재생할 수 없습니다. 파일을 다시 선택해 주세요.", 100));
    }
    else video.pause();
  });
  for (const event of ["play", "pause", "ended"]) video.addEventListener(event, () => {
    byId("play").textContent = video.paused ? "재생" : "일시정지";
  });
  function wrapLoop(fromPlay = false) {
    if (!loopBounds || loop.getAttribute("aria-pressed") !== "true" || (!fromPlay && video.paused)) return false;
    const [start, end] = loopBounds;
    if (video.currentTime >= end || (fromPlay && video.currentTime < start)) {
      video.currentTime = start;
      return true;
    }
    return false;
  }
  loop.onclick = () => {
    const enabled = loop.getAttribute("aria-pressed") !== "true";
    loop.setAttribute("aria-pressed", String(enabled));
    if (enabled) wrapLoop(true);
  };
  video.addEventListener("ended", () => {
    if (wrapLoop(true)) video.play().catch(() => {});
  });
  for (const event of ["seeked", "loadeddata", "timeupdate"]) video.addEventListener(event, () => {
    if (!wrapLoop()) updateOverlay();
  });
  if (video.requestVideoFrameCallback) {
    const paint = (_, metadata) => {
      if (!wrapLoop() && !video.seeking) updateOverlay(metadata.mediaTime);
      video.requestVideoFrameCallback(paint);
    };
    video.requestVideoFrameCallback(paint);
  }
  byId("seek").addEventListener("input", event => { video.currentTime = Number(event.target.value); });
  for (const [id, direction] of [["previous", -1], ["next", 1]]) {
    byId(id).addEventListener("click", () => jump(Math.max(0, Math.min(evidence.frames.length - 1,
      Math.floor(video.currentTime * evidence.fps + 0.001) + direction))));
  }
  byId("speed").addEventListener("click", event => {
    video.playbackRate = video.playbackRate === 1 ? 0.5 : 1;
    event.currentTarget.setAttribute("aria-pressed", String(video.playbackRate === 0.5));
  });
  byId("zoom-person").addEventListener("click", event => {
    const toggle = event.currentTarget;
    toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
    updateZoom();
    updateOverlay();
  });
  new ResizeObserver(() => updateOverlay()).observe(video);
  byId("toggle-joints").addEventListener("click", event => {
    const toggle = event.currentTarget;
    toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
    updateOverlay();
  });
})();
