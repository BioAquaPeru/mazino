let rewardAdminState = { members: [], coupons: [], events: [] };
let rewardAdminBusy = false;
let rewardAdminRevision = 0;
let rewardCredentialRevision = 0;
let rewardEventKeyRevision = 0;
let rewardCouponPage = 0;
let rewardDeliveryPreview = null;
let rewardDeliveryConfirmBusy = false;
const rewardStatus = (message) => { $("[data-rewards-status]").textContent = message; };
const rewardTime = (value) => value ? new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "-";
const rewardStates = { available: "Disponible", assigned: "Asignado", claimed: "Reclamado", archived: "Archivado", active: "Activo", closed: "Cerrado" };
const rewardItemKey = (label) => String(label || "").normalize("NFKC").trim().toLocaleLowerCase("es");

function clearRewardCredential() {
  rewardCredentialRevision++;
  $("[data-reward-secret]").value = "";
  $("[data-reward-secret-nick]").value = "";
  $("[data-reward-credential]").hidden = true;
  return rewardCredentialRevision;
}

function showRewardCredential(result, memberId, revision) {
  if (revision !== rewardCredentialRevision || $("[data-reward-member]").value !== memberId || $("[data-dashboard]").hidden) return;
  $("[data-reward-secret-nick]").value = result.nick;
  $("[data-reward-secret]").value = result.password;
  $("[data-reward-credential]").hidden = false;
}

