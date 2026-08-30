import React, { useState, useRef } from 'react';
import { UploadCloud, Music, FileAudio, AlertCircle, X, CheckCircle2 } from 'lucide-react';
import { AudioFileInfo } from '../types';

interface FileUploadProps {
  onFileSelected: (fileInfo: AudioFileInfo) => void;
  selectedAudio: AudioFileInfo | null;
  onClear: () => void;
  disabled?: boolean;
}

const ACCEPTED_FORMATS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-m4a',
  'audio/webm',
];

const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.mp4', '.webm'];

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  selectedAudio,
  onClear,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const validateAndProcessFile = (file: File) => {
    setValidationError(null);

    const hasValidMime = file.type && ACCEPTED_FORMATS.some((fmt) => file.type.toLowerCase().includes(fmt.replace('audio/', '')));
    const hasValidExt = ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidMime && !hasValidExt && !file.type.startsWith('audio/')) {
      setValidationError('El formato de audio no es compatible. Acepta: MP3, WAV, M4A, AAC, OGG, FLAC.');
      return;
    }

    // Create object URL for local audio playback
    const url = URL.createObjectURL(file);

    // Read audio duration
    const tempAudio = new Audio();
    tempAudio.src = url;
    tempAudio.addEventListener('loadedmetadata', () => {
      onFileSelected({
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'audio/mpeg',
        url,
        duration: tempAudio.duration,
      });
    });

    tempAudio.addEventListener('error', () => {
      // Still allow passing the file if metadata reading has a minor issue
      onFileSelected({
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'audio/mpeg',
        url,
      });
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full space-y-3" id="file-upload-section">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 flex items-center gap-2">
          <Music className="w-4 h-4 text-amber-400" />
          SUBIR CANCIÓN
        </label>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        id="audio-file-input"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled}
      />

      {!selectedAudio ? (
        <div
          id="dropzone-area"
          onClick={triggerFileInput}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-5 sm:p-8 text-center cursor-pointer transition-all duration-200 group ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 scale-[1.008]'
              : 'border-slate-700/80 hover:border-amber-500/60 bg-slate-900/40 hover:bg-slate-900/80'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-col items-center justify-center space-y-2.5">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-base font-medium text-slate-200">
                Arrastra tu archivo de audio aquí o{' '}
                <span className="text-amber-400 underline underline-offset-4 decoration-amber-400/50 group-hover:decoration-amber-400">
                  explora tus archivos
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Soporta canciones completas grabadas por vocalistas (hasta 50 MB)
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {['MP3', 'WAV', 'M4A', 'FLAC', 'AAC', 'OGG'].map((badge) => (
                <span
                  key={badge}
                  className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800/90 text-slate-300 border border-slate-700/60"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          id="audio-loaded-card"
          className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex items-center justify-between gap-4 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FileAudio className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-100 truncate max-w-[280px] sm:max-w-md">
                  {selectedAudio.name}
                </p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  Cargado
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {formatFileSize(selectedAudio.size)}{' '}
                {selectedAudio.duration
                  ? `• ${Math.floor(selectedAudio.duration / 60)}:${Math.floor(selectedAudio.duration % 60)
                      .toString()
                      .padStart(2, '0')}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="change-audio-btn"
              onClick={triggerFileInput}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
            >
              Cambiar
            </button>
            <button
              type="button"
              id="remove-audio-btn"
              onClick={onClear}
              disabled={disabled}
              className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-rose-500/10 rounded-lg border border-slate-700/60 transition-colors disabled:opacity-50"
              title="Quitar canción"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {validationError && (
        <div
          id="upload-validation-error"
          className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
