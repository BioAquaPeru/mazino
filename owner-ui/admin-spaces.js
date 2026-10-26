(() => {
  const section=$('[data-admin-section="spaces"]'),list=$('[data-spaces-list]'),detail=$('[data-space-detail]'),status=$('[data-spaces-status]');
  const create=$('[data-space-create]'),createBox=$('[data-space-create-box]'),edit=$('[data-space-edit]'),grant=$('[data-space-grant]'),context=$('[data-admin-circle-select]');
  const trash=$('[data-space-trash-list]'),logoFile=$('[data-space-logo-file]'),logoPreview=$('[data-space-logo-preview]'),pageFile=$('[data-space-page-logo-file]'),pageSample=$('[data-space-page-sample]'),pageImage=$('[data-space-page-logo-preview]');
  const viewer=$('[data-space-preview-dialog]'),frame=$('[data-space-preview-frame]');
  const perms={can_assign:'Asignar premios',can_events:'Crear y editar sus eventos',can_release:'Quitar o traspasar sus pendientes',can_close:'Cerrar sus eventos',can_donations:'Cargar donaciones',can_donation_goals:'Crear metas',can_access:'Verificar en el juego y aprobar accesos'};
  const fields=['name','logoUrl','tabColor','pageLogoUrl','pageColor','pageBackground','welcomeMessage','whatsappUrl','contactMode'];
  let data=null,current=null,revision=0,busy=false,savedSignature='',templatePromise=null,previewReady=false;
  const active=()=>!$('[data-dashboard]').hidden;
  const message=value=>status.textContent=value;
  const color=value=>/^#[a-f0-9]{6}$/i.test(value||'')?value:'#ff506a';
  const call=(action,body={})=>api('/api/admin/spaces/'+action,{method:'POST',body:JSON.stringify(body)});
  const draft=()=>({...Object.fromEntries(fields.map(key=>[key,edit.elements[key].value])),enabled:edit.elements.enabled.checked});
  const isDirty=()=>!!current&&JSON.stringify(draft())!==savedSignature;
  const discard=()=>!isDirty()||confirm('Tienes cambios sin guardar en '+current.space.name+'. Quieres descartarlos para continuar?');
  function renderGrants(){
    $('[data-space-grants]').innerHTML=(current?.grants||[]).map(g=>`<article class="prize-item"><h4>${escapeHtml(g.nick)}</h4><p>${g.enabled?'Delegacion activa':'Delegacion pausada'} · ${g.dailyLimit} al dia / ${g.weeklyLimit} a la semana</p><p>${Object.entries(perms).filter(([key])=>g[key]).map(([,label])=>label).join(' · ')||'Sin permisos de gestion'}</p><button type="button" class="ghost-button" data-space-grant-edit="${g.id}">Editar permisos</button></article>`).join('');
  }
  function updateDraftState(){
    if(!current)return;
    $('[data-space-edit-status]').textContent=(current.space.enabled?'Visible en la principal':'Oculto: solo tu puedes revisarlo')+(isDirty()?' · Cambios sin guardar':' · Cambios guardados');
    $('[data-space-save-show]').hidden=current.space.id==='main'||current.space.enabled;
    sendPreview();
  }
  function renderCards(){
    if(!data)return;
    const all=data.spaces.filter(space=>!space.deletedAt),query=$('[data-spaces-search]').value.trim().toLocaleLowerCase(),filter=$('[data-spaces-filter]').value;
    const shown=all.filter(space=>(filter==='all'||(filter==='visible')===space.enabled)&&space.name.toLocaleLowerCase().includes(query));
    $('[data-space-visible-count]').textContent=all.filter(space=>space.enabled).length;
    $('[data-space-hidden-count]').textContent=all.filter(space=>!space.enabled).length;
    $('[data-space-deleted-count]').textContent=data.spaces.filter(space=>space.deletedAt).length;
    $('[data-spaces-result-count]').textContent=shown.length+' de '+all.length+' espacios';
    const card=space=>`<article class="space-card ${current?.space.id===space.id?'space-card-selected':''}" style="--space-accent:${color(space.tabColor)}"><div class="space-card-head">${space.logoUrl?`<img class="space-card-logo" src="${escapeHtml(space.logoUrl)}" alt="" width="48" height="48" referrerpolicy="no-referrer">`:'<span class="space-card-initial" aria-hidden="true">'+escapeHtml([...space.name][0])+'</span>'}<div><h3>${escapeHtml(space.name)}</h3><p>${space.kind==='group'?'Grupo de invitados':'Circulo de R2Beat'}</p></div></div><p class="space-visibility ${space.enabled?'is-visible':''}">${space.deletedAt?'Eliminado · historial conservado':space.enabled?'Visible en mazino.lat':'Oculto · no aparece en la web'}${space.id==='main'?' · Principal':''}</p>${space.deletedAt?`<button type="button" class="ghost-button" data-space-restore="${space.id}">Restaurar como oculto</button>`:`<div class="space-actions"><button type="button" class="ghost-button" data-space-preview="${space.id}">Vista previa</button><button type="button" class="primary-action small-action" data-space-detail-open="${space.id}">Editar</button>${space.id==='main'?'':`<button type="button" class="ghost-button" data-space-toggle="${space.id}" ${!space.ready&&!space.enabled?'disabled title="El espacio aun no esta preparado"':''}>${space.enabled?'Ocultar':'Mostrar'}</button>`}</div><details class="space-card-more"><summary>${space.id==='main'?'Administrar':'Administrar y eliminar'}</summary><div class="space-actions"><button type="button" class="ghost-button" data-space-enter="${space.id}">Administrar integrantes y premios</button>${space.sourceUrl?`<a class="ghost-button" href="${escapeHtml(space.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver en R2Beat</a>`:''}${space.id==='main'?'':`<button type="button" class="ghost-button space-danger" data-space-remove="${space.id}">Eliminar</button>`}</div></details>`}</article>`;
    list.innerHTML=shown.map(card).join('')||'<p class="empty-state">No hay espacios con estos filtros.</p>';
    const removed=data.spaces.filter(space=>space.deletedAt);trash.innerHTML=removed.map(card).join('')||'<p>No hay espacios eliminados.</p>';
    $('[data-space-trash-count]').textContent=removed.length;
  }
  async function load(){
    const version=++revision;
    try{const result=await call('state');if(!active()||version!==revision)return false;data=result;
      context.innerHTML=data.spaces.filter(s=>!s.deletedAt).map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${s.enabled?'':' · Oculto'}</option>`).join('');
      context.value=data.spaces.some(s=>s.id===adminCircleId&&!s.deletedAt)?adminCircleId:'main';
      $('[data-admin-circle-label]').textContent=data.spaces.find(s=>s.id===adminCircleId)?.name||'Mazino';renderCards();return true;
    }catch(error){if(active()&&version===revision)message(error.message);return false;}
  }
  function previewPage(){
    const accent=color(edit.elements.pageColor.value),background=color(edit.elements.pageBackground.value),parts=background.slice(1).match(/../g).map(v=>parseInt(v,16));
    pageSample.style.background=background;pageSample.style.color=parts[0]*.299+parts[1]*.587+parts[2]*.114>155?'#17111a':'#fff6f3';
    $('[data-space-page-name]').textContent=edit.elements.name.value||'Tu circulo';
    const action=$('[data-space-page-action]'),rgb=accent.slice(1).match(/../g).map(v=>parseInt(v,16));action.style.background=accent;action.style.color=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?'#17111a':'#fff';
    action.textContent=edit.elements.contactMode.value==='contact'?'Contactar al lider':'Unirse al circulo';
    const source=edit.elements.pageLogoUrl.value||edit.elements.logoUrl.value;pageImage.hidden=!source;if(source)pageImage.src=source;else pageImage.removeAttribute('src');
    logoPreview.hidden=!edit.elements.logoUrl.value;if(edit.elements.logoUrl.value)logoPreview.src=edit.elements.logoUrl.value;else logoPreview.removeAttribute('src');
    $('[data-space-logo-label]').textContent=edit.elements.logoUrl.value?'Logo de este menu':'Sin logo personalizado';
    $('[data-space-welcome-preview]').textContent=edit.elements.welcomeMessage.value||'Sin mensaje de bienvenida';
    $('[data-space-contact-preview]').textContent=edit.elements.whatsappUrl.value.trim()?'WhatsApp propio configurado para este espacio.':'Sin WhatsApp: el boton quedara desactivado.';
    updateDraftState();
  }
  async function show(id,{force=false,scroll=true}={}){
    if(!force&&current?.space.id!==id&&!discard())return false;
    const version=++revision;message('Consultando espacio...');
    try{const result=await call('detail',{spaceId:id});if(!active()||version!==revision)return false;current=result;detail.hidden=false;
      for(const field of ['name','logoUrl','pageLogoUrl','welcomeMessage','whatsappUrl'])edit.elements[field].value=result.space[field]||'';
      edit.elements.tabColor.value=color(result.space.tabColor);edit.elements.pageColor.value=result.space.pageColor||(id==='main'?'#df101f':color(result.space.tabColor));edit.elements.pageBackground.value=result.space.pageBackground||'#000000';
      edit.elements.contactMode.value=result.space.contactMode||(result.space.kind==='group'?'contact':'join');
      for(const [link,value]of [['logoLink',result.space.logoUrl],['pageLogoLink',result.space.pageLogoUrl]])edit.elements[link].value=value?.startsWith('data:')?'':value||'';
      logoFile.value=pageFile.value='';edit.elements.enabled.checked=result.space.enabled;edit.elements.enabled.disabled=id==='main';edit.elements.name.readOnly=id==='main';
      savedSignature=JSON.stringify(draft());
      $('[data-space-detail-name]').textContent=result.space.name;$('[data-space-detail-source]').textContent=result.space.sourceUrl||'Grupo de invitados con registro verificado en el juego.';
      $('[data-space-detail-count]').textContent=result.count+' integrantes · '+(result.sync.lastError||'Historial separado de los demas espacios.');
      $('[data-space-delete]').hidden=id==='main';$('[data-space-sync]').hidden=id==='main'||result.space.kind!=='circle';$('[data-space-tools]').hidden=id==='main';$('[data-space-access-section]').hidden=id==='main';grant.hidden=id==='main';grant.reset();
      grant.elements.memberId.innerHTML='<option value="">Elige un sublider existente</option>'+data.staff.filter(s=>s.enabled).map(s=>`<option value="${s.id}">${escapeHtml(s.nick)}</option>`).join('');
      renderGrants();
      previewPage();renderCards();message(result.space.enabled?'Puedes revisar su vista previa o editar su configuracion.':'Este espacio esta oculto. Personalizalo, revisa la vista previa y luego elige Guardar y mostrar.');
      if(scroll){detail.scrollIntoView({behavior:'smooth',block:'start'});for(const fold of detail.querySelectorAll('.space-editor-fold'))fold.open=false;detail.querySelector('.space-editor-fold').open=true;}
      return true;
    }catch(error){if(active()&&version===revision)message(error.message);return false;}
  }
  async function run(task){if(busy)return;busy=true;for(const button of section.querySelectorAll('button'))button.disabled=true;
    try{await task();}catch(error){message(error.message);}finally{busy=false;for(const button of section.querySelectorAll('button'))button.disabled=false;renderCards();updateDraftState();}}
  async function save(showPublic=false){
    if(!current||!edit.reportValidity())return;
    await run(async()=>{const id=current.space.id,body=draft();if(showPublic)body.enabled=true;
      await call('save',{...body,spaceId:id,version:current.space.version});await load();await show(id,{force:true,scroll:false});message(body.enabled?'Cambios guardados. El espacio esta visible en la principal.':'Cambios guardados. El espacio sigue oculto y puedes revisarlo en Vista previa.');});
  }
  async function toggle(id){const space=data.spaces.find(s=>s.id===id);if(!space||id==='main'||(current?.space.id===id&&!discard()))return;
    await run(async()=>{await call('save',{spaceId:id,name:space.name,enabled:!space.enabled,version:space.version});await load();if(current?.space.id===id)await show(id,{force:true,scroll:false});message(space.enabled?'Espacio oculto. Sus historiales y accesos se conservan.':'Espacio visible en la pagina principal.');});}
  async function remove(id){const space=data.spaces.find(s=>s.id===id);if(!space||id==='main'||((current?.space.id===id||adminCircleId===id)&&!discard())||!confirm('Eliminar '+space.name+' de la web y del panel de sublideres? Su historial se conserva y puedes restaurarlo en Eliminados.'))return;
    await run(async()=>{await call('delete',{spaceId:id,version:space.version,confirmed:true});if(current?.space.id===id){current=null;detail.hidden=true;}await load();message('Espacio eliminado. Puedes recuperarlo en Eliminados.');if(adminCircleId===id){sessionStorage.removeItem('mazino-admin-circle');location.reload();}});}
  function enter(id){if(id===adminCircleId||!discard())return;try{id==='main'?sessionStorage.removeItem('mazino-admin-circle'):sessionStorage.setItem('mazino-admin-circle',id);location.reload();}catch{message('Permite guardar la seleccion de espacio durante esta sesion.');}}
  function sendPreview(){
    if(!viewer.open||!previewReady||!current||!active())return;
    const edited=isDirty(),source=edited?{...current.space,...draft()}:current.space;
    const keys=['id','name','kind','enabled','version','logoUrl','tabColor','pageLogoUrl','pageColor','pageBackground','welcomeMessage','whatsappUrl','contactMode'];
    const space=Object.fromEntries(keys.map(key=>[key,source[key]]));
    const settings={siteName:space.name,heroPhrase:space.welcomeMessage||'',joinButtonText:space.kind==='group'?'SOLICITAR PARTICIPACION':'UNIRME AL CIRCULO',joinEnabled:true,logoUrl:'',...current.previewSettings};
    $('[data-space-preview-title]').textContent='Vista previa de '+space.name;
    $('[data-space-preview-status]').textContent=(edited?'Cambios sin guardar':'Configuracion guardada')+' · '+(current.space.enabled?'Visible actualmente':'Oculto actualmente');
    frame.contentWindow.postMessage({type:'mazino-space-preview',presentation:{space,settings,unsaved:edited}},location.origin);
  }
  async function buildPreviewDocument(){
    const response=await fetch('/index.html',{cache:'no-store'});if(!response.ok)throw Error('No se pudo preparar la portada.');
    const doc=new DOMParser().parseFromString(await response.text(),'text/html'),hero=doc.querySelector('.hero'),dialog=doc.querySelector('[data-join-dialog]'),guest=doc.querySelector('[data-guest-section]');
    if(!hero||!dialog)throw Error('No se encontro la portada publica.');
    const resources=new Map([...doc.querySelectorAll('script[src]')].map(script=>{const url=new URL(script.getAttribute('src'),location.origin+'/');return[url.pathname.split('/').pop(),url.href];}));
    for(const script of doc.querySelectorAll('script'))script.remove();
    const note=doc.createElement('p');note.dataset.previewNote='';note.className='space-preview-page-note';note.textContent='Preparando vista previa...';
    const shell=doc.createElement('div');shell.className='site-shell';shell.hidden=true;shell.append(hero);if(guest)shell.append(guest);
    doc.body.replaceChildren(note,shell,dialog);doc.title='Vista previa privada';
    const destination=doc.createElement('div');destination.dataset.previewDestination='';destination.hidden=true;
    const caption=doc.createElement('p');caption.textContent='Este es el destino del boton. Solo se abre WhatsApp si eliges probarlo.';
    const text=doc.createElement('p');text.dataset.previewUrl='';text.style.overflowWrap='anywhere';
    const link=doc.createElement('a');link.dataset.previewWhatsapp='';link.className='ghost-button';link.textContent='Probar este WhatsApp';link.target='_blank';link.rel='noopener noreferrer';destination.append(caption,text,link);dialog.querySelector('form').append(destination);
    const check=dialog.querySelector('button[type="submit"]');check.textContent='Ver destino de WhatsApp';check.type='button';check.dataset.previewCheck='';
    for(const element of doc.querySelectorAll('[src],link[href]'))for(const attribute of ['src','href'])if(element.hasAttribute(attribute))element.setAttribute(attribute,new URL(element.getAttribute(attribute),location.origin+'/').href);
    const style=doc.createElement('style');style.textContent='.space-preview-page-note{margin:0;padding:10px 16px;font:600 13px/1.5 system-ui;background:#20151a;color:#ffe4ed;text-align:center}.guest-participation{margin:24px auto} [data-preview-destination]{font-size:14px;line-height:1.5}[data-preview-whatsapp]{display:block;padding:12px;text-align:center}';doc.head.append(style);
    const policy=doc.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'none'; form-action 'none'; base-uri 'none'";doc.head.prepend(policy);
    for(const name of ['space-context.js','member-badge.js','circle-theme.js','admin-space-preview.js']){const script=doc.createElement('script');script.src=resources.get(name)||location.origin+(name==='admin-space-preview.js'?'/owner-ui/':'/')+name;script.defer=true;doc.body.append(script);}
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  async function openPreview(id){
    if(!active())return;
    if(current?.space.id!==id||detail.hidden){if(!await show(id,{scroll:false}))return;}
    const selected=id;$('[data-space-preview-title]').textContent='Preparando vista previa...';
    if(!viewer.open)viewer.showModal();previewReady=false;
    try{templatePromise||=buildPreviewDocument();const html=await templatePromise;if(!viewer.open||current?.space.id!==selected||!active())return;setPreviewSize('desktop');frame.srcdoc=html;}
    catch(error){templatePromise=null;viewer.close();message(error.message);}
  }
  function setPreviewSize(size){frame.style.width=size==='mobile'?'390px':'100%';for(const button of viewer.querySelectorAll('[data-space-preview-size]'))button.setAttribute('aria-pressed',String(button.dataset.spacePreviewSize===size));}
  window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='mazino-space-preview-ready')return;previewReady=true;sendPreview();});
  viewer.addEventListener('close',()=>{previewReady=false;frame.removeAttribute('srcdoc');});
  viewer.addEventListener('click',event=>{if(event.target!==viewer)return;const r=viewer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)viewer.close();});
  $('[data-space-preview-close]').addEventListener('click',()=>viewer.close());
  for(const button of viewer.querySelectorAll('[data-space-preview-size]'))button.addEventListener('click',()=>setPreviewSize(button.dataset.spacePreviewSize));
  $('[data-space-preview-editor]').addEventListener('click',()=>{if(current)openPreview(current.space.id);});
  grant.querySelector('[data-space-permissions]').innerHTML=Object.entries(perms).map(([key,label])=>`<label class="switch-row"><input type="checkbox" name="${key}"><span>${label}</span></label>`).join('');
  list.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||busy)return;const d=button.dataset;if(d.spaceDetailOpen)show(d.spaceDetailOpen);else if(d.spacePreview)openPreview(d.spacePreview);else if(d.spaceToggle)toggle(d.spaceToggle);else if(d.spaceRemove)remove(d.spaceRemove);else if(d.spaceEnter)enter(d.spaceEnter);});
  for(const control of [$('[data-spaces-search]'),$('[data-spaces-filter]')])control.addEventListener(control.tagName==='SELECT'?'change':'input',renderCards);
  context.addEventListener('change',()=>{enter(context.value);context.value=adminCircleId;});
  $('[data-spaces-refresh]').addEventListener('click',()=>{if(!discard())return;run(async()=>{const id=current?.space.id;await load();if(id)await show(id,{force:true,scroll:false});message('Lista actualizada.');});});
  $('[data-space-create-open]').addEventListener('click',()=>{createBox.open=true;createBox.scrollIntoView({behavior:'smooth',block:'start'});create.elements.name.focus();});
  $('[data-space-create-cancel]').addEventListener('click',()=>createBox.open=false);
  create.elements.kind.addEventListener('change',()=>{const circle=create.elements.kind.value==='circle';create.elements.sourceUrl.required=circle;create.elements.sourceUrl.closest('label').hidden=!circle;});
  create.addEventListener('submit',event=>{event.preventDefault();if(!discard())return;run(async()=>{message('Creando espacio oculto...');const result=await call('create',Object.fromEntries(new FormData(create)));create.reset();createBox.open=false;create.elements.sourceUrl.required=true;create.elements.sourceUrl.closest('label').hidden=false;await load();await show(result.space.id,{force:true});message(result.warning?'Se creo oculto. '+result.warning:'Creado y oculto. Personalizalo, revisa su vista previa y elige Guardar y mostrar cuando este listo.');});});
  edit.addEventListener('submit',event=>{event.preventDefault();save(false);});
  $('[data-space-save-show]').addEventListener('click',()=>save(true));
  $('[data-space-edit-close]').addEventListener('click',()=>{if(!discard())return;revision++;current=null;savedSignature='';detail.hidden=true;renderCards();list.scrollIntoView({behavior:'smooth',block:'start'});});
  edit.addEventListener('input',previewPage);edit.addEventListener('change',previewPage);
  for(const [link,field]of [['logoLink','logoUrl'],['pageLogoLink','pageLogoUrl']])edit.elements[link].addEventListener('input',()=>{edit.elements[field].value=edit.elements[link].value.trim();previewPage();});
  $('[data-space-logo-clear]').addEventListener('click',()=>{edit.elements.logoUrl.value=edit.elements.logoLink.value=logoFile.value='';previewPage();});
  $('[data-space-page-logo-clear]').addEventListener('click',()=>{edit.elements.pageLogoUrl.value=edit.elements.pageLogoLink.value=pageFile.value='';previewPage();});
  function prepareLogo(input,isPage){const file=input.files?.[0];if(!file)return;const version=revision;run(async()=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Elige un PNG, JPG o WebP de hasta 5 MB.');
    const objectUrl=URL.createObjectURL(file);
    try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('No se pudo abrir la imagen.'));image.src=objectUrl;});
      const canvas=document.createElement('canvas'),scale=isPage?Math.min(1,1280/image.naturalWidth,800/image.naturalHeight):Math.min(160/image.naturalWidth,160/image.naturalHeight);
      canvas.width=isPage?Math.max(1,Math.round(image.naturalWidth*scale)):160;canvas.height=isPage?Math.max(1,Math.round(image.naturalHeight*scale)):160;
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;canvas.getContext('2d').drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
      let url=canvas.toDataURL('image/webp',.82),limit=isPage?240000:60000;if(url.length>limit)url=canvas.toDataURL('image/webp',.6);if(url.length>limit)throw Error('La imagen es demasiado compleja. Elige una mas pequeña.');
      if(!active()||version!==revision)return;edit.elements[isPage?'pageLogoUrl':'logoUrl'].value=url;edit.elements[isPage?'pageLogoLink':'logoLink'].value='';previewPage();message('Logo preparado. Puedes revisarlo en Vista previa antes de guardar.');
    }finally{URL.revokeObjectURL(objectUrl);}
  });}
  logoFile.addEventListener('change',()=>prepareLogo(logoFile,false));pageFile.addEventListener('change',()=>prepareLogo(pageFile,true));
  $('[data-space-delete]').addEventListener('click',()=>{if(current)remove(current.space.id);});
  trash.addEventListener('click',event=>{const id=event.target.closest('[data-space-restore]')?.dataset.spaceRestore,space=data?.spaces.find(s=>s.id===id);if(!space||!discard())return;run(async()=>{await call('restore',{spaceId:id,version:space.version,confirmed:true});await load();await show(id,{force:true});message('Restaurado y oculto. Revisa su vista previa antes de mostrarlo.');});});
  $('[data-space-sync]').addEventListener('click',()=>{if(!current||!discard())return;run(async()=>{const id=current.space.id;await call('sync',{spaceId:id});await show(id,{force:true,scroll:false});message('Integrantes actualizados desde R2Beat.');});});
  grant.addEventListener('submit',event=>{event.preventDefault();if(!current)return;run(async()=>{const id=current.space.id,f=grant.elements;await call('grant',{spaceId:id,memberId:f.memberId.value,enabled:f.enabled.checked,dailyLimit:Number(f.dailyLimit.value),weeklyLimit:Number(f.weeklyLimit.value),...Object.fromEntries(Object.keys(perms).map(key=>[key,f[key].checked]))});const latest=await call('detail',{spaceId:id});if(current?.space.id===id){current.grants=latest.grants;renderGrants();}message('Responsable y permisos guardados. Tus cambios pendientes de la pagina se conservan.');});});
  $('[data-space-grants]').addEventListener('click',event=>{const id=event.target.closest('[data-space-grant-edit]')?.dataset.spaceGrantEdit,g=current?.grants.find(g=>g.id===id);if(!g)return;grant.elements.memberId.value=id.slice('operator_'.length);for(const key of [...Object.keys(perms),'enabled'])grant.elements[key].checked=g[key];grant.elements.dailyLimit.value=g.dailyLimit;grant.elements.weeklyLimit.value=g.weeklyLimit;grant.scrollIntoView({behavior:'smooth',block:'center'});});
  section.addEventListener('toggle',()=>{if(section.open&&active()&&!isDirty())load();});
  new MutationObserver(()=>{if(active())load();else{revision++;current=data=null;savedSignature='';list.innerHTML=trash.innerHTML=context.innerHTML='';detail.hidden=true;logoFile.value=pageFile.value='';logoPreview.removeAttribute('src');pageImage.removeAttribute('src');if(viewer.open)viewer.close();message('');}}).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
  if(active())load();
})();
