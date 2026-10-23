let circleService = '', circleSnapshot = null;
function validCircleProgress(value) {
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  if (!integer(value?.asOf, 1, 8640000000000000) || !integer(value.revision, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (value.level === null) return value.exp === null && value.readingAt === null && value.nextLevel === null && value.nextExp === null && value.remaining === null ? value : null;
  if (!integer(value.level, 1, 999) || !integer(value.exp, 0, 1e12) || !integer(value.readingAt, 1, value.asOf)
    || value.nextLevel !== (value.level < 999 ? value.level + 1 : null)) return null;
  if (value.nextExp === null) { if (value.remaining !== null) return null; }
  else if (value.nextLevel === null || !integer(value.nextExp, 1, 1e12) || value.remaining !== Math.max(0, value.nextExp - value.exp)) return null;
  return { asOf: value.asOf, revision: value.revision, level: value.level, exp: value.exp, readingAt: value.readingAt, nextLevel: value.nextLevel, nextExp: value.nextExp, remaining: value.remaining };
}
function renderCircleProgress() {
  const root = document.querySelector('[data-circle-progress]');
  if (!root) return;
  root.hidden = circleSnapshot?.level == null;
  if (root.hidden) return;
  const circle = circleSnapshot;
  root.querySelector('[data-circle-level]').textContent = `Nivel ${circle.level}`;
  root.title = '';
}
function startCircleProgress(service) {
  if (circleService === service) return;
  circleService = service; circleSnapshot = null;
  const key = `mazino:circle-progress:v1:${service}`;
  try { circleSnapshot = validCircleProgress(JSON.parse(localStorage.getItem(key))); } catch { /* Storage may be blocked. */ }
  renderCircleProgress(); let busy = false;
  const refresh = async () => {
    if (busy || circleService !== service) return;
    busy = true;
    try {
      const response = await fetch(`${service}/api/circle`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) return;
      const next = validCircleProgress(await response.json());
      if (!next || circleService !== service || (circleSnapshot && (next.asOf <= circleSnapshot.asOf || next.revision < circleSnapshot.revision
        || (circleSnapshot.level !== null && (next.level === null || next.readingAt < circleSnapshot.readingAt))))) return;
      circleSnapshot = next;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Continue in memory. */ }
      renderCircleProgress();
    } catch { /* Offline or invalid replies never erase the last verified level and EXP. */ }
    finally { busy = false; }
  };
  refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
