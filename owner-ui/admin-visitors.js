(() => {
 const panel=$('[data-admin-section="visitors"]'),host=$('[data-visitors-host]');let view=null,revision=0,scope='';
 const active=()=>!$('[data-dashboard]').hidden&&panel.open&&!panel.hidden;
 const currentScope=()=>typeof adminCircleId==='string'?adminCircleId:'main';
 function reset(){revision++;view?.destroy();view=null;scope='';}
 async function load(){if(!active())return;const version=++revision,space=currentScope();if(!view)view=MazinoVisitors.mount(host,{onConfigure:()=>selectAdminSection('spaces'),onRefresh:load,onReview:()=>selectAdminSection('accessRequests'),onProfile:async(id,assign)=>{const session=currentScope();try{await showMemberProfile(id);if(session===currentScope()&&$('[data-profile-dialog]').open&&memberProfileData?.member.id===id)selectProfileTab(assign?'assign':'prizes');}catch(error){view?.status(error.message);}}});scope=space;view.status('Consultando visitantes...');try{const data=await api('/api/admin/rewards/visitors-state',{method:'POST',body:'{}'});if(version!==revision||space!==currentScope()||!active())return;view.setData(data);view.status('');}catch(error){if(version===revision&&active())view.status(error.message);}}
 panel.addEventListener('toggle',()=>{if(active())load();});
 $('[data-profile-dialog]').addEventListener('close',()=>{if(active())load();});
 $('[data-admin-circle-select]')?.addEventListener('change',reset);
 new MutationObserver(()=>{if($('[data-dashboard]').hidden)reset();}).observe($('[data-dashboard]'),{attributes:true,attributeFilter:['hidden']});
 if(typeof window!=='undefined')window.addEventListener('mazino-owner-session-cleared',reset);
})();
