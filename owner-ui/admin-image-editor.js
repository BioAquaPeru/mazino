/* Local-only image preparation. No image leaves this editor before Guardar imagen. */
(() => {
  function create({root,onChange,onStatus,onFile}) {
    root.innerHTML=`<div class="batch-paste-area" tabindex="0" role="group" aria-label="Pegar imagen del lote"><strong>Pega tu imagen aqui con Ctrl + V</strong><p>Copia la imagen de Excel o un recorte de pantalla. Primero elige el lote.</p><button type="button" class="ghost-button" data-edit-paste>Pegar imagen</button></div>
    <div data-edit-workspace hidden><p class="muted">Arrastra sobre el original para marcar el recorte. Tambien puedes escribir las medidas. Nada se guarda hasta pulsar Guardar imagen.</p>
    <div class="batch-edit-comparison"><section><h4>Original / recorte</h4><canvas data-edit-source tabindex="0" aria-label="Original: arrastra para seleccionar el recorte"></canvas><p data-edit-size></p></section><section><h4>Resultado pendiente</h4><canvas data-edit-result aria-label="Resultado con transparencia"></canvas><p data-edit-result-info></p></section></div>
    <fieldset class="batch-crop-fields"><legend>Recortar imagen (pixeles)</legend><label>Izquierda<input type="number" min="0" step="1" data-edit-x value="0"></label><label>Arriba<input type="number" min="0" step="1" data-edit-y value="0"></label><label>Ancho<input type="number" min="1" step="1" data-edit-width></label><label>Alto<input type="number" min="1" step="1" data-edit-height></label></fieldset>
    <div class="editor-actions"><button type="button" class="ghost-button" data-edit-crop>Aplicar recorte</button><button type="button" class="ghost-button" data-edit-reset-crop>Seleccionar toda</button></div>
    <div class="batch-blue-controls"><button type="button" class="ghost-button" data-edit-remove>Quitar fondo azul</button><label>Intensidad <output data-edit-intensity-value>42</output><input type="range" min="10" max="100" value="42" data-edit-intensity></label><label>Color del fondo<input type="color" value="#495e8b" data-edit-color></label><button type="button" class="ghost-button" data-edit-pick>Elegir azul en imagen</button></div>
    <div class="editor-actions"><button type="button" class="ghost-button" data-edit-background>Restaurar fondo</button><button type="button" class="ghost-button" data-edit-restore>Restaurar original</button></div>
    <p class="muted">El cuadriculado representa transparencia. Se conserva el centro negro y se protegen los brillos; revisa el resultado antes de guardar.</p></div>`;
    const $=name=>root.querySelector(`[data-edit-${name}]`),source=$('source'),resultCanvas=$('result');
    let original=null,working=null,selection=null,keyColor=null,remove=false,picking=false,disabled=true,loading=false,epoch=0,drag=null;
    const fields=['x','y','width','height'];
    const copy=image=>({width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)});
    const put=(canvas,image)=>{canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);};
    const hex=color=>'#'+color.map(n=>n.toString(16).padStart(2,'0')).join('');
    const inputColor=()=>[1,3,5].map(i=>parseInt($('color').value.slice(i,i+2),16));
    function controls() {
      for(const node of root.querySelectorAll('button,input'))node.disabled=disabled||loading||(!working&&node!==$('paste'));
      $('background').disabled=disabled||loading||!remove;
      $('crop').disabled=disabled||loading||!working||!selection;
      root.querySelector('.batch-paste-area').setAttribute('aria-disabled',String(disabled||loading));
    }
    function selectionFields() {
      if(!working)return;
      const r=selection||{x:0,y:0,width:working.width,height:working.height};
      for(const field of fields)$ (field).value=r[field];
      $('x').max=working.width-1;$('y').max=working.height-1;$('width').max=working.width;$('height').max=working.height;
    }
    function drawSelection() {
      if(!working)return;
      put(source,working);
      if(selection){const ctx=source.getContext('2d');ctx.fillStyle='rgba(0,0,0,.4)';
        const r=selection;ctx.fillRect(0,0,working.width,r.y);ctx.fillRect(0,r.y+r.height,working.width,working.height-r.y-r.height);ctx.fillRect(0,r.y,r.x,r.height);ctx.fillRect(r.x+r.width,r.y,working.width-r.x-r.width,r.height);
        ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,working.width/400);ctx.setLineDash([5,3]);ctx.strokeRect(r.x+.5,r.y+.5,r.width-1,r.height-1);
      }
      source.classList.toggle('is-picking',picking);
    }
    function encode(image) {
      const canvas=document.createElement('canvas');
      let size=Math.min(960,Math.max(image.width,image.height));
      const raw=document.createElement('canvas');put(raw,image);
      while(size>=1){const ratio=Math.min(1,size/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(raw,0,0,canvas.width,canvas.height);
        // PNG/WebP preserve alpha; JPEG would turn removed backgrounds opaque.
        const png=canvas.toDataURL('image/png');if(png.length<=180000&&CouponImages.safeRaster(png))return png;
        for(const quality of [.92,.84,.76,.66]){const webp=canvas.toDataURL('image/webp',quality);if(webp.length<=180000&&CouponImages.safeRaster(webp))return webp;}
        size=Math.floor(size*.8);
      }throw Error('No se pudo reducir la imagen. Recorta el premio o usa una captura mas pequena.');
    }
    function render() {
      if(!working||disabled)return;
      onChange(null);
      try {const result=remove?BatchImageTools.removeBlueBackground(working,{color:keyColor||undefined,tolerance:Number($('intensity').value)}):copy(working);
        put(resultCanvas,result);drawSelection();selectionFields();$('size').textContent=`${working.width} × ${working.height} px`;
        $('result-info').textContent=remove?(result.removed?'Fondo azul exterior retirado. Revisa los bordes y destellos.':'No se encontro fondo azul exterior con este ajuste. Prueba elegir el azul o recortar primero.'):'Imagen lista. Puedes recortar o quitar el fondo azul.';
        onChange(encode(result));onStatus('Vista previa lista. Revisa el resultado y pulsa Guardar imagen para confirmar.');
      }catch(error){onStatus(error.message);}controls();
    }
    async function load(file) {
      if(disabled)return;
      const current=++epoch;original=working=null;selection=null;keyColor=null;remove=false;picking=false;drag=null;loading=true;$('workspace').hidden=true;onChange(null);controls();
      if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024){loading=false;controls();throw Error('Elige o pega un JPG, PNG o WebP de hasta 5 MB.');}
      const url=URL.createObjectURL(file),image=new Image();
      try {await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('No se pudo leer la imagen. Prueba copiar la imagen de Excel o pegar un recorte de pantalla.'));image.src=url;});
        if(current!==epoch||disabled)return;
        if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32000000)throw Error('La imagen es demasiado grande. Pega un recorte del premio.');
        const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);original=copy(ctx.getImageData(0,0,canvas.width,canvas.height));working=copy(original);
        keyColor=BatchImageTools.detectBlueBackground(working);if(keyColor)$('color').value=hex(keyColor);
        $('intensity').value=42;$('intensity-value').textContent='42';loading=false;$('workspace').hidden=false;render();
      }finally{image.src='';URL.revokeObjectURL(url);if(current===epoch){loading=false;controls();}}
    }
    function coordinates(event){const rect=source.getBoundingClientRect();return {x:Math.max(0,Math.min(working.width-1,Math.floor((event.clientX-rect.left)*working.width/rect.width))),y:Math.max(0,Math.min(working.height-1,Math.floor((event.clientY-rect.top)*working.height/rect.height)))};}
    source.addEventListener('pointerdown',event=>{
      if(disabled||loading||!working||event.button!==0)return;event.preventDefault();const p=coordinates(event);
      if(picking){const offset=(p.y*working.width+p.x)*4;keyColor=Array.from(working.data.slice(offset,offset+3));$('color').value=hex(keyColor);picking=false;render();return;}
      drag=p;source.setPointerCapture(event.pointerId);selection={x:p.x,y:p.y,width:1,height:1};drawSelection();selectionFields();controls();
    });
    source.addEventListener('pointermove',event=>{if(!drag||!working||disabled)return;const p=coordinates(event);selection={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),width:Math.abs(p.x-drag.x)+1,height:Math.abs(p.y-drag.y)+1};drawSelection();selectionFields();controls();});
    const endDrag=()=>{drag=null;};source.addEventListener('pointerup',endDrag);source.addEventListener('pointercancel',endDrag);
    for(const field of fields)$(field).addEventListener('input',()=>{if(!working||disabled)return;const values=fields.map(name=>Number($(name).value));if(values.some(n=>!Number.isSafeInteger(n)))return;
      const [x,y,w,h]=values;if(x<0||y<0||w<1||h<1||x>=working.width||y>=working.height){selection=null;controls();return;}
      selection={x,y,width:Math.min(w,working.width-x),height:Math.min(h,working.height-y)};drawSelection();controls();
    });
    $('crop').addEventListener('click',()=>{if(disabled||!working||!selection)return;working=BatchImageTools.crop(working,selection);selection=null;picking=false;if(!keyColor)keyColor=BatchImageTools.detectBlueBackground(working);render();});
    $('reset-crop').addEventListener('click',()=>{if(disabled||!working)return;selection=null;drawSelection();selectionFields();controls();});
    $('remove').addEventListener('click',()=>{if(disabled||!working)return;remove=true;render();});
    $('background').addEventListener('click',()=>{if(disabled||!working)return;remove=false;render();});
    $('restore').addEventListener('click',()=>{if(disabled||!original)return;working=copy(original);selection=null;remove=false;picking=false;keyColor=BatchImageTools.detectBlueBackground(working);if(keyColor)$('color').value=hex(keyColor);render();});
    $('intensity').addEventListener('input',()=>{$('intensity-value').textContent=$('intensity').value;if(remove)render();});
    $('color').addEventListener('input',()=>{keyColor=inputColor();if(remove)render();});
    $('pick').addEventListener('click',()=>{if(disabled||!working)return;picking=true;drawSelection();onStatus('Toca una zona azul exterior en la imagen original.');});
    $('paste').addEventListener('click',async()=>{
      if(disabled||loading)return;
      if(!navigator.clipboard?.read){onStatus('Haz clic en el recuadro y presiona Ctrl + V. Si Excel copia solo texto, copia la imagen o un recorte de pantalla.');return;}
      const current=epoch;
      try{const entries=await navigator.clipboard.read();if(current!==epoch||disabled)return;
        for(const item of entries){const type=item.types.find(type=>['image/png','image/jpeg','image/webp'].includes(type));if(type){const file=await item.getType(type);if(current===epoch&&!disabled)await onFile(file);return;}}
        onStatus('El portapapeles no contiene una imagen. Copia la imagen de Excel o un recorte de pantalla y vuelve a pegar.');
      }catch{if(current===epoch&&!disabled)onStatus('No se pudo leer el portapapeles. Haz clic en el recuadro y usa Ctrl + V, o sube el archivo.');}
    });
    function reset(){epoch++;original=working=selection=keyColor=drag=null;remove=picking=loading=false;source.width=resultCanvas.width=1;source.height=resultCanvas.height=1;$('workspace').hidden=true;controls();}
    controls();return {load,reset,setDisabled(value){disabled=!!value;controls();}};
  }
  globalThis.MazinoBatchImageEditor={create};
})();
