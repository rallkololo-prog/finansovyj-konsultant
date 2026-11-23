/* PWA: регистрация service worker, автообновление и мелкая адаптация под Telegram/VK.
   Всё внутри гардов — при открытии файла с диска (file://) ничего не происходит. */
(function () {
  "use strict";

  var isHttp = location.protocol === "http:" || location.protocol === "https:";
  var reg = null;
  var reloading = false;

  // Плашка «вышла новая версия» — не перезагружаем сами, человек может быть посреди расчётов
  function showUpdate(worker) {
    if (document.getElementById("updToast")) return;
    var t = document.createElement("div");
    t.id = "updToast";
    t.className = "toast";
    t.innerHTML = '<span>Вышла новая версия приложения</span>';
    var go = document.createElement("button");
    go.textContent = "Обновить";
    go.addEventListener("click", function () {
      t.remove();
      try { worker.postMessage({ type: "SKIP_WAITING" }); } catch (e) { location.reload(); }
    });
    var later = document.createElement("button");
    later.className = "ghost2";
    later.textContent = "Позже";
    later.addEventListener("click", function () { t.remove(); });
    t.appendChild(go);
    t.appendChild(later);
    document.body.appendChild(t);
  }

  if (isHttp && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).then(function (r) {
        reg = r;
        // уже ждёт активации — значит, пока страница была открыта, скачалась новая версия
        if (r.waiting && navigator.serviceWorker.controller) showUpdate(r.waiting);
        r.addEventListener("updatefound", function () {
          var w = r.installing;
          if (!w) return;
          w.addEventListener("statechange", function () {
            if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w);
          });
        });
      }).catch(function () { });

      // проверяем обновления не чаще раза в 30 минут и при возврате на вкладку
      var last = 0;
      function check() {
        if (!reg || Date.now() - last < 30 * 60 * 1000) return;
        last = Date.now();
        reg.update().catch(function () { });
      }
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 30 * 60 * 1000);
    });
  }

  // Внутри мини-приложения VK страница живёт в webview: убираем адресную строку из расчёта высоты
  var inFrame = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (inFrame) {
    document.documentElement.classList.add("embedded");
    if (location.hash && location.hash.length > 1) { try { history.replaceState(null, "", location.pathname); } catch (e) { } }
  }

  // Кнопка «Установить»: появляется, когда браузер готов поставить приложение
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    if (document.getElementById("installBtn")) return;
    var b = document.createElement("button");
    b.id = "installBtn";
    b.className = "install-btn";
    b.textContent = "Установить на телефон";
    b.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { b.remove(); deferred = null; });
    });
    document.body.appendChild(b);
  });
  window.addEventListener("appinstalled", function () {
    var b = document.getElementById("installBtn");
    if (b) b.remove();
  });

  // Telegram Mini App: если открыли из бота — сообщаем, что готовы, и разворачиваем на весь экран
  if (isHttp && window.Telegram && window.Telegram.WebApp) {
    try {
      var tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      document.documentElement.classList.add("embedded");
    } catch (e) { }
  }
})();
