/* Loaded with defer before admin.js. Configuration and QR code are supplied by the build. */
(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const query = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const activationHelp = 'Abre el panel local y entra en «Acceso en la nube» para generar un enlace de activación.';
  let enrollmentToken = "";
  let activationError = false;
  // Consume the activation link before any request, including the initial status request.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (fragment.has("activar")) {
    enrollmentToken = fragment.get("activar") || "";
    fragment.delete("activar");
    const remaining = fragment.toString();
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + (remaining ? `#${remaining}` : ""));
    } catch (_) {
      enrollmentToken = "";
      activationError = true;
    }
  }

  let endpoint = "";
  try {
    const url = new URL(window.MAZINO_OWNER_ENDPOINT);
    const localFixture = url.protocol === "http:" && url.origin === window.location.origin && ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((url.protocol === "https:" || localFixture) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/") endpoint = url.origin;
  } catch (_) { /* Fail closed when the generated configuration is missing. */ }

  let token = "";
  let expiresAt = 0;
  let epoch = 0;
  let expiryTimer = null;
  let flow = null;
  let securityFlow = null;
  let passwordPrompt = null;
  let mfaSection = null;
  let expiryNotice = null;
  const requests = new Set();
  const downloads = new Set();
  document.documentElement.classList.add("owner-cloud");

  function element(tag, text, attributes = {}) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function status(message) {
    const node = query("[data-auth-status]");
    if (node) node.textContent = message;
  }

  function clearPasswords() {
    for (const node of all('input[type="password"], [data-owner-code], [data-owner-login-code], [data-staff-secret], [data-staff-secret-nick], [data-reward-secret], [data-reward-secret-nick], [data-event-key-output]')) node.value = "";
  }

  function showLogin(message = "") {
    if (typeof window.showAuth === "function") window.showAuth("login");
    const login = query("[data-login-view]");
    const dashboard = query("[data-dashboard]");
    const form = query("[data-login-form]");
    const setup = query("[data-setup-form]");
    if (login) login.hidden = false;
    if (dashboard) dashboard.hidden = true;
    if (form) {
      form.hidden = false;
      form.removeAttribute("aria-busy");
    }
    if (setup) setup.hidden = true;
    status(message);
  }

  function scrubSensitiveViews() {
    clearPasswords();
    for (const name of ["clearRewardCredential", "clearStaffSecret", "clearEventKey"]) {
      if (typeof window[name] === "function") window[name]();
    }
    for (const dialog of all("dialog[open]")) dialog.close();
    for (const node of all("[data-coupon-table], [data-assignment-table], [data-reward-events-table], [data-profile-prizes], [data-profile-history], [data-profile-facts], [data-staff-audit], [data-staff-accounts], [data-owner-sensitive]")) node.replaceChildren();
  }

  function discardFlow() {
    for (const url of downloads) URL.revokeObjectURL(url);
    downloads.clear();
    if (mfaSection) {
      for (const img of all("img", mfaSection)) img.removeAttribute("src");
      for (const input of all("input", mfaSection)) input.value = "";
      mfaSection.replaceChildren();
      mfaSection.hidden = true;
      mfaSection.removeAttribute("aria-busy");
    }
    const form = query("[data-login-form]");
    if (form) { form.hidden = false; form.removeAttribute("aria-busy"); }
  }

  function cancelLogin(message = "Acceso cancelado.") {
    const pending = flow;
    flow = null;
    if (pending) {
      pending.controller.abort();
      clearTimeout(pending.timer);
      pending.challengeToken = "";
      pending.session = null;
    }
    discardFlow();
    clearPasswords();
    status(message);
    if (pending) pending.reject(Object.assign(new Error(message), { name: "AbortError" }));
  }

  function clearSession(reason = "logout", reload = false) {
    token = "";
    enrollmentToken = "";
    expiresAt = 0;
    epoch++;
    clearTimeout(expiryTimer);
    expiryTimer = null;
    for (const controller of requests) controller.abort();
    requests.clear();
    cancelSecurity("La sesión finalizó.", true);
    if (passwordPrompt) passwordPrompt.cancel();
    cancelLogin(reason === "logout" ? "Sesión cerrada." : "La sesión caducó. Vuelve a ingresar.");
    document.documentElement.classList.remove("owner-cloud-authenticated");
    if (expiryNotice) { expiryNotice.hidden = true; expiryNotice.textContent = ""; }
    showLogin(reason === "logout" ? "Sesión cerrada." : "La sesión caducó. Vuelve a ingresar.");
    scrubSensitiveViews();
    window.dispatchEvent(new CustomEvent("mazino-owner-session-cleared", { detail: { reason } }));
    if (reason !== "logout" && reason !== "pagehide") {
      window.dispatchEvent(new CustomEvent("mazino-owner-session-expired", { detail: { reason } }));
      window.dispatchEvent(new CustomEvent("sessionexpired", { detail: { reason } }));
    }
    // A reload also discards extension state, delayed renderers and detached DOM.
    if (reload) window.location.reload();
  }

  function tickExpiry() {
    clearTimeout(expiryTimer);
    if (!token) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { clearSession("expired", true); return; }
    if (expiryNotice) {
      expiryNotice.hidden = remaining > 5 * 60 * 1000;
      expiryNotice.textContent = remaining <= 5 * 60 * 1000
        ? `Tu sesión caduca en ${Math.ceil(remaining / 60000)} min. Guarda los cambios pendientes; luego vuelve a ingresar.` : "";
    }
    expiryTimer = setTimeout(tickExpiry, Math.min(remaining, 30000));
  }

  function expiration(value) {
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) return expiration(Number(value));
    return typeof value === "string" ? Date.parse(value) : NaN;
  }

  function jsonResponse(data, statusCode = 200) {
    return new Response(JSON.stringify(data), { status: statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  async function bufferedBody(request, signal) {
    if (signal.aborted) throw new DOMException("Operación cancelada.", "AbortError");
    if (!request.body) return undefined;
    const limit = 350000;
    const reader = request.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks = [];
    let length = 0;
    try {
      if (Number(request.headers.get("Content-Length")) > limit) throw new Error("La petición supera el límite de 350 000 bytes.");
      while (true) {
        if (signal.aborted) throw new DOMException("Operación cancelada.", "AbortError");
        const chunk = await reader.read();
        if (signal.aborted) throw new DOMException("Operación cancelada.", "AbortError");
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > limit) throw new Error("La petición supera el límite de 350 000 bytes.");
        chunks.push(chunk.value);
      }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return body.buffer;
    } catch (error) {
      cancel();
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  }

  // Only same-origin /api/admin/* is rewritten. External/public requests are untouched.
  window.fetch = async function ownerFetch(input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input, window.location.href); }
    catch (_) { return nativeFetch(input, init); }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/admin/")) return nativeFetch(input, init);
    const request = input instanceof Request ? new Request(input, init) : new Request(url.href, init);
    const rest = url.pathname.slice("/api/admin/".length);
    if (securityFlow?.revoked && !["logout", "auth/logout"].includes(rest)) throw new Error("Guarda los nuevos códigos de recuperación y continúa para reanudar el panel.");
    if (token && Date.now() >= expiresAt) clearSession("expired", true);
    if (!endpoint) throw new Error("Falta la configuración segura del acceso en la nube.");
    const target = new URL(endpoint);
    target.pathname = `/api/owner/${rest}`;
    target.search = url.search;
    if (!target.pathname.startsWith("/api/owner/")) throw new Error("Ruta del panel no válida.");
    const headers = new Headers(request.headers);
    headers.delete("Authorization");
    const session = token;
    const revision = epoch;
    if (session) headers.set("Authorization", `Bearer ${session}`);
    // Headers (including X-Mazino-Circle), method and body survive Request inputs.
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const logout = rest === "logout" || rest === "auth/logout";
    if (session && !logout) requests.add(controller);
    let response;
    try {
      // Forget logout credentials before the first await, even with an offline network.
      if (logout) clearSession("logout");
      // Chromium treats a Request-derived POST as a streaming upload. Send a
      // bounded buffer so HTTP/1 fixtures and CORS endpoints receive ordinary POSTs.
      const body = await bufferedBody(request, controller.signal);
      if (controller.signal.aborted || (session && !logout && revision !== epoch)) throw new DOMException("Sesión finalizada.", "AbortError");
      response = await nativeFetch(target.href, {
        method: request.method, headers, body, integrity: request.integrity, keepalive: request.keepalive,
        credentials: "omit", mode: "cors", redirect: "error", cache: "no-store",
        referrerPolicy: "no-referrer", signal: controller.signal
      });
      if (session && !logout && revision !== epoch) throw new DOMException("Sesión finalizada.", "AbortError");
      if (response.status === 401 && session && !logout && !/^auth\/(login|verify)$/.test(rest) && rest !== "login") clearSession("unauthorized", true);
      if (rest === "status" && request.method === "GET") {
        const data = await response.json().catch(() => ({})) || {};
        if (session && revision !== epoch) throw new DOMException("Sesión finalizada.", "AbortError");
        if (!response.ok) return jsonResponse({ error: "No se pudo consultar el acceso en la nube." }, response.status);
        if (session && !data.authenticated) clearSession("unauthorized", true);
        // Whitelist the minimal backend status; never pass through a username.
        return jsonResponse({ configured: data.configured === true, authenticated: Boolean(session && data.authenticated && token), cloud: true, twoFactorRequired: true });
      }
      return response;
    } finally {
      request.signal.removeEventListener("abort", abort);
      requests.delete(controller);
      if (logout && token && revision === epoch) clearSession("logout");
    }
  };

  async function authRequest(path, payload, controller, protectedAction = false) {
    if (!endpoint) throw new Error("Falta la configuración segura del acceso en la nube.");
    let response;
    let body = JSON.stringify(payload);
    try {
      if (protectedAction && !token) throw new Error("Vuelve a ingresar para modificar la seguridad.");
      const send = protectedAction ? window.fetch : nativeFetch;
      response = await send(protectedAction ? `/api/admin/auth/${path}` : `${endpoint}/api/owner/auth/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
        credentials: "omit", mode: "cors", redirect: "error", cache: "no-store",
        referrerPolicy: "no-referrer", signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("No se pudo conectar con el acceso en la nube. Inténtalo de nuevo.");
    } finally { body = ""; }
    const data = await response.json().catch(() => ({})) || {};
    if (!response.ok) {
      // Never render arbitrary backend errors, which could reflect submitted secrets.
      let message = response.status === 429 ? path === "login"
        ? "Hay muchos intentos. Abre «Verificación adicional si hay muchos intentos» e incluye un código de tu autenticador. Si el límite afecta a tu conexión, espera unos minutos y vuelve a intentar."
        : "Demasiados intentos. Espera unos minutos y vuelve a intentar."
        : response.status >= 500 ? "El acceso en la nube no está disponible. Inténtalo de nuevo."
          : path === "login" ? "No se pudo iniciar el acceso. Revisa tu usuario y contraseña e inténtalo de nuevo."
            : "El código no es válido o el desafío caducó. Revisa el código o cancela para ingresar de nuevo.";
      if (path === "login" && /enroll|activat/i.test(String(data.code || ""))) message = activationHelp;
      throw Object.assign(new Error(message), { status: response.status });
    }
    if (!data || typeof data !== "object") throw new Error("Respuesta del acceso en la nube no válida.");
    return data;
  }

  function step(title, description) {
    discardFlow();
    query("[data-login-form]").hidden = true;
    mfaSection.hidden = false;
    const heading = element("h2", title, { id: "owner-mfa-title", tabindex: "-1" });
    mfaSection.append(heading, element("p", description, { class: "owner-cloud-note" }));
    heading.focus();
  }

  function cancelButton(parent, onCancel = () => cancelLogin()) {
    const button = element("button", "Cancelar", { type: "button", class: "ghost-button", "data-owner-cancel": "" });
    button.addEventListener("click", onCancel);
    parent.append(button);
    return button;
  }

  function factorForm(parent, allowRecovery, onVerify, passwordAlways = false) {
    const form = element("form", undefined, { "data-owner-factor-form": "" });
    const label = element("label");
    const labelText = element("span", "Código de tu aplicación autenticadora");
    const code = element("input", undefined, {
      name: "code", type: "text", inputmode: "numeric", autocomplete: "one-time-code",
      pattern: "[0-9]{6}", minlength: "6", maxlength: "6", required: "", "data-owner-code": "",
      "aria-describedby": "owner-factor-help", autocapitalize: "off", spellcheck: "false"
    });
    const help = element("p", "Escribe los 6 dígitos vigentes. Si están por cambiar, espera el siguiente código.", { id: "owner-factor-help", class: "owner-cloud-note" });
    label.append(labelText, code);
    const passwordLabel = element("label", undefined, { hidden: "" });
    const recoveryPassword = element("input", undefined, { name: "password", type: "password", autocomplete: "current-password", maxlength: "256", "data-owner-recovery-password": "" });
    passwordLabel.append(element("span", passwordAlways ? "Contraseña actual" : "Vuelve a escribir tu contraseña"), recoveryPassword);
    if (passwordAlways) { passwordLabel.hidden = false; recoveryPassword.required = true; recoveryPassword.name = "currentPassword"; }
    const feedback = element("p", "", { class: "form-status", role: "status", "aria-live": "polite" });
    const actions = element("div", undefined, { class: "owner-cloud-actions" });
    const submit = element("button", "Verificar", { type: "submit", class: "primary-action" });
    actions.append(submit);
    let recovery = false;
    let busy = false;
    let toggle;
    if (allowRecovery) {
      toggle = element("button", "Usar un código de recuperación", { type: "button", class: "owner-cloud-link", "aria-pressed": "false" });
      toggle.addEventListener("click", () => {
        if (busy) return;
        recovery = !recovery;
        code.value = "";
        recoveryPassword.value = "";
        passwordLabel.hidden = !passwordAlways && !recovery;
        recoveryPassword.required = passwordAlways || recovery;
        code.name = recovery ? "recoveryCode" : "code";
        code.inputMode = recovery ? "text" : "numeric";
        code.autocomplete = recovery ? "off" : "one-time-code";
        code.maxLength = recovery ? 128 : 6;
        code.minLength = recovery ? 1 : 6;
        if (recovery) code.removeAttribute("pattern"); else code.pattern = "[0-9]{6}";
        labelText.textContent = recovery ? "Código de recuperación" : "Código de tu aplicación autenticadora";
        help.textContent = recovery ? "Cada código de recuperación sirve una sola vez." : "Escribe los 6 dígitos vigentes.";
        toggle.textContent = recovery ? "Usar mi aplicación autenticadora" : "Usar un código de recuperación";
        toggle.setAttribute("aria-pressed", String(recovery));
        feedback.textContent = "";
        code.focus();
      });
    }
    form.append(label, help, passwordLabel, actions);
    if (toggle) form.append(toggle);
    form.append(feedback);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      const value = code.value.trim();
      if ((!recovery && !/^[0-9]{6}$/.test(value)) || (recovery && (!value || value.length > 128))) {
        feedback.textContent = recovery ? "Escribe tu código de recuperación." : "Escribe exactamente 6 dígitos.";
        code.focus();
        return;
      }
      if ((recovery || passwordAlways) && !recoveryPassword.value) {
        feedback.textContent = "Vuelve a escribir tu contraseña para confirmar esta operación.";
        recoveryPassword.focus();
        return;
      }
      const factor = recovery ? { recoveryCode: value } : { code: value };
      if (passwordAlways) factor.currentPassword = recoveryPassword.value;
      else if (recovery) factor.password = recoveryPassword.value;
      recoveryPassword.value = "";
      busy = true;
      submit.disabled = true;
      code.disabled = true;
      recoveryPassword.disabled = true;
      if (toggle) toggle.disabled = true;
      form.setAttribute("aria-busy", "true");
      feedback.textContent = "Verificando…";
      code.value = "";
      try { await onVerify(factor); }
      catch (error) {
        if (form.isConnected) {
          feedback.textContent = error.name === "AbortError" ? "Operación cancelada." : error.message;
          code.focus();
        }
      } finally {
        if ("password" in factor) factor.password = "";
        if ("currentPassword" in factor) factor.currentPassword = "";
        busy = false;
        submit.disabled = false;
        code.disabled = false;
        recoveryPassword.disabled = false;
        if (toggle) toggle.disabled = false;
        form.removeAttribute("aria-busy");
        if (form.isConnected) code.focus();
      }
    });
    parent.append(form);
    return form;
  }

  async function enrollmentQr(uri, pending, image) {
    const generator = typeof window.mazinoOwnerQr === "function" ? window.mazinoOwnerQr
      : typeof window.MAZINO_QR?.toDataURL === "function" ? value => window.MAZINO_QR.toDataURL(value) : null;
    if (!generator || !uri) return;
    try {
      const data = await generator(uri);
      if ((flow !== pending && securityFlow !== pending) || !image.isConnected) return;
      // Never contact a remote QR service with the enrollment secret.
      if (typeof data === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(data)) { image.src = data; image.hidden = false; }
    } catch (_) { /* The manual key remains available if local QR generation fails. */ }
  }

  function finishLogin(pending) {
    if (flow !== pending || !pending.session) return;
    if (pending.session.expiresAt <= Date.now()) { cancelLogin("La sesión caducó. Vuelve a ingresar."); return; }
    token = pending.session.token;
    enrollmentToken = "";
    expiresAt = pending.session.expiresAt;
    pending.session = null;
    pending.challengeToken = "";
    clearTimeout(pending.timer);
    flow = null;
    epoch++;
    discardFlow();
    clearPasswords();
    document.documentElement.classList.add("owner-cloud-authenticated");
    status("");
    tickExpiry();
    window.dispatchEvent(new CustomEvent("mazino-owner-authenticated"));
    pending.resolve({ ok: true, authenticated: true, expiresAt });
  }

  function recoveryStep(pending, codes) {
    step("Guarda tus códigos de recuperación", "Solo se muestran una vez. Guárdalos en un lugar privado; cada código permite un acceso si pierdes tu autenticador.");
    recoveryDisplay(mfaSection, pending, codes, () => finishLogin(pending), () => cancelLogin());
  }

  function recoveryDisplay(parent, pending, codes, onContinue, onCancel) {
    const list = element("ul", undefined, { class: "owner-recovery-codes", "data-owner-sensitive": "" });
    for (const code of codes) list.append(element("li", code));
    const download = element("button", "Descargar códigos (.txt)", { type: "button", class: "ghost-button" });
    const feedback = element("p", "", { role: "status", class: "form-status" });
    download.addEventListener("click", () => {
      if (flow !== pending && securityFlow !== pending) return;
      const contents = ["MAZINO — Códigos de recuperación", "Privados. Cada código sirve una sola vez.", "", ...all("li", list).map(node => node.textContent)].join("\n");
      let url;
      let link;
      try {
        url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
        downloads.add(url);
        link = element("a", "", { href: url, download: "mazino-codigos-recuperacion.txt" });
        document.body.append(link);
        link.click();
        feedback.textContent = "Descarga solicitada. Comprueba que el archivo se haya guardado.";
      } catch (_) { feedback.textContent = "No se pudo descargar. Guarda los códigos manualmente antes de continuar."; }
      finally { if (link) link.remove(); if (url) setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 1000); }
    });
    const label = element("label", undefined, { class: "owner-cloud-saved" });
    const saved = element("input", undefined, { type: "checkbox", "data-owner-codes-saved": "" });
    label.append(saved, element("span", "He guardado mis códigos en un lugar seguro."));
    const actions = element("div", undefined, { class: "owner-cloud-actions" });
    const next = element("button", "Continuar al panel", { type: "button", class: "primary-action", disabled: "" });
    saved.addEventListener("change", () => { next.disabled = !saved.checked; });
    next.addEventListener("click", () => { if (saved.checked) onContinue(); });
    actions.append(next);
    cancelButton(actions, onCancel);
    parent.append(list, download, feedback, label, actions);
  }

  function enrollmentDetails(data) {
    const uri = typeof data.otpauthUri === "string" ? data.otpauthUri : typeof data.otpUri === "string" ? data.otpUri : "";
    let secret = typeof data.secret === "string" ? data.secret : "";
    try {
      const parsed = new URL(uri);
      const key = parsed.searchParams.get("secret") || "";
      if (parsed.protocol !== "otpauth:" || parsed.hostname !== "totp" || !parsed.pathname.slice(1) || !/^[A-Z2-7]+=*$/i.test(key) || (secret && secret !== key)) return null;
      if (!secret) secret = key;
      return { uri, secret };
    } catch (_) { return null; }
  }

  function renderEnrollment(parent, pending, details) {
    const image = element("img", undefined, { alt: "QR privado para tu aplicación autenticadora", class: "owner-cloud-qr", width: "224", height: "224", hidden: "" });
    parent.append(image, element("p", "Clave para introducir manualmente:", { class: "owner-cloud-note" }), element("code", details.secret, { class: "owner-cloud-secret", "data-owner-sensitive": "" }));
    void enrollmentQr(details.uri, pending, image);
  }

  function challengeStep(pending, data) {
    const enroll = data.purpose === "enroll";
    step(enroll ? "Activa la verificación en dos pasos" : "Verifica tu acceso", enroll
      ? "Añade esta cuenta a tu aplicación autenticadora. Escanea el QR o introduce la clave manual; luego escribe el código de 6 dígitos."
      : "Abre tu aplicación autenticadora para completar el acceso al panel.");
    if (enroll) {
      const details = enrollmentDetails(data);
      if (!details) throw new Error(activationHelp);
      renderEnrollment(mfaSection, pending, details);
    }
    const form = factorForm(mfaSection, !enroll, async factor => {
      const payload = { challengeToken: pending.challengeToken, ...factor };
      const request = authRequest("verify", payload, pending.controller);
      if ("password" in payload) payload.password = "";
      const result = await request;
      if (flow !== pending) return;
      const until = expiration(result.expiresAt);
      if (typeof result.token !== "string" || !result.token || !Number.isFinite(until) || until <= Date.now()) throw new Error("La sesión recibida no es válida. Cancela y vuelve a ingresar.");
      if (enroll && (!Array.isArray(result.recoveryCodes) || result.recoveryCodes.length === 0)) throw new Error("Faltan los códigos de recuperación. Cancela y vuelve a ingresar.");
      const codes = Array.isArray(result.recoveryCodes) ? result.recoveryCodes.filter(code => typeof code === "string" && code.length > 0) : [];
      if (enroll && !codes.length) throw new Error("No se recibieron códigos de recuperación válidos.");
      pending.session = { token: result.token, expiresAt: until };
      pending.challengeToken = "";
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => { if (flow === pending) cancelLogin("La sesión caducó. Vuelve a ingresar."); }, Math.min(until - Date.now(), 2147483647));
      if (codes.length) recoveryStep(pending, codes); else finishLogin(pending);
    });
    cancelButton(query(".owner-cloud-actions", form));
  }

  // Resolves only after MFA AND, for enrollment, explicit recovery-code confirmation.
  // The returned value deliberately contains no bearer, challenge or username.
  window.mazinoOwnerLogin = function mazinoOwnerLogin(credentials = {}) {
    if (flow || securityFlow) return Promise.reject(new Error("Ya hay un acceso en curso. Complétalo o cancélalo."));
    if (token) return Promise.reject(new Error("La sesión ya está abierta."));
    if (!mfaSection || !query("[data-login-form]")) return Promise.reject(new Error("El formulario de acceso aún no está disponible."));
    if (activationError) return Promise.reject(new Error(`No se pudo limpiar el enlace de activación. ${activationHelp}`));
    const username = typeof credentials.username === "string" ? credentials.username : "";
    let password = typeof credentials.password === "string" ? credentials.password : "";
    const extra = query("[data-owner-login-code]");
    let initialCode = (typeof credentials.code === "string" ? credentials.code : extra?.value || "").trim();
    clearPasswords();
    if (!username.trim() || !password) return Promise.reject(new Error("Escribe tu usuario y contraseña."));
    if (initialCode && !/^[0-9]{6}$/.test(initialCode)) return Promise.reject(new Error("El código de verificación adicional debe tener exactamente 6 dígitos."));
    const promise = new Promise((resolve, reject) => {
      const pending = { resolve, reject, controller: new AbortController(), challengeToken: "", session: null, timer: null };
      flow = pending;
      step("Comprobando acceso", "Conectando de forma segura con el panel en la nube…");
      mfaSection.setAttribute("aria-busy", "true");
      cancelButton(mfaSection);
      const payload = { username, password };
      if (/^[0-9]{6}$/.test(initialCode)) payload.code = initialCode;
      if (enrollmentToken) payload.enrollmentToken = enrollmentToken;
      const request = authRequest("login", payload, pending.controller);
      payload.password = "";
      delete payload.code;
      delete payload.enrollmentToken;
      password = "";
      initialCode = "";
      request.then(data => {
        if (flow !== pending) return;
        if (typeof data.challengeToken !== "string" || !data.challengeToken || !["enroll", "totp"].includes(data.purpose)) throw new Error("El servidor no devolvió un desafío 2FA válido.");
        pending.challengeToken = data.challengeToken;
        const challengeExpires = expiration(data.expiresAt);
        if (Number.isFinite(challengeExpires)) {
          if (challengeExpires <= Date.now()) throw new Error("El desafío caducó. Vuelve a ingresar.");
          pending.timer = setTimeout(() => { if (flow === pending) cancelLogin("El desafío caducó. Vuelve a ingresar."); }, Math.min(challengeExpires - Date.now(), 2147483647));
        }
        mfaSection.removeAttribute("aria-busy");
        challengeStep(pending, data);
      }).catch(error => {
        if (flow !== pending) return;
        flow = null;
        pending.controller.abort();
        clearTimeout(pending.timer);
        pending.challengeToken = "";
        pending.session = null;
        discardFlow();
        clearPasswords();
        status(error.message);
        if (error.status === 429) {
          const details = query("[data-owner-login-extra]");
          if (details) details.open = true;
          if (extra) { extra.readOnly = false; extra.focus(); }
        }
        reject(error);
      });
    });
    return promise;
  };

  function securityStatus(message) {
    const node = query("[data-owner-security-status]");
    if (node) node.textContent = message;
  }

  function scrubSecurityStep(pending) {
    for (const image of all("img", pending.section)) image.removeAttribute("src");
    for (const input of all("input", pending.section)) input.value = "";
    pending.section.replaceChildren();
    for (const url of downloads) URL.revokeObjectURL(url);
    downloads.clear();
  }

  function closeSecurity(pending) {
    clearTimeout(pending.timer);
    scrubSecurityStep(pending);
    pending.dialog.close();
    pending.dialog.remove();
    pending.challengeToken = "";
    pending.session = null;
    for (const button of all("[data-owner-security-action]")) button.disabled = false;
    clearPasswords();
  }

  function cancelSecurity(message = "Operación cancelada.", fromSession = false) {
    const pending = securityFlow;
    if (!pending) return;
    securityFlow = null;
    pending.controller.abort();
    closeSecurity(pending);
    securityStatus(message);
    // After verification the old session is already revoked. A cancelled code
    // display must never resume the dashboard with that invalid credential.
    if (pending.revoked && !fromSession) {
      clearSession("logout");
      showLogin("El autenticador cambió. Vuelve a ingresar con el nuevo código.");
    }
    pending.reject(Object.assign(new Error(message), { name: "AbortError" }));
  }

  function securityStep(pending, title, description) {
    scrubSecurityStep(pending);
    const heading = element("h2", title, { id: "owner-security-step-title", tabindex: "-1" });
    pending.section.append(heading, element("p", description, { class: "owner-cloud-note" }));
    heading.focus();
  }

  function finishSecurity(pending) {
    if (securityFlow !== pending) return;
    if (pending.revoked) {
      if (!pending.session || pending.session.expiresAt <= Date.now()) { cancelSecurity("La sesión caducó. Vuelve a ingresar."); return; }
      token = pending.session.token;
      expiresAt = pending.session.expiresAt;
      enrollmentToken = "";
      epoch++;
    }
    securityFlow = null;
    closeSecurity(pending);
    tickExpiry();
    securityStatus(pending.kind === "replace" ? "Autenticador actualizado. Continúa usando tu nueva aplicación." : "Códigos renovados. Los anteriores dejaron de funcionar.");
    window.dispatchEvent(new CustomEvent("mazino-owner-security-updated", { detail: { action: pending.kind } }));
    pending.resolve({ ok: true, action: pending.kind });
  }

  function newCodesStep(pending, codes) {
    securityStep(pending, "Guarda tus nuevos códigos de recuperación", "Los anteriores dejaron de funcionar. Estos solo se muestran una vez; cada código sirve para un acceso. Guarda el archivo .txt en un lugar privado.");
    recoveryDisplay(pending.section, pending, codes, () => finishSecurity(pending), () => cancelSecurity());
  }

  function replacementStep(pending, data) {
    const details = enrollmentDetails(data);
    if (data.purpose !== "replace" || typeof data.challengeToken !== "string" || !data.challengeToken || !details) throw new Error("No se recibió un desafío válido para cambiar el autenticador. Cancela e inténtalo de nuevo.");
    pending.challengeToken = data.challengeToken;
    const until = expiration(data.expiresAt);
    if (Number.isFinite(until) && until <= Date.now()) throw new Error("El desafío caducó. Cancela e inténtalo de nuevo.");
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => { if (securityFlow === pending) cancelSecurity("El desafío caducó. Inicia el cambio otra vez."); }, Number.isFinite(until) ? Math.min(until - Date.now(), 2147483647) : 600000);
    securityStep(pending, "Configura tu nuevo autenticador", "Escanea el QR con la nueva aplicación o añade la clave manual. Confirma un código de esa nueva cuenta para completar el cambio. El autenticador actual sigue funcionando hasta esta confirmación.");
    renderEnrollment(pending.section, pending, details);
    const form = factorForm(pending.section, false, async factor => {
      const result = await authRequest("verify", { challengeToken: pending.challengeToken, code: factor.code }, pending.controller, true);
      if (securityFlow !== pending) return;
      // The successful verification atomically revoked the old sessions. Hold
      // the replacement bearer privately until the user has saved their codes.
      pending.revoked = true;
      token = "";
      expiresAt = 0;
      epoch++;
      clearTimeout(expiryTimer);
      expiryTimer = null;
      for (const controller of requests) controller.abort();
      requests.clear();
      const until = expiration(result.expiresAt);
      const codes = result.recoveryCodes;
      if (typeof result.token !== "string" || !result.token || !Number.isFinite(until) || until <= Date.now() || !Array.isArray(codes) || !codes.length || !codes.every(code => typeof code === "string" && code)) {
        cancelSecurity("La respuesta del cambio no es válida. Vuelve a ingresar con tu nuevo autenticador.");
        return;
      }
      pending.session = { token: result.token, expiresAt: until };
      pending.challengeToken = "";
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => { if (securityFlow === pending) cancelSecurity("La sesión caducó. Vuelve a ingresar."); }, Math.min(until - Date.now(), 2147483647));
      newCodesStep(pending, codes);
    });
    cancelButton(query(".owner-cloud-actions", form), () => cancelSecurity());
  }

  function securityAction(kind) {
    if (!token || Date.now() >= expiresAt) return Promise.reject(new Error("Vuelve a ingresar para modificar la seguridad."));
    if (flow || securityFlow || passwordPrompt) return Promise.reject(new Error("Completa o cancela la verificación abierta."));
    return new Promise((resolve, reject) => {
      const dialog = element("dialog", undefined, { class: "owner-cloud-dialog", "aria-labelledby": "owner-security-step-title", "data-owner-security-dialog": "" });
      const section = element("section", undefined, { "data-owner-security-step": "" });
      dialog.append(section);
      const pending = { kind, dialog, section, resolve, reject, controller: new AbortController(), timer: null, challengeToken: "", session: null, revoked: false };
      securityFlow = pending;
      pending.timer = setTimeout(() => { if (securityFlow === pending) cancelSecurity("La verificación caducó. Inténtalo de nuevo."); }, 600000);
      for (const button of all("[data-owner-security-action]")) button.disabled = true;
      securityStatus("");
      securityStep(pending, kind === "replace" ? "Cambiar autenticador" : "Renovar códigos de recuperación", kind === "replace"
        ? "Confirma tu contraseña y un código del autenticador actual. Si ya no lo tienes, usa un código de recuperación y tu contraseña."
        : "Confirma tu contraseña y un código vigente de tu autenticador. Al renovar, los códigos de recuperación anteriores dejarán de funcionar.");
      const form = factorForm(section, kind === "replace", async factor => {
        const request = authRequest(kind === "replace" ? "mfa-begin" : "recovery-codes", factor, pending.controller, true);
        factor.currentPassword = "";
        const data = await request;
        if (securityFlow !== pending) return;
        if (kind === "replace") replacementStep(pending, data);
        else {
          if (!Array.isArray(data.recoveryCodes) || !data.recoveryCodes.length || !data.recoveryCodes.every(code => typeof code === "string" && code)) throw new Error("No se recibieron códigos válidos. Cancela y vuelve a renovar tus códigos.");
          newCodesStep(pending, data.recoveryCodes);
        }
      }, true);
      cancelButton(query(".owner-cloud-actions", form), () => cancelSecurity());
      dialog.addEventListener("cancel", event => { event.preventDefault(); cancelSecurity(); });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  window.mazinoOwnerChangeAuthenticator = () => securityAction("replace");
  window.mazinoOwnerRenewRecoveryCodes = () => securityAction("recovery");

  // Optional integration: return an MFA factor for the main password handler to
  // include in its /api/admin/password (or /security) request. No password is sent here.
  window.mazinoOwnerRequestPasswordChange = function mazinoOwnerRequestPasswordChange() {
    if (!token) return Promise.reject(new Error("Vuelve a ingresar antes de cambiar tu contraseña."));
    if (passwordPrompt || securityFlow || flow) return Promise.reject(new Error("Ya hay una verificación abierta."));
    const existing = query("[data-password-form] [data-owner-code]");
    if (existing && /^[0-9]{6}$/.test(existing.value.trim())) {
      const code = existing.value.trim();
      existing.value = "";
      return Promise.resolve({ code });
    }
    return new Promise((resolve, reject) => {
      const dialog = element("dialog", undefined, { class: "owner-cloud-dialog", "aria-labelledby": "owner-password-title" });
      dialog.append(element("h2", "Confirma el cambio de contraseña", { id: "owner-password-title" }));
      const cleanup = () => { for (const input of all("input", dialog)) input.value = ""; dialog.close(); dialog.remove(); passwordPrompt = null; };
      const cancel = () => { cleanup(); clearPasswords(); reject(Object.assign(new Error("Cambio de contraseña cancelado."), { name: "AbortError" })); };
      passwordPrompt = { cancel };
      const form = factorForm(dialog, false, async factor => { cleanup(); resolve(factor); });
      const button = element("button", "Cancelar", { type: "button", class: "ghost-button" });
      button.addEventListener("click", cancel);
      query(".owner-cloud-actions", form).append(button);
      dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
      document.body.append(dialog);
      dialog.showModal();
    });
  };

  window.mazinoOwnerLogout = () => window.fetch("/api/admin/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  window.mazinoOwnerClear = () => clearSession("logout");

  function initialize() {
    document.documentElement.classList.add("owner-cloud");
    const form = query("[data-login-form]");
    if (form && !mfaSection) {
      const intro = element("p", "Accede con tu usuario, contraseña y código de verificación en dos pasos.", { class: "owner-cloud-note", "data-owner-login-intro": "" });
      form.before(element("span", "Acceso en la nube · 2FA", { class: "owner-cloud-badge" }), intro);
      mfaSection = element("section", undefined, { "data-owner-mfa": "", "aria-labelledby": "owner-mfa-title", hidden: "" });
      form.after(mfaSection);
      const hint = element("p", "Para activar 2FA por primera vez, inicia desde «Acceso en la nube» en tu panel local. Si ya tienes un autenticador, ingresa normalmente. La sesión dura solo en esta pestaña; al recargar tendrás que ingresar otra vez.", { class: "owner-cloud-note owner-cloud-local-info" });
      mfaSection.after(hint);
      mfaSection.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); cancelLogin(); } });
    }
    if (form && !query("[data-owner-login-extra]", form)) {
      const details = element("details", undefined, { "data-owner-login-extra": "", class: "owner-cloud-login-extra" });
      details.append(element("summary", "Verificación adicional si hay muchos intentos"));
      const label = element("label");
      const code = element("input", undefined, { name: "ownerLoginCode", type: "text", inputmode: "numeric", autocomplete: "off", autocapitalize: "off", spellcheck: "false", pattern: "[0-9]{6}", minlength: "6", maxlength: "6", readonly: "", "data-owner-login-code": "", "aria-describedby": "owner-login-extra-help" });
      code.readOnly = true;
      label.append(element("span", "Código adicional del autenticador (opcional)"), code);
      details.append(label, element("p", "Si el acceso pide verificación adicional, escribe los 6 dígitos actuales. Podrás usar ese mismo código en el siguiente paso; el primer envío no lo consume.", { id: "owner-login-extra-help", class: "owner-cloud-note" }));
      details.addEventListener("toggle", () => { code.readOnly = !details.open; if (!details.open) code.value = ""; });
      const submit = query('[type="submit"]', form);
      if (submit) submit.before(details); else form.append(details);
    }
    const topbar = query(".admin-topbar");
    if (topbar && !query("[data-owner-cloud-badge]", topbar)) topbar.prepend(element("span", "Nube · 2FA", { class: "owner-cloud-badge", "data-owner-cloud-badge": "" }));
    const dashboard = query("[data-dashboard]");
    if (dashboard && !expiryNotice) {
      expiryNotice = element("p", "", { class: "owner-cloud-expiry", role: "status", "aria-live": "polite", hidden: "" });
      dashboard.prepend(expiryNotice);
    }
    const githubForm = query("[data-github-form]");
    if (githubForm) githubForm.hidden = true;
    const githubTitle = query("#github-title");
    if (githubTitle) githubTitle.textContent = "Publicación en la nube";
    const githubStatus = query("[data-github-status]");
    if (githubStatus) githubStatus.textContent = "Guardar y publicar actualiza la web desde la nube. Los respaldos locales se gestionan desde tu panel local.";
    const githubBadge = query("[data-github-badge]");
    if (githubBadge) githubBadge.textContent = "Nube";
    const passwordForm = query("[data-password-form]");
    if (passwordForm && !query("[data-owner-backup-info]")) passwordForm.before(element("p", "Tu panel local sigue disponible como respaldo. Para un autenticador ya configurado, usa las opciones de seguridad de esta página.", { class: "owner-cloud-note", "data-owner-backup-info": "" }));
    if (passwordForm && !query('input[name="code"]', passwordForm)) {
      const label = element("label");
      const input = element("input", undefined, { name: "code", type: "text", inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", minlength: "6", maxlength: "6", required: "", "data-owner-code": "" });
      label.append(element("span", "Código de tu aplicación autenticadora"), input);
      const submit = query('[type="submit"]', passwordForm);
      if (submit) submit.before(label); else passwordForm.append(label);
    }
    if (passwordForm && !query("[data-owner-security]")) {
      const section = element("section", undefined, { "data-owner-security": "", class: "owner-cloud-security" });
      section.append(element("h3", "Verificación en dos pasos"), element("p", "Puedes cambiar de aplicación autenticadora o renovar tus códigos. Guarda los archivos de recuperación en un lugar privado, fuera de carpetas públicas.", { class: "owner-cloud-note" }));
      const actions = element("div", undefined, { class: "owner-cloud-actions" });
      for (const [kind, title, run] of [["replace", "Cambiar autenticador", window.mazinoOwnerChangeAuthenticator], ["recovery", "Renovar códigos de recuperación", window.mazinoOwnerRenewRecoveryCodes]]) {
        const button = element("button", title, { type: "button", class: "ghost-button", "data-owner-security-action": kind });
        button.addEventListener("click", () => { run().catch(error => { if (error.name !== "AbortError") securityStatus(error.message); }); });
        actions.append(button);
      }
      section.append(actions, element("p", "", { "data-owner-security-status": "", class: "form-status", role: "status", "aria-live": "polite" }));
      passwordForm.after(section);
    }
    const adminPath = query('[data-settings-form] [name="adminPath"]');
    if (adminPath) { adminPath.readOnly = true; adminPath.setAttribute("aria-readonly", "true"); adminPath.title = "La ruta del administrador en la nube es fija."; }
    // Main normally calls the logout gateway synchronously; this fallback still
    // clears memory if another handler fails before reaching fetch.
    for (const logout of all("[data-logout]")) logout.addEventListener("click", () => {
      queueMicrotask(() => { if (token || flow) clearSession("logout"); });
    }, { capture: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  // With defer the DOM is already parsed even while readyState is interactive.
  else initialize();
  window.addEventListener("pagehide", () => { enrollmentToken = ""; clearSession("pagehide"); });
  window.addEventListener("pageshow", event => { if (event.persisted && !token) showLogin(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tickExpiry(); });
})();
