# 自動填寫 app 的「匯出音檔」存檔視窗（由 lib.mjs 以 powershell -Command 執行，不需要改執行原則）
# 檔名由環境變數 VTD_PATH 傳入；VTD_CANCEL=1 時改按「取消」
$path = $env:VTD_PATH
$cancel = $env:VTD_CANCEL -eq '1'
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class VtdDlg {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, P p, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  public static IntPtr FileNameEdit(IntPtr dlg) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(dlg, (h, l) => { var c = new StringBuilder(64); GetClassName(h, c, 64);
      if (c.ToString() == "Edit" && GetDlgCtrlID(h) == 1001) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
'@
# 視窗標題「匯出音檔」用字碼組出來，避免這個檔案的編碼被 PowerShell 5.1 誤讀
$title = [string]::new([char[]]@(0x532F, 0x51FA, 0x97F3, 0x6A94))
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 60 -and $h -eq [IntPtr]::Zero; $i++) {
  $h = [VtdDlg]::FindWindow('#32770', $title)
  if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 250 }
}
if ($h -eq [IntPtr]::Zero) { 'no dialog'; exit 1 }
Start-Sleep -Milliseconds 500
if ($cancel) { [void][VtdDlg]::SendMessage($h, 0x0111, [IntPtr]2, [IntPtr]::Zero); 'cancelled'; exit 0 }  # IDCANCEL
$edit = [VtdDlg]::FileNameEdit($h)
if ($edit -eq [IntPtr]::Zero) { 'no edit'; exit 1 }
[void][VtdDlg]::SendMessage($edit, 0x000C, [IntPtr]::Zero, $path)   # WM_SETTEXT
Start-Sleep -Milliseconds 200
[void][VtdDlg]::SendMessage($h, 0x0111, [IntPtr]1, [IntPtr]::Zero)  # WM_COMMAND IDOK（存檔）
'ok'
