(() => {
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const cellText = value => typeof value === "string" ? value.trim() : "";

  async function readCouponExcel(readWorkbook, buffer, checkArchive) {
    checkArchive(buffer);
    const sheets = await readWorkbook(buffer);
    const detail = sheets.find(sheet => normalize(sheet.sheet) === "cupones (uno por fila)");
    const candidates = (detail ? [detail] : sheets).map(({ data }) => {
      const headers = (data[0] || []).map(normalize);
      return { data, code: headers.indexOf("codigo"), id: headers.indexOf("id"), name: headers.indexOf("nombre") };
    }).filter(columns => columns.code >= 0 && columns.id >= 0);
    if (candidates.length !== 1) throw new Error("Usa una hoja con las columnas Código e ID en la primera fila. Si hay varias hojas de cupones, nombra la principal «Cupones (uno por fila)».");
    const { data, code: codeCol, id: idCol, name: nameCol } = candidates[0];
    const groups = new Map(), seen = new Map();
    let total = 0;
    for (let index = 1; index < data.length; index++) {
      const row = data[index], number = index + 1;
      const rawCode = row[codeCol], rawId = row[idCol];
      if ((rawCode == null || rawCode === "") && (rawId == null || rawId === "")) continue;
      const code = cellText(rawCode);
      const itemId = Number.isSafeInteger(rawId) ? String(rawId) : cellText(rawId);
      if (!/^\d{1,16}$/.test(itemId) || code.length < 3 || code.length > 256 || /[\x00-\x1f]/.test(code)) {
        throw new Error(`Fila ${number}: revisa el ID y guarda el código como texto.`);
      }
      if (++total > 1000) throw new Error("El Excel admite hasta 1 000 filas de cupones.");
      if (!groups.has(itemId)) groups.set(itemId, { itemId, name: "", codes: [], repeated: 0 });
      if (groups.size > 100) throw new Error("El Excel admite hasta 100 IDs de premio.");
      const group = groups.get(itemId);
      if (nameCol >= 0 && !group.name) group.name = cellText(row[nameCol]).slice(0, 100);
      if (seen.has(code)) {
        if (seen.get(code) !== itemId) throw new Error(`Fila ${number}: un mismo código aparece con dos IDs de premio. Corrige el Excel y vuelve a revisarlo.`);
        group.repeated++;
        continue;
      }
      seen.set(code, itemId);
      group.codes.push(code);
    }
    if (!groups.size) throw new Error("El Excel no contiene cupones.");
    return [...groups.values()];
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { readCouponExcel };
    return;
  }

  const root = document.querySelector("[data-coupon-excel]");
  if (!root) return;
  const readerUrl = new URL("read-excel-file-9.3.12.min.js", document.currentScript.src);
  function loadReader() {
    if (window.readXlsxFile) return Promise.resolve(window.readXlsxFile);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = readerUrl;
      script.onload = () => typeof window.readXlsxFile === "function" ? resolve(window.readXlsxFile) : reject(new Error("No se pudo iniciar el lector de Excel."));
      script.onerror = () => { script.remove(); reject(new Error("No se pudo descargar el lector de Excel. Vuelve a intentarlo.")); };
      document.head.append(script);
    });
  }
  const find = suffix => root.querySelector(`[data-coupon-excel-${suffix}]`);
  const form = find("form"), file = form.elements.file, status = find("status");
  const review = find("review"), rows = find("rows"), recheck = find("recheck"), confirm = find("confirm");
  let groups, result, revision = 0;
  const destinations = new Map();
  const central = adminCircleId === "main";
  const request = (action, body) => api(`/api/admin/rewards/restock-${action}`, { method: "POST", body: JSON.stringify(body) });
  const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  const classification = row => [({ hombre: "Hombre", mujer: "Mujer", unisex: "Unisex" })[row.audience] || "Sin grupo", row.category || "Sin categoría"].join(" · ");

  function clear() {
    revision++;
    groups = result = undefined;
    destinations.clear();
    rows.replaceChildren();
    review.hidden = recheck.hidden = confirm.hidden = true;
    status.textContent = "";
  }

  function render(data) {
    rows.replaceChildren();
    const list = element("ul", "");
    list.className = "settings-grid";
    for (const group of groups) {
      const row = data.groups.find(item => item.itemId === group.itemId);
      const line = element("li", "");
      line.className = "admin-subsection wide";
      line.append(element("strong", `${row.label || group.name || "Premio"} · ID ${group.itemId}`));
      const destination = row.batchId ? `${row.batchName} · ${classification(row)}` :
        row.pending ? `${row.pending} sin lote de destino` : "Todos los códigos ya están registrados";
      line.append(element("div", destination));
      line.append(element("div", `${row.added || 0} para agregar · ${row.registered + group.repeated} duplicados`));
      if (row.pending) {
        const label = element("label", "Lote de destino");
        const select = document.createElement("select");
        select.append(new Option("Elige un lote existente", ""));
        for (const lot of data.choices) select.append(new Option(`${lot.label} · ${lot.batchName} · ${classification(lot)}`, lot.batchId));
        select.value = destinations.get(group.itemId) || "";
        select.addEventListener("change", () => {
          if (select.value) destinations.set(group.itemId, select.value);
          else destinations.delete(group.itemId);
          updateDestinations(data);
        });
        label.append(select);
        line.append(label);
      }
      list.append(line);
    }
    rows.append(list);
    review.hidden = false;
    recheck.hidden = !!data.fingerprint;
    confirm.hidden = !data.fingerprint || !data.added;
    confirm.textContent = `Confirmar carga de ${data.added} cupones`;
    updateDestinations(data);
    const repeated = groups.reduce((sum, group) => sum + group.repeated, 0);
    status.textContent = `${data.added} listos para agregar · ${data.registered + repeated} duplicados que se omiten.`;
    if (!data.fingerprint) status.textContent += " Elige el lote de cada ID pendiente y vuelve a revisar. Si el premio es nuevo, crea su lote desde la carga manual con un cupón nuevo y clasifícalo en Inventario.";
  }

  function updateDestinations(data) {
    const pending = data.groups.filter(row => row.pending);
    const picks = pending.map(row => destinations.get(row.itemId));
    recheck.disabled = picks.some(value => !value) || new Set(picks).size !== picks.length;
    for (const select of rows.querySelectorAll("select")) {
      for (const option of select.options) option.disabled = !!option.value && option.value !== select.value && picks.includes(option.value);
    }
  }

  const payload = () => ({ groups: groups.map(({ itemId, codes }) => ({ itemId, codes, batchId: destinations.get(itemId) })) });
  async function run(action, prepare) {
    const version = ++revision;
    const controls = [...form.elements, recheck, confirm, ...rows.querySelectorAll("select")];
    controls.forEach(control => { control.disabled = true; });
    status.textContent = action === "preview" ? "Revisando el Excel y el historial…" : "Cargando cupones…";
    try {
      if (prepare) {
        const parsed = await prepare();
        if (version !== revision) return;
        groups = parsed;
      }
      const body = payload();
      if (action === "confirm") Object.assign(body, { confirmed: true, fingerprint: result.fingerprint });
      const data = await request(action, body);
      if (version !== revision) return;
      if (action === "preview") {
        result = data;
        render(data);
      } else {
        const omitted = data.registered + groups.reduce((sum, group) => sum + group.repeated, 0);
        clear();
        file.value = "";
        status.textContent = `${data.added} cupones cargados en Mazino · ${omitted} duplicados omitidos.`;
        void refreshAdminPrizes();
        if (typeof refreshOwnerOverview === "function") void refreshOwnerOverview();
      }
    } catch (error) {
      if (version === revision) {
        status.textContent = error.message;
        if (action === "confirm") {
          result = undefined;
          confirm.hidden = true;
          recheck.hidden = false;
        }
      }
    } finally {
      controls.forEach(control => { control.disabled = !central; });
      if (result && version === revision) updateDestinations(result);
    }
  }

  file.addEventListener("change", clear);
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!central || !file.files.length) return;
    const selected = file.files[0];
    clear();
    void run("preview", async () => {
      if (!/\.xlsx$/i.test(selected.name) || selected.size > 2 * 1024 * 1024) throw new Error("Elige un archivo .xlsx de hasta 2 MB.");
      return readCouponExcel(await loadReader(), await selected.arrayBuffer(), DonationsExcel.safeArchive);
    });
  });
  recheck.addEventListener("click", () => { if (groups) void run("preview"); });
  confirm.addEventListener("click", () => { if (result?.fingerprint && result.added) void run("confirm"); });
  window.addEventListener("mazino-owner-session-cleared", () => { clear(); file.value = ""; });
  if (!central) {
    for (const control of form.elements) control.disabled = true;
    status.textContent = "Selecciona Mazino arriba para cargar el Excel en el inventario central.";
  }
})();