function renderRewardItemFilter() {
  const select = $("[data-coupon-item-filter]"), selected = select.value;
  const items = new Map();
  for (const coupon of rewardAdminState.coupons) {
    const key = rewardItemKey(coupon.label);
    if (!key) continue;
    if (!items.has(key)) items.set(key, { key, label: coupon.label.trim(), count: 0 });
    items.get(key).count++;
  }
  select.innerHTML = '<option value="">Todos los items</option>' + [...items.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "es"))
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)} (${item.count})</option>`).join("");
  select.value = items.has(selected) ? selected : "";
}

function filteredRewardCoupons() {
  const status = $("[data-coupon-filter]").value;
  const item = $("[data-coupon-item-filter]").value;
  return rewardAdminState.coupons.filter((coupon) => (status === "all" || coupon.status === status)
    && (!item || rewardItemKey(coupon.label) === item));
}

function rewardDeliveryStock(item) {
  return rewardAdminState.coupons.filter((coupon) => coupon.status === "available" && !coupon.event_id && !coupon.staff_owner_id
    && (!item || rewardItemKey(coupon.label) === item))
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0) || a.id.localeCompare(b.id));
}

function rewardDeliveryPlan() {
  const item = $("[data-delivery-item]").value;
  const member = rewardAdminState.members.find((entry) => entry.active && entry.id === $("[data-reward-member]").value);
  const quantity = Number($("[data-delivery-quantity]").value);
  if (!item) throw new Error("Elige el premio que entregaras.");
  if (!member) throw new Error("Elige al integrante que recibira el premio.");
  const stock = rewardDeliveryStock(item);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50 || quantity > stock.length) throw new Error(`Cantidad invalida. Disponibles para este item: ${stock.length} (maximo 50 por entrega).`);
  return { member, coupons: stock.slice(0, quantity) };
}

function renderRewardDelivery() {
  const select = $("[data-delivery-item]"), selected = select.value;
  const items = new Map();
  for (const coupon of rewardDeliveryStock()) {
    const key = rewardItemKey(coupon.label);
    if (!items.has(key)) items.set(key, { label: coupon.label.trim(), count: 0 });
    items.get(key).count++;
  }
  select.innerHTML = '<option value="">Elige un item disponible</option>' + [...items.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "es"))
    .map(([key, item]) => `<option value="${escapeHtml(key)}">${escapeHtml(item.label)} (${item.count} disponibles)</option>`).join("");
  select.value = items.has(selected) ? selected : "";
  $("[data-delivery-quantity]").max = String(Math.min(50, items.get(select.value)?.count || 1));
  const member = rewardAdminState.members.find((entry) => entry.active && entry.id === $("[data-reward-member]").value);
  $("[data-reward-access-title]").textContent = member ? `Acceso de premios de ${member.nick}` : "Acceso del integrante elegido";
  $("[data-coupon-assign]").textContent = member ? `Asignar seleccionados a ${member.nick}` : "Elige destinatario arriba";
  $("[data-coupon-assign]").disabled = !member;
  try {
    const plan = rewardDeliveryPlan();
    if (typeof OwnerDeliveryPreview !== 'undefined') {
      const item = select.value, quantity = $("[data-delivery-quantity]").value, memberId = plan.member.id;
      rewardDeliveryPreview = OwnerDeliveryPreview.create(plan.member, plan.coupons, { valid: () => $("[data-reward-member]").value === memberId && select.value === item && $("[data-delivery-quantity]").value === quantity });
      OwnerDeliveryPreview.render($("[data-delivery-exact-preview]"), rewardDeliveryPreview);
    }
    $("[data-delivery-summary]").textContent = `${plan.coupons.length} x ${plan.coupons[0].label} para ${plan.member.nick}${plan.member.loginEnabled ? "" : " | Falta generar su acceso de premios"}`;
    $("[data-delivery-submit]").textContent = `Asignar a ${plan.member.nick}`;
    $("[data-delivery-submit]").disabled = false;
  } catch (error) {
    rewardDeliveryPreview = null;
    if (typeof OwnerDeliveryPreview !== 'undefined') {
      const quantity = Number($("[data-delivery-quantity]").value), stock = rewardDeliveryStock(select.value);
      if (!member && select.value && Number.isInteger(quantity) && quantity >= 1 && quantity <= Math.min(50, stock.length)) OwnerDeliveryPreview.renderStock($("[data-delivery-exact-preview]"), stock.slice(0, quantity));
      else OwnerDeliveryPreview.render($("[data-delivery-exact-preview]"), null);
    }
    $("[data-delivery-summary]").textContent = error.message;
    $("[data-delivery-submit]").textContent = "Elige un premio y destinatario";
    $("[data-delivery-submit]").disabled = true;
  }
}

function renderAssignmentEvents() {
  const select = $("[data-assignment-event]"), selected = select.value;
  const events = new Map(rewardAdminState.events.map((e) => [e.id, { title: e.title, date: e.starts_at }]));
  for (const c of rewardAdminState.coupons) if (c.event_id && !events.has(c.event_id)) events.set(c.event_id, { title: "Evento anterior", date: null });
  if (selected && !events.has(selected)) events.set(selected, { title: "Evento anterior", date: null });
  select.innerHTML = '<option value="">Todos los eventos y entregas</option>' + [...events].map(([id, e]) => {
    const winners = rewardAdminState.coupons.filter((c) => c.event_id === id && c.status === "claimed").length;
    return `<option value="${escapeHtml(id)}">${escapeHtml(e.title)}${e.date ? ` | ${rewardTime(e.date)}` : ""} | ${winners} ganadores</option>`;
  }).join("");
  select.value = selected;
}
function viewEventWinners(eventId) {
  $("[data-assignment-event]").value = eventId;
  $("[data-assignment-status]").value = "winners";
  $("[data-assignment-search]").value = "";
  clearEventKey();
  if (typeof selectAdminSection === "function") selectAdminSection("assignments");
  const section = $('[data-rewards-subsection="assignments"]');
  section.open = true;
  renderRewardAssignments();
  section.scrollIntoView?.({ behavior: "smooth", block: "start" });
}
function renderRewardAssignments() {
  const query = adminSearchKey($("[data-assignment-search]").value);
  const status = $("[data-assignment-status]").value || "all";
  const eventId = $("[data-assignment-event]").value;
  const eventNames = new Map(rewardAdminState.events.map((e) => [e.id, e.title]));
  const deliveries = rewardAdminState.coupons.filter((coupon) => (coupon.assigned_member_id || coupon.claimed_by)
    && (coupon.status === "assigned" || coupon.status === "claimed"));
  const visible = deliveries.filter((coupon) => (status === "winners" ? coupon.status === "claimed" && coupon.event_id : status === "all" || coupon.status === status)
    && (!eventId || coupon.event_id === eventId)
    && adminSearchKey(`${coupon.assignedNick || ""} ${coupon.winnerNick || ""} ${coupon.label} ${eventNames.get(coupon.event_id) || ""}`).includes(query));
  if (status === "winners") visible.sort((a, b) => (b.claimed_at || 0) - (a.claimed_at || 0));
  $("[data-assignment-count]").textContent = `${visible.length} ${status === "winners" ? "premios de eventos" : "entregas"} | ${visible.filter((coupon) => coupon.status === "assigned").length} pendientes | ${visible.filter((coupon) => coupon.status === "claimed").length} reclamadas`;
  const empty = eventId && !deliveries.some((c) => c.event_id === eventId && c.status === "claimed") ? "Aun no hay ganadores registrados en este evento." : "No hay entregas con estos filtros.";
  $("[data-assignment-table]").innerHTML = visible.map((coupon) => `<tr><td>${escapeHtml(coupon.winnerNick || coupon.assignedNick || rewardAdminState.members.find((member) => member.id === (coupon.claimed_by || coupon.assigned_member_id))?.nick || "Integrante retirado")}</td><td>${typeof ownerCouponImageMarkup === 'function' ? ownerCouponImageMarkup(coupon) : ''}${escapeHtml(coupon.label)}</td><td>${escapeHtml(coupon.event_id ? eventNames.get(coupon.event_id) || "Evento anterior" : "Personal")}</td><td>${coupon.status === "assigned" ? "Asignado - pendiente de reclamar" : "Reclamado"}</td><td><code>${escapeHtml(coupon.code)}</code></td><td>${rewardTime(coupon.claimed_at)}</td><td>${coupon.status === "assigned" && coupon.assigned_member_id && !coupon.event_id ? `<button class="mini-button" type="button" data-unassign-coupon="${escapeHtml(coupon.id)}">Quitar premio</button>` : '<span class="muted">Ya reclamado</span>'}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">${empty}</td></tr>`;
  if (typeof hydrateOwnerCouponImages === 'function') hydrateOwnerCouponImages();
}

