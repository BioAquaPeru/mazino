const adminDestinations = {
  spaces: ["spaces"], home: null, members: ["members"], access: ["rewards", "access"], accessRequests: ["rewards", "access-requests"], departures: ["rewards", "roster-tracking"], tracking: ["rewards", "tracking"],
  prizes: ["rewards", "delivery"], bulk: ["rewards", "bulk"], pending: ["rewards", "pending"], assignments: ["rewards", "tracking"], inventory: ["rewards", "inventory"], renameBatch: ["rewards", "rename-batch"], import: ["rewards", "import"],
  imageBatches: ['rewards','image-batches'],
  events: ["rewards", "events"], winners: ["rewards", "assignments"], staff: ["staff", "accounts"], pool: ["staff", "pool"], audit: ["staff", "audit"], transfers: ["staff", "transfers"],
  donations: ["donations", "results"], donationMembers: ["donations", "members"], donationUpload: ["donations", "upload"], donationCaptureBlocks: ["donations", "capture-blocks"], donationGoal: ["donations", "goal-create"], donationGoals: ["donations", "goals"], donationHistory: ["donations", "history"], donationImports: ["donations", "imports"],
  donationRankings: ["donations", "rankings"], settings: ["settings"], circle: ["circle"], sync: ["sync"], github: ["github"], security: ["security"],
};
const adminWorkflows = [
  { id: "home", title: "Inicio", tasks: [["home", "Resumen del dia"]] },
  { id: "members", title: "Integrantes", tasks: [["members", "Integrantes"], ["access", "Claves de premios"], ["accessRequests", "Solicitudes de acceso"], ["departures", "Entradas y salidas"]] },
  { id: "prizes", title: "Premios", tasks: [["prizes", "Entregar"], ["bulk", "Repartir por lote"], ["pending", "Pendientes"], ["assignments", "Entregas y seguimiento"], ["inventory", "Inventario"], ['imageBatches','Imagenes de lotes'], ["renameBatch", "Renombrar por lote"], ["import", "Cargar cupones"]] },
  { id: "events", title: "Eventos", tasks: [["events", "Crear y administrar"], ["winners", "Ganadores"]] },
  { id: "donations", title: "Donaciones", tasks: [["donations", "Resultados"], ["donationMembers", "Integrantes y cambios"], ["donationUpload", "Cargar totales"], ["donationCaptureBlocks", "Cargas por captura"], ["donationGoal", "Crear meta"], ["donationGoals", "Metas y responsables"], ["donationHistory", "Historial"], ["donationImports", "Cargas anteriores"], ["donationRankings", "Exclusiones de tops"]] },
  { id: "staff", title: "Sublideres", tasks: [["staff", "Accesos y permisos"], ["pool", "Entregar cupo"], ["transfers", "Traspasos"], ["audit", "Actividad"]] },
  { id: "spaces", title: "Circulos y grupos", tasks: [["spaces", "Agregar y administrar"]] },
  { id: "settings", title: "Configuracion", tasks: [["settings", "Pagina principal"], ["circle", "Nivel y EXP del circulo"], ["sync", "Sincronizacion"], ["github", "Publicacion"], ["security", "Acceso y seguridad"]] },
  { id: "circle", title: "Nivel y EXP del circulo", tasks: [["circle", "Requisitos de EXP"]] },
];
function renderAdminHome() {
  if (!adminState) return;
  for (const [selector, value] of [['[data-home-members]', String(adminState.draft.members.length)], ['[data-home-sync]', adminState.sync?.lastSyncAt ? new Date(adminState.sync.lastSyncAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Sin consulta registrada'], ['[data-home-publishing]', adminState.github?.enabled ? 'Activa' : 'Desactivada']]) {
    if ($(selector).textContent !== value) $(selector).textContent = value;
  }
}
function selectAdminSection(name) {
  if(name === "tracking") name = "assignments";
  if (!Object.hasOwn(adminDestinations, name)) return;
  const destination = adminDestinations[name];
  const workflow = adminWorkflows.find(group => group.id === name) || adminWorkflows.find(group => group.tasks.some(([id]) => id === name));
  $("[data-admin-home]").hidden = name !== "home";
  for (const panel of $$("[data-admin-section]")) {
    const selected = Boolean(destination && panel.dataset.adminSection === destination[0]);
    panel.hidden = !selected; panel.open = selected;
  }
  for (const [selector, attribute, root] of [["[data-rewards-subsection]", "rewardsSubsection", "rewards"], ["[data-staff-group]", "staffGroup", "staff"], ["[data-donation-task]", "donationTask", "donations"]]) {
    for (const section of $$(selector)) {
      const selected = destination?.[0] === root && section.dataset[attribute] === destination[1];
      section.hidden = !selected; section.open = selected;
    }
  }
  for (const button of $$("[data-admin-nav]")) {
    if (button.dataset.adminNav === workflow?.id) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $("[data-admin-nav-select]").value = workflow?.id || name;
  $("[data-workspace-title]").textContent = workflow?.title || "MAZINO";
  const tasks = (workflow?.tasks || []).map(([id, label]) => `<button type="button" data-admin-open="${id}"${id === name ? ' aria-current="page"' : ""}>${label}</button>`).join("");
  if ($('[data-admin-task-navigation]').innerHTML !== tasks) $('[data-admin-task-navigation]').innerHTML = tasks;
  if (name === "home" && typeof refreshDailySummary === "function") refreshDailySummary();
  if (name === "winners") {
    if ($('[data-assignment-member-filter]')) $('[data-assignment-member-filter]').value = '';
    $("[data-assignment-event]").value = ""; $("[data-assignment-status]").value = "winners";
    if (typeof renderRewardAssignments === "function") renderRewardAssignments();
  }
  const attribute = destination?.[0] === "staff" ? "data-staff-group" : destination?.[0] === "donations" ? "data-donation-task" : "data-rewards-subsection";
  const target = destination?.[1] ? $(`[${attribute}="${destination[1]}"]`) : destination ? $(`[data-admin-section="${destination[0]}"]`) : $("[data-admin-home]");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!$("[data-dashboard]").hidden) $("[data-workspace-title]").scrollIntoView({ behavior: "smooth", block: "start" });
}
for (const button of $$("[data-admin-nav]")) button.addEventListener("click", () => selectAdminSection(button.dataset.adminNav));
$("[data-admin-nav-select]").addEventListener("change", event => selectAdminSection(event.target.value));
document.addEventListener("click", event => {
  const button = event.target.closest("[data-admin-open]");
  if (button) selectAdminSection(button.dataset.adminOpen);
});
$("[data-logout]").addEventListener("click", () => {
  selectAdminSection("home");
  for (const node of $$("[data-home-members],[data-home-sync],[data-home-publishing]")) node.textContent = "-";
});
selectAdminSection("home");
renderAdminHome();
