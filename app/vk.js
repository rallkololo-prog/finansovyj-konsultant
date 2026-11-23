/* VK Mini App: подключаем VK Bridge, инициализируем приложение и учитываем
   особенности webview ВКонтакте. Если приложение открыли в обычном браузере —
   ничего не происходит: внешний скрипт не грузится, лишних запросов нет. */
(function () {
  "use strict";

  var q = new URLSearchParams(location.search);
  var inVK = q.has("vk_app_id") || q.has("vk_user_id") || q.has("vk_platform");

  /* Платформа запуска: понадобится, если появятся платные функции.
     Правила VK Mini Apps (п. 5.4.1): оплата цифровых ценностей разрешена только
     в vk.ru и m.vk.ru; в мобильных приложениях для iOS и Android кнопок оплаты быть не должно. */
  var platform = q.get("vk_platform") || "web";
  window.VKCTX = {
    inVK: inVK,
    platform: platform,
    isMobileApp: /iphone|ipad|android/i.test(platform),
    isIOS: /iphone|ipad/i.test(platform)
  };
  var inFrame = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // Внутри ВК и Telegram страница живёт в webview: сообщаем CSS, что мы во фрейме
  if (inFrame || inVK) document.documentElement.classList.add("embedded");

  // Локальные адреса и файл с диска ВК не откроет, но защищаемся от случайной загрузки
  if (!inVK || !/^https?:$/.test(location.protocol)) {
    // всё равно сообщим ВК, что мы живы, если он нас запустил без параметров
    if (!inFrame) return;
  }

  function loadBridge(done) {
    if (window.vkBridge) return done();
    var s = document.createElement("script");
    s.src = "https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js";
    s.async = true;
    s.onload = done;
    s.onerror = function () { /* без моста приложение продолжает работать */ };
    document.head.appendChild(s);
  }

  function applyTheme(cfg) {
    // ВК отдаёт цвета темы в webview: подстраиваем фон страницы под светлую/тёмную тему
    try {
      var scheme = (cfg && cfg.scheme) || "bright_light";
      var root = document.documentElement;
      root.dataset.vkScheme = scheme;
      if (scheme === "space_gray" || scheme === "vkcom_dark") {
        root.classList.add("vk-dark");
      } else {
        root.classList.remove("vk-dark");
      }
    } catch (e) { }
  }

  loadBridge(function () {
    if (!window.vkBridge) return;
    var vk = window.vkBridge;
    try {
      vk.send("VKWebAppInit", {}).catch(function () { });
      // тема ВК (светлая/тёмная) — чтобы фон не резал глаз
      vk.subscribe(function (e) {
        if (e && e.detail && e.detail.type === "VKWebAppUpdateConfig") applyTheme(e.detail.data);
        // возврат в приложение из другого окна — перерисовываем, если данные появились
        if (e && e.detail && e.detail.type === "VKWebAppViewRestore") {
          try { if (window.render) window.render(true); } catch (err) { }
        }
      });
      // сообщаем ВК, что можно показать кнопку «назад» в шапке
      vk.send("VKWebAppSetViewSettings", {
        status_bar_style: "dark",
        action_bar_color: "#f3f1ec",
        navigation_bar_color: "#f3f1ec"
      }).catch(function () { });
    } catch (e) { }
  });

  // Аппаратная кнопка «назад» в Android-webview: сначала закрываем шторку/модалку,
  // а не выходим из приложения. Работает и в обычном браузере на телефоне.
  window.addEventListener("popstate", function () {
    try { if (window.__vkBack) window.__vkBack(); } catch (e) { }
  });
})();