function renderEventFields() {
  const select = $("[data-event-item]"), selected = select.value;
  const items = new Map();
  for (const coupon of rewardDeliveryStock()) {
    const k = rewardItemKey(coupon.label);
    if (!items.has(k)) items.set(k, { label: coupon.label, count: 0 });
    items.get(k).count++;
  }
  select.innerHTML = '<option value="">Elige un item disponible</option>' + [...items].sort((a, b) => a[1].label.localeCompare(b[1].label, "es"))
    .map(([k, item]) => `<option value="${escapeHtml(k)}">${escapeHtml(item.label)} (${item.count} disponibles)</option>`).join("");
  select.value = items.has(selected) ? selected : "";
  const scheduled = $("[data-event-mode]").value === "scheduled";
  const startsAt = $("[data-reward-event-form]").querySelector('[name="startsAt"]');
  $("[data-event-start-row]").hidden = !scheduled;
  startsAt.required = scheduled;
  const end = $('[data-event-end]');
  const opening = scheduled && startsAt.value ? Date.parse(`${startsAt.value}-05:00`) : Date.now();
  if (Number.isFinite(opening) && (!end.value || end.value === end.autoValue)) {
    end.value = new Date(opening + 86400000 - 5 * 3600000).toISOString().slice(0, 16); end.autoValue = end.value;
  }
  const item = items.get(select.value), count = Number($("[data-event-quantity]").value);
  $("[data-event-quantity]").max = String(Math.min(50, item?.count || 1));
  const owner = rewardAdminState.members.find((member) => member.id === $("[data-reward-owner]").value);
  $("[data-event-summary]").textContent = item ? `${count || 1} x ${item.label} | Nick: ${owner?.nick || "Elige integrante"} | ${scheduled ? "Apertura programada (Peru)" : "Abre ahora"}` : "Elige un premio disponible para crear el evento.";
}

function clearEventKey() {
  rewardEventKeyRevision++;
  $("[data-event-created]").hidden = true;
  $("[data-event-key-output]").value = "";
  return rewardEventKeyRevision;
}

function showEventKey(result, title, revision) {
  if (revision !== rewardEventKeyRevision || $("[data-dashboard]").hidden) return;
  $("[data-event-key-output]").value = result.key;
  $("[data-event-created-title]").textContent = title;
  $("[data-event-created]").hidden = false;
}

async function assignRewardDelivery(member, coupons, options = {}) {
  if (rewardDeliveryConfirmBusy || rewardAdminBusy) return null;
  rewardDeliveryConfirmBusy = true;
  try {
    let snapshot = null;
    if (typeof OwnerDeliveryPreview !== 'undefined') {
      snapshot = options.preview || OwnerDeliveryPreview.create(member, coupons, options);
      if (!await OwnerDeliveryPreview.confirm(snapshot)) return null;
      OwnerDeliveryPreview.validate(snapshot);
      member = snapshot.member;
      coupons = snapshot.coupons;
    } else if (typeof document.createElement === 'function') throw new Error('No se pudo cargar la vista previa de entrega. Recarga el panel.');
    const items = new Map();
    for (const coupon of coupons) items.set(coupon.label, (items.get(coupon.label) || 0) + 1);
    const description = [...items].map(([label, count]) => `${count} x ${label}`).join(", ");
    if (!snapshot && !confirm(`Asignar ${description} a ${member.nick}?`)) return null;
    options.onAssign?.();
    const result = await rewardAdminAction("assign", { memberId: member.id, couponIds: snapshot ? [...snapshot.couponIds] : coupons.map((coupon) => coupon.id), ...(snapshot ? { strict: true } : {}) });
    if (options.quiet || snapshot && !OwnerDeliveryPreview.isContextCurrent(snapshot)) return result;
    const message = result.assigned ? `${result.assigned} de ${coupons.length} cupones asignados a ${member.nick}: ${description}.${member.loginEnabled ? "" : " Genera su acceso de premios para que pueda reclamarlos."}` : "No se asigno ningun cupon. El inventario cambio; vuelve a elegir el premio.";
    $("[data-delivery-status]").textContent = message;
    rewardStatus(message);
    $("[data-assignment-search]").value = member.nick;
    $("[data-assignment-status]").value = "all";
    $("[data-assignment-event]").value = "";
    renderRewardAssignments();
    return result;
  } finally { rewardDeliveryConfirmBusy = false; }
}

