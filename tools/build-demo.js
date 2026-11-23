/* Сборка демо-версии: то же приложение, но с выдуманными операциями внутри.
   Нужна для скриншотов и витрины — реальные данные сюда не попадают.
   Запуск: node tools/build-demo.js → dist/demo.html */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = path.join(root, "app");
const clean = s => s.replace(/^\uFEFF/, "");

const order = ["pdfread.js", "classify.js", "import.js", "bootstrap.js", "engine.js", "app.js", "pwa.js", "vk.js"];
const parts = order.map(f => clean(fs.readFileSync(path.join(app, f), "utf8")));

// демо-данные кладём в localStorage до того, как стартует bootstrap.js
const demo = clean(fs.readFileSync(path.join(root, "build", "demo-data.js"), "utf8"));
const shim = `try { localStorage.setItem("fin.dataset.v1", JSON.stringify(window.__DEMO)); } catch (e) {}`;

let html = clean(fs.readFileSync(path.join(app, "index.html"), "utf8"));
const css = clean(fs.readFileSync(path.join(app, "app.css"), "utf8"));

html = html.replace(/<link[^>]*app\.css[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script src="data\/data\.js"><\/script>/, () => "");
for (const f of order) {
  html = html.replace(new RegExp(`<script src="${f.replace(".", "\\.")}"></script>`), () => "");
}
html = html.replace("</body>", () =>
  `<script>${demo}</script>\n<script>${shim}</script>\n` +
  parts.map(p => `<script>\n${p}\n</script>`).join("\n") + "\n</body>");

const out = path.join(root, "dist", "demo.html");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(out, html);
console.log("dist/demo.html", (fs.statSync(out).size / 1024 / 1024).toFixed(2), "МБ");
