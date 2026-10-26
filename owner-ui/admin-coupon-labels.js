(() => {
  const field=name=>$(`[data-label-batch-${name}]`);
  let staged=null,busy=false,revision=0;
  const visible=()=>!$('[data-dashboard]').hidden;
  const reset=()=>{revision++;staged=null;field('review').hidden=true;field('save').disabled=true;};
  const input=()=>({batchId:field('batch').value==='__legacy__'?null:field('batch').value,oldLabel:field('old').value||null,label:field('name').value.trim()});
  const call=(action,body)=>api(`/api/admin/rewards/${action}`,{method:'POST',body:JSON.stringify(body)});
  globalThis.renderCouponLabelBatches=()=>{
    reset();
    const previous=field('batch').value;
    field('batch').innerHTML='<option value="">Elige lote</option>'+(rewardAdminState.batches||[]).map(b=>`<option value="${escapeHtml(b.id||'__legacy__')}">${escapeHtml(b.name||'Stock anterior (sin lote)')} (${b.total})</option>`).join('');
    field('batch').value=previous;renderNames();
  };
  function renderNames(){
    const previous=field('old').value,batch=field('batch').value;
    const names=[...new Set(rewardAdminState.coupons.filter(c=>batch&&(c.import_batch_id??'__legacy__')===batch).map(c=>c.label))].sort((a,b)=>a.localeCompare(b,'es'));
    field('old').innerHTML='<option value="">Todos los premios del lote</option>'+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    field('old').value=names.includes(previous)?previous:'';
  }
  field('form').addEventListener('input',reset);
  field('batch').addEventListener('change',()=>{reset();renderNames();});
  field('old').addEventListener('change',reset);
  field('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!visible())return;
    reset();busy=true;const current=revision;field('status').textContent='Revisando lote...';
    try{
      const body=input(),result=await call('rename-batch-preview',body);
      if(current!==revision||!visible())return;
      staged={...body,fingerprint:result.fingerprint};
      field('summary').textContent=`${result.changed} de ${result.total} cupones cambiaran a "${result.label}". Disponibles: ${result.counts.available||0} | Asignados: ${result.counts.assigned||0} | Reclamados: ${result.counts.claimed||0} | Archivados: ${result.counts.archived||0}.`;
      field('names').textContent=`Nombres actuales: ${result.names.join(', ')}`;
      field('review').hidden=false;field('save').disabled=!result.changed;field('status').textContent='Solo cambiara el nombre; no se cambian codigos, destinatarios, estados ni fechas de reclamo.';
    }catch(error){if(current===revision&&visible())field('status').textContent=error.message;}
    finally{busy=false;}
  });
  field('save').addEventListener('click',async()=>{
    if(!staged||busy||!visible()||!confirm(`${field('summary').textContent}\nCambiar solo los nombres, conservando entregas y reclamados?`))return;
    busy=true;field('save').disabled=true;const body={...staged,confirmed:true},current=revision;
    try{const result=await call('rename-batch',body);if(current!==revision||!visible())return;reset();field('status').textContent=`${result.changed} nombres actualizados. Entregas y reclamos conservados. Los sublideres veran los nuevos nombres al actualizar su panel.`;await refreshAdminPrizes();if(typeof refreshStaff==='function')await refreshStaff();}
    catch(error){if(current===revision&&visible())field('status').textContent=error.message;}
    finally{busy=false;}
  });
  field('cancel').addEventListener('click',reset);
  $('[data-logout]').addEventListener('click',()=>{revision++;reset();field('name').value='';field('status').textContent='';});
  renderCouponLabelBatches();
})();
