const audienceNames = { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Unisex', '': 'Sin clasificar' };
const defaultCategories = ['Ropa', 'Game ID', 'Fondos', 'Mascotas', 'Accesorios'];

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function options(select, placeholder, entries) {
  const previous = select.value;
  select.replaceChildren(element('option', placeholder, { value: '' }), ...entries.map(([value, label]) => element('option', label, { value })));
  if (entries.some(([value]) => value === previous)) select.value = previous;
}

function control(label, node) {
  const field = element('label', label);
  field.append(node);
  return field;
}

function button(label, className = '') {
  return element('button', label, { type: 'button', class: className });
}

export function mountCouponCatalog(container, { mode, request, onChange }) {
  const inventory = mode === 'inventory', transfer = mode === 'transfer';
  const limit = transfer ? 300 : 50;
  let data, busy = false, disposed = false, page = 0, commit = null;
  const quantities = new Map(), marked = new Set();
  const images = new Map();
  const status = element('p', '', { role: 'status', 'aria-live': 'polite' });
  const search = element('input', '', { type: 'search', placeholder: 'Premio, categoría o lote' });
  const audience = element('select'), category = element('select'), member = element('select'), space = element('select');
  const nickSearch = element('input', '', { type: 'search', placeholder: 'Buscar por nick' });
  const refresh = button('Actualizar inventario', 'catalog-secondary');
  const filters = element('div', '', { class: 'catalog-fields' });
  const list = element('div', '', { class: 'catalog-list' });
  const selection = element('div', '', { class: 'catalog-selection', 'aria-live': 'polite' });
  const previous = button('Anterior', 'catalog-secondary'), next = button('Siguiente', 'catalog-secondary');
  const pagination = element('div', '', { class: 'catalog-pagination' });
  const pageLabel = element('span');
  pagination.append(previous, pageLabel, next);
  const apply = button(inventory ? 'Guardar clasificación' : 'Revisar entrega', 'catalog-primary');
  const editAudience = element('select'), editCategory = element('input', '', { maxlength: '60', placeholder: 'Ej. Ropa, Game ID, Fondos' });
  const suggestions = element('datalist');
  suggestions.id = 'catalog-categories-' + crypto.randomUUID();
  editCategory.setAttribute('list', suggestions.id);
  const dialog = element('dialog', '', { class: 'catalog-dialog', 'aria-label': transfer ? 'Confirmar envío de cupo' : 'Confirmar entrega' });
  const review = element('div'), cancel = button('Volver a editar', 'catalog-secondary');
  const confirm = button(transfer ? 'Confirmar envío' : 'Confirmar entrega', 'catalog-primary');
  const dialogStatus = element('p', '', { role: 'status' });
  const dialogActions = element('div', '', { class: 'catalog-actions' });
  dialogActions.append(cancel, confirm);
  dialog.append(review, dialogStatus, dialogActions);
  const classify = element('div', '', { class: 'catalog-fields' });
  classify.append(control('Clasificar como', editAudience), control('Categoría nueva o existente', editCategory), suggestions);
  const roleOptions = Object.entries(audienceNames).filter(([key]) => key);
  options(audience, 'Todos', [...roleOptions, ['unclassified', 'Sin clasificar']]);
  options(editAudience, 'Elige grupo', [...roleOptions, ['unclassified', 'Quitar clasificación']]);
  filters.append(control('Buscar', search), control('Hombre, Mujer o Unisex', audience), control('Categoría', category));
  const destination = element('div', '', { class: 'catalog-fields' });
  if (transfer) destination.append(control('Círculo de destino', space));
  if (!inventory) destination.append(control('Buscar destinatario', nickSearch), control(transfer ? 'Líder o sublíder' : 'Entregar a', member));
  const panel = element('div', '', { class: 'coupon-catalog' });
  panel.append(element('h3', inventory ? 'Clasificar inventario' : transfer ? 'Enviar varios premios al cupo' : 'Entregar varios premios'));
  panel.append(element('p', inventory
    ? 'Marca uno o varios lotes y elige el grupo y la categoría. Los cupones anteriores aparecen como Sin clasificar.'
    : 'Elige el destinatario y escribe una cantidad junto a cada premio. Los filtros conservan tu selección.'));
  panel.append(refresh, destination, filters, list, pagination, selection);
  if (inventory) panel.append(classify);
  panel.append(apply, status, dialog);
  container.replaceChildren(panel);

  function selectedGroups() {
    return (data?.groups || []).filter(group => inventory ? marked.has(group.key) : quantities.has(group.key));
  }

  function renderSelection() {
    const selected = selectedGroups();
    selection.replaceChildren();
    if (inventory) {
      const count = selected.reduce((sum, group) => sum + group.ids.length, 0);
      selection.textContent = count ? `${count} cupones marcados en ${selected.length} filas.` : 'Marca los premios que quieres clasificar.';
      apply.disabled = busy || !count || count > 5000 || !editAudience.value;
      return;
    }
    const total = selected.reduce((sum, group) => sum + quantities.get(group.key), 0);
    const invalid = selected.some(group => quantities.get(group.key) > group.availableIds.length);
    selection.append(element('strong', `Lista de entrega · ${total} cupones en ${selected.length} filas`));
    for (const group of selected) {
      const row = element('div', '', { class: 'catalog-line' });
      const remove = button('Quitar', 'catalog-secondary');
      remove.disabled = busy;
      remove.addEventListener('click', () => { quantities.delete(group.key); render(); });
      row.append(element('span', `${quantities.get(group.key)} × ${group.label} · ${group.batchName}`), remove);
      selection.append(row);
    }
    if (invalid || total > limit) selection.append(element('p', invalid ? 'Ajusta las cantidades al stock disponible.' : `Máximo ${limit} cupones por entrega.`));
    apply.disabled = busy || !member.value || !total || total > limit || invalid;
  }

  function loadPageImages(groups) {
    const batchIds = [...new Set(groups.filter(group => group.hasImage && !images.has(group.batchId)).map(group => group.batchId))];
    if (!batchIds.length) return;
    const response = Promise.resolve().then(() => request('images', { batchIds })).then(result => new Map(
      result.images.filter(row => /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(row.imageData || ''))
        .map(row => [row.batchId, row.imageData]),
    )).catch(() => new Map());
    for (const batchId of batchIds) images.set(batchId, response.then(rows => rows.get(batchId)));
  }

  function render() {
    if (!data) return;
    const term = search.value.trim().toLocaleLowerCase('es');
    const matches = data.groups.filter(group =>
      (inventory || group.availableIds.length || quantities.has(group.key)) &&
      (!audience.value || group.audience === (audience.value === 'unclassified' ? '' : audience.value)) &&
      (!category.value || group.category === category.value) &&
      `${group.label} ${group.category} ${group.batchName}`.toLocaleLowerCase('es').includes(term));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / 20) - 1));
    list.replaceChildren();
    const visibleGroups = matches.slice(page * 20, page * 20 + 20);
    loadPageImages(visibleGroups);
    for (const group of visibleGroups) {
      const card = element('div', '', { class: 'catalog-line' });
      const title = element('div');
      title.append(element('strong', group.label),
        element('small', `${audienceNames[group.audience]} · ${group.category || 'Sin categoría'} · ${group.batchName}`),
        element('small', inventory ? `${group.ids.length} cupones en esta fila` : `${group.availableIds.length} disponibles`));
      if (group.hasImage) {
        const thumbnail = element('div', '', { class: 'catalog-image-slot' });
        thumbnail.append(element('small', 'Cargando imagen…'));
        images.get(group.batchId).then(source => {
          if (!thumbnail.isConnected || disposed) return;
          thumbnail.replaceChildren(source
            ? element('img', '', { src: source, alt: group.label, class: 'catalog-image', decoding: 'async' })
            : element('small', 'Imagen no disponible'));
        });
        title.append(thumbnail);
      }
      const input = element('input', '', inventory ? { type: 'checkbox' } : {
        type: 'number', min: '0', max: String(Math.min(limit, group.availableIds.length)), step: '1', inputmode: 'numeric',
      });
      input.setAttribute('aria-label', `${inventory ? 'Marcar' : 'Cantidad de'} ${group.label} · ${group.batchName}`);
      input.disabled = busy;
      if (inventory) {
        input.checked = marked.has(group.key);
        input.addEventListener('change', () => {
          if (input.checked) marked.add(group.key); else marked.delete(group.key);
          renderSelection();
        });
      } else {
        input.value = quantities.get(group.key) || '';
        input.placeholder = '0';
        input.addEventListener('input', () => {
          const value = input.valueAsNumber;
          if (Number.isInteger(value) && value > 0) quantities.set(group.key, value); else quantities.delete(group.key);
          renderSelection();
        });
      }
      card.append(title, control(inventory ? 'Marcar' : 'Cantidad', input));
      list.append(card);
    }
    if (!matches.length) list.append(element('p', 'No hay premios con estos filtros.'));
    previous.disabled = busy || page === 0;
    next.disabled = busy || (page + 1) * 20 >= matches.length;
    pageLabel.textContent = `Página ${page + 1} · ${matches.length} filas`;
    renderSelection();
  }

  function recipients() {
    if (!data) return;
    const selectedSpace = data.spaces?.find(row => row.id === space.value);
    const people = transfer ? selectedSpace?.staff || [] : data.members;
    const nick = nickSearch.value.trim().toLocaleLowerCase('es');
    options(member, transfer ? 'Elige líder o sublíder' : 'Elige integrante', people.filter(person =>
      person.id === member.value || person.nick.toLocaleLowerCase('es').includes(nick)).map(person => [
      person.id, transfer ? `${person.nick} · ${selectedSpace.name}` : person.nick,
    ]));
    renderSelection();
  }

  async function load() {
    if (busy || disposed) return;
    busy = refresh.disabled = true;
    status.textContent = 'Cargando inventario…';
    renderSelection();
    try {
      const result = await request('state', {});
      if (disposed) return;
      data = result;
      images.clear();
      const categories = [...new Set(data.groups.map(group => group.category).filter(Boolean))].sort();
      options(category, 'Todas', categories.map(name => [name, name]));
      suggestions.replaceChildren(...[...new Set([...defaultCategories, ...categories])].map(name => element('option', '', { value: name })));
      if (transfer) options(space, 'Elige círculo', data.spaces.map(row => [row.id, row.name]));
      recipients();
      status.textContent = '';
    } catch (error) {
      if (!disposed) status.textContent = error.message;
    } finally {
      busy = refresh.disabled = false;
      if (!disposed) render();
    }
  }

  async function run(action, resultText) {
    busy = refresh.disabled = confirm.disabled = cancel.disabled = true;
    renderSelection();
    try {
      const result = await action();
      if (disposed) return;
      dialog.close();
      quantities.clear();
      marked.clear();
      busy = false;
      await load();
      status.textContent = resultText(result);
      try { await onChange?.(); } catch { /* The saved operation remains confirmed. */ }
    } catch (error) {
      if (!disposed) (dialog.open ? dialogStatus : status).textContent = error.message;
    } finally {
      busy = refresh.disabled = confirm.disabled = cancel.disabled = false;
      if (!disposed) render();
    }
  }

  async function prepare() {
    if (busy || apply.disabled) return;
    const selected = selectedGroups();
    if (inventory) {
      const audience = editAudience.value === 'unclassified' ? '' : editAudience.value;
      const body = { ids: selected.flatMap(group => group.ids), audience, category: audience ? editCategory.value : '' };
      if (body.audience && !body.category.trim()) { editCategory.focus(); status.textContent = 'Escribe la categoría.'; return; }
      return run(() => request('classify', body), result => `Clasificación guardada para ${result.changed} cupones.`);
    }
    const targetSpace = data.spaces?.find(row => row.id === space.value);
    const target = (transfer ? targetSpace?.staff : data.members)?.find(person => person.id === member.value);
    if (!target) return;
    const lines = selected.map(group => ({ key: group.key, ids: group.availableIds.slice(0, quantities.get(group.key)) }));
    const count = lines.reduce((sum, line) => sum + line.ids.length, 0);
    const body = { lines, memberId: target.id, nick: target.nick, spaceId: space.value, staffId: target.id };
    busy = true;
    renderSelection();
    try {
      const plan = transfer ? await request('preview', body) : null;
      if (disposed) return;
      commit = () => transfer ? request('confirm', { id: plan.id, confirmed: true }) : request('assign', body);
      review.replaceChildren(element('h3', transfer ? 'Confirmar envío de cupo' : 'Confirmar entrega'),
        element('p', `${count} cupones para ${target.nick} en ${plan?.circle || data.circleName}`));
      for (const [index, group] of selected.entries()) review.append(element('p', `${lines[index].ids.length} × ${group.label} · ${group.batchName}`));
      if (transfer) review.append(element('p', 'El cupo queda disponible para repartir en el círculo elegido.'));
      dialogStatus.textContent = '';
      dialog.showModal();
    } catch (error) {
      if (!disposed) status.textContent = error.message;
    } finally {
      busy = false;
      if (!disposed) renderSelection();
    }
  }

  for (const filter of [search, audience, category]) filter.addEventListener('input', () => { page = 0; render(); });
  previous.addEventListener('click', () => { page--; render(); });
  next.addEventListener('click', () => { page++; render(); });
  refresh.addEventListener('click', load);
  member.addEventListener('change', renderSelection);
  editAudience.addEventListener('change', renderSelection);
  nickSearch.addEventListener('input', recipients);
  space.addEventListener('change', () => { member.value = ''; recipients(); });
  apply.addEventListener('click', prepare);
  cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  confirm.addEventListener('click', () => {
    if (busy || !commit) return;
    void run(commit, result => `${result.assigned ?? result.changed} cupones ${transfer ? 'enviados' : 'entregados'} correctamente.`);
  });
  apply.disabled = true;
  void load();
  return () => { disposed = true; dialog.close(); container.replaceChildren(); };
}
