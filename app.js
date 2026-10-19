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
wireFloatingButton();
$("[data-year]").textContent = new Date().getFullYear();
loadPublic().catch(() => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="load-error">No se pudo cargar la informacion de MAZINO.</p>`);
});
