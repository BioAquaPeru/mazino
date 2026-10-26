(() => {
  const section=$('[data-access-history]'), form=$('[data-access-history-form]'), rows=$('[data-access-history-rows]'), status=$('[data-access-history-status]'), prev=$('[data-access-history-prev]'), next=$('[data-access-history-next]'), label=$('[data-access-history-page]');
  let revision=0, page=null, filters={};
  const active=()=>!$('[data-dashboard]').hidden && section.open;
  const values=()=>Object.fromEntries(new FormData(form));
  async function load(offset=0) {
    if(!active())return;
    const version=++revision;page=null;rows.innerHTML='';label.textContent='';prev.disabled=next.disabled=true;status.textContent='Consultando historial...';
    try {
      const data=await api('/api/admin/rewards/access-history',{method:'POST',body:JSON.stringify({...filters,offset})});
      if(!active()||version!==revision)return;
      page=data;
      rows.innerHTML=data.entries.map(row=>`<article class="prize-item"><h3>${escapeHtml(row.nick)}</h3><p>${row.purpose==='recover'?'Recuperacion':'Primer acceso'} · <strong>${row.decision==='approved'?'Aprobada':'Rechazada'}</strong></p><p>Revisada por: ${escapeHtml(row.reviewerNick)}</p><p>Fecha y hora (Peru): ${escapeHtml(new Date(row.reviewedAt).toLocaleString('es-PE',{timeZone:'America/Lima'}))}</p></article>`).join('');
      status.textContent=`${data.total} decisiones encontradas.`;label.textContent=`Pagina ${Math.floor(data.offset/25)+1} de ${Math.max(1,Math.ceil(data.total/25))}`;prev.disabled=!data.offset;next.disabled=data.offset+25>=data.total;
    }catch(error){if(active()&&version===revision)status.textContent=error.message;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();filters=values();load();});
  $('[data-access-history-reset]').addEventListener('click',()=>{form.reset();filters=values();load();});
  prev.addEventListener('click',()=>{if(page)load(page.offset-25);});next.addEventListener('click',()=>{if(page)load(page.offset+25);});
  section.addEventListener('toggle',()=>{if(section.open){filters=values();load();}else{revision++;page=null;rows.innerHTML='';status.textContent='';}});
  document.addEventListener('mazino-access-reviewed',()=>load());
  new MutationObserver(()=>{if($('[data-dashboard]').hidden){revision++;page=null;rows.innerHTML='';status.textContent='';label.textContent='';prev.disabled=next.disabled=true;section.open=false;form.reset();filters={};}}).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
})();