function rewardMemberOptions() {
  const selected = $("[data-reward-member]").value;
  const query = adminSearchKey($("[data-reward-member-search]").value);
  const active = rewardAdminState.members.filter((member) => member.active);
  const options = active.filter((member) => adminSearchKey(member.nick).includes(query) || member.id === selected);
  $("[data-reward-member]").innerHTML = '<option value="">Elige integrante</option>' + options.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nick)}${member.loginEnabled ? "" : " (sin acceso)"}</option>`).join("");
  $("[data-reward-member]").value = selected;
  const accessQuery = adminSearchKey($("[data-access-search]").value);
  $("[data-access-member]").innerHTML = '<option value="">Elige integrante</option>' + active.filter((member) => (typeof matchesRewardAccessFilter !== "function" || matchesRewardAccessFilter(member)) && (member.id === selected || adminSearchKey(member.nick).includes(accessQuery))).map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</option>`).join("");
  $("[data-access-member]").value = selected;
  $("[data-inventory-member]").innerHTML = '<option value="">Elige integrante</option>' + active.map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</option>`).join("");
  $("[data-inventory-member]").value = selected;
  const owner = $("[data-reward-owner]").value;
  $("[data-reward-owner]").innerHTML = active.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</option>`).join("");
  $("[data-reward-owner]").value = owner || active.find((member) => member.nick.toLowerCase() === "urek-mazino")?.id || active[0]?.id || "";
}

function renderRewardAdmin() {
  const counts = rewardAdminState.coupons.reduce((result, coupon) => { const status = coupon.status === "available" && coupon.staff_owner_id ? "staff" : coupon.status; result[status] = (result[status] || 0) + 1; return result; }, {});
  $("[data-rewards-count]").textContent = `Disponibles: ${counts.available || 0} | Cupos de sublideres: ${counts.staff || 0} | Asignados: ${counts.assigned || 0} | Reclamados: ${counts.claimed || 0}`;
  rewardMemberOptions();
  if (typeof renderMemberAccessDirectory === "function") renderMemberAccessDirectory();
  if (typeof renderCouponLabelBatches === "function") renderCouponLabelBatches();
  if (typeof renderBatchImagesManager === "function") renderBatchImagesManager();
  renderRewardDelivery();
  renderAssignmentEvents();
  renderRewardAssignments();
  renderEventFields();
  renderRewardItemFilter();
  const matches = filteredRewardCoupons();
  const pages = Math.max(1, Math.ceil(matches.length / 25));
  rewardCouponPage = Math.min(rewardCouponPage, pages - 1);
  const visible = matches.slice(rewardCouponPage * 25, rewardCouponPage * 25 + 25);
  $("[data-coupon-page]").textContent = `Pagina ${rewardCouponPage + 1} de ${pages}`;
  $("[data-coupon-prev]").disabled = rewardCouponPage === 0;
  $("[data-coupon-next]").disabled = rewardCouponPage >= pages - 1;
  $("[data-coupon-visible-count]").textContent = `Mostrando ${visible.length} de ${rewardAdminState.coupons.length} cupones`;
  $("[data-coupon-select-all]").checked = false;
  $("[data-coupon-table]").innerHTML = visible.map((coupon) => `
    <tr><td><input type="checkbox" aria-label="Seleccionar cupon" data-coupon-id="${escapeHtml(coupon.id)}" ${coupon.status === "claimed" || coupon.status === "archived" || coupon.event_id ? "disabled" : ""} /></td>
    <td><code>${escapeHtml(coupon.code)}</code></td><td>${typeof ownerCouponImageMarkup === 'function' ? ownerCouponImageMarkup(coupon) : ''}<form data-coupon-name-form="${escapeHtml(coupon.id)}"><input name="label" aria-label="Nombre del premio" value="${escapeHtml(coupon.label)}" maxlength="80" required /><button class="mini-button" type="submit">Guardar nombre</button></form></td><td>${rewardStates[coupon.status] || "-"}</td>
    <td>${escapeHtml(coupon.winnerNick || coupon.assignedNick || rewardAdminState.events.find((event) => event.id === coupon.event_id)?.title || (coupon.staff_owner_id ? `Cupo: ${rewardAdminState.members.find((m) => m.id === coupon.staff_owner_id)?.nick || "Sublider"}` : "-"))}</td><td>${rewardTime(coupon.claimed_at)}</td>
    <td><button class="mini-button" type="button" data-admin-copy-coupon="${escapeHtml(coupon.id)}">Copiar</button></td></tr>`).join("") || '<tr><td colspan="7" class="muted">Sin cupones con estos filtros.</td></tr>';
  $("[data-reward-events-table]").innerHTML = rewardAdminState.events.map((event) => {
    const state = event.status === "closed" ? event.close_reason === 'exhausted' ? 'Cerrado: agotado' : event.close_reason === 'expired' ? 'Cerrado: vencido' : "Cerrado" : event.claimed >= event.total ? "Agotado" : event.ends_at && event.ends_at <= Date.now() ? "Terminado" : event.starts_at > Date.now() ? "Programado" : "Activo";
return `<tr><td>${escapeHtml(event.title)}</td><td>${escapeHtml(event.ownerNick)}</td><td>${rewardTime(event.starts_at)}</td><td>${rewardTime(event.ends_at || event.starts_at + 86400000)}</td><td>${event.claimed} / ${event.total}</td><td>${state}</td><td><button class="mini-button" type="button" data-edit-reward-event="${escapeHtml(event.id)}"><img src="/assets/board/pencil.svg" alt="" width="14" height="14" /> Editar nombre</button><button class="mini-button" type="button" data-event-winners="${escapeHtml(event.id)}">Ver ganadores</button>${event.keyRequired ? `<button class="mini-button" type="button" data-view-event-key="${escapeHtml(event.id)}">Ver clave</button>` : ""}${event.status === "active" ? `<button class="mini-button" type="button" data-close-reward-event="${escapeHtml(event.id)}">Cerrar evento</button>` : ""}</td></tr>`;
  }).join("") || '<tr><td colspan="7" class="muted">Sin eventos.</td></tr>';
  const cloud = rewardAdminState.roster;
  $("[data-cloud-sync-status]").textContent = cloud?.configured ? `En linea: ${cloud.enabled ? "activa" : "pausada"} | ${cloud.count} integrantes | Ultima consulta: ${cloud.lastSyncAt ? rewardTime(Date.parse(cloud.lastSyncAt)) : "pendiente"} | Nueva consulta habilitada desde: ${cloud.nextSyncAt ? rewardTime(Date.parse(cloud.nextSyncAt)) : "pausada"}${cloud.lastError ? ` | ${cloud.lastError}` : ""}` : "Sincronizacion en linea pendiente de conexion.";
  if (typeof hydrateOwnerCouponImages === 'function') hydrateOwnerCouponImages();
}

