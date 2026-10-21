(function (root) {
  let pending;
  root.MazinoCaptureLoader = {
    load() {
      if (pending) return pending;
      pending = (async () => {
        const base = new URL("/equipo/ocr/", location.origin).href;
        const response = await fetch(base + "manifest.json", { cache: "no-store" });
        if (!response.ok) throw new Error("El lector aun no esta disponible. Actualiza el panel y reintenta.");
        const manifest = await response.json();
        if (!/^[a-f0-9]{16}$/.test(manifest.version)) throw new Error("Version del lector no valida.");
        const suffix = "?v=" + manifest.version;
        await Promise.all([
          new Promise((resolve, reject) => { const style = document.createElement("link"); style.rel = "stylesheet"; style.href = base + "capture-ui.css" + suffix; style.onload = resolve; style.onerror = () => { style.remove(); reject(new Error("No se pudo cargar el estilo del lector.")); }; document.head.append(style); }),
          root.MazinoCaptures ? Promise.resolve() : new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = base + "capture-ui.js" + suffix; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error("No se pudo cargar el lector.")); }; document.head.append(script); }),
        ]);
        if (!root.MazinoCaptures?.mount) throw new Error("Actualiza el panel para cargar el lector.");
        return { runtime: root.MazinoCaptures, assetBase: base };
      })().catch(error => { pending = null; throw error; });
      return pending;
    },
  };
})(globalThis);
