let pendingActionRows = [], pendingTransferPrize = null, pendingActionBusy = false, pendingActionContext = 0;
const pendingActionStatus = message => { $("[data-pending-action-status]").textContent = message; };
function pendingActionButtons(prize) {
  const disabled = pendingActionBusy ? " disabled" : "";
  return `<button type="button" class="mini-button" data-pending-release="${escapeHtml(prize.id)}"${disabled}><img src="/assets/guides/icon-close.svg" width="14" height="14" alt="" />Quitar premio</button><button type="button" class="mini-button" data-pending-transfer="${escapeHtml(prize.id)}"${disabled}><img src="/assets/admin/users.svg" width="14" height="14" alt="" />Traspasar</button>`;
}
function closePendingTransfer() {
  pendingTransferPrize = null;
  for (const field of ["search", "recipient", "reason"]) $(`[data-pending-transfer-${field}]`).value = "";
  $("[data-pending-transfer-caption]").textContent = ""; $("[data-pending-transfer-form]").hidden = true;
}
function pendingRowsUpdated(entries) {
  pendingActionRows = entries;
  if (pendingTransferPrize && !entries.some(p => p.id === pendingTransferPrize.id && p.memberId === pendingTransferPrize.memberId)) closePendingTransfer();
}
function renderPendingTransfer() {
  const select = $("[data-pending-transfer-recipient]"), selected = select.value;
  const search = $("[data-pending-transfer-search]").value.normalize("NFKC").trim().toLowerCase();
  const recipients = (rewardAdminState.members || []).filter(m => m.active && m.id !== pendingTransferPrize?.memberId && m.nick.normalize("NFKC").toLowerCase().includes(search));
  select.innerHTML = '<option value="">Elige integrante</option>' + recipients.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("");
  select.value = recipients.some(m => m.id === selected) ? selected : "";
  $("[data-pending-transfer-submit]").disabled = pendingActionBusy || !select.value || !$("[data-pending-transfer-reason]").value.trim();
}
function pendingActionControls(busy) {
  pendingActionBusy = busy;
  for (const selector of ["[data-pending-search]", "[data-pending-days]", "[data-pending-membership]", "[data-pending-clear]", '[data-pending-form] button[type="submit"]', "[data-pending-transfer-search]", "[data-pending-transfer-recipient]", "[data-pending-transfer-reason]", "[data-pending-transfer-cancel]"]) $(selector).disabled = busy;
  for (const button of $$("[data-pending-release],[data-pending-transfer]")) button.disabled = busy;
  if (busy) { $("[data-pending-prev]").disabled = true; $("[data-pending-next]").disabled = true; }
  renderPendingTransfer();
}
function startPendingTransfer(id) {
  if (pendingActionBusy || $("[data-dashboard]").hidden) return;
  const prize = pendingActionRows.find(p => p.id === id);
  if (!prize) return;
  closePendingTransfer(); pendingTransferPrize = { ...prize };
  $("[data-pending-transfer-caption]").textContent = `Traspasar ${prize.label} de ${prize.nick}`;
  $("[data-pending-transfer-form]").hidden = false;
  pendingActionStatus(""); renderPendingTransfer();
  $("[data-pending-transfer-form]").scrollIntoView({ block: "nearest" });
}
async function changePendingAward(action, prize, recipient, reason) {
  if (pendingActionBusy || $("[data-dashboard]").hidden) return;
  const confirmation = action === "release" ? `Quitar ${prize.label} a ${prize.nick}? El cupon volvera al inventario y se conservara el historial.` : `Traspasar ${prize.label} de ${prize.nick} a ${recipient.nick}? Motivo: ${reason}`;
  if (!confirm(confirmation)) return;
  const context = pendingActionContext;
  pendingActionControls(true); pendingActionStatus(action === "release" ? "Retirando premio..." : "Traspasando premio...");
  let message;
  try {
    const result = await rewardAdminAction(action, action === "release" ? { memberId: prize.memberId, couponIds: [prize.id] } : { couponId: prize.id, memberId: prize.memberId, toMemberId: recipient.id, reason });
    if (action === "release" && result.changed !== 1) throw new Error("No se retiro el premio: pudo haber sido reclamado o reasignado. Revisa la lista actualizada.");
    message = action === "release" ? `Se quito ${prize.label} a ${prize.nick}.` : `Se traspaso ${prize.label} de ${prize.nick} a ${recipient.nick}.`;
    if (context === pendingActionContext) closePendingTransfer();
  } catch (error) { message = error.message; }
  finally {
    pendingActionControls(false);
    if (!$("[data-dashboard]").hidden) {
      await refreshPendingAwards(); refreshDailySummary();
      if (context === pendingActionContext) pendingActionStatus(message);
    }
  }
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-pending-release],[data-pending-transfer]");
  if (!button || pendingActionBusy) return;
  if (button.hasAttribute("data-pending-transfer")) startPendingTransfer(button.dataset.pendingTransfer);
  else {
    const prize = pendingActionRows.find(p => p.id === button.dataset.pendingRelease);
    if (prize) changePendingAward("release", { ...prize });
  }
});
for (const [field, event] of [["search", "input"], ["recipient", "change"], ["reason", "input"]]) $(`[data-pending-transfer-${field}]`).addEventListener(event, renderPendingTransfer);
$("[data-pending-transfer-form]").addEventListener("submit", event => {
  event.preventDefault();
  if (!pendingTransferPrize || pendingActionBusy) return;
  const recipient = rewardAdminState.members.find(m => m.active && m.id !== pendingTransferPrize.memberId && m.id === $("[data-pending-transfer-recipient]").value);
  const reason = $("[data-pending-transfer-reason]").value.trim();
  if (!recipient || !reason || reason.length > 200) { pendingActionStatus("Elige otro integrante y un motivo de 1 a 200 caracteres."); return; }
  changePendingAward("transfer", { ...pendingTransferPrize }, { ...recipient }, reason);
});
$("[data-pending-transfer-cancel]").addEventListener("click", () => { if (!pendingActionBusy) closePendingTransfer(); });
function invalidatePendingAction() { pendingActionContext++; closePendingTransfer(); pendingActionStatus(""); }
for (const [field, event] of [["search", "input"], ["days", "change"], ["membership", "change"], ["clear", "click"]]) $(`[data-pending-${field}]`).addEventListener(event, invalidatePendingAction);
$('[data-rewards-subsection="pending"]').addEventListener("toggle", event => { if (!event.target.open) invalidatePendingAction(); });
$("[data-logout]").addEventListener("click", () => { invalidatePendingAction(); pendingActionRows = []; });
