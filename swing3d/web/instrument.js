/* global SwingReference */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const video = byId("original");
  const canvas = byId("joints");
  const ctx = canvas.getContext("2d");
  const phases = [
    ["address", "어드레스"], ["top", "백스윙 탑"], ["down", "다운스윙"],
    ["impact", "임팩트"], ["finish", "피니시"],
  ];
  const channels = [["swing", "스윙각"], ["torso", "몸통 회전"], ["hips", "골반 회전"],
    ["lean", "기울기"], ["wrist", "손목"]];
  const links = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],
    [11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
    [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
    [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],
    [24,26],[26,28],[28,30],[30,32],[28,32]];
  let selected;
  let mediaUrl;
  let duration;
  let request;
  let evidence;

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
    selected = undefined;
    duration = undefined;
    byId("overlay").hidden = byId("phases").hidden = true;
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
      if (evidence) setupVideo();
      setupStills(track);
      report("계측 완료", 100);
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
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const frame = Math.max(0, Math.min(evidence.frames.length - 1, Math.floor(mediaTime * evidence.fps + 0.001)));
    const { width, height } = canvas;
    const time = byId("timecode");
    time.replaceChildren(quantity(video.currentTime.toFixed(2), "s"), " · ", quantity(String(frame), "프레임"));
    byId("seek").value = String(video.currentTime);
    const phase = phases.find(([key]) => evidence.phase_frames[key] === frame)
      ?? phases.findLast(([key]) => evidence.phase_frames[key] <= frame);
    byId("phase-label").textContent = phase?.[1] ?? "어드레스 전";
    ctx.clearRect(0, 0, width, height);
    const points = evidence.frames[frame];
    if (!points || byId("toggle-joints").getAttribute("aria-pressed") !== "true") return;
    ctx.strokeStyle = ctx.fillStyle = "#e9e7e0";
    ctx.lineWidth = Math.max(1.4, width / 360);
    for (const [a, b] of links) {
      if (!points[a] || !points[b]) continue;
      ctx.globalAlpha = Math.min(points[a][2], points[b][2]);
      ctx.beginPath();
      ctx.moveTo(points[a][0] * width, points[a][1] * height);
      ctx.lineTo(points[b][0] * width, points[b][1] * height);
      ctx.stroke();
    }
    for (const [x, y, confidence] of points) {
      ctx.globalAlpha = Math.max(0, Math.min(1, confidence));
      ctx.beginPath();
      ctx.arc(x * width, y * height, Math.max(2, width / 220), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function setupVideo() {
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
    for (const [index, [phase, label]] of phases.slice(0, 4).entries()) {
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
        const reference = SwingReference[channel][index];
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
  byId("toggle-joints").addEventListener("click", event => {
    const toggle = event.currentTarget;
    toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
    updateOverlay();
  });
})();
