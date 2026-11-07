import { mountCouponCatalog } from './coupon-catalog.js?v=3';

const dashboard = document.querySelector('[data-dashboard]');
for (const slot of document.querySelectorAll('[data-owner-catalog]')) {
  const section = slot.closest('details');
  let dispose;
  function update() {
    if (dashboard.hidden || section.hidden || !section.open) {
      dispose?.();
      dispose = null;
      return;
    }
    if (dispose) return;
    const mode = slot.dataset.ownerCatalog;
    dispose = mountCouponCatalog(slot, {
      mode,
      request(action, body) {
        const route = mode === 'transfer'
          ? '/api/admin/spaces/stock-' + (action === 'state' ? 'catalog' : action)
          : '/api/admin/rewards/' + (action === 'images' ? 'batch-image-list' : 'catalog-' + action);
        return api(route, { method: 'POST', body: JSON.stringify(body) });
      },
      onChange: () => refreshAdminPrizes(),
    });
  }
  section.addEventListener('toggle', update);
  const observer = new MutationObserver(update);
  observer.observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  update();
}
