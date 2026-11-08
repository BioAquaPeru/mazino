let refreshMemberAccess, openMemberAccessLink;
(() => {
  const root = rewardDialog.querySelector('[data-member-access]');
  if (!root) return;
  const node = name => root.querySelector(`[data-access-${name}]`);
  const form = node('password'), storageKey = typeof spaceStorageKey==='function'?spaceStorageKey('mazino-access-request-v1'):'mazino-access-request-v1';
  let pending = null, timer, revision = 0, busy = false, changing = false;
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.expiresAt > Date.now() && /^[a-f0-9]{64}$/.test(saved.token)) pending = saved; } catch { /* Private request still works without storage. */ }
  const message = text => { node('message').textContent = text; };
  const save = () => { try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending)); else sessionStorage.removeItem(storageKey); } catch { /* Keep this tab open when storage is unavailable. */ } };
  const clearPasswords = () => { form.reset(); };
  const requestForNick = () => pending && String(pending.nick).normalize('NFKC').trim().toLowerCase() === String(rewardDialog.querySelector('[data-prize-login]').nick.value).normalize('NFKC').trim().toLowerCase();
  const valid = (version, session) => rewardDialog.open && revision === version && rewardSession?.token === session;
  async function accessApi(action, body) {
    if (!rewardApi) throw new Error('El servicio de acceso aun no esta disponible.');
    const response = await fetch(typeof spaceApiUrl==='function'?spaceApiUrl(`${rewardApi}/api/access/${action}`):`${rewardApi}/api/access/${action}`, { method: 'POST', cache: 'no-store', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo consultar tu solicitud.'), {status:response.status});
    return result;
  }
  function render() {
    clearTimeout(timer);
    node('start').textContent=typeof window!=='undefined'&&window.mazinoSpaceKind==='group'?'Solicitar registro':'Solicitar mi acceso';
    const matches = requestForNick();
    rewardDialog.querySelector('[data-prize-login]').hidden = !!rewardSession || !!matches;
    node('start').hidden = !!rewardSession || !!matches;
    node('recover').hidden = !!rewardSession || !!matches;
    node('change').hidden = !rewardSession || changing;
    node('pending').hidden = !!rewardSession || !matches || pending.status === 'approved';
    form.hidden = !changing && (!!rewardSession || !matches || pending?.status !== 'approved');
    node('current-row').hidden = !changing;
    form.currentPassword.required = changing;
    const recovering = pending?.purpose === 'recover';
    node('password-title').textContent = changing ? `Cambiar clave de ${rewardSession?.member.nick || ''}` : `${recovering ? 'Crea tu nueva clave' : 'Crea tu clave'}: ${pending?.nick || ''}`;
    node('title').textContent = `${recovering ? 'Recuperar acceso' : 'Verifica tu personaje'}: ${pending?.nick || ''}`;
    node('recovery-note').hidden = !recovering || !matches || !!rewardSession;
    node('code').textContent = pending?.code || '';
    for (const button of root.querySelectorAll('button')) button.disabled = busy;
    if (matches && !rewardSession && rewardDialog.open && !document.hidden && !busy) timer = setTimeout(check,15000);
  }
  async function check() {
    if (busy || !requestForNick() || rewardSession || !rewardDialog.open) return;
    const version = revision, token = pending.token;
    busy = true; render();
    try {
      const result = await accessApi('status',{token});
      if (!valid(version,undefined) || pending?.token !== token) return;
      pending = {...result,token}; save();
      message(result.status === 'approved' ? `Identidad aprobada. Crea tu clave antes de ${new Date(result.expiresAt).toLocaleTimeString('es-PE',{timeZone:'America/Lima'})} (Peru).` : 'Pendiente: envia el codigo desde tu personaje y espera la verificacion del lider o sublider.');
    } catch (error) {
      if (!valid(version,undefined)) return;
      if (error.status === 409) { pending = null; save(); }
      message(error.message);
    } finally { busy = false; render(); }
  }
  refreshMemberAccess = () => { revision++; changing = false; clearPasswords(); message(''); render(); if (requestForNick() && !rewardSession && rewardDialog.open) check(); };
  async function start(purpose = 'enroll') {
    if (busy || rewardSession) return;
    const nick = rewardDialog.querySelector('[data-prize-login]').nick.value.trim();
    if (!nick) { message('Escribe tu nick de R2Beat en el formulario de acceso.'); return; }
    const version = ++revision;
    busy = true; message('Creando solicitud privada...'); render();
    try {
      const result = await accessApi('request',purpose === 'recover' ? {nick,purpose} : {nick});
      if (!valid(version,undefined)) return;
      pending = result; save(); clearPasswords(); message(purpose === 'recover' ? 'Envia el codigo desde tu personaje en R2Beat. Espera la aprobacion para crear tu nueva clave. Tu clave actual sigue vigente.' : 'Envia el codigo en el juego. Nadie debe pedirte tu contraseña de R2Beat.');
    } catch (error) { if (valid(version,undefined)) message(error.message); }
    finally { busy = false; render(); }
  }
  node('start').addEventListener('click',() => start());
  node('recover').addEventListener('click',() => start('recover'));
  node('check').addEventListener('click',check);
  node('forget').addEventListener('click',() => { revision++; pending = null; save(); clearPasswords(); message('Solicitud olvidada en este dispositivo. Si hace falta, puedes crear otra.'); render(); });
  node('change').addEventListener('click',() => { if (!rewardSession || busy) return; revision++; changing = true; clearPasswords(); message('Al guardar se cerraran tus sesiones de premios. Tu acceso de sublider, si tienes uno, sigue igual.'); render(); form.currentPassword.focus(); });
  node('cancel').addEventListener('click',() => { revision++; changing = false; clearPasswords(); if (pending?.status === 'approved') { pending = null; save(); } message(''); render(); });
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (busy) return;
    const password = form.newPassword.value, confirmPassword = form.confirmPassword.value;
    if (password !== confirmPassword) { message('Las claves no coinciden.'); return; }
    const version = revision, session = rewardSession?.token, ownChange = changing, requestToken = pending?.token;
    if (ownChange && !session || !ownChange && !requestToken) return;
    busy = true; message('Guardando tu clave...'); render();
    try {
      const recovering = !ownChange && pending?.purpose === 'recover';
      if (ownChange) await prizeRequest('password-change',{currentPassword:form.currentPassword.value,password,confirmPassword});
      else await accessApi('finish',{token:requestToken,password,confirmPassword});
      if (!valid(version,session)) return;
      if (ownChange) { rewardSession = null; saveRewardSession(); }
      pending = null; save(); changing = false; clearPasswords(); renderRewardIdentity();
      message(recovering ? 'Acceso recuperado. Se cerraron tus sesiones anteriores de premios. Inicia sesion con tu nueva clave.' : 'Clave guardada. Ahora inicia sesion con tu nueva clave.');
      rewardDialog.querySelector('[data-prize-login] [name="password"]').value = '';
      rewardDialog.querySelector('[data-prize-login] [name="password"]').focus();
    } catch (error) { if (valid(version,session)) { clearPasswords(); message(error.message); } }
    finally { busy = false; render(); }
  });
  rewardDialog.addEventListener('close',() => { revision++; changing = false; clearTimeout(timer); clearPasswords(); message(''); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) clearTimeout(timer); else if (rewardDialog.open) check(); });
  render();
})();

