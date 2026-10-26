(() => {
  const panel = $('[data-ranking-panel]'), field = name => $(`[data-ranking-${name}]`);
  let members = [], busy = false, context = 0;
  const visible = () => !$('[data-dashboard]').hidden;
  const call = (action, body = {}) => api(`/api/admin/rewards/ranking-${action}`, { method: 'POST', body: JSON.stringify(body) });
  function selection() {
    const member = members.find(m => m.id === field('member').value);
    field('donors').checked = !!member?.donors; field('global').checked = !!member?.globalTop;
    field('save').disabled = busy || !member;
  }
  function render() {
    const chosen = field('member').value, search = field('search').value.trim().toLowerCase();
    field('member').innerHTML = '<option value="">Elige integrante</option>' + members.filter(m => (m.active || m.donors || m.globalTop) && (!search || m.nick.toLowerCase().includes(search))).map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}${m.active ? '' : ' (retirado)'}</option>`).join('');
    field('member').value = chosen;
    field('rows').innerHTML = members.filter(m => (m.donors || m.globalTop) && (!search || m.nick.toLowerCase().includes(search))).map(m => `<tr><td>${escapeHtml(m.nick)}</td><td>${m.donors ? 'Excluido' : 'Visible'}</td><td>${m.globalTop ? 'Excluido' : 'Visible'}</td><td>${escapeHtml(staffTime(m.updatedAt))}</td><td><button type="button" class="mini-button" data-ranking-restore="${escapeHtml(m.id)}"${busy ? ' disabled' : ''}>Volver a incluir</button></td></tr>`).join('') || '<tr><td colspan="5">Sin exclusiones con estos filtros.</td></tr>';
    selection();
  }
  async function run(fn) {
    if (busy || !visible()) return;
    const revision = context; busy = true; field('status').textContent = '';
    for (const node of $$('input,select,button', panel)) node.disabled = true;
    try { await fn(() => revision === context && visible()); }
    catch (error) { if (revision === context && visible()) field('status').textContent = error.message; }
    finally { if (revision === context) { busy = false; for (const node of $$('input,select,button', panel)) node.disabled = false; render(); } }
  }
  async function load(current) {
    const result = await call('state'); if (current()) { members = result.members; render(); }
  }
  field('refresh').addEventListener('click', () => run(load));
  panel.addEventListener('toggle', () => { if (panel.open && !panel.hidden) run(load); });
  field('search').addEventListener('input', render);
  field('member').addEventListener('change', selection);
  field('form').addEventListener('submit', event => {
    event.preventDefault(); const memberId = field('member').value, donors = field('donors').checked, globalTop = field('global').checked;
    if (!members.some(m => m.id === memberId)) return;
    run(async current => { await call('save', { memberId, donors, globalTop }); await load(current); if (current()) field('status').textContent = 'Guardado. Los tops se actualizaran automaticamente en un minuto; no se modificaron las donaciones.'; });
  });
  field('rows').addEventListener('click', event => {
    const button = event.target.closest('[data-ranking-restore]'); if (!button) return;
    run(async current => { await call('save', { memberId: button.dataset.rankingRestore, donors: false, globalTop: false }); await load(current); if (current()) field('status').textContent = 'Integrante habilitado nuevamente en los tops.'; });
  });
  new MutationObserver(() => {
    if (!visible()) { context++; busy = false; members = []; field('search').value = ''; field('status').textContent = ''; for (const node of $$('input,select,button', panel)) node.disabled = false; render(); }
  }).observe($('[data-dashboard]'), { attributes: true, attributeFilter: ['hidden'] });
})();
