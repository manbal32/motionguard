window.MotionRoundScore = (() => {
  const key = 'motionguard:recent-round-score';

  function normalize(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    if (!Number.isInteger(number) || number < 54 || number > 200) {
      throw Error('최근 라운드 타수는 18홀 기준 54~200 사이로 입력해 주세요.');
    }
    return number;
  }

  function read() {
    const field = document.getElementById('recent-round-score');
    if (!field) return undefined;
    try {
      const score = normalize(field.validity?.badInput ? NaN : field.value);
      field.setCustomValidity('');
      return score;
    } catch (error) {
      const media = field.closest?.('#uploaded-media');
      if (media) media.open = true;
      field.setCustomValidity(error.message);
      field.reportValidity();
      throw error;
    }
  }

  function payload() {
    const score = read();
    return score === undefined ? {} : {recent_round_score: score};
  }

  function attach(summary) {
    const clean = {...summary};
    delete clean.recent_round_score;
    return {...clean, ...payload()};
  }

  function ready() {
    const field = document.getElementById('recent-round-score');
    if (!field) return;
    try {
      const saved = normalize(sessionStorage.getItem(key));
      if (saved !== undefined) field.value = String(saved);
    } catch {}
    field.addEventListener('input', () => {
      field.setCustomValidity('');
      if (field.validity?.badInput) return;
      try {
        const score = normalize(field.value);
        if (score === undefined) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, String(score));
      } catch {}
    });
    field.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      try {
        read();
        field.blur();
      } catch {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  return {normalize, read, payload, attach};
})();
