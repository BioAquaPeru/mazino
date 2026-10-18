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
  $("[data-footer]").hidden = !showElite && !showMembers;
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
  updateFloatingButton();
}

function buildWhatsAppUrl(nick) {
  const phone = String(state.settings.whatsappNumber || "").replace(/[^\d]/g, "");
  const template = state.settings.whatsappTemplate || "Hola, quiero unirme a Mazino. Mi nick en R2Beat es: [NICK].";
  const message = template.replace("[NICK]", nick);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function loadPublic() {
  const endpoint = document.documentElement.hasAttribute("data-static") ? "./site-data.json" : "./api/public";
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar MAZINO.");
  const saved = await response.json();
  renderPublic(saved);
  let signature = JSON.stringify({ settings: saved.settings, members: saved.members, elite: saved.elite, totalMembers: saved.totalMembers });
  const service = saved.settings.rewardsServiceUrl;
  if (service && /^https:\/\/[a-z0-9.-]+$/i.test(service)) {
    const refresh = async () => {
      try {
        const current = await fetch(`${service}/api/site`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!current.ok) return;
        const data = await current.json();
        if (data.settings && Array.isArray(data.members) && Array.isArray(data.elite)) {
          const next = JSON.stringify({ settings: data.settings, members: data.members, elite: data.elite, totalMembers: data.totalMembers });
          if (signature !== next) { signature = next; renderPublic(data); }
        }
      } catch { /* The published static version remains usable during outages. */ }
    };
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  }
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
wireFloatingButton();
$("[data-year]").textContent = new Date().getFullYear();
loadPublic().catch(() => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="load-error">No se pudo cargar la informacion de MAZINO.</p>`);
});
