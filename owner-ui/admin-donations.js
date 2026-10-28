(() => {
  const panel = $('[data-admin-section="donations"]');
  const field = name => $(`[data-donation-${name}]`);
  const call = (action, body = {}) => api(`/api/admin/rewards/donations-${action}`, { method: "POST", body: JSON.stringify(body) });
  const number = value => value == null ? "Sin registro" : Number(value).toLocaleString("es-PE");
  const dateNow = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const labels = { baseline: "Inicio del seguimiento", new: "Nueva revision", correction: "Correccion", unchanged: "Ya registrado", error: "Revisar", fulfilled: "Cumplio", shortfall: "No cumplio al cierre", progress: "Aun le falta / falta cierre", missing: "Sin registros suficientes" };
  let data = null, staged = null, busy = false, context = 0, reportRevision = 0, historyRevision = 0, metadataRevision = 0;
  let syncBusy = false, syncTimer, pendingMetadata = null;
  let imageReport=null, closeImageReport=null, groupManager=null, targetPicker=null;
  field("image-report")?.addEventListener("click",()=>{
    if(!imageReport?.entries?.length){status("Consulta primero una meta o rango con integrantes.");return;}
    const snapshot=imageReport,version=context,currentScope=scope();
    closeImageReport?.();closeImageReport=MazinoDonationReport.open({report:snapshot,title:typeof adminState!=="undefined"?adminState?.draft?.settings?.siteName||"MAZINO":"MAZINO",isCurrent:()=>version===context&&currentScope===scope()&&visible(),save:async rows=>{const result=await call("report-notes",{start:snapshot.start,end:snapshot.end,target:snapshot.target,goalId:snapshot.goalId,rows});snapshot.notes=result.notes;await report({quiet:true});}});
  });
  const scope = () => typeof adminCircleId === 'string' ? adminCircleId : 'main';
  function automaticStatus(automatic) {
    const message = `${automatic?.enabled ? 'R2Beat: consulta automatica cada hora' : 'Consulta automatica no activada'} | Ultima lectura correcta (Peru): ${automatic?.lastSyncAt ? staffTime(automatic.lastSyncAt) : 'Pendiente'}${automatic?.lastError ? ` | ${automatic.lastError}` : ''}`;
    if (field('auto-status') && field('auto-status').textContent !== message) field('auto-status').textContent = message;
    if (field('auto-review')) {
      field('auto-review').hidden = !automatic?.issues?.length;
      const html = (automatic?.issues || []).map(r => `<p><strong>${escapeHtml(r.nick)}</strong>: ${escapeHtml(r.reason)} | Guardado: ${number(r.savedTotal)} | R2Beat: ${number(r.sourceTotal)}</p>`).join('');
      if (field('auto-issues').innerHTML !== html) field('auto-issues').innerHTML = html;
    }
  }
  const reportFilters = () => ({ goalId: field('goal').value, start: field('start').value, end: field('end').value, target: Number(field('target').value), search: field('search').value, status: field('filter').value, membership: field('membership').value,groupId:field('group-filter').value });
  const memberSignature = members => JSON.stringify(members.map(m => [m.id, m.nick, m.active, m.membership, !!m.needsConfirmation, m.confirmedAt, m.relatedIds]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  let directoryPage = 0, identityId = "", zeroMember = null;
  let reviewId = '', reviewStart = '', reviewSignature = '', reviewTrigger = null;
  let source = "excel", captureWidget = null, capturePending = null;
  let captureBlocks = null, capturePage = 0, captureOffset = 0, captureSelection = "", captureRevision = 0, captureLoading = false;
  const memberships = { inside: "En el circulo", new: "Nuevo / sin base", outside: "Retirado", returned: "Reincorporado" };
  const movements = { joined: "Ingreso observado", left: "Retirado", returned: "Reincorporado", nick_changed: "Cambio de nick" };
  const visible = () => !$("[data-dashboard]").hidden;
  const status = text => { field("status").textContent = text; if (reviewId) field('review-message').textContent = text; };
  function closeReview() {
    reviewId = reviewStart = reviewSignature = ''; identityId = ''; zeroMember = null;
    field('identity-form').hidden = field('zero-form').hidden = true;
    field('review-dialog').close();
    if (reviewTrigger?.isConnected) reviewTrigger.focus(); reviewTrigger = null;
  }
  function renderReview() {
    if (!reviewId) return;
    const member = data?.members.find(m => m.id === reviewId);
    const signature = JSON.stringify(member && [member.id, member.nick, member.active, member.confirmedBy, member.needsConfirmation, member.entryOn, member.entryPeriod, member.hasEntryBase, member.entryBaseTotal]);
    if (signature === reviewSignature) return;
    reviewSignature = signature; identityId = ''; zeroMember = null;
    field('identity-form').hidden = field('zero-form').hidden = true;
    if (!member) { field('review-info').textContent = 'El integrante ya no esta en esta lista. Actualiza los resultados.'; return; }
    field('review-title').textContent = `Revisar inicio: ${member.nick}`;
    field('review-info').textContent = `${memberships[member.membership] || 'En el circulo'} | Ingreso R2Beat: ${member.entryOn || 'Sin fecha registrada'}${reviewStart ? ` | Base necesaria para esta meta: ${reviewStart}` : ''}${member.confirmedBy ? ` | Identidad confirmada por ${member.confirmedBy}` : ' | Identidad por confirmar'}`;
    const messages = [];
    if (!member.active) messages.push('Integrante retirado: se conserva su historial. No se puede confirmar una nueva base mientras esta fuera del circulo.');
    if (!member.entryOn) messages.push('Falta la fecha oficial de ingreso. Actualiza integrantes antes de confirmar un inicio en cero.');
    if (member.hasEntryBase) messages.push(`Base de ingreso ya registrada: ${number(member.entryBaseTotal)}. No se reemplazara con cero.`);
    if (reviewStart && member.entryOn && reviewStart !== member.entryOn) messages.push(`Esta meta necesita una lectura del ${reviewStart}. El cero del ingreso (${member.entryOn}) no reemplaza la lectura de otra fecha.`);
    field('review-message').textContent = messages.join(' ');
    if (!member.active) return;
    if (!member.confirmedBy || member.needsConfirmation) {
      identityId = member.id; field('identity-title').textContent = `Confirmar identidad: ${member.nick}`;
      field('identity-previous').innerHTML = `<option value="">${member.membership === 'returned' ? 'Mismo integrante reincorporado: conservar historial' : 'Es nuevo: no vincular historiales'}</option>` + data.members.filter(m => !m.active).map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)} (${m.lastOn || 'sin lecturas'})${member.candidates?.some(c => c.id === m.id) ? ' - mismo nick, verificar' : ''}</option>`).join('');
      field('identity-note').value = ''; field('identity-form').hidden = false;
    } else if (!member.hasEntryBase && member.entryOn) {
      zeroMember = { ...member }; field('zero-title').textContent = `Inicio en cero: ${member.nick}`;
      field('zero-caption').textContent = `Ingreso R2Beat: ${member.entryOn} | ${memberships[member.membership]}`;
      field('zero-return-row').hidden = member.membership !== 'returned'; field('zero-return').required = member.membership === 'returned';
      field('zero-verified').checked = field('zero-return').checked = false; field('zero-note').value = ''; field('zero-form').hidden = false;
    }
  }
  function openReview(id, start = '', trigger = null) {
    reviewId = id; reviewStart = start; reviewSignature = ''; reviewTrigger = trigger;
    field('review-message').textContent = ''; renderReview();
    if (!field('review-dialog').open) field('review-dialog').showModal();
  }
  field('review-close').addEventListener('click', () => { if (!busy) closeReview(); });
  field('review-dialog').addEventListener('cancel', event => { event.preventDefault(); if (!busy) closeReview(); });
  field('review-dialog').addEventListener('close', () => { if (reviewId) closeReview(); });
  function clearPreview() {
    staged = null; field("preview").hidden = true; field("preview-rows").innerHTML = ""; field("save").disabled = true;
  }
  function goalFields() {
    const saved = !!field("goal").value;
    for (const name of ["start", "end", "target", "seven"]) field(name).disabled = busy || saved;
    field("goal-end").readOnly = field("duration").value === "7";
  }
  function lock(value) {
    busy = value;
    for (const node of $$("input,button,select", panel)) node.disabled = value;
    field("save").disabled = value || !staged || !!staged.plan.errors.length || !staged.plan.changed;
    goalFields();
    targetPicker?.update(data||{members:[],groups:[]},value);
    renderDirectory();
    captureWidget?.setLocked(value);
    renderCaptureBlocks();
  }
  async function operation(fn, propagate = false) {
    if (busy || syncBusy || !visible()) return;
    const revision = context; lock(true); status("");
    try { await fn(() => revision === context && visible()); }
    catch (error) { if (revision === context && visible()) status(error.message); if (propagate) throw error; }
    finally { if (revision === context) lock(false); }
  }
  function download(buffer, name) {
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function load(incoming = null, options = {}) {
    const revision = context, currentScope = scope(), request = ++metadataRevision, result = incoming || await call("state", { date: field("date").value || dateNow() });
    if (revision !== context || currentScope !== scope() || request !== metadataRevision || !visible()) return;
    automaticStatus(result.automatic);
    if (options.background && data) {
      if (JSON.stringify([data.members, data.goals, data.imports,data.groupRevision]) !== JSON.stringify([result.members, result.goals, result.imports,result.groupRevision])) {
        if (memberSignature(data.members) !== memberSignature(result.members)) clearPreview();
        pendingMetadata = result; field('refresh-notice').hidden = false;
      }
      return;
    }
    if (data && memberSignature(data.members) !== memberSignature(result.members)) clearPreview();
    data = result;
    const groupOptions={data:result,canEdit:true,save:async body=>{let saved;await operation(async current=>{saved=await call('group-save',body);if(current())await load();},true);return saved;}};
    if(!groupManager)groupManager=MazinoDonationGroups.manager(field('groups-host'),groupOptions);else groupManager.update(result);
    if(!targetPicker)targetPicker=MazinoDonationGroups.picker(field('target-picker'),{data:result,disabled:busy});else targetPicker.update(result,busy);
    const groupSelected=field('group-filter').value;field('group-filter').innerHTML='<option value="all">Todos los grupos</option><option value="none">Sin grupo</option>'+(result.groups||[]).map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');field('group-filter').value=groupSelected||'all';
    pendingMetadata = null; field('refresh-notice').hidden = true;
    if (zeroMember && !result.members.some(m => m.id === zeroMember.id && m.active && !m.hasEntryBase && m.entryOn === zeroMember.entryOn && m.entryPeriod === zeroMember.entryPeriod && m.confirmedBy && !m.needsConfirmation)) { zeroMember = null; field('zero-form').hidden = true; }
    renderReview();
    captureWidget?.setMembers(result.members);
    field("roster-status").textContent = `${result.members.filter(m => m.active).length} integrantes en el circulo${result.roster?.lastSyncAt ? ` | Ultima consulta R2Beat: ${staffTime(Date.parse(result.roster.lastSyncAt))}` : ""}${result.roster?.lastError ? ` | ${result.roster.lastError}` : ""}`;
    renderDirectory();
    const historyMember = field("history-member").value;
    field("history-member").innerHTML = '<option value="">Elige integrante</option>' + result.members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nick)}</option>`).join("");
    field("history-member").value = historyMember;
    const selected = field("goal").value;
    field("goal").innerHTML = '<option value="">Consulta entre fechas</option>' + result.goals.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.title)} (${g.start_on} al ${g.end_on})</option>`).join("");
    if (result.goals.some(g => g.id === selected)) field("goal").value = selected;
    field("goal-rows").innerHTML = result.goals.map(g => `<tr><td>${escapeHtml(g.title)}</td><td>${g.start_on}</td><td>${g.end_on}</td><td>${number(g.target)}</td><td>${escapeHtml(g.creator_nick || "Administrador")}</td><td>${escapeHtml(staffTime(g.created_at))}</td><td><div class="editor-actions"><button type="button" class="mini-button" data-donation-view-goal="${escapeHtml(g.id)}"${busy ? " disabled" : ""}>Ver resultados</button><button type="button" class="mini-button danger" aria-label="Eliminar meta ${escapeHtml(g.title)}" data-donation-delete-goal="${escapeHtml(g.id)}"${busy ? " disabled" : ""}><img src="/assets/admin/close.svg" width="16" height="16" alt="" />Eliminar meta</button></div></td></tr>`).join("") || '<tr><td colspan="7" class="muted">Todavia no hay metas creadas.</td></tr>';
    field("import-rows").innerHTML = result.imports.map(r => `<tr><td>${escapeHtml(staffTime(r.created_at))}</td><td>${r.reading_on}</td><td>${escapeHtml(r.actor_nick || "Administrador")}</td><td>${r.changes.length}</td><td>${escapeHtml(r.note || "-")}</td><td><details><summary>Ver cambios</summary>${r.changes.map(c => `<p>${escapeHtml(c.nick)}: ${c.oldTotal == null ? "Nuevo" : number(c.oldTotal)} &rarr; ${number(c.total)} (${labels[c.status] || "Revision"})</p>`).join("")}</details></td></tr>`).join("") || '<tr><td colspan="6" class="muted">Todavia no hay cargas registradas.</td></tr>';
    goalFields();
  }
  globalThis.refreshDonationRoster = async (options = {}) => {
    if (!panel.open || !visible() || busy || syncBusy) return;
    const revision = context;
    try { await load(null, options); if (!options.background && field("results").open) await report({ quiet: true }); }
    catch (error) { if (revision === context && visible()) field("roster-status").textContent = `No se pudo actualizar integrantes: ${error.message}`; }
  };
  field('apply-refresh')?.addEventListener('click', async () => {
    if (!pendingMetadata || busy || syncBusy || !visible()) return;
    const revision = context; await load(pendingMetadata);
    if (revision !== context || !visible()) return;
    if (field('results').open) await report({ quiet: true });
    if (field('history-panel').open && field('history-member').value) await history(field('history-member').value, { quiet: true });
  });
  field('sync-now')?.addEventListener('click', async () => {
    if (busy || syncBusy || field('sync-now').disabled || !visible()) return;
    syncBusy = true; field('sync-now').disabled = true;
    const revision = context, currentScope = scope(); let retry = 0;
    field('sync-status').textContent = 'Consultando R2Beat. Se conservaran las lecturas anteriores...';
    try {
      const result = await call('sync-now');
      if (revision !== context || currentScope !== scope() || !visible()) return;
      if (!Array.isArray(result.members) || !Array.isArray(result.goals) || !Array.isArray(result.imports)) throw new Error('No se recibio el estado de donaciones. Reintenta la consulta.');
      retry = Number.isFinite(result.automatic?.retryAfterSeconds) ? Math.max(0, Math.min(3600, result.automatic.retryAfterSeconds)) : 0;
      const outcome = result.automatic?.refreshStatus;
      if (outcome === 'updated') {
        clearPreview(); await load(result);
        if (revision !== context || currentScope !== scope() || !visible()) return;
        if (field('results').open) await report({ quiet: true });
        if (field('history-panel').open && field('history-member').value) await history(field('history-member').value, { quiet: true });
      } else automaticStatus(result.automatic);
      if (revision !== context || currentScope !== scope() || !visible()) return;
      field('sync-status').textContent = outcome === 'updated' ? 'Consulta terminada. Los totales muestran la ultima lectura verificada; el historial anterior se conserva.'
        : outcome === 'throttled' ? `Ya se consulto hace poco. Espera ${Math.ceil(retry)} segundos para volver a consultar.`
          : outcome === 'busy' ? 'Hay una consulta de R2Beat en curso. Vuelve a intentarlo en unos segundos.'
            : `No se pudo obtener una lectura nueva. Se conserva la ultima correcta.${result.automatic?.lastError ? ` ${result.automatic.lastError}` : ''}`;
    } catch (error) { if (revision === context && currentScope === scope() && visible()) field('sync-status').textContent = `No se pudo consultar R2Beat: ${error.message}. Se conserva la ultima lectura correcta.`; }
    finally {
      if (revision === context && currentScope === scope()) {
        syncBusy = false; clearTimeout(syncTimer);
        if (retry > 0) syncTimer = setTimeout(() => { if (revision === context && currentScope === scope() && visible()) field('sync-now').disabled = false; }, retry * 1000);
        else field('sync-now').disabled = false;
      }
    }
  });
  const refreshCaptureMembers = () => operation(async current => { await load(); if (current()) status("Lista actualizada. Elige al integrante nuevo en su fila; no necesitas volver a cargar las capturas."); }, true);
  field("members-refresh").addEventListener("click", () => operation(async current => { await load(); if (current()) status("Integrantes de donaciones actualizados."); }));
  function renderDirectory() {
    const search = field("directory-search").value.toLowerCase(), filter = field("directory-filter").value || "all";
    const rows = (data?.members || []).filter(m => (!search || m.nick.toLowerCase().includes(search)) && (filter === "all" || (filter === "doubtful" ? m.needsConfirmation : m.membership === filter)));
    directoryPage = Math.min(directoryPage, Math.max(0, Math.ceil(rows.length / 20) - 1));
    field("directory-count").textContent = `${rows.length} integrantes | ${(data?.members || []).filter(m => m.needsConfirmation).length} por confirmar`;
    field("directory-page").textContent = `Pagina ${directoryPage + 1}`;
    field("directory-prev").disabled = busy || !directoryPage;
    field("directory-next").disabled = busy || (directoryPage + 1) * 20 >= rows.length;
    field("directory-rows").innerHTML = rows.slice(directoryPage * 20, directoryPage * 20 + 20).map(m => `<tr><td>${escapeHtml(m.nick)}</td><td>${memberships[m.membership] || "En el circulo"}<p>Ingreso: ${escapeHtml(m.entryOn || 'Sin fecha de R2Beat')}</p>${m.hasEntryBase ? `<p>Base de ingreso: ${number(m.entryBaseTotal)}</p>` : ''}${m.needsConfirmation ? "<p>Identidad por confirmar</p>" : ""}${m.confirmedBy ? `<p>Confirmado por ${escapeHtml(m.confirmedBy)}</p>` : ""}</td><td>${number(m.lastTotal)}</td><td>${m.lastOn || "-"}</td><td>${m.lastMovementAt ? escapeHtml(staffTime(m.lastMovementAt)) : "Sin fecha registrada"}</td><td><div class="editor-actions"><button class="mini-button" type="button" data-donation-member="${escapeHtml(m.id)}">Historial</button>${m.active && !m.confirmedBy ? `<button class="mini-button" type="button" data-donation-identity="${escapeHtml(m.id)}">Confirmar identidad</button>` : ""}${m.active && m.confirmedBy && !m.needsConfirmation && !m.hasEntryBase && m.entryOn ? `<button class="mini-button" type="button" data-donation-zero="${escapeHtml(m.id)}">Confirmar inicio en cero</button>` : ''}</div></td></tr>`).join("") || '<tr><td colspan="6">Sin integrantes con estos filtros.</td></tr>';
  }
  function renderCapturePage() {
    const selected = captureBlocks?.selected?.pages[capturePage];
    field("capture-block-content").hidden = !selected;
    field("capture-block-title").textContent = selected?.name || (selected ? `Pagina ${selected.page}` : "");
    if (selected) field("capture-block-content").setAttribute("aria-label", `Pagina ${selected.page} guardada`);
    field("capture-block-pages").innerHTML = (captureBlocks?.selected?.pages || []).map((p, index) => `<button type="button" class="ghost-button" role="tab" aria-selected="${index === capturePage}" tabindex="${index === capturePage ? 0 : -1}" data-donation-saved-page="${index}"${busy ? " disabled" : ""}>Pagina ${p.page}<small>${p.rows.length} integrantes</small></button>`).join("");
    field("capture-block-rows").innerHTML = selected ? selected.rows.map(row => `<tr><td data-label="Fila">${row.sourceRow}</td><td data-label="Integrante">${escapeHtml(row.nick)}</td><td data-label="Anterior">${row.previous == null ? "No registrado" : number(row.previous)}${row.comparison === "known" ? `<small class="saved-capture-date">${escapeHtml(row.previousOn || "Fecha no registrada")}</small>` : ""}</td><td data-label="Total">${number(row.total)}</td><td data-label="Donado" class="saved-capture-delta">${row.comparison === "known" ? number(row.delta) : row.comparison === "baseline" ? "Nueva base" : "Sin comparacion"}</td><td data-label="Revision">${labels[row.status] || "Guardado"}</td></tr>`).join("") || '<tr><td colspan="6">Todas las filas de esta pagina fueron excluidas.</td></tr>' : "";
  }
  function renderCaptureBlocks() {
    const items = captureBlocks?.blocks || [], selected = captureBlocks?.selected;
    field("capture-block-select").innerHTML = items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.reading_on)} | ${escapeHtml(staffTime(item.created_at))} | ${escapeHtml(item.actor_nick)} | ${item.pageCount} paginas</option>`).join("") || '<option value="">Sin cargas por captura</option>';
    field("capture-block-select").value = selected?.id || "";
    field("capture-block-select").disabled = busy || captureLoading || !items.length;
    field("capture-block-refresh").disabled = busy || captureLoading;
    field("capture-block-info").textContent = selected ? `Fecha de revision: ${selected.reading_on} | Guardado por: ${selected.actor_nick} | Registro (Peru): ${staffTime(selected.created_at)}${selected.note ? ` | ${selected.note}` : ""}` : "";
    field("capture-block-prev").disabled = busy || captureLoading || !captureOffset;
    field("capture-block-next").disabled = busy || captureLoading || captureOffset + 20 >= (captureBlocks?.total || 0);
    field("capture-block-count").textContent = captureBlocks?.total ? `${captureOffset + 1}-${Math.min(captureOffset + 20, captureBlocks.total)} de ${captureBlocks.total} bloques` : "0 bloques";
    renderCapturePage();
  }
  async function loadCaptureBlocks() {
    if (!visible()) return;
    const request = ++captureRevision, session = context;
    captureLoading = true; captureBlocks = null; renderCaptureBlocks();
    field("capture-block-status").textContent = "Consultando cargas por captura...";
    try {
      const result = await call("captures", { offset: captureOffset, ...(captureSelection ? { importId: captureSelection } : {}) });
      if (session !== context || request !== captureRevision || !visible()) return;
      captureBlocks = result; capturePage = 0;
      field("capture-block-status").textContent = result.total ? "" : "Las cargas anteriores a esta mejora no tienen un orden de capturas registrado.";
    } catch (error) { if (session === context && request === captureRevision && visible()) field("capture-block-status").textContent = error.message; }
    finally { if (session === context && request === captureRevision) { captureLoading = false; renderCaptureBlocks(); } }
  }
  field("capture-block-panel").addEventListener("toggle", event => { if (event.target === field("capture-block-panel") && field("capture-block-panel").open && !captureLoading && !busy) loadCaptureBlocks(); });
  field("capture-block-select").addEventListener("change", () => { if (!busy && !captureLoading) { captureSelection = field("capture-block-select").value; loadCaptureBlocks(); } });
  field("capture-block-refresh").addEventListener("click", () => { if (!busy && !captureLoading) loadCaptureBlocks(); });
  for (const [name, delta] of [["prev", -20], ["next", 20]]) field(`capture-block-${name}`).addEventListener("click", () => {
    if (busy || captureLoading || (delta < 0 ? !captureOffset : captureOffset + 20 >= (captureBlocks?.total || 0))) return;
    captureOffset = Math.max(0, captureOffset + delta); captureSelection = ""; loadCaptureBlocks();
  });
  field("capture-block-pages").addEventListener("click", event => {
    const button = event.target.closest("[data-donation-saved-page]");
    if (busy || !button) return;
    capturePage = Number(button.dataset.donationSavedPage); renderCapturePage();
  });
  field("capture-block-pages").addEventListener("keydown", event => {
    const button = event.target.closest("[data-donation-saved-page]"), count = captureBlocks?.selected?.pages.length;
    if (busy || !button || !count) return;
    const index = Number(button.dataset.donationSavedPage);
    const next = event.key === "ArrowRight" ? (index + 1) % count : event.key === "ArrowLeft" ? (index + count - 1) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next == null) return;
    event.preventDefault(); capturePage = next; renderCapturePage(); field("capture-block-pages").children[next].focus();
  });
  function renderPreview() {
    const plan = staged.plan;
    field("preview").hidden = false;
    field("preview-summary").textContent = `${plan.changed} para guardar | ${plan.unchanged} ya registrados | ${plan.errors.length} errores`;
    field("preview-rows").innerHTML = plan.entries.map(r => `<tr><td>${escapeHtml(r.nick)}${r.nickChanged ? "<br>Nick actualizado por ID" : ""}</td><td>${number(r.previous)}</td><td>${number(r.total)}</td><td>${r.delta == null ? "Inicio del seguimiento" : number(r.delta)}</td><td><span class="donation-state ${r.status}">${labels[r.status]}</span>${r.status === "correction" ? `<br>Reemplaza ${number(r.oldTotal)} de esta fecha` : ""}${r.error ? `<br>${escapeHtml(r.error)}` : ""}${r.needsPeriodConfirmation ? `<button class="mini-button" type="button" data-donation-period="${escapeHtml(r.memberId)}">Confirmar nueva base</button>` : ""}</td></tr>`).join("");
  }
  async function report(options = {}) {
    const revision = ++reportRevision, session = context;
    if (!visible()) return;
    if (!options.quiet) { field("report-status").textContent = "Consultando donaciones..."; field("report-rows").innerHTML = ""; }
    const filters = reportFilters();
    try {
      const result = await call('report', filters);
      if (revision !== reportRevision || session !== context || !visible() || JSON.stringify(filters) !== JSON.stringify(reportFilters())) return;
      imageReport=result;
      const selectedGroup=field('group-filter').value;field('group-filter').innerHTML='<option value="all">Todos los grupos</option><option value="none">Sin grupo</option>'+(result.groups||[]).map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');field('group-filter').value=selectedGroup;
      for (const name of ["fulfilled", "shortfall", "progress", "missing"]) field(name).textContent = result.counts[name];
      field("report-status").textContent = `${result.start} al ${result.end} | ${result.goalId?'Meta general: '+number(result.target)+'; se aplican las individuales':'Meta de consulta: '+number(result.target)} | ${result.entries.length} de ${result.total} integrantes${field("filter").value !== "all" ? ` | Filtro: ${labels[field("filter").value]}` : ""}`;
      field("report-rows").innerHTML = result.entries.map(r => `<tr><td>${escapeHtml(r.nick)}<p>${escapeHtml(r.groupName||"Sin grupo")} · ${escapeHtml(r.targetSource||"General")}</p>${result.notes?.[r.memberId] ? `<p style="color:${result.notes[r.memberId].mark === "red" ? "#ff7d8c" : result.notes[r.memberId].mark === "yellow" ? "#ffe182" : "inherit"}">${result.notes[r.memberId].mark === "red" ? "Lo retire" : result.notes[r.memberId].mark === "yellow" ? "En observacion" : ""} ${escapeHtml(result.notes[r.memberId].observation || "")}</p>` : ""}<br><span class="muted">${memberships[r.membership] || (r.active ? "En el circulo" : "Retirado")}</span>${r.zeroFromEntry ? `<p>Nuevo ingreso: inicio en 0 desde ${r.effectiveStart}</p>` : r.baselineObservedOn ? `<p>Seguimiento desde base observada: ${r.baselineObservedOn}</p>` : r.joinedDuring ? `<p>Cuenta desde su ingreso: ${r.effectiveStart}</p>` : ''}</td><td>${number(r.initialTotal)}${r.initialTotal != null ? `<br><small>${r.effectiveStart || result.start}</small>` : ""}</td><td>${number(r.finalTotal)}${r.lastOn ? `<br><small>${r.lastOn}</small>` : ""}</td><td>${number(r.donated)}</td><td>Meta: ${number(r.target??result.target)}<br>Le falta: ${number(r.remaining)}</td><td><span class="donation-state ${r.status}">${labels[r.status]}</span>${r.identityPending ? '<br>Confirma su identidad en Integrantes y cambios' : r.periodChanged ? "<br>Reincorporacion: consulta cada periodo por separado" : r.missingStart ? "<br>Falta revision inicial" : r.missingEnd ? r.status === "fulfilled" ? "<br>Meta alcanzada antes del cierre" : "<br>Falta revision final" : ""}</td><td>${r.lastOn || "-"}</td><td><div class="editor-actions"><button class="mini-button" type="button" data-donation-member="${escapeHtml(r.memberId)}"${busy ? " disabled" : ""}>Ver historial</button>${r.status === 'missing' ? `<button class="mini-button" type="button" aria-label="Revisar inicio de ${escapeHtml(r.nick)}" data-donation-review="${escapeHtml(r.memberId)}" data-donation-review-start="${escapeHtml(r.effectiveStart || result.start)}"${busy ? ' disabled' : ''}><img src="/assets/admin/users.svg" width="16" height="16" alt="" />Revisar inicio</button>` : ''}</div></td></tr>`).join("") || '<tr><td colspan="8" class="muted">No hay integrantes con estos filtros. Pulsa Ver todos para consultar el grupo completo.</td></tr>';
    } catch (error) { if (revision === reportRevision && session === context && visible()) { for (const name of ["fulfilled", "shortfall", "progress", "missing"]) field(name).textContent = "-"; field("report-status").textContent = error.message; } }
  }
  async function history(id, options = {}) {
    if (!options.quiet && typeof selectAdminSection === "function") selectAdminSection("donationHistory");
    field("history-member").value = id;
    const revision = ++historyRevision, session = context;
    if (!options.quiet) { field("history-panel").open = true; field("history-title").textContent = ""; field("history-rows").innerHTML = ""; field("history-status").textContent = "Consultando historial..."; }
    try {
      const result = await call("history", { memberId: id });
      if (revision !== historyRevision || session !== context || !visible() || field('history-member').value !== id) return;
      field("history-title").textContent = result.member.nick;
      field("history-status").textContent = `Donado desde el inicio del seguimiento: ${number(result.trackedTotal)}`;
      field("history-movements").innerHTML = (result.movements || []).map(h => `<p>${escapeHtml(staffTime(h.created_at))}: ${movements[h.action] || "Cambio"} - ${escapeHtml(h.nick)}</p>`).join("");
      field("history-rows").innerHTML = result.entries.map(r => `<tr><td>${r.reading_on}<br>${escapeHtml(r.nick || result.member.nick)}<br><small>${r.source === 'entry_rule' ? 'Inicio 0: nuevo ingreso' : r.source === 'r2beat' ? r.kind === 'baseline' ? 'R2Beat: primer total observado' : 'R2Beat: lectura automatica' : 'Carga manual'}</small></td><td>${number(r.total)}</td><td>${r.donated == null ? "Base de este ingreso" : `${number(r.donated)} (desde ${r.from})`}</td><td>${escapeHtml(staffTime(r.updated_at))}</td></tr>`).join("") || '<tr><td colspan="4">Sin revisiones guardadas.</td></tr>';
      if (!options.quiet) field("history-panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) { if (revision === historyRevision && session === context && visible()) field("history-status").textContent = error.message; }
  }
  field("template").addEventListener("click", () => operation(async current => {
    if (!field("date").value || !field("date").checkValidity()) throw new Error("Elige la fecha de revision.");
    await load(); if (!current()) return;
    const buffer = await DonationsExcel.template(ExcelJS, data.members, field("date").value);
    if (!current()) return;
    download(buffer, `MAZINO-donaciones-${field("date").value}.xlsx`);
    status("Plantilla descargada.");
  }));
  field("history-member").addEventListener("change", () => {
    if (field("history-member").value && !busy) history(field("history-member").value);
  });
  field("file-form").addEventListener("submit", event => {
    event.preventDefault(); if (source !== "excel") return; operation(async current => {
      clearPreview(); const file = field("file").files[0], date = field("date").value;
      if (!file || !/\.xlsx$/i.test(file.name) || file.size > 2 * 1024 * 1024) throw new Error("Elige una plantilla .xlsx de hasta 2 MB.");
      const rows = await DonationsExcel.parse(ExcelJS, await file.arrayBuffer(), date);
      if (!current()) return;
      const input = { date, rows, replace: field("replace").checked, note: field("note").value };
      const plan = await call("preview", input); if (!current()) return;
      staged = { input, plan }; renderPreview();
      if (plan.errors.length) status(plan.errors.join(" "));
      else if (!plan.changed) status("Estos totales ya estaban registrados. No se duplicara la carga.");
      field("preview").scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
  field("save").addEventListener("click", () => operation(async current => {
    if (!staged || staged.plan.errors.length || !staged.plan.changed) return;
    if (!confirm(`Guardar ${staged.plan.changed} totales del ${staged.input.date}${staged.input.replace ? " (incluye correcciones)" : ""}?`)) return;
    const result = await call("import", { ...staged.input, fingerprint: staged.plan.fingerprint });
    if (!current()) return;
    const fromCaptures = staged.source === "captures";
    if (fromCaptures) captureWidget?.markSaved();
    clearPreview(); field("file").value = "";
    status(`${result.saved} totales guardados. ${result.unchanged} ya registrados.`);
    if (fromCaptures && result.importId) {
      captureSelection = result.importId; captureOffset = 0;
      if (typeof selectAdminSection === "function") selectAdminSection("donationCaptureBlocks");
      await loadCaptureBlocks();
    }
    try { await load(); await report(); }
    catch { if (current()) status("Totales guardados. Actualiza el panel para ver los resultados recientes."); }
  }));
  field("cancel").addEventListener("click", clearPreview);
  for (const name of ["date", "file", "replace", "note"]) field(name).addEventListener("change", () => { if (!busy) clearPreview(); });
  field("report-form").addEventListener("submit", event => { event.preventDefault(); if (!busy) report(); });
  for (const name of ["filter", "membership","group-filter"]) field(name).addEventListener("change", () => { if (!busy) report(); });
  field("clear-filters").addEventListener("click", () => {
    if (busy) return;
    field("filter").value = field("membership").value = field("group-filter").value = "all"; field("search").value = ""; report();
  });
  field("goal").addEventListener("change", () => {
    field("filter").value = field("membership").value = field("group-filter").value = "all"; field("search").value = "";
    const goal = data?.goals.find(g => g.id === field("goal").value);
    if (goal) { field("start").value = goal.start_on; field("end").value = goal.end_on; field("target").value = goal.target; }
    goalFields(); report();
  });
  field("seven").addEventListener("click", () => { if (field("start").value) field("end").value = addDays(field("start").value, 7); });
  const goalEnd = () => { if (field("duration").value === "7" && field("goal-start").value) field("goal-end").value = addDays(field("goal-start").value, 7); goalFields(); };
  field("duration").addEventListener("change", goalEnd); field("goal-start").addEventListener("change", goalEnd);
  field("goal-form").addEventListener("submit", event => {
    event.preventDefault(); operation(async current => {
      const result = await call("goal", { title: field("goal-title").value, start: field("goal-start").value, end: field("goal-end").value, target: Number(field("goal-target").value),...targetPicker.get() });
      if (!current()) return;
      await load(); if (!current()) return;
      field("goal").value = result.id; field("goal").dispatchEvent(new Event("change"));
      if (typeof selectAdminSection === "function") selectAdminSection("donations");
      status(`Meta creada para ${result.participants} integrantes. Las metas individuales reemplazan la grupal para las mismas fechas; se conserva el historial.`);
    });
  });
  panel.addEventListener("click", event => {
    if (busy) return;
    const remove = event.target.closest('[data-donation-delete-goal]');
    if (remove) {
      const goal = data?.goals.find(g => g.id === remove.dataset.donationDeleteGoal);
      if (!goal) return;
      operation(async current => {
        if (!confirm(`Eliminar la meta "${goal.title}" (${goal.start_on} al ${goal.end_on})?\nSolo se elimina la meta. Se conservan los totales, las capturas y el historial de donaciones. Esta accion no se puede deshacer.`)) return;
        await call('goal-delete', { id: goal.id, confirmed: true });
        if (!current()) return;
        if (field('goal').value === goal.id) {
          reportRevision++; field('goal').value = ''; field('report-rows').innerHTML = '';
          field('report-status').textContent = 'Meta eliminada. Puedes consultar las mismas donaciones entre fechas o elegir otra meta.';
          for (const name of ['fulfilled', 'shortfall', 'progress', 'missing']) field(name).textContent = '-';
        }
        status('Meta eliminada. Los totales y el historial de donaciones se conservan.');
        try { await load(); } catch { if (current()) status('Meta eliminada. Actualiza la lista para ver el cambio. Las donaciones se conservan.'); }
      });
      return;
    }
    const sourceButton = event.target.closest("[data-donation-source]");
    if (sourceButton) {
      source = sourceButton.dataset.donationSource; clearPreview();
      field("excel").hidden = field("excel-action").hidden = source !== "excel"; field("file").required = source === "excel";
      field("capture-host").hidden = source !== "captures";
      $$('[data-donation-source]', panel).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.donationSource === source)));
      if (source === "captures") startCaptures();
    }
    const button = event.target.closest("[data-donation-member]"); if (button) history(button.dataset.donationMember);
    const review = event.target.closest('[data-donation-review]');
    if (review) { openReview(review.dataset.donationReview, review.dataset.donationReviewStart || '', review); return; }
    const zero = event.target.closest('[data-donation-zero]');
    if (zero) { openReview(zero.dataset.donationZero, '', zero); return; }
    const identity = event.target.closest("[data-donation-identity]");
    if (identity) { openReview(identity.dataset.donationIdentity, '', identity); return; }
    const period = event.target.closest("[data-donation-period]");
    if (period && staged && confirm("Confirmar esta lectura como nueva base de la reincorporacion? El historial se conserva y este total no contara como una donacion nueva.")) operation(async current => {
      const input = { ...staged.input, rows: staged.input.rows.map(r => r.memberId === period.dataset.donationPeriod ? { ...r, periodConfirmed: true } : r) };
      const origin = staged.source;
      const plan = await call("preview", input); if (current()) { staged = { input, plan, source: origin }; renderPreview(); status(plan.errors.join(" ")); }
    });
    const goal = event.target.closest("[data-donation-view-goal]");
    if (goal && data?.goals.some(g => g.id === goal.dataset.donationViewGoal)) { field("goal").value = goal.dataset.donationViewGoal; field("goal").dispatchEvent(new Event("change")); if (typeof selectAdminSection === "function") selectAdminSection("donations"); field("results").open = true; field("report-form").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  });
  for (const name of ["directory-search", "directory-filter"]) field(name).addEventListener(name === "directory-search" ? "input" : "change", () => { directoryPage = 0; renderDirectory(); });
  field("directory-prev").addEventListener("click", () => { directoryPage = Math.max(0, directoryPage - 1); renderDirectory(); });
  field("directory-next").addEventListener("click", () => { directoryPage++; renderDirectory(); });
  field("directory-refresh").addEventListener("click", () => operation(async () => load()));
  field("identity-cancel").addEventListener("click", () => { if (!busy) closeReview(); });
  field('zero-cancel').addEventListener('click', () => { if (!busy) closeReview(); });
  field('zero-form').addEventListener('submit', event => {
    event.preventDefault(); if (!zeroMember || !field('zero-verified').checked || (zeroMember.membership === 'returned' && !field('zero-return').checked)) return;
    const member = zeroMember;
    operation(async current => {
      if (!confirm(`Registrar inicio en 0 de ${member.nick} el ${member.entryOn}? Solo si comprobaste que este ingreso comenzo en cero. Se conserva el historial.`)) return;
      await call('zero', { memberId: member.id, entryOn: member.entryOn, period: member.entryPeriod, confirmed: true, returnConfirmed: field('zero-return').checked, note: field('zero-note').value });
      if (!current()) return;
      zeroMember = null; field('zero-form').hidden = true; clearPreview();
      status('Inicio en cero registrado. El historial anterior se conserva.'); await load(); await report();
    });
  });
  field("identity-form").addEventListener("submit", event => {
    event.preventDefault(); operation(async current => {
      if (!identityId) return;
      const member = data?.members.find(m => m.id === identityId), previous = data?.members.find(m => m.id === field("identity-previous").value);
      if (!member || !confirm(previous ? `Confirmar que ${member.nick} es la misma persona que ${previous.nick}? Solo se vincula el historial de donaciones. No cambian claves, premios ni permisos.` : member.membership === 'returned' ? `Confirmar la reincorporacion de ${member.nick}, conservando su historial anterior?` : `Confirmar a ${member.nick} como persona nueva, sin vincular historiales?`)) return;
      await call("confirm-member", { memberId: identityId, previousId: previous?.id || null, note: field("identity-note").value, confirmed: true });
      if (!current()) return;
      clearPreview(); identityId = ""; field("identity-form").hidden = true; field("identity-note").value = "";
      status("Identidad confirmada. Historial conservado y accesos sin cambios.");
      try { await load(); await report(); } catch { if (current()) status("Identidad confirmada. Actualiza la lista para ver el cambio."); }
    });
  });
  panel.addEventListener("toggle", () => { if (panel.open && visible() && !busy) operation(async current => { await load(); if (current()) await report(); }); });
  function reset() {
    groupManager?.destroy();targetPicker?.destroy();groupManager=targetPicker=null;field("group-filter").innerHTML='<option value="all">Todos los grupos</option><option value="none">Sin grupo</option>';
    closeImageReport?.();closeImageReport=null;imageReport=null;
    clearTimeout(syncTimer); syncBusy = false; pendingMetadata = null;
    field('sync-now').disabled = false; field('sync-status').textContent = ''; field('auto-status').textContent = ''; field('refresh-notice').hidden = true;
    captureWidget?.destroy(); captureWidget = null; capturePending = null;
    captureRevision++; captureBlocks = null; capturePage = 0; captureOffset = 0; captureSelection = ""; captureLoading = false;
    field("capture-block-status").textContent = "";
    context++; reportRevision++; historyRevision++; metadataRevision++; data = null; busy = false; clearPreview();
    closeReview(); field('review-message').textContent = field('review-info').textContent = '';
    field("roster-status").textContent = "";
    directoryPage = 0; identityId = ""; field("identity-form").hidden = true;
    zeroMember = null; field('zero-form').hidden = true; field('zero-note').value = ''; field('zero-verified').checked = field('zero-return').checked = false;
    for (const name of ["directory-rows", "directory-count", "directory-page", "history-movements", "identity-title"]) field(name).textContent = "";
    for (const name of ["directory-search", "identity-note"]) field(name).value = "";
    for (const name of ["file", "note", "search", "goal-title", "history-member"]) field(name).value = "";
    field("history-member").innerHTML = '<option value="">Elige integrante</option>';
    field("replace").checked = false; field("goal").innerHTML = '<option value="">Consulta entre fechas</option>';
    for (const name of ["report-rows", "history-rows", "import-rows", "goal-rows"]) field(name).innerHTML = "";
    for (const name of ["status", "report-status", "history-status", "history-title"]) field(name).textContent = "";
    for (const name of ["fulfilled", "shortfall", "progress", "missing"]) field(name).textContent = "-";
    lock(false);
  }
  async function startCaptures() {
    if (captureWidget || capturePending || !visible()) return;
    const revision = context;
    capturePending = (async () => {
      try {
        const { runtime, assetBase } = await MazinoCaptureLoader.load();
        if (revision !== context || !visible()) return;
        if (!data) await load();
        if (revision !== context || !visible()) return;
        captureWidget = runtime.mount(field("capture-host"), { assetBase, members: data.members, isActive: () => revision === context && visible() && source === "captures" && panel.open, onRefreshMembers: refreshCaptureMembers, onChange: () => { if (staged?.source === "captures") clearPreview(); }, onPreview: (rows, captureLayout) => operation(async current => {
          clearPreview(); const input = { date: field("date").value, rows, captureLayout, replace: field("replace").checked, note: field("note").value || "Carga por capturas revisadas" };
          const plan = await call("preview", input); if (!current()) return;
          staged = { input, plan, source: "captures" }; renderPreview();
          status(plan.errors.join(" ") || "Bloque revisado. Comprueba las diferencias y confirma el guardado.");
          field("preview").scrollIntoView({ block: "nearest", behavior: "smooth" });
        }) });
        captureWidget.setLocked(busy);
      } catch(error) { if (revision === context && visible()) status(error.message); }
      finally { if (revision === context) capturePending = null; }
    })();
    await capturePending;
  }
  new MutationObserver(() => { if (!visible()) reset(); }).observe($("[data-dashboard]"), { attributes: true, attributeFilter: ["hidden"] });
  $('[data-admin-circle-select]')?.addEventListener('change', reset);
  if (typeof window !== 'undefined') window.addEventListener('mazino-owner-session-cleared', reset);
  for (const name of ["date", "start", "goal-start"]) field(name).value = dateNow();
  field("date").max = dateNow(); field("end").value = addDays(dateNow(), 7); goalEnd();
})();
