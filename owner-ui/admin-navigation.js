const adminDestinations = {
  visitors:["visitors"],spaces: ["spaces"], home: null, members: ["members"], access: ["rewards", "access"], accessRequests: ["rewards", "access-requests"], departures: ["rewards", "roster-tracking"], tracking: ["rewards", "tracking"],
  prizes: ["rewards", "delivery"], bulk: ["rewards", "bulk"], pending: ["rewards", "pending"], alerts: ["rewards", "alerts"], assignments: ["rewards", "tracking"], inventory: ["rewards", "inventory"], renameBatch: ["rewards", "rename-batch"], import: ["rewards", "import"],
  imageBatches: ['rewards','image-batches'],
  events: ["rewards", "events"], winners: ["rewards", "assignments"], staff: ["staff", "accounts"], pool: ["staff", "pool"], audit: ["staff", "audit"], transfers: ["staff", "transfers"],
  donations: ["donations", "results"], donationMembers: ["donations", "members"], donationUpload: ["donations", "upload"], donationCaptureBlocks: ["donations", "capture-blocks"], donationGoal: ["donations", "goal-create"], donationGoals: ["donations", "goals"], donationHistory: ["donations", "history"], donationImports: ["donations", "imports"],
  donationRankings: ["donations", "rankings"], settings: ["settings"], circle: ["circle"], sync: ["sync"], github: ["github"], security: ["security"],
};
const adminWorkflows = [
  { id: "home", title: "Inicio", tasks: [["home", "Resumen del dia"]] },
  {id:"visitors",title:"Visitantes y entregas",tasks:[["visitors","Resumen y entregas"]]},
  { id: "members", title: "Integrantes", tasks: [["members", "Integrantes"], ["access", "Claves de premios"], ["accessRequests", "Solicitudes de acceso"], ["departures", "Entradas y salidas"]] },
  { id: "prizes", title: "Premios", tasks: [["prizes", "Entregar"], ["bulk", "Repartir por lote"], ["pending", "Pendientes"], ["alerts", "Alertas"], ["assignments", "Entregas y seguimiento"], ["inventory", "Inventario"], ['imageBatches','Imagenes de lotes'], ["renameBatch", "Renombrar por lote"], ["import", "Cargar cupones"]] },
  { id: "events", title: "Eventos", tasks: [["events", "Crear y administrar"], ["winners", "Ganadores"]] },
  { id: "donations", title: "Donaciones", tasks: [["donations", "Resultados"], ["donationMembers", "Integrantes y cambios"], ["donationUpload", "Cargar totales"], ["donationCaptureBlocks", "Cargas por captura"], ["donationGoal", "Grupos y metas"], ["donationGoals", "Metas y responsables"], ["donationHistory", "Historial"], ["donationImports", "Cargas anteriores"], ["donationRankings", "Exclusiones de tops"]] },
  { id: "staff", title: "Sublideres", tasks: [["staff", "Accesos y permisos"], ["pool", "Enviar cupos a círculos"], ["transfers", "Traspasos"], ["audit", "Actividad"]] },
  { id: "spaces", title: "Circulos y grupos", tasks: [["spaces", "Agregar y administrar"]] },
  { id: "settings", title: "Configuracion", tasks: [["settings", "Pagina principal"], ["circle", "Nivel y EXP del circulo"], ["sync", "Sincronizacion"], ["github", "Publicacion"], ["security", "Acceso y seguridad"]] },
  { id: "circle", title: "Nivel y EXP del circulo", tasks: [["circle", "Requisitos de EXP"]] },
];
let adminCircleIdentity = null;
let adminQuickAwards = null;
const adminQuickDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
function setAdminCircleIdentity(circle) {
  adminCircleIdentity = circle;
  const badge = $('[data-admin-circle-badge]'), icon = $('[data-admin-circle-icon]');
  const name = circle?.name || (adminCircleId === 'main' ? 'Mazino' : 'Consultando círculo…');
  $('[data-admin-circle-badge-name]').textContent = name;
  for (const label of $$('[data-admin-modal-circle]')) label.textContent = name;
  badge.style.setProperty('--panel-circle-color', /^#[a-f0-9]{6}$/i.test(circle?.tabColor || '') ? circle.tabColor : '#ff506a');
  icon.hidden = !circle?.logoUrl;
  if (circle?.logoUrl) icon.src = circle.logoUrl; else icon.removeAttribute('src');
  renderAdminHome();
}
function setAdminQuickAwards(state) {
  adminQuickAwards = state?.connection?.configured ? state : null;
  renderAdminHome();
}
function renderAdminQuickMembers() {
  if (!adminState || $('[data-admin-circle-quick]').hidden) return;
  const query = adminSearchKey($('[data-admin-quick-search]').value);
  const rows = [...adminState.draft.members].filter(member => adminSearchKey(member.nick).includes(query))
    .sort((a, b) => a.nick.localeCompare(b.nick, 'es'));
  const results = $('[data-admin-quick-results]');
  const html = rows.slice(0, 6).map(member => `<li><button type="button" class="member-profile-link" data-member-profile="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</button><small>${member.joinedOn ? 'Ingreso: ' + escapeHtml(member.joinedOn.split('-').reverse().join('/')) : 'Sin fecha de ingreso'}</small></li>`).join('');
  if (results.innerHTML !== html) results.innerHTML = html;
  const status = rows.length ? (rows.length > 6 ? `Mostrando 6 de ${rows.length}. Escribe más letras para acotar la búsqueda.` : `${rows.length} ${rows.length === 1 ? 'integrante' : 'integrantes'}`) : 'No hay integrantes con ese nick.';
  if ($('[data-admin-quick-search-status]').textContent !== status) $('[data-admin-quick-search-status]').textContent = status;
}
function renderAdminHome() {
  if (!adminState) return;
  for (const [selector, value] of [['[data-home-members]', String(adminState.draft.members.length)], ['[data-home-sync]', adminState.sync?.lastSyncAt ? new Date(adminState.sync.lastSyncAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Sin consulta registrada'], ['[data-home-publishing]', adminState.github?.enabled ? 'Activa' : 'Desactivada']]) {
    if ($(selector).textContent !== value) $(selector).textContent = value;
  }
  const quick = $('[data-admin-circle-quick]');
  const isExtraCircle = adminCircleIdentity?.kind === 'circle' && adminCircleIdentity.id !== 'main' && adminCircleIdentity.id === adminCircleId;
  quick.hidden = !isExtraCircle;
  $('[data-admin-home-metrics]').hidden = isExtraCircle;
  if (!isExtraCircle) return;
  quick.style.setProperty('--panel-circle-color', /^#[a-f0-9]{6}$/i.test(adminCircleIdentity.tabColor) ? adminCircleIdentity.tabColor : '#ff506a');
  const sync = adminState.sync, reading = sync?.lastAttemptAt || sync?.lastSyncAt, at = typeof reading === 'number' ? reading : Date.parse(reading || '');
  const now = Date.now();
  const event = adminQuickAwards?.events.filter(item => item.status === 'active' && item.starts_at > now && item.claimed < item.total && (!item.ends_at || item.ends_at > item.starts_at))
    .sort((a, b) => a.starts_at - b.starts_at)[0];
  const pending = adminQuickAwards?.coupons.filter(coupon => coupon.status === 'assigned' && coupon.assigned_member_id && !coupon.event_id).length;
  for (const [selector, value] of [
    ['[data-admin-quick-name]', adminCircleIdentity.name],
    ['[data-admin-quick-count]', String(adminState.draft.members.length)],
    ['[data-admin-quick-date]', Number.isFinite(at) ? adminQuickDate.format(at) : 'Sin consulta registrada'],
    ['[data-admin-quick-pending]', pending === undefined ? 'Por consultar' : String(pending)],
    ['[data-admin-quick-event]', event ? `${event.title} · ${adminQuickDate.format(event.starts_at)}` : adminQuickAwards ? 'Sin eventos programados' : 'Por consultar'],
  ]) if ($(selector).textContent !== value) $(selector).textContent = value;
  $('[data-admin-quick-sync]').textContent = sync?.lastError ? 'Reintentar consulta' : 'Actualizar integrantes';
  $('[data-admin-quick-sync]').title = sync?.lastError ? 'Se conserva la última lista válida.' : '';
  const status = $('[data-admin-quick-sync-status]');
  if (!status.dataset.manual && status.textContent !== (sync?.lastError ? 'Falló la consulta a R2Beat. Se conserva la última lista válida.' : ''))
    status.textContent = sync?.lastError ? 'Falló la consulta a R2Beat. Se conserva la última lista válida.' : '';
  renderAdminQuickMembers();
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
  if (name === "home") renderAdminHome();
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
$('[data-admin-quick-search]').addEventListener('input', renderAdminQuickMembers);
document.addEventListener("click", event => {
  const button = event.target.closest("[data-admin-open]");
  if (button) selectAdminSection(button.dataset.adminOpen);
});
$("[data-logout]").addEventListener("click", () => {
  selectAdminSection("home");
  for (const node of $$("[data-home-members],[data-home-sync],[data-home-publishing]")) node.textContent = "-";
  $('[data-admin-quick-search]').value = '';
});
let adminEntryTask="home";
try{
  const savedTask=sessionStorage.getItem('mazino-admin-next-task');
  sessionStorage.removeItem('mazino-admin-next-task');
  if(savedTask==='import'&&adminCircleId==='main')adminEntryTask='import';
}catch{}
selectAdminSection(adminEntryTask);
renderAdminHome();
