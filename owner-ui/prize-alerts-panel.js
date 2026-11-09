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
  root.mountPrizeAlerts = function(host,request,deliver,openMember) {
    let report = null, live = true, submitting = false, view='members';
    const views=el('div'); views.className='editor-actions staff-actions'; views.hidden=true;
    const memberView=el('button','Antigüedad y premios'), alertView=el('button','Alertas semanales y reclamos');
    memberView.type=alertView.type='button'; views.append(memberView,alertView);
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
    const search=el('input'), minDays=el('input'), category=el('select'), missingOnly=el('input');
    search.type='search'; search.placeholder='Nick del integrante';
    Object.assign(minDays,{type:'number',min:'0',max:'36500',step:'1',placeholder:'Sin mínimo'});
    missingOnly.type='checkbox';
    const label=(text,control)=>{const field=el('label',text+' ');field.append(control);return field;};
    const criteria=el('div');criteria.className='editor-actions staff-actions';
    criteria.append(label('Buscar integrante',search),label('Días mínimos',minDays),label('Categoría de premio',category),label('Solo quienes no tienen ese premio registrado',missingOnly));
    const coverage=el('div'); coverage.hidden=true;
    const memberTable=el('table'), memberHead=memberTable.createTHead().insertRow(), memberRows=memberTable.createTBody();
    memberTable.className='admin-table';
    for (const title of ['Integrante','Grupo de donación','Antigüedad','Premios registrados','Acción']) {
      const th=el('th',title);th.scope='col';memberHead.append(th);
    }
    const memberWrap=el('div');memberWrap.className='admin-table-wrap staff-table-wrap';memberWrap.append(memberTable);
    coverage.append(el('p','Elige una categoría y, si quieres, un mínimo de días. El resultado te ayuda a decidir un regalo.'),criteria,memberWrap);
    wrap.append(table); host.replaceChildren(views,tools,status,deliveryStatus,coverage,wrap);

    function renderCoverage() {
      const {members}=report.coverage, chosen=category.value;
      const normalize=value=>value.normalize('NFKC').trim().toLocaleLowerCase('es');
      const needle=normalize(search.value), minimum=Number(minDays.value);
      const matching=members.map(row=>({...row,matched:row.awards.filter(award=>!chosen||normalize(award.category)===normalize(chosen))}))
        .filter(row=>(!needle||normalize(row.nick).includes(needle))&&
          (!minDays.value|| (row.days!==null && row.days>=minimum))&&(!missingOnly.checked||!row.matched.length))
        .sort((a,b)=>(b.days??-1)-(a.days??-1)||a.nick.localeCompare(b.nick,'es'));
      memberRows.replaceChildren();
      for (const row of matching) {
        const tr=memberRows.insertRow();
        for (const value of [row.nick,row.groupName||'Sin grupo',row.days===null?'Ingreso sin confirmar':`${row.days} días · ${row.joinedOn}`]) tr.insertCell().textContent=value;
        const prizes=tr.insertCell();
        if (!row.matched.length) prizes.textContent=chosen?`Sin premio registrado en ${chosen}`:'Sin premios registrados';
        for (const award of row.matched) prizes.append(el('div',`${award.label} · ${award.category||'Sin categoría'} · ${award.status==='claimed'?'Reclamado':'Por reclamar'}`));
        if (chosen && row.awards.some(award=>!award.category)) prizes.append(el('small',' Tiene premios sin clasificar.'));
        const actions=tr.insertCell();
        if (openMember && row.canAssign) {
          const button=el('button','Elegir premio');button.type='button';button.className='ghost-button';
          button.addEventListener('click',()=>openMember(row.memberId,button,load));
          actions.append(button);
        }
      }
      status.textContent=`${matching.length} de ${members.length} integrantes`;
    }

    function render() {
      rows.replaceChildren();
      if (!report) return;
      const showMembers=view==='members' && Boolean(report.coverage);
      coverage.hidden=!showMembers;wrap.hidden=field.hidden=showMembers;
      views.hidden=!report.coverage;
      memberView.setAttribute('aria-pressed',String(showMembers));alertView.setAttribute('aria-pressed',String(!showMembers));
      if (showMembers) {renderCoverage();return;}
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
      if (!live || refresh.disabled) return;
      refresh.disabled=true; status.textContent='Consultando alertas…';
      try {
        const result=await request();
        if (!live) return;
        if (!Array.isArray(result.rows) || !result.counts) throw Error('Actualiza el panel para consultar las alertas.');
        const previous=category.value;
        category.replaceChildren();
        for (const value of ['',...(result.coverage?.categories||[])]) {
          const option=el('option',value||'Todos los premios');option.value=value;category.append(option);
        }
        if ((result.coverage?.categories||[]).includes(previous)) category.value=previous;
        report=result;render();
      } catch(error) {
        if (live) status.textContent=error.message;
      } finally {
        refresh.disabled=false;
      }
    }
    filter.addEventListener('change',render);
    memberView.addEventListener('click',()=>{view='members';render();});
    alertView.addEventListener('click',()=>{view='alerts';render();});
    for (const control of [search,minDays,category,missingOnly]) control.addEventListener('input',render);
    refresh.addEventListener('click',()=>{if(!submitting)void load();});
    void load();
    return ()=>{live=false;host.replaceChildren();};
  };
})(globalThis);
