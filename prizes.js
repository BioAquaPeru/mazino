let rewardSession = null;
let rewardOwner = "";
let rewardApi = "";
let rewardEvents = [];
let rewardBusy = false;
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
}

async function prizeRequest(path, body) {
  if (!rewardApi) throw new Error("Los premios aun no estan disponibles.");
  const response = await fetch(`${rewardApi}/api/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(rewardSession ? { Authorization: `Bearer ${rewardSession.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) { rewardSession = null; saveRewardSession(); renderRewardIdentity(); }
  if (!response.ok) throw new Error(result.error || "No se pudo conectar con los premios.");
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

function renderPrizeEvents() {
  const container = rewardDialog.querySelector("[data-prize-events]");
  const events = rewardEvents.filter((event) => event.ownerId === rewardOwner);
  container.innerHTML = events.map((event) => {
    const full = event.claimed >= event.total;
    const start = new Date(event.startsAt).toLocaleString("es-PE", { timeZone: "America/Lima" });
    return `<section class="prize-item"><h3>${escapeHtml(event.title)}</h3><p>${full ? "Premio reclamado" : `Inicio: ${escapeHtml(start)} (Peru)`}</p><p>${event.claimed} de ${event.total} premios entregados</p><button type="button" class="primary-action small-action" data-flash-claim="${escapeHtml(event.id)}" ${full || !rewardSession ? "disabled" : ""}>Reclamar premio relampago</button></section>`;
  }).join("");
}

async function refreshPrizeDialog() {
  renderRewardIdentity();
  const data = await prizeRequest("public");
  rewardEvents = data.events;
  renderPrizeEvents();
  const container = rewardDialog.querySelector("[data-personal-prizes]");
  container.innerHTML = "";
  if (!rewardSession) return;
  const personal = await prizeRequest("me");
  if (!rewardDialog.open) return;
  container.innerHTML = personal.prizes.map((prize) => prize.code ? prizeCodeMarkup(prize, personal.instructions)
    : `<section class="prize-item"><h3>${escapeHtml(prize.label)}</h3><p>Premio personal disponible</p><button class="primary-action small-action" type="button" data-personal-claim="${escapeHtml(prize.id)}">Reclamar cupon</button></section>`).join("")
    || '<p class="muted">No tienes cupones personales pendientes.</p>';
}

function prizeCodeMarkup(prize, instructions) {
  return `<section class="prize-item prize-revealed"><h3>${escapeHtml(prize.label)}</h3><p>${escapeHtml(instructions)}</p><code class="prize-code">${escapeHtml(prize.code)}</code><div class="editor-actions"><button class="ghost-button" type="button" data-prize-copy="${escapeHtml(prize.id)}">Copiar codigo</button><button class="primary-action small-action" type="button" data-prize-ack="${escapeHtml(prize.id)}">Ya lo guarde</button></div></section>`;
}

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-prize-open]");
  if (!trigger) return;
  rewardOwner = trigger.dataset.prizeOpen;
  const name = trigger.textContent.trim();
  rewardDialog.querySelector("[data-prize-heading]").textContent = `Premios de ${name}`;
  rewardDialog.querySelector("[data-prize-login]").reset();
  rewardDialog.querySelector('[name="nick"]').value = rewardSession?.member.nick || name;
  rewardDialog.querySelector("[data-prize-status]").textContent = "Cargando premios...";
  rewardDialog.querySelector("[data-personal-prizes]").innerHTML = "";
  rewardDialog.querySelector("[data-prize-events]").innerHTML = "";
  rewardDialog.showModal();
  try { await refreshPrizeDialog(); rewardDialog.querySelector("[data-prize-status]").textContent = ""; }
  catch (error) { rewardDialog.querySelector("[data-prize-status]").textContent = error.message; }
});

rewardDialog.querySelector("[data-prize-close]").addEventListener("click", () => rewardDialog.close());
rewardDialog.addEventListener("close", () => {
  rewardDialog.querySelector('[name="password"]').value = "";
  rewardDialog.querySelector("[data-personal-prizes]").innerHTML = "";
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
  rewardBusy = true; button.disabled = true;
  try {
    if (button.hasAttribute("data-prize-copy")) {
      const code = button.closest(".prize-item").querySelector(".prize-code").textContent;
      try { await navigator.clipboard.writeText(code); rewardDialog.querySelector("[data-prize-status]").textContent = "Codigo copiado. Pegalo en el cupon de R2Beat."; }
      catch { throw new Error("No se pudo copiar automaticamente. Selecciona el codigo para copiarlo."); }
    } else if (button.hasAttribute("data-prize-ack")) {
      await prizeRequest("acknowledge", { couponId: button.dataset.prizeAck });
      await refreshPrizeDialog();
      rewardDialog.querySelector("[data-prize-status]").textContent = "Premio guardado. Ya no aparecera en tu usuario.";
    } else if (button.hasAttribute("data-prize-logout")) {
      await prizeRequest("logout", {});
      rewardSession = null; saveRewardSession();
      await refreshPrizeDialog();
    } else {
      await prizeRequest("claim", button.dataset.flashClaim ? { eventId: button.dataset.flashClaim } : { couponId: button.dataset.personalClaim });
      await refreshPrizeDialog();
      rewardDialog.querySelector("[data-prize-status]").textContent = "Premio entregado. Copia tu codigo y guardalo.";
    }
  } catch (error) {
    rewardDialog.querySelector("[data-prize-status]").textContent = error.message;
    if (!rewardSession) { rewardDialog.querySelector("[data-prize-login]").hidden = false; rewardDialog.querySelector("[data-personal-prizes]").innerHTML = ""; }
  } finally { rewardBusy = false; button.disabled = false; }
});
