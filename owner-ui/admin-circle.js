(() => {
  const panel = $('[data-circle-panel]'), field = name => $(`[data-circle-admin-${name}]`);
  let saved = null, busy = false, context = 0;
  const visible = () => !$('[data-dashboard]').hidden;
  const call = (action, body = {}) => api(`/api/admin/rewards/circle-${action}`, { method: 'POST', body: JSON.stringify(body) });
  const number = value => value.toLocaleString('es-PE');
  function render() {
    const circle = saved?.circle;
    field('summary').textContent = circle?.level != null ? `Nivel ${circle.level} | EXP actual: ${number(circle.exp)} | ${circle.nextLevel === null ? 'Sin siguiente nivel' : circle.nextExp === null ? `Nivel ${circle.nextLevel}: requisito por configurar` : `Nivel ${circle.nextLevel} requiere ${number(circle.nextExp)} EXP | Faltan ${number(circle.remaining)} EXP`}` : 'Nivel y EXP pendientes de sincronizar con R2Beat.';
    field('rows').innerHTML = saved?.levels.map(entry => `<tr><td>Nivel ${entry.level}</td><td>${number(entry.requiredExp)} EXP</td><td><button type="button" class="mini-button" data-circle-edit-level="${entry.level}"${busy ? ' disabled' : ''}><img src="/assets/board/pencil.svg" alt="" width="14" height="14" /> Editar</button> <button type="button" class="mini-button" data-circle-remove-level="${entry.level}"${busy ? ' disabled' : ''}>Quitar requisito</button></td></tr>`).join('') || '<tr><td colspan="3">Sin requisitos configurados. Puedes empezar por los niveles 3, 4 y 5.</td></tr>';
  }
  async function run(task) {
    if (busy || !visible()) return;
    const revision = context; busy = true; field('status').textContent = '';
    for (const node of $$('input,button', panel)) node.disabled = true;
    try { await task(() => revision === context && visible()); }
    catch (error) { if (revision === context && visible()) field('status').textContent = error.message; }
    finally { if (revision === context) { busy = false; for (const node of $$('input,button', panel)) node.disabled = false; render(); } }
  }
  async function load(current) {
    const result = await call('state'); if (current()) { saved = result; render(); }
  }
  async function save(current, level, requiredExp) {
    await call('save', { level, requiredExp, revision: saved.revision });
    if (!current()) return;
    field('status').textContent = 'Requisito guardado. La EXP y el faltante se consultan aqui; la portada solo muestra el nivel real. No cambiaron las donaciones.';
    try { await load(current); } catch { if (current()) { field('status').textContent = 'Requisito guardado. Actualiza la lista antes de volver a editar.'; saved = null; } }
  }
  panel.addEventListener('toggle', () => { if (panel.open && !panel.hidden) run(load); });
  field('refresh').addEventListener('click', () => run(load));
  field('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!saved) { field('status').textContent = 'Actualiza los requisitos antes de guardar.'; return; }
    const level = Number(field('level').value), requiredExp = Number(field('exp').value);
    if (!Number.isInteger(level) || level < 2 || level > 999 || !Number.isSafeInteger(requiredExp) || requiredExp < 1 || requiredExp > 1e12) { field('status').textContent = 'Revisa el nivel y una cantidad de EXP entera mayor a cero.'; return; }
    run(current => save(current, level, requiredExp));
  });
  field('rows').addEventListener('click', event => {
    const button = event.target.closest('[data-circle-edit-level],[data-circle-remove-level]'); if (!button || busy || !visible()) return;
    const level = Number(button.dataset.circleEditLevel || button.dataset.circleRemoveLevel), entry = saved?.levels.find(row => row.level === level); if (!entry) return;
    if (button.dataset.circleEditLevel) { field('level').value = String(level); field('exp').value = String(entry.requiredExp); field('exp').focus(); }
    else if (confirm(`Quitar el requisito de EXP del nivel ${level}? Se mostrara por confirmar; no cambia el juego.`)) run(current => save(current, level, null));
  });
  new MutationObserver(() => {
    if (!visible()) { context++; busy = false; saved = null; field('level').value = '3'; field('exp').value = ''; field('status').textContent = ''; for (const node of $$('input,button', panel)) node.disabled = false; render(); }
  }).observe($('[data-dashboard]'), { attributes: true, attributeFilter: ['hidden'] });
  render();
})();
