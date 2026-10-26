let staffState = { accounts: [], members: [], available: [] };
let staffAuditOffset = 0;
let staffBusy = false;
let staffRevision = 0;
const staffPermissions = ["can_assign", "can_events", "can_release", "can_close", "can_donations", "can_donation_goals", "can_access"];
const staffActionNames = { account_saved: "Permisos guardados", account_removed: "Acceso de sublider eliminado", password_reset: "Acceso generado", password_viewed: "Acceso consultado", pool_added: "Cupo aumentado", pool_returned: "Cupo devuelto", login: "Ingreso", login_denied: "Ingreso rechazado", logout: "Salida", assign: "Premio asignado", event: "Evento creado", release: "Entrega retirada", close_event: "Evento cerrado", event_key_viewed: "Clave de evento consultada", denied: "Operacion rechazada" };
const staffTime = (value) => new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
Object.assign(staffActionNames,{access_approved:'Identidad aprobada en el juego',access_rejected:'Solicitud de acceso rechazada',access_created:'Clave privada creada por el integrante',member_password_changed:'Integrante cambio su propia clave'});
Object.assign(staffActionNames,{recovery_approved:'Recuperacion verificada y aprobada',recovery_rejected:'Recuperacion rechazada',access_recovered:'Integrante recupero su acceso'});
const staffDetailNames = { nick: "Integrante", enabled: "Acceso activo", daily: "Limite diario", weekly: "Limite semanal", permissions: "Permisos", item: "Premio", recipient: "Destinatario", event: "Evento", startsAt: "Apertura", operation: "Operacion", reason: "Motivo" };
Object.assign(staffDetailNames,{requestId:'Solicitud',verifiedInGame:'Verificacion en el juego'});
staffDetailNames.purpose = 'Tipo de solicitud';
staffActionNames.bulk_cancel = "Reparto retirado";
staffActionNames.transfer = "Premio pasado a otro integrante";
staffActionNames.donation_import = "Totales de donaciones cargados";
staffActionNames.donation_goal_created = "Meta de donaciones creada";
staffActionNames.donation_goal_deleted = "Meta de donaciones eliminada";
staffActionNames.donation_hourly_sync = "Consulta automatica de donaciones R2Beat";
staffActionNames.donation_auto_settings = "Actualizacion automatica de donaciones configurada";
staffActionNames.coupon_batch_renamed = 'Nombres de premios cambiados por lote';
staffActionNames.donation_newcomer_bases = 'Inicio en cero aplicado a nuevos ingresos';
Object.assign(staffDetailNames,{nombresAnteriores:'Nombres anteriores',nombreNuevo:'Nombre nuevo',lote:'Lote',integrantes:'Integrantes',base:'Base inicial',regla:'Regla aplicada'});
Object.assign(staffDetailNames, { review: 'Por revisar', baselines: 'Bases iniciales observadas', baselineIds: 'Integrantes autorizados para base', intervalMinutes: 'Intervalo en minutos' });
staffActionNames['ranking-exclusion'] = 'Exclusion de tops actualizada';
staffActionNames.event_auto_closed = 'Evento cerrado automaticamente';
staffActionNames.event_edited = 'Evento editado';
staffActionNames.circle_level_saved = 'Requisito de EXP del circulo actualizado';
Object.assign(staffDetailNames, { nivel: 'Nivel', expAnterior: 'EXP anterior', expNueva: 'EXP nueva' });
Object.assign(staffDetailNames, { nombreAnterior: 'Nombre anterior', nombreNuevo: 'Nombre nuevo', terminoAnterior: 'Termino anterior (Peru)', terminoNuevo: 'Termino nuevo (Peru)', estado: 'Estado' });
Object.assign(staffDetailNames, { donors: 'Excluir de donadores', globalTop: 'Excluir del top global' });
staffActionNames.donation_member_confirmed = "Identidad de donaciones confirmada";
Object.assign(staffDetailNames, { previousNick: "Nick anterior", previousId: "Registro anterior", note: "Verificacion" });
Object.assign(staffDetailNames, { title: "Meta", start: "Inicio", end: "Final", target: "Objetivo por integrante", creator: "Creada por" });
Object.assign(staffDetailNames, { date: "Fecha de revision", readings: "Integrantes registrados", importId: "Carga" });
staffDetailNames.previousRecipient = "Destinatario anterior";
Object.assign(staffDetailNames, { distribution: "Reparto", batch: "Lote", recipients: "Destinatarios", criteria: "Criterios" });
function staffDetail(details) {
  const permissionNames = { can_assign: "Asignar", can_events: "Crear eventos", can_release: "Quitar entregas", can_close: "Cerrar eventos", can_donations: "Cargar donaciones", can_donation_goals: "Crear metas de donaciones", can_access: "Aprobar accesos verificados en el juego" };
  return Object.entries(details).map(([name, value]) => {
    const formatted = name === "permissions" ? Object.entries(value).map(([p, on]) => `${permissionNames[p] || p}: ${on ? "Si" : "No"}`).join(", ") : name === "filters" ? `Ingreso ${value.from || "sin inicio"} a ${value.to || "sin fin"}, minimo ${value.minDays} dias` : name === "startsAt" ? staffTime(value) : typeof value === "boolean" ? value ? "Si" : "No" : value;
    return `${staffDetailNames[name] || name}: ${formatted}`;
  }).join(" | ");
}
const staffStatus = (message) => { $("[data-staff-status]").textContent = message; };
const staffApi = (action, body = {}) => api(`/api/admin/rewards/staff-${action}`, { method: "POST", body: JSON.stringify(body) });
function clearStaffSecret() {
  staffRevision++;
  $("[data-staff-secret]").value = "";
  $("[data-staff-secret-nick]").value = "";
  $("[data-staff-credential]").hidden = true;
  return staffRevision;
}
function fillStaffEditor() {
  clearStaffSecret();
  const form = $("[data-staff-account-form]"), id = $("[data-staff-member]").value;
  const account = staffState.accounts.find((entry) => entry.member_id === id);
  for (const name of [...staffPermissions, "enabled"]) form.elements.namedItem(name).checked = account ? Boolean(account[name]) : !["can_release", "can_close", "can_donations", "can_donation_goals", "can_access"].includes(name);
  form.elements.namedItem("dailyLimit").value = account?.daily_limit ?? 5;
  form.elements.namedItem("weeklyLimit").value = account?.weekly_limit ?? 20;
}
function staffMemberChoices() {
  const select = $("[data-staff-member]"), selected = select.value, query = adminSearchKey($("[data-staff-search]").value);
  select.innerHTML = '<option value="">Elige integrante</option>' + staffState.members.filter((m) => m.id === selected || adminSearchKey(m.nick).includes(query)).map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("");
  select.value = selected;
}
function renderStaffPool() {
  const form = $("[data-staff-pool-form]"), select = $("[data-staff-pool-item]"), selected = select.value;
  const account = staffState.accounts.find((a) => a.member_id === form.elements.namedItem("memberId").value);
  const stock = form.elements.namedItem("mode").value === "return" ? account?.stock || [] : staffState.available;
  select.innerHTML = '<option value="">Elige premio</option>' + stock.map((s) => `<option value="${escapeHtml(s.itemKey)}">${escapeHtml(s.label)} (${s.available} libres)</option>`).join("");
  select.value = stock.some((s) => s.itemKey === selected) ? selected : "";
}
function renderStaff() {
  staffMemberChoices();
  if(typeof adminCircleId==='string'&&adminCircleId!=='main')$("[data-staff-account-form]").hidden=true;
  const choices = staffState.accounts.map((a) => `<option value="${escapeHtml(a.member_id)}">${escapeHtml(a.nick)}</option>`).join("");
  for (const selector of ["[data-staff-pool-member]", "[data-staff-audit-member]"]) {
    const select = $(selector), selected = select.value;
    const history = selector.includes("audit") ? (staffState.historyMembers || staffState.accounts.map((a) => ({ id: a.member_id, nick: a.nick }))).map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("") : choices;
    select.innerHTML = `<option value="">${selector.includes("audit") ? "Todos" : "Elige sublider"}</option>` + history;
    select.value = selected;
  }
  $("[data-staff-accounts]").innerHTML = staffState.accounts.map((a) => `<tr><td>${escapeHtml(a.nick)}</td><td>${!a.active ? "Retirado del circulo" : !a.enabled ? "Pausado" : !a.hasPassword ? "Falta generar acceso" : "Activo"}</td><td>${a.usage.daily} / ${a.daily_limit}</td><td>${a.usage.weekly} / ${a.weekly_limit}</td><td>${a.stock.map((s) => `${escapeHtml(s.label)}: ${s.available}`).join("<br>") || "Sin cupones libres"}</td><td>${a.delegated ? `<button class="mini-button" type="button" data-admin-open="spaces">Editar delegacion</button>` : `<button class="mini-button" type="button" data-staff-edit="${escapeHtml(a.member_id)}" ${!a.active ? "disabled" : ""}>Editar</button><button class="mini-button" type="button" data-staff-remove="${escapeHtml(a.member_id)}">Eliminar acceso</button>`}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Aun no has elegido sublideres.</td></tr>';
  const link = $("[data-staff-panel-link]"); link.href = staffState.panelUrl; link.hidden = !staffState.panelUrl;
  renderStaffPool();
}
async function refreshStaffAudit() {
  const revision = staffRevision;
  const result = await staffApi("audit", { memberId: $("[data-staff-audit-member]").value, offset: staffAuditOffset });
  if (revision !== staffRevision || $("[data-dashboard]").hidden) return;
  $("[data-staff-audit]").innerHTML = result.entries.map((row) => `<tr><td>${staffTime(row.created_at)}</td><td>${escapeHtml(row.actor_nick)}</td><td>${escapeHtml(staffActionNames[row.action] || row.action)}</td><td>${escapeHtml(staffDetail(row.details))}</td><td>${row.quantity || "-"}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Sin actividad.</td></tr>';
  $("[data-staff-audit-page]").textContent = `Pagina ${Math.floor(staffAuditOffset / 25) + 1} | ${result.total} registros`;
  $("[data-staff-audit-prev]").disabled = staffAuditOffset === 0;
  $("[data-staff-audit-next]").disabled = staffAuditOffset + 25 >= result.total;
}
async function refreshStaff() {
  const revision = staffRevision;
  const result = await staffApi("state");
  if (revision !== staffRevision || $("[data-dashboard]").hidden) return;
  staffState = result; renderStaff();
  if (typeof renderTransferActors === "function") renderTransferActors();
  await refreshStaffAudit();
  if ($('[data-staff-group="transfers"]').open && typeof refreshTransfers === "function") await refreshTransfers();
}
async function staffRun(task) {
  if (staffBusy) return;
  staffBusy = true;
  $("[data-admin-section=\"staff\"]").setAttribute("aria-busy", "true");
  try { await task(); }
  catch (error) { staffStatus(error.message); }
  finally { staffBusy = false; $("[data-admin-section=\"staff\"]").setAttribute("aria-busy", "false"); }
}
$("[data-admin-section=\"staff\"]").addEventListener("toggle", (event) => {
  if (!event.target.open) clearStaffSecret();
  else if (!$("[data-dashboard]").hidden) staffRun(async () => { await refreshStaff(); staffStatus("Permisos y cupos actualizados."); });
});
$("[data-staff-group=\"accounts\"]").addEventListener("toggle", (event) => { if (!event.target.open) clearStaffSecret(); });
$("[data-staff-refresh]").addEventListener("click", () => staffRun(refreshStaff));
$("[data-staff-member]").addEventListener("change", fillStaffEditor);
$("[data-staff-search]").addEventListener("input", staffMemberChoices);
for (const selector of ["[data-staff-pool-member]", "[data-staff-pool-mode]"]) $(selector).addEventListener("change", renderStaffPool);
$("[data-staff-account-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  staffRun(async () => {
    clearStaffSecret();
    const fields = event.target.elements, memberId = fields.namedItem("memberId").value;
    if (!memberId) throw new Error("Elige un integrante.");
    await staffApi("save", { memberId, enabled: fields.namedItem("enabled").checked, dailyLimit: Number(fields.namedItem("dailyLimit").value), weeklyLimit: Number(fields.namedItem("weeklyLimit").value), ...Object.fromEntries(staffPermissions.map((p) => [p, fields.namedItem(p).checked])) });
    await refreshStaff(); staffStatus("Permisos guardados. Sus sesiones anteriores se cerraron; puede volver a ingresar si su acceso sigue activo.");
  });
});
$("[data-staff-pool-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  staffRun(async () => {
    const fields = event.target.elements;
    const result = await staffApi("pool", Object.fromEntries(["memberId", "mode", "itemKey", "quantity"].map((p) => [p, fields.namedItem(p).value])));
    await refreshStaff();
    if (typeof refreshAdminPrizes === "function") await refreshAdminPrizes();
    staffStatus(`${result.changed} cupones movidos. El cupo queda registrado en el historial.`);
  });
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-staff-edit],[data-staff-password],[data-staff-reveal],[data-staff-remove]");
  if (!button) return;
  staffRun(async () => {
    if (button.hasAttribute("data-staff-remove")) {
      const memberId = button.dataset.staffRemove;
      const account = staffState.accounts.find((a) => a.member_id === memberId);
      if (!account || !confirm(`Eliminar el acceso de sublider de ${account.nick}? Se cerraran sus sesiones y eventos abiertos; los cupones no reclamados de esos eventos y su cupo libre volveran al inventario. Sus entregas personales, premios reclamados, historial y el integrante se conservan.`)) return;
      clearStaffSecret();
      await staffApi("remove", { memberId });
      await refreshStaff();
      if (typeof refreshAdminPrizes === "function") await refreshAdminPrizes();
      staffStatus("Acceso de sublider eliminado. Se conservo el integrante y su historial.");
      return;
    }
    if (button.hasAttribute("data-staff-edit")) {
      $("[data-staff-member]").value = button.dataset.staffEdit;
      if (typeof selectAdminSection === "function") selectAdminSection("staff");
      $("[data-staff-group=\"accounts\"]").open = true;
      fillStaffEditor(); return;
    }
    const memberId = $("[data-staff-member]").value;
    if (!memberId) throw new Error("Elige un sublider y guarda primero sus permisos.");
    if (button.hasAttribute("data-staff-password") && !confirm("Generar una clave nueva para el panel del sublider? La anterior dejara de funcionar.")) return;
    const revision = clearStaffSecret();
    const result = await staffApi(button.hasAttribute("data-staff-password") ? "password" : "reveal", { memberId });
    await refreshStaff();
    if (revision !== staffRevision || $("[data-dashboard]").hidden) return;
    $("[data-staff-secret-nick]").value = result.nick; $("[data-staff-secret]").value = result.password;
    $("[data-staff-credential]").hidden = false;
    staffStatus("Acceso exclusivo del panel de sublideres. Entregalo por privado; no es la clave de premios del juego.");
  });
});
$("[data-staff-hide]").addEventListener("click", clearStaffSecret);
$("[data-staff-copy]").addEventListener("click", () => staffRun(async () => {
  await navigator.clipboard.writeText(`${staffState.panelUrl}\nNick: ${$("[data-staff-secret-nick]").value}\nClave del panel: ${$("[data-staff-secret]").value}`); staffStatus("Acceso copiado.");
}));
$("[data-staff-audit-member]").addEventListener("change", () => staffRun(async () => { staffAuditOffset = 0; await refreshStaffAudit(); }));
$("[data-staff-audit-prev]").addEventListener("click", () => staffRun(async () => { staffAuditOffset = Math.max(0, staffAuditOffset - 25); await refreshStaffAudit(); }));
$("[data-staff-audit-next]").addEventListener("click", () => staffRun(async () => { staffAuditOffset += 25; await refreshStaffAudit(); }));
$("[data-logout]").addEventListener("click", () => {
  clearStaffSecret(); staffState = { accounts: [], members: [], available: [] }; staffAuditOffset = 0;
  for (const selector of ["[data-staff-accounts]", "[data-staff-audit]"]) $(selector).innerHTML = "";
  $("[data-staff-panel-link]").hidden = true;
});
