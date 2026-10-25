// A full page reload on selection clears in-flight UI state. The main circle keeps its old keys and URLs.
window.mazinoSpaceId='main';
try{const saved=sessionStorage.getItem('mazino-selected-circle');if(/^[a-f0-9]{32}$/.test(saved||''))window.mazinoSpaceId=saved;}catch{}
function spaceStorageKey(key){return window.mazinoSpaceId==='main'?key:`${key}:circle:${window.mazinoSpaceId}`;}
function spaceApiUrl(url){if(window.mazinoSpaceId==='main')return url;return `${url}${url.includes('?')?'&':'?'}circle=${window.mazinoSpaceId}`;}
async function initializePublicSpaces(service) {
  const root=document.querySelector('[data-circle-selector]');if(!root)return;
  let spaces=[];
  try{const response=await fetch(`${service}/api/spaces`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const result=await response.json();
    if(!Array.isArray(result.spaces)||result.spaces.length>10||result.spaces.some(s=>!s||!(s.id==='main'||/^[a-f0-9]{32}$/.test(s.id))||typeof s.name!=='string'||!s.name||!['circle','group'].includes(s.kind)))throw Error();spaces=result.spaces.filter(s=>s.enabled!==false&&s.ready!==false);
    if(!spaces.some(s=>s.id===window.mazinoSpaceId)){sessionStorage.removeItem('mazino-selected-circle');location.reload();return;}
    window.mazinoSpaceKind=spaces.find(s=>s.id===window.mazinoSpaceId).kind;
  }catch{root.hidden=true;return;}
  root.hidden=spaces.length===0;
  const tabs=root.querySelector('[data-circle-tabs]');
  const icons={circle:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M6 12s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Z"/><circle cx="12" cy="12" r="1.5"/></svg>',group:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5"/></svg>'};
  tabs.replaceChildren(...spaces.map(space=>{
    const button=document.createElement('button');button.type='button';button.className='circle-tab';
    if(space.id===window.mazinoSpaceId)button.setAttribute('aria-current','page');
    const icon=document.createElement('span');icon.className='circle-tab-icon';icon.innerHTML=icons[space.kind];
    const name=document.createElement('span');name.className='circle-tab-name';name.textContent=space.name;
    button.append(icon,name);
    button.addEventListener('click',()=>{
      if(space.id===window.mazinoSpaceId)return;
      try{if(space.id==='main')sessionStorage.removeItem('mazino-selected-circle');else sessionStorage.setItem('mazino-selected-circle',space.id);location.reload();}
      catch{root.querySelector('[data-circle-selector-status]').textContent='Permite el almacenamiento de sesion en tu navegador para cambiar de circulo.';}
    });
    return button;
  }));
  const join=document.querySelector('[data-guest-access]');if(join){join.hidden=window.mazinoSpaceKind!=='group';}
}
