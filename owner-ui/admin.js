let adminState = null;
let githubPollTimer = null;
let rosterPollTimer = null;
let rosterRefreshInProgress = false;
let rosterRevision = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function api(path, options = {}) {
  if(adminState?.cloud&&options.body&&/^\/api\/admin\/(settings|members\/|featured-order|publish|sync-r2beat|sync-settings|discard-draft|rewards\/members)/.test(path)){
    let revision=adminState.workspaceVersion;
    if(path==='/api/admin/settings')revision=Number($('[data-settings-form]').dataset.workspaceVersion);
    if(path.startsWith('/api/admin/members/')&&!$('[data-member-editor]').hidden)revision=Number($('[data-member-form]').dataset.workspaceVersion);
    try{options={...options,body:JSON.stringify({...JSON.parse(options.body),workspaceVersion:revision})};}catch{}
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(typeof adminCircleId==='string'&&adminCircleId!=='main'?{'X-Mazino-Circle':adminCircleId}:{}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok){if(response.status===409&&adminState?.cloud)window.dispatchEvent(new CustomEvent('mazino-workspace-conflict'));throw new Error(data.error || "Operacion fallida.");}
  if(adminState&&Number.isInteger(data.workspaceVersion))adminState.workspaceVersion=data.workspaceVersion;
  if(path==='/api/admin/settings'&&Number.isInteger(data.workspaceVersion))$('[data-settings-form]').dataset.workspaceVersion=String(data.workspaceVersion);
  if(path.startsWith('/api/admin/members/')&&Number.isInteger(data.workspaceVersion))$('[data-member-form]').dataset.workspaceVersion=String(data.workspaceVersion);
  return data;
}

function showAuth(mode) {
  clearTimeout(rosterPollTimer);
  adminState = null;
  $("[data-login-view]").hidden = false;
  $("[data-dashboard]").hidden = true;
  $("[data-setup-form]").hidden = mode !== "setup";
  $("[data-login-form]").hidden = mode !== "login";
}

function showDashboard() {
  $("[data-login-view]").hidden = true;
  $("[data-dashboard]").hidden = false;
  scheduleRosterRefresh();
  if (typeof refreshAdminPrizes === "function") refreshAdminPrizes();
  if (typeof renderAdminHome === "function") renderAdminHome();
  if (typeof refreshDailySummary === "function") refreshDailySummary();
}

function fillSettings() {
  const form = $("[data-settings-form]");
  form.dataset.workspaceVersion=String(adminState.workspaceVersion||'');
  form.elements.adminPath.readOnly=!!adminState.cloud;
  const settings = adminState.draft.settings;
  Object.entries(settings).forEach(([key, value]) => {
    if (!form.elements[key]) return;
    if (form.elements[key].type === "checkbox") {
      form.elements[key].checked = Boolean(value);
    } else {
      form.elements[key].value = value ?? "";
    }
  });
}

function sortedMembers() {
  return [...adminState.draft.members].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.featured && b.featured) return (a.featuredOrder || 0) - (b.featuredOrder || 0);
    return b.level - a.level || a.nick.localeCompare(b.nick);
  });
}

function adminSearchKey(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function joinedDateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}

function limaToday(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-");
}

function memberJoinedMarkup(member, today = limaToday()) {
  const joined = joinedDateNumber(member.joinedOn);
  if (joined === null) return '<span class="muted">Sin fecha</span>';
  const days = Math.floor((joinedDateNumber(today) - joined) / 86400000);
  const label = days < 0 ? "Fecha futura" : `${days} dia${days === 1 ? "" : "s"}`;
  return `<time datetime="${member.joinedOn}">${member.joinedOn.split("-").reverse().join("/")}</time><small class="member-tenure">${label}</small>`;
}

function filterAdminMembers(members, filter = "", { joinedFrom = "", joinedTo = "" } = {}) {
  const query = adminSearchKey(filter);
  const from = joinedDateNumber(joinedFrom);
  const to = joinedDateNumber(joinedTo);
  const byId = new Map(members.map((member) => [member.id, member]));
  return members.filter((member) => {
    if (query && ![member.nick, member.rank, member.title, byId.get(member.partnerId)?.nick]
      .some((value) => adminSearchKey(value).includes(query))) return false;
    if (from === null && to === null) return true;
    const joined = joinedDateNumber(member.joinedOn);
    return joined !== null && (from === null || joined >= from) && (to === null || joined <= to);
  });
}

