/* Exact owner delivery snapshots. Images never select or assign a coupon. */
(() => {
  let epoch = 0, pending = null, closing = 0;
  const field = name => document.querySelector(`[data-delivery-confirm-${name}]`);
  const dialog = field('dialog');
  const batchId = coupon => coupon.import_batch_id == null ? '__legacy__' : String(coupon.import_batch_id);
  const context = () => `${epoch}:${rewardAdminRevision}:${typeof adminCircleId === 'string' ? adminCircleId : 'main'}`;
  const authenticated = () => !document.querySelector('[data-dashboard]')?.hidden;
  // Explicit owner inventory selection can deliver a staff-pool coupon too.
  // Direct/profile callers retain their existing free-stock filters.
  const eligible = coupon => coupon?.status === 'available' && !coupon.event_id && !coupon.assigned_member_id && !coupon.claimed_by;
  function batchMetadata(state, id) {
    const batch = (state.batches || []).find(item => (item.id == null ? '__legacy__' : String(item.id)) === id);
    return { name: batch?.name || (id === '__legacy__' ? 'Stock anterior (sin lote)' : `Lote ${id}`), hasImage: Boolean(batch?.hasImage), imageVersion: Number.isSafeInteger(batch?.imageVersion) && batch.imageVersion >= 0 ? batch.imageVersion : 0 };
  }
  const stale = () => new Error('La entrega cambio mientras la revisabas. Vuelve a elegir el premio y confirma la nueva vista previa.');
  function groupCoupons(state, coupons) {
    const groups = new Map();
    for (const coupon of coupons) {
      const id = batchId(coupon);
      if (!groups.has(id)) groups.set(id, { id, ...batchMetadata(state, id), count: 0, labels: new Map(), coupon: Object.freeze({ import_batch_id: coupon.import_batch_id ?? null }) });
      const group = groups.get(id); group.count++; group.labels.set(coupon.label, (group.labels.get(coupon.label) || 0) + 1);
    }
    return Object.freeze([...groups.values()].map(group => Object.freeze({ ...group, labels: Object.freeze([...group.labels].map(entry => Object.freeze(entry))) })));
  }
  function create(member, coupons, options = {}) {
    if (!member?.id || !Array.isArray(coupons) || !coupons.length || coupons.length > 50 || new Set(coupons.map(coupon => coupon.id)).size !== coupons.length) throw new Error('Elige un destinatario y entre 1 y 50 cupones distintos.');
    const getState = options.getState || (() => rewardAdminState), state = getState();
    const entries = coupons.map(coupon => {
      const id = batchId(coupon);
      return Object.freeze({ id: coupon.id, label: coupon.label, batchId: id, createdAt: coupon.created_at ?? null, staffOwnerId: coupon.staff_owner_id ?? null });
    });
    const snapshot = Object.freeze({
      member: Object.freeze({ id: member.id, nick: member.nick, loginEnabled: member.loginEnabled }),
      coupons: Object.freeze(entries), couponIds: Object.freeze(entries.map(coupon => coupon.id)),
      groups: groupCoupons(state, coupons),
      context: context(), source: options.source || 'main', getState, valid: options.valid || (() => true),
    });
    validate(snapshot); return snapshot;
  }
  function validate(snapshot) {
    if (!authenticated() || snapshot.context !== context() || !snapshot.valid()) throw stale();
    const state = snapshot.getState(), member = state.members?.find(item => item.id === snapshot.member.id);
    if (!member?.active || member.nick !== snapshot.member.nick) throw stale();
    const coupons = new Map((state.coupons || []).map(coupon => [coupon.id, coupon]));
    for (const entry of snapshot.coupons) {
      const current = coupons.get(entry.id);
      if (!eligible(current) || current.label !== entry.label || batchId(current) !== entry.batchId || (current.created_at ?? null) !== entry.createdAt || (current.staff_owner_id ?? null) !== entry.staffOwnerId) throw stale();
    }
    for (const group of snapshot.groups) {
      const current = batchMetadata(state, group.id);
      if (current.name !== group.name || current.hasImage !== group.hasImage || current.imageVersion !== group.imageVersion) throw stale();
    }
    return snapshot;
  }
  function render(target, snapshot) {
    if (!target) return;
    target.replaceChildren();
    if (!snapshot) { target.hidden = true; return; }
    target.hidden = false;
    const recipient = document.createElement('p'); recipient.className = 'exact-delivery-recipient'; recipient.textContent = `Destinatario: ${snapshot.member?.nick || 'Elige un integrante'} | ${snapshot.couponIds.length} cupones`;
    target.append(recipient);
    const list = document.createElement('div'); list.className = 'exact-delivery-lots';
    for (const group of snapshot.groups) {
      const card = document.createElement('section'); card.className = 'exact-delivery-lot';
      const title = document.createElement('h4'); title.textContent = group.name;
      const count = document.createElement('p'); count.textContent = group.labels.map(([label, total]) => `${total} x ${label}`).join(', ');
      const image = document.createElement('div'); image.className = 'exact-delivery-image';
      if (group.hasImage && typeof CouponImages !== 'undefined') {
        image.innerHTML = typeof ownerCouponImageMarkup === 'function' ? ownerCouponImageMarkup(group.coupon) : '';
        let slot = image.querySelector('[data-coupon-image-batch]');
        if (!slot || slot.dataset.couponImageBatch !== group.id) { image.innerHTML = CouponImages.slot(group.id, group.imageVersion); slot = image.querySelector('[data-coupon-image-batch]'); }
        if (slot) slot.dataset.couponImageVersion = String(group.imageVersion);
      } else image.textContent = group.hasImage ? 'Imagen de referencia no disponible.' : 'Sin imagen de referencia';
      card.append(image, title, count); list.append(card);
    }
    target.append(list);
    if (typeof hydrateOwnerCouponImages === 'function') hydrateOwnerCouponImages();
  }
  function renderStock(target, coupons) {
    render(target, coupons.length ? { member: null, couponIds: coupons.map(coupon => coupon.id), groups: groupCoupons(rewardAdminState, coupons) } : null);
  }
  function finish(accepted) {
    const active = pending; pending = null;
    if (dialog?.open) { closing++; dialog.close(); }
    field('content')?.replaceChildren();
    if (active) active.resolve(accepted);
  }
  function cancel() {
    finish(false);
    if (typeof CouponImages !== 'undefined') CouponImages.close();
  }
  function confirmDelivery(snapshot) {
    if (!dialog || typeof dialog.showModal !== 'function' || !field('content') || !field('accept') || !field('cancel')) throw new Error('No se pudo cargar la confirmacion de entrega. Recarga el panel.');
    if (pending) throw new Error('Termina o cancela la entrega que estas revisando.');
    validate(snapshot);
    return new Promise((resolve, reject) => {
      pending = { snapshot, resolve };
      try { render(field('content'), snapshot); dialog.showModal(); if (typeof hydrateOwnerCouponImages === 'function') hydrateOwnerCouponImages(); }
      catch (error) { pending = null; finish(false); reject(error); }
    });
  }
  field('accept')?.addEventListener('click', () => { if (pending) finish(true); });
  field('cancel')?.addEventListener('click', cancel);
  dialog?.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog?.addEventListener('close', () => { if (closing) closing--; else cancel(); });
  function invalidate() {
    epoch++; cancel();
    for (const node of document.querySelectorAll('[data-exact-delivery-preview]')) render(node, null);
  }
  document.querySelector('[data-logout]')?.addEventListener('click', invalidate);
  document.querySelector('[data-admin-circle-select]')?.addEventListener('change', invalidate);
  document.querySelector('[data-profile-dialog]')?.addEventListener('close', cancel);
  window.addEventListener('mazino-owner-session-cleared', invalidate);
  window.addEventListener('sessionexpired', invalidate);
  window.addEventListener('pagehide', invalidate);
  const dashboard = document.querySelector('[data-dashboard]');
  if (dashboard && typeof MutationObserver === 'function') new MutationObserver(() => { if (!authenticated()) invalidate(); }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
  // Post-commit UI may legitimately reset item/quantity when stock is exhausted.
  // Full selection/state validation belongs before the request, not after it.
  globalThis.OwnerDeliveryPreview = Object.freeze({ create, validate, render, renderStock, confirm: confirmDelivery, cancel, isContextCurrent: snapshot => authenticated() && snapshot.context === context() });
})();
