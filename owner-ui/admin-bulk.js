let bulkPreview = null, bulkCandidates = [], bulkSelected = null, bulkRevision = 0, bulkOffset = 0, bulkMemberPage = 0, bulkBusy = false;
let bulkDetail = null, bulkDetailPage = 0;
const bulkSection = $('[data-rewards-subsection="bulk"]');
const bulkTime = (v) => v ? new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "Sin consulta registrada";
const bulkRewardRule = (v) => ({ same_item: "Sin repetir este premio", any_prize: "Sin premios anteriores", none: "Sin exclusion por premios" })[v] || "Regla anterior";
const bulkMessage = (v) => { $("[data-bulk-status]").textContent = v; };
const bulkRequest = (action, body = {}) => api(`/api/admin/rewards/${action}`, { method: "POST", body: JSON.stringify(body) });
function invalidateBulk() { bulkPreview = null; bulkRevision++; $("[data-bulk-confirm]").disabled = true; }
async function bulkRun(task) {
  if (bulkBusy) return;
  bulkBusy = true;
  const controls = [...bulkSection.querySelectorAll("[data-bulk-form] input,[data-bulk-form] select,[data-bulk-form] button,[data-bulk-member]")].map((el) => [el, el.disabled]);
  controls.forEach(([el]) => { el.disabled = true; });
  for (const s of ["[data-bulk-preview]", "[data-bulk-confirm]", "[data-bulk-refresh]"]) $(s).disabled = true;
  try { await task(); } catch (error) { if (!$("[data-dashboard]").hidden) bulkMessage(error.message); }
  finally { controls.forEach(([el, disabled]) => { el.disabled = disabled; }); bulkBusy = false; $("[data-bulk-preview]").disabled = false; $("[data-bulk-refresh]").disabled = false; $("[data-bulk-confirm]").disabled = !bulkPreview?.canConfirm; }
}
async function refreshBulk() {
  const revision = bulkRevision, result = await bulkRequest("bulk-state", { offset: bulkOffset });
  if (revision !== bulkRevision || $("[data-dashboard]").hidden) return;
  const select = $("[data-bulk-source]"), selected = select.value;
  select.innerHTML = '<option value="">Elige lote y premio</option>' + result.sources.map((s) => `<option value="${escapeHtml(s.sourceKey)}">${escapeHtml(s.batch)} | ${escapeHtml(s.label)} (${s.available})</option>`).join("");
  select.value = selected;
  $("[data-bulk-history]").innerHTML = result.entries.map((d) => `<tr><td>${escapeHtml(d.title)}</td><td>${escapeHtml(d.label)}<br>${escapeHtml(d.batch)}</td><td>${escapeHtml(d.actorNick)}</td><td>${bulkTime(d.confirmedAt)}</td><td>${d.total} / ${d.recipients.length} integrantes</td><td>${d.status === "cancelled" ? "Retirado" : "Confirmado"}</td><td><button class="mini-button" type="button" data-bulk-view="${escapeHtml(d.id)}">Ver destinatarios</button>${d.status === "confirmed" ? `<button class="mini-button" type="button" data-bulk-cancel="${escapeHtml(d.id)}">Retirar pendientes</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7">Sin repartos registrados.</td></tr>';
  $("[data-bulk-page]").textContent = `Pagina ${Math.floor(result.offset / 25) + 1} | ${result.total} repartos`;
  $("[data-bulk-prev]").disabled = !result.offset; $("[data-bulk-next]").disabled = result.offset + 25 >= result.total;
}
function renderBulkCandidates() {
  const query = $("[data-bulk-search]").value.toLowerCase(), filtered = bulkCandidates.filter((m) => m.nick.toLowerCase().includes(query));
  bulkMemberPage = Math.min(bulkMemberPage, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  $("[data-bulk-members]").innerHTML = filtered.slice(bulkMemberPage * 25, bulkMemberPage * 25 + 25).map((m) => `<tr><td><input type="checkbox" aria-label="Incluir a ${escapeHtml(m.nick)}" data-bulk-member="${escapeHtml(m.id)}" ${bulkSelected.has(m.id) ? "checked" : ""} ${m.locked ? "disabled" : ""} /></td><td>${escapeHtml(m.nick)}</td><td>${escapeHtml(m.joinedOn || "Sin fecha")}</td><td>${m.seniority === null ? "-" : `${m.seniority} dias`}</td><td>${m.loginEnabled ? "Activo" : "Falta generar acceso"}</td><td>${escapeHtml(m.reason || "Cumple los filtros")}</td></tr>`).join("");
  $("[data-bulk-member-page]").textContent = `Pagina ${bulkMemberPage + 1} | ${filtered.length} integrantes`;
  $("[data-bulk-member-prev]").disabled = !bulkMemberPage; $("[data-bulk-member-next]").disabled = (bulkMemberPage + 1) * 25 >= filtered.length;
}
function renderBulkDetail() {
  const d = bulkDetail;
  if (!d) { $("[data-bulk-detail]").innerHTML = ""; return; }
  const rule = bulkRewardRule(d.filters.rewardRule);
  $("[data-bulk-detail]").innerHTML = `<h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.actorNick)} | ${escapeHtml(d.label)} | ${escapeHtml(d.batch)} | ${d.perMember} por integrante</p><p>Ingreso: ${escapeHtml(d.filters.from || "Sin inicio")} a ${escapeHtml(d.filters.to || "Sin fin")} | Antiguedad minima: ${d.filters.minDays} dias</p><div class="rewards-toolbar"><button class="ghost-button" type="button" data-bulk-detail-prev ${!bulkDetailPage ? "disabled" : ""}>Anterior</button><span>Pagina ${bulkDetailPage + 1}</span><button class="ghost-button" type="button" data-bulk-detail-next ${(bulkDetailPage + 1) * 25 >= d.recipients.length ? "disabled" : ""}>Siguiente</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Integrante</th><th>Ingreso</th><th>Seleccion</th><th>Pendientes</th><th>Reclamados</th><th>Retirados o reasignados</th></tr></thead><tbody>` + d.recipients.slice(bulkDetailPage * 25, bulkDetailPage * 25 + 25).map((m) => `<tr><td>${escapeHtml(m.nick)}</td><td>${escapeHtml(m.joinedOn || "Sin fecha")}</td><td>${m.manual ? "Manual" : "Segun filtros"}</td><td>${m.pending}</td><td>${m.claimed}</td><td>${d.perMember - m.pending - m.claimed}</td></tr>`).join("") + "</tbody></table></div>";
  $("[data-bulk-detail]").innerHTML += `<p>Premios anteriores: ${escapeHtml(rule)}</p>`;
}
$("[data-bulk-form]").addEventListener("input", () => {
  invalidateBulk(); bulkSelected = null; bulkCandidates = []; $("[data-bulk-candidates]").hidden = true;
});
$("[data-bulk-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  bulkRun(async () => {
    const fields = event.target.elements, revision = ++bulkRevision;
    bulkPreview = null;
    const body = Object.fromEntries(["title", "sourceKey", "perMember", "from", "to", "minDays", "rewardRule"].map((n) => [n, fields.namedItem(n).value]));
    if (bulkSelected) body.selectedIds = [...bulkSelected];
    const result = await bulkRequest("bulk-preview", body);
    if (revision !== bulkRevision || $("[data-dashboard]").hidden) return;
    bulkPreview = result; bulkCandidates = result.candidates; bulkSelected = new Set(result.recipients.map((m) => m.id)); bulkMemberPage = 0;
    $("[data-bulk-candidates]").hidden = false; renderBulkCandidates();
    const excluded = Object.values(result.excluded || {}).reduce((n, count) => n + count, 0);
    $("[data-bulk-summary]").textContent = `${result.candidates.length} cumplen | ${excluded} descartados (${result.excluded?.previousPrizes || 0} por premios anteriores) | ${result.recipients.length} seleccionados x ${result.perMember} ${result.label} = ${result.total} cupones | ${result.available} disponibles | ${bulkRewardRule(result.filters?.rewardRule)} | Circulo consultado: ${bulkTime(result.lastSyncAt)}`;
    bulkMessage(result.warnings.join(" ") || "Vista previa lista. Aun no se entrego ningun cupon.");
  });
});
$("[data-bulk-members]").addEventListener("change", (event) => {
  const input = event.target.closest("[data-bulk-member]"); if (!input || bulkBusy) return;
  input.checked ? bulkSelected.add(input.dataset.bulkMember) : bulkSelected.delete(input.dataset.bulkMember);
  invalidateBulk(); bulkMessage(`${bulkSelected.size} seleccionados. Revisa destinatarios de nuevo para confirmar los cambios.`);
});
for (const [selector, mode] of [["[data-bulk-eligible]", true], ["[data-bulk-none]", false]]) $(selector).addEventListener("click", () => {
  if (bulkBusy) return; bulkSelected = new Set(mode ? bulkCandidates.filter((m) => m.eligible).map((m) => m.id) : []); invalidateBulk(); renderBulkCandidates(); bulkMessage("Seleccion modificada. Revisa destinatarios de nuevo.");
});
$("[data-bulk-search]").addEventListener("input", () => { bulkMemberPage = 0; renderBulkCandidates(); });
for (const [selector, delta] of [["[data-bulk-member-prev]", -1], ["[data-bulk-member-next]", 1]]) $(selector).addEventListener("click", () => { bulkMemberPage += delta; renderBulkCandidates(); });
$("[data-bulk-confirm]").addEventListener("click", () => bulkRun(async () => {
  const plan = bulkPreview; if (!plan?.canConfirm || !confirm(`Entregar ${plan.total} cupones de ${plan.label} a ${plan.recipients.length} integrantes?`)) return;
  const revision = bulkRevision, result = await bulkRequest("bulk-confirm", { id: plan.id });
  if (revision !== bulkRevision || $("[data-dashboard]").hidden) return;
  invalidateBulk(); $("[data-bulk-candidates]").hidden = true; bulkSelected = null;
  bulkMessage(`${result.total} cupones asignados. Los destinatarios estan en Historial de repartos.`);
  $("[data-bulk-history-section]").open = true; await refreshBulk(); await refreshAdminPrizes();
}));
$("[data-bulk-history]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bulk-view],[data-bulk-cancel]"); if (!button) return;
  bulkRun(async () => {
    const revision = bulkRevision;
    if (button.hasAttribute("data-bulk-cancel")) {
      if (!confirm("Retirar solo los cupones pendientes de este reparto? Los reclamados y el historial se conservan. Los limites de los sublideres no se devuelven.")) return;
      const result = await bulkRequest("bulk-cancel", { id: button.dataset.bulkCancel });
      if (revision !== bulkRevision) return;
      bulkMessage(`${result.released} cupones pendientes retirados.`); $("[data-bulk-detail]").innerHTML = "";
      invalidateBulk(); await refreshBulk(); await refreshAdminPrizes();
    } else {
      const result = await bulkRequest("bulk-detail", { id: button.dataset.bulkView });
      if (revision !== bulkRevision || $("[data-dashboard]").hidden) return;
      bulkDetail = result; bulkDetailPage = 0; renderBulkDetail();
    }
  });
});
$("[data-bulk-detail]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bulk-detail-prev],[data-bulk-detail-next]"); if (!button || !bulkDetail) return;
  bulkDetailPage = Math.max(0, bulkDetailPage + (button.hasAttribute("data-bulk-detail-prev") ? -1 : 1)); renderBulkDetail();
});
$("[data-bulk-refresh]").addEventListener("click", () => bulkRun(async () => { invalidateBulk(); await refreshBulk(); bulkMessage("Lotes e historial actualizados. Revisa otra vez antes de confirmar."); }));
for (const [selector, delta] of [["[data-bulk-prev]", -25], ["[data-bulk-next]", 25]]) $(selector).addEventListener("click", () => bulkRun(async () => { bulkOffset = Math.max(0, bulkOffset + delta); await refreshBulk(); }));
bulkSection.addEventListener("toggle", () => {
  if (bulkSection.open) bulkRun(refreshBulk);
  else { invalidateBulk(); bulkDetail = null; renderBulkDetail(); }
});
$("[data-logout]").addEventListener("click", () => {
  invalidateBulk(); bulkCandidates = []; bulkSelected = null; bulkOffset = 0; bulkDetail = null; bulkSection.open = false;
  $("[data-bulk-candidates]").hidden = true;
  for (const s of ["[data-bulk-history]", "[data-bulk-members]", "[data-bulk-detail]", "[data-bulk-source]"]) $(s).innerHTML = "";
  bulkMessage("");
});
