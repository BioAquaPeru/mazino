(function(root){
 const marks={'':'Sin marca',yellow:'En observacion',red:'Lo retire'};
 const result=r=>r.status==='fulfilled'?'Cumplio':r.status==='missing'||r.donated==null?'Sin datos suficientes':r.status==='shortfall'?'No cumplio':'No alcanzo aun';
 const number=n=>n==null?'Sin registro':Number(n).toLocaleString('es-PE');
 function lines(ctx,value,width){const output=[];for(const paragraph of String(value||'—').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){for(const part of word.match(/.{1,25}/gu)||['']){const next=line?line+' '+part:part;if(ctx.measureText(next).width>width&&line){output.push(line);line=part;}else line=next;}}output.push(line);}return output;}
 function pageSize(count,options={}){
  if(options.pages===1||options.pages===2)return Math.max(1,Math.ceil(count/options.pages));
  const n=Number(options.perPage);return Number.isInteger(n)&&n>=1&&n<=200?n:10;
 }
 function canvases(report,notes,title,options={}){
  const perPage=pageSize(report.entries.length,options);
  const pages=[];for(let offset=0;offset<report.entries.length;offset+=perPage){
   const rows=report.entries.slice(offset,offset+perPage),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=1200;ctx.font='18px Arial';
   const prepared=rows.map(r=>{const note=notes[r.memberId]||{};const cells=[r.nick,number(report.target),number(r.donated),result(r),`${marks[note.mark||'']}${note.observation?'\n'+note.observation:''}`];const wrapped=cells.map((v,i)=>lines(ctx,v,[174,120,125,175,442][i]));return{note,wrapped,height:Math.max(44,...wrapped.map(v=>v.length*23+26))};});
   canvas.height=215+prepared.reduce((n,r)=>n+r.height,0)+50;if(canvas.height>32000)throw Error('La hoja es demasiado larga. Elige mas hojas o menos integrantes por hoja.');ctx.fillStyle='#101116';ctx.fillRect(0,0,1200,canvas.height);ctx.fillStyle='#fff';ctx.font='bold 29px Arial';ctx.fillText(String(title||'MAZINO').slice(0,60),28,46);ctx.font='21px Arial';ctx.fillText('REPORTE DE DONACIONES',28,83);ctx.font='18px Arial';ctx.fillStyle='#c7cbd5';ctx.fillText(`${report.start} al ${report.end}  ·  Meta: ${number(report.target)} Rcoin`,28,119);ctx.fillText(`${String(report.goalTitle||'Consulta entre fechas').slice(0,65)}  ·  Pagina ${pages.length+1} de ${Math.ceil(report.entries.length/perPage)}`,28,149);
   const xs=[28,222,363,513,710];ctx.fillStyle='#292c36';ctx.fillRect(20,171,1160,35);ctx.fillStyle='#fff';ctx.font='bold 17px Arial';['NICK','META','DONADO','RESULTADO','MARCA / OBSERVACION'].forEach((v,i)=>ctx.fillText(v,xs[i],194));let y=210;ctx.font='18px Arial';
   for(const row of prepared){ctx.fillStyle=row.note.mark==='red'?'#43232b':row.note.mark==='yellow'?'#40371c':'#1b1e26';ctx.fillRect(20,y,1160,row.height-3);ctx.fillStyle=row.note.mark==='red'?'#ff7d8c':row.note.mark==='yellow'?'#ffe182':'#eef0f5';ctx.fillRect(20,y,5,row.height-3);row.wrapped.forEach((cell,i)=>cell.forEach((v,j)=>ctx.fillText(v,xs[i],y+27+j*23)));y+=row.height;}
   ctx.fillStyle='#b5bbc9';ctx.font='15px Arial';ctx.fillText('Donado en el periodo consultado. Las marcas son decisiones manuales; no cambian el circulo.',28,canvas.height-18);pages.push(canvas);
  }return pages;
 }
 function downloadPages(images,prefix){
  if(!images.length)throw Error('Genera la vista previa antes de descargar.');
  if(images.some(url=>!url.startsWith('data:image/png;base64,')))throw Error('La imagen del reporte no es valida.');
  images.forEach((url,i)=>{const a=document.createElement('a');a.href=url;a.download=`${prefix}-${String(i+1).padStart(2,'0')}.png`;document.body.append(a);a.click();a.remove();});
 }
 function open({report,title='MAZINO',canEdit=true,save,isCurrent=()=>true}){
  if(!report?.entries?.length)throw Error('No hay integrantes en el resultado filtrado.');
  const notes=JSON.parse(JSON.stringify(report.notes||{})),dirty=new Set(),dialog=document.createElement('dialog');
  dialog.className='donation-export-dialog';dialog.setAttribute('aria-label','Reporte de donaciones');
  const style=document.createElement('style');style.textContent=`
  .donation-export-dialog{box-sizing:border-box;width:min(1050px,calc(100vw - 24px));height:90dvh;max-height:90dvh;overflow:hidden;background:#141116;color:#fff;border:1px solid #76515e;border-radius:12px;padding:0;font:15px/1.5 Arial}
  .donation-export-dialog[open]{display:flex;flex-direction:column}.donation-export-dialog::backdrop{background:#000c}
  .donation-export-dialog header,.donation-export-actions,.donation-export-toolbar,.donation-export-tabs,.donation-export-navigation{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  .donation-export-dialog header{padding:12px 20px;border-bottom:1px solid #4e3b45;flex-shrink:0}.donation-export-dialog h2{margin:0;font-size:20px}
  .donation-export-body{overflow:auto;min-height:0;flex:1;padding:16px 20px}.donation-export-actions{padding:12px 20px;background:#211a21;border-top:1px solid #76515e;flex-shrink:0}
  .donation-export-dialog button{min-height:42px;padding:8px 14px;background:#30232c;color:#fff;border:1px solid #80616e;border-radius:6px;cursor:pointer}.donation-export-dialog button:disabled{opacity:.5;cursor:default}.donation-export-dialog button[aria-selected=true]{background:#8d1835;border-color:#ff758e}
  .donation-export-dialog input,.donation-export-dialog select{box-sizing:border-box;width:100%;min-height:42px;padding:9px;background:#231d23;color:#fff;border:1px solid #72535f;border-radius:5px}.donation-export-toolbar{justify-content:flex-start;margin:14px 0}.donation-export-toolbar label{flex:1;min-width:150px}.donation-export-dialog [hidden]{display:none!important}
  .donation-export-row{display:grid;grid-template-columns:minmax(100px,1fr) 160px minmax(180px,2fr);gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #4e3b45}.donation-export-row[data-mark=yellow]{border-left:5px solid #f5d35d;padding-left:10px}.donation-export-row[data-mark=red]{border-left:5px solid #ff697d;padding-left:10px}.donation-export-row small{display:block;color:#d4bdc7}
  .donation-export-preview img{display:block;width:100%;height:auto;margin:12px 0}.donation-export-navigation{position:sticky;top:-16px;background:#141116;padding:10px 0;z-index:1}.donation-export-status{margin:0;flex-basis:100%;font-size:13px;color:#edccd7}
  @media(max-width:600px){.donation-export-row{grid-template-columns:1fr}.donation-export-dialog header,.donation-export-actions{padding:10px}.donation-export-body{padding:12px}.donation-export-dialog h2{font-size:17px}.donation-export-actions button{flex:1 1 calc(50% - 10px);padding:8px}.donation-export-toolbar label{min-width:120px}.donation-export-navigation{top:-12px}}
  `;dialog.append(style);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const button=text=>{const n=el('button',text);n.type='button';return n;};
  const select=(name,choices)=>{const n=el('select');n.setAttribute('aria-label',name);for(const [value,text] of choices){const o=el('option',text);o.value=value;n.append(o);}return n;};
  const labeled=(text,control)=>{const n=el('label',text);n.append(control);return n;};
  let busy=false,images=[],page=0,view='edit';
  const header=el('header'),close=button('Cerrar ✕');header.append(el('h2','Reporte de donaciones'),close);dialog.append(header);
  const body=el('div');body.className='donation-export-body';dialog.append(body);
  body.append(el('p',`${title} · ${report.start} al ${report.end} · ${report.entries.length} integrantes. Amarillo: en observacion. Rojo: lo retire. Las marcas no expulsan a nadie.`));
  const tabs=el('div');tabs.className='donation-export-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Secciones del reporte');
  const editTab=button('Editar observaciones'),previewTab=button('Vista previa');for(const n of [editTab,previewTab])n.setAttribute('role','tab');tabs.append(editTab,previewTab);body.append(tabs);
  const toolbar=el('div');toolbar.className='donation-export-toolbar';
  const filter=select('Ver marcas en este reporte',[['all','Todos'],['yellow','Amarillo: en observacion'],['red','Rojo: lo retire'],['','Sin marca']]);
  const layout=select('Distribucion del reporte',[['1','1 hoja'],['2','2 hojas'],['custom','Personalizado']]);layout.value='2';
  const custom=el('input');custom.type='number';custom.min='1';custom.max='200';custom.step='1';custom.value='22';custom.setAttribute('aria-label','Integrantes por hoja');
  const customLabel=labeled('Integrantes por hoja',custom);customLabel.hidden=true;
  toolbar.append(labeled('Ver marcas',filter),labeled('Distribucion',layout),customLabel);body.append(toolbar);
  const list=el('div'),preview=el('div');preview.className='donation-export-preview';body.append(list,preview);
  const navigation=el('div');navigation.className='donation-export-navigation';const previous=button('Anterior'),next=button('Siguiente'),pageLabel=el('span');pageLabel.setAttribute('aria-live','polite');navigation.append(previous,pageLabel,next);const image=el('img'),empty=el('p','Elige la distribucion y pulsa Generar vista previa.');preview.append(navigation,image,empty);
  const actions=el('footer');actions.className='donation-export-actions';const status=el('p');status.className='donation-export-status';status.setAttribute('role','status');const saveButton=button('Guardar observaciones'),previewButton=button('Generar vista previa'),download=button('Descargar hoja'),downloadAll=button('Descargar todas las hojas');saveButton.hidden=!canEdit;actions.append(status,saveButton,previewButton,download,downloadAll);dialog.append(actions);
  const selected=()=>report.entries.filter(r=>filter.value==='all'||(notes[r.memberId]?.mark||'')===filter.value);
  function showPage(){const ready=!!images.length;navigation.hidden=image.hidden=!ready;empty.hidden=ready;download.disabled=downloadAll.disabled=!ready||busy;previous.disabled=page===0;next.disabled=page===images.length-1;if(ready){image.src=images[page];image.alt=`Reporte de donaciones, pagina ${page+1}`;pageLabel.textContent=`Hoja ${page+1} de ${images.length}`;download.textContent=`Descargar hoja ${page+1} de ${images.length}`;}}
  function changeView(value){view=value;list.hidden=view!=='edit';preview.hidden=view!=='preview';editTab.setAttribute('aria-selected',String(view==='edit'));previewTab.setAttribute('aria-selected',String(view==='preview'));body.scrollTop=0;}
  function invalidate(){images=[];page=0;showPage();}
  function render(){list.replaceChildren();for(const row of selected()){const block=el('section');block.className='donation-export-row';block.dataset.mark=notes[row.memberId]?.mark||'';const label=el('div',row.nick);label.append(el('small',`${number(row.donated)} / ${number(report.target)} · ${result(row)}`));const mark=select('Marca de '+row.nick,Object.entries(marks));mark.value=notes[row.memberId]?.mark||'';const note=el('input');note.maxLength=300;note.value=notes[row.memberId]?.observation||'';note.setAttribute('aria-label','Observacion de '+row.nick);note.placeholder='Escribe tu observacion';mark.disabled=note.disabled=!canEdit||busy;const change=()=>{notes[row.memberId]={mark:mark.value,observation:note.value};dirty.add(row.memberId);block.dataset.mark=mark.value;status.textContent='Cambios pendientes. Guarda las observaciones para conservarlas.';invalidate();};mark.onchange=note.oninput=change;block.append(label,mark,note);list.append(block);}}
  function generate(){try{if(!isCurrent())throw Error('Vuelve a abrir el reporte de esta sesion.');const rows=selected();if(!rows.length)throw Error('No hay integrantes con esa marca.');if(dirty.size)throw Error('Guarda tus observaciones antes de generar la imagen.');const options=layout.value==='custom'?{perPage:Number(custom.value)}:{pages:Number(layout.value)};if(layout.value==='custom'&&(!Number.isInteger(options.perPage)||options.perPage<1||options.perPage>200))throw Error('Elige entre 1 y 200 integrantes por hoja.');images=canvases({...report,entries:rows},notes,title,options).map(c=>c.toDataURL('image/png'));page=Math.min(page,images.length-1);showPage();changeView('preview');status.textContent=`${rows.length} integrantes · ${images.length} ${images.length===1?'hoja':'hojas'}. Revisa cada pagina antes de descargar.`;}catch(e){status.textContent=e.message;}}
  editTab.onclick=()=>changeView('edit');previewTab.onclick=()=>{if(!images.length)generate();else changeView('preview');};previewButton.onclick=generate;
  filter.onchange=()=>{render();invalidate();if(view==='preview')generate();};
  layout.onchange=()=>{customLabel.hidden=layout.value!=='custom';invalidate();if(view==='preview')generate();};custom.onchange=()=>{invalidate();if(view==='preview')generate();};
  previous.onclick=()=>{if(page>0){page--;showPage();body.scrollTop=0;}};next.onclick=()=>{if(page<images.length-1){page++;showPage();body.scrollTop=0;}};
  download.onclick=()=>{if(!isCurrent()){status.textContent='Vuelve a abrir el reporte de esta sesion.';return;}if(!images[page])return;const a=el('a');a.href=images[page];a.download=`donaciones-${report.start}-${report.end}-${page+1}.png`;a.click();};
  downloadAll.onclick=()=>{try{if(!isCurrent())throw Error('Vuelve a abrir el reporte de esta sesion.');if(busy||!images.length)return;downloadPages(images,`donaciones-${report.start}-${report.end}`);status.textContent=`Se solicitaron ${images.length} descargas PNG. Si falta alguna hoja, permite varias descargas en tu navegador y vuelve a pulsar el boton.`;}catch(e){status.textContent=e.message;}};
  saveButton.onclick=async()=>{if(busy)return;if(!dirty.size){status.textContent='No hay cambios pendientes.';return;}busy=true;saveButton.disabled=previewButton.disabled=editTab.disabled=previewTab.disabled=filter.disabled=layout.disabled=custom.disabled=true;download.disabled=downloadAll.disabled=true;list.querySelectorAll('input,select').forEach(n=>n.disabled=true);try{if(!isCurrent())throw Error('La sesion o el circulo cambio. Vuelve a abrir el reporte.');await save([...dirty].map(memberId=>({memberId,...notes[memberId]})));if(!isCurrent())return;dirty.clear();status.textContent='Observaciones guardadas. El historial y los totales se conservan.';}catch(e){status.textContent=e.message;}finally{busy=false;saveButton.disabled=previewButton.disabled=editTab.disabled=previewTab.disabled=filter.disabled=layout.disabled=custom.disabled=false;list.querySelectorAll('input,select').forEach(n=>n.disabled=!canEdit);showPage();}};
  const requestClose=()=>{if(busy){status.textContent='Espera a que termine de guardar.';return;}if(dirty.size&&!root.confirm('Hay observaciones sin guardar. ¿Cerrar y descartar estos cambios?'))return;dialog.close();};
  close.onclick=requestClose;dialog.oncancel=e=>{e.preventDefault();requestClose();};dialog.onclose=()=>dialog.remove();document.body.append(dialog);render();showPage();changeView('edit');dialog.showModal();return()=>dialog.close();
 }

 root.MazinoDonationReport={open,canvases,pageSize,downloadPages,result,marks};
})(typeof window==='undefined'?globalThis:window);
