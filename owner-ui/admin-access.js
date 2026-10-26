let rewardAccessPage=0;
function matchesRewardAccessFilter(member){
  const value=$('[data-access-filter]').value||'all';
  return value==='missing'?!member.hasPassword:value==='generated'?!!member.hasPassword:value==='paused'?!!member.hasPassword&&!member.loginEnabled:true;
}
function renderMemberAccessDirectory(){
  const active=rewardAdminState.members.filter(m=>m.active),query=adminSearchKey($('[data-access-search]').value);
  const rows=active.filter(m=>matchesRewardAccessFilter(m)&&adminSearchKey(m.nick).includes(query));
  const pages=Math.max(1,Math.ceil(rows.length/20));rewardAccessPage=Math.min(rewardAccessPage,pages-1);
  $('[data-access-summary]').textContent=`En el circulo: ${active.length} | Sin clave generada: ${active.filter(m=>!m.hasPassword).length} | Con clave y acceso pausado: ${active.filter(m=>m.hasPassword&&!m.loginEnabled).length} | Mostrando: ${rows.length}`;
  $('[data-access-rows]').innerHTML=rows.slice(rewardAccessPage*20,rewardAccessPage*20+20).map(m=>`<tr><td>${escapeHtml(m.nick)}</td><td>${m.hasPassword?'Generada':'Falta generar'}</td><td>${m.loginEnabled?'Activo':m.hasPassword?'Pausado':'Sin acceso'}</td><td><button class="mini-button" type="button" data-access-choose="${escapeHtml(m.id)}">Seleccionar</button></td></tr>`).join('')||'<tr><td colspan="4">No hay integrantes con estos filtros.</td></tr>';
  $('[data-access-page]').textContent=`Pagina ${rewardAccessPage+1} de ${pages}`;
  $('[data-access-prev]').disabled=rewardAccessPage===0;$('[data-access-next]').disabled=rewardAccessPage>=pages-1;
}
$('[data-access-filter]').addEventListener('change',()=>{rewardAccessPage=0;clearRewardCredential();rewardMemberOptions();renderMemberAccessDirectory();});
$('[data-access-search]').addEventListener('input',()=>{rewardAccessPage=0;renderMemberAccessDirectory();});
$('[data-access-prev]').addEventListener('click',()=>{rewardAccessPage--;renderMemberAccessDirectory();});
$('[data-access-next]').addEventListener('click',()=>{rewardAccessPage++;renderMemberAccessDirectory();});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-access-choose]');if(!button||$('[data-dashboard]').hidden||rewardAdminBusy)return;
  const member=rewardAdminState.members.find(m=>m.active&&m.id===button.dataset.accessChoose);if(!member)return;
  clearRewardCredential();$('[data-reward-member]').value=member.id;rewardMemberOptions();renderRewardDelivery();
});
$('[data-logout]').addEventListener('click',()=>{rewardAccessPage=0;$('[data-access-rows]').innerHTML='';$('[data-access-summary]').textContent='';});
renderMemberAccessDirectory();
