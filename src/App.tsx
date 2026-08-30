import React, { useState } from 'react';
import {
  Mic,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Music,
  FileText,
} from 'lucide-react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { AudioPlayer } from './components/AudioPlayer';
import { TranscriptionLoading } from './components/TranscriptionLoading';
import { LyricsDisplay } from './components/LyricsDisplay';
import { SyncedLyricsPlayer } from './components/SyncedLyricsPlayer';
import {
  AudioFileInfo,
  TranscriptionStatus,
  TranscriptionError,
  SyncResult,
  SyncStatus,
} from './types';

export default function App() {
  const [selectedAudio, setSelectedAudio] = useState<AudioFileInfo | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [transcribedLyrics, setTranscribedLyrics] = useState<string>('');
  const [originalTranscribedLyrics, setOriginalTranscribedLyrics] = useState<string>('');
  const [error, setError] = useState<TranscriptionError | null>(null);

  // CANTEMOS Synchronization States
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lyrics' | 'cantemos'>('lyrics');

  const handleFileSelected = (fileInfo: AudioFileInfo) => {
    // If previously created an object url and selecting a different file, revoke old one
    if (selectedAudio && selectedAudio.url && selectedAudio.url !== fileInfo.url) {
      try {
        URL.revokeObjectURL(selectedAudio.url);
      } catch (e) {
        // ignore
      }
    }
    setSelectedAudio(fileInfo);
    setError(null);
    setStatus('idle');
    setTranscribedLyrics('');
    setOriginalTranscribedLyrics('');
    setSyncResult(null);
    setSyncStatus('idle');
    setSyncError(null);
    setActiveTab('lyrics');
  };

  const handleClearAudio = () => {
    if (selectedAudio && selectedAudio.url) {
      try {
        URL.revokeObjectURL(selectedAudio.url);
      } catch (e) {
        // ignore
      }
    }
    setSelectedAudio(null);
    setStatus('idle');
    setTranscribedLyrics('');
    setOriginalTranscribedLyrics('');
    setError(null);
    setSyncResult(null);
    setSyncStatus('idle');
    setSyncError(null);
    setActiveTab('lyrics');
  };

  const handleTranscribe = async () => {
    if (!selectedAudio || status === 'transcribing') return;

    setStatus('transcribing');
    setError(null);
    setSyncResult(null);
    setSyncStatus('idle');

    try {
      const file = selectedAudio.file;
      // 2 MiB binary chunks comfortably below Cloud Run / proxy ingress limits
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Step 1: Initialize temporary upload session on server
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'audio/mpeg',
          totalSize: file.size,
          totalChunks,
        }),
      });

      let initData: any = null;
      try {
        initData = await initRes.json();
      } catch (parseErr) {
        throw new Error(`El servidor respondió con formato no reconocido (${initRes.status})`);
      }

      if (!initRes.ok || !initData || !initData.success || !initData.sessionId) {
        throw new Error(initData?.message || 'Error al iniciar la sesión de subida.');
      }

      const sessionId = initData.sessionId;

      // Step 2: Upload binary chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('chunkIndex', i.toString());
        formData.append('chunk', chunkBlob, `chunk_${i}.bin`);

        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        let chunkData: any = null;
        try {
          chunkData = await chunkRes.json();
        } catch (parseErr) {
          if (chunkRes.status === 413) {
            throw new Error('El fragmento de audio es demasiado grande.');
          }
          throw new Error(`Error en el servidor al subir fragmento (${chunkRes.status})`);
        }

        if (!chunkRes.ok || !chunkData || !chunkData.success) {
          throw new Error(chunkData?.message || `Error al subir el fragmento ${i + 1} de ${totalChunks}.`);
        }
      }

      // Step 3: Request transcription using sessionId
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      const responseText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Non-JSON response received from /api/transcribe with status:', response.status, 'Body:', responseText.slice(0, 300));
        if (response.status === 413) {
          setError({
            message: 'El archivo de audio es demasiado grande para procesarlo de esta forma.',
            code: 'file_too_large',
          });
        } else {
          setError({
            message: 'Ocurrió un error de conexión con el servidor de transcripción.',
            code: 'network_error',
            details: `El servidor respondió con formato no reconocido (${response.status}): ${responseText.slice(0, 150)}`,
          });
        }
        setStatus('error');
        return;
      }

      if (!response.ok || !data || data.success === false) {
        let defaultMsg = 'La canción no pudo ser procesada.';
        if (response.status === 413 || data?.error === 'file_too_large') {
          defaultMsg = 'El archivo de audio es demasiado grande para procesarlo de esta forma.';
        } else if (response.status === 400 && data?.error === 'unsupported_file') {
          defaultMsg = 'El formato de audio no es compatible.';
        } else if (response.status === 400 && data?.error === 'upload_error') {
          defaultMsg = 'El archivo no pudo ser cargado.';
        } else if (response.status === 422 || data?.error === 'empty_transcription') {
          defaultMsg = 'No se pudo detectar una letra en la canción.';
        }

        setError({
          message: data?.message || data?.error || defaultMsg,
          code: data?.error || data?.code || 'gemini_error',
          details: data?.details,
        });
        setStatus('error');
        return;
      }

      const lyrics = data.lyrics || '';
      if (!lyrics.trim()) {
        setError({
          message: 'No se pudo detectar una letra en el audio.',
          code: 'empty_transcription',
        });
        setStatus('error');
        return;
      }

      setTranscribedLyrics(lyrics);
      setOriginalTranscribedLyrics(lyrics);

      // If transcription returned word-level timestamps, initialize sync result immediately for CANTEMOS
      if (Array.isArray(data.words) && data.words.length > 0) {
        setSyncResult({
          durationSeconds: typeof data.duration === 'number' ? data.duration : (selectedAudio?.duration || 0),
          words: data.words,
          syncedLyricsText: lyrics,
        });
        setSyncStatus('synced');
      }

      setStatus('completed');
      setActiveTab('lyrics');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError({
        message: err.message || 'Ocurrió un error de conexión con el servidor de transcripción.',
        code: 'network_error',
        details: err.message,
      });
      setStatus('error');
    }
  };

  const handleResetLyrics = () => {
    setTranscribedLyrics(originalTranscribedLyrics);
  };

  // Perform forced alignment for CANTEMOS using current edited lyrics as ground truth
  const handlePerformSync = async (customLyrics?: string) => {
    const targetLyrics = (typeof customLyrics === 'string' ? customLyrics : transcribedLyrics).trim();
    if (!selectedAudio || !targetLyrics || syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    setSyncError(null);
    setActiveTab('cantemos');

    try {
      const file = selectedAudio.file;
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Step 1: Initialize temporary upload session for sync
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'audio/mpeg',
          totalSize: file.size,
          totalChunks,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || !initData.success || !initData.sessionId) {
        throw new Error(initData.message || 'Error al preparar sesión de sincronización.');
      }

      const sessionId = initData.sessionId;

      // Step 2: Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('chunkIndex', i.toString());
        formData.append('chunk', chunkBlob, `chunk_${i}.bin`);

        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        const chunkData = await chunkRes.json();
        if (!chunkRes.ok || !chunkData.success) {
          throw new Error(chunkData.message || `Error al subir el fragmento ${i + 1} de ${totalChunks}.`);
        }
      }

      // Step 3: Request forced alignment using the current edited lyrics as ground truth
      const syncRes = await fetch('/api/sync-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          lyrics: targetLyrics,
        }),
      });

      const syncData = await syncRes.json();

      if (!syncRes.ok || !syncData.success || !syncData.syncResult) {
        throw new Error(
          syncData.message ||
            'No se pudo sincronizar la letra con la canción. La transcripción y el PDF no deben verse afectados.'
        );
      }

      setSyncResult(syncData.syncResult);
      setSyncStatus('synced');
      setActiveTab('cantemos');
    } catch (err: any) {
      console.error('Lyric sync error:', err);
      setSyncError(
        err.message ||
          'No se pudo sincronizar la letra con la canción. La transcripción y el PDF no deben verse afectados.'
      );
      setSyncStatus('error');
    }
  };

  const handleOpenCantemos = () => {
    if (!selectedAudio || !transcribedLyrics.trim()) return;

    if (syncResult && syncResult.syncedLyricsText.trim() === transcribedLyrics.trim()) {
      setActiveTab('cantemos');
    } else {
      handlePerformSync();
    }
  };

  const hasAudioAndLyrics = !!selectedAudio && !!transcribedLyrics.trim() && status === 'completed';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Studio Header */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Section 1: File Upload */}
        <section id="upload-section" className="space-y-4">
          <FileUpload
            onFileSelected={handleFileSelected}
            selectedAudio={selectedAudio}
            onClear={handleClearAudio}
            disabled={status === 'transcribing' || syncStatus === 'syncing'}
          />
        </section>

        {/* Section 2: Audio Player & Action Bar (Visible after audio upload) */}
        {selectedAudio && (
          <section id="audio-player-section" className="space-y-4 animate-in fade-in duration-300">
            {/* Reproductor superior: visible únicamente antes de la transcripción/sincronización */}
            {status !== 'completed' && (
              <AudioPlayer audioInfo={selectedAudio} />
            )}

            {/* Action Triggers Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    {hasAudioAndLyrics ? 'Canción y Letra Listas' : 'Canción lista para procesar'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {hasAudioAndLyrics
                      ? 'Puedes cantar con la letra sincronizada o volver a transcribir'
                      : `El modelo analizará la pista vocal de "${selectedAudio.name}"`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                {/* TRANSCRIBIR LETRA BUTTON */}
                <button
                  type="button"
                  id="transcribe-button"
                  onClick={handleTranscribe}
                  disabled={status === 'transcribing' || syncStatus === 'syncing' || !selectedAudio}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all duration-150 ${
                    status === 'transcribing'
                      ? 'bg-amber-600/50 text-amber-200/60 cursor-not-allowed'
                      : hasAudioAndLyrics
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 active:scale-95'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {status === 'transcribing' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>TRANSCRIBIENDO...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{hasAudioAndLyrics ? 'RETRANSCRIBIR' : 'TRANSCRIBIR LETRA'}</span>
                    </>
                  )}
                </button>

                {/* CANTEMOS BUTTON */}
                <button
                  type="button"
                  id="main-cantemos-btn"
                  onClick={handleOpenCantemos}
                  disabled={!hasAudioAndLyrics || status === 'transcribing' || syncStatus === 'syncing'}
                  className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all duration-150 ${
                    !hasAudioAndLyrics || status === 'transcribing' || syncStatus === 'syncing'
                      ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {syncStatus === 'syncing' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>SINCRONIZANDO...</span>
                    </>
                  ) : (
                    <>
                      <Music className="w-4 h-4 fill-slate-950" />
                      <span>CANTEMOS</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Section 3: Transcription Loading Indicator */}
        {status === 'transcribing' && (
          <section id="loading-section" className="animate-in fade-in duration-200">
            <TranscriptionLoading />
          </section>
        )}

        {/* Section 4: Transcription Error Display */}
        {error && (
          <section
            id="error-section"
            className="p-5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 space-y-2 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <h4 className="text-sm font-semibold text-rose-100">
                {error.code === 'file_too_large' && 'Archivo Demasiado Grande'}
                {error.code === 'unsupported_file' && 'Formato No Compatible'}
                {error.code === 'upload_error' && 'Error al Cargar Archivo'}
                {error.code === 'empty_transcription' && 'Letra No Detectada'}
                {error.code === 'network_error' && 'Error de Conexión'}
                {error.code === 'gemini_error' && 'Error en el Procesamiento'}
                {!['file_too_large', 'unsupported_file', 'upload_error', 'empty_transcription', 'network_error', 'gemini_error'].includes(
                  error.code || ''
                ) && 'No se pudo completar la transcripción'}
              </h4>
            </div>
            <p className="text-xs sm:text-sm text-rose-200/90 pl-7 leading-relaxed">
              {error.message}
            </p>
            {error.details && (
              <p className="text-[11px] font-mono text-rose-400/80 pl-7 pt-1">
                Detalles: {error.details}
              </p>
            )}
            <div className="pl-7 pt-2">
              <button
                type="button"
                onClick={handleTranscribe}
                className="px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold border border-rose-500/30 transition-colors"
              >
                Reintentar transcripción
              </button>
            </div>
          </section>
        )}

        {/* Section 4.1: Sync Error Notice (does not affect transcription or PDF) */}
        {syncError && (
          <section
            id="sync-error-section"
            className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 space-y-2 animate-in fade-in duration-200 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-sm font-semibold text-amber-100">Aviso de Sincronización</h5>
                <p className="text-xs text-amber-200/90 leading-relaxed mt-0.5">{syncError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePerformSync}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all active:scale-95"
            >
              Reintentar
            </button>
          </section>
        )}

        {/* Section 5: Lyrics & CANTEMOS Area */}
        {status === 'completed' && transcribedLyrics && (
          <section id="lyrics-section" className="space-y-4 animate-in fade-in duration-300">
            {/* View Switcher Tabs (oculto en la etapa de CANTEMOS/Sincronización) */}
            {activeTab !== 'cantemos' && syncResult && (
              <div className="flex items-center justify-center p-1 rounded-xl bg-slate-900 border border-slate-800 max-w-sm mx-auto">
                <button
                  type="button"
                  id="tab-lyrics-btn"
                  onClick={() => setActiveTab('lyrics')}
                  disabled={syncStatus === 'syncing'}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'lyrics'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200 disabled:opacity-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>LETRA &bull; PDF</span>
                </button>
                {/* Botón CANTEMOS secundario junto a LETRA · PDF: oculto tras finalizar la transcripción/sincronización */}
                {status !== 'completed' && (
                  <button
                    type="button"
                    id="tab-cantemos-btn"
                    onClick={() => setActiveTab('cantemos')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                      activeTab === 'cantemos'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5" />
                    <span>CANTEMOS</span>
                  </button>
                )}
              </div>
            )}

            {/* If in CANTEMOS mode and currently syncing: show ONLY sync state (hide unsynchronized lyrics) */}
            {activeTab === 'cantemos' && syncStatus === 'syncing' ? (
              <div
                id="cantemos-syncing-screen"
                className="p-8 sm:p-12 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/30 text-center space-y-5 shadow-2xl animate-in fade-in duration-300"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400 shadow-inner">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Music className="w-3.5 h-3.5" />
                    CANTEMOS
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Sincronizando la letra con el audio...
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Alineando temporalmente cada palabra cantada con la pista musical sin alterar la transcripción.
                  </p>
                </div>
              </div>
            ) : activeTab === 'cantemos' && syncResult && selectedAudio ? (
              /* If in CANTEMOS mode and sync complete: show SyncedLyricsPlayer */
              <SyncedLyricsPlayer
                audioInfo={selectedAudio}
                syncResult={syncResult}
                currentLyrics={transcribedLyrics}
                songTitle={selectedAudio.name}
                isSyncing={syncStatus === 'syncing'}
                onReSync={handlePerformSync}
                onClose={() => setActiveTab('lyrics')}
              />
            ) : (
              /* Normal Transcription & Lyrics Editing View */
              <LyricsDisplay
                lyrics={transcribedLyrics}
                originalLyrics={originalTranscribedLyrics}
                songTitle={selectedAudio?.name}
                isSyncing={syncStatus === 'syncing'}
                onCantemos={handleOpenCantemos}
                onChange={(updated) => {
                  setTranscribedLyrics(updated);
                }}
                onResetToOriginal={handleResetLyrics}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