function sortAdminMembers(members, order = "default") {
  if (order !== "oldest" && order !== "newest") return members;
  return [...members].sort((a, b) => {
    const left = joinedDateNumber(a.joinedOn), right = joinedDateNumber(b.joinedOn);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return (order === "oldest" ? left - right : right - left) || a.nick.localeCompare(b.nick);
  });
}

function partnerSearchChoices(members, currentId, selectedId, filter = "") {
  const query = adminSearchKey(filter);
  const candidates = members.filter((member) => member.id !== currentId);
  const matches = candidates.filter((member) => adminSearchKey(member.nick).includes(query));
  const selected = candidates.find((member) => member.id === selectedId);
  const pinned = selected && !matches.some((member) => member.id === selectedId);
  const byId = new Map(members.map((member) => [member.id, member]));
  return {
    count: matches.length,
    options: (pinned ? [selected, ...matches] : matches).map((member) => {
      const partner = byId.get(member.partnerId);
      return { ...member, unavailable: Boolean(partner && partner.id !== currentId), partnerNick: partner?.nick, pinned: Boolean(pinned && member.id === selectedId) };
    })
  };
}

function renderPartnerOptions(selectedId) {
  const form = $("[data-member-form]");
  const selected = selectedId ?? form.partnerId.value;
  const query = $("[data-partner-search]").value;
  const result = partnerSearchChoices(sortedMembers(), form.elements.namedItem("id").value, selected, query);
  form.partnerId.innerHTML = '<option value="">Sin pareja</option>' + result.options.map((member) => {
    const suffix = member.unavailable ? ` (con ${member.partnerNick})` : member.pinned ? " (seleccionada)" : "";
    return `<option value="${escapeHtml(member.id)}" ${member.unavailable ? "disabled" : ""}>${escapeHtml(member.nick + suffix)}</option>`;
  }).join("");
  form.partnerId.value = selected;
  $("[data-partner-search-status]").textContent = !result.count ? "Sin coincidencias."
    : query.trim() ? `${result.count} coincidencia${result.count === 1 ? "" : "s"}` : "";
}

