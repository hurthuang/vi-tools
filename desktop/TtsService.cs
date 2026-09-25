using System.Text;
using Windows.Media.MediaProperties;
using Windows.Media.SpeechSynthesis;
using Windows.Media.Transcoding;
using Windows.Storage.Streams;

namespace ViTools;

public record VoiceDto(string id, string name, string lang, bool isDefault);

// Windows OneCore 語音合成（含臺灣中文 Hanhan / Yating / Zhiwei）
public static class TtsService
{
    const int MaxChunkChars = 800;

    public static List<VoiceDto> GetVoices()
    {
        string defId = SpeechSynthesizer.DefaultVoice?.Id ?? "";
        return SpeechSynthesizer.AllVoices
            .Select(v => new VoiceDto(v.Id, v.DisplayName, v.Language, v.Id == defId))
            .ToList();
    }

    // 長文分段合成後，把各段 PCM 資料接成一個 WAV
    public static async Task<byte[]> SynthesizeWavAsync(string text, string? voiceId, double rate,
        IProgress<(int done, int total)>? progress = null, double volume = 1.0)
    {
        using var synth = new SpeechSynthesizer();
        var voice = SpeechSynthesizer.AllVoices.FirstOrDefault(v => v.Id == voiceId);
        if (voice != null) synth.Voice = voice;
        synth.Options.SpeakingRate = Math.Clamp(rate, 0.5, 6.0);
        synth.Options.AudioVolume = Math.Clamp(volume, 0.0, 1.0);

        var chunks = SplitText(text);
        byte[]? fmt = null;
        using var pcm = new MemoryStream();
        for (int i = 0; i < chunks.Count; i++)
        {
            using var stream = await synth.SynthesizeTextToStreamAsync(chunks[i]);
            using var input = stream.AsStreamForRead();
            using var buf = new MemoryStream();
            await input.CopyToAsync(buf);
            var (chunkFmt, data) = ParseWav(buf.ToArray());
            fmt ??= chunkFmt;
            pcm.Write(data);
            progress?.Report((i + 1, chunks.Count));
        }
        if (fmt == null) throw new InvalidOperationException("沒有可合成的文字");
        return BuildWav(fmt, pcm.ToArray());
    }

    // 用 Windows 內建的 Media Foundation 編碼器把 WAV 轉成 MP3（取樣率不符時會自動轉換）
    public static async Task<byte[]> WavToMp3Async(byte[] wav)
    {
        using var input = new InMemoryRandomAccessStream();
        using (var w = input.GetOutputStreamAt(0).AsStreamForWrite())
            await w.WriteAsync(wav);
        input.Seek(0);

        using var output = new InMemoryRandomAccessStream();
        // 語音用單聲道 64kbps 就夠清楚，檔案約每小時 28MB
        var profile = MediaEncodingProfile.CreateMp3(AudioEncodingQuality.Medium);
        profile.Audio.ChannelCount = 1;
        profile.Audio.Bitrate = 64000;
        var prep = await new MediaTranscoder().PrepareStreamTranscodeAsync(input, output, profile);
        if (!prep.CanTranscode) throw new InvalidOperationException($"無法轉成 MP3：{prep.FailureReason}");
        await prep.TranscodeAsync();

        using var r = output.GetInputStreamAt(0).AsStreamForRead();
        using var ms = new MemoryStream();
        await r.CopyToAsync(ms);
        return ms.ToArray();
    }

    // 依段落、句末標點切段，每段不超過 MaxChunkChars
    static List<string> SplitText(string text)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        foreach (char c in text.Replace("\r\n", "\n"))
        {
            sb.Append(c);
            bool boundary = c is '\n' or '。' or '！' or '？' or '；' or '.' or '!' or '?';
            if ((boundary && sb.Length >= MaxChunkChars / 2) || sb.Length >= MaxChunkChars)
                Flush();
        }
        Flush();
        return result;

        void Flush()
        {
            string s = sb.ToString().Trim();
            if (s.Length > 0) result.Add(s);
            sb.Clear();
        }
    }

    static (byte[] fmt, byte[] data) ParseWav(byte[] wav)
    {
        if (wav.Length < 12 || Encoding.ASCII.GetString(wav, 0, 4) != "RIFF")
            throw new InvalidDataException("語音合成回傳的不是 WAV 格式");
        byte[]? fmt = null, data = null;
        int pos = 12;
        while (pos + 8 <= wav.Length)
        {
            string id = Encoding.ASCII.GetString(wav, pos, 4);
            int size = BitConverter.ToInt32(wav, pos + 4);
            int start = pos + 8;
            if (size < 0 || start + size > wav.Length) size = wav.Length - start;
            if (id == "fmt ") fmt = wav[start..(start + size)];
            else if (id == "data") data = wav[start..(start + size)];
            pos = start + size + (size & 1);
        }
        if (fmt == null || data == null) throw new InvalidDataException("WAV 缺少 fmt 或 data 區塊");
        return (fmt, data);
    }

    static byte[] BuildWav(byte[] fmt, byte[] data)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write(Encoding.ASCII.GetBytes("RIFF"));
        w.Write(4 + 8 + fmt.Length + 8 + data.Length);
        w.Write(Encoding.ASCII.GetBytes("WAVE"));
        w.Write(Encoding.ASCII.GetBytes("fmt "));
        w.Write(fmt.Length);
        w.Write(fmt);
        w.Write(Encoding.ASCII.GetBytes("data"));
        w.Write(data.Length);
        w.Write(data);
        w.Flush();
        return ms.ToArray();
    }
}
