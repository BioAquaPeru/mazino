(function (root) {
  const headers = ["ID", "Integrante", "Fecha", "Total anterior", "Nuevo total"];
  const dateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim();
  function safeArchive(buffer) {
    if (buffer.byteLength > 2 * 1024 * 1024) throw new Error("El Excel supera el limite de 2 MB.");
    const v = new DataView(buffer); let end = -1;
    for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("El archivo no es un Excel .xlsx valido.");
    const count = v.getUint16(end + 10, true); let pos = v.getUint32(end + 16, true), size = 0;
    if (count > 2000 || count === 65535) throw new Error("El Excel tiene demasiados archivos internos.");
    for (let i = 0; i < count; i++) {
      if (pos + 46 > v.byteLength || v.getUint32(pos, true) !== 0x02014b50) throw new Error("El Excel esta danado.");
      size += v.getUint32(pos + 24, true);
      if (size > 20 * 1024 * 1024) throw new Error("El contenido del Excel es demasiado grande.");
      pos += 46 + v.getUint16(pos + 28, true) + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
    }
  }
  async function template(ExcelJS, members, date) {
    const book = new ExcelJS.Workbook(); book.creator = "MAZINO";
    const sheet = book.addWorksheet("Totales", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = headers.map((header, i) => ({ header, width: [30, 26, 16, 22, 22][i] }));
    sheet.getColumn(1).hidden = true;
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => { cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF211D24" } }; cell.alignment = { vertical: "middle" }; });
    for (const member of members.filter(m => m.active)) {
      const row = sheet.addRow([member.id, member.nick, date, member.lastTotal, null]); row.height = 24;
      row.eachCell({ includeEmpty: true }, cell => { cell.font = { name: "Calibri", size: 11 }; cell.alignment = { vertical: "middle" }; });
      for (const col of [4, 5]) row.getCell(col).numFmt = '#,##0;[Red](#,##0);"0"';
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1B8" } };
      row.getCell(5).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [0, 1000000000000], showErrorMessage: true, errorTitle: "Total invalido", error: "Escribe el total acumulado del juego como numero entero." };
    }
    sheet.autoFilter = { from: "B1", to: `E${Math.max(1, sheet.rowCount)}` };
    sheet.getCell("D1").note = "Referencia de la ultima lectura guardada. No es una donacion nueva.";
    sheet.getCell("E1").note = "Llena solo esta columna con el total acumulado que ves en el juego. Vacio = sin registrar; 0 = total cero. Conserva los integrantes y la fecha.";
    sheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" };
    return book.xlsx.writeBuffer();
  }
  async function parse(ExcelJS, buffer, date) {
    safeArchive(buffer);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
    const sheet = book.getWorksheet("Totales");
    if (!sheet || headers.some((name, i) => sheet.getCell(1, i + 1).value !== name)) throw new Error("Usa la plantilla de Donaciones sin cambiar sus encabezados.");
    if (sheet.rowCount > 201) throw new Error("La plantilla admite hasta 200 integrantes.");
    const rows = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const value = sheet.getCell(i, 5).value;
      if (value === null || value === undefined || value === "") continue;
      const memberId = sheet.getCell(i, 1).value, nick = sheet.getCell(i, 2).value;
      if (typeof memberId !== "string" || typeof nick !== "string" || dateText(sheet.getCell(i, 3).value) !== date) throw new Error(`Fila ${i}: integrante o fecha distintos de la plantilla seleccionada.`);
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000000000000) throw new Error(`Fila ${i}: escribe un numero entero en Nuevo total, sin formulas ni abreviaturas como 50k.`);
      rows.push({ memberId, nick, total: value });
    }
    if (!rows.length) throw new Error("No hay nuevos totales. Llena la columna Nuevo total y vuelve a subir el archivo.");
    return rows;
  }
  const api = { template, parse, safeArchive };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DonationsExcel = api;
})(typeof window === "undefined" ? globalThis : window);
