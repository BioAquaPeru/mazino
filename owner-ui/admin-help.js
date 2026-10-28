(() => {
  const dialog = $("[data-admin-help-dialog]");
  let trigger = null;
  const authenticated = () => !$("[data-dashboard]").hidden;
  const close = () => { if (dialog.open) dialog.close(); };
  for (const button of $$("[data-admin-help]")) button.addEventListener("click", () => {
    if (!authenticated() || dialog.open) return;
    trigger = button; dialog.showModal();
  });
  $("[data-admin-help-close]").addEventListener("click", close);
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener("close", () => {
    if (authenticated() && trigger?.isConnected) trigger.focus();
    trigger = null;
  });
  $("[data-logout]").addEventListener("click", close);
  new MutationObserver(() => { if (!authenticated()) close(); }).observe($("[data-dashboard]"), { attributes: true, attributeFilter: ["hidden"] });
})();
