(function(root){
  const labels = {
    eligible:'Falta asignar',stock:'Faltan cupones en el lote',quota:'Límite de entrega agotado',
    authorization:'Revisar responsable de la entrega',claim:'Pendiente de reclamar',
  };
  const el = (tag,text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const format = value => Number(value).toLocaleString('es-PE');
  root.mountPrizeAlerts = function(host,request,deliver) {
    let report = null, live = true, submitting = false;
    const status = el('p'); status.setAttribute('role','status');
    const deliveryStatus=el('p'); deliveryStatus.setAttribute('role','status');
    const refresh = el('button','Actualizar alertas'); refresh.type='button'; refresh.className='ghost-button';
    const filter = el('select');
    for (const [value,text] of [['all','Todas'],['assignment','Por asignar o revisar'],['claim','Por reclamar'],['goal','Meta en curso']]) {
      const option=el('option',text); option.value=value; filter.append(option);
    }
    const field=el('label','Mostrar alertas '); field.append(filter);
    const tools=el('div'); tools.className='editor-actions staff-actions'; tools.append(field,refresh);
    const wrap=el('div'); wrap.className='admin-table-wrap staff-table-wrap';
    const table=el('table'), head=table.createTHead().insertRow(), rows=table.createTBody();
    table.className='admin-table';
    for (const title of ['Integrante','Grupo de donación','Premio y categoría','Qué le falta','Acción']) {
      const th=el('th',title); th.scope='col'; head.append(th);
    }
    wrap.append(table); host.replaceChildren(tools,status,deliveryStatus,wrap);

    function render() {
      rows.replaceChildren();
      if (!report) return;
      const matching=report.rows.filter(row=>{
        if (filter.value==='all') return true;
        if (filter.value==='claim') return row.status==='claim';
        if (filter.value==='goal') return row.remaining!=null;
        return row.status!=='claim' && row.remaining==null;
      });
      for (const row of matching) {
        const tr=rows.insertRow();
        const missing=row.remaining==null ? labels[row.status] : `Le faltan ${format(row.remaining)} Rcoin para la meta`;
        for (const value of [row.nick,row.groupName || 'Sin grupo',`${row.quantity>1?`${row.quantity} × `:''}${row.label} · ${row.category || 'Sin categoría'}`,missing]) {
          tr.insertCell().textContent=value;
        }
        const actions=tr.insertCell();
        if (row.canDeliver && deliver) {
          const button=el('button','Entregar obsequio'); button.type='button'; button.className='ghost-button';
          button.disabled=submitting;
          button.addEventListener('click',()=>void send(row));
          actions.append(button);
        }
      }
      status.textContent=`${report.counts.assignment} por asignar o revisar · ${report.counts.claim} por reclamar${matching.length?'':'. Sin alertas con este filtro.'}`;
    }
    async function send(row) {
      if (submitting || refresh.disabled || !root.confirm(`¿Entregar «${row.label}» a ${row.nick}?`)) return;
      submitting=true;render();
      deliveryStatus.textContent='Asignando obsequio…';
      try {
        const result=await deliver({memberId:row.memberId,periodEnd:row.periodEnd,label:row.label});
        if (!live) return;
        deliveryStatus.textContent=`${result.label} asignado a ${result.nick}. Ya puede reclamarlo.`;
      } catch(error) {
        if (live) deliveryStatus.textContent=error.message;
      } finally {
        submitting=false;
        if (live) await load();
      }
    }
    async function load() {
      if (refresh.disabled) return;
      refresh.disabled=true; status.textContent='Consultando alertas…';
      try {
        const result=await request();
        if (!live) return;
        if (!Array.isArray(result.rows) || !result.counts) throw Error('Actualiza el panel para consultar las alertas.');
        report=result;render();
      } catch(error) {
        if (live) status.textContent=error.message;
      } finally {
        refresh.disabled=false;
      }
    }
    filter.addEventListener('change',render);
    refresh.addEventListener('click',()=>{if(!submitting)void load();});
    void load();
    return ()=>{live=false;host.replaceChildren();};
  };
})(globalThis);
