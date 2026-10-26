let adminCircleId='main';
try{const saved=sessionStorage.getItem('mazino-admin-circle');if(/^[a-f0-9]{32}$/.test(saved||''))adminCircleId=saved;}catch{}
