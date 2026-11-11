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

  function render(parent, track, doc, onSelect) {
    parent.replaceChildren();
    const items = [...doc.findings].sort((a,b) => (severity[b.severity] ?? 0) - (severity[a.severity] ?? 0));
    function section(title) {
      const block = node("div", undefined, "result-block");
      block.append(node("h3", title));
      parent.append(block);
      return block;
    }
    const summary = section("전체 요약");
    summary.append(node("p", items[0]?.label ?? "스윙 네 국면의 각도를 기록했습니다."));
    if (items.length) summary.append(node("p", "제공된 파일의 예시 판정입니다. 추적 신뢰도가 낮은 구간의 수치는 주의해서 해석하세요."));
    else summary.append(node("p", "이 영상에 연결된 판정이 없습니다. 아래 국면별 기록을 확인하세요."));

    const feedback = section("구간별 피드백");
    for (const [index, [key, title]] of phases.entries()) {
      const phase = track.events[key];
      const frame = track.meta.phase_frames?.[key];
      const fraction = (phase * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold);
      const row = track.track[frame === undefined
        ? Math.max(0, Math.min(track.track.length - 1, Math.round(fraction * (track.track.length - 1))))
        : frame - track.meta.source_frames[0]];
      const torso = row[track.channels.indexOf("torso")] * 180 / Math.PI;
      const line = node("p");
      line.append(node("strong", title), " · 몸통 ", number(torso), " / 교본 ", number(SwingReference.torso[index]));
      if (track.meta.phase_confidence?.[key] < 0.45) line.append(" · 추적 신뢰도 낮음");
      feedback.append(line);
    }

    const improvements = section("개선 포인트");
    const drills = section("추천 드릴");
    const caution = section("부상 주의 신호");
    const videos = section("연습 영상");
    caution.append(node("p", "해당 없음 · 제공된 판정 파일 기준"));
    if (!items.length) {
      for (const area of [improvements, drills, videos]) area.append(node("p", "연결된 판정이 없습니다."));
    }
    for (const item of items) {
      const entry = node("div", undefined, "finding-line");
      const button = onSelect && item.channel && item.range ? node("button", item.label) : node("strong", item.label);
      if (button.tagName === "BUTTON") button.onclick = () => onSelect(item.id);
      entry.append(button);
      if (item.channel) {
        const values = node("p");
        values.append((channels[item.channel] ?? item.channel) + " · 파일 기록 ", number(item.measured),
          " / 교본 ", number(item.reference));
        if (Math.abs(item.measured - item.reference) >= 8) values.className = "delta";
        entry.append(values);
      }
      improvements.append(entry);
      if (item.drill) drills.append(node("p", item.drill));
      for (const query of item.youtube ?? []) {
        const link = node("a", query);
        link.href = "https://www.youtube.com/results?" + new URLSearchParams({search_query: query});
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        videos.append(link, node("br"));
      }
    }
    if (items.length && !drills.querySelector("p")) drills.append(node("p", "제공된 드릴이 없습니다."));
    return items;
  }

  return { load, render, phases, channels, node, number };
})();
