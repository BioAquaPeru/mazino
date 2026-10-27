/* Shared raster-only thumbnails. Image data and credentials never enter HTML markup. */
(() => {
  const clients = new Set();
  let viewer, fullImage, caption, zoom;
  const batchId = value => value == null ? '__legacy__' : typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
  const version = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function safeRaster(value) {
    if (typeof value !== 'string' || value.length > 180000) return '';
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4) return '';
    try {
      const head = atob(match[2].slice(0, 32));
      const valid = match[1] === 'jpeg' ? head.startsWith('\xff\xd8\xff')
        : match[1] === 'png' ? head.startsWith('\x89PNG\r\n\x1a\n')
          : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
      return valid ? value : '';
    } catch { return ''; }
  }
  function closeViewer() { if (viewer?.open) viewer.close(); }
  function open(data, label = 'Imagen del premio') {
    data = safeRaster(data);
    if (!data) return;
    if (!viewer) {
      viewer = document.createElement('dialog'); viewer.className = 'coupon-image-dialog';
      viewer.setAttribute('aria-label', 'Imagen ampliada del premio');
      const header = document.createElement('header');
      caption = document.createElement('h2');
      const close = document.createElement('button'); close.type = 'button'; close.className = 'ghost-button'; close.textContent = 'Cerrar';
      close.addEventListener('click', closeViewer);
      zoom = document.createElement('button'); zoom.type = 'button'; zoom.className = 'ghost-button'; zoom.textContent = 'Ampliar'; zoom.setAttribute('aria-pressed', 'false');
      const viewport = document.createElement('div'); viewport.className = 'coupon-image-viewport';
      fullImage = document.createElement('img'); fullImage.alt = ''; fullImage.draggable = false;
      zoom.addEventListener('click', () => {
        const enlarged = viewport.classList.toggle('is-zoomed');
        zoom.setAttribute('aria-pressed', String(enlarged)); zoom.textContent = enlarged ? 'Ajustar' : 'Ampliar';
      });
      header.append(caption, zoom, close); viewport.append(fullImage); viewer.append(header, viewport); document.body.append(viewer);
      viewer.addEventListener('close', () => { fullImage.removeAttribute('src'); caption.textContent = ''; viewport.classList.remove('is-zoomed'); zoom.setAttribute('aria-pressed', 'false'); zoom.textContent = 'Ampliar'; });
      viewer.addEventListener('click', event => { event.stopPropagation(); if (event.target === viewer) closeViewer(); });
      // Native dialog handles Escape and focus restoration, including on mobile.
    }
    caption.textContent = String(label); fullImage.src = data;
    if (!viewer.open) viewer.showModal();
  }
  function thumbnail(data, label = 'Imagen del premio') {
    data = safeRaster(data);
    if (!data) return null;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'coupon-image-thumb';
    button.setAttribute('aria-label', `Ampliar: ${String(label)}`);
    const image = document.createElement('img'); image.alt = String(label); image.loading = 'lazy'; image.decoding = 'async'; image.src = data;
    image.addEventListener('error', () => { button.hidden = true; }, { once: true });
    button.append(image);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(data, label); });
    return button;
  }
  function slot(id, imageVersion) {
    id = batchId(id);
    return id ? `<span class="coupon-image-slot" data-coupon-image-batch="${id}"${imageVersion === undefined ? '' : ` data-coupon-image-version="${version(imageVersion)}"`}></span>` : '';
  }
  function createClient({ context, request }) {
    let key, epoch = 0, scheduled = false;
    const cache = new Map(), waiting = new Map(), inflight = new Map(), watched = new Set(), owned = new Set();
    const clearSlot = node => node.replaceChildren();
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); watched.delete(entry.target); enqueue(entry.target); }
    }) : null;
    function reset() {
      epoch++; key = undefined; cache.clear(); waiting.clear(); inflight.clear();
      observer?.disconnect(); watched.clear();
      for (const node of owned) clearSlot(node);
      owned.clear();
    }
    function current() {
      const next = context();
      if (next !== key) { reset(); key = next; }
      return next;
    }
    function expected(node) { return node.dataset.couponImageVersion === undefined ? undefined : version(Number(node.dataset.couponImageVersion)); }
    function paint(node, item) {
      if (!node.isConnected || (expected(node) !== undefined && expected(node) !== item.version)) return;
      const button = thumbnail(item.imageData); node.replaceChildren(...(button ? [button] : []));
    }
    function enqueue(node) {
      if (!current() || !owned.has(node) || !node.isConnected) return;
      const id = batchId(node.dataset.couponImageBatch); if (!id) return;
      const cached = cache.get(id);
      if (cached && (expected(node) === undefined || expected(node) === cached.version)) { paint(node, cached); return; }
      const pending = inflight.get(id) || waiting.get(id);
      if (pending) pending.add(node); else waiting.set(id, new Set([node]));
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    }
    async function flush() {
      scheduled = false;
      const active = current(), revision = epoch;
      if (!active) return;
      const groups = [...waiting]; waiting.clear();
      for (const [id, nodes] of groups) inflight.set(id, nodes);
      for (let offset = 0; offset < groups.length; offset += 20) {
        if (revision !== epoch || active !== current()) return;
        const group = groups.slice(offset, offset + 20), ids = group.map(([id]) => id);
        const requested = new Map(group.flatMap(([, nodes]) => [...nodes].map(node => [node, expected(node)]))), retry = [];
        try {
          const result = await request(ids);
          if (active !== current() || revision !== epoch) return;
          const images = new Map((Array.isArray(result.images) ? result.images : []).filter(item => item && ids.includes(batchId(item.batchId))).map(item => [batchId(item.batchId), item]));
          for (const [id, nodes] of group) {
            const item = images.get(id);
            // Missing/invalid entries stay empty without borrowing another batch's photo.
            const entry = { imageData: safeRaster(item?.imageData), version: version(item?.version) };
            cache.set(id, entry);
            for (const node of nodes) {
              paint(node, entry);
              // A newer DTO can arrive while this batch's older request is pending.
              // Fetch once for those new expectations; don't loop on stale metadata.
              if (node.isConnected && expected(node) > entry.version && (!requested.has(node) || requested.get(node) !== expected(node))) retry.push(node);
            }
          }
        } catch (error) {
          if (active !== current() || revision !== epoch) return;
          if (error.status === 401) { reset(); closeViewer(); return; }
        } finally {
          if (revision === epoch) {
            for (const id of ids) inflight.delete(id);
            for (const node of retry) enqueue(node);
          }
        }
      }
    }
    function hydrate(root = document) {
      if (!current()) return;
      for (const node of root.querySelectorAll('[data-coupon-image-batch]')) {
        owned.add(node);
        const item = cache.get(batchId(node.dataset.couponImageBatch));
        if (item && (expected(node) === undefined || expected(node) === item.version)) paint(node, item);
        else if (observer) { if (!watched.has(node)) { watched.add(node); observer.observe(node); } }
        else enqueue(node);
      }
      for (const node of watched) if (!node.isConnected) { observer.unobserve(node); watched.delete(node); }
      for (const node of owned) if (!node.isConnected) owned.delete(node);
    }
    const client = { hydrate, reset, invalidate: reset }; clients.add(client); return client;
  }
  const resetAll = () => { for (const client of clients) client.reset(); closeViewer(); };
  window.addEventListener('pagehide', resetAll);
  window.addEventListener('mazino-owner-session-cleared', resetAll);
  window.addEventListener('sessionexpired', resetAll);
  document.addEventListener('change', event => { if (event.target.matches?.('[data-admin-circle-select]')) resetAll(); }, true);
  globalThis.CouponImages = { batchId, version, safeRaster, thumbnail, slot, open, close: closeViewer, createClient, resetAll };
})();
