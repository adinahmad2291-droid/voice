import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { VoicerService } from './voicer.service';

export interface HistoryItem {
  id: string;
  url: string;
  filename: string;
  text: string;
  voice: string;
  size: string;
  timestamp: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private voicer = inject(VoicerService);

  // State Signals
  text = signal('');
  voice = signal('Achernar');
  style = signal('');
  volume = signal(100);
  isGenerating = signal(false);
  audioUrl = signal<string | null>(null);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  isPlaying = signal(false);
  
  // Audio Progress
  currentTime = signal(0);
  duration = signal(0);
  
  // History
  history = signal<HistoryItem[]>([]);
  
  // Modals
  showResetConfirm = signal(false);
  showDownloadModal = signal(false);
  downloadFilename = signal('');

  // Computed
  charCount = computed(() => this.text().length);
  remainingChars = computed(() => this.voicer.MAX_TEXT_LENGTH - this.charCount());
  groupedVoices = this.voicer.groupedVoices;
  filenamePreview = computed(() => {
    const name = this.downloadFilename().trim() || 'voicer_audio';
    return name.replace(/[<>:"/\\|?*]/g, '_') + '.mp3';
  });

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  @ViewChild('audioPlayer') audioPlayer!: ElementRef<HTMLAudioElement>;

  constructor() {
    // Sync volume with audio element
    effect(() => {
      if (this.audioPlayer?.nativeElement) {
        this.audioPlayer.nativeElement.volume = this.volume() / 100;
      }
    });

    // Auto-hide messages
    effect(() => {
      if (this.error()) {
        setTimeout(() => this.error.set(null), 8000);
      }
    });
    effect(() => {
      if (this.success()) {
        setTimeout(() => this.success.set(null), 5000);
      }
    });
  }

  async generateAudio() {
    const text = this.text().trim();
    if (!text) {
      this.error.set('Teks tidak boleh kosong.');
      return;
    }

    this.error.set(null);
    this.isGenerating.set(true);
    this.audioUrl.set(null);

    try {
      const blob = await this.voicer.generateAudio(text, this.voice(), this.style());
      const url = URL.createObjectURL(blob);
      const size = (blob.size / 1024).toFixed(1) + ' KB';
      const timestamp = new Date().toLocaleString('id-ID', { 
        day: 'numeric', month: 'numeric', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        url,
        filename: `voicer_${this.voice()}_${Date.now()}.mp3`,
        text: text.length > 50 ? text.substring(0, 47) + '...' : text,
        voice: this.voice(),
        size,
        timestamp
      };

      this.audioUrl.set(url);
      this.history.update(h => [newItem, ...h]);
      this.success.set('Audio berhasil dibuat!');
      
      // Auto play
      setTimeout(() => {
        if (this.audioPlayer?.nativeElement) {
          this.audioPlayer.nativeElement.play();
        }
      }, 100);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(`Gagal membuat audio: ${message}`);
    } finally {
      this.isGenerating.set(false);
    }
  }

  resetText() {
    this.text.set('');
    this.audioUrl.set(null);
    this.showResetConfirm.set(false);
  }

  togglePlayPause() {
    const player = this.audioPlayer.nativeElement;
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
  }

  onTimeUpdate() {
    if (this.audioPlayer?.nativeElement) {
      this.currentTime.set(this.audioPlayer.nativeElement.currentTime);
    }
  }

  onLoadedMetadata() {
    if (this.audioPlayer?.nativeElement) {
      this.duration.set(this.audioPlayer.nativeElement.duration);
    }
  }

  seek(event: Event) {
    const target = event.target as HTMLInputElement;
    const time = parseFloat(target.value);
    if (this.audioPlayer?.nativeElement) {
      this.audioPlayer.nativeElement.currentTime = time;
      this.currentTime.set(time);
    }
  }

  onPlay() { this.isPlaying.set(true); }
  onPause() { this.isPlaying.set(false); }
  onEnded() { this.isPlaying.set(false); }

  openDownload() {
    this.downloadFilename.set(`voicer_${Date.now()}`);
    this.showDownloadModal.set(true);
  }

  confirmDownload() {
    const url = this.audioUrl();
    if (!url) return;
    this.downloadFile(url, this.filenamePreview());
    this.showDownloadModal.set(false);
  }

  downloadFile(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.success.set(`File "${filename}" berhasil didownload!`);
  }

  playFromHistory(item: HistoryItem) {
    this.audioUrl.set(item.url);
    setTimeout(() => {
      if (this.audioPlayer?.nativeElement) {
        this.audioPlayer.nativeElement.play();
      }
    }, 100);
  }

  deleteFromHistory(id: string) {
    this.history.update(h => h.filter(item => item.id !== id));
  }

  clearHistory() {
    this.history.set([]);
  }

  createNew() {
    this.audioUrl.set(null);
    this.text.set('');
  }
}
