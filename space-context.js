// A full page reload on selection clears in-flight UI state. The main circle keeps its old keys and URLs.
window.mazinoSpaceId='main';
try{const saved=sessionStorage.getItem('mazino-selected-circle');if(/^[a-f0-9]{32}$/.test(saved||''))window.mazinoSpaceId=saved;}catch{}
function spaceStorageKey(key){return window.mazinoSpaceId==='main'?key:`${key}:circle:${window.mazinoSpaceId}`;}
function spaceApiUrl(url){if(window.mazinoSpaceId==='main')return url;return `${url}${url.includes('?')?'&':'?'}circle=${window.mazinoSpaceId}`;}
function publicSpaceLogo(value,limit=60000){return typeof value==='string'&&value.length<=limit&&(/^(https:\/\/[^\s<>"']+|\/assets\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp|gif))$/.test(value)||/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value))?value:'';}
async function initializePublicSpaces(service) {
  const root=document.querySelector('[data-circle-selector]');if(!root)return;
  let spaces=[];
  try{const response=await fetch(`${service}/api/spaces`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const result=await response.json();
    if(!Array.isArray(result.spaces)||result.spaces.length>10||result.spaces.some(s=>!s||!(s.id==='main'||/^[a-f0-9]{32}$/.test(s.id))||typeof s.name!=='string'||!s.name||!['circle','group'].includes(s.kind)))throw Error();spaces=result.spaces.filter(s=>s.enabled!==false&&s.ready!==false&&!s.deletedAt);
    if(!spaces.some(s=>s.id===window.mazinoSpaceId)){sessionStorage.removeItem('mazino-selected-circle');location.reload();return;}
    window.mazinoSpaceKind=spaces.find(s=>s.id===window.mazinoSpaceId).kind;
  }catch{root.hidden=true;return;}
  root.hidden=spaces.length<2;
  const tabs=root.querySelector('[data-circle-tabs]');
  const trigger=root.querySelector('[data-circle-menu-open]'),drawer=root.querySelector('[data-circle-drawer]');
  const status=root.querySelector('[data-circle-selector-status]');
  const closeMenu=()=>{if(drawer.open)drawer.close();};
  if(!root.circleMenuBound){
    root.circleMenuBound=true;
    trigger.addEventListener('click',()=>{if(root.hidden||drawer.open)return;status.textContent='';drawer.showModal();trigger.setAttribute('aria-expanded','true');});
    root.querySelector('[data-circle-menu-close]').addEventListener('click',closeMenu);
    drawer.addEventListener('close',()=>trigger.setAttribute('aria-expanded','false'));
    drawer.addEventListener('click',event=>{if(event.target!==drawer)return;const bounds=drawer.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeMenu();});
  }
  if(root.hidden)closeMenu();
  const icons={circle:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M6 12s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Z"/><circle cx="12" cy="12" r="1.5"/></svg>',group:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5"/></svg>'};
  const appearance=(element,space)=>{
    const color=/^#[a-f0-9]{6}$/i.test(space.tabColor||'')?space.tabColor:'#ff506a';
    element.style.setProperty('--circle-color',color);element.style.setProperty('--circle-rgb',[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(','));
  };
  const fillIcon=(icon,space)=>{
    icon.innerHTML=icons[space.kind];
    const logo=publicSpaceLogo(space.logoUrl);
    if(logo){const image=document.createElement('img');image.src=logo;image.alt='';image.width=28;image.height=28;image.decoding='async';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{icon.innerHTML=icons[space.kind];},{once:true});icon.replaceChildren(image);}
  };
  const current=spaces.find(space=>space.id===window.mazinoSpaceId);
  window.mazinoSpaceBrand={...current,spaceId:current.id,revision:current.version||1};
  appearance(trigger,current);fillIcon(root.querySelector('[data-circle-current-icon]'),current);
  root.querySelector('[data-circle-current-name]').textContent=current.name;
  trigger.setAttribute('aria-label',`Cambiar de circulo o grupo. Actual: ${current.name}`);
  tabs.replaceChildren(...spaces.map(space=>{
    const button=document.createElement('button');button.type='button';button.className='circle-tab';
    appearance(button,space);
    if(space.id===window.mazinoSpaceId)button.setAttribute('aria-current','page');
    const icon=document.createElement('span');icon.className='circle-tab-icon';fillIcon(icon,space);
    const name=document.createElement('span');name.className='circle-tab-name';name.textContent=space.name;
    const description=document.createElement('small');description.textContent=space.id===window.mazinoSpaceId?'Estas aqui':space.kind==='group'?'Grupo de invitados':'Circulo de R2Beat';
    const text=document.createElement('span');text.className='circle-option-text';text.append(name,description);
    button.append(icon,text);
    button.addEventListener('click',()=>{
      if(space.id===window.mazinoSpaceId){closeMenu();return;}
      try{if(space.id==='main')sessionStorage.removeItem('mazino-selected-circle');else sessionStorage.setItem('mazino-selected-circle',space.id);closeMenu();location.reload();}
      catch{status.textContent='Permite el almacenamiento de sesion en tu navegador para cambiar de circulo.';}
    });
    return button;
  }));
  const join=document.querySelector('[data-guest-access]');if(join){join.hidden=window.mazinoSpaceKind!=='group';}
  const guestSection=document.querySelector('[data-guest-section]');if(guestSection)guestSection.hidden=window.mazinoSpaceKind!=='group';
}
