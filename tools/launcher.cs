using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Windows.Forms;

class Launcher {
  [STAThread]
  static void Main() {
    string file = null;
    try {
      var asm = Assembly.GetExecutingAssembly();
      string name = null;
      foreach (var n in asm.GetManifestResourceNames()) if (n.EndsWith("app.html")) { name = n; break; }
      if (name == null) throw new Exception("внутри файла нет страницы");

      byte[] data;
      using (var s = asm.GetManifestResourceStream(name))
      using (var ms = new MemoryStream()) { s.CopyTo(ms); data = ms.ToArray(); }

      string hash;
      using (var sha = SHA1.Create()) hash = BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").Substring(0, 10).ToLowerInvariant();
      string fname = "konsultant-" + hash + ".html";

      // 1) рядом с самим файлом (портативно), 2) во временной папке
      foreach (var dir in new string[] {
          Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),
          Path.Combine(Path.GetTempPath(), "fin-konsultant") }) {
        try {
          Directory.CreateDirectory(dir);
          string candidate = Path.Combine(dir, fname);
          if (!File.Exists(candidate) || new FileInfo(candidate).Length != data.Length) File.WriteAllBytes(candidate, data);
          if (new FileInfo(candidate).Length == data.Length) { file = candidate; break; }
        } catch { }
      }
      if (file == null) throw new Exception("не удалось распаковать страницу ни рядом с программой, ни во временную папку");

      try { Process.Start(new ProcessStartInfo { FileName = file, UseShellExecute = true }); }
      catch { Process.Start("explorer.exe", "\"" + file + "\""); }
    } catch (Exception e) {
      MessageBox.Show(
        "Не удалось открыть приложение.\n\n" + e.Message +
        "\n\nЧто можно попробовать: откройте этот файл правой кнопкой -> Свойства -> поставьте галочку «Разблокировать», " +
        "затем запустите снова. Либо используйте версию .html — она открывается без предупреждений.\n\n" +
        "Нажмите Ctrl+C, чтобы скопировать это сообщение в буфер обмена.",
        "Финансовый консультант", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
  }
}
