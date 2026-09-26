using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ViTools;

public class MainForm : Form
{
    // 網頁來源：優先用線上網頁（網頁的修正與新功能直接拿到），連不上才用內附的（本機資料夾對應成 vitools.local）
    const string Host = "vitools.local";
    const string LocalBase = $"https://{Host}/";
    const string OnlineHost = "hurthuang.github.io";
    const string OnlinePath = "/vi-tools/";
    const string OnlineBase = $"https://{OnlineHost}{OnlinePath}";

    readonly string _webRoot;
    readonly bool _preferOnline;
    bool _online;   // 目前用的是線上網頁
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    string _lastSaveDir = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    bool _lastMp3 = true;

    public MainForm(string webRoot, bool preferOnline = true)
    {
        _webRoot = webRoot;
        _preferOnline = preferOnline;
        Text = "視障輔助工具集";
        Width = 1280;
        Height = 860;
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(_web);
        Load += async (_, _) =>
        {
            try { await InitAsync(); }
            catch (WebView2RuntimeNotFoundException)
            {
                // Windows 10/11 通常內建 WebView2 Runtime，少數精簡或企業版本會缺
                var r = MessageBox.Show(this,
                    "這台電腦沒有 Microsoft Edge WebView2 Runtime，無法顯示工具頁面。\n\n按「確定」開啟微軟下載頁面，安裝「Evergreen Bootstrapper」後重新開啟本程式。",
                    "視障輔助工具集", MessageBoxButtons.OKCancel, MessageBoxIcon.Error);
                if (r == DialogResult.OK) OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");
                Close();
            }
        };
    }

    async Task InitAsync()
    {
        // 自動測試用 VITOOLS_USER_DATA 指定另一個資料夾，不動使用者平常的設定與網頁本機資料
        string dataDir = Environment.GetEnvironmentVariable("VITOOLS_USER_DATA") is { Length: > 0 } testDir
            ? testDir
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ViTools", "WebView2");
        _dataDir = dataDir;
        var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
        await _web.EnsureCoreWebView2Async(env);
        var core = _web.CoreWebView2;

        // 本機資料夾對應成 https 網址，讓網頁的 fetch() 能讀轉譯表
        core.SetVirtualHostNameToFolderMapping(Host, _webRoot, CoreWebView2HostResourceAccessKind.Allow);

        // 攔截網路請求（含 iframe 與 worker）：
        //   網頁計數（gc.zgo.at）：桌面版不送出
        //   CDN 函式庫（pdf.js、JSZip、MathJax）：desktop-assets\cdn\ 有同一個網址的檔案就用內附的，離線也能用；沒有的照常走網路
        const CoreWebView2WebResourceRequestSourceKinds allKinds = CoreWebView2WebResourceRequestSourceKinds.All;
        core.AddWebResourceRequestedFilter("*://gc.zgo.at/*", CoreWebView2WebResourceContext.All, allKinds);
        foreach (string cdn in CdnHosts)
            core.AddWebResourceRequestedFilter($"https://{cdn}/*", CoreWebView2WebResourceContext.All, allKinds);
        // 自動測試用：VITOOLS_SIMULATE_OFFLINE=1 時，除了本機網頁與內附檔案，所有對外請求都當成斷線
        bool simulateOffline = _simulateOffline;
        if (simulateOffline) core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, allKinds);
        core.WebResourceRequested += (_, e) =>
        {
            var uri = new Uri(e.Request.Uri);
            if (uri.Host.Equals("gc.zgo.at", StringComparison.OrdinalIgnoreCase))
                e.Response = core.Environment.CreateWebResourceResponse(null, 204, "No Content", "");
            else if (LocalCdnFile(uri) is string file)
                e.Response = core.Environment.CreateWebResourceResponse(File.OpenRead(file), 200, "OK",
                    $"Content-Type: {ContentTypeOf(file)}\r\nAccess-Control-Allow-Origin: *");
            else if (simulateOffline && uri.Scheme is "http" or "https" && !uri.Host.Equals(Host, StringComparison.OrdinalIgnoreCase))
                e.Response = core.Environment.CreateWebResourceResponse(null, 503, "Simulated Offline", "");
        };

