using System.Security.Cryptography;
using System.Text.Json;

namespace ViTools;

// 自動更新：依檔案清單（desktop/tools/make-manifest.mjs 產生）比對本機檔案，只下載不同的檔案
//   清單：{ version, minApp, commit, exeUrl, files: { "web/…": { sha256, size }, "desktop-assets/…", "ViTools.exe" } }
//   網頁與資源從 raw.githubusercontent.com 的 <commit> 取得；ViTools.exe 從 Release 的附件（exeUrl）取得
//   每個檔案先下載到暫存資料夾、核對 SHA-256 與大小，全部成功才覆蓋；中途失敗就保留原本的檔案
//   執行中的 ViTools.exe 不能覆蓋，但可以改名：改成 ViTools.exe.old，放入新檔，下次啟動時刪掉舊檔
//   VITOOLS_RAW_URL：測試用，改用別的檔案來源（後面接 <commit>/<repo 路徑>）
static class Updater
{
    public record Entry(string Sha256, long Size);
    public record Manifest(string Version, string MinApp, string Commit, string ExeUrl, Dictionary<string, Entry> Files);
    public record Result(int Changed, bool ExeReplaced);

    const string RawBase = "https://raw.githubusercontent.com/hurthuang/vi-tools/";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(5) };

    public static string AppDir => AppContext.BaseDirectory;
    static string ExePath => Environment.ProcessPath ?? Path.Combine(AppDir, "ViTools.exe");

    /// <summary>可攜版（執行檔旁有 web\，而且網頁就是用它）才自動更新；開發版用的是 repo 裡的網頁，不動。</summary>
    public static bool CanUpdate(string webRoot) =>
        Path.GetFullPath(webRoot).TrimEnd('\\').Equals(Path.Combine(AppDir, "web").TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);

    /// <summary>上次更新換下來的舊執行檔：啟動時刪掉（刪不掉就下次再試）。</summary>
    public static void CleanupOldExe()
    {
        try { File.Delete(ExePath + ".old"); } catch { }
        try { Directory.Delete(Path.Combine(AppDir, "update-tmp"), true); } catch { }
    }

    public static async Task<Manifest> LoadManifestAsync(string url, string userAgent)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.UserAgent.ParseAdd(userAgent);
        using var res = await Http.SendAsync(req);
        res.EnsureSuccessStatusCode();
        var m = JsonSerializer.Deserialize<Manifest>(await res.Content.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (m == null || m.Files == null || string.IsNullOrEmpty(m.Commit)) throw new InvalidDataException("檔案清單格式不對");
        return m;
    }

    static string Sha256Of(string file)
    {
        using var s = File.OpenRead(file);
        return Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();
    }

    /// <summary>清單路徑 → 本機檔案（只接受 web/、desktop-assets/ 底下與 ViTools.exe，避免寫到程式資料夾以外）。</summary>
    static string? LocalPath(string path)
    {
        if (path == "ViTools.exe") return ExePath;
        if (!path.StartsWith("web/", StringComparison.Ordinal) && !path.StartsWith("desktop-assets/", StringComparison.Ordinal)) return null;
        string full = Path.GetFullPath(Path.Combine(AppDir, path.Replace('/', Path.DirectorySeparatorChar)));
        return full.StartsWith(AppDir, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    /// <summary>清單路徑 → 下載網址。</summary>
    static string SourceUrl(Manifest m, string path)
    {
        if (path == "ViTools.exe") return m.ExeUrl;
        string repoPath = path.StartsWith("web/", StringComparison.Ordinal) ? path["web/".Length..] : "desktop/" + path;
        string baseUrl = Environment.GetEnvironmentVariable("VITOOLS_RAW_URL") is { Length: > 0 } t ? t : RawBase;
        return baseUrl + m.Commit + "/" + string.Join('/', repoPath.Split('/').Select(Uri.EscapeDataString));
    }

    /// <summary>
    /// 下載並套用清單裡和本機不同的檔案。allowExe=false 時不動 ViTools.exe（只更新離線網頁與資源）。
    /// 失敗時丟出例外，本機檔案維持原狀。
    /// </summary>
    public static async Task<Result> ApplyAsync(Manifest m, bool allowExe, string userAgent)
    {
        var todo = new List<(string path, string local, Entry e)>();
        foreach (var (path, e) in m.Files)
        {
            if (path == "ViTools.exe" && (!allowExe || string.IsNullOrEmpty(m.ExeUrl))) continue;
            string? local = LocalPath(path);
            if (local == null) continue;
            bool same = File.Exists(local) && new FileInfo(local).Length == e.Size && Sha256Of(local) == e.Sha256;
            if (!same) todo.Add((path, local, e));
        }
        if (todo.Count == 0) return new Result(0, false);

        // 1. 全部下載到暫存資料夾並核對
        string tmp = Path.Combine(AppDir, "update-tmp");
        try { Directory.Delete(tmp, true); } catch { }
        Directory.CreateDirectory(tmp);
        var staged = new List<(string staged, string local, bool exe)>();
        try
        {
            int n = 0;
            foreach (var (path, local, e) in todo)
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, SourceUrl(m, path));
                req.Headers.UserAgent.ParseAdd(userAgent);
                using var res = await Http.SendAsync(req);
                res.EnsureSuccessStatusCode();
                byte[] data = await res.Content.ReadAsByteArrayAsync();
                string hash = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
                if (data.Length != e.Size || hash != e.Sha256) throw new InvalidDataException($"{path} 下載的內容和清單不符");
                string file = Path.Combine(tmp, (n++).ToString());
                await File.WriteAllBytesAsync(file, data);
                staged.Add((file, local, path == "ViTools.exe"));
            }

            // 2. 覆蓋：網頁與資源直接取代；執行中的 ViTools.exe 先改名再放入新檔
            bool exe = false;
            foreach (var (file, local, isExe) in staged)
            {
                if (isExe)
                {
                    string old = local + ".old";
                    try { File.Delete(old); } catch { }
                    File.Move(local, old);
                    try { File.Move(file, local); }
                    catch { File.Move(old, local); throw; }
                    exe = true;
                }
                else
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(local)!);
                    File.Copy(file, local, true);
                }
            }
            return new Result(staged.Count, exe);
        }
        finally
        {
            try { Directory.Delete(tmp, true); } catch { }
        }
    }
}
