// Only public appearance is passed to this private preview. No service requests or sessions.
(() => {
  if(window.parent===window)return;
  const parentOrigin=document.currentScript?.src?new URL(document.currentScript.src).origin:location.origin;
  let presentation=null;
  const node=s=>document.querySelector(s);
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.type!=='mazino-space-preview')return;
    const data=event.data.presentation;
    if(!data?.space||!data.settings||!(data.space.id==='main'||/^[a-f0-9]{32}$/.test(data.space.id))||!['circle','group'].includes(data.space.kind))return;
    window.mazinoSpaceId=data.space.id;window.mazinoSpaceKind=data.space.kind;window.mazinoSpaceBrand=null;
    const brand={...data.space,spaceId:data.space.id,revision:data.space.version||1};
    presentation=circleContactSettings(data.settings,brand);
    node('#hero-title').textContent=data.space.name;
    node('.hero .eyebrow').textContent=data.space.kind==='group'?'GRUPO DE INVITADOS':'CIRCULO';
    const welcome=node('[data-field="heroPhrase"]');welcome.textContent=presentation.heroPhrase||'';welcome.hidden=!presentation.heroPhrase?.trim();
    applyCircleTheme(presentation,brand);
    for(const button of document.querySelectorAll('[data-join-open]')){
      button.hidden=data.space.kind==='group'&&!presentation.whatsappUrl;
      button.disabled=!presentation.joinEnabled;button.querySelector('span').textContent=button.disabled?'WHATSAPP NO CONFIGURADO':presentation.joinButtonText;
    }
    const guest=node('[data-guest-section]');if(guest){guest.hidden=data.space.kind!=='group';for(const button of guest.querySelectorAll('button')){button.disabled=true;button.title='El registro se utiliza en la pagina publicada.';}}
    node('[data-preview-note]').textContent=(data.unsaved?'Borrador sin guardar':'Configuracion guardada')+' · '+(data.space.enabled?'Visible':'Oculto')+' · Esta vista no cambia su visibilidad.';
    const title=node('[data-join-title]');title.textContent=(presentation.contactMode==='contact'?'Contactar al lider de ':'Unirme a ')+presentation.contactName;
    node('[data-join-kicker]').textContent='COMPROBAR WHATSAPP';
    node('[data-preview-destination]').hidden=true;
    const dialog=node('[data-join-dialog]');if(dialog.open)dialog.close();
    node('.site-shell').hidden=false;
  });
  node('[data-join-close]').addEventListener('click',()=>node('[data-join-dialog]').close());
  for(const button of document.querySelectorAll('[data-join-open]'))button.addEventListener('click',()=>{
    if(button.disabled||!presentation)return;
    node('[data-join-form]').reset();node('[data-preview-destination]').hidden=true;node('[data-join-dialog]').showModal();
  });
  const showDestination=event=>{
    event.preventDefault();if(!presentation)return;
    const form=node('[data-join-form]');if(form.reportValidity&&!form.reportValidity())return;
    const nick=node('[name="nick"]').value.trim();if(!nick)return;
    const destination=circleWhatsAppLink(presentation,nick),box=node('[data-preview-destination]'),link=node('[data-preview-whatsapp]');
    if(!destination)return;
    link.href=destination;node('[data-preview-url]').textContent=destination;box.hidden=false;
  };
  node('[data-preview-check]').addEventListener('click',showDestination);
  node('[data-join-form]').addEventListener('submit',showDestination);
  node('[data-join-form]').addEventListener('keydown',event=>{if(event.key==='Enter')showDestination(event);});
  window.parent.postMessage({type:'mazino-space-preview-ready'},parentOrigin);
})();
