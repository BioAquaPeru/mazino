let rewardSession = null;
let rewardOwner = "";
let rewardApi = "";
let rewardEvents = [];
let rewardBusy = false;
let rewardClockOffset = 0;
let rewardDialogRevision = 0;
let rewardPublicRevision = 0;
let rewardPublicBusy = false;
const rewardDialog = document.querySelector("[data-prize-dialog]");

function saveRewardSession() {
  try {
    if (rewardSession) sessionStorage.setItem("mazino-prizes-session", JSON.stringify(rewardSession));
    else sessionStorage.removeItem("mazino-prizes-session");
  } catch { /* Login also works when browser storage is unavailable. */ }
}

function renderRewardIdentity() {
  rewardDialog.querySelector("[data-prize-login]").hidden = Boolean(rewardSession);
  rewardDialog.querySelector("[data-prize-logout]").hidden = !rewardSession;
  rewardDialog.querySelector("[data-prize-identity]").textContent = rewardSession ? `Sesion: ${rewardSession.member.nick}` : "";
  if (!rewardSession) rewardDialog.querySelector("[data-personal-prizes]").innerHTML = "";
  if (!rewardSession) rewardDialog.querySelector('[data-personal-donations]').innerHTML = '';
}

async function prizeRequest(path, body) {
  if (!rewardApi) throw new Error("Los premios aun no estan disponibles.");
  const requestToken = rewardSession?.token;
  const response = await fetch(`${rewardApi}/api/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(rewardSession ? { Authorization: `Bearer ${rewardSession.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && requestToken === rewardSession?.token) { rewardSession = null; saveRewardSession(); renderRewardIdentity(); }
  if (!response.ok) throw Object.assign(new Error(result.error || "No se pudo conectar con los premios."), { status: response.status, eventOutcome: result.eventOutcome });
  return result;
}

function configurePrizes(settings) {
  const value = String(settings.rewardsServiceUrl || "");
  rewardApi = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) ? value : "";
  try {
    const saved = JSON.parse(sessionStorage.getItem("mazino-prizes-session") || "null");
    if (saved?.expiresAt > Date.now() && saved.token && saved.member) rewardSession = saved;
  } catch { rewardSession = null; saveRewardSession(); }
}

function eventIsFinished(event) {
  return event.status === "closed" || (event.available !== undefined ? event.available === 0 : event.claimed >= event.total)
    || (event.endsAt > 0 && event.endsAt < Date.now() + rewardClockOffset);
}
function eventWinnersMarkup(event) {
  if (!event.winners?.length) return "";
  const finished = eventIsFinished(event), names = event.winners.map((w) => w.nick).join(", ");
  const label = finished ? `${event.winners.length === 1 ? "Ganador" : "Ganadores"} del evento` : "Ganadores hasta ahora del evento";
  return `<p class="event-winners" role="status">${escapeHtml(label)} &quot;${escapeHtml(event.title)}&quot;: <strong>${escapeHtml(names)}</strong>.</p>`;
}
function renderPrizeEvents() {
  const container = rewardDialog.querySelector("[data-prize-events]");
  const savedKeys = new Map(Array.from(rewardDialog.querySelectorAll?.("[data-event-key]") || [], (input) => [input.dataset.eventKey, input.value]));
  const focused = document.activeElement?.dataset?.eventKey;
  const selection = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const events = rewardEvents.filter((event) => event.ownerId === rewardOwner);
  container.innerHTML = events.map((event) => {
    const full = eventIsFinished(event);
    const start = new Date(event.startsAt).toLocaleString("es-PE", { timeZone: "America/Lima" });
    return `<section class="prize-item"><h3>${escapeHtml(event.title)}</h3><p>Apertura: ${escapeHtml(start)} (Peru)</p><p data-event-opening></p><p>${event.claimed} de ${event.total} premios entregados</p>${eventWinnersMarkup(event)}${event.keyRequired && !full ? `<label class="event-key-field"><span>Clave de este evento</span><input type="password" inputmode="numeric" maxlength="6" autocomplete="off" data-event-key="${escapeHtml(event.id)}" /></label>` : ""}<button type="button" class="primary-action small-action" data-flash-claim="${escapeHtml(event.id)}" data-opens-at="${event.startsAt}" data-ends-at="${event.endsAt || 0}" data-full="${full ? "1" : "0"}" ${full || !rewardSession ? "disabled" : ""}>${full ? "Evento finalizado" : "Reclamar premio relampago"}</button></section>`;
  }).join("");
  for (const input of rewardDialog.querySelectorAll?.("[data-event-key]") || []) {
    input.value = savedKeys.get(input.dataset.eventKey) || "";
    if (input.dataset.eventKey === focused) { input.focus?.(); if (selection?.every(Number.isInteger)) input.setSelectionRange?.(...selection); }
  }
  updateEventOpening();
}

