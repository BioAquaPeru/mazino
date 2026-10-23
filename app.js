const state = {
  settings: null,
  elite: [],
  members: [],
  totalMembers: 0
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderElite() {
  const container = $("[data-elite]");
  if (!state.elite.length) {
    container.innerHTML = `<p class="empty-state">Aun no hay integrantes destacados publicados.</p>`;
    return;
  }
  container.innerHTML = state.elite.map((member) => `
    <article class="elite-card ${member.goldEffect ? "gold-active" : ""}" style="--mist-color: ${memberFogColor(member)}">
      ${perimeterMist(member)}
      <div class="elite-avatar">${licenseBadge(member)}</div>
      <div>
        <h3><button class="member-name" type="button" data-prize-open="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</button></h3>
        <p class="elite-level">Nv ${escapeHtml(member.level)}</p>
        <p class="elite-title">${escapeHtml(member.title || "Sublider")}</p>
      </div>
    </article>
  `).join("");
  startPerimeterMist(container);
}

function renderMembers(filter = "") {
  const container = $("[data-members]");
  const query = filter.trim().toLowerCase();
  const groups = groupMemberPairs(state.members, query);
  const members = groups.flat();
  $("[data-member-count]").textContent = query
    ? `${members.length} de ${state.members.length} miembros`
    : `${state.members.length} miembros | ${state.totalMembers} en el circulo`;
  if (!members.length) {
    container.innerHTML = `<p class="empty-state">No hay integrantes para mostrar.</p>`;
    return;
  }
  container.innerHTML = renderMemberGroups(groups);
  startPerimeterMist(container);
}

function renderPublic(data) {
  state.settings = data.settings;
  configurePrizes(data.settings);
  state.elite = data.elite;
  state.members = data.members;
  state.totalMembers = data.totalMembers ?? (state.members.length + state.elite.length);
  const showElite = data.settings.eliteEnabled !== false;
  const showMembers = data.settings.membersEnabled !== false;
  $("[data-elite-section]").hidden = !showElite;
  $("[data-members-section]").hidden = !showMembers;
  $("[data-public-content]").hidden = !showElite && !showMembers;
  $("[data-footer]").hidden = false;
  updateGuideContact();
  document.body.classList.toggle("hero-only", !showElite && !showMembers);

  $$("[data-field]").forEach((node) => {
    const key = node.dataset.field;
    node.textContent = data.settings[key] || "";
  });

  if (data.settings.logoUrl) {
    $("[data-logo]").src = publicAssetUrl(data.settings.logoUrl);
  }

  $$("[data-join-open]").forEach((button) => {
    button.disabled = !data.settings.joinEnabled;
    button.classList.toggle("disabled", button.disabled);
    if (button.disabled) button.querySelector("span").textContent = "SOLICITUDES PAUSADAS";
  });

  renderElite();
  renderMembers($("[data-member-search]")?.value || "");
  renderCommunityRankings();
  updateFloatingButton();
}

function buildWhatsAppUrl(nick) {
  const phone = String(state.settings.whatsappNumber || "").replace(/[^\d]/g, "");
  const template = state.settings.whatsappTemplate || "Hola, quiero unirme a Mazino. Mi nick en R2Beat es: [NICK].";
  const message = template.replace("[NICK]", nick);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

let communityData = null, communityService = '', donorMode = 'general';
const rcoinNumber = value => Number(value).toLocaleString('es-PE');
function publicDonationFor(id) {
  return communityData ? communityData.donations.find(r => r.memberId === id) || { memberId: id, total: null, readingOn: null } : null;
}
function rankingCard(member, position, content) {
  return `<article class="ranking-card ${member.goldEffect ? 'gold-active' : ''}" style="--mist-color: ${memberFogColor(member)}">
    ${perimeterMist(member)}<div class="ranking-card-top"><span class="ranking-position">#${position}</span>${licenseBadge(member)}</div>
    <h3>${escapeHtml(member.nick)}</h3><p class="ranking-role">${escapeHtml(member.title || member.rank || '')}</p>${content}</article>`;
}
function renderCommunityRankings() {
  if (!state.settings) return;
  const members = [...state.elite, ...state.members], byId = new Map(members.map(m => [m.id, m]));
  $('[data-community-section]').hidden = $('[data-global-section]').hidden = !state.settings.membersEnabled;
  const excluded = new Set((communityData?.exclusions || []).filter(r => r.donors).map(r => r.memberId));
  const source = donorMode === 'weekly' ? (communityData?.weekly?.entries || []).map(r => ({ ...r, total: r.donated })) : communityData?.donations || [];
  const donors = source.filter(r => r.total > 0 && byId.has(r.memberId) && !excluded.has(r.memberId)).sort((a, b) => b.total - a.total || byId.get(a.memberId).nick.localeCompare(byId.get(b.memberId).nick)).slice(0, 5);
  $('[data-donor-ranking]').innerHTML = donors.map((r, i) => rankingCard(byId.get(r.memberId), i + 1, `<p class="ranking-value">${rcoinNumber(r.total)} <small>Rcoin</small></p>`)).join('') || `<p class="ranking-empty">${donorMode === 'weekly' ? 'Todavia no hay incrementos semanales registrados. Se necesitan dos lecturas para comparar.' : 'Todavia no hay donaciones registradas.'}</p>`;
  const weekly = communityData?.weekly, dateLabel = v => v.split('-').reverse().join('/');
  $('[data-donor-note]').textContent = donorMode === 'weekly' ? (weekly ? `${dateLabel(weekly.start)} al ${dateLabel(weekly.end)} · Peru` : 'Semana actual') : 'Total acumulado registrado';
  $('[data-weekly-note]').hidden = donorMode !== 'weekly';
  $('[data-weekly-note]').textContent = 'Incrementos desde la primera lectura disponible de esta semana. No incluye saldos anteriores.';
  const global = communityData?.global;
  const globalExcluded = new Set((communityData?.exclusions || []).filter(r => r.globalTop).map(r => r.memberId));
  $('[data-global-ranking]').innerHTML = (global?.entries || []).flatMap(r => {
    const own = r.circle?.id === 10 && members.find(m => m.nick.normalize('NFKC').toLowerCase() === r.nick.normalize('NFKC').toLowerCase());
    if (own && globalExcluded.has(own.id)) return [];
    const member = own || { nick: r.nick, license: r.license, title: '', goldEffect: false };
    return [rankingCard(member, r.position, `<p class="ranking-value">Nv ${r.level}</p><p class="ranking-circle">${escapeHtml(r.circle?.name || 'Sin circulo')}</p>`)];
  }).join('') || '<p class="ranking-empty">Ranking global pendiente de actualizar.</p>';
  $('[data-global-note]').textContent = global?.updatedAt ? new Date(global.updatedAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '';
  startPerimeterMist($('[data-donor-ranking]')); startPerimeterMist($('[data-global-ranking]'));
}
function validCommunity(value) {
  if (!Number.isSafeInteger(value?.asOf) || value.asOf <= 0 || !Array.isArray(value.donations) || value.donations.length > 200) return null;
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (value.donations.some(r => !r || typeof r.memberId !== 'string' || !r.memberId || (r.total !== null && (!Number.isSafeInteger(r.total) || r.total < 0 || r.total > 1e12 || !date(r.readingOn))))
    || new Set(value.donations.map(r => r.memberId)).size !== value.donations.length) return null;
  const global = value.global;
  if (!global || !Array.isArray(global.entries) || ![0, 5].includes(global.entries.length) || (global.entries.length && (!Number.isSafeInteger(global.updatedAt) || global.updatedAt <= 0))) return null;
  if (global.entries.some((r, i) => r.position !== i + 1 || typeof r.nick !== 'string' || !r.nick || !Number.isInteger(r.level) || r.level < 1 || r.level > 999 || (r.circle !== null && (!Number.isInteger(r.circle?.id) || r.circle.id < 1 || typeof r.circle.name !== 'string')))) return null;
  const weekly = value.weekly;
  if (weekly != null && (!date(weekly.start) || !date(weekly.end) || weekly.end < weekly.start || !Array.isArray(weekly.entries) || weekly.entries.length > 200
    || new Set(weekly.entries.map(r => r?.memberId)).size !== weekly.entries.length || weekly.entries.some(r => !r || typeof r.memberId !== 'string' || !r.memberId || (r.donated !== null && (!Number.isSafeInteger(r.donated) || r.donated < 0 || r.donated > 1e12 || !date(r.fromOn) || !date(r.readingOn) || r.fromOn < weekly.start || r.readingOn < r.fromOn || r.readingOn > weekly.end))))) return null;
  const exclusions = value.exclusions || [];
  if (!Array.isArray(exclusions) || exclusions.length > 1000 || new Set(exclusions.map(r => r?.memberId)).size !== exclusions.length || exclusions.some(r => !r || typeof r.memberId !== 'string' || !r.memberId || typeof r.donors !== 'boolean' || typeof r.globalTop !== 'boolean')) return null;
  return { asOf: value.asOf, donations: value.donations.map(r => ({ memberId: r.memberId, total: r.total, readingOn: r.total === null ? null : r.readingOn })),
    weekly: weekly ? { start: weekly.start, end: weekly.end, entries: weekly.entries.map(r => ({ memberId: r.memberId, donated: r.donated, fromOn: r.fromOn, readingOn: r.readingOn })) } : null,
    exclusions: exclusions.map(r => ({ memberId: r.memberId, donors: r.donors, globalTop: r.globalTop })),
    global: { entries: global.entries.map(r => ({ position: r.position, nick: r.nick, level: r.level, license: r.license, circle: r.circle ? { id: r.circle.id, name: r.circle.name } : null })), updatedAt: global.updatedAt || null, stale: !!global.stale } };
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-donor-mode]');
  if (!button || !['general', 'weekly'].includes(button.dataset.donorMode)) return;
  donorMode = button.dataset.donorMode;
  for (const item of document.querySelectorAll('[data-donor-mode]')) item.setAttribute('aria-pressed', String(item === button));
  renderCommunityRankings();
});
function startCommunity(service) {
  if (communityService === service) return;
  communityService = service;
  const key = `mazino:community:v1:${service}`;
  try { communityData = validCommunity(JSON.parse(localStorage.getItem(key))); } catch { communityData = null; }
  const render = () => { if (state.settings) renderCommunityRankings(); if (typeof refreshPrizeDonationPreview === 'function') refreshPrizeDonationPreview(); };
  render(); let busy = false;
  const refresh = async () => {
    if (busy || communityService !== service) return;
    busy = true;
    try {
      const response = await fetch(`${service}/api/community`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const next = validCommunity(await response.json());
      if (!next || communityService !== service || (communityData && next.asOf <= communityData.asOf)) return;
      if (communityData?.global.entries.length && (!next.global.entries.length || next.global.updatedAt < communityData.global.updatedAt)) next.global = { ...communityData.global, stale: true };
      communityData = next;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Public totals also work with blocked storage. */ }
      render();
    } catch { /* Keep rankings and totals without touching member presentation or sessions. */ }
    finally { busy = false; }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

const PUBLIC_SNAPSHOT_KEY = "mazino:public-snapshot:v1";
function publicSnapshot(value) {
  if (!value?.settings || !Array.isArray(value.members) || !Array.isArray(value.elite)) return null;
  const textFields = ['siteName', 'heroPhrase', 'joinButtonText', 'whatsappNumber', 'whatsappTemplate', 'logoUrl', 'membersTitle', 'eliteTitle', 'rewardsServiceUrl'];
  const flags = ['joinEnabled', 'eliteEnabled', 'membersEnabled'];
  if (textFields.some(k => typeof value.settings[k] !== 'string') || flags.some(k => typeof value.settings[k] !== 'boolean')) return null;
  const people = [...value.elite, ...value.members];
  if (people.length > 200 || people.some(m => !m || typeof m.id !== 'string' || !m.id || typeof m.nick !== 'string' || !m.nick.trim() || !Number.isInteger(m.level) || m.level < 1 || m.level > 999)
    || new Set(people.map(m => m.id)).size !== people.length) return null;
  const total = value.totalMembers ?? people.length;
  if (!Number.isInteger(total) || total < people.length || total > 200) return null;
  if ((!value.settings.eliteEnabled && value.elite.length) || (!value.settings.membersEnabled && value.members.length)
    || (value.settings.membersEnabled && total !== people.length)) return null;
  // Cache only the public presentation fields, never login sessions, passwords or coupon data.
  const settings = Object.fromEntries(textFields.map(k => [k, value.settings[k].slice(0, 1000)]));
  for (const k of flags) settings[k] = value.settings[k];
  const member = m => Object.fromEntries(['id', 'nick', 'level', 'rank', 'title', 'license', 'goldEffect', 'fogColor', 'pairColor', 'partnerId'].map(k => [k, m[k]]));
  const lastSyncAt = Number.isFinite(Date.parse(value.sync?.lastSyncAt)) ? value.sync.lastSyncAt : null;
  return { settings, elite: value.elite.map(member), members: value.members.map(member), totalMembers: total, sync: { lastSyncAt } };
}
function snapshotVersion(data) { return Date.parse(data?.sync?.lastSyncAt) || 0; }
function readPublicSnapshot() {
  try {
    const data = publicSnapshot(JSON.parse(localStorage.getItem(PUBLIC_SNAPSHOT_KEY)));
    return snapshotVersion(data) > 0 ? data : null;
  } catch { return null; }
}
async function loadPublic() {
  let latest = readPublicSnapshot(), signature = '';
  const show = data => {
    const next = JSON.stringify({ settings: data.settings, members: data.members, elite: data.elite, totalMembers: data.totalMembers });
    if (next !== signature) { renderPublic(data); signature = next; }
  };
  if (latest) show(latest);
  let saved = null;
  try {
    const endpoint = document.documentElement.hasAttribute('data-static') ? './site-data.json' : './api/public';
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.ok) saved = publicSnapshot(await response.json());
  } catch { /* A verified browser snapshot also survives failure of the static bootstrap. */ }
  const service = saved?.settings.rewardsServiceUrl || latest?.settings.rewardsServiceUrl;
  if (service && /^https:\/\/[a-z0-9.-]+$/i.test(service)) {
    let refreshing = false;
    const accept = data => {
      if (!data || data.settings.rewardsServiceUrl !== service || snapshotVersion(data) <= 0) return;
      // Another tab may have saved a newer version while this request was in flight.
      const cached = readPublicSnapshot();
      if (cached?.settings.rewardsServiceUrl === service && snapshotVersion(cached) > snapshotVersion(latest)) { latest = cached; show(latest); }
      if (latest?.settings.rewardsServiceUrl === service && snapshotVersion(data) <= snapshotVersion(latest)) return;
      latest = data; show(data);
      try { localStorage.setItem(PUBLIC_SNAPSHOT_KEY, JSON.stringify(data)); } catch { /* Private mode and full storage must not break the page. */ }
    };
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch(`${service}/api/site`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (response.ok) accept(publicSnapshot(await response.json()));
      } catch { /* Keep the last verified version on timeouts, errors and malformed replies. */ }
      finally { refreshing = false; }
    };
    // A new device checks the live service before displaying the static backup.
    if (typeof startCommunity === 'function') startCommunity(service);
    if (typeof startCircleProgress === 'function') startCircleProgress(service);
    await refresh();
    if (snapshotVersion(saved) > snapshotVersion(latest)) accept(saved);
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('online', refresh);
    window.addEventListener('storage', event => { if (event.key === PUBLIC_SNAPSHOT_KEY) accept(readPublicSnapshot()); });
  }
  if (!latest && saved) show(saved);
  if (!latest && !saved) throw new Error('No se pudo cargar MAZINO.');
}

function wireJoinDialog() {
  const dialog = $("[data-join-dialog]");
  const form = $("[data-join-form]");
  const status = $("[data-join-status]");

  $("[data-join-close]").addEventListener("click", () => dialog.close());

  $$("[data-join-open]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      form.reset();
      status.textContent = "";
      dialog.showModal();
      form.nick.focus();
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nick = form.nick.value.trim();
    if (!nick) {
      status.textContent = "Escribe tu nick de R2Beat.";
      form.nick.focus();
      return;
    }
    if (!String(state.settings.whatsappNumber || "").replace(/[^\d]/g, "")) {
      status.textContent = "El numero de WhatsApp aun no esta configurado.";
      return;
    }
    window.open(buildWhatsAppUrl(nick), "_blank", "noopener,noreferrer");
    dialog.close();
  });
}

