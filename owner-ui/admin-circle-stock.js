(() => {
  const root=$('[data-circle-stock]'),panel=$('[data-staff-group="pool"]'),form=$('[data-circle-stock-form]');
  const circle=$('[data-circle-stock-space]'),staff=$('[data-circle-stock-staff]'),batch=$('[data-circle-stock-batch]');
  const status=$('[data-circle-stock-status]'),selection=$('[data-circle-stock-selection]');
  const dialog=$('[data-circle-stock-dialog]'),confirmButton=$('[data-circle-stock-confirm]'),cancel=$('[data-circle-stock-cancel]');
  const confirmStatus=$('[data-circle-stock-confirm-status]'),content=$('[data-circle-stock-confirm-content]');
  const refresh=$('[data-circle-stock-refresh]'),review=$('[data-circle-stock-review]');
  let data=null,revision=0,imageRevision=0,busy=false,pending=null,trigger=null,preferredSpace=null;
  const active=()=>!$('[data-dashboard]').hidden&&panel.open&&!panel.hidden;
  const call=(action,body={})=>api('/api/admin/spaces/stock-'+action,{method:'POST',body:JSON.stringify(body)});
  const selected=()=>batch.value===''?undefined:data?.stock[Number(batch.value)];
  const stamp=value=>new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima'});
  const field=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function lock(value){
    busy=value;refresh.disabled=review.disabled=confirmButton.disabled=cancel.disabled=value;
    for(const control of form.elements)control.disabled=value;
  }
  function close(){
    if(busy)return;
    pending=null;content.replaceChildren();confirmStatus.textContent='';
    if(dialog.open)dialog.close();
    if(trigger?.isConnected)trigger.focus();
  }
  function renderStaff(){
    const space=data?.spaces.find(item=>item.id===circle.value),previous=staff.value;
    staff.innerHTML='<option value="">Elige líder o sublíder</option>'+(space?.staff||[]).map(person=>`<option value="${escapeHtml(person.id)}">${escapeHtml(person.nick)} · ${escapeHtml(space.name)} · límite ${person.dailyLimit} al día / ${person.weeklyLimit} semanal</option>`).join('');
    staff.value=space?.staff.some(person=>person.id===previous)?previous:'';
    if(space&&!space.staff.length)status.textContent='Este círculo no tiene responsables activos con permiso para repartir. Revisa Responsables y permisos en Círculos y grupos.';
    else if(space&&!space.enabled)status.textContent='El círculo está oculto al público. El cupo se reserva para su responsable.';
    else status.textContent='';
    renderDestination();
  }
  function renderDestination(){
    const box=$('[data-circle-stock-destination]');if(!box)return;
    const space=data?.spaces.find(item=>item.id===circle.value),person=space?.staff.find(item=>item.id===staff.value),row=selected();
    box.replaceChildren();
    box.append(field('strong',person?`Destino: ${person.nick} en ${space.name}`:space?`Destino: ${space.name} · elige líder o sublíder`:'Primero elige el círculo de destino.'));
    if(person&&row)box.append(field('p',`${form.elements.quantity.value || '0'} × ${row.label} · Lote: ${row.batchName}`));
    box.append(field('p','El cupo se guarda solo en el círculo elegido. Si esta persona tiene otro cargo en otro círculo, su otro cupo permanece separado.'));
    review.disabled=busy||!person||!row||!form.elements.quantity.validity.valid;
  }
  async function renderSelection(){
    const row=selected(),request=++imageRevision,version=revision;
    selection.replaceChildren();renderDestination();if(batch.value===''||!row)return;
    form.elements.quantity.max=String(Math.min(300,row.available));
    selection.append(field('p',row.batchName+' · '+row.label+' · '+row.available+' disponibles'));
    if(!row.hasImage){selection.append(field('p','Este lote todavía no tiene imagen de referencia.'));return;}
    const image=field('div');selection.append(image);
    try{
      const result=await call('images',{batchIds:[row.batchId]});
      if(!active()||version!==revision||request!==imageRevision||selected()!==row)return;
      const thumb=CouponImages.thumbnail(result.images[0]?.imageData,row.label);
      image.replaceChildren(...(thumb?[thumb]:[field('p','Sin imagen de referencia.')]));
    }catch(error){if(active()&&version===revision&&request===imageRevision)image.textContent=error.message;}
  }
  function renderHistory(){
    const history=$('[data-circle-stock-history]');history.replaceChildren();
    if(!data.history.length){history.append(field('p','Aún no hay cupos enviados desde el inventario central.'));return;}
    for(const entry of data.history){
      const card=field('article');card.className='circle-stock-history-item';
      card.append(field('strong',entry.circle+' · '+entry.responsible),
        field('p',entry.quantity+' × '+entry.label+' · '+stamp(entry.confirmedAt)),
        field('p',entry.available+' disponibles · '+entry.assigned+' reservados / entregados · '+entry.claimed+' reclamados'));
      history.append(card);
    }
  }
  async function load(){
    if(!active()||busy)return;
    const version=++revision,old=selected(),oldCircle=circle.value,oldStaff=staff.value;
    status.textContent='Consultando inventario central…';lock(true);
    try{
      const result=await call('state');
      if(!active()||version!==revision)return;
      data=result;
      circle.innerHTML='<option value="">Elige un círculo</option>'+data.spaces.map(space=>`<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)}${space.enabled?'':' · Oculto'}</option>`).join('');
      circle.value=preferredSpace&&data.spaces.some(space=>space.id===preferredSpace)?preferredSpace:data.spaces.some(space=>space.id===oldCircle)?oldCircle:(typeof adminCircleId==='string'&&data.spaces.some(space=>space.id===adminCircleId)?adminCircleId:'main');
      preferredSpace=null;
      renderStaff();if(data.spaces.find(space=>space.id===circle.value)?.staff.some(person=>person.id===oldStaff))staff.value=oldStaff;
      batch.innerHTML='<option value="">Elige un lote del inventario central</option>'+data.stock.map((row,index)=>`<option value="${index}">${escapeHtml(row.batchName)} · ${escapeHtml(row.label)} · ${row.available} disponibles</option>`).join('');
      const index=old?data.stock.findIndex(row=>row.batchId===old.batchId&&row.label===old.label):-1;
      batch.value=index<0?'':String(index);
      renderHistory();void renderSelection();
      if(!data.stock.length)status.textContent='No hay cupones libres en el inventario central. Carga un lote o devuelve un cupo libre de Mazino.';
      else if(!status.textContent||status.textContent==='Consultando inventario central…')status.textContent='Elige círculo, responsable, lote y cantidad. Revisa el envío antes de confirmarlo.';
    }catch(error){if(active()&&version===revision)status.textContent=error.message;}
    finally{if(version===revision){lock(false);renderDestination();}}
  }
  circle.addEventListener('change',()=>{staff.value='';renderStaff();});
  staff.addEventListener('change',renderDestination);
  form.elements.quantity.addEventListener('input',renderDestination);
  batch.addEventListener('change',renderSelection);
  refresh.addEventListener('click',load);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!data||batch.value==='')return;
    const row=selected(),version=revision;if(!row)return;
    lock(true);status.textContent='Preparando vista previa…';
    try{
      const result=await call('preview',{spaceId:circle.value,staffId:staff.value,batchId:row.batchId,label:row.label,quantity:form.elements.quantity.valueAsNumber});
      if(!active()||version!==revision)return;
      pending=result;trigger=document.activeElement;content.replaceChildren();
      content.append(field('h3',result.circle),field('p','Responsable: '+result.responsible),
        field('p',result.quantity+' × '+result.label),field('p','Lote: '+result.batchName));
      content.append(field('p','Este envío aumenta únicamente el cupo de esta persona en '+result.circle+'. No entrega premios personales a jugadores.'));
      const image=CouponImages.thumbnail(result.imageData,result.label);
      content.append(image||field('p','Sin imagen de referencia.'));
      content.append(field('p','Este cupo pertenece a '+result.circle+'. Sus límites diario y semanal se conservan.'));
      confirmStatus.textContent='';status.textContent='Revisa el destino, la imagen y la cantidad.';
      dialog.showModal();
    }catch(error){if(active()&&version===revision)status.textContent=error.message;}
    finally{if(version===revision)lock(false);}
  });
  confirmButton.addEventListener('click',async()=>{
    if(!pending||busy)return;
    const snapshot=pending,version=revision;lock(true);confirmStatus.textContent='Enviando cupo…';
    try{
      const result=await call('confirm',{id:snapshot.id,confirmed:true});
      if(!active()||version!==revision)return;
      lock(false);close();
      await load();
      if(active())status.textContent=result.changed+' cupones reservados para '+snapshot.responsible+' en '+snapshot.circle+'.';
      if(typeof refreshAdminPrizes==='function')void refreshAdminPrizes();
      if(typeof refreshStaff==='function')void refreshStaff();
    }catch(error){if(active()&&version===revision)confirmStatus.textContent=error.message;}
    finally{if(version===revision)lock(false);}
  });
  cancel.addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!busy){pending=null;content.replaceChildren();confirmStatus.textContent='';}});
  panel.addEventListener('toggle',()=>{if(active())load();else if(!busy)close();});
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-circle-stock-target]');
    if(!target||busy)return;
    preferredSpace=target.dataset.circleStockTarget;
    const wasOpen=active();
    selectAdminSection('pool');
    if(wasOpen)load();
  });
  new MutationObserver(()=>{
    if(!$('[data-dashboard]').hidden){if(active())load();return;}
    revision++;imageRevision++;lock(false);close();data=null;
    circle.innerHTML=staff.innerHTML=batch.innerHTML='';selection.replaceChildren();status.textContent='';
    $('[data-circle-stock-history]').replaceChildren();
  }).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
  $('[data-circle-stock-load]').addEventListener('click',()=>{
    if(busy)return;
    if(typeof adminCircleId!=='string'||adminCircleId==='main'){selectAdminSection('import');return;}
    if(!confirm('¿Ir al inventario central de Mazino para cargar el lote?'))return;
    try{sessionStorage.removeItem('mazino-admin-circle');sessionStorage.setItem('mazino-admin-next-task','import');location.reload();}
    catch{status.textContent='Selecciona Mazino arriba y abre Premios → Cargar cupones.';}
  });
})();