function updateEventOpening() {
  const now = Date.now() + rewardClockOffset;
  for (const button of rewardDialog.querySelectorAll?.("[data-flash-claim]") || []) {
    const seconds = Math.max(0, Math.ceil((Number(button.dataset.opensAt) - now) / 1000));
    const ended = Number(button.dataset.endsAt) > 0 && Number(button.dataset.endsAt) < now;
    const full = button.dataset.full === "1";
    button.disabled = !rewardSession || seconds > 0 || ended || full || rewardBusy;
    button.closest(".prize-item").querySelector("[data-event-opening]").textContent = full ? "Premios agotados" : ended ? "Evento finalizado" : seconds ? `Abre en ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Evento abierto";
  }
}
if (typeof setInterval === "function") {
  setInterval(() => { if (rewardDialog.open) updateEventOpening(); }, 1000);
  setInterval(async () => {
    if (!rewardDialog.open || document.hidden || rewardBusy || rewardPublicBusy) return;
    rewardPublicBusy = true;
    try { await refreshPublicPrizeEvents(); } catch { /* Retain the last results during a connection outage. */ }
    finally { rewardPublicBusy = false; }
  }, 5000);
}

async function refreshPublicPrizeEvents() {
  const revision = ++rewardPublicRevision, dialogRevision = rewardDialogRevision;
  const data = await prizeRequest("public");
  if (!rewardDialog.open || revision !== rewardPublicRevision || dialogRevision !== rewardDialogRevision) return;
  rewardClockOffset = Number.isFinite(data.serverNow) ? data.serverNow - Date.now() : 0;
  const changed = JSON.stringify(rewardEvents) !== JSON.stringify(data.events);
  rewardEvents = data.events;
  if (changed) renderPrizeEvents();
  else updateEventOpening();
}

async function refreshPrizeDialog() {
  renderRewardIdentity();
  const revision = rewardDialogRevision, session = rewardSession?.token;
  await refreshPublicPrizeEvents();
  if (!rewardDialog.open || revision !== rewardDialogRevision) return;
  const container = rewardDialog.querySelector("[data-personal-prizes]");
  container.innerHTML = "";
  rewardDialog.querySelector('[data-personal-donations]').innerHTML = '';
  if (!rewardSession) return;
  const personal = await prizeRequest("me");
  if (!rewardDialog.open || revision !== rewardDialogRevision || session !== rewardSession?.token) return;
  renderPersonalDonations(personal.donations, personal.member?.nick || rewardSession.member.nick);
  container.innerHTML = personal.prizes.map((prize) => prize.code ? prizeCodeMarkup(prize, personal.instructions)
    : `<section class="prize-item"><h3>${escapeHtml(prize.label)}</h3><p>Premio personal disponible</p><button class="primary-action small-action" type="button" data-personal-claim="${escapeHtml(prize.id)}">Reclamar cupon</button></section>`).join("")
    || '<p class="muted">No tienes cupones personales pendientes.</p>';
}

function prizeCodeMarkup(prize, instructions) {
  return `<section class="prize-item prize-revealed"><h3>${escapeHtml(prize.label)}</h3><p>${escapeHtml(instructions)}</p><code class="prize-code">${escapeHtml(prize.code)}</code><div class="editor-actions"><button class="ghost-button" type="button" data-prize-copy="${escapeHtml(prize.id)}">Copiar codigo</button><button class="primary-action small-action" type="button" data-prize-ack="${escapeHtml(prize.id)}">Ya lo guarde</button></div></section>`;
}
function renderPersonalDonations(data, nick) {
  const container = rewardDialog.querySelector('[data-personal-donations]');
  if (!data) { container.innerHTML = ''; return; }
  const number = value => value == null ? 'Pendiente de confirmar' : Number(value).toLocaleString('es-PE');
  const date = value => value ? String(value).split('-').reverse().join('/') : '';
  container.innerHTML = `<section class="personal-donations"><h3>Mis donaciones: ${escapeHtml(nick)}</h3><p>Total registrado: <strong>${number(data.total)}${data.total != null ? ' Rcoin' : ''}</strong>${data.readingOn ? ` <small>Lectura: ${escapeHtml(date(data.readingOn))}</small>` : ''}</p>
    ${(data.goals || []).map(g => `<div class="personal-goal"><h4>${escapeHtml(g.title)}</h4><p class="muted">${escapeHtml(date(g.start))} al ${escapeHtml(date(g.end))}</p><dl><div><dt>Meta</dt><dd>${number(g.target)} Rcoin</dd></div><div><dt>Donado en el plazo</dt><dd>${number(g.donated)}${g.donated != null ? ' Rcoin' : ''}</dd></div><div><dt>Te falta</dt><dd>${number(g.remaining)}${g.remaining != null ? ' Rcoin' : ''}</dd></div></dl>${g.status === 'missing' ? '<p class="goal-pending">Faltan lecturas confirmadas para calcular esta meta. Consulta con el lider.</p>' : `<progress aria-label="Avance de la meta ${escapeHtml(g.title)}" max="${Number(g.target)}" value="${Math.max(0, Math.min(Number(g.target), Number(g.donated)))}"></progress><p class="goal-result ${g.status === 'fulfilled' ? 'fulfilled' : ''}">${g.status === 'fulfilled' ? 'Meta cumplida' : 'Meta en seguimiento'}</p>`}${g.effectiveStart && g.effectiveStart !== g.start ? `<small>Cuenta desde tu ingreso: ${escapeHtml(date(g.effectiveStart))}</small>` : ''}</div>`).join('') || '<p class="muted">No tienes metas activas en este momento.</p>'}</section>`;
}

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-prize-open]");
  if (!trigger) return;
  rewardDialogRevision++; rewardPublicRevision++;
  const revision = rewardDialogRevision;
  rewardOwner = trigger.dataset.prizeOpen;
  const name = trigger.textContent.trim();
  rewardDialog.querySelector("[data-prize-heading]").textContent = `Premios de ${name}`;
  rewardDialog.querySelector("[data-prize-login]").reset();
  rewardDialog.querySelector('[name="nick"]').value = rewardSession?.member.nick || name;
  rewardDialog.querySelector("[data-prize-status]").textContent = "Cargando premios...";
  rewardDialog.querySelector("[data-personal-prizes]").innerHTML = "";
  rewardDialog.querySelector('[data-personal-donations]').innerHTML = '';
  rewardDialog.querySelector("[data-prize-events]").innerHTML = "";
  rewardEvents = [];
  rewardDialog.showModal();
  try {
    await refreshPrizeDialog();
    if (revision !== rewardDialogRevision || !rewardDialog.open) return;
    if (!rewardSession && rewardEvents.some((entry) => entry.ownerId === rewardOwner) && rewardDialog.querySelector('[name="nick"]').value === name) rewardDialog.querySelector('[name="nick"]').value = "";
    rewardDialog.querySelector("[data-prize-status]").textContent = "";
  }
  catch (error) { rewardDialog.querySelector("[data-prize-status]").textContent = error.message; }
});

rewardDialog.querySelector("[data-prize-close]").addEventListener("click", () => rewardDialog.close());
rewardDialog.addEventListener("close", () => {
  rewardDialogRevision++; rewardPublicRevision++;
  rewardDialog.querySelector('[name="password"]').value = "";
  rewardDialog.querySelector("[data-personal-prizes]").innerHTML = "";
  rewardDialog.querySelector('[data-personal-donations]').innerHTML = '';
  rewardDialog.querySelector("[data-prize-events]").innerHTML = "";
});
rewardDialog.querySelector("[data-prize-login]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (rewardBusy) return;
  rewardBusy = true;
  const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
  try {
    rewardSession = await prizeRequest("login", { nick: event.target.nick.value, password: event.target.password.value });
    event.target.password.value = "";
    saveRewardSession();
    await refreshPrizeDialog();
    rewardDialog.querySelector("[data-prize-status]").textContent = "";
  } catch (error) { rewardDialog.querySelector("[data-prize-status]").textContent = error.message; }
  finally { rewardBusy = false; button.disabled = false; }
});

rewardDialog.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-personal-claim],[data-flash-claim],[data-prize-copy],[data-prize-ack],[data-prize-logout]");
  if (!button || rewardBusy) return;
  const revision = rewardDialogRevision;
  rewardBusy = true; button.disabled = true;
  try {
    if (button.hasAttribute("data-prize-copy")) {
      const code = button.closest(".prize-item").querySelector(".prize-code").textContent;
      try { await navigator.clipboard.writeText(code); rewardDialog.querySelector("[data-prize-status]").textContent = "Codigo copiado. Pegalo en el cupon de R2Beat."; }
      catch { throw new Error("No se pudo copiar automaticamente. Selecciona el codigo para copiarlo."); }
    } else if (button.hasAttribute("data-prize-ack")) {
      await prizeRequest("acknowledge", { couponId: button.dataset.prizeAck });
      if (revision !== rewardDialogRevision || !rewardDialog.open) return;
      await refreshPrizeDialog();
      rewardDialog.querySelector("[data-prize-status]").textContent = "Premio guardado. Ya no aparecera en tu usuario.";
    } else if (button.hasAttribute("data-prize-logout")) {
      await prizeRequest("logout", {});
      if (revision !== rewardDialogRevision || !rewardDialog.open) return;
      rewardSession = null; saveRewardSession();
      await refreshPrizeDialog();
    } else {
      const input = button.dataset.flashClaim ? button.closest(".prize-item").querySelector("[data-event-key]") : null;
      if (input && !/^\d{6}$/.test(input.value)) throw new Error("Escribe la clave de 6 numeros de este evento.");
      await prizeRequest("claim", button.dataset.flashClaim ? { eventId: button.dataset.flashClaim, eventKey: input?.value || "" } : { couponId: button.dataset.personalClaim });
      if (revision !== rewardDialogRevision || !rewardDialog.open) return;
      await refreshPrizeDialog();
      rewardDialog.querySelector("[data-prize-status]").textContent = "Premio entregado. Copia tu codigo y guardalo.";
    }
  } catch (error) {
    if (revision !== rewardDialogRevision || !rewardDialog.open) return;
    if (error.eventOutcome) {
      rewardPublicRevision++;
      const outcome = error.eventOutcome;
      const current = rewardEvents.findIndex((e) => e.id === outcome.id);
      if (current >= 0) rewardEvents[current] = outcome;
      else rewardEvents.push(outcome);
      renderPrizeEvents();
    }
    rewardDialog.querySelector("[data-prize-status]").textContent = error.message;
    if (!rewardSession) { rewardDialog.querySelector("[data-prize-login]").hidden = false; rewardDialog.querySelector("[data-personal-prizes]").innerHTML = ""; }
  } finally { rewardBusy = false; button.disabled = false; updateEventOpening(); }
});
