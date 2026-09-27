# 用 Windows 臺灣中文語音 Hanhan（SAPI 桌面版）念每一行文字，收集它實際的念法（PhonemeReached 的音素與聲調）
# 輸出「文字<TAB>音素」，音素以空白分隔，「_」是停頓。Hanhan 的音素用注音符號表示但不完全等於注音
# （例：ㄘ、ㄗ 都寫成 ㄗ；沒有聲母的音前面有 ㄍ），比對時要拿同音節的常用字當參考，不能直接和注音比
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools\hanhan-phonemes.ps1 輸入.txt 輸出.tsv
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System.Collections.Generic;
using System.Speech.Synthesis;
public static class HanhanPhonemes {
    public static string Speak(SpeechSynthesizer s, string text) {
        var list = new List<string>();
        System.EventHandler<PhonemeReachedEventArgs> h = (o, e) => list.Add(e.Phoneme);
        s.PhonemeReached += h;
        s.Speak(text);
        s.PhonemeReached -= h;
        return string.Join(" ", list);
    }
}
"@
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Hanhan Desktop')
$s.SetOutputToNull()
$res = foreach ($t in [System.IO.File]::ReadAllLines($In)) { if ($t) { "$t`t" + [HanhanPhonemes]::Speak($s, $t) } }
[System.IO.File]::WriteAllLines($Out, [string[]]$res, (New-Object System.Text.UTF8Encoding $false))
