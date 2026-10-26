(() => {
  const section = $('[data-rewards-subsection="access-requests"]'), container = $('[data-access-requests]'), status = $('[data-requests-status]');
  let revision = 0, busy = false;
  const active = () => !$('[data-dashboard]').hidden;
  const request = (action,body={}) => api(`/api/admin/rewards/${action}`,{method:'POST',body:JSON.stringify(body)});
  async function load() {
    if (!active() || busy) return;
    const version = ++revision; status.textContent = 'Consultando solicitudes...';
    try {
      const result = await request('access-requests');
      if (!active() || version !== revision) return;
      container.innerHTML = result.requests.map(row => `<section class="prize-item"><h3>${escapeHtml(row.nick)}</h3><p><strong>${row.purpose === 'recover' ? 'Recuperacion de acceso' : 'Primer acceso'}</strong></p>${row.purpose === 'recover' ? '<p>Comprueba el codigo enviado desde ese personaje en el juego. Su clave actual sigue vigente hasta que guarde la nueva. La clave del panel de sublider no cambia.</p>' : ''}<p>Solicitada: ${escapeHtml(rewardTime(row.createdAt))}</p><p>Vence: ${escapeHtml(rewardTime(row.expiresAt))}</p>${row.status === 'approved' ? `<p>Aprobada por ${escapeHtml(row.reviewedNick)}. Esperando que el integrante cree su clave.</p>` : `<p>Codigo de esta solicitud: <code>${escapeHtml(row.code)}</code></p><form class="settings-grid" data-request-review="${escapeHtml(row.id)}"><label class="wide"><span>Codigo recibido desde ese personaje dentro del juego</span><input name="code" maxlength="11" autocomplete="off" required placeholder="MZ-XXXXXXXX" /></label><label class="switch-row wide"><input name="verifiedInGame" type="checkbox" required /><span>Confirme dentro de R2Beat que este mismo personaje me envio el codigo.</span></label><div class="editor-actions wide"><button class="primary-action small-action" type="submit">${row.purpose === 'recover' ? 'Aprobar recuperacion' : 'Aprobar identidad'}</button><button class="ghost-button" type="button" data-request-reject="${escapeHtml(row.id)}">Rechazar</button></div></form>`}</section>`).join('') || '<p class="muted">No hay solicitudes pendientes o aprobadas vigentes.</p>';
      status.textContent = `${result.requests.length} solicitudes vigentes. Las nuevas claves son privadas.`;
    } catch (error) { if (active() && version === revision) status.textContent = error.message; }
  }
  async function review(action,id,body) {
    if (!active() || busy) return;
    const version = ++revision; busy = true;
    for (const button of section.querySelectorAll('button')) button.disabled = true;
    try {
      await request(action,{requestId:id,...body});
      if (!active() || version !== revision) return;
      document.dispatchEvent(new Event('mazino-access-reviewed'));
      busy = false; await load(); status.textContent = action === 'access-approve' ? 'Aprobado. El integrante puede crear su clave en su misma pestaña durante 30 minutos.' : 'Solicitud rechazada.';
    } catch (error) { if (active() && version === revision) status.textContent = error.message; }
    finally { busy = false; for (const button of section.querySelectorAll('button')) button.disabled = false; }
  }
  section.addEventListener('submit',event => { const form = event.target.closest('[data-request-review]'); if (!form) return; event.preventDefault(); review('access-approve',form.dataset.requestReview,{code:form.elements.code.value.trim().toUpperCase(),verifiedInGame:form.elements.verifiedInGame.checked}); });
  section.addEventListener('click',event => { const button = event.target.closest('[data-request-reject]'); if (button && confirm('Rechazar esta solicitud? No cambia ningun acceso existente.')) review('access-reject',button.dataset.requestReject,{}); });
  $('[data-requests-refresh]').addEventListener('click',load);
  section.addEventListener('toggle',() => { if (section.open && !section.hidden) load(); });
  new MutationObserver(() => { if (!active()) { revision++; container.innerHTML = ''; status.textContent = ''; } }).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
})();
