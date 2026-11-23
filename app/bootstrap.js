/* bootstrap.js — загружается первым из наших скриптов (после парсеров),
   решает две задачи:
   1) если localStorage недоступен (приватный режим, некоторые webview) — подменяет его
      на память, чтобы приложение работало, а не падало;
   2) подставляет ранее загруженную выписку вместо демонстрационной. */
(function () {
  // 1. безопасное хранилище
  try {
    localStorage.setItem("__fin_test", "1");
    localStorage.removeItem("__fin_test");
  } catch (e) {
    var mem = {};
    window.__LS_MEMORY = true;
    try {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); },
          removeItem: function (k) { delete mem[k]; },
          clear: function () { mem = {}; },
          key: function (i) { return Object.keys(mem)[i] || null; },
          get length() { return Object.keys(mem).length; }
        }
      });
    } catch (e2) { }
  }

  // 2. сохранённая выписка вместо демо-данных
  try {
    var raw = localStorage.getItem("fin.dataset.v1");
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d && d.tx && d.tx.length && d.meta && d.meta.categories) {
      window.FIN = d;
      window.FIN_IMPORTED = true;
    }
  } catch (e) { console.warn("не удалось прочитать сохранённую выписку", e); }
})();
