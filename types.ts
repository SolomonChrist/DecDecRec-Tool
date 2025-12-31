
export type LayoutStyle = 'CIRCLE' | 'SHORTS';

export type Resolution = '720p' | '1080p';

export interface QualityConfig {
  resolution: Resolution;
  fps: 30 | 60;
}

export interface RecordingSession {
  id: string; // DD-Mon-YYYY_HH-mm-ss
  createdAtISO: string;
  durationSeconds: number;
  layoutStyle: LayoutStyle;
  quality: QualityConfig;
  videoBlob: Blob;
  audioBlob?: Blob;
  transcript?: string;
  srt?: string;
  metadata: any;
  videoType: 'webm' | 'mp4';
}

export interface StorageEstimate {
  quota: number;
  usage: number;
  free: number;
  persistent: boolean;
}

export interface TranscriptionSettings {
  mode: 'OPENAI' | 'LOCAL_SERVER' | 'CLI_GUIDE';
  openaiKey?: string;
  openaiModel: string;
  localServerUrl: string;
}
