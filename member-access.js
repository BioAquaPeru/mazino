let refreshMemberAccess;
(() => {
  const root = rewardDialog.querySelector('[data-member-access]');
  if (!root) return;
  const node = name => root.querySelector(`[data-access-${name}]`);
  const form = node('password'), storageKey = 'mazino-access-request-v1';
  let pending = null, timer, revision = 0, busy = false, changing = false;
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.expiresAt > Date.now() && /^[a-f0-9]{64}$/.test(saved.token)) pending = saved; } catch { /* Private request still works without storage. */ }
  const message = text => { node('message').textContent = text; };
  const save = () => { try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending)); else sessionStorage.removeItem(storageKey); } catch { /* Keep this tab open when storage is unavailable. */ } };
  const clearPasswords = () => { form.reset(); };
  const requestForNick = () => pending && String(pending.nick).normalize('NFKC').trim().toLowerCase() === String(rewardDialog.querySelector('[data-prize-login]').nick.value).normalize('NFKC').trim().toLowerCase();
  const valid = (version, session) => rewardDialog.open && revision === version && rewardSession?.token === session;
  async function accessApi(action, body) {
    if (!rewardApi) throw new Error('El servicio de acceso aun no esta disponible.');
    const response = await fetch(`${rewardApi}/api/access/${action}`, { method: 'POST', cache: 'no-store', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo consultar tu solicitud.'), {status:response.status});
    return result;
  }
  function render() {
    clearTimeout(timer);
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