async function refreshAdminPrizes() {
  const revision = rewardAdminRevision;
  try {
    const state = await api("/api/admin/rewards");
    if (revision !== rewardAdminRevision) return;
    rewardAdminState = state;
    renderRewardAdmin();
    if (typeof refreshTracking === "function" && $("[data-rewards-subsection=\"tracking\"]")?.open) await refreshTracking();
    rewardStatus(rewardAdminState.connection.configured ? "Servicio de premios conectado. Entregas en linea." : "Servicio de premios pendiente de conexion.");
  } catch (error) { rewardStatus(error.message); }
}

async function rewardAdminAction(action, body) {
  if (rewardAdminBusy) throw new Error("Espera a que termine la operacion actual.");
  rewardAdminBusy = true;
  const revision = rewardAdminRevision;
  rewardStatus("Procesando...");
  try {
    const result = await api(`/api/admin/rewards/${action}`, { method: "POST", body: JSON.stringify(body || {}) });
    if (revision === rewardAdminRevision && typeof refreshOwnerOverview === "function" && ["assign", "release", "transfer", "import", "archive", "rename", "event", "close-event"].includes(action)) refreshOwnerOverview();
    if (revision === rewardAdminRevision) await refreshAdminPrizes();
    return result;
  } finally { rewardAdminBusy = false; }
}

function selectedRewardCoupons(requiredStatus) {
  const selected = $$("[data-coupon-table] [data-coupon-id]:checked").map((input) => input.dataset.couponId);
  if (!selected.length) throw new Error("Selecciona al menos un cupon.");
  if (selected.some((id) => rewardAdminState.coupons.find((coupon) => coupon.id === id)?.status !== requiredStatus)) throw new Error(`Selecciona solo cupones en estado ${rewardStates[requiredStatus].toLowerCase()}.`);
  return selected;
}

