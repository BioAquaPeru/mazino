(() => {
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const cellText = value => typeof value === "string" ? value.trim() : "";

  async function readCouponExcel(readWorkbook, buffer, checkArchive) {
    checkArchive(buffer);
    const sheets = await readWorkbook(buffer);
    const consolidated = sheets.filter(({ sheet }) => ["cupones (uno por fila)", "todos (lista)"].includes(normalize(sheet)));
    const candidates = (consolidated.length ? consolidated : sheets).map(({ sheet, data }) => {
      const headers = (data[0] || []).map(normalize);
      return { sheet, data, code: headers.indexOf("codigo"), id: headers.indexOf("id"), name: headers.indexOf("nombre") };
    }).filter(columns => columns.code >= 0 && columns.id >= 0);
    if (!candidates.length) throw new Error("El Excel debe tener una hoja con las columnas Código e ID en la primera fila.");
    const groups = new Map(), seen = new Map();
    let total = 0;
    for (const { sheet, data, code: codeCol, id: idCol, name: nameCol } of candidates) {
      for (let index = 1; index < data.length; index++) {
        const row = data[index], number = index + 1;
        const rawCode = row[codeCol], rawId = row[idCol];
        if ((rawCode == null || rawCode === "") && (rawId == null || rawId === "")) continue;
        const code = cellText(rawCode);
        const itemId = Number.isSafeInteger(rawId) ? String(rawId) : cellText(rawId);
        if (!/^\d{1,16}$/.test(itemId) || code.length < 3 || code.length > 256 || /[\x00-\x1f]/.test(code)) {
          throw new Error(`En «${sheet}», fila ${number}, revisa el ID y guarda el código como texto.`);
        }
        if (++total > 1000) throw new Error("El Excel admite hasta 1 000 filas de cupones.");
        if (!groups.has(itemId)) groups.set(itemId, { itemId, name: "", codes: [], repeated: 0 });
        if (groups.size > 100) throw new Error("El Excel admite hasta 100 IDs de premio.");
        const group = groups.get(itemId);
        if (nameCol >= 0 && !group.name) group.name = cellText(row[nameCol]).slice(0, 100);
        if (seen.has(code)) {
          if (seen.get(code) !== itemId) throw new Error(`En «${sheet}», fila ${number}, un código tiene dos IDs de premio. Corrige el Excel y vuelve a revisarlo.`);
          group.repeated++;
          continue;
        }
        seen.set(code, itemId);
        group.codes.push(code);
      }
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
  const review = find("review"), rows = find("rows"), recheck = find("recheck"), confirm = find("confirm"), mark = find("mark");
  let groups, result, revision = 0;
  const destinations = new Map();
  const selectedCodes = new Set();
  const central = adminCircleId === "main";
  const request = (action, body) => api(`/api/admin/rewards/restock-${action}`, { method: "POST", body: JSON.stringify(body) });
  const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  const classification = row => [({ hombre: "Hombre", mujer: "Mujer", unisex: "Unisex" })[row.audience] || "Sin grupo", row.category || "Sin categoría"].join(" · ");
  function omissions(row, repeated) {
    const external = row.externallyRedeemed || 0;
    const duplicates = row.registered - external + repeated;
    return `${duplicates} duplicados${external ? ` · ${external} canjeados fuera de la web` : ""}`;
  }

  function clear() {
    revision++;
    groups = result = undefined;
    destinations.clear();
    selectedCodes.clear();
    rows.replaceChildren();
    review.hidden = recheck.hidden = confirm.hidden = mark.hidden = true;
    status.textContent = "";
  }

  function render(data) {
    rows.replaceChildren();
    selectedCodes.clear();
    const list = element("ul", "");
    list.className = "settings-grid";
    for (const group of groups) {
      const row = data.groups.find(item => item.itemId === group.itemId);
      const line = element("li", "");
      line.className = "admin-subsection wide";
      line.append(element("strong", `${group.name || row.label || "Premio"} · ID ${group.itemId}`));
      const destination = row.batchId ? `Lote: ${row.batchName} · ${classification(row)}` :
        row.pending ? "Elige un lote para todos los códigos nuevos de este ID." : "Todos los códigos ya están registrados";
      line.append(element("div", destination));
      const quantity = row.pending ? `${row.pending} pendientes de destino` : `${row.added || 0} para agregar`;
      line.append(element("div", `${quantity} · ${omissions(row, group.repeated)}`));
      if (row.selectable?.length) {
        const detail = document.createElement("details");
        detail.append(element("summary", `Marcar como canjeados fuera de la web (${row.selectable.length} revisables)`));
        for (const index of row.selectable) {
          const code = group.codes[index];
          const label = element("label", "");
          label.className = "switch-row";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          const value = element("code", code);
          value.style.overflowWrap = "anywhere";
          checkbox.addEventListener("change", () => {
            if (checkbox.checked && selectedCodes.size === 300) {
              checkbox.checked = false;
              status.textContent = "Puedes marcar hasta 300 códigos a la vez.";
              return;
            }
            if (checkbox.checked) selectedCodes.add(code);
            else selectedCodes.delete(code);
            updateSelection();
          });
          label.append(checkbox, value);
          detail.append(label);
        }
        line.append(detail);
      }
      if (row.pending) {
        const label = element("label", "Lote para todos los códigos nuevos de este ID");
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
    recheck.textContent = "Revisar destinos";
    confirm.hidden = !data.fingerprint || !data.added;
    mark.hidden = !data.groups.some(row => row.selectable?.length);
    confirm.textContent = `Confirmar carga de ${data.added} cupones`;
    updateSelection();
    updateDestinations(data);
    const repeated = groups.reduce((sum, group) => sum + group.repeated, 0);
    status.textContent = `${data.added} listos para agregar. Se omiten ${omissions(data, repeated)}.`;
    if (!data.fingerprint) status.textContent += " Elige el lote de cada ID pendiente y vuelve a revisar. Si el premio es nuevo, crea su lote desde la carga manual con un cupón nuevo y clasifícalo en Inventario.";
  }

  function updateSelection() {
    const count = selectedCodes.size;
    mark.disabled = !count;
    mark.textContent = count ? `Marcar ${count} como canjeados` : "Marcar seleccionados como canjeados";
    confirm.disabled = count > 0;
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
    const controls = [...form.elements, recheck, confirm, mark, ...rows.querySelectorAll("select, input")];
    controls.forEach(control => { control.disabled = true; });
    status.textContent = action === "preview" ? "Revisando el Excel y el historial…" :
      action === "mark-redeemed" ? "Registrando los canjes externos…" : "Cargando cupones…";
    let marked = 0;
    try {
      if (prepare) {
        const parsed = await prepare();
        if (version !== revision) return;
        groups = parsed;
      }
      const body = payload();
      if (action === "confirm") {
        Object.assign(body, { confirmed: true, fingerprint: result.fingerprint });
      } else {
        body.includeSelectable = true;
        if (action === "mark-redeemed") {
          const saved = await request(action, { codes: [...selectedCodes] });
          if (version !== revision) return;
          marked = saved.total;
        }
      }
      const data = await request(action === "confirm" ? action : "preview", body);
      if (version !== revision) return;
      if (action !== "confirm") {
        result = data;
        render(data);
        if (marked) status.textContent = `${marked} códigos marcados como canjeados. ${status.textContent}`;
      } else {
        const repeated = groups.reduce((sum, group) => sum + group.repeated, 0);
        clear();
        file.value = "";
        status.textContent = `${data.added} cupones cargados en Mazino. Se omitieron ${omissions(data, repeated)}.`;
        void refreshAdminPrizes();
        if (typeof refreshOwnerOverview === "function") void refreshOwnerOverview();
      }
    } catch (error) {
      if (version === revision) {
        status.textContent = marked ? `${marked} códigos marcados. Vuelve a revisar el Excel para actualizar la vista previa.` : error.message;
        if (!marked && /^Ruta no encontrada\.?$/i.test(error.message) && ["127.0.0.1", "localhost"].includes(window.location?.hostname)) {
          status.textContent = "Reinicia el servidor local con INICIAR-MAZINO.cmd o abre tu panel en mazino.lat. Luego vuelve a revisar el Excel.";
        }
        if (action !== "preview") {
          result = undefined;
          confirm.hidden = mark.hidden = true;
          rows.replaceChildren();
          recheck.textContent = "Volver a revisar Excel";
          recheck.hidden = false;
        }
      }
    } finally {
      controls.forEach(control => { control.disabled = !central; });
      if (result && version === revision) {
        updateDestinations(result);
        updateSelection();
      }
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
  confirm.addEventListener("click", () => { if (!selectedCodes.size && result?.fingerprint && result.added) void run("confirm"); });
  mark.addEventListener("click", () => {
    if (result && selectedCodes.size && window.confirm(`¿Marcar ${selectedCodes.size} códigos como canjeados? Se omitirán en futuras cargas.`)) {
      void run("mark-redeemed");
    }
  });
  window.addEventListener("mazino-owner-session-cleared", () => { clear(); file.value = ""; });
  if (!central) {
    for (const control of form.elements) control.disabled = true;
    status.textContent = "Selecciona Mazino arriba para cargar el Excel en el inventario central.";
  }
})();
