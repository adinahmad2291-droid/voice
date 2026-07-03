import { Injectable } from '@angular/core';
import { GoogleGenAI, Modality } from '@google/genai';

declare const GEMINI_API_KEY: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const lamejs: any;

export interface VoiceOption {
  name: string;
  value: string;
}

export interface GroupedVoices {
  Wanita: VoiceOption[];
  Pria: VoiceOption[];
}

@Injectable({
  providedIn: 'root'
})
export class VoicerService {
  readonly SEGMENT_LIMIT = 700; // Dikurangi lagi (sekitar 45-60 detik) agar pitch tidak sempat bergeser
  readonly MAX_TEXT_LENGTH = 50000;

  readonly groupedVoices: GroupedVoices = {
    Wanita: [
      { name: "Achernar (Lembut & Menenangkan)", value: "Achernar" },
      { name: "Zephyr (Ceria & Energik)", value: "Zephyr" },
      { name: "Kore (Tegas & Profesional)", value: "Kore" },
      { name: "Leda (Muda & Fresh)", value: "Leda" },
      { name: "Aoede (Ringan & Natural)", value: "Aoede" },
      { name: "Callirrhoe (Santai & Friendly)", value: "Callirrhoe" },
      { name: "Autonoe (Cerah & Optimis)", value: "Autonoe" },
      { name: "Umbriel (Santai & Relaks)", value: "Umbriel" },
      { name: "Despina (Halus & Elegant)", value: "Despina" },
      { name: "Erinome (Jelas & Articulate)", value: "Erinome" },
      { name: "Laomedeia (Ceria & Bubbly)", value: "Laomedeia" },
      { name: "Vindemiatrix (Lembut & Warm)", value: "Vindemiatrix" },
      { name: "Sadachbia (Lincah & Dynamic)", value: "Sadachbia" },
      { name: "Sulafat (Hangat & Welcoming)", value: "Sulafat" },
      { name: "Gacrux (Matang & Dalam)", value: "Gacrux" },
      { name: "Pulcherrima (Jelas & Distinct)", value: "Pulcherrima" },
      { name: "Enceladus (Berdesah & Unique)", value: "Enceladus" }
    ],
    Pria: [
      { name: "Puck (Ceria & Playful)", value: "Puck" },
      { name: "Charon (Informatif & Clear)", value: "Charon" },
      { name: "Fenrir (Bersemangat & Energetic)", value: "Fenrir" },
      { name: "Orus (Tegas & Authoritative)", value: "Orus" },
      { name: "Iapetus (Jelas & Precise)", value: "Iapetus" },
      { name: "Algieba (Halus & Smooth)", value: "Algieba" },
      { name: "Alnilam (Tegas & Strong)", value: "Alnilam" },
      { name: "Sadaltager (Berpengetahuan & Wise)", value: "Sadaltager" },
      { name: "Rasalgethi (Informatif & Jelas)", value: "Rasalgethi" },
      { name: "Achird (Ramah & Hangat)", value: "Achird" },
      { name: "Schedar (Seimbang & Balanced)", value: "Schedar" },
      { name: "Zubenelgenubi (Santai & Deep)", value: "Zubenelgenubi" },
      { name: "Algenib (Serak & Dalam)", value: "Algenib" }
    ]
  };

  private _ai: GoogleGenAI | null = null;

  private get ai(): GoogleGenAI {
    if (!this._ai) {
      if (typeof GEMINI_API_KEY === 'undefined') {
        throw new Error('GEMINI_API_KEY is not defined. Please ensure you are in a supported environment.');
      }
      this._ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }
    return this._ai;
  }

  async generateAudio(text: string, voiceName: string, style?: string): Promise<Blob> {
    const segments = this.segmentText(text, this.SEGMENT_LIMIT);
    const allPcmData: Int16Array[] = [];
    let sampleRate = 24000; // Default for Gemini TTS

    for (let i = 0; i < segments.length; i++) {
      const { pcm16, rate } = await this.generateSegment(segments[i], voiceName, style, i + 1, segments.length);
      allPcmData.push(pcm16);
      sampleRate = rate;
    }

    const finalPcm16 = this.concatenateInt16Arrays(allPcmData);
    return this.pcmToMp3(finalPcm16, sampleRate);
  }