$("[data-rewards-refresh]").addEventListener("click", refreshAdminPrizes);
$("[data-reward-member-search]").addEventListener("input", () => {
  const query = adminSearchKey($("[data-reward-member-search]").value);
  const member = rewardAdminState.members.find((entry) => entry.id === $("[data-reward-member]").value);
  if (member && !adminSearchKey(member.nick).includes(query)) {
    $("[data-reward-member]").value = "";
    clearRewardCredential();
  }
  rewardMemberOptions();
  renderRewardDelivery();
});
$("[data-reward-member]").addEventListener("change", () => {
  clearRewardCredential();
  $("[data-delivery-status]").textContent = "";
  rewardMemberOptions();
  renderRewardDelivery();
});
$("[data-access-search]").addEventListener("input", rewardMemberOptions);
$("[data-inventory-member]").addEventListener("change", () => {
  $("[data-reward-member]").value = $("[data-inventory-member]").value;
  clearRewardCredential(); rewardMemberOptions(); renderRewardDelivery();
});
$("[data-access-member]").addEventListener("change", () => {
  $("[data-reward-member]").value = $("[data-access-member]").value;
  clearRewardCredential();
  rewardMemberOptions();
  renderRewardDelivery();
});
$("[data-reward-member-search]").addEventListener("keydown", (event) => { if (event.key === "Enter") event.preventDefault(); });
$("[data-delivery-item]").addEventListener("change", renderRewardDelivery);
$("[data-delivery-quantity]").addEventListener("input", renderRewardDelivery);
$("[data-assignment-search]").addEventListener("input", renderRewardAssignments);
$("[data-assignment-status]").addEventListener("change", renderRewardAssignments);
$("[data-assignment-refresh]").addEventListener("click", refreshAdminPrizes);
$("[data-assignment-event]").addEventListener("change", () => { if ($("[data-assignment-event]").value) $("[data-assignment-status]").value = "winners"; renderRewardAssignments(); });
$("[data-personal-delivery]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (rewardAdminBusy) return;
  const button = $("[data-delivery-submit]");
  button.disabled = true;
  try {
    if (typeof OwnerDeliveryPreview !== 'undefined') {
      if (!rewardDeliveryPreview) throw new Error('Elige el premio y revisa la vista previa antes de confirmar.');
      await assignRewardDelivery(rewardDeliveryPreview.member, rewardDeliveryPreview.coupons, { preview: rewardDeliveryPreview });
    } else {
      const plan = rewardDeliveryPlan();
      await assignRewardDelivery(plan.member, plan.coupons);
    }
  } catch (error) { $("[data-delivery-status]").textContent = error.message; }
  finally { renderRewardDelivery(); }
});
$("[data-admin-section=\"rewards\"]").addEventListener("toggle", (event) => {
  if (!event.target.open) { clearRewardCredential(); clearEventKey(); }
});
$("[data-coupon-filter]").addEventListener("change", () => { rewardCouponPage = 0; renderRewardAdmin(); });
$("[data-coupon-item-filter]").addEventListener("change", () => { rewardCouponPage = 0; renderRewardAdmin(); });
$("[data-coupon-prev]").addEventListener("click", () => { rewardCouponPage = Math.max(0, rewardCouponPage - 1); renderRewardAdmin(); });
$("[data-coupon-next]").addEventListener("click", () => { rewardCouponPage++; renderRewardAdmin(); });
for (const selector of ["[data-event-item]", "[data-event-mode]", "[data-reward-owner]"]) $(selector).addEventListener("change", renderEventFields);
$("[data-event-quantity]").addEventListener("input", renderEventFields);
$('[data-reward-event-form]').querySelector('[name="startsAt"]').addEventListener('change', renderEventFields);
$("[data-coupon-select-all]").addEventListener("change", (event) => { $$("[data-coupon-table] [data-coupon-id]:not(:disabled)").forEach((input) => { input.checked = event.target.checked; }); });

$("[data-coupon-import]").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await rewardAdminAction("import", { codes: event.target.codes.value, label: event.target.label.value, batchName: event.target.batchName?.value || "" });
    event.target.codes.value = "";
    rewardStatus(`${result.imported} cupones cargados. ${result.duplicates} duplicados omitidos.`);
  } catch (error) { rewardStatus(error.message); }
});

$("[data-coupon-table]").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-coupon-name-form]");
  if (!form) return;
  event.preventDefault();
  if (rewardAdminBusy) return;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const label = form.elements.namedItem("label").value.trim();
    if (!label) throw new Error("Escribe el nombre del premio.");
    await rewardAdminAction("rename", { couponId: form.dataset.couponNameForm, label });
    rewardStatus("Nombre del premio guardado. El jugador tambien vera este nombre.");
  } catch (error) { rewardStatus(error.message); }
  finally { button.disabled = false; }
});