function wireSearch() {
  const input = $("[data-member-search]");
  input.addEventListener("input", () => renderMembers(input.value));
}

const prizeGuides = {
  personal: { title: "C\u00f3mo reclamar mi premio del c\u00edrculo", steps: [
    { title: "Busca y abre tu nick", image: "premio-nick.jpg", alt: "Ejemplo de TuNick resaltado en los miembros de MAZINO", text: "Busca tu nombre en Miembros de MAZINO o en los destacados. Haz clic en tu propio nick para abrir tus premios." },
    { title: "Ingresa con tu clave del circulo", image: "premio-login.jpg", alt: "Formulario de premios con TuNick y una clave de ejemplo oculta", text: "Escribe tu nick y la clave del circulo que te entrego el lider. Pulsa Desbloquear premios. No es la clave de tu cuenta de R2Beat." },
    { title: "Reclama el premio asignado", image: "premio-reclamar.jpg", alt: "Premio personal de ejemplo y boton Reclamar cupon", text: "Elige tu premio pendiente y pulsa Reclamar cupon. Si no tienes premios pendientes, consulta con el lider." },
    { title: "Copia el codigo y canjealo en R2Beat", image: "premio-copiar.jpg", alt: "Codigo de ejemplo no valido con Copiar codigo y Ya lo guarde", text: "Pulsa Copiar codigo y usalo en el cupon de R2Beat. Guarda el codigo antes de pulsar Ya lo guarde: despues dejara de aparecer en tu usuario." },
  ] },
  flash: { title: "C\u00f3mo participar en eventos rel\u00e1mpago", steps: [
    { title: "Abre el nick del anfitrion", image: "evento-anfitrion.jpg", alt: "Nick Lider resaltado como anfitrion de un evento de ejemplo", text: "Haz clic en el nick que anuncio el organizador del evento. Puede ser el lider u otro anfitrion; no tiene que ser tu propio nick." },
    { title: "Identificate con tu propia cuenta", image: "premio-login.jpg", alt: "Ingreso con TuNick y tu clave del circulo, no con la cuenta del anfitrion", text: "Ingresa tu propio nick y tu clave del circulo. No uses la cuenta del anfitrion. Asi el premio quedara registrado a tu nombre." },
    { title: "Espera la apertura y escribe la clave del evento", image: "evento-clave.jpg", alt: "Evento abierto de ejemplo con el campo Clave de este evento y Reclamar premio relampago", text: "Busca el evento y revisa su hora de apertura, mostrada en hora de Peru. Cuando abra, escribe la clave del evento compartida por el organizador y pulsa Reclamar premio relampago. Es distinta de tu clave del circulo." },
    { title: "Reclama y guarda tu premio", image: "premio-copiar.jpg", alt: "Premio de ejemplo con codigo para copiar y guardar", text: "Si alcanzaste un premio, copia y guarda el codigo para usarlo en R2Beat. Los premios se entregan por orden de reclamo hasta agotarse. Si ya terminaron, veras los ganadores del evento." },
  ] },
};
let currentGuide = "personal";
let currentGuideStep = 0;
let guideTrigger = null;

