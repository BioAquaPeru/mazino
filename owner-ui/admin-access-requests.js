(() => {
  const section = $('[data-rewards-subsection="access-requests"]'), container = $('[data-access-requests]'), status = $('[data-requests-status]');
  let revision = 0, busy = false, loading = false, loaded = false;
  const active = () => !$('[data-dashboard]').hidden && section.open && !section.hidden;
  const session = () => `${typeof rewardAdminRevision === 'number' ? rewardAdminRevision : 0}:${typeof adminCircleId === 'string' ? adminCircleId : 'main'}`;
  const request = (action,body={}) => api(`/api/admin/rewards/${action}`,{method:'POST',body:JSON.stringify(body)});
  function renderRequests(requests) {
    if (!requests.length) { const empty = '<p class="muted">No hay solicitudes pendientes o aprobadas vigentes.</p>'; if (container.innerHTML !== empty) container.innerHTML = empty; return; }
    const previous = new Map(Array.from(container.children).map(node => [node.dataset.requestRow, node]));
    requests.forEach((row, index) => {
      const signature = JSON.stringify(row); let node = previous.get(row.id);
      if (!node || node.requestSignature !== signature) {
        node?.remove();
        node = document.createElement('section'); node.className = 'prize-item'; node.dataset.requestRow = row.id; node.requestSignature = signature;
        node.innerHTML = `<h3>${escapeHtml(row.nick)}</h3><p><strong>${row.purpose === 'recover' ? 'Recuperacion de acceso' : 'Primer acceso'}</strong></p>${row.purpose === 'recover' ? '<p>Comprueba el codigo enviado desde ese personaje en el juego. Su clave actual sigue vigente hasta que guarde la nueva. La clave del panel de sublider no cambia.</p>' : ''}<p>Solicitada: ${escapeHtml(rewardTime(row.createdAt))}</p><p>Vence: ${escapeHtml(rewardTime(row.expiresAt))}</p>${row.status === 'approved' ? `<p>Aprobada por ${escapeHtml(row.reviewedNick)}. Esperando que el integrante cree su clave.</p>` : `<p>Codigo de esta solicitud: <code>${escapeHtml(row.code)}</code></p><form class="settings-grid" data-request-review="${escapeHtml(row.id)}"><label class="wide"><span>Codigo recibido desde ese personaje dentro del juego</span><input name="code" maxlength="11" autocomplete="off" required placeholder="MZ-XXXXXXXX" /></label><label class="switch-row wide"><input name="verifiedInGame" type="checkbox" required /><span>Confirme dentro de R2Beat que este mismo personaje me envio el codigo.</span></label><div class="editor-actions wide"><button class="primary-action small-action" type="submit">${row.purpose === 'recover' ? 'Aprobar recuperacion' : 'Aprobar identidad'}</button><button class="ghost-button" type="button" data-request-reject="${escapeHtml(row.id)}">Rechazar</button></div></form>`}`;
      }
      if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
    });
    for (const node of Array.from(container.children)) if (!requests.some(row => row.id === node.dataset.requestRow)) node.remove();
  }
  async function load() {
    if (!active() || busy || loading) return;
    const version = ++revision, current = session(); loading = true;
    if (!loaded) status.textContent = 'Consultando solicitudes...';
    try {
      const result = await request('access-requests');
      if (!active() || version !== revision || current !== session()) return;
      renderRequests(result.requests); loaded = true;
      status.textContent = `${result.requests.length} solicitudes vigentes. Las nuevas claves son privadas.`;
    } catch (error) { if (active() && version === revision && current === session()) status.textContent = error.message; }
    finally { if (version === revision) loading = false; }
  }
  async function review(action,id,body) {
    if (!active() || busy) return;
    const version = ++revision, current = session(); busy = true;
    for (const button of section.querySelectorAll('button')) button.disabled = true;
    try {
      await request(action,{requestId:id,...body});
      if (!active() || version !== revision || current !== session()) return;
      document.dispatchEvent(new Event('mazino-access-reviewed'));
      busy = false; await load(); if (active() && current === session()) status.textContent = action === 'access-approve' ? 'Aprobado. El integrante puede crear su clave en su misma pestaña durante 30 minutos.' : 'Solicitud rechazada.';
    } catch (error) { if (active() && version === revision) status.textContent = error.message; }
    finally { busy = false; for (const button of section.querySelectorAll('button')) button.disabled = false; }
  }
  section.addEventListener('submit',event => { const form = event.target.closest('[data-request-review]'); if (!form) return; event.preventDefault(); review('access-approve',form.dataset.requestReview,{code:form.elements.code.value.trim().toUpperCase(),verifiedInGame:form.elements.verifiedInGame.checked}); });
  section.addEventListener('click',event => { const button = event.target.closest('[data-request-reject]'); if (button && confirm('Rechazar esta solicitud? No cambia ningun acceso existente.')) review('access-reject',button.dataset.requestReject,{}); });
  $('[data-requests-refresh]').addEventListener('click',load);
  section.addEventListener('toggle',() => { if (active()) { if (!loaded) load(); } else { revision++; loading = false; } });
  function reset() { revision++; loaded = loading = busy = false; container.innerHTML = ''; status.textContent = ''; }
  new MutationObserver(() => { if ($('[data-dashboard]').hidden) reset(); }).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('mazino-owner-session-cleared', reset);
  $('[data-admin-circle-select]')?.addEventListener('change', reset);
})();
