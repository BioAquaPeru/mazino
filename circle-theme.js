// Public presentation only. Member effects, sessions, links and permissions stay scoped as before.
function applyCircleTheme(settings,branding) {
  const id=window.mazinoSpaceId||'main',catalog=window.mazinoSpaceBrand;
  let brand=branding?.spaceId===id?branding:null;
  if(catalog?.spaceId===id&&(!brand||catalog.revision>brand.revision))brand=catalog;
  const extra=id!=='main',valid=value=>/^#[a-f0-9]{6}$/i.test(value||'');
  const custom=!!(brand&&(brand.pageLogoUrl||brand.logoUrl||brand.pageColor||brand.pageBackground||(brand.tabColor&&brand.tabColor!=='#ff506a')));
  const active=extra||custom,body=document.body;
  body.classList.toggle('circle-themed',active);
  body.classList.toggle('circle-custom-logo',extra||!!(brand?.pageLogoUrl||brand?.logoUrl));
  const primary=valid(brand?.pageColor)?brand.pageColor:valid(brand?.tabColor)&&(extra||brand.tabColor!=='#ff506a')?brand.tabColor:'#df101f';
  const background=valid(brand?.pageBackground)?brand.pageBackground:'#000000';
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const mix=(a,b,amount)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-amount)+rgb(b)[i]*amount).toString(16).padStart(2,'0')).join('');
  const light=color=>rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(light(a),light(b))+.05)/(Math.min(light(a),light(b))+.05);
  const foreground=light(background)>.179?'#17111a':'#fff6f3';
  let heading=primary;for(let amount=.1;contrast(heading,background)<4.5&&amount<=1;amount+=.1)heading=mix(primary,foreground,Math.min(amount,1));
  const variables={bg:background,text:foreground,muted:mix(background,foreground,.72),panel:mix(background,foreground,.065),line:mix(background,foreground,.2),accent:primary,rgb:rgb(primary).join(','),heading,'on-accent':light(primary)>.179?'#17111a':'#ffffff'};
  for(const [key,value]of Object.entries(variables))body.style.setProperty('--circle-page-'+key,value);
  const image=document.querySelector('[data-logo]'),placeholder=document.querySelector('[data-circle-emblem]');
  if(!image||!placeholder)return;
  const name=brand?.name||settings.siteName||'Circulo';
  const source=publicSpaceLogo(brand?.pageLogoUrl,240000)||publicSpaceLogo(brand?.logoUrl)||(!extra?settings.logoUrl:'');
  placeholder.textContent=[...name.trim()][0]?.toUpperCase()||'C';
  placeholder.hidden=!!source;image.hidden=!source;
  if(source){image.src=typeof publicAssetUrl==='function'?publicAssetUrl(source):source;image.alt='Logo de '+name;image.onerror=()=>{image.hidden=true;placeholder.hidden=false;body.classList.add('circle-custom-logo');};}
  document.querySelector('.logo-stage')?.setAttribute('aria-label','Logo de '+name);
}
