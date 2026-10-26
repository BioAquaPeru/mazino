let transferAuditRevision = 0;
let transferAuditOffset = 0;
let transferAuditTotal = 0;
let transferAuditLoading = false;
function renderTransferActors() {
  const select = $("[data-transfers-actor]"), selected = select.value;
  const members = staffState.historyMembers || staffState.accounts.map(a => ({ id: a.member_id, nick: a.nick }));
  select.innerHTML = '<option value="">Todos</option><option value="staff">Solo sublideres</option><option value="admin">Administrador</option>' + members.map(m => `<option value="member:${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("");
  select.value = selected;
}
async function refreshTransfers(offset = 0) {
  const revision = ++transferAuditRevision;
  if ($("[data-dashboard]").hidden) return;
  const actor = $("[data-transfers-actor]").value;
  const filters = { view: "transfers", actor: actor.startsWith("member:") ? "member" : actor || "all", memberId: actor.startsWith("member:") ? actor.slice(7) : "", search: $("[data-transfers-search]").value, from: $("[data-transfers-from]").value, to: $("[data-transfers-to]").value, offset };
  transferAuditLoading = true;
  $("[data-transfers-prev]").disabled = true;
  $("[data-transfers-next]").disabled = true;
  $("[data-transfers-rows]").innerHTML = "";
  $("[data-transfers-page]").textContent = "";
  $("[data-transfers-status]").textContent = "Consultando traspasos...";
  try {
    const result = await staffApi("audit", filters);
    if (revision !== transferAuditRevision || $("[data-dashboard]").hidden) return;
    transferAuditOffset = result.offset; transferAuditTotal = result.total;
    $("[data-transfers-rows]").innerHTML = result.entries.map(row => `<tr><td>${escapeHtml(staffTime(row.createdAt))}</td><td>${escapeHtml(row.actorNick)}${row.actorId ? " (sublider)" : " (administrador)"}</td><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.fromNick)}</td><td>${escapeHtml(row.toNick)}</td><td>${escapeHtml(row.reason || "Sin motivo registrado")}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">No hay traspasos con estos filtros.</td></tr>';
    $("[data-transfers-status]").textContent = `${result.total} traspaso${result.total === 1 ? "" : "s"} encontrado${result.total === 1 ? "" : "s"}.`;
    $("[data-transfers-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1} de ${Math.max(1, Math.ceil(result.total / 25))}`;
    $("[data-transfers-prev]").disabled = result.offset === 0;
    $("[data-transfers-next]").disabled = result.offset + 25 >= result.total;
  } catch (error) {
    if (revision === transferAuditRevision && !$("[data-dashboard]").hidden) $("[data-transfers-status]").textContent = error.message;
  } finally {
    if (revision === transferAuditRevision) transferAuditLoading = false;
  }
}
$("[data-transfers-form]").addEventListener("submit", event => { event.preventDefault(); refreshTransfers(); });
for (const field of ["actor", "from", "to"]) $(`[data-transfers-${field}]`).addEventListener("change", () => refreshTransfers());
// Discard the old result as soon as a search is edited, including during pagination.
$("[data-transfers-search]").addEventListener("input", () => {
  transferAuditRevision++; transferAuditLoading = false;
  $("[data-transfers-rows]").innerHTML = "";
  $("[data-transfers-page]").textContent = "";
  $("[data-transfers-status]").textContent = "";
  $("[data-transfers-prev]").disabled = true; $("[data-transfers-next]").disabled = true;
});
$("[data-transfers-clear]").addEventListener("click", () => {
  for (const field of ["actor", "search", "from", "to"]) $(`[data-transfers-${field}]`).value = "";
  refreshTransfers();
});
$("[data-transfers-prev]").addEventListener("click", () => { if (!transferAuditLoading && transferAuditOffset > 0) refreshTransfers(transferAuditOffset - 25); });
$("[data-transfers-next]").addEventListener("click", () => { if (!transferAuditLoading && transferAuditOffset + 25 < transferAuditTotal) refreshTransfers(transferAuditOffset + 25); });
$('[data-staff-group="transfers"]').addEventListener("toggle", event => {
  if (event.target.open && !$("[data-dashboard]").hidden) { renderTransferActors(); refreshTransfers(); }
  else { transferAuditRevision++; transferAuditLoading = false; }
});
$("[data-logout]").addEventListener("click", () => {
  transferAuditRevision++; transferAuditLoading = false; transferAuditOffset = 0; transferAuditTotal = 0;
  for (const field of ["actor", "search", "from", "to"]) $(`[data-transfers-${field}]`).value = "";
  renderTransferActors();
  $("[data-transfers-rows]").innerHTML = ""; $("[data-transfers-page]").textContent = ""; $("[data-transfers-status]").textContent = "";
  $("[data-transfers-prev]").disabled = true; $("[data-transfers-next]").disabled = true;
});
