const fs = require("fs");
const path = require("path");

const app = path.join(__dirname, "..", "app");
const dist = path.join(__dirname, "..", "dist");

const clean = (s) => s.replace(/^\uFEFF/, "");
const css = clean(fs.readFileSync(path.join(app, "app.css"), "utf8"));
const order = ["pdfread.js", "classify.js", "import.js", "data/data.js", "bootstrap.js", "engine.js", "app.js", "pwa.js", "vk.js"];
const js = {};
for (const f of order) js[f] = clean(fs.readFileSync(path.join(app, f), "utf8"));

const html = clean(fs.readFileSync(path.join(app, "index.html"), "utf8"));

// файлы, которые нужны только для установки как приложение (иконка, офлайн, манифест)
const PWA_FILES = ["manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

function build({ name, withData }) {
  let out = html.replace(/<link rel="stylesheet" href="app\.css[^"]*">/, () => "<style>\n" + css + "\n</style>");
  for (const f of order) {
    const re = new RegExp('<script src="' + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"><\\/script>');
    let body = js[f];
    if (f === "data/data.js" && !withData) {
      const IMP = require(path.join(app, "import.js"));
      body = "window.FIN=" + JSON.stringify({
        meta: {
          categories: IMP.CATS, spend_cats: [], consumption: [], months_all: [],
          period: ["2020-01-01", "2020-01-01"], active: ["2020-01-01", "2020-01-01"],
          sources: [], tx_count: 0, balance: null, imported: false,
        },
        tx: [], years: {},
      }) + ";";
    }
    out = out.replace(re, () => "<script>\n" + body + "\n</script>");
  }
  const left = /<script src=|<link rel="stylesheet"/.test(out);
  const file = path.join(dist, name);
  fs.writeFileSync(file, out);
  console.log(name, (fs.statSync(file).size / 1024 / 1024).toFixed(2) + " МБ", left ? "!! остались внешние ссылки" : "всё встроено");
  return out;
}

// Папка для выкладывания на хостинг: index.html + манифест + service worker + иконки.
function site({ dir, out }) {
  const target = path.join(dist, dir);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "index.html"), out);
  for (const f of PWA_FILES) fs.copyFileSync(path.join(app, f), path.join(target, f));
  console.log("  →", dir + "/", (fs.readdirSync(target).length) + " файлов");
}

const personal = build({ name: "finansovyj-konsultant.html", withData: true });
const shared = build({ name: "finansovyj-konsultant-dlya-vseh.html", withData: false });

site({ dir: "site-personal", out: personal });
site({ dir: "site-dlya-vseh", out: shared });
console.log("готово");
