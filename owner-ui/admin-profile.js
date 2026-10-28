let memberProfileRevision = 0, memberProfileId = "", memberProfileData = null, memberProfileTrigger = null;
let memberProfilePrizeOffset = 0, memberProfileHistoryOffset = 0;
let memberProfileContext = 0, memberProfileStockRequest = 0, memberProfileStock = [], memberProfileStockReady = false, memberProfileAssignBusy = false;
let memberProfileRewardState = null, memberProfileDeliveryPreview = null;
const profileDate = value => value ? value.split("-").reverse().join("/") : "Sin fecha registrada";
let memberProfileRecipients = [], memberProfileTransferId = "";
function selectProfileTab(name) {
  for (const tab of $$("[data-profile-tab]")) {
    const selected = tab.dataset.profileTab === name;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of $$("[data-profile-panel]")) panel.hidden = panel.dataset.profilePanel !== name;
}
function renderMemberProfile(data) {
  const m = data.member;
  $("[data-profile-title]").textContent = m.nick;
  const facts = [["Situacion", m.active ? "Dentro del circulo" : "Fuera del circulo"], ["Miembro desde", profileDate(m.joinedOn)], ["Antiguedad", m.seniority == null ? "Sin fecha registrada" : `${m.seniority} dias`],
    ["Nivel", m.level || "Sin registro actual"], ["Rango / titulo", m.title || m.rank || "Sin registro actual"], ["Pareja", m.partnerNick || "Sin pareja registrada"],
    ["Ultima vez visto (Peru)", trackingTime(m.last_seen_at)], ["Salida detectada (Peru)", m.left_at ? trackingTime(m.left_at) : "Sin salida registrada"],
    ["Premios pendientes", data.totals.pending], ["Premios reclamados", data.totals.claimed], ["Cupones con historial", data.totals.total]];
  $("[data-profile-facts]").innerHTML = facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  $("[data-profile-aliases]").textContent = data.aliases.map(a => `Cambio confirmado: ${a.previousNick} > ${a.currentNick}`).join(" | ");
  $("[data-profile-prize-count]").textContent = `${data.totals.pending} pendientes | ${data.totals.claimed} reclamados | ${data.totals.total} cupones con historial`;
  const states = { pending: "Pendiente de reclamar", claimed: "Reclamado", historical: "Solo historial" };
  $("[data-profile-prizes]").innerHTML = data.prizes.map(p => {
    const pending = p.relationship === "pending" && !p.claimed_at, disabled = memberProfileAssignBusy ? " disabled" : "";
    const changes = pending ? `<button type="button" class="mini-button" data-profile-release="${escapeHtml(p.id)}"${disabled}><img src="/assets/guides/icon-close.svg" alt="" width="14" height="14" />Quitar premio</button><button type="button" class="mini-button" data-profile-transfer="${escapeHtml(p.id)}"${disabled}><img src="/assets/admin/users.svg" alt="" width="14" height="14" />Pasar a otro integrante</button>` : "";
    return `<tr><td>${escapeHtml(p.label)}</td><td>${states[p.relationship] || "Solo historial"}${p.acknowledged_at && p.relationship === "claimed" ? " - guardado" : ""}</td><td>${escapeHtml(p.eventTitle || "Personal")}</td><td>${p.relationship === "claimed" ? trackingTime(p.claimed_at) : "-"}</td><td><div class="profile-prize-actions"><button type="button" class="mini-button" data-profile-coupon="${escapeHtml(p.id)}">Ver recorrido</button>${changes}</div></td></tr>`;
  }).join("") || '<tr><td colspan="5" class="muted">Sin premios registrados.</td></tr>';
  $("[data-profile-history]").innerHTML = data.history.map(h => `<tr><td>${trackingTime(h.created_at)}</td><td>${escapeHtml(trackingActions[h.action] || h.action)}</td><td>${escapeHtml(h.previous_nick ? `${h.previous_nick} > ${h.nick}` : h.nick)}</td><td>${escapeHtml(h.note || (h.source === "baseline" ? "Estado inicial observado; fecha original no disponible" : "-"))}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Sin movimientos registrados.</td></tr>';
  $("[data-profile-prize-page]").textContent = `Pagina ${Math.floor(data.prizeOffset / 25) + 1} | ${data.totals.total} cupones`;
  $("[data-profile-history-page]").textContent = `Pagina ${Math.floor(data.historyOffset / 25) + 1} | ${data.historyTotal} movimientos`;
  for (const [name, offset, count] of [["prizes", data.prizeOffset, data.totals.total], ["history", data.historyOffset, data.historyTotal]]) {
    $(`[data-profile-page="${name}-prev"]`).disabled = offset === 0;
    $(`[data-profile-page="${name}-next"]`).disabled = offset + 25 >= count;
  }
  $("[data-profile-content]").hidden = false;
  renderProfileAssignment();
}
function profileAssignmentStock() {
  return memberProfileStock.filter(c => rewardItemKey(c.label) === $("[data-profile-item]").value)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0) || a.id.localeCompare(b.id));
}
function renderProfileAssignment() {
  const member = memberProfileData?.member, select = $("[data-profile-item]"), selected = select.value;
  const items = new Map();
  for (const coupon of memberProfileStock) {
    const key = rewardItemKey(coupon.label);
    if (!items.has(key)) items.set(key, { label: coupon.label, count: 0 });
    items.get(key).count++;
  }
  select.innerHTML = '<option value="">Elige un premio</option>' + [...items].sort((a, b) => a[1].label.localeCompare(b[1].label, "es")).map(([key, item]) => `<option value="${escapeHtml(key)}">${escapeHtml(item.label)} (${item.count} disponibles)</option>`).join("");
  select.value = items.has(selected) ? selected : "";
  $("[data-profile-recipient]").textContent = member ? `Entrega para ${member.nick}` : "";
  const available = profileAssignmentStock().length, quantity = Number($("[data-profile-quantity]").value);
  $("[data-profile-quantity]").max = String(Math.min(50, available || 1));
  const blocked = !member?.active || !memberProfileStockReady || memberProfileAssignBusy;
  select.disabled = blocked; $("[data-profile-quantity]").disabled = blocked;
  $("[data-profile-assign-submit]").disabled = blocked || !Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(50, available);
  memberProfileDeliveryPreview = null;
  if (typeof OwnerDeliveryPreview !== 'undefined') {
    if (!blocked && !$("[data-profile-assign-submit]").disabled) {
      const context = memberProfileContext, item = select.value, count = $("[data-profile-quantity]").value;
      try {
        memberProfileDeliveryPreview = OwnerDeliveryPreview.create(member, profileAssignmentStock().slice(0, quantity), {
          source: 'profile', getState: () => memberProfileRewardState,
          valid: () => context === memberProfileContext && $("[data-profile-dialog]").open && memberProfileData?.member.id === member.id && memberProfileData.member.active && memberProfileData.member.nick === member.nick && select.value === item && $("[data-profile-quantity]").value === count,
        });
      } catch { $("[data-profile-assign-submit]").disabled = true; }
    }
    OwnerDeliveryPreview.render($("[data-profile-exact-preview]"), memberProfileDeliveryPreview);
  }
  $("[data-profile-stock-refresh]").disabled = memberProfileAssignBusy;
  for (const button of $$("[data-profile-release]")) button.disabled = memberProfileAssignBusy;
  for (const button of $$("[data-profile-transfer]")) button.disabled = memberProfileAssignBusy;
  renderProfileTransfer();
  $("[data-profile-stock-note]").textContent = member && !member.active ? "No se pueden asignar cupones a un integrante retirado."
    : memberProfileStockReady && !items.size ? "No hay cupones libres. Los reservados para eventos o sublideres no estan disponibles aqui." : "";
}
async function refreshProfileStock() {
  const context = memberProfileContext, request = ++memberProfileStockRequest;
  memberProfileStockReady = false; renderProfileAssignment();
  $("[data-profile-assignment-status]").textContent = "Actualizando premios disponibles...";
  try {
    const state = await api("/api/admin/rewards");
    if (context !== memberProfileContext || request !== memberProfileStockRequest || !$("[data-profile-dialog]").open || $("[data-dashboard]").hidden) return;
    if (!state.connection?.configured) throw new Error("El servicio de premios no esta conectado.");
    memberProfileRewardState = state;
    memberProfileStock = state.coupons.filter(c => c.status === "available" && !c.event_id && !c.staff_owner_id)
      .map(c => ({ ...c }));
    memberProfileRecipients = (state.members || []).filter(m => m.active && m.id !== memberProfileId).map(m => ({ id: m.id, nick: m.nick }));
    memberProfileStockReady = true; $("[data-profile-assignment-status]").textContent = ""; renderProfileAssignment();
  } catch (error) {
    if (context === memberProfileContext && request === memberProfileStockRequest && $("[data-profile-dialog]").open) $("[data-profile-assignment-status]").textContent = error.message;
  }
}
async function loadMemberProfile() {
  const revision = ++memberProfileRevision, id = memberProfileId;
  $("[data-profile-status]").textContent = "Cargando ficha...";
  for (const button of $$("[data-profile-page]")) button.disabled = true;
  try {
    const data = await trackingApi("tracking-profile", { memberId: id, prizeOffset: memberProfilePrizeOffset, historyOffset: memberProfileHistoryOffset });
    if (revision !== memberProfileRevision || !$("[data-profile-dialog]").open || $("[data-dashboard]").hidden) return;
    memberProfileData = data; renderMemberProfile(data); $("[data-profile-status]").textContent = "";
  } catch (error) {
    if (revision === memberProfileRevision && $("[data-profile-dialog]").open) $("[data-profile-status]").textContent = error.message;
  }
}
function showMemberProfile(id, trigger) {
  if (typeof OwnerDeliveryPreview !== 'undefined') OwnerDeliveryPreview.cancel();
  $("[data-profile-transfer-reason]").value = "";
  memberProfileRecipients = []; memberProfileTransferId = "";
  $("[data-profile-transfer-search]").value = ""; $("[data-profile-transfer-recipient]").value = "";
  memberProfileContext++; memberProfileStock = []; memberProfileStockReady = false;
  $("[data-profile-item]").value = ""; $("[data-profile-quantity]").value = "1"; $("[data-profile-assignment-status]").textContent = "";
  $("[data-profile-release-status]").textContent = "";
  memberProfileRevision++; memberProfileId = id; memberProfileData = null; memberProfileTrigger = trigger;
  memberProfilePrizeOffset = 0; memberProfileHistoryOffset = 0;
  $("[data-profile-title]").textContent = "Integrante"; $("[data-profile-content]").hidden = true;
  for (const selector of ["[data-profile-facts]", "[data-profile-prizes]", "[data-profile-history]"]) $(selector).innerHTML = "";
  selectProfileTab("summary");
  if (!$("[data-profile-dialog]").open) $("[data-profile-dialog]").showModal();
  refreshProfileStock();
  return loadMemberProfile();
}

$("[data-profile-item]").addEventListener("change", renderProfileAssignment);
$("[data-profile-quantity]").addEventListener("input", renderProfileAssignment);
$("[data-profile-stock-refresh]").addEventListener("click", refreshProfileStock);
$("[data-profile-assign-form]").addEventListener("submit", async event => {
  event.preventDefault();
  if (memberProfileAssignBusy || !memberProfileStockReady || !memberProfileData?.member.active) return;
  const member = { ...memberProfileData.member }, quantity = Number($("[data-profile-quantity]").value), stock = profileAssignmentStock();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(50, stock.length)) return;
  const coupons = stock.slice(0, quantity), context = memberProfileContext;
  const preview = memberProfileDeliveryPreview;
  if (typeof OwnerDeliveryPreview === 'undefined' && typeof assignRewardDelivery !== 'function' && typeof document.createElement !== 'function' && !confirm(`Asignar ${quantity} x ${coupons[0].label} a ${member.nick}?`)) return;
  memberProfileAssignBusy = true; renderProfileAssignment();
  $("[data-profile-assignment-status]").textContent = "Revisa los lotes y confirma la entrega.";
  try {
    if (typeof OwnerDeliveryPreview !== 'undefined' && !preview) throw new Error('Elige el premio y revisa la vista previa antes de confirmar.');
    let result;
    if (typeof assignRewardDelivery === 'function') result = await assignRewardDelivery(member, coupons, { preview, source: 'profile', getState: () => memberProfileRewardState, quiet: true,
      onAssign: () => { if (context === memberProfileContext && $("[data-profile-dialog]").open) $("[data-profile-assignment-status]").textContent = "Asignando cupon..."; },
    });
    else if (typeof document.createElement !== 'function') result = await rewardAdminAction("assign", { memberId: member.id, couponIds: coupons.map(c => c.id) });
    else throw new Error('No se pudo cargar la confirmacion de entrega. Recarga el panel.');
    if (!result) {
      if (context === memberProfileContext && $("[data-profile-dialog]").open && !$("[data-dashboard]").hidden) $("[data-profile-assignment-status]").textContent = "Entrega cancelada. No se asignaron cupones.";
      return;
    }
    if (context !== memberProfileContext || !$("[data-profile-dialog]").open || $("[data-dashboard]").hidden) return;
    memberProfilePrizeOffset = 0;
    await loadMemberProfile(); await refreshProfileStock();
    if (context !== memberProfileContext || !$("[data-profile-dialog]").open) return;
    $("[data-profile-assignment-status]").textContent = result.assigned ? `${result.assigned} de ${quantity} ${quantity === 1 ? "cupon asignado" : "cupones asignados"} a ${member.nick}.` : "No se asigno ningun cupon. El inventario cambio; actualiza los premios.";
    $("[data-profile-quantity]").value = "1";
  } catch (error) {
    if (context === memberProfileContext && $("[data-profile-dialog]").open) $("[data-profile-assignment-status]").textContent = error.message;
  } finally { memberProfileAssignBusy = false; if ($("[data-profile-dialog]").open) renderProfileAssignment(); }
});
function renderProfileTransfer() {
  const prize = memberProfileData?.prizes.find(p => p.id === memberProfileTransferId && p.relationship === "pending" && !p.claimed_at);
  const form = $("[data-profile-transfer-form]"), select = $("[data-profile-transfer-recipient]"), selected = select.value;
  form.hidden = !prize;
  $("[data-profile-transfer-caption]").textContent = prize ? `Pasar ${prize.label} de ${memberProfileData.member.nick} a:` : "";
  const query = $("[data-profile-transfer-search]").value.normalize("NFKC").trim().toLowerCase();
  const recipients = memberProfileRecipients.filter(m => m.nick.normalize("NFKC").toLowerCase().includes(query));
  select.innerHTML = '<option value="">Elige integrante</option>' + recipients.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("");
  select.value = recipients.some(m => m.id === selected) ? selected : "";
  const blocked = memberProfileAssignBusy || !memberProfileStockReady;
  for (const selector of ["[data-profile-transfer-search]", "[data-profile-transfer-recipient]", "[data-profile-transfer-reason]", "[data-profile-transfer-cancel]"]) $(selector).disabled = blocked;
  $("[data-profile-transfer-submit]").disabled = blocked || !prize || !select.value || !$("[data-profile-transfer-reason]").value.trim();
}
function startProfileTransfer(id) {
  if (memberProfileAssignBusy || !memberProfileData?.prizes.some(p => p.id === id && p.relationship === "pending" && !p.claimed_at)) return;
  memberProfileTransferId = id;
  $("[data-profile-transfer-reason]").value = "";
  $("[data-profile-transfer-search]").value = ""; $("[data-profile-transfer-recipient]").value = "";
  $("[data-profile-release-status]").textContent = ""; renderProfileTransfer();
  $("[data-profile-transfer-form]").scrollIntoView({ block: "nearest" });
}
$("[data-profile-transfer-search]").addEventListener("input", renderProfileTransfer);
$("[data-profile-transfer-recipient]").addEventListener("change", renderProfileTransfer);
$("[data-profile-transfer-reason]").addEventListener("input", renderProfileTransfer);
$("[data-profile-transfer-cancel]").addEventListener("click", () => { memberProfileTransferId = ""; renderProfileTransfer(); });
$("[data-profile-transfer-form]").addEventListener("submit", async event => {
  event.preventDefault();
  if (memberProfileAssignBusy || !memberProfileStockReady || !memberProfileData || $("[data-dashboard]").hidden) return;
  const prize = memberProfileData.prizes.find(p => p.id === memberProfileTransferId && p.relationship === "pending" && !p.claimed_at);
  const recipient = memberProfileRecipients.find(m => m.id === $("[data-profile-transfer-recipient]").value);
  if (!prize || !recipient || recipient.id === memberProfileId) return;
  const reason = $("[data-profile-transfer-reason]").value.trim();
  if (!reason || reason.length > 200) { $("[data-profile-release-status]").textContent = "Indica el motivo del traspaso (1 a 200 caracteres)."; return; }
  const member = { ...memberProfileData.member }, context = memberProfileContext;
  if (!confirm(`Pasar ${prize.label} de ${member.nick} a ${recipient.nick}? Se movera el mismo cupon y se conservara el historial.`)) return;
  memberProfileAssignBusy = true; renderProfileAssignment(); $("[data-profile-release-status]").textContent = "Pasando premio...";
  try {
    await rewardAdminAction("transfer", { couponId: prize.id, memberId: member.id, toMemberId: recipient.id, reason });
    if (context !== memberProfileContext || !$("[data-profile-dialog]").open || $("[data-dashboard]").hidden) return;
    memberProfileTransferId = "";
    $("[data-profile-transfer-reason]").value = "";
    memberProfileData.prizes = memberProfileData.prizes.map(p => p.id === prize.id ? { ...p, relationship: "historical" } : p);
    memberProfileData.totals = { ...memberProfileData.totals, pending: Math.max(0, memberProfileData.totals.pending - 1) };
    renderMemberProfile(memberProfileData); await loadMemberProfile();
    if (context === memberProfileContext && $("[data-profile-dialog]").open) $("[data-profile-release-status]").textContent = `Se paso ${prize.label} de ${member.nick} a ${recipient.nick}.`;
  } catch (error) {
    if (context === memberProfileContext && $("[data-profile-dialog]").open) { await loadMemberProfile(); if (context === memberProfileContext) $("[data-profile-release-status]").textContent = error.message; }
  } finally { memberProfileAssignBusy = false; if ($("[data-profile-dialog]").open) renderProfileAssignment(); }
});
async function releaseProfilePrize(id) {
  if (memberProfileAssignBusy || !memberProfileData || $("[data-dashboard]").hidden) return;
  const prize = memberProfileData.prizes.find(p => p.id === id);
  if (!prize || prize.relationship !== "pending" || prize.claimed_at) return;
  const member = { ...memberProfileData.member }, context = memberProfileContext;
  if (!confirm(`Quitar ${prize.label} a ${member.nick}? El cupon volvera al inventario y el historial se conservara.`)) return;
  memberProfileAssignBusy = true; renderProfileAssignment();
  $("[data-profile-release-status]").textContent = "Retirando premio...";
  try {
    const result = await rewardAdminAction("release", { memberId: member.id, couponIds: [prize.id] });
    if (context !== memberProfileContext || !$("[data-profile-dialog]").open || $("[data-dashboard]").hidden) return;
    if (result.changed !== 1) {
      await loadMemberProfile();
      throw new Error("No se retiro el premio: pudo haber sido reclamado o reasignado. Revisa la ficha actualizada.");
    }
    memberProfileData.prizes = memberProfileData.prizes.map(p => p.id === id ? { ...p, relationship: "historical" } : p);
    memberProfileData.totals = { ...memberProfileData.totals, pending: Math.max(0, memberProfileData.totals.pending - 1) };
    renderMemberProfile(memberProfileData);
    await loadMemberProfile();
    if (context !== memberProfileContext || !$("[data-profile-dialog]").open) return;
    await refreshProfileStock();
    if (context === memberProfileContext && $("[data-profile-dialog]").open) $("[data-profile-release-status]").textContent = `Se quito ${prize.label} a ${member.nick}. El cupon esta disponible para asignarlo de nuevo.`;
  } catch (error) {
    if (context === memberProfileContext && $("[data-profile-dialog]").open) $("[data-profile-release-status]").textContent = error.message;
  } finally { memberProfileAssignBusy = false; if ($("[data-profile-dialog]").open) renderProfileAssignment(); }
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-member-profile],[data-profile-coupon],[data-profile-release],[data-profile-transfer]");
  if (!button) return;
  if (button.hasAttribute("data-member-profile")) showMemberProfile(button.dataset.memberProfile, button);
  else if (button.hasAttribute("data-profile-release")) releaseProfilePrize(button.dataset.profileRelease);
  else if (button.hasAttribute("data-profile-transfer")) startProfileTransfer(button.dataset.profileTransfer);
  else showTrackingHistory("coupon", button.dataset.profileCoupon).catch(error => { $("[data-profile-status]").textContent = error.message; });
});
for (const button of $$("[data-profile-tab]")) {
  button.addEventListener("click", () => selectProfileTab(button.dataset.profileTab));
  button.addEventListener("keydown", event => {
    const tabs = $$("[data-profile-tab]"), index = tabs.indexOf(button);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); selectProfileTab(tabs[next].dataset.profileTab); tabs[next].focus(); }
  });
}
for (const button of $$("[data-profile-page]")) button.addEventListener("click", () => {
  if (!memberProfileData || button.disabled) return;
  const [kind, direction] = button.dataset.profilePage.split("-");
  const delta = direction === "next" ? 25 : -25;
  if (kind === "prizes") memberProfilePrizeOffset = Math.max(0, memberProfilePrizeOffset + delta);
  else memberProfileHistoryOffset = Math.max(0, memberProfileHistoryOffset + delta);
  loadMemberProfile();
});
$("[data-profile-close]").addEventListener("click", () => $("[data-profile-dialog]").close());
$("[data-profile-dialog]").addEventListener("close", () => {
  if (typeof OwnerDeliveryPreview !== 'undefined') { OwnerDeliveryPreview.cancel(); OwnerDeliveryPreview.render($("[data-profile-exact-preview]"), null); }
  memberProfileRewardState = null; memberProfileDeliveryPreview = null;
  $("[data-profile-transfer-reason]").value = "";
  memberProfileRecipients = []; memberProfileTransferId = "";
  $("[data-profile-transfer-search]").value = ""; $("[data-profile-transfer-recipient]").innerHTML = "";
  $("[data-profile-transfer-form]").hidden = true; $("[data-profile-transfer-caption]").textContent = "";
  memberProfileContext++; memberProfileStock = []; memberProfileStockReady = false;
  $("[data-profile-item]").innerHTML = ""; $("[data-profile-assignment-status]").textContent = ""; $("[data-profile-recipient]").textContent = "";
  $("[data-profile-stock-note]").textContent = "";
  $("[data-profile-release-status]").textContent = "";
  memberProfileRevision++; memberProfileId = ""; memberProfileData = null;
  if (typeof trackingDialogRevision === "number") trackingDialogRevision++;
  for (const selector of ["[data-profile-facts]", "[data-profile-prizes]", "[data-profile-history]"]) $(selector).innerHTML = "";
  $("[data-profile-title]").textContent = "Integrante"; $("[data-profile-status]").textContent = "";
  for (const selector of ["[data-profile-aliases]", "[data-profile-prize-count]", "[data-profile-prize-page]", "[data-profile-history-page]"]) $(selector).textContent = "";
  $("[data-profile-content]").hidden = true;
  if (memberProfileTrigger?.isConnected) memberProfileTrigger.focus(); memberProfileTrigger = null;
});
$("[data-logout]").addEventListener("click", () => { memberProfileRevision++; if ($("[data-profile-dialog]").open) $("[data-profile-dialog]").close(); });
