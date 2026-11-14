using System.IO.Compression;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;

namespace ViTools;

// 從桌面版安裝、整包更新 vi-tools 辨識套件（0.5.1 起）：
//   1. 下載：GitHub Release 最新版的試卷版（-exam-portable.zip，約 330 MB）或完整版（-portable.zip，約 560 MB），
//      一邊下載一邊算 sha256，和 GitHub API 附檔的 digest（"sha256:…"）、大小核對；或使用者選已經下載好的 zip
//   2. 檢查 zip：每個檔都在「vi-tools辨識套件/」底下、沒有 .. 或磁碟代號、有 runtime/python/python.exe 和 app/main.py
//   3. 解壓縮到「vi-tools辨識套件.new」，好了才換上：
//      新裝 → 改名成「vi-tools辨識套件」；
//      已經有（整包更新）→ 先關掉 app 開的辨識套件，舊的改名「vi-tools辨識套件.old」、新的換上，
//      舊的「輸出」資料夾（辨識結果）搬到新的裡面，最後刪掉 .old（刪不掉下次再刪）
//   裝在哪裡：已經有 → 原地換；沒有 → ViTools 資料夾（不能寫入時改放 %LOCALAPPDATA%\ViTools）
//   測試用：VITOOLS_RECOGNIZER_API（假的 Release JSON）、VITOOLS_RECOGNIZER_INSTALL_DIR（裝在哪裡）
static class RecognizerInstall
{
    public const string KitName = "vi-tools辨識套件";
    const string Api = "https://api.github.com/repos/hurthuang/vi-tools-recognizer/releases/latest";
    static readonly HttpClient Http = new() { Timeout = Timeout.InfiniteTimeSpan };   // 大檔：用 CancellationToken 控制
    static CancellationTokenSource? _cts;
    public static bool Busy => _cts != null;

    /// <summary>進度：stage = download／extract／replace；done、total 是位元組（extract 是檔案數）</summary>
    public record Progress(string Stage, long Done, long Total);

    public static void Cancel() => _cts?.Cancel();

    /// <summary>完整版（有樂譜辨識的 Audiveris）還是試卷版</summary>
    public static bool IsFull(string dir) => File.Exists(Path.Combine(dir, "runtime", "audiveris", "Audiveris.exe"));