function renderMembersTable() {
  const tbody = $("[data-members-table]");
  const extra=typeof adminCircleId==='string'&&adminCircleId!=='main';
  if(extra||adminState.cloud)$("[data-new-member]").hidden=true;
  const all = sortedMembers();
  const joinedFrom = $("[data-member-joined-from]").value;
  const joinedTo = $("[data-member-joined-to]").value;
  const members = sortAdminMembers(filterAdminMembers(all, $("[data-admin-member-search]").value, { joinedFrom, joinedTo }), $("[data-member-sort]").value);
  const today = limaToday();
  $("[data-admin-member-count]").textContent = joinedFrom && joinedTo && joinedFrom > joinedTo
    ? "El rango de fechas no es valido." : `${members.length} de ${all.length} integrantes`;
  tbody.innerHTML = members.map((member) => `
    <tr data-id="${escapeHtml(member.id)}">
      <td><button class="member-profile-link" type="button" data-member-profile="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</button></td>
      <td><span class="table-license">${licenseBadge(member)} Nv ${escapeHtml(member.level)}</span></td>
      <td>${memberJoinedMarkup(member, today)}</td>
      <td>${escapeHtml(member.rank || "-")}</td>
      <td>${escapeHtml(member.title || member.rank || "Miembro")}</td>
      <td>${escapeHtml(adminState.draft.members.find((item) => item.id === member.partnerId)?.nick || "-")}</td>
      <td>${member.featured ? "Si" : "No"}</td>
      <td><input type="checkbox" data-mist-toggle ${member.goldEffect ? "checked" : ""} aria-label="Activar niebla de ${escapeHtml(member.nick)}" /></td>
      <td><input type="color" data-fog-color value="${memberFogColor(member)}" aria-label="Color de la niebla de ${escapeHtml(member.nick)}" title="Color de la niebla"></td>
      <td>
        ${member.featured ? `
          <button class="mini-button" type="button" data-move="up" title="Subir">↑</button>
          <button class="mini-button" type="button" data-move="down" title="Bajar">↓</button>
        ` : "-"}
      </td>
      <td>
        <button class="mini-button" type="button" data-member-profile="${escapeHtml(member.id)}">Ficha</button>
        <button class="mini-button" type="button" data-edit>Editar</button>
        <button class="mini-button danger" type="button" data-delete${extra||adminState.cloud ? " hidden" : ""}>Eliminar</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="11" class="muted">Sin coincidencias.</td></tr>';
}

function renderSync(fill = true) {
  const sync = adminState.sync || {};
  const formatTime = (value) => new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
  $("[data-sync-status]").textContent = `${sync.lastStatus || "Sin sincronizar."} ${sync.lastSyncAt ? `Ultima correcta: ${formatTime(sync.lastSyncAt)}` : ""}`;
  $("[data-sync-schedule]").textContent = adminState.cloud ? 'Sincronizacion en la nube. Continúa con tu PC apagada; se conserva la ultima lectura correcta si R2Beat no responde.' : sync.enabled === false ? "Consulta automatica pausada."
    : `Copia del borrador local: cada ${sync.intervalMinutes || 15} min con este servidor abierto. Proxima: ${sync.nextSyncAt && Date.parse(sync.nextSyncAt) > Date.now() ? formatTime(sync.nextSyncAt) : "en breve"}.`;
  if (fill) {
    $("[data-sync-enabled]").checked = sync.enabled !== false;
    $("[data-sync-interval]").value = String(sync.intervalMinutes || 15);
  }
}

function scheduleRosterRefresh() {
  clearTimeout(rosterPollTimer);
  if (adminState && !$("[data-dashboard]").hidden) rosterPollTimer = setTimeout(refreshAdminRoster, 60000);
}

async function refreshAdminRoster() {
  if (!adminState || rosterRefreshInProgress) return;
  rosterRefreshInProgress = true;
  const revision = rosterRevision;
  try {
    if (document.hidden || $("[data-dashboard]").hidden) return;
    const result = await api("/api/admin/roster");
    if (!adminState || $("[data-dashboard]").hidden || revision !== rosterRevision) return;
    adminState.sync = result.sync;
    renderSync(false);
    if ($("[data-member-editor]").hidden && !$("[data-members-table]").querySelector("input:focus, button:focus")) {
      adminState.draft.members = result.members;
      renderMembersTable();
    }
    if (typeof renderAdminHome === "function") renderAdminHome();
    if (typeof refreshDonationRoster === "function") await refreshDonationRoster();
  } catch (error) {
    if (adminState) $("[data-sync-status]").textContent = `No se pudo refrescar el panel: ${error.message}`;
  } finally {
    rosterRefreshInProgress = false;
    scheduleRosterRefresh();
  }
}

async function loadAdminState() {
  rosterRevision += 1;
  adminState = await api("/api/admin/state");
  fillSettings();
  renderMembersTable();
  renderSync();
  renderGithub(adminState.github, true);
  const conflict=$('[data-cloud-workspace-conflict]');if(conflict){conflict.hidden=!adminState.workspaceConflict;conflict.querySelector('[data-cloud-discard-draft]').hidden=!adminState.workspaceConflict;}
  if (typeof renderAdminHome === "function") renderAdminHome();
  scheduleRosterRefresh();
}

function renderGithub(github, fill = false) {
  if (!github) return;
  const form = $("[data-github-form]");
  if(github.phase==='cloud'){
    form.hidden=true;$("[data-github-badge]").textContent='En la nube';$("[data-github-status]").textContent=github.message;clearTimeout(githubPollTimer);return;
  }
  if (fill) {
    for (const name of ["owner", "repo", "branch"]) form.elements[name].value = github[name];
  }
  const busy = github.connecting || github.publishing;
  form.querySelectorAll("input, button").forEach((node) => { node.disabled = busy; });
  $("[data-github-disable]").hidden = !github.enabled && !github.connecting;
  $("[data-github-badge]").textContent = github.connecting ? "Autorizando" : github.publishing ? "Subiendo" : github.enabled ? "Automatica activa" : "Sin conectar";
  $("[data-github-badge]").classList.toggle("connected", Boolean(github.enabled));
  $("[data-github-status]").textContent = github.message;
  $("[data-github-status]").classList.toggle("success", Boolean(github.enabled) && github.phase !== "error");
  const link = $("[data-github-repository]");
  link.hidden = !github.repositoryUrl;
  link.href = github.repositoryUrl || "#";
  clearTimeout(githubPollTimer);
  if (github.connecting || github.publishing) {
    githubPollTimer = setTimeout(async () => {
      try { renderGithub(await api("/api/admin/github")); }
      catch (error) { $("[data-github-status]").textContent = error.message; }
    }, 2000);
  }
}

function openMemberEditor(member = null) {
  const box = $("[data-member-editor]");
  const form = $("[data-member-form]");
  form.dataset.workspaceVersion=String(adminState.workspaceVersion||'');
  form.reset();
  form.elements.namedItem("id").value = member?.id || "";
  form.nick.value = member?.nick || "";
  const extra=(typeof adminCircleId==='string'&&adminCircleId!=='main')||adminState.cloud;
  for(const name of ['nick','level','rank'])form.elements.namedItem(name).readOnly=extra;
  form.license.disabled=extra;
  form.level.value = member?.level || 1;
  form.rank.value = member?.rank || "";
  form.elements.namedItem("title").value = member?.title || "";
  form.elements.namedItem("title").placeholder = member?.rank || "Miembro";
  form.license.value = member?.license || "luna";
  form.featured.checked = Boolean(member?.featured);
  form.goldEffect.checked = Boolean(member?.goldEffect);
  form.fogColor.value = memberFogColor(member || {});
  $("[data-partner-search]").value = "";
  renderPartnerOptions(member?.partnerId || "");
  form.pairColor.value = member?.pairColor || "#ef8fb5";
  $("[data-member-status]").textContent = "";
  box.hidden = false;
  form.nick.focus();
}

function closeMemberEditor() {
  $("[data-member-editor]").hidden = true;
}

function memberPayload(form) {
  return {
    nick: form.nick.value,
    level: Number(form.level.value),
    rank: form.rank.value,
    title: form.elements.namedItem("title").value,
    license: form.license.value,
    featured: form.featured.checked,
    goldEffect: form.goldEffect.checked,
    fogColor: form.fogColor.value,
    partnerId: form.partnerId.value,
    pairColor: form.pairColor.value
  };
}

async function saveFeaturedOrder() {
  const ids = sortedMembers().filter((member) => member.featured).map((member) => member.id);
  await api("/api/admin/featured-order", { method: "POST", body: JSON.stringify({ ids }) });
  await loadAdminState();
}

function moveFeatured(id, direction) {
  const featured = sortedMembers().filter((member) => member.featured);
  const index = featured.findIndex((member) => member.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= featured.length) return;
  [featured[index], featured[next]] = [featured[next], featured[index]];
  featured.forEach((member, order) => {
    const original = adminState.draft.members.find((item) => item.id === member.id);
    original.featuredOrder = order;
  });
  saveFeaturedOrder();
}

function renderPreview() {
  const source = adminState.draft;
  const form = $("[data-settings-form]");
  const settings = { ...source.settings, ...Object.fromEntries(new FormData(form).entries()) };
  settings.eliteEnabled = form.eliteEnabled.checked;
  settings.membersEnabled = form.membersEnabled.checked;
  const featured = settings.eliteEnabled ? sortedMembers().filter((member) => member.featured) : [];
  const normal = settings.membersEnabled
    ? sortedMembers().filter((member) => !settings.eliteEnabled || !member.featured) : [];
  const content = $("[data-preview-content]");
  content.innerHTML = `
    <p class="section-kicker">VISTA PREVIA</p>
    <h2>MAZINO</h2>
    <p class="muted">${escapeHtml(settings.heroPhrase)}</p>
    ${settings.eliteEnabled ? `<h3>${escapeHtml(settings.eliteTitle)}</h3>
    <div class="elite-strip preview-strip">
      ${featured.map((member) => `
        <article class="elite-card ${member.goldEffect ? "gold-active" : ""}" style="--mist-color: ${memberFogColor(member)}">
          ${perimeterMist(member)}
          <div class="elite-avatar">${licenseBadge(member)}</div>
          <div><h3>${escapeHtml(member.nick)}</h3><p class="elite-level">Nv ${escapeHtml(member.level)}</p><p class="elite-title">${escapeHtml(member.title || "Sublider")}</p></div>
        </article>
      `).join("") || `<p class="empty-state">Sin destacados.</p>`}
    </div>` : ""}
    ${settings.membersEnabled ? `<h3>${escapeHtml(settings.membersTitle)}</h3>
    <div class="member-grid">
      ${renderMemberGroups(groupMemberPairs(normal))}
    </div>` : ""}
  `;
  $("[data-preview-dialog]").showModal();
  startPerimeterMist(content);
}

function wireAuth() {
  $("[data-setup-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("[data-auth-status]");
    try {
      await api("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify({
          username: event.target.username.value,
          password: event.target.password.value
        })
      });
      await loadAdminState();
      showDashboard();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("[data-auth-status]");
    try {
      if(typeof window.mazinoOwnerLogin==='function')await window.mazinoOwnerLogin({username:event.target.username.value,password:event.target.password.value});
      else await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: event.target.username.value,
          password: event.target.password.value
        })
      });
      await loadAdminState();
      showDashboard();
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function saveSettings() {
  const form = $("[data-settings-form]");
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.joinEnabled = form.joinEnabled.checked;
  payload.eliteEnabled = form.eliteEnabled.checked;
  payload.membersEnabled = form.membersEnabled.checked;
  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
}

function wireDashboard() {
  window.addEventListener('mazino-workspace-conflict',()=>{$('[data-cloud-workspace-conflict]').hidden=false;});
  $('[data-cloud-refresh]').addEventListener('click',async()=>{if(!confirm('Actualizar el panel? Los cambios que aun no guardaste en los formularios se perderan. Los borradores guardados se conservan.'))return;try{await loadAdminState();}catch(error){$('[data-save-status]').textContent=error.message;}});
  $('[data-cloud-discard-draft]').addEventListener('click',async()=>{if(!confirm('Usar la publicacion actual y descartar el borrador en conflicto? Se guardara una copia antes de reemplazarlo.'))return;try{await api('/api/admin/discard-draft',{method:'POST',body:JSON.stringify({confirmed:true})});await loadAdminState();}catch(error){$('[data-save-status]').textContent=error.message;}});
  $("[data-admin-member-search]").addEventListener("input", renderMembersTable);
  for (const selector of ["[data-member-joined-from]", "[data-member-joined-to]", "[data-member-sort]"]) {
    $(selector).addEventListener("change", renderMembersTable);
  }
  $("[data-partner-search]").addEventListener("input", () => renderPartnerOptions());
  $("[data-partner-search]").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });

  $("[data-sync-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api("/api/admin/sync-settings", { method: "PUT", body: JSON.stringify({ enabled: $("[data-sync-enabled]").checked, intervalMinutes: Number($("[data-sync-interval]").value) }) });
      adminState.sync = result.sync;
      renderSync();
      if (typeof refreshAdminPrizes === "function") await refreshAdminPrizes();
      $("[data-sync-settings-status]").textContent = "Preferencias guardadas.";
    } catch (error) {
      $("[data-sync-settings-status]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("[data-github-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("[data-github-connect]");
    button.disabled = true;
    try {
      renderGithub(await api("/api/admin/github/connect", {
        method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries()))
      }));
    } catch (error) {
      $("[data-github-status]").textContent = error.message;
      button.disabled = false;
    }
  });

  $("[data-github-disable]").addEventListener("click", async () => {
    try { renderGithub(await api("/api/admin/github/disable", { method: "POST", body: "{}" })); }
    catch (error) { $("[data-github-status]").textContent = error.message; }
  });

  $("[data-settings-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSettings();
      await loadAdminState();
      $("[data-save-status]").textContent = "Borrador guardado.";
    } catch (error) {
      $("[data-save-status]").textContent = error.message;
    }
  });

  $("[data-members-table]").addEventListener("change", async (event) => {
    if (!event.target.matches("[data-fog-color], [data-mist-toggle]")) return;
    const row = event.target.closest("tr[data-id]");
    const id = row.dataset.id;
    const member = adminState.draft.members.find((item) => item.id === id);
    const isColor = event.target.matches("[data-fog-color]");
    const change = isColor ? { fogColor: event.target.value } : { goldEffect: event.target.checked };
    rosterRevision += 1;
    row.querySelectorAll("input, button").forEach((node) => { node.disabled = true; });
    try {
      const result = await api(`/api/admin/members/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ ...member, ...change })
      });
      Object.assign(member, result.member);
      $("[data-save-status]").textContent = `Niebla de ${member.nick} guardada en borrador.`;
    } catch (error) {
      if (isColor) event.target.value = memberFogColor(member);
      else event.target.checked = Boolean(member.goldEffect);
      $("[data-save-status]").textContent = error.message;
    } finally {
      row.querySelectorAll("input, button").forEach((node) => { node.disabled = false; });
    }
  });

  $("[data-new-member]").addEventListener("click", () => openMemberEditor());
  $("[data-cancel-member]").addEventListener("click", closeMemberEditor);

  $("[data-member-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const id = form.elements.namedItem("id").value;
    const path = id ? `/api/admin/members/${encodeURIComponent(id)}` : "/api/admin/members";
    const method = id ? "PUT" : "POST";
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api(path, { method, body: JSON.stringify(memberPayload(form)) });
      await loadAdminState();
      closeMemberEditor();
      $("[data-save-status]").textContent = "Integrante y pareja guardados en borrador.";
    } catch (error) {
      $("[data-member-status]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("[data-members-table]").addEventListener("click", async (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    const member = adminState.draft.members.find((item) => item.id === id);
    if (event.target.matches("[data-edit]")) openMemberEditor(member);
    if (event.target.matches("[data-delete]")) {
      if (!confirm(`Eliminar a ${member.nick}?`)) return;
      await api(`/api/admin/members/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadAdminState();
    }
    if (event.target.dataset.move === "up") moveFeatured(id, -1);
    if (event.target.dataset.move === "down") moveFeatured(id, 1);
  });

  $("[data-sync]").addEventListener("click", async () => {
    const button = $("[data-sync]");
    button.disabled = true;
    $("[data-sync-status]").textContent = "Sincronizando...";
    try {
      await api("/api/admin/sync-r2beat", { method: "POST", body: "{}" });
      await loadAdminState();
      if (typeof refreshAdminPrizes === "function") await refreshAdminPrizes();
      if (typeof refreshRosterTracking === "function" && $("[data-rewards-subsection=\"roster-tracking\"]").open) await refreshRosterTracking();
    } catch (error) {
      $("[data-sync-status]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("[data-publish]").addEventListener("click", async () => {
    const button = $("[data-publish]");
    button.disabled = true;
    $("[data-save-status]").textContent = "Guardando y publicando...";
    try {
      await saveSettings();
      const result = await api("/api/admin/publish", { method: "POST", body: "{}" });
      await loadAdminState();
      $("[data-save-status]").textContent = result.message || result.github.message;
    } catch (error) {
      $("[data-save-status]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("[data-preview]").addEventListener("click", renderPreview);
  $("[data-close-preview]").addEventListener("click", () => $("[data-preview-dialog]").close());

  $("[data-logout]").addEventListener("click", async () => {
    clearTimeout(githubPollTimer);
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    showAuth("login");
  });

  $("[data-password-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const status = $("[data-password-status]");
    try {
      await api("/api/admin/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.currentPassword.value,
          nextPassword: form.nextPassword.value,
          ...(window.mazinoOwnerLogin?{code:form.elements.code.value}:{})
        })
      });
      form.reset();
      status.textContent = window.mazinoOwnerLogin?'Contrasena de nube actualizada. Vuelve a entrar con tu nueva clave y el segundo paso.':'Contrasena local actualizada.';
      if(window.mazinoOwnerLogin){window.mazinoOwnerClear?.();showAuth('login');}
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function boot() {
  wireAuth();
  wireDashboard();
  const status = await api("/api/admin/status");
  if (!status.configured) {
    if(window.mazinoOwnerLogin){showAuth('login');$("[data-auth-status]").textContent='El acceso remoto aun no esta preparado. Conserva tu panel local.';return;}
    showAuth("setup");
    return;
  }
  if (status.authenticated) {
    await loadAdminState();
    showDashboard();
  } else {
    showAuth("login");
  }
}

boot().catch(() => showAuth("login"));
