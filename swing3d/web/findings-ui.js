/* global SwingReference */
window.SwingFindings = (() => {
  const phases = [["address","어드레스"],["top","백스윙 탑"],["down","다운스윙"],["impact","임팩트"],["finish","피니시"]];
  const channels = {swing:"스윙각", torso:"몸통 회전", hips:"골반 회전", lean:"기울기", wrist:"손목", shiftX:"체중 이동", kneeL:"왼무릎", kneeR:"오른무릎", heelR:"오른 뒤꿈치"};
  const severity = { low: 1, medium: 2, high: 3 };

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function number(value, unit = "°", precision = 1) {
    const el = node("span", Number(value).toFixed(precision), "num");
    el.append(node("small", unit));
    return el;
  }

  async function load(track) {
    if (!track.findings_id) return { reference: "model", findings: [] };
    const response = await fetch("/api/findings/" + encodeURIComponent(track.findings_id));
    if (!response.ok) throw new Error("판정 파일을 읽지 못했습니다.");
    return response.json();
  }

  const positiveLabel = item => (item.example_only ? "검증 예시 · " : "") + (phases.find(([key]) => key === item.phase)?.[1] ?? "") +
    " · " + channels[item.channel] + "이 교본 참고 범위에 가까움";
  const selectablePositive = item => item.reliable === true && !item.deviation && !!channels[item.channel] &&
    Number.isInteger(item.frame) && Array.isArray(item.range);

  function choices(parent, doc, track, onSelect) {
    parent.replaceChildren();
    const improvements = doc.findings.filter(item => item.channel && item.range &&
      (item.channel !== "wrist" || track.meta.wrist_source === "index"));
    const positives = (doc.positives ?? []).filter(selectablePositive)
      .map(item => ({...item, positive: true, label: positiveLabel(item)}));
    for (const [items, title] of [[positives, "잘한 점 · 유지"], [improvements, "개선점 · 교정"]]) {
      const group = node("div", undefined, "finding-group");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", title);
      group.append(node("h3", title));
      if (!items.length) group.append(node("p", "선택할 계측 항목이 없습니다."));
      for (const item of items) {
        const button = node("button");
        button.type = "button";
        button.dataset.finding = item.id;
        button.setAttribute("aria-pressed", "false");
        const unit = ["shiftX", "heelR"].includes(item.channel) ? "정규화" : "°";
        const values = node("span", undefined, "finding-numbers");
        const measured = node("span", "판정 기준 프레임 측정 ");
        const reference = node("span", "교본 ", "reference");
        const precision = unit === "°" ? 1 : 3;
        measured.append(number(item.measured, unit, precision));
        reference.append(number(item.reference, unit, precision));
        values.append(measured, reference);
        button.append(node("strong", item.label), values);
        button.onclick = () => onSelect(item.id);
        group.append(button);
      }
      parent.append(group);
    }
    return [...improvements, ...positives];
  }

  function render(parent, track, doc, onSelect) {
    parent.replaceChildren();
    const items = doc.mode ? doc.findings : [...doc.findings].sort((a,b) => (severity[b.severity] ?? 0) - (severity[a.severity] ?? 0));
    const valuesFor = item => {
      const line = node("p");
      const distance = ["shiftX", "heelR"].includes(item.channel);
      const format = value => number(value, distance ? "정규화" : "°", distance ? 3 : 1);
      if (item.frame !== undefined) line.append(number(item.frame, "프레임", 0), " · ");
      line.append(doc.mode ? "측정 " : "파일 기록 ", format(item.measured), " · 교본 ", format(item.reference));
      if (doc.mode) line.append(" · 차이 ", format(item.difference));
      if (Number.isFinite(item.confidence)) line.append(" · 추적 신뢰도 ", number(item.confidence * 100, "%", 0));
      return line;
    };
    function still(item) {
      if (onSelect || !track.evidence || !phases.some(([key]) => key === item.phase) ||
          track.evidence.phase_frames[item.phase] !== item.frame ||
          (item.phase === "finish" && !track.evidence.has_finish_still)) return null;
      const figure = node("figure", undefined, "finding-still");
      const image = node("img");
      image.src = "/api/still/" + track.evidence.id + "/" + item.phase;
      image.alt = "선택 국면의 원본 계측 프레임";
      figure.append(image, node("figcaption", item.example_only ? "예시 항목의 원본 프레임" : "판정 기준 원본 프레임"));
      return figure;
    }
    function section(title) {
      const block = node("div", undefined, "result-block");
      block.append(node("h3", title));
      parent.append(block);
      return block;
    }
    const summary = section("전체 요약");
    summary.append(node("p", doc.summary ?? items[0]?.label ?? "스윙 국면의 각도를 기록했습니다."));
    if (doc.mode) {
      summary.prepend(node("strong", doc.mode === "demo" ? "데모 피드백 · 실제 영상 계측" : "Gemini 종합 피드백"));
      if (doc.reason) summary.append(node("p", doc.reason));
      const totals = Object.values(doc.usage ?? {});
      if (totals.length) {
        const tokens = node("p", "Gemini 사용량 · 입력 ");
        tokens.append(number(totals.reduce((sum, usage) => sum + (usage.input ?? 0), 0), "토큰", 0),
          " · 출력 ", number(totals.reduce((sum, usage) => sum + (usage.output ?? 0), 0), "토큰", 0));
        summary.append(tokens);
      }
      const consultation = section("상담 요약 · 자기보고");
      for (const [key, label] of [["concern", "고민"], ["improvement", "개선 희망"], ["hypothesis", "사용자 추정"], ["goal", "연습 목표"]]) {
        consultation.append(node("p", label + " · " + (doc.conversation_summary[key] || "입력 없음")));
      }
      section("자기보고와 영상 근거").append(node("p", doc.comparison));
      const positives = section("잘한 점");
      for (const item of doc.positives) {
        const control = node(onSelect && selectablePositive(item) ? "button" : "strong", positiveLabel(item));
        if (control.tagName === "BUTTON") control.onclick = () => onSelect(item.id);
        positives.append(control, valuesFor(item), node("p", "유지 권고 · 같은 촬영 각도에서 이 동작을 반복해 확인하세요."));
        const image = still(item);
        if (image) positives.append(image);
      }
      if (!doc.positives.length) positives.append(node("p", "확인 가능한 강점을 제시할 영상 근거가 부족합니다."));
    } else if (items.length) summary.append(node("p", "제공된 파일의 예시 판정입니다. 추적 신뢰도가 낮은 구간의 수치는 주의해서 해석하세요."));
    else summary.append(node("p", "이 영상에 연결된 판정이 없습니다. 아래 국면별 기록을 확인하세요."));

    const feedback = section("구간별 피드백");
    const referenceTrack = SwingReference.expand(track);
    for (const [index, [key, title]] of phases.entries()) {
      const phase = track.events[key];
      const frame = track.meta.phase_frames?.[key];
      const fraction = (phase * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold);
      const sample = frame === undefined
        ? Math.max(0, Math.min(track.track.length - 1, Math.round(fraction * (track.track.length - 1))))
        : Math.max(0, Math.min(track.track.length - 1, frame - track.meta.source_frames[0]));
      const row = track.track[sample];
      const torso = row[track.channels.indexOf("torso")] * 180 / Math.PI;
      const line = node("p");
      line.append(node("strong", title), " · 몸통 ", number(torso), " / 교본 ",
        number(referenceTrack[sample][SwingReference.channels.indexOf("torso")] * 180 / Math.PI));
      const confidence = track.meta.phase_confidence?.[key];
      if (confidence !== undefined) line.append(" · 추적 신뢰도 ", number(confidence * 100, "%", 0),
        confidence < 0.45 ? " · 낮음" : "");
      feedback.append(line);
    }

    const improvements = section(items.some(item => item.example_only) ? "비교 예시 · 추적 신뢰도 부족" : "개선 포인트");
    const drills = section("추천 드릴");
    const caution = section("부상 주의 신호");
    const videos = section("연습 영상");
    caution.append(node("p", doc.mode ? "이 영상 분석으로 부상 위험을 판단하지 않습니다." : "해당 없음 · 제공된 판정 파일 기준"));
    if (!items.length) {
      for (const area of [improvements, drills, videos]) area.append(node("p", "연결된 판정이 없습니다."));
    }
    for (const [index, item] of items.entries()) {
      const entry = node("div", undefined, "finding-line");
      const button = onSelect && item.channel && item.range ? node("button", item.label) : node("strong", item.label);
      if (button.tagName === "BUTTON") button.onclick = () => onSelect(item.id);
      if (doc.mode && !item.example_only) entry.append(number(index + 1, "순위", 0), " ");
      entry.append(button);
      if (item.channel) {
        const values = valuesFor(item);
        if (item.deviation || Math.abs(item.measured - item.reference) >= 8) values.className = "delta";
        if (doc.mode && item.range) {
          const position = bound => track.meta.source_frames[0] + Math.max(0, Math.min(track.track.length - 1,
            (bound * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold) * (track.track.length - 1)));
          values.append(" · 구간 ", number(position(item.range[0]), "프레임", 0), "–", number(position(item.range[1]), "프레임", 0));
        }
        entry.append(values);
      }
      improvements.append(entry);
      const image = still(item);
      if (image) entry.append(image);
      if (item.drill) drills.append(node("p", item.label + " · " + item.drill));
      for (const query of item.youtube ?? []) {
        const link = node("a", query);
        link.href = "https://www.youtube.com/results?" + new URLSearchParams({search_query: query});
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        videos.append(link, node("br"));
      }
    }
    if (items.length && !drills.querySelector("p")) drills.append(node("p", "제공된 드릴이 없습니다."));
    if (doc.mode) {
      if (items.filter(item => !item.example_only).length > 1) {
        const order = section("개선 순서와 관계");
        order.append(node("p", items.map(item => item.label).join(" → ")),
          node("p", "각 항목을 순서대로 연습해 같은 국면을 다시 비교하세요. 영상 한 편으로 항목 간 인과관계를 확인하기 어렵습니다."));
      }
      section("다음 연습 목표").append(node("p", doc.next_goal));
      const limits = section("분석 한계");
      for (const limit of doc.limitations) limits.append(node("p", limit));
    }
    return items;
  }

  return { load, render, choices, phases, channels, node, number };
})();