    static string DefaultParent()
    {
        if (Environment.GetEnvironmentVariable("VITOOLS_RECOGNIZER_INSTALL_DIR") is { Length: > 0 } t) return t;
        string app = AppContext.BaseDirectory;
        try
        {
            string probe = Path.Combine(app, ".vitools-write-test");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            return app;
        }
        catch
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ViTools");
        }
    }

    static long FreeBytes(string dir)
    {
        try { return new DriveInfo(Path.GetPathRoot(Path.GetFullPath(dir))!).AvailableFreeSpace; }
        catch { return long.MaxValue; }
    }
    static string Mb(long b) => (b / 1_000_000).ToString("N0") + " MB";

    /// <summary>
    /// 安裝或整包更新。edition：exam｜full｜空字串（已經有就照原本的版本，沒有就試卷版）；zipFile：使用者選的 zip（null → 從 GitHub 下載）。
    /// 回傳裝好的資料夾。失敗丟例外，原本的辨識套件不變。
    /// </summary>
    public static async Task<string> RunAsync(string edition, string? zipFile, string userAgent, IProgress<Progress>? progress)
    {
        if (_cts != null) throw new InvalidOperationException("辨識套件正在下載或安裝中");
        _cts = new CancellationTokenSource();
        var ct = _cts.Token;
        string? old = Recognizer.Find();
        string parent = old != null ? Path.GetDirectoryName(old.TrimEnd('\\'))! : DefaultParent();
        bool full = edition == "full" || (edition == "" && old != null && IsFull(old));
        string part = Path.Combine(parent, "vi-tools-recognizer-download.part");
        string staging = Path.Combine(parent, KitName + ".new");
        bool downloaded = false;
        try
        {
            Directory.CreateDirectory(parent);
            CleanupLeftovers(parent);
            string zip;
            if (zipFile != null)
            {
                zip = zipFile;
            }
            else
            {
                var (url, size, sha) = await LatestAssetAsync(full, userAgent, ct);
                // 下載的 zip＋解開來的資料夾（約 1.6 倍）
                if (FreeBytes(parent) < size * 3)
                    throw new IOException($"磁碟空間不夠：要大約 {Mb(size * 3)}，{Path.GetPathRoot(parent)} 只剩 {Mb(FreeBytes(parent))}");
                downloaded = true;
                await DownloadAsync(url, part, size, sha, userAgent, progress, ct);
                zip = part;
            }

            // 檢查 zip、解壓縮到 .new
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
            using (var z = ZipFile.OpenRead(zip))
            {
                var files = z.Entries.Where(e => !e.FullName.EndsWith('/')).ToList();
                string prefix = KitName + "/";
                bool safe(string n) => n.StartsWith(prefix, StringComparison.Ordinal) && !n.Contains("..") && !n.Contains(':') && !n.Contains('\\');
                if (files.Count == 0 || !files.All(e => safe(e.FullName))
                    || !files.Any(e => e.FullName == prefix + "runtime/python/python.exe") || !files.Any(e => e.FullName == prefix + "app/main.py"))
                    throw new InvalidDataException("這個 zip 不是 vi-tools 辨識套件（裡面要有「vi-tools辨識套件」資料夾）");
                long need = files.Sum(e => e.Length);
                if (FreeBytes(parent) < need + 50_000_000)
                    throw new IOException($"磁碟空間不夠：解壓縮要 {Mb(need)}，{Path.GetPathRoot(parent)} 只剩 {Mb(FreeBytes(parent))}");
                long done = 0;
                int n = 0;
                foreach (var e in files)
                {
                    ct.ThrowIfCancellationRequested();
                    string dst = Path.Combine(staging, e.FullName[prefix.Length..].Replace('/', Path.DirectorySeparatorChar));
                    Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
                    e.ExtractToFile(dst, true);
                    done += e.Length;
                    if (++n % 200 == 0 || n == files.Count) progress?.Report(new Progress("extract", done, need));
                }
            }
            if (downloaded) TryDelete(part);
            Directory.CreateDirectory(Path.Combine(staging, "輸出"));

            // 換上
            progress?.Report(new Progress("replace", 0, 0));
            string target = old ?? Path.Combine(parent, KitName);
            if (old == null && Directory.Exists(target))
                throw new IOException($"{target} 已經有東西，但不是可以用的辨識套件；請先把它改名或刪掉");
            if (old != null)
            {
                Recognizer.Stop();
                await Task.Delay(800, ct);
                string bak = target.TrimEnd('\\') + ".old";
                if (Directory.Exists(bak)) Directory.Delete(bak, true);
                try { Directory.Move(target, bak); }
                catch (IOException)
                {
                    throw new IOException("舊的辨識套件還在使用中，換不掉。請關掉「vi-tools辨識套件」的黑色視窗（或它的網頁），再按一次");
                }
                try { Directory.Move(staging, target); }
                catch { Directory.Move(bak, target); throw; }
                // 辨識結果搬過去
                string oldOut = Path.Combine(bak, "輸出"), newOut = Path.Combine(target, "輸出");
                if (Directory.Exists(oldOut))
                {
                    try { Directory.Delete(newOut, false); } catch { }
                    try { Directory.Move(oldOut, newOut); } catch { }
                }
                // 舊的刪掉（很大，背景刪；刪不掉下次安裝或啟動時再刪）
                _ = Task.Run(() => TryDeleteDir(bak));
            }
            else
            {
                Directory.Move(staging, target);
            }
            Recognizer.Remember(target);
            return target;
        }
        catch (OperationCanceledException)
        {
            throw new OperationCanceledException("已停止，沒有安裝");
        }
        finally
        {
            if (downloaded) TryDelete(part);
            TryDeleteDir(staging);
            _cts.Dispose();
            _cts = null;
        }
    }

    /// <summary>上次沒做完留下的東西</summary>
    public static void CleanupLeftovers(string? parent = null)
    {
        parent ??= Recognizer.Find() is string d ? Path.GetDirectoryName(d.TrimEnd('\\')) : null;
        if (parent == null) return;
        TryDelete(Path.Combine(parent, "vi-tools-recognizer-download.part"));
        TryDeleteDir(Path.Combine(parent, KitName + ".new"));
        TryDeleteDir(Path.Combine(parent, KitName + ".old"));
    }

    static void TryDelete(string f) { try { File.Delete(f); } catch { } }
    static void TryDeleteDir(string d) { try { if (Directory.Exists(d)) Directory.Delete(d, true); } catch { } }

    static async Task<(string url, long size, string sha)> LatestAssetAsync(bool full, string userAgent, CancellationToken ct)
    {
        string api = Environment.GetEnvironmentVariable("VITOOLS_RECOGNIZER_API") is { Length: > 0 } t ? t : Api;
        using var req = new HttpRequestMessage(HttpMethod.Get, api);
        req.Headers.UserAgent.ParseAdd(userAgent);
        req.Headers.Accept.ParseAdd("application/vnd.github+json");
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(20));
        using var res = await Http.SendAsync(req, cts.Token);
        if (!res.IsSuccessStatusCode) throw new HttpRequestException($"查不到辨識套件的最新版（GitHub 回 {(int)res.StatusCode}）");
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(cts.Token));
        foreach (var a in doc.RootElement.GetProperty("assets").EnumerateArray())
        {
            string name = a.GetProperty("name").GetString() ?? "";
            bool exam = name.EndsWith("-exam-portable.zip", StringComparison.Ordinal);
            if (!name.EndsWith("-portable.zip", StringComparison.Ordinal) || exam == full) continue;
            string digest = a.TryGetProperty("digest", out var dg) && dg.ValueKind == JsonValueKind.String ? dg.GetString() ?? "" : "";
            return (a.GetProperty("browser_download_url").GetString()!, a.GetProperty("size").GetInt64(),
                digest.StartsWith("sha256:") ? digest[7..].ToLowerInvariant() : "");
        }
        throw new InvalidDataException("最新版的辨識套件沒有" + (full ? "完整版" : "試卷版") + "的 zip");
    }

    static async Task DownloadAsync(string url, string file, long size, string sha, string userAgent, IProgress<Progress>? progress, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.UserAgent.ParseAdd(userAgent);
        using var res = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        res.EnsureSuccessStatusCode();
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        long got = 0;
        progress?.Report(new Progress("download", 0, size));
        await using (var src = await res.Content.ReadAsStreamAsync(ct))
        await using (var dst = new FileStream(file, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20))
        {
            var buf = new byte[1 << 20];
            long lastReport = 0;
            while (true)
            {
                // 一直沒有資料（網路斷了）：2 分鐘就放棄
                using var idle = CancellationTokenSource.CreateLinkedTokenSource(ct);
                idle.CancelAfter(TimeSpan.FromMinutes(2));
                int n;
                try { n = await src.ReadAsync(buf, idle.Token); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new TimeoutException("網路 2 分鐘沒有傳資料過來，下載中斷了"); }
                if (n == 0) break;
                await dst.WriteAsync(buf.AsMemory(0, n), ct);
                hash.AppendData(buf, 0, n);
                got += n;
                if (got - lastReport >= size / 200 || got == size) { lastReport = got; progress?.Report(new Progress("download", got, size)); }
            }
        }
        string h = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        if (got != size || (sha != "" && h != sha))
            throw new InvalidDataException("下載的檔案不完整（大小或雜湊值不符），沒有安裝；請再試一次");
    }
}
