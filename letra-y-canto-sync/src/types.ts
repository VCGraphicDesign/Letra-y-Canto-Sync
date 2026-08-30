export interface AudioFileInfo {
  file: File;
  name: string;
  size: number;
  type: string;
  url: string;
  duration?: number;
}

export type TranscriptionStatus = 'idle' | 'transcribing' | 'completed' | 'error';

export interface TranscriptionError {
  message: string;
  code?: 'unsupported_file' | 'upload_error' | 'gemini_error' | 'empty_transcription' | 'network_error' | 'missing_api_key' | string;
  details?: string;
}

export interface SyncedWord {
  word: string;
  start: number;
  end: number;
  lineIndex: number;
  confidence?: number;
}

export interface SyncedLine {
  lineIndex: number;
  text: string;
  start: number;
  end: number;
  words: SyncedWord[];
}

export interface SyncResult {
  durationSeconds: number;
  words: SyncedWord[];
  lines?: SyncedLine[];
  syncedLyricsText: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

