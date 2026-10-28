let trackingOffset = 0;
let trackingRevision = 0;
let trackingBusy = false;
let trackingQueued = false;
let trackingDialogRevision = 0;
let trackingTimer;
let trackingHistory = null;
let trackingDirectory = [];
function renderTrackingSuggestions() {
  const container=$('[data-tracking-suggestions]'); if(!container)return;
  const query=$('[data-tracking-search]').value.normalize('NFKC').trim().toLowerCase();
  const selected=$('[data-tracking-member-filter]').value;
  container.innerHTML=!query||selected?'':(trackingDirectory.filter(m=>m.nick.normalize('NFKC').toLowerCase().includes(query)).slice(0,12).map(m=>`<button type="button" class="mini-button" data-pick-tracking-member="${escapeHtml(m.id)}">${escapeHtml(m.nick)}${m.active?'':' · Retirado'}</button>`).join('') || '<span>Sin coincidencias de nick.</span>');
}
const trackingContext = () => `${typeof rewardAdminRevision === 'number' ? rewardAdminRevision : 0}:${typeof adminCircleId === 'string' ? adminCircleId : 'main'}`;
function trackingHtml(selector, html) { const node = $(selector); if (node && node.innerHTML !== html) node.innerHTML = html; }
function trackingMemberOptions(members) {
  trackingDirectory = members;
  const select = $('[data-tracking-member-filter]'); if (!select) return;
  const selected = select.value, directory = new Map(members.map(member => [member.id, member]));
  if (selected && !directory.has(selected)) directory.set(selected, { id: selected, nick: 'Registro seleccionado' });
  const html = '<option value="">Todos los integrantes</option>' + [...directory.values()].sort((a,b) => a.nick.localeCompare(b.nick, 'es') || a.id.localeCompare(b.id)).map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nick)}${member.active ? '' : ' (registro anterior)'}</option>`).join('');
  if (select.innerHTML !== html && document.activeElement !== select) select.innerHTML = html;
  select.value = selected;
  renderTrackingSuggestions();
}
function openMemberTracking(memberId) {
  const select = $('[data-tracking-member-filter]');
  if (!select) return;
  // Keep the exact ID even when the reward directory no longer lists this record.
  if (!select.querySelector?.(`option[value="${String(memberId).replace(/[^a-zA-Z0-9_-]/g, '')}"]`)) select.innerHTML += `<option value="${escapeHtml(memberId)}">Integrante seleccionado</option>`;
  select.value = memberId;
  $('[data-tracking-membership]').value = 'recipients'; $('[data-tracking-state]').value = 'all'; $('[data-tracking-search]').value = '';
  trackingOffset = 0; trackingRevision++;
  if (typeof selectAdminSection === 'function') selectAdminSection('tracking');
  const section = $('[data-rewards-subsection="tracking"]'); section.open = true;
  return refreshTracking();
}
const trackingNames = { inside: "Dentro", outside: "Fuera del circulo", renamed: "Cambio confirmado", historical: "Solo historial", unlinked: "Sin destinatario" };
const trackingActions = { imported: "Cupon cargado", assigned: "Asignado", unassigned: "Asignacion retirada", claimed: "Reclamado", saved: "Jugador confirmo que lo guardo", event_reserved: "Reservado para evento", event_released: "Liberado del evento", label_changed: "Nombre del premio cambiado", archived: "Archivado", pool_reserved: "Reservado para sublider", pool_returned: "Cupo devuelto", joined: "Primera aparicion registrada", left: "Salida detectada", returned: "Reaparicion del registro", nick_changed: "Nick del registro actualizado", alias_confirmed: "Cambio de nick confirmado por administrador", alias_removed: "Relacion de nicks retirada", baseline_inside: "Dentro segun registro anterior", baseline_outside: "Fuera segun registro anterior", baseline_assigned: "Asignacion anterior observada", baseline_claimed: "Reclamacion anterior observada", baseline_available: "Disponible al iniciar seguimiento", baseline_archived: "Archivado al iniciar seguimiento" };
Object.assign(trackingActions, { transferred_out: "Premio pasado a otro integrante", transferred_in: "Premio recibido por correccion" });
const trackingTime = (n) => n ? new Date(n).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "Sin registro anterior";
const trackingApi = (action, body = {}) => api(`/api/admin/rewards/${action}`, { method: "POST", body: JSON.stringify(body) });
const trackingStatus = (value) => { $("[data-tracking-status]").textContent = value; };
let rosterTrackingOffset = 0, rosterTrackingRevision = 0;
let rosterTrackingBusy = false, rosterTrackingQueued = false, rosterTrackingTimer;
async function refreshRosterTracking(options = {}) {
  if ($("[data-dashboard]").hidden) return;
  if (rosterTrackingBusy) { rosterTrackingQueued = true; return; }
  rosterTrackingBusy = true;
  const revision = rosterTrackingRevision, session = trackingContext();
  try {
    const result = await trackingApi("tracking-members", { view: $("[data-roster-tracking-view]").value || "outside", query: $("[data-roster-tracking-search]").value, offset: rosterTrackingOffset });
    if (revision !== rosterTrackingRevision || session !== trackingContext() || $("[data-dashboard]").hidden) return;
    rosterTrackingOffset = result.offset;
    $("[data-roster-tracking-count]").textContent = `Dentro del circulo: ${result.counts.inside} | Fuera: ${result.counts.outside} | Cambios de nick confirmados: ${result.counts.renamed} | ${result.total} resultados`;
    $("[data-roster-tracking-sync]").textContent = `Ultima consulta correcta: ${trackingTime(result.lastSyncAt)} | En esa consulta: ${result.counts.latestLeft} salidas y ${result.counts.latestJoined} entradas${result.lastError ? ` | ${result.lastError}` : ""}`;
    $("[data-roster-tracking-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1}`;
    $("[data-roster-tracking-prev]").disabled = result.offset === 0;
    $("[data-roster-tracking-next]").disabled = result.offset + 25 >= result.total;
    const changes = { joined: "Nuevo registro", returned: "Reaparicion", left: "Salida detectada", nick_changed: "Nick actualizado" };
    const html = result.entries.map(m => `<tr><td><button class="member-profile-link" type="button" data-member-profile="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</button></td><td>${escapeHtml(trackingNames[m.membership] || m.membership)}${m.latestChange ? `<br><span class="muted">${escapeHtml(changes[m.latestChange] || m.latestChange)}</span>` : ""}</td><td>${escapeHtml(m.currentNick || "-")}</td><td>${trackingTime(m.last_seen_at)}</td><td>${trackingTime(m.left_at)}</td><td>${m.pending}</td><td>${m.claimed}</td><td><button class="mini-button" type="button" data-tracking-member="${escapeHtml(m.id)}">Ver historial</button><button class="mini-button" type="button" data-open-member-tracking="${escapeHtml(m.id)}">Ver premios y traspasos</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted">Sin integrantes con estos filtros.</td></tr>';
    if (options.background && $('[data-roster-tracking-table]').innerHTML && $('[data-roster-tracking-table]').innerHTML !== html) {
      $('[data-roster-tracking-status]').textContent = 'Hay novedades. Pulsa Actualizar seguimiento para verlas sin perder tu lectura.'; return;
    }
    trackingHtml('[data-roster-tracking-table]', html);
    $("[data-roster-tracking-status]").textContent = "";
  } catch (error) {
    if (revision === rosterTrackingRevision) $("[data-roster-tracking-status]").textContent = error.message;
  } finally {
    rosterTrackingBusy = false;
    if (rosterTrackingQueued) { rosterTrackingQueued = false; refreshRosterTracking(); }
  }
}
$("[data-rewards-subsection=\"roster-tracking\"]").addEventListener("toggle", event => { if (event.target.open) refreshRosterTracking(); });
$("[data-roster-tracking-refresh]").addEventListener("click", refreshRosterTracking);
$("[data-roster-tracking-open]").addEventListener("click", () => {
  if (typeof selectAdminSection === "function") selectAdminSection("departures");
  const section = $("[data-rewards-subsection=\"roster-tracking\"]"); section.open = true;
  section.scrollIntoView?.({ behavior: "smooth", block: "start" }); refreshRosterTracking();
});
$("[data-roster-tracking-view]").addEventListener("change", () => { rosterTrackingOffset = 0; rosterTrackingRevision++; refreshRosterTracking(); });
$("[data-roster-tracking-search]").addEventListener("input", () => {
  clearTimeout(rosterTrackingTimer); rosterTrackingOffset = 0; rosterTrackingRevision++;
  rosterTrackingTimer = setTimeout(refreshRosterTracking, 250);
});
for (const [selector, delta] of [["[data-roster-tracking-prev]", -25], ["[data-roster-tracking-next]", 25]]) $(selector).addEventListener("click", () => { rosterTrackingOffset = Math.max(0, rosterTrackingOffset + delta); rosterTrackingRevision++; refreshRosterTracking(); });
if (typeof setInterval === "function") setInterval(() => {
  if (!document.hidden && !$("[data-dashboard]").hidden && $("[data-rewards-subsection=\"roster-tracking\"]").open && !rosterTrackingBusy) refreshRosterTracking({ background: true });
}, 60000);
async function refreshTracking() {
  if ($("[data-dashboard]").hidden) return;
  if (trackingBusy) { trackingQueued = true; return; }
  trackingBusy = true;
  const revision = trackingRevision, session = trackingContext();
  try {
    const memberId = $('[data-tracking-member-filter]')?.value || '';
    const result = await trackingApi("tracking", { query: memberId ? '' : $("[data-tracking-search]").value, membership: $("[data-tracking-membership]").value || "recipients", status: $("[data-tracking-state]").value || "all", ...(memberId ? { memberId } : {}), offset: trackingOffset });
    if (revision !== trackingRevision || session !== trackingContext() || $("[data-dashboard]").hidden) return;
    trackingOffset = result.offset;
    trackingMemberOptions(result.members || []);
    $("[data-tracking-count]").textContent = `Cupones de retirados: ${result.counts.pendingOutside} pendientes y ${result.counts.claimedOutside} reclamados | ${result.counts.confirmedNames} relaciones de nicks | ${result.total} cupones con estos filtros`;
    if ($('[data-tracking-summary]')) {
      const summary = result.summary;
      $('[data-tracking-summary]').textContent = summary ? `${memberId ? 'Del integrante y su historial, antes de otros filtros' : 'Resumen de destinatarios'}: ${summary.inside} dentro | ${summary.outside} retirados | ${summary.pending} pendientes | ${summary.claimed} reclamados | ${summary.historical} solo historial.` : '';
    }
    $("[data-tracking-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1}`;
    $("[data-tracking-prev]").disabled = result.offset === 0; $("[data-tracking-next]").disabled = result.offset + 25 >= result.total;
    trackingHtml('[data-tracking-table]', result.entries.map(c => `<tr><td>${escapeHtml(c.currentNick || c.originalNick || '-')}${c.currentNick && c.originalNick && c.currentNick !== c.originalNick ? `<small>Antes: ${escapeHtml(c.originalNick)}</small>` : ''}</td><td>${escapeHtml(c.label)}<details><summary>Ver codigo</summary><code>${escapeHtml(c.code)}</code></details></td><td>${escapeHtml(rewardStates[c.status] || c.status)}</td><td>${escapeHtml(trackingNames[c.membership] || c.membership)}</td><td>${trackingTime(c.membership === 'outside' ? c.leftAt : c.claimed_at || c.lastSeenAt)}</td><td><button class="mini-button" type="button" data-tracking-coupon="${escapeHtml(c.id)}">Ver recorrido</button>${c.memberId ? `<button class="mini-button" type="button" data-member-profile="${escapeHtml(c.memberId)}">Ver ficha</button>` : ''}${c.status === 'assigned' && c.assigned_member_id && !c.event_id ? `<button class="mini-button" type="button" data-unassign-coupon="${escapeHtml(c.id)}">Quitar premio</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Sin premios con estos filtros.</td></tr>');
    for (const [selector, active] of [["[data-tracking-old]", false], ["[data-tracking-new]", true]]) {
      const select = $(selector), selected = select.value;
      const linked = new Set(result.aliases.map((a) => a.from_id));
      const html = '<option value="">Elige integrante</option>' + result.members.filter((m) => Boolean(m.active) === active && (active || !linked.has(m.id))).map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}${!active && m.left_at ? ` | ${trackingTime(m.left_at)}` : ""}</option>`).join("");
      if (select.innerHTML !== html && document.activeElement !== select) select.innerHTML = html;
      select.value = selected;
    }
    trackingHtml('[data-tracking-alias-table]', result.aliases.map((a) => `<tr><td>${escapeHtml(a.fromNick)}</td><td>${escapeHtml(a.toNick)}</td><td>${escapeHtml(a.note)}</td><td>${trackingTime(a.created_at)}</td><td><button class="mini-button" type="button" data-tracking-unlink="${escapeHtml(a.id)}">Retirar relacion</button></td></tr>`).join("") || '<tr><td colspan="5" class="muted">Sin cambios de nick confirmados.</td></tr>');
  } catch (error) { if (revision === trackingRevision) trackingStatus(error.message); }
  finally { trackingBusy = false; if (trackingQueued) { trackingQueued = false; refreshTracking(); } }
}
async function showTrackingHistory(kind, id, offset = 0) {
  const revision = trackingRevision, session = trackingContext();
  const dialogRevision = ++trackingDialogRevision;
  const result = await trackingApi(kind === "coupon" ? "tracking-coupon" : "tracking-member", { ...(kind === "coupon" ? { couponId: id } : { memberId: id }), offset });
  if (revision !== trackingRevision || session !== trackingContext() || dialogRevision !== trackingDialogRevision || $("[data-dashboard]").hidden) return;
  trackingHistory = { kind, id, offset };
  $("[data-tracking-dialog-title]").textContent = kind === "coupon" ? "Recorrido del cupon" : `Historial de ${result.member.nick}`;
  $("[data-tracking-dialog-info]").innerHTML = kind === "coupon" ? `<p>${escapeHtml(result.coupon.label)} | ${escapeHtml(rewardStates[result.coupon.status])}</p><code class="tracking-code">${escapeHtml(result.coupon.code)}</code>` : `<p>Referencia: ${escapeHtml(result.member.id)} | ${result.member.active ? "Dentro del circulo" : "Retirado"}</p><p>Ultima vez visto: ${trackingTime(result.member.last_seen_at)} | Salida detectada: ${trackingTime(result.member.left_at)}</p>`;
  $("[data-tracking-history]").innerHTML = result.entries.map((h) => `<tr><td>${trackingTime(h.created_at)}</td><td>${escapeHtml(trackingActions[h.action] || h.action)}${h.source === "baseline" ? '<br><span class="muted">Estado inicial observado; fecha original no disponible</span>' : ""}</td><td>${escapeHtml(h.previous_nick ? `${h.previous_nick} > ${h.nick}` : h.nick || "Sin destinatario")}</td><td>${escapeHtml([h.label, h.event_title, h.note, h.relatedNick ? `Relacionado con ${h.relatedNick}` : ""].filter(Boolean).join(" | "))}</td><td>${escapeHtml(h.actor_nick || (h.source === "admin" ? "Administrador" : h.source === "baseline" ? "Registro anterior" : "Sincronizacion"))}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Sin movimientos registrados.</td></tr>';
  $("[data-tracking-history-page]").textContent = `Pagina ${Math.floor(offset / 25) + 1} | ${result.total} registros`;
  $("[data-tracking-history-prev]").disabled = offset === 0; $("[data-tracking-history-next]").disabled = offset + 25 >= result.total;
  const dialog = $("[data-tracking-dialog]"); if (!dialog.open) dialog.showModal();
}
function resetTrackingDialog() {
  trackingDialogRevision++;
  trackingHistory = null;
  $("[data-tracking-history]").innerHTML = ""; $("[data-tracking-dialog-info]").innerHTML = "";
}
$("[data-rewards-subsection=\"tracking\"]").addEventListener("toggle", (event) => { if (event.target.open) refreshTracking(); });
$("[data-tracking-refresh]").addEventListener("click", refreshTracking);
for (const selector of ["[data-tracking-membership]", "[data-tracking-state]", "[data-tracking-member-filter]"]) $(selector)?.addEventListener("change", () => { trackingOffset = 0; trackingRevision++; refreshTracking(); });
$('[data-tracking-retired]')?.addEventListener('click', () => {
  $('[data-tracking-member-filter]').value = ''; $('[data-tracking-membership]').value = 'outside'; $('[data-tracking-state]').value = 'all'; $('[data-tracking-search]').value = '';
  trackingOffset = 0; trackingRevision++; refreshTracking();
});
$('[data-tracking-clear]')?.addEventListener('click', () => {
  $('[data-tracking-member-filter]').value = ''; $('[data-tracking-membership]').value = 'recipients'; $('[data-tracking-state]').value = 'all'; $('[data-tracking-search]').value = '';
  trackingOffset = 0; trackingRevision++; refreshTracking();
});
$("[data-tracking-search]").addEventListener("input", () => {
  $('[data-tracking-member-filter]').value=''; renderTrackingSuggestions();
  clearTimeout(trackingTimer); trackingOffset = 0; trackingRevision++;
  trackingTimer = setTimeout(refreshTracking, 250);
});
$('[data-tracking-suggestions]')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-pick-tracking-member]');if(!button)return;
  const member=trackingDirectory.find(m=>m.id===button.dataset.pickTrackingMember);if(!member)return;
  $('[data-tracking-member-filter]').value=member.id;$('[data-tracking-search]').value=member.nick;
  renderTrackingSuggestions();trackingOffset=0;trackingRevision++;refreshTracking();
});
$("[data-tracking-prev]").addEventListener("click", () => { trackingOffset = Math.max(0, trackingOffset - 25); trackingRevision++; refreshTracking(); });
$("[data-tracking-next]").addEventListener("click", () => { trackingOffset += 25; trackingRevision++; refreshTracking(); });
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-tracking-coupon],[data-tracking-member],[data-tracking-unlink],[data-open-member-tracking]");
  if (!button || trackingBusy) return;
  button.disabled = true;
  try {
    if (button.hasAttribute('data-open-member-tracking')) await openMemberTracking(button.dataset.openMemberTracking);
    else if (button.hasAttribute("data-tracking-unlink")) {
      if (!confirm("Retirar esta relacion de nicks? No se moveran premios ni accesos; la correccion quedara en el historial.")) return;
      await trackingApi("tracking-unlink", { aliasId: button.dataset.trackingUnlink }); await refreshTracking(); trackingStatus("Relacion retirada. El historial se conserva.");
    } else await showTrackingHistory(button.hasAttribute("data-tracking-coupon") ? "coupon" : "member", button.dataset.trackingCoupon || button.dataset.trackingMember);
  } catch (error) { trackingStatus(error.message); }
  finally { button.disabled = false; }
});
$("[data-tracking-alias-form]").addEventListener("submit", async (event) => {
  event.preventDefault(); if (trackingBusy) return;
  const fields = event.target.elements;
  try {
    if (!confirm("Confirmar que ambos registros pertenecen a la misma persona? Solo cambia el seguimiento; NO transfiere premios ni claves.")) return;
    trackingBusy = true;
    await trackingApi("tracking-alias", { fromId: fields.namedItem("fromId").value, toId: fields.namedItem("toId").value, note: fields.namedItem("note").value, confirmed: fields.namedItem("confirmed").checked });
    event.target.reset(); trackingStatus("Cambio de nick confirmado. Los premios pendientes anteriores conservan su asignacion hasta que tu decidas corregirla.");
  } catch (error) { trackingStatus(error.message); }
  finally { trackingBusy = false; await refreshTracking(); }
});
for (const [selector, delta] of [["[data-tracking-history-prev]", -25], ["[data-tracking-history-next]", 25]]) $(selector).addEventListener("click", async () => {
  if (!trackingHistory) return;
  try { await showTrackingHistory(trackingHistory.kind, trackingHistory.id, Math.max(0, trackingHistory.offset + delta)); } catch (error) { trackingStatus(error.message); }
});
$("[data-tracking-close]").addEventListener("click", () => $("[data-tracking-dialog]").close());
$("[data-tracking-dialog]").addEventListener("close", resetTrackingDialog);
function clearOwnerTracking() {
  trackingDirectory=[];if($("[data-tracking-suggestions]"))$("[data-tracking-suggestions]").innerHTML="";
  clearTimeout(rosterTrackingTimer); rosterTrackingRevision++; rosterTrackingQueued = false; rosterTrackingOffset = 0;
  $("[data-roster-tracking-table]").innerHTML = ""; $("[data-roster-tracking-count]").textContent = ""; $("[data-roster-tracking-sync]").textContent = ""; $("[data-roster-tracking-status]").textContent = "";
  clearTimeout(trackingTimer); trackingRevision++; trackingQueued = false; trackingOffset = 0; resetTrackingDialog();
  if ($("[data-tracking-dialog]").open) $("[data-tracking-dialog]").close();
  for (const selector of ["[data-tracking-table]", "[data-tracking-alias-table]", "[data-tracking-old]", "[data-tracking-new]"]) $(selector).innerHTML = "";
  $("[data-tracking-count]").textContent = "";
  if ($('[data-tracking-member-filter]')) { $('[data-tracking-member-filter]').value = ''; $('[data-tracking-member-filter]').innerHTML = '<option value="">Todos los integrantes</option>'; }
  if ($('[data-tracking-summary]')) $('[data-tracking-summary]').textContent = '';
  $('[data-tracking-search]').value = ''; $('[data-tracking-membership]').value = 'recipients'; $('[data-tracking-state]').value = 'all';
  $('[data-roster-tracking-search]').value = '';
  $('[data-tracking-alias-form]').reset?.();
}
$('[data-logout]').addEventListener('click', clearOwnerTracking);
$('[data-admin-circle-select]')?.addEventListener('change', clearOwnerTracking);
if (typeof window !== 'undefined') window.addEventListener('mazino-owner-session-cleared', clearOwnerTracking);