$("[data-reward-event-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (rewardAdminBusy) return;
  const revision = rewardAdminRevision, button = $("[data-event-submit]");
  button.disabled = true;
  const keyRevision = clearEventKey();
  $("[data-event-status]").textContent = "Creando evento...";
  try {
    const itemKey = $("[data-event-item]").value, quantity = Number($("[data-event-quantity]").value);
    if (!itemKey || !Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(50, rewardDeliveryStock(itemKey).length)) throw new Error("Elige un premio disponible y una cantidad valida de ganadores.");
    let startsAt = Date.now();
    if ($("[data-event-mode]").value === "scheduled") {
      const value = form.elements.namedItem("startsAt").value;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("Elige la fecha y hora de apertura en Peru.");
      startsAt = Date.parse(`${value.length === 16 ? `${value}:00` : value}-05:00`);
      if (!Number.isFinite(startsAt) || startsAt <= Date.now()) throw new Error("La apertura programada debe estar en el futuro (hora de Peru).");
    }
    const title = form.elements.namedItem("title").value.trim(), ownerId = form.elements.namedItem("ownerId").value;
    if (!title || !ownerId) throw new Error("Escribe el nombre del evento y elige el nick donde aparecera.");
    const value = $('[data-event-end]').value;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('Elige la fecha y hora de termino en Peru.');
    const endsAt = Date.parse(`${value.length === 16 ? `${value}:00` : value}-05:00`);
    if (!Number.isFinite(endsAt) || endsAt <= Math.max(startsAt, Date.now())) throw new Error('El termino debe ser posterior a la apertura y a la hora actual.');
    const result = await rewardAdminAction("event", {
      title, ownerId, startsAt, endsAt, itemKey, quantity,
    });
    if (revision !== rewardAdminRevision) return;
    showEventKey(result, title, keyRevision);
    const message = `Evento ${title} creado: ${result.prizes} premios. ${startsAt > Date.now() ? `Abre ${rewardTime(startsAt)} (Peru).` : "Ya esta activo."} Termina ${rewardTime(endsAt)} (Peru), o al agotarse. Comparte la clave del evento con los jugadores.`;
    $("[data-event-status]").textContent = message;
    rewardStatus(message);
  } catch (error) { $("[data-event-status]").textContent = error.message; }
  finally { button.disabled = false; }
});
$("[data-event-copy-key]").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("[data-event-key-output]").value); $("[data-event-status]").textContent = "Clave del evento copiada."; }
  catch { $("[data-event-status]").textContent = "Selecciona la clave para copiarla manualmente."; }
});
$("[data-rewards-subsection=\"events\"]").addEventListener("toggle", (event) => {
  if (!event.target.open) clearEventKey();
});
$("[data-rewards-subsection=\"access\"]").addEventListener("toggle", (event) => { if (!event.target.open) clearRewardCredential(); });

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reward-password],[data-reward-view-password],[data-reward-disable],[data-reward-sync],[data-coupon-assign],[data-coupon-release],[data-unassign-coupon],[data-coupon-archive],[data-admin-copy-coupon],[data-close-reward-event],[data-view-event-key],[data-reward-copy-secret],[data-reward-clear-secret],[data-event-winners]");
  if (!button || rewardAdminBusy) return;
  button.disabled = true;
  try {
    const memberId = $("[data-reward-member]").value;
    if (button.hasAttribute("data-event-winners")) {
      viewEventWinners(button.dataset.eventWinners);
      await refreshAdminPrizes();
    } else if (button.hasAttribute("data-reward-password")) {
      if (!memberId) throw new Error("Elige un integrante.");
      const member = rewardAdminState.members.find((item) => item.id === memberId);
      if (member.hasPassword && !confirm(`Generar una nueva contrasena para ${member.nick}? La anterior dejara de funcionar.`)) return;
      const revision = clearRewardCredential();
      const result = await rewardAdminAction("password", { memberId });
      showRewardCredential(result, memberId, revision);
      rewardStatus("Acceso generado. Entregalo por privado; puedes volver a consultarlo con Ver contrasena.");
    } else if (button.hasAttribute("data-reward-view-password")) {
      if (!memberId) throw new Error("Elige un integrante.");
      const revision = clearRewardCredential();
      const result = await rewardAdminAction("reveal-password", { memberId });
      showRewardCredential(result, memberId, revision);
      rewardStatus("Acceso consultado. Solo visible en tu administrador.");
    } else if (button.hasAttribute("data-reward-clear-secret")) {
      clearRewardCredential();
    } else if (button.hasAttribute("data-reward-copy-secret")) {
      await navigator.clipboard.writeText(`Nick: ${$("[data-reward-secret-nick]").value}\nClave de premios: ${$("[data-reward-secret]").value}`); rewardStatus("Acceso copiado.");
    } else if (button.hasAttribute("data-admin-copy-coupon")) {
      await navigator.clipboard.writeText(rewardAdminState.coupons.find((coupon) => coupon.id === button.dataset.adminCopyCoupon).code); rewardStatus("Cupon copiado.");
    } else if (button.hasAttribute("data-view-event-key")) {
      const revision = rewardAdminRevision;
      const keyRevision = clearEventKey();
      const result = await rewardAdminAction("event-key", { eventId: button.dataset.viewEventKey });
      if (revision === rewardAdminRevision) showEventKey(result, rewardAdminState.events.find((entry) => entry.id === result.id)?.title || "Clave del evento", keyRevision);
    } else if (button.hasAttribute("data-close-reward-event")) {
      if (!confirm("Cerrar el evento y liberar los cupones sin reclamar?")) return;
      await rewardAdminAction("close-event", { eventId: button.dataset.closeRewardEvent }); rewardStatus("Evento cerrado. Los cupones no reclamados vuelven a estar disponibles.");
    } else if (button.hasAttribute("data-reward-sync")) {
      const result = await rewardAdminAction("members"); rewardStatus(`${result.count} integrantes actualizados en el servicio.`);
    } else if (button.hasAttribute("data-reward-disable")) {
      if (!memberId) throw new Error("Elige un integrante.");
      clearRewardCredential();
      await rewardAdminAction("disable", { memberId }); rewardStatus("Acceso a premios pausado.");
    } else if (button.hasAttribute("data-coupon-assign")) {
      const member = rewardAdminState.members.find((entry) => entry.active && entry.id === memberId);
      if (!member) throw new Error("Elige quien recibira el cupon en Entregar a.");
      const selected = new Set(selectedRewardCoupons("available"));
      await assignRewardDelivery(member, rewardAdminState.coupons.filter((coupon) => selected.has(coupon.id)), {
        source: 'inventory', valid: () => $("[data-reward-member]").value === member.id && (() => {
          const current = $$("[data-coupon-table] [data-coupon-id]:checked").map(input => input.dataset.couponId);
          return current.length === selected.size && current.every(id => selected.has(id));
        })(),
      });
    } else if (button.hasAttribute("data-unassign-coupon")) {
      const coupon = rewardAdminState.coupons.find((entry) => entry.id === button.dataset.unassignCoupon);
      if (!coupon || coupon.status !== "assigned" || !coupon.assigned_member_id || coupon.event_id) throw new Error("Solo puedes quitar un premio personal pendiente de reclamar.");
      const recipient = coupon.assignedNick || rewardAdminState.members.find((member) => member.id === coupon.assigned_member_id)?.nick || "este integrante";
      if (!confirm(`Quitar ${coupon.label} a ${recipient}? El cupon volvera al inventario para asignarlo a otra persona.`)) return;
      const result = await rewardAdminAction("release", { couponIds: [coupon.id] });
      if (result.changed !== 1) throw new Error("No se retiro el premio: pudo haber sido reclamado o cambiado. Revisa el estado actualizado.");
      clearRewardCredential();
      $("[data-reward-member]").value = "";
      $("[data-reward-member-search]").value = "";
      rewardMemberOptions();
      $("[data-delivery-item]").value = rewardItemKey(coupon.label);
      renderRewardDelivery();
      const message = `Se quito ${coupon.label} a ${recipient}. El cupon esta disponible para asignarlo de nuevo.`;
      $("[data-assignment-feedback]").textContent = message;
      $("[data-delivery-status]").textContent = message;
      rewardStatus(message);
    } else if (button.hasAttribute("data-coupon-release")) {
      await rewardAdminAction("release", { couponIds: selectedRewardCoupons("assigned") }); rewardStatus("Asignacion retirada de los cupones pendientes.");
    } else if (button.hasAttribute("data-coupon-archive")) {
      await rewardAdminAction("archive", { couponIds: selectedRewardCoupons("available") }); rewardStatus("Cupones archivados.");
    }
  } catch (error) {
    rewardStatus(error.message);
    if (button.hasAttribute("data-unassign-coupon")) $("[data-assignment-feedback]").textContent = error.message;
  }
  finally { button.disabled = false; }
});
$("[data-logout]").addEventListener("click", () => {
  rewardDeliveryPreview = null;
  if (typeof OwnerDeliveryPreview !== 'undefined') OwnerDeliveryPreview.cancel();
  rewardAdminRevision++;
  rewardAdminState = { members: [], coupons: [], events: [] };
  clearRewardCredential();
  $("[data-coupon-table]").innerHTML = ""; $("[data-reward-events-table]").innerHTML = "";
  $("[data-coupon-item-filter]").innerHTML = '<option value="">Todos los items</option>';
  $("[data-coupon-item-filter]").value = "";
  $("[data-coupon-visible-count]").textContent = "";
  $("[data-assignment-table]").innerHTML = "";
  $("[data-assignment-count]").textContent = "";
  $("[data-assignment-feedback]").textContent = "";
  $("[data-assignment-event]").innerHTML = '<option value="">Todos los eventos y entregas</option>';
  $("[data-assignment-event]").value = ""; $("[data-assignment-status]").value = "all"; $("[data-assignment-search]").value = "";
  $("[data-delivery-status]").textContent = "";
  $("[data-delivery-item]").innerHTML = '<option value="">Elige un item disponible</option>';
  $("[data-delivery-item]").value = "";
  clearEventKey();
  $("[data-event-status]").textContent = "";
});
if (!$("[data-dashboard]").hidden) refreshAdminPrizes();
