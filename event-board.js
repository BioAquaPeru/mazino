function cleanEventBoard(data) {
  const text = (v, size = 100) => typeof v === 'string' && v.trim().length > 0 && v.length <= size;
  const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 10000;
  if (!Number.isSafeInteger(data?.serverNow) || data.serverNow <= 0 || !Array.isArray(data.events) || data.events.length > 80) return null;
  if (new Set(data.events.map(e => e?.id)).size !== data.events.length) return null;
  const events = [];
  for (const e of data.events) {
    if (!e || !text(e.id) || !text(e.title, 80) || !text(e.ownerId) || !text(e.ownerNick, 80) || !text(e.organizerNick, 80)
      || !Number.isSafeInteger(e.startsAt) || !Number.isSafeInteger(e.endsAt) || e.endsAt <= e.startsAt || !['active', 'closed'].includes(e.status)
      || !count(e.total) || !count(e.claimed) || !count(e.available) || e.claimed > e.total || e.available > e.total
      || !Array.isArray(e.prizes) || e.prizes.length > 50 || e.prizes.some(p => !text(p?.label, 80) || !count(p.quantity) || p.quantity < 1)
      || !Array.isArray(e.winners) || e.winners.length > 50 || e.winners.some(w => !text(w?.nick, 80) || !text(w.label, 80) || !Number.isSafeInteger(w.claimedAt) || w.claimedAt <= 0)) return null;
    events.push({ id: e.id, title: e.title, ownerId: e.ownerId, ownerNick: e.ownerNick, organizerNick: e.organizerNick,
      startsAt: e.startsAt, endsAt: e.endsAt, status: e.status, total: e.total, claimed: e.claimed, available: e.available,
      prizes: e.prizes.map(p => ({ label: p.label, quantity: p.quantity })), winners: e.winners.map(w => ({ nick: w.nick, label: w.label, claimedAt: w.claimedAt })) });
  }
  return { serverNow: data.serverNow, events };
}
function eventBoardGroups(events, now) {
  const open = events.filter(e => e.status === 'active' && e.available > 0 && e.endsAt > now);
  return {
    upcoming: open.filter(e => e.startsAt > now).sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id)),
    active: open.filter(e => e.startsAt <= now).sort((a, b) => a.endsAt - b.endsAt || a.id.localeCompare(b.id)),
    winners: events.flatMap(e => e.winners.map(w => ({ ...e, winner: w }))).sort((a, b) => b.winner.claimedAt - a.winner.claimedAt || a.id.localeCompare(b.id)).slice(0, 100),
  };
}
const eventBoardRuntime = (() => {
  const root = document.querySelector('[data-event-board]');
  if (!root) return { configure() {}, accept() {} };
  const field = name => root.querySelector(`[data-board-${name}]`);
  const viewport = field('viewport'), list = field('list');
  const tabs = [...root.querySelectorAll('[data-board-tab]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let api = '', events = [], asOf = 0, offset = 0, mode = 'active', selected = false, busy = false;
  let automatic = !reduced.matches, hovered = false, focused = false, bottomAt = 0, inView = true, signature = '';
  const labels = { upcoming: 'Eventos proximos', active: 'Eventos activos', winners: 'Ganadores de eventos' };
  const date = value => new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function controls() {
    const pause = field('pause'), label = automatic ? 'Pausar desplazamiento automatico' : 'Activar desplazamiento automatico';
    pause.setAttribute('aria-label', label); pause.setAttribute('title', label); pause.setAttribute('aria-pressed', String(!automatic));
    field('pause-icon').src = `./assets/board/${automatic ? 'pause' : 'play'}.svg`;
  }
  function render() {
    const groups = eventBoardGroups(events, Date.now() + offset);
    if (!selected && asOf) { mode = groups.active.length ? 'active' : groups.upcoming.length ? 'upcoming' : 'winners'; selected = true; }
    for (const button of tabs) {
      const name = button.dataset.boardTab;
      button.setAttribute('aria-pressed', String(name === mode));
      root.querySelector(`[data-board-count="${name}"]`).textContent = String(groups[name].length);
    }
    viewport.setAttribute('aria-label', labels[mode]);
    const rows = groups[mode];
    const html = rows.map(e => {
      const winner = mode === 'winners' ? e.winner : null;
      const prize = winner ? winner.label : e.prizes.map(p => `${p.quantity} x ${p.label}`).join(', ') || 'Premio de R2Beat';
      return `<article class="board-entry"><img class="board-entry-icon" src="./assets/board/${winner ? 'trophy' : mode === 'active' ? 'zap' : 'clock'}.svg" width="20" height="20" alt="" /><div class="board-entry-main"><h3>${escapeHtml(e.title)}</h3><p>${winner ? `<strong class="board-winner">${escapeHtml(winner.nick)}</strong> · ` : ''}${escapeHtml(prize)}</p><p class="board-organizer">Organiza: ${escapeHtml(e.organizerNick)}${e.ownerNick !== e.organizerNick ? ` · Anfitrion: ${escapeHtml(e.ownerNick)}` : ''}</p></div><div class="board-entry-meta">${winner ? `<time datetime="${new Date(winner.claimedAt).toISOString()}">${escapeHtml(date(winner.claimedAt))} (Peru)</time><span class="board-state winner">Premio entregado</span>` : `<span>${e.available} ${e.available === 1 ? 'premio disponible' : 'premios disponibles'}</span><time datetime="${new Date(mode === 'upcoming' ? e.startsAt : e.endsAt).toISOString()}">${mode === 'upcoming' ? 'Abre' : 'Termina'}: ${escapeHtml(date(mode === 'upcoming' ? e.startsAt : e.endsAt))} (Peru)</time>`}</div>${mode === 'active' ? `<button class="board-participate" type="button" data-prize-open="${escapeHtml(e.ownerId)}" data-prize-nick="${escapeHtml(e.ownerNick)}">Participar</button>` : ''}</article>`;
    }).join('') || `<p class="board-empty">${!asOf ? 'Consultando eventos...' : mode === 'upcoming' ? 'No hay eventos programados.' : mode === 'active' ? 'No hay eventos activos en este momento.' : 'Aun no hay ganadores registrados.'}</p>`;
    const nextSignature = mode + html;
    if (signature !== nextSignature) { signature = nextSignature; list.innerHTML = html; bottomAt = 0; }
    field('prev').disabled = field('next').disabled = rows.length === 0;
  }
  function accept(data, source = api) {
    if (!api || source !== api) return;
    const value = cleanEventBoard(data);
    if (!value || value.serverNow <= asOf) return;
    asOf = value.serverNow; offset = asOf - Date.now(); events = value.events;
    field('status').textContent = ''; render();
  }
  async function refresh() {
    if (!api || busy || document.hidden) return;
    const source = api; busy = true;
    try {
      const response = await fetch(`${source}/api/public`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Unavailable');
      accept(await response.json(), source);
    } catch {
      if (source === api) field('status').textContent = asOf ? 'Mostrando la ultima consulta. Reintentando conexion...' : 'No se pudo consultar los eventos. Reintentando...';
    } finally { busy = false; }
  }
  function configure(settings) {
    const source = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(settings.rewardsServiceUrl || '') ? settings.rewardsServiceUrl : '';
    root.hidden = !source;
    if (source === api) return;
    api = source; events = []; asOf = 0; offset = 0; selected = false; signature = '';
    render(); if (api) refresh();
  }
  for (const button of tabs) button.addEventListener('click', () => {
    mode = button.dataset.boardTab; selected = true; viewport.scrollTop = 0; bottomAt = 0; render();
  });
  field('pause').addEventListener('click', () => { automatic = !automatic; bottomAt = 0; controls(); });
  const manual = () => { automatic = false; controls(); };
  for (const [name, direction] of [['prev', -1], ['next', 1]]) field(name).addEventListener('click', () => {
    manual(); viewport.scrollBy({ top: direction * Math.max(120, viewport.clientHeight * .75), behavior: reduced.matches ? 'instant' : 'smooth' });
  });
  for (const name of ['wheel', 'touchstart', 'pointerdown']) viewport.addEventListener(name, manual, { passive: true });
  viewport.addEventListener('mouseenter', () => { hovered = true; });
  viewport.addEventListener('mouseleave', () => { hovered = false; });
  viewport.addEventListener('focusin', () => { focused = true; });
  viewport.addEventListener('focusout', e => { focused = viewport.contains(e.relatedTarget); });
  reduced.addEventListener?.('change', () => { if (reduced.matches) { automatic = false; controls(); } });
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting; document.body.classList.toggle('event-board-visible', inView && !root.hidden);
  }).observe(root);
  setInterval(() => {
    if (!automatic || hovered || focused || !inView || root.hidden || document.hidden || viewport.scrollHeight <= viewport.clientHeight + 1) return;
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) {
      if (!bottomAt) bottomAt = Date.now();
      if (Date.now() - bottomAt > 2500) { viewport.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' }); bottomAt = 0; }
    } else { viewport.scrollTop += 1.5; bottomAt = 0; }
  }, 80);
  setInterval(() => { if (!root.hidden && !document.hidden) render(); }, 1000);
  setInterval(refresh, 15000);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
  controls();
  return { configure, accept };
})();
function configureEventBoard(settings) { eventBoardRuntime.configure(settings); }
function acceptEventBoard(data, source) { eventBoardRuntime.accept(data, source); }
