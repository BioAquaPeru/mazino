let dailyRevision = 0, dailyOffset = 0, dailyTotal = 0, dailyLoading = false;
let pendingRevision = 0, pendingOffset = 0, pendingTotal = 0, pendingLoading = false;
const dailyFields = ["assigned", "claimed", "transfers", "pending", "free", "staff-free"];
const todayInPeru = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
function clearDailySummary() {
  for (const name of dailyFields) $(`[data-daily-${name}]`).textContent = "-";
  for (const name of ["actors", "winners"]) $(`[data-daily-${name}]`).innerHTML = "";
  for (const name of ["winners-total", "page", "status"]) $(`[data-daily-${name}]`).textContent = "";
  $("[data-daily-prev]").disabled = true; $("[data-daily-next]").disabled = true;
}
async function refreshDailySummary(offset = 0) {
  const revision = ++dailyRevision;
  if ($("[data-dashboard]").hidden) return;
  const date = $("[data-daily-date]").value || todayInPeru();
  $("[data-daily-date]").value = date;
  dailyLoading = true; clearDailySummary();
  $("[data-daily-status]").textContent = "Consultando resumen...";
  try {
    const result = await staffApi("audit", { view: "daily", date, offset });
    if (revision !== dailyRevision || $("[data-dashboard]").hidden) return;
    dailyOffset = result.offset; dailyTotal = result.winnersTotal;
    for (const name of dailyFields) $(`[data-daily-${name}]`).textContent = String(result.totals[name === "staff-free" ? "staffFree" : name]);
    $("[data-daily-actors]").innerHTML = result.actors.map(a => `<tr><td>${escapeHtml(a.actorNick)}</td><td>${a.assigned}</td><td>${a.eventWinners}</td><td>${a.transfers}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Sin actividad registrada ese dia.</td></tr>';
    $("[data-daily-winners-total]").textContent = `(${result.winnersTotal})`;
    $("[data-daily-winners]").innerHTML = result.winners.map(w => `<tr><td>${escapeHtml(staffTime(w.claimedAt))}</td><td>${escapeHtml(w.nick)}</td><td>${escapeHtml(w.eventTitle)}</td><td>${escapeHtml(w.label)}</td><td>${escapeHtml(w.organizer)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Sin ganadores registrados ese dia.</td></tr>';
    $("[data-daily-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1} de ${Math.max(1, Math.ceil(result.winnersTotal / 25))}`;
    $("[data-daily-prev]").disabled = result.offset === 0;
    $("[data-daily-next]").disabled = result.offset + 25 >= result.winnersTotal;
    $("[data-daily-status]").textContent = `Actualizado: ${staffTime(result.asOf)} | Horario de Peru`;
  } catch (error) {
    if (revision === dailyRevision && !$("[data-dashboard]").hidden) $("[data-daily-status]").textContent = error.message;
  } finally { if (revision === dailyRevision) dailyLoading = false; }
}
function clearPendingAwards() {
  $("[data-pending-rows]").innerHTML = ""; $("[data-pending-page]").textContent = ""; $("[data-pending-status]").textContent = "";
  $("[data-pending-prev]").disabled = true; $("[data-pending-next]").disabled = true;
}
async function refreshPendingAwards(offset = 0) {
  const revision = ++pendingRevision;
  if ($("[data-dashboard]").hidden) return;
  const filters = { view: "pending", search: $("[data-pending-search]").value, minDays: $("[data-pending-days]").value, membership: $("[data-pending-membership]").value || "all", offset };
  pendingLoading = true; clearPendingAwards();
  $("[data-pending-status]").textContent = "Consultando pendientes...";
  try {
    const result = await staffApi("audit", filters);
    if (revision !== pendingRevision || $("[data-dashboard]").hidden) return;
    pendingOffset = result.offset; pendingTotal = result.total;
    if (typeof pendingRowsUpdated === "function") pendingRowsUpdated(result.entries);
    $("[data-pending-rows]").innerHTML = result.entries.map(p => `<tr><td>${escapeHtml(p.nick)}</td><td>${escapeHtml(p.label)}</td><td>${p.assignedAt == null ? "Sin fecha original" : escapeHtml(staffTime(p.assignedAt))}</td><td>${p.days == null ? "Sin fecha original" : `${p.days} ${p.days === 1 ? "dia" : "dias"}`}</td><td>${escapeHtml(p.assignedBy || "Sin registro")}</td><td>${p.active ? "Dentro del circulo" : "Fuera del circulo"}</td><td><div class="profile-prize-actions"><button type="button" class="mini-button" data-member-profile="${escapeHtml(p.memberId)}">Ver ficha</button>${typeof pendingActionButtons === "function" ? pendingActionButtons(p) : ""}</div></td></tr>`).join("") || '<tr><td colspan="7" class="muted">No hay premios pendientes con estos filtros.</td></tr>';
    $("[data-pending-status]").textContent = `${result.total} ${result.total === 1 ? "premio pendiente" : "premios pendientes"} | Actualizado: ${staffTime(result.asOf)}`;
    $("[data-pending-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1} de ${Math.max(1, Math.ceil(result.total / 25))}`;
    $("[data-pending-prev]").disabled = result.offset === 0;
    $("[data-pending-next]").disabled = result.offset + 25 >= result.total;
  } catch (error) {
    if (revision === pendingRevision && !$("[data-dashboard]").hidden) $("[data-pending-status]").textContent = error.message;
  } finally { if (revision === pendingRevision) pendingLoading = false; }
}
function refreshOwnerOverview() {
  refreshDailySummary();
  if ($('[data-rewards-subsection="pending"]').open) refreshPendingAwards();
}
$("[data-daily-form]").addEventListener("submit", event => { event.preventDefault(); refreshDailySummary(); });
$("[data-daily-date]").addEventListener("change", () => refreshDailySummary());
$("[data-daily-today]").addEventListener("click", () => { $("[data-daily-date]").value = todayInPeru(); refreshDailySummary(); });
$("[data-daily-prev]").addEventListener("click", () => { if (!dailyLoading && dailyOffset > 0) refreshDailySummary(dailyOffset - 25); });
$("[data-daily-next]").addEventListener("click", () => { if (!dailyLoading && dailyOffset + 25 < dailyTotal) refreshDailySummary(dailyOffset + 25); });
$("[data-owner-summary]").addEventListener("toggle", event => {
  if (event.target.open) refreshDailySummary();
  else { dailyRevision++; dailyLoading = false; }
});
$("[data-pending-form]").addEventListener("submit", event => { event.preventDefault(); refreshPendingAwards(); });
for (const name of ["days", "membership"]) $(`[data-pending-${name}]`).addEventListener("change", () => refreshPendingAwards());
$("[data-pending-search]").addEventListener("input", () => { pendingRevision++; pendingLoading = false; clearPendingAwards(); });
$("[data-pending-clear]").addEventListener("click", () => {
  $("[data-pending-search]").value = ""; $("[data-pending-days]").value = ""; $("[data-pending-membership]").value = "all";
  refreshPendingAwards();
});
$("[data-pending-prev]").addEventListener("click", () => { if (!pendingLoading && pendingOffset > 0) refreshPendingAwards(pendingOffset - 25); });
$("[data-pending-next]").addEventListener("click", () => { if (!pendingLoading && pendingOffset + 25 < pendingTotal) refreshPendingAwards(pendingOffset + 25); });
$('[data-rewards-subsection="pending"]').addEventListener("toggle", event => {
  if (event.target.open) refreshPendingAwards();
  else { pendingRevision++; pendingLoading = false; }
});
$("[data-logout]").addEventListener("click", () => {
  dailyRevision++; pendingRevision++; dailyLoading = false; pendingLoading = false;
  dailyOffset = 0; dailyTotal = 0; pendingOffset = 0; pendingTotal = 0;
  clearDailySummary(); clearPendingAwards();
  $("[data-daily-date]").value = ""; $("[data-pending-search]").value = ""; $("[data-pending-days]").value = ""; $("[data-pending-membership]").value = "all";
});
if (!$("[data-dashboard]").hidden) refreshDailySummary();
