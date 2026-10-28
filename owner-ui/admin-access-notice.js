let refreshAccessNotice;
(() => {
  const banner=$('[data-access-notice]'),counts=$('[data-access-notice-counts]'),status=$('[data-access-notice-status]'),dashboard=$('[data-dashboard]');
  let revision=0,timer,controller,requestTimeout;
  const active=()=>!dashboard.hidden&&!document.hidden;
  function stop(clear=false) {
    revision++;clearTimeout(timer);clearTimeout(requestTimeout);controller?.abort();controller=null;
    if(clear){banner.hidden=true;counts.textContent='Solicitudes de acceso';status.textContent='';banner.removeAttribute('data-pending');}
  }
  refreshAccessNotice=async()=>{
    if(!active())return;
    stop();const version=revision;controller=new AbortController();const current=controller;
    if(banner.hidden)banner.hidden=false;const timeout=setTimeout(()=>current.abort(),20000);requestTimeout=timeout;
    try {
      const result=await api('/api/admin/rewards/access-counts',{method:'POST',body:'{}',signal:current.signal});
      if(version!==revision||!active())return;
      if(![result.total,result.accesses,result.recoveries].every(n=>Number.isSafeInteger(n)&&n>=0)||result.total!==result.accesses+result.recoveries)throw Error('Conteo invalido');
      const label=result.total?`${result.total} ${result.total===1?'solicitud pendiente':'solicitudes pendientes'} · ${result.accesses} ${result.accesses===1?'acceso':'accesos'} · ${result.recoveries} ${result.recoveries===1?'recuperacion':'recuperaciones'}`:'Sin solicitudes pendientes';
      if(counts.textContent!==label)counts.textContent=label;
      banner.toggleAttribute('data-pending',result.total>0);const message='Actualizado. Consulta automatica cada 30 segundos.';if(status.textContent!==message)status.textContent=message;
    } catch {
      const message='No se pudo actualizar el aviso. Reintenta; el ultimo conteo puede haber cambiado.';
      if(version===revision&&active()&&status.textContent!==message)status.textContent=message;
    } finally {
      clearTimeout(timeout);
      if(version===revision){controller=null;if(active())timer=setTimeout(refreshAccessNotice,30000);}
    }
  };
  $('[data-access-notice-refresh]').addEventListener('click',()=>refreshAccessNotice());
  document.addEventListener('mazino-access-reviewed',()=>refreshAccessNotice());
  document.addEventListener('visibilitychange',()=>{if(active())refreshAccessNotice();else stop();});
  window.addEventListener('focus',()=>{if(active())refreshAccessNotice();});
  window.addEventListener('online',()=>{if(active())refreshAccessNotice();});
  window.addEventListener('pagehide',()=>stop());
  new MutationObserver(()=>{if(dashboard.hidden)stop(true);else refreshAccessNotice();}).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
  if(active())refreshAccessNotice();
})();
