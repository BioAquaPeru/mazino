(function(root){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const button=text=>{const b=el('button',text);b.type='button';return b;};
 const select=(label,items)=>{const n=el('select');n.setAttribute('aria-label',label);for(const [id,text] of items){const o=el('option',text);o.value=id;n.append(o);}return n;};
 const labeled=(text,node)=>{const l=el('label',text);l.append(node);return l;};
 function styles(host){host.classList.add('donation-groups');if(document.querySelector('[data-donation-groups-style]'))return;const s=el('style');s.dataset.donationGroupsStyle='';s.textContent='.donation-groups{grid-column:1/-1;min-width:0}.donation-groups details{margin:12px 0;border:1px solid #61414e;border-radius:8px;padding:12px}.donation-groups summary{cursor:pointer;font-weight:bold}.donation-groups label{display:block;margin:8px 0}.donation-groups input,.donation-groups select{box-sizing:border-box;max-width:100%;width:100%;padding:9px;background:#211c21;color:#fff;border:1px solid #76515e;border-radius:5px;min-height:40px}.donation-groups button{margin:5px 8px 5px 0;min-height:40px;padding:7px 12px;background:#30232c;color:#fff;border:1px solid #80616e;border-radius:6px}.donation-group-members{max-height:260px;overflow:auto;border:1px solid #61414e;padding:10px}.donation-group-members label{display:flex;align-items:center;gap:8px}.donation-group-members input{width:18px;min-height:18px}.donation-group-pairs{display:flex;gap:12px;flex-wrap:wrap}.donation-group-pairs>label{flex:1;min-width:150px}.donation-group-hint{color:#d8bac6;font-size:13px}.donation-group-items p{padding:8px;border-bottom:1px solid #61414e}';document.head.append(s);}
 function tierManager(host,save,hideMembers){
  const details=el('details'),fields=el('div'),enabled=select('Ascensos automáticos',[['yes','Activos'],['no','Pausados']]);
  const member=el('input'),veteran=el('input'),summary=el('p'),rosters=el('div'),message=el('p'),apply=button('Guardar ascensos');
  for(const input of [member,veteran]){input.type='number';input.min='1';input.max='36500';input.step='1';input.required=true;}
  message.setAttribute('role','status');fields.className='donation-group-pairs';
  fields.append(labeled('Ascensos automáticos',enabled),labeled('Miembro desde el día',member),labeled('Veterano desde el día',veteran));
  details.append(el('summary','Ascensos automáticos · Nuevos, Miembro y Veterano'),
   el('p','Se calcula desde la fecha de ingreso. Los ascensos se ven en el panel al cumplir los días. Las metas semanales toman la categoría del lunes.'),
   fields,summary,apply,message,rosters);host.append(details);
  let revision=null,busy=false;
  function renderLimits(){
   summary.textContent=enabled.value==='yes'?`Nuevos · hasta ${Math.max(0,Number(member.value)-1)} días. Miembro · desde ${member.value} días. Veterano · desde ${veteran.value} días.`:
    'Activa los ascensos para que los tres grupos se formen por antigüedad.';
  }
  enabled.onchange=member.oninput=veteran.oninput=renderLimits;
  apply.onclick=async()=>{
   if(busy||revision===null)return;
   const memberDay=Number(member.value),veteranDay=Number(veteran.value);
   if(!member.checkValidity()||!veteran.checkValidity()||veteranDay<=memberDay){
    message.textContent='El día de Veterano debe ser posterior al de Miembro.';return;
   }
   busy=true;for(const input of [enabled,member,veteran,apply])input.disabled=true;
   try{await save({enabled:enabled.value==='yes',memberDay,veteranDay,revision});message.textContent='Ascensos guardados. Ya puedes elegir estos grupos al crear una meta.';}
   catch(error){message.textContent=error.message;}
   finally{busy=false;for(const input of [enabled,member,veteran,apply])input.disabled=false;}
  };
  return data=>{
   details.hidden=!data.tiers;
   if(!data.tiers)return;
   const config=data.tiers;
   if(revision!==config.revision){
    revision=config.revision;member.value=config.memberDay;veteran.value=config.veteranDay;enabled.value=config.enabled?'yes':'no';renderLimits();
   }
   const members=new Map(data.members.map(m=>[m.id,m.nick]));
   rosters.replaceChildren();
   for(const group of hideMembers?[]:(data.groups||[]).filter(item=>item.automatic)){
    const list=el('details');
    list.append(el('summary',`${group.name} · ${group.memberIds.length} integrantes`),
     el('p',group.memberIds.map(id=>members.get(id)).filter(Boolean).join(', ')||'Sin integrantes'));
    rosters.append(list);
   }
  };
 }
 function manager(host,options){
  styles(host);let data=options.data,busy=false,id='',selected=new Set(),editRevision=data.groupRevision||'';
  const tiers=options.saveTiers ? tierManager(host,options.saveTiers,options.hideTierMembers) : null;
  const manualGroups=()=> (data.groups||[]).filter(g=>!g.automatic);
  const details=el('details'),summary=el('summary','Grupos manuales de donaciones'),intro=el('p','Crea grupos personalizados. Las metas anteriores conservan sus integrantes.');
  const group=select('Grupo a editar',[]),name=el('input');name.maxLength=60;name.placeholder='Ej.: Fundadores';const search=el('input');search.type='search';search.placeholder='Buscar nick para agregar al grupo';search.setAttribute('aria-label','Buscar integrantes del grupo');
  const members=el('div');members.className='donation-group-members';const counter=el('p'),save=button('Guardar grupo'),fresh=button('Nuevo grupo'),message=el('p');message.setAttribute('role','status');
  details.append(summary,intro,labeled('Grupo a editar',group),labeled('Nombre del grupo',name),fresh,search,counter,members,save,message);host.append(details);
  function renderMembers(){members.replaceChildren();const q=search.value.trim().toLocaleLowerCase();for(const m of data.members.filter(m=>(m.active||selected.has(m.id))&&(!q||m.nick.toLocaleLowerCase().includes(q)))){const check=el('input');check.type='checkbox';check.checked=selected.has(m.id);check.disabled=busy||!options.canEdit;check.onchange=()=>{if(check.checked)selected.add(m.id);else selected.delete(m.id);counter.textContent=`${selected.size} integrantes seleccionados`;};const current=manualGroups().find(g=>g.id!==id&&g.memberIds.includes(m.id));members.append(labeled(`${m.nick}${!m.active?' (retirado)':''}${current?' · '+current.name+' (se movera)':''}`,check));}counter.textContent=`${selected.size} integrantes seleccionados`;}
  function apply(){group.replaceChildren();for(const [value,text] of [['','Nuevo grupo'],...manualGroups().map(g=>[g.id,`${g.name} (${g.memberIds.length})`])]){const o=el('option',text);o.value=value;group.append(o);}group.value=id;renderMembers();tiers?.(data);}
  group.onchange=()=>{editRevision=data.groupRevision||'';id=group.value;const g=data.groups?.find(g=>g.id===id);selected=new Set(g?.memberIds||[]);name.value=g?.name||'';search.value='';renderMembers();};fresh.onclick=()=>{group.value='';group.onchange();name.focus();};search.oninput=renderMembers;
  save.hidden=fresh.hidden=!options.canEdit;name.disabled=!options.canEdit;
  save.onclick=async()=>{if(busy||!options.canEdit)return;if(!name.value.trim()){message.textContent='Escribe el nombre del grupo.';return;}busy=true;for(const n of details.querySelectorAll('input,button,select'))n.disabled=true;try{const result=await options.save({id:id||undefined,name:name.value.trim(),memberIds:[...selected],revision:editRevision});id=result?.id||id;editRevision=data.groupRevision||'';group.value=id;message.textContent='Grupo guardado. Las metas anteriores conservan sus integrantes.';}catch(e){message.textContent=e.message;}finally{busy=false;for(const n of details.querySelectorAll('input,button,select'))n.disabled=!options.canEdit;renderMembers();}};
  apply();return{update(next){if(!name.value&&!selected.size)editRevision=next.groupRevision||'';data=next;apply();},destroy(){host.replaceChildren();}};
 }
 function picker(host,options){
  styles(host);let data=options.data,disabled=!!options.disabled;const overrides=new Map();
  const scope=select('Destinatarios de la meta',[['all','Todos los integrantes'],['group','Un grupo'],['member','Un integrante']]);const group=select('Grupo para la meta',[]),member=select('Integrante para la meta',[]),search=el('input');search.type='search';search.placeholder='Buscar nick';search.setAttribute('aria-label','Buscar destinatario de meta');
  const groupLabel=labeled('Grupo para la meta',group),memberLabel=labeled('Integrante para la meta',member),hint=el('p');hint.className='donation-group-hint';
  const exceptions=el('details');exceptions.append(el('summary','Metas individuales que reemplazan la grupal'));const own=select('Integrante con meta individual',[]),amount=el('input');amount.type='number';amount.min='1';amount.max='1000000000000';amount.step='1';amount.placeholder='Cantidad individual';amount.setAttribute('aria-label','Importe individual');const add=button('Agregar meta individual'),rows=el('div');rows.className='donation-group-items';exceptions.append(labeled('Integrante con meta individual',own),labeled('Importe individual',amount),add,rows);
  host.append(labeled('Aplicar meta a',scope),groupLabel,search,memberLabel,hint,exceptions,el('p','La meta individual reemplaza la del grupo para las mismas fechas de inicio y final; no se suman. Los integrantes quedan fijados al crear la meta.'));
  const candidates=()=>data.members.filter(m=>m.active&&(scope.value==='all'||(scope.value==='group'?data.groups?.find(g=>g.id===group.value)?.memberIds.includes(m.id):m.id===member.value)));
  function opts(node,items){const old=node.value;node.replaceChildren();for(const m of items){const o=el('option',m.nick||m.name);o.value=m.id;node.append(o);}if(items.some(m=>m.id===old))node.value=old;}
  function render(){groupLabel.hidden=scope.value!=='group';memberLabel.hidden=scope.value!=='member';search.hidden=scope.value!=='member';exceptions.hidden=scope.value==='member';const allowed=candidates();for(const id of overrides.keys())if(!allowed.some(m=>m.id===id))overrides.delete(id);opts(own,allowed);hint.textContent=`${allowed.length} integrantes incluidos. ${scope.value==='group'?'Solo los activos del grupo seleccionado.':''}`;rows.replaceChildren();for(const [id,target] of overrides){const p=el('p',`${data.members.find(m=>m.id===id)?.nick||''}: ${Number(target).toLocaleString('es-PE')} Rcoin `),remove=button('Quitar excepcion');remove.disabled=disabled;remove.onclick=()=>{overrides.delete(id);render();};p.append(remove);rows.append(p);}for(const n of host.querySelectorAll('input,select,button'))n.disabled=disabled;}
  function refresh(){opts(group,data.groups||[]);opts(member,data.members.filter(m=>m.active&&m.nick.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())));render();}
  scope.onchange=group.onchange=member.onchange=render;search.oninput=refresh;add.onclick=()=>{if(disabled)return;const value=Number(amount.value);if(!own.value||!Number.isSafeInteger(value)||value<1||value>1e12){hint.textContent='Elige un integrante y una cantidad entera mayor que cero.';return;}overrides.set(own.value,value);amount.value='';render();};refresh();
  return{get(){if(!candidates().length)throw Error('Elige al menos un integrante activo para la meta.');return{scope:scope.value,groupId:scope.value==='group'?group.value:undefined,groupRevision:data.groupRevision||'',...(data.tiers?.enabled?{tierRevision:data.tiers.revision}:{}),memberId:scope.value==='member'?member.value:undefined,overrides:scope.value==='member'?[]:[...overrides].map(([memberId,target])=>({memberId,target}))};},update(next,locked){data=next;disabled=!!locked;refresh();},destroy(){host.replaceChildren();}};
 }
 root.MazinoDonationGroups={manager,picker};
})(typeof window==='undefined'?globalThis:window);