(() => {
  const dialog = document.querySelector('[data-access-link-dialog]');
  if (!dialog) return;
  window.addEventListener('hashchange', () => {
    const next = new URLSearchParams(location.hash.slice(1));
    if (/^[a-f0-9]{64}$/.test(next.get('acceso') || '')) location.reload();
  });
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get('acceso');
  let circle = fragment.get('circulo') || 'main';
  let credentials = /^[a-f0-9]{64}$/.test(token || '') && /^(main|[a-f0-9]{32})$/.test(circle) ? {token} : null;
  if (fragment.has('acceso')) {
    fragment.delete('acceso'); fragment.delete('circulo');
    history.replaceState(null, '', location.pathname + location.search + (fragment.size ? '#' + fragment : ''));
  }
  const form = dialog.querySelector('[data-access-link-password]'), status = dialog.querySelector('[data-access-link-status]');
  const shortForm = dialog.querySelector('[data-access-short-form]'), heading = dialog.querySelector('h2');
  const retry = dialog.querySelector('[data-access-link-retry]'), close = dialog.querySelector('[data-access-link-close]');
  let busy = false, finished = false;
  const invalidMessage = () => credentials?.token
    ? 'Este enlace venció o ya se usó. Pide un acceso nuevo a tu líder.'
    : 'El código no está disponible. Revisa tu nick, el círculo y el código, o pide uno nuevo.';
  async function request(action, body) {
    const url = new URL(`/api/access/${action}`, rewardApi);
    if (circle !== 'main') url.searchParams.set('circle', circle);
    const response = await fetch(url, { method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ ...credentials,...body }), signal:AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo comprobar el enlace.'),{status:response.status});
    return result;
  }
  async function check() {
    if (busy || !credentials || !rewardApi) return;
    busy = true; retry.hidden = true;
    shortForm.querySelector('button').disabled = true;
    status.textContent = 'Comprobando tu acceso…';
    try {
      const result = await request('status');
      if (result.status !== 'approved') throw Object.assign(new Error('Solicita un enlace nuevo a tu líder.'),{status:409});
      heading.textContent = `Acceso a Premios de ${result.nick}`;
      status.textContent = 'Elige una clave privada de al menos 15 caracteres.';
      shortForm.reset(); shortForm.hidden = true;
      form.hidden = false;
    } catch (error) {
      status.textContent = error.status === 409 ? invalidMessage() : error.message;
      retry.hidden = !credentials.token || error.status === 409;
    } finally { shortForm.querySelector('button').disabled = false; busy = false; }
  }
  if (credentials) openMemberAccessLink = () => {
    if (!rewardApi) return;
    openMemberAccessLink = undefined;
    dialog.showModal();
    void check();
  };
  for (const button of document.querySelectorAll('[data-access-use-code]')) {
    button.addEventListener('click',() => {
      if (busy || !rewardApi || dialog.open) return;
      const nick = rewardDialog?.open ? rewardDialog.querySelector('[data-prize-login]').elements.nick.value : '';
      if (rewardDialog?.open) rewardDialog.close();
      circle = window.mazinoSpaceId || 'main';
      heading.textContent = 'Acceso a Premios';
      status.textContent = 'Escribe tu nick de R2Beat y el código que te dio tu líder.';
      close.textContent = 'Cerrar';
      shortForm.hidden = false; shortForm.elements.nick.value = nick;
      dialog.showModal();
    });
  }
  shortForm.addEventListener('submit',event => {
    event.preventDefault();
    if (busy) return;
    credentials = {nick:shortForm.elements.nick.value.trim(),code:shortForm.elements.code.value.trim()};
    return check();
  });
  retry.addEventListener('click',check);
  close.addEventListener('click',() => {
    if (busy) return;
    dialog.close();
    if (!finished || (window.mazinoSpaceId || 'main') === circle) return;
    try {
      if (circle === 'main') sessionStorage.removeItem('mazino-selected-circle');
      else sessionStorage.setItem('mazino-selected-circle',circle);
      location.reload();
    } catch { /* The player can select their circle in the menu. */ }
  });
  dialog.addEventListener('close',() => {
    credentials = null; finished = false;
    form.reset(); form.hidden = true;
    shortForm.reset(); shortForm.hidden = true; retry.hidden = true;
  });
  dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (busy || !credentials) return;
    const password = form.elements.password.value, confirmPassword = form.elements.confirmPassword.value;
    if (password !== confirmPassword) { status.textContent = 'Las claves no coinciden.'; return; }
    busy = true; form.querySelector('button').disabled = true; status.textContent = 'Guardando tu clave…';
    try {
      const result = await request('finish',{password,confirmPassword});
      credentials = null; finished = true; form.hidden = true;
      if ((window.mazinoSpaceId || 'main') === circle && rewardSession?.member.nick === result.nick) {
        rewardSession = null; saveRewardSession(); renderRewardIdentity();
      }
      status.textContent = `Clave guardada. Elige tu círculo y pulsa el nick ${result.nick} para entrar a Premios.`;
      close.textContent = 'Ir a Mazino.lat';
    } catch (error) {
      status.textContent = error.status === 409 ? invalidMessage() : error.message;
      if (error.status === 409) { form.hidden = true; shortForm.hidden = Boolean(credentials.token); }
    } finally { form.reset(); form.querySelector('button').disabled = false; busy = false; }
  });
})();