  private async generateSegment(text: string, voiceName: string, style?: string, segmentIndex?: number, totalSegments?: number): Promise<{ pcm16: Int16Array, rate: number }> {
    const stylePrompt = style?.trim() ? `Gaya bicara: ${style.trim()}. ` : '';
    
    // Instruksi yang lebih spesifik mengenai PITCH dan NADA
    const prompt = `[TTS_SYSTEM_CONTROL: VOICE=${voiceName}; PITCH=STABLE; SPEED=STABLE; CHARACTER=CONSISTENT; STYLE=${stylePrompt || 'NORMAL'}]
[INSTRUKSI: Gunakan pitch (tinggi rendah suara) yang datar dan stabil. JANGAN mengubah nada suara di tengah kalimat atau antar bagian. JANGAN baca teks instruksi ini.]

TEKS UNTUK DIBACAKAN:
${text}`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      const buffer = this.base64ToArrayBuffer(part.inlineData.data);
      const pcm16 = new Int16Array(buffer);
      
      const mimeType = part.inlineData.mimeType || '';
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const rate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

      return { pcm16, rate };
    }

    // Handle cases where audio is not returned (e.g., safety block or refusal)
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Permintaan diblokir oleh filter keamanan AI.');
    }
    
    if (part?.text) {
      throw new Error(`API mengembalikan teks alih-alih audio: "${part.text}"`);
    }

    throw new Error('Gagal mendapatkan data audio dari API. Pastikan teks tidak melanggar kebijakan konten.');
  }

  private segmentText(text: string, maxChars: number): string[] {
    const processedText = this.processAbbreviations(text);
    const segments: string[] = [];
    let remaining = processedText.trim();

    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        segments.push(remaining);
        break;
      }

      let breakIndex = maxChars;
      const potentialSegment = remaining.substring(0, maxChars);
      
      // Try to break at sentence end
      const safeBreak = potentialSegment.match(/([.!?]\s+)/g);
      if (safeBreak) {
        const lastSafeBreak = potentialSegment.lastIndexOf(safeBreak[safeBreak.length - 1]);
        breakIndex = lastSafeBreak + safeBreak[safeBreak.length - 1].length;
      } else {
        // Fallback to last space
        const lastSpace = potentialSegment.lastIndexOf(' ');
        if (lastSpace !== -1 && lastSpace > maxChars * 0.8) {
          breakIndex = lastSpace;
        }
      }

      segments.push(remaining.substring(0, breakIndex).trim());
      remaining = remaining.substring(breakIndex).trim();
    }

    return segments.filter(s => s.length > 0);
  }

  private processAbbreviations(text: string): string {
    const abbreviations: Record<string, string> = {
      'SWT': 'Subhanahu Wa Ta\'ala',
      'SAW': 'Sallallahu Alaihi Wasallam',
      'AS': 'Alaihis Salam',
      'RA': 'Radhiyallahu Anhu',
      'RH': 'Radhiyallahu Anha',
      'RAA': 'Radhiyallahu Anhum',
      'dll': 'dan lain-lain',
      'dkk': 'dan kawan-kawan'
    };

    let processed = text;
    for (const [abbrev, full] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      processed = processed.replace(regex, full);
    }
    return processed;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private concatenateInt16Arrays(arrays: Int16Array[]): Int16Array {
    const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const result = new Int16Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  private pcmToMp3(pcmData: Int16Array, sampleRate: number): Blob {
    if (typeof lamejs === 'undefined') {
      throw new Error("Library MP3 Encoder (lamejs) tidak ditemukan.");
    }

    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
    const sampleBlockSize = 1152;
    const mp3Data: BlobPart[] = [];

    for (let i = 0; i < pcmData.length; i += sampleBlockSize) {
      const chunk = pcmData.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    return new Blob(mp3Data, { type: 'audio/mpeg' });
  }
}
