namespace ViTools;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        // 測試用：ViTools.exe --tts-test <輸出.wav|.mp3> 直接合成一段中英文並結束
        int t = Array.IndexOf(args, "--tts-test");
        if (t >= 0 && t + 1 < args.Length)
        {
            string zh = TtsService.GetVoices().FirstOrDefault(v => v.lang.StartsWith("zh-TW"))?.id ?? "";
            byte[] wav = TtsService.SynthesizeWavAsync(
                "這是視障輔助工具集的語音匯出測試。第二句話，確認分段合成後能正確接在一起。Hello, this is a test.",
                zh, 1.0).GetAwaiter().GetResult();
            if (args[t + 1].EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
                wav = TtsService.WavToMp3Async(wav).GetAwaiter().GetResult();
            File.WriteAllBytes(args[t + 1], wav);
            return;
        }

        ApplicationConfiguration.Initialize();

        string? webRoot = FindWebRoot(args);
        if (webRoot == null)
        {
            MessageBox.Show("找不到網頁工具資料夾（需含 braille-translate.htm）。\n可用參數指定：ViTools.exe --web <資料夾>",
                "視障輔助工具集", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        // --offline：不試線上網頁，直接用內附的
        Application.Run(new MainForm(webRoot, preferOnline: !args.Contains("--offline")));
    }

    // 搜尋順序：--web 參數 → 執行檔旁的 web\ → 往上層找網頁資料夾（開發時，本專案放在 vi-tools 的 desktop\ 底下）
    static string? FindWebRoot(string[] args)
    {
        int i = Array.IndexOf(args, "--web");
        if (i >= 0 && i + 1 < args.Length && IsWebRoot(args[i + 1]))
            return Path.GetFullPath(args[i + 1]);

        string exeDir = AppContext.BaseDirectory;
        string bundled = Path.Combine(exeDir, "web");
        if (IsWebRoot(bundled)) return bundled;

        for (var dir = new DirectoryInfo(exeDir); dir != null; dir = dir.Parent)
            if (IsWebRoot(dir.FullName)) return dir.FullName;
        return null;
    }

    static bool IsWebRoot(string dir) => File.Exists(Path.Combine(dir, "braille-translate.htm"));
}
