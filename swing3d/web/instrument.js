/* global SwingReference, Swing3D, SwingFindings */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const video = byId("original");
  const canvas = byId("joints");
  const ctx = canvas.getContext("2d");
  const alternate = byId("exaggerated");
  const alternateContext = alternate.getContext("2d");
  const factor = byId("compare-factor");
  const bones = {
    torso: [[11,12]], hips: [[23,24]], wrist: [[13,15],[14,16]], swing: [[13,15],[14,16]],
    lean: [[33,34]], shiftX: [[35,36]], kneeL: [[23,25]], kneeR: [[24,26]], heelR: [[28,30]],
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
    [11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
    [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
    [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],
    [24,26],[26,28],[28,30],[30,32],[28,32]];
  let selected;
  let mediaUrl;
  let duration;
  let request;
  let evidence;
  let viewer;

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
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = undefined;
    evidence = undefined;
    comparison = activeFinding = undefined;
    selected = undefined;
    duration = undefined;
    byId("overlay").hidden = byId("phases").hidden = true;
    for (const id of ["findings", "swing-view", "export"]) byId(id).hidden = true;
    Swing3D.dispose();
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

  async function analyze() {
    if (!selected || request) return;
    const { file, csv } = selected;
    const controller = new AbortController();
    request = controller;
    byId("start").disabled = byId("video").disabled = byId("csv").disabled = true;
    byId("cancel").disabled = false;
    report(csv ? "좌표 읽기" : "좌표 추출 준비", 0);
    try {
      const response = await fetch(csv ? "/api/track" : "/api/video", {
        method: "POST", body: file, signal: controller.signal,
        headers: { Accept: csv ? "application/json" : "application/x-ndjson" },
      });
      const track = await readResponse(response);
      if (controller.signal.aborted) return;
      evidence = track.evidence;
      comparison = { track, reference: SwingReference.expand(track), displayed: track.track, options: [] };
      if (evidence) setupVideo();
      setupStills(track);
      report("계측 완료", 100);
      await setupFindings(track);

    } catch (error) {
      report(controller.signal.aborted ? "분석을 취소했습니다." : (error.message || "분석에 실패했습니다.")
        + " 전신이 보이는 MP4를 선택하거나 좌표 CSV로 다시 시도해 주세요.", 0);
    } finally {
      request = undefined;
      byId("start").disabled = byId("video").disabled = byId("csv").disabled = false;
      byId("cancel").disabled = true;
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
    if (!points) return;
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
    const reference = overlayReference ? project(measured, baseline,
      channel => comparison.reference[sample][SwingReference.channels.indexOf(channel)]) : null;
    const show = byId("toggle-joints").getAttribute("aria-pressed") === "true";
    if (show) paint(ctx, skeleton, reference, scale, line, diameter);
    paint(alternateContext, displayed, reference, scale, line, diameter);
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
    const delta = channel => value(channel) - baseline[comparison.track.channels.indexOf(channel)];
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
    rotate([11,12,13,14,15,16,17,18,19,20,21,22], shoulders, delta("torso"));
    rotate([11,12,13,14,15,16,17,18,19,20,21,22], pelvis, delta("lean"));
    rotate([23,24,25,26,27,28,29,30,31,32], pelvis, delta("hips"));
    rotate([13,15,17,19,21], pose[11], delta("swing"));
    rotate([14,16,18,20,22], pose[12], delta("swing"));
    rotate([17,19,21], pose[15], delta("wrist"));
    rotate([18,20,22], pose[16], delta("wrist"));
    rotate([25,27,29,31], pose[23], delta("kneeL"));
    rotate([26,28,30,32], pose[24], delta("kneeR"));
    rotate([28,30], pose[32], -0.9 * delta("heelR"));
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
    if (reference) for (const link of links) segment(reference, link, "rgba(127,138,133,.75)", 1.6, 1);
    for (const link of links) segment(pose, link, "#e9e7e0", line, 1);
    const signal = getComputedStyle(document.documentElement).getPropertyValue("--signal").trim();
    for (const link of highlighted) segment(pose, link, signal, line * 3.2, 1);
    context.fillStyle = "#e9e7e0";
    for (const [index, [x, y, confidence]] of pose.slice(0, evidence.landmark_names.length).entries()) {
      if (FACE_LANDMARKS.has(evidence.landmark_names[index])) continue;
      context.globalAlpha = Math.max(0, Math.min(1, confidence));
      context.beginPath();
      context.arc(x, y, diameter / (2 * scale), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function updateValues(sample) {
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
      entry("차이", measured - reference), entry("과장 표시", displayed, "delta"));
  }

  function changeFactor() {
    if (!comparison) return;
    comparison.displayed = SwingExaggeration.apply(comparison.track, comparison.reference, activeFinding, Number(factor.value));
    const value = Number(factor.value).toFixed(1);
    byId("compare-caption").replaceChildren("과장 ", quantity(value, "×"));
    byId("compare-factor-value").replaceChildren(quantity(value, "×"));
    if (evidence) updateOverlay();
    else updateValues(comparison.sample ?? 0);
  }

  function chooseFinding(id, seek = true) {
    activeFinding = comparison.options.find(item => item.id === id);
    if (!activeFinding) return;
    for (const button of byId("finding-options").querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.finding === id));
    }
    const { meta } = comparison.track;
    const start = meta.source_frames?.[0] ?? 0;
    const frameAt = time => start + Math.max(0, Math.min(comparison.track.track.length - 1,
      (time * meta.dur - meta.hold) * (comparison.track.track.length - 1) / (meta.dur - meta.hold)));
    const [left, right] = activeFinding.range.map(frameAt);
    const band = byId("compare-range");
    if (evidence) {
      const timeline = evidence.fps * duration;
      band.style.left = 100 * left / timeline + "%";
      band.style.width = 100 * (right - left) / timeline + "%";
    }
    band.hidden = !evidence;
    comparison.sample = sampleIndex(Math.round((left + right) / 2));
    factor.value = SwingExaggeration.levels[activeFinding.severity] ?? 2;
    changeFactor();
    if (evidence && seek) jump(Math.round(frameAt((activeFinding.range[0] + activeFinding.range[1]) / 2)));
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
      tick.style.left = Math.min(100, frame / evidence.fps / duration * 100) + "%";
      tick.addEventListener("click", () => jump(frame));
      ticks.append(tick);
    }
    byId("overlay").hidden = false;
    jump(evidence.phase_frames.address);
    updateOverlay();
  }

  function setupStills(track) {
    const stills = byId("stills");
    stills.replaceChildren();
    const low = phases.filter(([key]) => track.meta.phase_confidence?.[key] < 0.45);
    byId("confidence").textContent = low.length
      ? "추적 신뢰도 낮음 · " + low.map(([, label]) => label).join(" · ")
      : "각도는 영상의 관절 좌표에서 추정한 값입니다.";
    for (const [phase, label] of phases.slice(0, 4)) {
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

  async function setupFindings(track) {
    const doc = await SwingFindings.load(track);
    byId("findings").hidden = false;
    byId("swing-view").hidden = false;
    byId("overlay").hidden = false;
    byId("comparison-panes").hidden = byId("video-transport").hidden = !evidence;
    byId("comparison-unavailable").hidden = !!evidence;
    byId("compare-range").hidden = true;
    byId("compare-values").replaceChildren();
    factor.value = 1;
    comparison.options = SwingFindings.choices(byId("finding-options"), doc, track, chooseFinding);
    factor.disabled = comparison.options.length === 0;
    if (comparison.options.length) chooseFinding(comparison.options[0].id, false);
    else changeFactor();
    SwingFindings.render(byId("finding-body"), track, doc, id => {
      chooseFinding(id);
      byId("overlay").scrollIntoView({ block: "start" });
    });
    try {
      viewer = Swing3D.mount(byId("viewer"), track, { findings: doc, autoplay: false, externalFindings: true });
    } catch (error) {
      byId("viewer").textContent = "3D를 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.";
    }
    byId("export").hidden = false;
    byId("record").disabled = !viewer;
    byId("record-progress").textContent = "";
    byId("open-report").href = "/report/" + encodeURIComponent(track.track_id);
  }

  byId("record").addEventListener("click", async () => {
    if (!viewer) return;
    const button = byId("record");
    const status = byId("record-progress");
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
  byId("start").addEventListener("click", analyze);
  byId("cancel").addEventListener("click", () => request?.abort());
  byId("play").addEventListener("click", () => {
    if (video.paused) video.play().catch(() => report("영상을 재생할 수 없습니다. 파일을 다시 선택해 주세요.", 100));
    else video.pause();
  });
  for (const event of ["play", "pause", "ended"]) video.addEventListener(event, () => {
    byId("play").textContent = video.paused ? "재생" : "일시정지";
  });
  for (const event of ["seeked", "loadeddata", "timeupdate"]) video.addEventListener(event, () => updateOverlay());
  if (video.requestVideoFrameCallback) {
    const paint = (_, metadata) => {
      updateOverlay(metadata.mediaTime);
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
