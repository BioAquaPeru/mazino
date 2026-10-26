(() => {
  const dialog = $('[data-event-edit-dialog]'), form = $('[data-event-edit-form]');
  const status = $('[data-event-edit-status]'), submit = form.querySelector('[type="submit"]');
  let selected = null, trigger = null, revision = 0, saving = false;
  const authenticated = () => !$('[data-dashboard]').hidden;
  const close = () => { revision++; selected = null; if (dialog.open) dialog.close(); };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-reward-event]');
    if (!button || !authenticated() || saving || rewardAdminBusy || dialog.open) return;
    const item = rewardAdminState?.events.find(entry => entry.id === button.dataset.editRewardEvent);
    if (!item) return;
    revision++; trigger = button;
    selected = { eventId: item.id, startsAt: item.starts_at, original: { title: item.title, endsAt: item.ends_at ?? item.starts_at + 86400000, status: item.status } };
    form.elements.title.value = item.title;
    form.elements.endsAt.value = new Date(selected.original.endsAt - 5 * 3600000).toISOString().slice(0, 19);
    $('[data-event-edit-info]').textContent = `${item.status === 'closed' ? 'Cerrado' : item.starts_at > Date.now() ? 'Programado' : 'Activo'} | Apertura: ${rewardTime(item.starts_at)}`;
    $('[data-event-edit-warning]').textContent = item.status === 'closed' ? 'Seguira cerrado: no se reabre ni se vuelven a reservar premios. La clave y los ganadores se conservan. El cambio quedara en Actividad.' : 'Se conservaran la apertura, la clave y los premios. Los cambios quedaran en Actividad.';
    status.textContent = ''; submit.disabled = false; dialog.showModal();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected || saving || !authenticated()) return;
    const snapshot = selected, current = revision, session = rewardAdminRevision;
    const title = form.elements.title.value.trim();
    const initialEnd = new Date(snapshot.original.endsAt - 5 * 3600000).toISOString().slice(0, 19);
    const endsAt = form.elements.endsAt.value === initialEnd ? snapshot.original.endsAt : Date.parse(`${form.elements.endsAt.value}-05:00`);
    if (!title || title.length > 80 || !Number.isSafeInteger(endsAt) || endsAt <= snapshot.startsAt || (snapshot.original.status === 'active' && endsAt <= Date.now())) {
      status.textContent = 'Revisa el nombre y un termino posterior a la apertura; si sigue abierto, debe ser futuro (Peru).'; return;
    }
    saving = true; submit.disabled = true; status.textContent = 'Guardando...';
    try {
      await rewardAdminAction('event-edit', { eventId: snapshot.eventId, title, endsAt, original: snapshot.original });
      if (current !== revision || session !== rewardAdminRevision || !authenticated()) return;
      close(); rewardStatus('Evento actualizado. La clave y los premios no cambiaron. Cambio registrado en Actividad.');
    } catch (error) {
      if (current === revision && session === rewardAdminRevision && authenticated()) status.textContent = error.message;
    } finally { saving = false; submit.disabled = false; }
  });
  $('[data-event-edit-close]').addEventListener('click', close);
  $('[data-event-edit-cancel]').addEventListener('click', close);
  dialog.addEventListener('close', () => { revision++; selected = null; form.reset(); status.textContent = ''; if (authenticated() && trigger?.isConnected) trigger.focus(); trigger = null; });
  $('[data-logout]').addEventListener('click', close);
  new MutationObserver(() => { if (!authenticated()) close(); }).observe($('[data-dashboard]'), { attributes: true, attributeFilter: ['hidden'] });
})();