        // 本工具的網頁（內附的 vitools.local、線上的 vi-tools）留在 app 裡，其他連結改用預設瀏覽器開啟
        core.NavigationStarting += (_, e) =>
        {
            if (!IsAppPage(e.Uri)) { e.Cancel = true; OpenExternal(e.Uri); }
        };
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (IsAppPage(e.Uri)) core.Navigate(e.Uri); else OpenExternal(e.Uri);
        };
        core.DocumentTitleChanged += (_, _) => UpdateTitle();

        // 線上網頁載入失敗（斷線、網站出錯）：自動改用內附的同一頁
        core.NavigationCompleted += (_, e) =>
        {
            bool failed = (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled) || e.HttpStatusCode >= 400;
            if (failed && _online && Uri.TryCreate(core.Source, UriKind.Absolute, out var src) && IsOnlineUri(src))
            {
                _online = false;
                UpdateTitle();
                core.Navigate(ToLocal(core.Source));
            }
            // 第一頁載好後，在背景安靜地檢查更新（一天最多一次）
            else if (!failed && !_startupUpdateChecked)
            {
                _startupUpdateChecked = true;
                _ = CheckForUpdatesAsync(manual: false);
            }
        };

        string bridge = LoadBridgeScript();
        await core.AddScriptToExecuteOnDocumentCreatedAsync(bridge);
        // 首頁用 iframe 載入各工具頁，上面那行只作用在最上層頁面，iframe 要另外注入
        core.FrameCreated += (_, e) =>
            e.Frame.DOMContentLoaded += async (_, _) => await e.Frame.ExecuteScriptAsync(bridge);
        core.WebMessageReceived += OnWebMessage;

        // 決定網頁來源：VITOOLS_WEB=local／online（測試用）＞ --offline ＞ 試著連線上網頁（最多 3 秒）
        string? webMode = Environment.GetEnvironmentVariable("VITOOLS_WEB");
        _online = webMode == "online" || (webMode != "local" && _preferOnline && await OnlineReachableAsync());
        UpdateTitle();
        core.Navigate((_online ? OnlineBase : LocalBase) + "index.html");
    }

    readonly bool _simulateOffline = Environment.GetEnvironmentVariable("VITOOLS_SIMULATE_OFFLINE") == "1";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(3) };

    // ── 檢查更新：GitHub 上 vi-tools 的 Release，只看標籤 desktop-v*（略過草稿與預先發行）
    //   manual=false：啟動後在背景檢查，一天最多一次，沒有新版就不出聲
    //   manual=true：Ctrl+Shift+U（網頁送來 checkUpdate），沒有新版或檢查失敗也告訴使用者
    //   VITOOLS_UPDATE_URL：測試用，改用別的 Release 清單網址；設成 none 不自動檢查
    const string ReleasesApi = "https://api.github.com/repos/hurthuang/vi-tools/releases?per_page=30";
    const string TagPrefix = "desktop-v";
    static readonly HttpClient UpdateHttp = new() { Timeout = TimeSpan.FromSeconds(10) };
    string _dataDir = "";
    bool _startupUpdateChecked;

    async Task CheckForUpdatesAsync(bool manual)
    {
        string? custom = Environment.GetEnvironmentVariable("VITOOLS_UPDATE_URL");
        if (!manual && custom == "none") return;
        string api = custom is { Length: > 0 } && custom != "none" ? custom : ReleasesApi;
        if (!manual)
        {
            string stamp = Path.Combine(_dataDir, "vitools-update-check.txt");
            try
            {
                if (File.Exists(stamp) && DateTime.UtcNow - File.GetLastWriteTimeUtc(stamp) < TimeSpan.FromDays(1)) return;
                Directory.CreateDirectory(_dataDir);
                File.WriteAllText(stamp, DateTime.UtcNow.ToString("o"));
            }
            catch { }
        }
        try
        {
            if (_simulateOffline && custom is not { Length: > 0 }) throw new HttpRequestException("沒有網路連線");
            using var req = new HttpRequestMessage(HttpMethod.Get, api);
            req.Headers.UserAgent.ParseAdd($"ViTools/{AppVersion}");
            req.Headers.Accept.ParseAdd("application/vnd.github+json");
            using var res = await UpdateHttp.SendAsync(req);
            res.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());

            Version? latest = null;
            string latestUrl = "";
            foreach (var r in doc.RootElement.EnumerateArray())
            {
                if (r.TryGetProperty("draft", out var d) && d.GetBoolean()) continue;
                if (r.TryGetProperty("prerelease", out var p) && p.GetBoolean()) continue;
                string tag = r.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
                if (!tag.StartsWith(TagPrefix, StringComparison.Ordinal) || !Version.TryParse(tag[TagPrefix.Length..], out var v)) continue;
                if (latest == null || v > latest)
                {
                    latest = v;
                    latestUrl = r.TryGetProperty("html_url", out var h) ? h.GetString() ?? "" : "";
                }
            }

            var current = Version.Parse(AppVersion);
            if (latest != null && latest > current)
            {
                var answer = MessageBox.Show(this,
                    $"有新版本 v{latest.ToString(3)}（目前使用 v{AppVersion}）。\n\n要開啟下載頁面嗎？下載後解壓縮，覆蓋原本的資料夾即可。",
                    "視障輔助工具集", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                if (answer == DialogResult.Yes && latestUrl.StartsWith("https://github.com/", StringComparison.Ordinal))
                    OpenExternal(latestUrl);
            }
            else if (manual)
                MessageBox.Show(this, $"目前已是最新版本（v{AppVersion}）。", "視障輔助工具集", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            if (manual)
                MessageBox.Show(this, $"檢查更新失敗：{ex.Message}", "視障輔助工具集", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    async Task<bool> OnlineReachableAsync()
    {
        if (_simulateOffline) return false;
        try
        {
            using var r = await Http.GetAsync(OnlineBase + "index.html", HttpCompletionOption.ResponseHeadersRead);
            return r.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    // Ctrl+Shift+O（網頁送來 toggleWebSource）：線上網頁與內附離線版互換，停在同一頁
    async Task ToggleWebSourceAsync()
    {
        var core = _web.CoreWebView2;
        if (_online)
        {
            _online = false;
            core.Navigate(ToLocal(core.Source));
        }
        else if (await OnlineReachableAsync())
        {
            _online = true;
            core.Navigate(ToOnline(core.Source));
        }
        else
        {
            MessageBox.Show(this, "連不上線上網頁，繼續使用內附的離線版。", "視障輔助工具集", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        UpdateTitle();
    }

    void UpdateTitle()
    {
        string page = _web.CoreWebView2?.DocumentTitle ?? "";
        string suffix = _online ? "" : "（離線版）";
        Text = string.IsNullOrEmpty(page) ? $"視障輔助工具集{suffix}" : $"{page} - 視障輔助工具集{suffix}";
    }

    static bool IsLocalUri(Uri u) => u.Scheme == "https" && u.Host.Equals(Host, StringComparison.OrdinalIgnoreCase);
    static bool IsOnlineUri(Uri u) => u.Scheme == "https" && u.Host.Equals(OnlineHost, StringComparison.OrdinalIgnoreCase)
        && u.AbsolutePath.StartsWith(OnlinePath, StringComparison.Ordinal);

    // 本工具的網頁（可以留在 app 裡、可以使用桌面功能）
    static bool IsAppPage(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) && (IsLocalUri(u) || IsOnlineUri(u) || u.Scheme is "about" or "data" or "blob");

    // 線上與內附網址互換（保留頁面路徑、查詢字串與 #）
    static string ToLocal(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && IsOnlineUri(u)
            ? LocalBase + u.AbsolutePath[OnlinePath.Length..] + u.Query + u.Fragment
            : LocalBase + "index.html";
    static string ToOnline(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && IsLocalUri(u)
            ? OnlineBase + u.AbsolutePath.TrimStart('/') + u.Query + u.Fragment
            : OnlineBase + "index.html";

    // 內附的 CDN 檔案：desktop-assets\cdn\<網域>\<路徑>，和原本網址一一對應
    static readonly string[] CdnHosts = { "cdnjs.cloudflare.com", "cdn.jsdelivr.net" };
    static readonly string CdnRoot = Path.Combine(AppContext.BaseDirectory, "desktop-assets", "cdn") + Path.DirectorySeparatorChar;

    static string? LocalCdnFile(Uri uri)
    {
        string path = Path.GetFullPath(Path.Combine(CdnRoot, uri.Host, Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'))));
        return path.StartsWith(CdnRoot, StringComparison.OrdinalIgnoreCase) && File.Exists(path) ? path : null;
    }

    static string ContentTypeOf(string file) => Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".js" => "text/javascript; charset=utf-8",
        ".json" => "application/json",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        ".css" => "text/css",
        _ => "application/octet-stream",
    };

    static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && u.Scheme is "http" or "https" or "mailto")
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
    }

    // app 版本（csproj 的 <Version>），網頁透過 window.vitoolsDesktop.appVersion 取得
    static readonly string AppVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

    static string LoadBridgeScript()
    {
        using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("bridge.js")!;
        using var r = new StreamReader(s);
        return r.ReadToEnd().Replace("__VITOOLS_APP_VERSION__", AppVersion);
    }

    // 只接受本工具網頁（內附的 vitools.local、線上的 vi-tools）送來的訊息；其他來源一律忽略
    static bool IsTrustedSource(string source) =>
        Uri.TryCreate(source, UriKind.Absolute, out var u) && (IsLocalUri(u) || IsOnlineUri(u));

    async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!IsTrustedSource(e.Source)) return;
        JsonElement msg;
        try { msg = JsonDocument.Parse(e.WebMessageAsJson).RootElement; }
        catch { return; }

        string type = msg.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
        string? fid = msg.TryGetProperty("fid", out var f) ? f.GetString() : null;
        // reqId：window.vitoolsDesktop 每個請求的編號，回覆時原樣帶回，網頁才知道是哪一個請求的結果
        long? reqId = msg.TryGetProperty("reqId", out var q) && q.TryGetInt64(out var qv) ? qv : null;
        void Reply(object payload) => Post(fid, reqId, payload);
        try
        {
            switch (type)
            {
                case "getVoices":
                    Reply(new { type = "voices", voices = TtsService.GetVoices() });
                    break;
                case "preview":
                    await PreviewAsync(msg, Reply);
                    break;
                case "export":
                    await ExportAsync(msg, Reply);
                    break;
                case "toggleWebSource":
                    await ToggleWebSourceAsync();
                    break;
                case "checkUpdate":
                    await CheckForUpdatesAsync(manual: true);
                    break;
            }
        }
        catch (Exception ex)
        {
            Reply(new { type = "error", message = ex.Message });
        }
    }

    async Task PreviewAsync(JsonElement msg, Action<object> reply)
    {
        var (text, voiceId, rate) = ReadTtsArgs(msg);
        if (text.Length > 300) text = text[..300];
        byte[] wav = await TtsService.SynthesizeWavAsync(text, voiceId, rate, null, ReadVolume(msg));
        reply(new { type = "previewAudio", data = Convert.ToBase64String(wav) });
    }

    async Task ExportAsync(JsonElement msg, Action<object> reply)
    {
        var (text, voiceId, rate) = ReadTtsArgs(msg);
        double volume = ReadVolume(msg);
        string name = msg.TryGetProperty("fileName", out var n) ? n.GetString() ?? "" : "";
        using var dlg = new SaveFileDialog
        {
            Title = "匯出音檔",
            Filter = "MP3 音檔 (*.mp3)|*.mp3|WAV 音檔 (*.wav)|*.wav",
            FilterIndex = _lastMp3 ? 1 : 2,
            FileName = SafeFileName(string.IsNullOrWhiteSpace(name) ? "朗讀" : name),
            InitialDirectory = _lastSaveDir,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            reply(new { type = "exportCancelled" });
            return;
        }
        _lastSaveDir = Path.GetDirectoryName(dlg.FileName) ?? _lastSaveDir;
        // 以副檔名決定格式；使用者自己打的副檔名優先於下拉選單
        string ext = Path.GetExtension(dlg.FileName).ToLowerInvariant();
        bool mp3 = ext == ".mp3" || (ext != ".wav" && dlg.FilterIndex == 1);
        _lastMp3 = mp3;
        string path = Path.ChangeExtension(dlg.FileName, mp3 ? ".mp3" : ".wav");

        var progress = new Progress<(int done, int total)>(p =>
            reply(new { type = "progress", done = p.done, total = p.total }));
        byte[] audio = await TtsService.SynthesizeWavAsync(text, voiceId, rate, progress, volume);
        if (mp3)
        {
            reply(new { type = "encoding" });
            audio = await TtsService.WavToMp3Async(audio);
        }
        await File.WriteAllBytesAsync(path, audio);
        reply(new { type = "exportDone", path });
    }

    static (string text, string? voiceId, double rate) ReadTtsArgs(JsonElement msg)
    {
        string text = msg.GetProperty("text").GetString() ?? "";
        if (string.IsNullOrWhiteSpace(text)) throw new ArgumentException("沒有可朗讀的文字");
        string? voiceId = msg.TryGetProperty("voiceId", out var v) ? v.GetString() : null;
        double rate = msg.TryGetProperty("rate", out var r) && r.TryGetDouble(out var d) ? d : 1.0;
        return (text, voiceId, rate);
    }

    static double ReadVolume(JsonElement msg) =>
        msg.TryGetProperty("volume", out var v) && v.TryGetDouble(out var d) ? d : 1.0;

    static string SafeFileName(string s)
    {
        foreach (char c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
        s = s.Trim();
        return s.Length > 40 ? s[..40] : s;
    }

    // 回覆附上 fid（哪個分頁）與 reqId（哪個請求）
    void Post(string? fid, long? reqId, object payload)
    {
        var node = JsonSerializer.SerializeToNode(payload)!.AsObject();
        node["fid"] = fid;
        node["reqId"] = reqId;
        _web.CoreWebView2?.PostWebMessageAsJson(node.ToJsonString());
    }
}
