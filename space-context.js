// A full page reload on selection clears in-flight UI state. The main circle keeps its old keys and URLs.
window.mazinoSpaceId='main';
try{const saved=sessionStorage.getItem('mazino-selected-circle');if(/^[a-f0-9]{32}$/.test(saved||''))window.mazinoSpaceId=saved;}catch{}
function spaceStorageKey(key){return window.mazinoSpaceId==='main'?key:`${key}:circle:${window.mazinoSpaceId}`;}
function spaceApiUrl(url){if(window.mazinoSpaceId==='main')return url;return `${url}${url.includes('?')?'&':'?'}circle=${window.mazinoSpaceId}`;}
async function initializePublicSpaces(service) {
  const root=document.querySelector('[data-circle-selector]');if(!root)return;
  let spaces=[];
  try{const response=await fetch(`${service}/api/spaces`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const result=await response.json();
    if(!Array.isArray(result.spaces)||result.spaces.length>10||result.spaces.some(s=>!s||!(s.id==='main'||/^[a-f0-9]{32}$/.test(s.id))||typeof s.name!=='string'||!s.name||!['circle','group'].includes(s.kind)))throw Error();spaces=result.spaces;
    if(!spaces.some(s=>s.id===window.mazinoSpaceId)){sessionStorage.removeItem('mazino-selected-circle');location.reload();return;}
    window.mazinoSpaceKind=spaces.find(s=>s.id===window.mazinoSpaceId).kind;
  }catch{root.hidden=true;return;}
  root.hidden=spaces.length<2;
  const select=root.querySelector('select');select.replaceChildren(...spaces.map(space=>{const option=document.createElement('option');option.value=space.id;option.textContent=space.name;return option;}));select.value=window.mazinoSpaceId;
  select.addEventListener('change',()=>{try{if(select.value==='main')sessionStorage.removeItem('mazino-selected-circle');else sessionStorage.setItem('mazino-selected-circle',select.value);location.reload();}catch{select.value=window.mazinoSpaceId;root.querySelector('[data-circle-selector-status]').textContent='Permite el almacenamiento de sesion en tu navegador para cambiar de circulo.';}});
  const join=document.querySelector('[data-guest-access]');if(join){join.hidden=window.mazinoSpaceKind!=='group';}
}
