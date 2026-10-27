/* Owner uploads use the existing api hook, for local and remote authentication. */
(() => {
  const root = document.querySelector('[data-rewards-subsection="image-batches"]');
  if (!root || typeof CouponImages === 'undefined') return;
  const field = name => root.querySelector(`[data-batch-image-${name}]`);
  let page = 0, selected = null, staged = null, busy = false, revision = 0;
  const authenticated = () => !document.querySelector('[data-dashboard]')?.hidden;
  const context = () => authenticated() ? `${rewardAdminRevision}:${typeof adminCircleId === 'string' ? adminCircleId : 'main'}` : null;
  const call = async (action, body) => {
    const active = context();
    try { return await api(`/api/admin/rewards/${action}`, { method: 'POST', body: JSON.stringify(body) }); }
    catch (error) {
      if (active === context()) {
        if (error.status === 401) reset();
        else if (error.status == null) {
          // The local api hook drops HTTP status. Its existing auth-status endpoint
          // distinguishes expiry from a network/CAS error without bypassing the hook.
          try { const status = await api('/api/admin/status'); if (active === context() && status.authenticated === false) reset(); } catch { /* Preserve the original error. */ }
        }
      }
      throw error;
    }
  };
  const client = CouponImages.createClient({ context, request: ids => call('batch-image-list', { batchIds: ids }) });
  const batches = () => (rewardAdminState.batches || []).filter(batch => CouponImages.batchId(batch.id));
  const name = batch => batch.name || 'Stock anterior (sin lote)';
  const searchKey = value => String(value).normalize('NFKC').toLocaleLowerCase('es').trim();
  function controls() {
    field('save').disabled = busy || !selected || staged === null;
    field('cancel').disabled = busy;
    field('file').disabled = busy || !selected;
    field('batch').disabled = busy;
    for (const button of field('list').querySelectorAll('button[data-batch-action]')) button.disabled = busy;
  }
  function clearFile() {
    revision++; staged = null; field('file').value = ''; field('preview').replaceChildren();
    field('review').hidden = true; controls();
  }
  function choose(id) {
    if (busy) return;
    clearFile();
    const batch = batches().find(item => CouponImages.batchId(item.id) === id);
    selected = batch ? { id, version: CouponImages.version(batch.imageVersion), label: name(batch) } : null;
    field('batch').value = selected?.id || ''; field('status').textContent = '';
    field('editor').hidden = !selected;
    field('target').textContent = selected ? `Imagen de ${selected.label}` : '';
    controls();
  }
  function button(text, action, id) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'ghost-button'; node.textContent = text;
    node.dataset.batchAction = action; node.addEventListener('click', () => {
      choose(id);
      if (!selected || busy) return;
      if (action === 'remove') { staged = ''; field('review').hidden = false; field('preview').textContent = 'Se quitara la imagen de este lote al guardar.'; controls(); }
      else field('file').click();
    }); return node;
  }
  function render() {
    const all = batches(), previous = selected?.id || '';
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Elige un lote';
    field('batch').replaceChildren(placeholder, ...all.map(batch => {
      const option = document.createElement('option'); option.value = CouponImages.batchId(batch.id); option.textContent = `${name(batch)} (${batch.total} premios)`; return option;
    }));
    field('batch').value = previous;
    if (selected && !all.some(batch => CouponImages.batchId(batch.id) === selected.id)) choose('');
    const query = searchKey(field('search').value);
    const matches = all.filter(batch => searchKey(`${name(batch)} ${batch.label || ''} ${CouponImages.batchId(batch.id)}`).includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / 25)); page = Math.min(page, pages - 1);
    field('page').textContent = `Pagina ${page + 1} de ${pages} | ${matches.length} lotes`;
    field('prev').disabled = !page; field('next').disabled = page >= pages - 1;
    field('list').replaceChildren(...matches.slice(page * 25, page * 25 + 25).map(batch => {
      const id = CouponImages.batchId(batch.id), card = document.createElement('article'); card.className = 'batch-image-card';
      const image = document.createElement('span'); image.className = 'coupon-image-slot';
      if (batch.hasImage) { image.dataset.couponImageBatch = id; image.dataset.couponImageVersion = String(CouponImages.version(batch.imageVersion)); }
      else { image.classList.add('batch-image-empty'); image.textContent = 'Sin imagen'; }
      const info = document.createElement('div'), title = document.createElement('h3'), count = document.createElement('p');
      title.textContent = name(batch); count.textContent = `${batch.total} premios`; info.append(title, count);
      const actions = document.createElement('div'); actions.className = 'editor-actions'; actions.append(button(batch.hasImage ? 'Cambiar' : 'Subir', 'upload', id));
      if (batch.hasImage) actions.append(button('Quitar', 'remove', id));
      card.append(image, info, actions); return card;
    }));
    if (!matches.length) field('list').textContent = 'No hay lotes con estos filtros.';
    controls(); client.hydrate(root);
  }
  async function canonicalImage(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Elige un JPG, PNG o WebP de hasta 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    const head = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    const prefix = `data:${file.type};base64,${btoa(head)}`;
    if (!CouponImages.safeRaster(prefix)) throw new Error('El archivo no contiene una imagen JPG, PNG o WebP valida.');
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('No se pudo leer la imagen.')); image.src = url; });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('La imagen esta vacia.');
      let size = Math.max(32, Math.min(960, Math.max(image.naturalWidth, image.naturalHeight)));
      const canvas = document.createElement('canvas'), drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('El navegador no permite preparar la imagen.');
      while (size >= 32) {
        const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        drawing.fillStyle = '#ffffff'; drawing.fillRect(0, 0, canvas.width, canvas.height); drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [.82, .74, .66, .58, .5]) {
          const data = canvas.toDataURL('image/jpeg', quality);
          if (CouponImages.safeRaster(data)) return data;
        }
        size = Math.floor(size * .8);
      }
      throw new Error('No se pudo reducir la imagen. Elige una mas sencilla.');
    } finally { image.src = ''; URL.revokeObjectURL(url); }
  }
  field('file').addEventListener('change', async () => {
    const file = field('file').files[0]; clearFile();
    if (!selected || !file || busy) return;
    const current = revision, active = context(); field('status').textContent = 'Preparando vista previa...';
    try {
      const data = await canonicalImage(file);
      if (current !== revision || active !== context()) return;
      staged = data; field('preview').replaceChildren(CouponImages.thumbnail(data, selected.label)); field('review').hidden = false;
      field('status').textContent = 'Revisa la imagen y pulsa Guardar imagen para confirmar.';
    } catch (error) { if (current === revision && active === context()) field('status').textContent = error.message; }
    finally { if (current === revision) controls(); }
  });
  field('save').addEventListener('click', async () => {
    if (busy || !selected || staged === null || !authenticated()) return;
    const target = { ...selected }, imageData = staged, active = context(), current = revision;
    busy = true; controls(); field('status').textContent = 'Guardando imagen...';
    try {
      const result = await call('batch-image-save', { batchId: target.id, imageData, version: target.version });
      if (active !== context() || current !== revision) return;
      client.invalidate();
      // Only batch metadata changes. Coupon rows and history belong to the backend.
      const batch = batches().find(item => CouponImages.batchId(item.id) === target.id);
      if (batch) { batch.hasImage = Boolean(result.hasImage); batch.imageVersion = CouponImages.version(result.version); }
      selected.version = CouponImages.version(result.version);
      renderRewardAdmin();
      await refreshAdminPrizes();
      if (active === context() && current === revision) field('status').textContent = imageData ? 'Imagen guardada.' : 'Imagen quitada.';
    } catch (error) {
      if (active === context() && current === revision) {
        field('status').textContent = `${error.message} Vuelve a elegir el lote para revisar su version e intenta de nuevo.`;
        // Refresh CAS metadata without replacing a saved image with the unsaved preview.
        await refreshAdminPrizes();
      }
    } finally {
      if (active === context() && current === revision) { busy = false; clearFile(); render(); }
    }
  });
  function reset() { busy = false; selected = null; clearFile(); client.reset(); CouponImages.close(); field('editor').hidden = true; field('batch').value = ''; field('list').replaceChildren(); field('status').textContent = ''; }
  field('cancel').addEventListener('click', () => { clearFile(); field('status').textContent = 'Cambios cancelados.'; });
  field('batch').addEventListener('change', () => choose(field('batch').value));
  field('search').addEventListener('input', () => { page = 0; render(); });
  field('prev').addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
  field('next').addEventListener('click', () => { page++; render(); });
  root.addEventListener('toggle', () => { if (root.open) client.hydrate(root); else if (!busy) clearFile(); });
  document.querySelector('[data-logout]')?.addEventListener('click', reset);
  document.querySelector('[data-admin-circle-select]')?.addEventListener('change', reset);
  window.addEventListener('mazino-owner-session-cleared', reset);
  window.addEventListener('sessionexpired', reset);
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (!authenticated()) reset(); }).observe(document.querySelector('[data-dashboard]'), { attributes: true, attributeFilter: ['hidden'] });
  globalThis.renderBatchImagesManager = render;
  globalThis.hydrateOwnerCouponImages = () => client.hydrate(document);
  globalThis.ownerCouponImageMarkup = coupon => {
    const id = CouponImages.batchId(coupon.import_batch_id);
    const batch = batches().find(item => CouponImages.batchId(item.id) === id);
    return batch?.hasImage ? CouponImages.slot(id, CouponImages.version(batch.imageVersion)) : '';
  };
})();