function updateGuideContact() {
  const phone = String(state.settings?.whatsappNumber || "").replace(/[^\d]/g, "");
  const link = $("[data-guide-contact]");
  link.hidden = !phone;
  $("[data-guide-no-contact]").hidden = Boolean(phone);
  if (phone) link.href = `https://wa.me/${phone}?text=${encodeURIComponent("Hola, soy integrante de MAZINO. Mi nick en R2Beat es: ____. Necesito mi clave del circulo para reclamar mis premios.")}`;
  else link.removeAttribute("href");
}

function renderGuideStep() {
  const guide = prizeGuides[currentGuide], step = guide.steps[currentGuideStep];
  $("[data-guide-title]").textContent = guide.title;
  $("[data-guide-progress]").textContent = `Paso ${currentGuideStep + 1} de ${guide.steps.length}`;
  $("[data-guide-step-title]").textContent = step.title;
  const image = $("[data-guide-image]");
  image.src = publicAssetUrl(`/assets/guides/${step.image}`);
  image.alt = step.alt;
  $("[data-guide-description]").textContent = step.text;
  $("[data-guide-prev]").disabled = currentGuideStep === 0;
  $("[data-guide-next]").hidden = currentGuideStep === guide.steps.length - 1;
  $("[data-guide-done]").hidden = currentGuideStep !== guide.steps.length - 1;
}

