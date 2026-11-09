using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;

namespace ViTools;

// vi-tools 辨識套件（https://github.com/hurthuang/vi-tools-recognizer）：放在 ViTools 資料夾裡就自動找到，
// 網頁用到才在背景啟動（不開黑色視窗），app 關掉時一起關。使用者自己開的辨識套件網頁會直接連上，這裡不管它。
//   找的位置：自己選過的資料夾（%LOCALAPPDATA%\ViTools\recognizer-path.txt）→ ViTools 資料夾本身、底下一層、兩層
//   （解壓縮常多一層：vi-tools-recognizer-0.4.0-portable\vi-tools辨識套件\）
//   認得的資料夾：有 runtime\python\python.exe 和 app\main.py
static class Recognizer
{
    const int FirstPort = 18760, LastPort = 18779;   // 跟辨識套件、網頁 haodian-ocr.js 一樣
    static Process? _proc;   // 這個 app 啟動的辨識套件
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(1.5) };
    static readonly SemaphoreSlim StartLock = new(1, 1);

    static string SettingFile => Path.Combine(
        Environment.GetEnvironmentVariable("VITOOLS_USER_DATA") is { Length: > 0 } t ? t
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ViTools"),
        "recognizer-path.txt");

    public static bool IsKit(string? dir) =>
        !string.IsNullOrEmpty(dir) && File.Exists(Path.Combine(dir, "runtime", "python", "python.exe"))
        && File.Exists(Path.Combine(dir, "app", "main.py"));

    public static string? Find()
    {
        try { var s = File.ReadAllText(SettingFile).Trim(); if (IsKit(s)) return s; } catch { }
        // 自動測試用：VITOOLS_RECOGNIZER 指定辨識套件資料夾
        if (Environment.GetEnvironmentVariable("VITOOLS_RECOGNIZER") is { Length: > 0 } env && IsKit(env)) return env;
        string root = AppContext.BaseDirectory;
        if (IsKit(root)) return root;
        try
        {
            foreach (var d1 in Directory.EnumerateDirectories(root))
            {
                if (IsKit(d1)) return d1;
                foreach (var d2 in Directory.EnumerateDirectories(d1))
                    if (IsKit(d2)) return d2;
            }
        }
        catch { }
        return null;
    }

    public static void Remember(string dir)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SettingFile)!);
        File.WriteAllText(SettingFile, dir);
    }

    // 辨識套件的版本（app\main.py 的 VERSION = '…'），找不到回空字串
    public static string Version(string dir)
    {
        try
        {
            foreach (var line in File.ReadLines(Path.Combine(dir, "app", "main.py")))
                if (line.StartsWith("VERSION = '")) return line.Split('\'')[1];
        }
        catch { }
        return "";
    }

    public static bool Running => _proc is { HasExited: false };

    // 有在跑的辨識套件（不管是誰開的）→ 網址；沒有 → null
    static async Task<string?> PingAsync()
    {
        var tasks = Enumerable.Range(FirstPort, LastPort - FirstPort + 1).Select(async p =>
        {
            string b = $"http://127.0.0.1:{p}/";
            try
            {
                using var doc = JsonDocument.Parse(await Http.GetStringAsync(b + "api/ocr"));
                return doc.RootElement.TryGetProperty("ocr", out _) ? b : null;
            }
            catch { return null; }
        }).ToList();
        foreach (var t in tasks) if (await t is string b) return b;
        return null;
    }

    // 啟動（已經有在跑的就直接用），等到它回應才回傳網址；最多等 60 秒
    public static async Task<string> StartAsync()
    {
        await StartLock.WaitAsync();
        try
        {
            if (await PingAsync() is string up) return up;
            string dir = Find() ?? throw new InvalidOperationException("找不到 vi-tools 辨識套件。請把解壓縮的「vi-tools辨識套件」資料夾放進 ViTools 資料夾。");
            if (!Running)
            {
                var psi = new ProcessStartInfo(Path.Combine(dir, "runtime", "python", "python.exe"))
                {
                    WorkingDirectory = dir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                foreach (var a in new[] { "-X", "utf8", Path.Combine("app", "main.py"), "--no-browser" }) psi.ArgumentList.Add(a);
                _proc = Process.Start(psi) ?? throw new InvalidOperationException("辨識套件啟動失敗");
                KillWithApp(_proc);
            }
            for (int i = 0; i < 120; i++)
            {
                if (_proc is { HasExited: true }) throw new InvalidOperationException("辨識套件啟動後馬上結束了（結束代碼 " + _proc.ExitCode + "）。請直接雙擊「vi-tools辨識套件.cmd」看看錯誤訊息。");
                if (await PingAsync() is string b) return b;
                await Task.Delay(500);
            }
            throw new TimeoutException("辨識套件 60 秒內沒有回應");
        }
        finally { StartLock.Release(); }
    }

    // app 關掉時：只關自己開的
    public static void Stop()
    {
        try { if (Running) _proc!.Kill(entireProcessTree: true); } catch { }
    }

    // app 當掉、被工作管理員結束時 FormClosed 不會跑：把辨識套件放進 Windows 的 Job 物件（KILL_ON_JOB_CLOSE），
    // app 的程序一結束（不管怎麼結束），Windows 就把辨識套件（含它開的子程序）一起關掉，不會留著佔 1 GB 記憶體
    static IntPtr _job;
    static void KillWithApp(Process p)
    {
        try
        {
            if (_job == IntPtr.Zero)
            {
                _job = CreateJobObject(IntPtr.Zero, null);
                var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = 0x2000;   // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                int len = System.Runtime.InteropServices.Marshal.SizeOf(info);
                IntPtr ptr = System.Runtime.InteropServices.Marshal.AllocHGlobal(len);
                try
                {
                    System.Runtime.InteropServices.Marshal.StructureToPtr(info, ptr, false);
                    SetInformationJobObject(_job, 9 /* JobObjectExtendedLimitInformation */, ptr, (uint)len);
                }
                finally { System.Runtime.InteropServices.Marshal.FreeHGlobal(ptr); }
            }
            AssignProcessToJobObject(_job, p.Handle);
        }
        catch { /* 做不到就只靠 FormClosed */ }
    }

    [System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attrs, string? name);
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint len);
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct IO_COUNTERS { public ulong R, W, O, RB, WB, OB; }
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
}