function wireGuides() {
  const dialog = $("[data-guide-dialog]");
  $$("[data-guide-open]").forEach((button) => button.addEventListener("click", () => {
    if (!Object.hasOwn(prizeGuides, button.dataset.guideOpen)) return;
    currentGuide = button.dataset.guideOpen; currentGuideStep = 0; guideTrigger = button;
    renderGuideStep(); updateGuideContact(); dialog.showModal();
  }));
  $("[data-guide-prev]").addEventListener("click", () => { if (currentGuideStep > 0) { currentGuideStep--; renderGuideStep(); dialog.scrollTop = 0; } });
  $("[data-guide-next]").addEventListener("click", () => {
    if (currentGuideStep < prizeGuides[currentGuide].steps.length - 1) {
      currentGuideStep++; renderGuideStep(); dialog.scrollTop = 0;
      if (currentGuideStep === prizeGuides[currentGuide].steps.length - 1) $("[data-guide-done]").focus();
    }
  });
  $("[data-guide-close]").addEventListener("click", () => dialog.close());
  $("[data-guide-done]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => guideTrigger?.focus());
}

function wireRcoinGuide() {
  const dialog = $("[data-rcoin-dialog]"), trigger = $("[data-rcoin-open]"), view = $("[data-rcoin-view]");
  const zoom = $("[data-rcoin-zoom]"), poster = $("[data-rcoin-poster]");
  function resetZoom() {
    view.classList.remove("is-zoomed"); zoom.setAttribute("aria-pressed", "false");
    $("[data-rcoin-zoom-icon]").src = publicAssetUrl("/assets/guides/icon-zoom-in.svg");
    $("[data-rcoin-zoom-label]").textContent = "Ampliar";
    view.scrollTop = 0; view.scrollLeft = 0;
  }
  trigger.addEventListener("click", () => {
    if (dialog.open) return;
    if (!poster.getAttribute("src")) poster.src = publicAssetUrl("/assets/guides/rcoin-donacion-v1.png");
    resetZoom(); dialog.showModal();
  });
  zoom.addEventListener("click", () => {
    const enlarged = view.classList.toggle("is-zoomed");
    zoom.setAttribute("aria-pressed", String(enlarged));
    $("[data-rcoin-zoom-label]").textContent = enlarged ? "Ajustar" : "Ampliar";
    $("[data-rcoin-zoom-icon]").src = publicAssetUrl(`/assets/guides/icon-zoom-${enlarged ? "out" : "in"}.svg`);
    view.scrollLeft = 0; view.scrollTop = 0;
  });
  $("[data-rcoin-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { resetZoom(); trigger.focus(); });
}

function updateFloatingButton() {
  const floating = $(".floating-join");
  const heroAction = $(".hero-actions");
  const hasSections = !$("[data-public-content]").hidden;
  const scrollable = document.documentElement.scrollHeight > window.innerHeight + 2;
  floating.hidden = !state.settings?.joinEnabled || !hasSections || !scrollable
    || heroAction.getBoundingClientRect().bottom >= 0;
}

function wireFloatingButton() {
  window.addEventListener("scroll", updateFloatingButton, { passive: true });
  window.addEventListener("resize", updateFloatingButton);
  updateFloatingButton();
}

wireJoinDialog();
wireSearch();
wireGuides();
wireRcoinGuide();
wireFloatingButton();
$("[data-year]").textContent = new Date().getFullYear();
loadPublic().catch(() => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="load-error">No se pudo cargar la informacion de MAZINO.</p>`);
});
