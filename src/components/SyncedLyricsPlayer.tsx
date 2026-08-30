import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  Sliders,
  Music2,
  ChevronUp,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { AudioFileInfo, SyncResult, SyncedWord, SyncedLine, LyricLine } from '../types';

interface SyncedLyricsPlayerProps {
  audioInfo: AudioFileInfo;
  syncResult: SyncResult;
  currentLyrics: string;
  songTitle?: string;
  isSyncing?: boolean;
  onReSync: () => void;
  onClose?: () => void;
}

export const SyncedLyricsPlayer: React.FC<SyncedLyricsPlayerProps> = ({
  audioInfo,
  syncResult,
  currentLyrics,
  songTitle,
  isSyncing = false,
  onReSync,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(syncResult.durationSeconds || 0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('large');

  // Check if lyrics were modified after sync
  const isLyricsOutdated = useMemo(() => {
    return currentLyrics.trim() !== syncResult.syncedLyricsText.trim();
  }, [currentLyrics, syncResult.syncedLyricsText]);

  // Group existing SyncedWord objects into structured LyricLine[] presentation models
  const linesToRender = useMemo<LyricLine[]>(() => {
    // Priority 1: Reuse pre-built lines if they were explicitly provided with words
    if (syncResult.lines && syncResult.lines.length > 0 && syncResult.lines.some((l) => l.words && l.words.length > 0)) {
      return syncResult.lines.map((l, idx) => {
        const prevLine = idx > 0 ? syncResult.lines![idx - 1] : null;
        const pause = prevLine ? Math.max(0, l.start - prevLine.end) : 0;
        return {
          words: l.words,
          start: l.start,
          end: l.end,
          lineIndex: l.lineIndex ?? idx,
          text: l.text,
          sectionBreak: idx === 0 ? false : pause >= 1.6,
        };
      });
    }

    // Priority 2 & 3: Group existing SyncedWord collection into presentation-only LyricLine[]
    if (syncResult.words && syncResult.words.length > 0) {
      const words = syncResult.words;

      // Check if words already have distinct multi-line index groupings from existing alignment
      const uniqueLineIndices = new Set(words.map((w) => w.lineIndex).filter((idx) => typeof idx === 'number'));
      if (uniqueLineIndices.size > 1) {
        const lineGroups = new Map<number, SyncedWord[]>();
        for (const w of words) {
          const lIdx = typeof w.lineIndex === 'number' ? w.lineIndex : 0;
          if (!lineGroups.has(lIdx)) {
            lineGroups.set(lIdx, []);
          }
          lineGroups.get(lIdx)!.push(w);
        }

        const sortedKeys = Array.from(lineGroups.keys()).sort((a, b) => a - b);
        const structuredLines: LyricLine[] = [];

        sortedKeys.forEach((key, kIdx) => {
          const lineWords = lineGroups.get(key)!;
          if (lineWords.length === 0) return;

          const start = lineWords[0].start;
          const end = lineWords[lineWords.length - 1].end;
          const text = lineWords.map((cw) => cw.word).join(' ');

          const prevLine = structuredLines.length > 0 ? structuredLines[structuredLines.length - 1] : null;
          const pause = prevLine ? Math.max(0, start - prevLine.end) : 0;
          const hasIndexGap = prevLine && key > sortedKeys[kIdx - 1] + 1;
          const sectionBreak = structuredLines.length === 0 ? false : pause >= 1.6 || !!hasIndexGap;

          structuredLines.push({
            words: lineWords,
            start,
            end,
            sectionBreak,
            lineIndex: structuredLines.length,
            text,
          });
        });

        if (structuredLines.length > 0) {
          return structuredLines;
        }
      }

      // Priority 3: Create presentation-only phrase groups from the existing ordered SyncedWord stream based on natural sung phrase boundaries
      const structuredLines: LyricLine[] = [];
      let currentLineWords: SyncedWord[] = [];
      let wasNewSection = false;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const nextWord = i < words.length - 1 ? words[i + 1] : null;
        const pause = nextWord ? Math.max(0, nextWord.start - w.end) : 0;

        currentLineWords.push(w);

        const cleanWord = w.word.trim();
        const isLastWord = i === words.length - 1;
        const hasSentencePunctuation = /[.!?…¿¡]$/.test(cleanWord);
        const hasPhrasePunctuation = /[,;:\-—"]$/.test(cleanWord);

        // Musical phrase boundary indicators
        const isSectionPause = pause >= 1.6; // Clear boundary between stanzas/sections
        const isVocalRestPause = pause >= 0.45; // Singer breathing / musical rest between phrases
        const isPunctuatedSentencePause = hasSentencePunctuation && (pause >= 0.2 || currentLineWords.length >= 3);
        const isPunctuatedPhrasePause = hasPhrasePunctuation && (pause >= 0.25 || currentLineWords.length >= 4);
        const isLineCadenceLength = currentLineWords.length >= 6 && pause >= 0.22;
        const isPhraseLimit = currentLineWords.length >= 8 && (pause >= 0.15 || hasPhrasePunctuation);
        const isHardPhraseLimit = currentLineWords.length >= 10; // Cap at natural lyric line length

        const shouldBreak =
          isLastWord ||
          isSectionPause ||
          isVocalRestPause ||
          isPunctuatedSentencePause ||
          isPunctuatedPhrasePause ||
          isLineCadenceLength ||
          isPhraseLimit ||
          isHardPhraseLimit;

        if (shouldBreak) {
          const start = currentLineWords[0].start;
          const end = currentLineWords[currentLineWords.length - 1].end;
          const text = currentLineWords.map((cw) => cw.word).join(' ');

          structuredLines.push({
            words: [...currentLineWords],
            start,
            end,
            sectionBreak: structuredLines.length === 0 ? false : wasNewSection,
            lineIndex: structuredLines.length,
            text,
          });

          currentLineWords = [];
          wasNewSection = isSectionPause;
        }
      }

      return structuredLines;
    }

    // Fallback: build lines from raw currentLyrics if no word timestamps are available
    const rawLines = currentLyrics.split('\n');
    const result: LyricLine[] = [];
    let isNextSection = false;

    for (let idx = 0; idx < rawLines.length; idx++) {
      const raw = rawLines[idx].trim();
      if (!raw) {
        isNextSection = true;
        continue;
      }
      result.push({
        words: [],
        start: idx * 3,
        end: (idx + 1) * 3,
        sectionBreak: isNextSection,
        lineIndex: result.length,
        text: raw,
      });
      isNextSection = false;
    }

    return result;
  }, [syncResult, currentLyrics]);

  // Determine active word and active line with strict acoustic timestamp boundaries
  const { activeWordIndex, activeLineIndex } = useMemo(() => {
    if (!syncResult.words || syncResult.words.length === 0) {
      for (let j = 0; j < linesToRender.length; j++) {
        const l = linesToRender[j];
        if (currentTime >= l.start && currentTime <= l.end) {
          return { activeWordIndex: -1, activeLineIndex: j };
        }
      }
      return { activeWordIndex: -1, activeLineIndex: -1 };
    }

    let foundWordIdx = -1;
    for (let i = 0; i < syncResult.words.length; i++) {
      const w = syncResult.words[i];
      if (currentTime >= w.start && currentTime < w.end) {
        foundWordIdx = i;
        break;
      }
    }

    let foundLineIdx = -1;
    if (foundWordIdx !== -1) {
      const activeWord = syncResult.words[foundWordIdx];
      for (let j = 0; j < linesToRender.length; j++) {
        if (
          linesToRender[j].words &&
          linesToRender[j].words.some(
            (w) => w === activeWord || (w.start === activeWord.start && w.end === activeWord.end && w.word === activeWord.word)
          )
        ) {
          foundLineIdx = j;
          break;
        }
      }
    }

    if (foundLineIdx === -1) {
      for (let j = 0; j < linesToRender.length; j++) {
        const l = linesToRender[j];
        if (currentTime >= l.start && currentTime <= l.end) {
          foundLineIdx = j;
          break;
        }
      }
    }

    return { activeWordIndex: foundWordIdx, activeLineIndex: foundLineIdx };
  }, [currentTime, syncResult.words, linesToRender]);

  // Audio animation loop strictly synced with audio.currentTime via requestAnimationFrame
  useEffect(() => {
    let animationFrameId: number;

    const updatePlayhead = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      if (isPlaying) {
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying]);

  // Audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioInfo.url]);

  // Auto-scroll when active line changes
  useEffect(() => {
    if (!autoScroll || activeLineIndex === -1 || !scrollContainerRef.current) return;

    const activeEl = activeLineRef.current;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, autoScroll]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => console.warn('Audio playback error:', err));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleSeekToTimestamp = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, time);
      setCurrentTime(time);
      if (!isPlaying) {
        audioRef.current.play().catch((err) => console.warn('Play error:', err));
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play().catch((err) => console.warn('Play error:', err));
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="cantemos-player-container"
      className="w-full rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/30 shadow-2xl overflow-hidden animate-in fade-in duration-300"
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioInfo.url}
        preload="auto"
      />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
            <Music2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-amber-400 uppercase">
                CANTEMOS &bull; Sincronización en Vivo
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Alineado
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-xs sm:max-w-md">
              {songTitle || audioInfo.name}
            </h3>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="cantemos-play-btn"
            onClick={togglePlay}
            title={isPlaying ? 'Pausar reproducción' : 'Iniciar reproducción'}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-slate-950" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-slate-950 translate-x-0.5" />
            )}
            <span>{isPlaying ? 'PAUSA' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            onClick={onReSync}
            disabled={isSyncing}
            title="Volver a sincronizar la letra con el audio"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">SINCRONIZAR LETRA</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {/* Warning banner when lyrics were edited after alignment */}
      {isLyricsOutdated && (
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              La letra fue modificada. Vuelve a sincronizar para actualizar los tiempos de cada palabra.
            </span>
          </div>
          <button
            type="button"
            onClick={onReSync}
            disabled={isSyncing}
            className="shrink-0 px-2.5 py-1 rounded bg-amber-500 text-slate-950 text-[11px] font-bold uppercase tracking-wider hover:bg-amber-400 active:scale-95 transition-all"
          >
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      )}

      {/* Main Karaoke Lyrics Viewport */}
      <div className="relative w-full max-w-[760px] mx-auto overflow-hidden">
        {/* Soft edge gradient fades for professional karaoke depth */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-900 via-slate-900/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent z-10" />

        <div
          ref={scrollContainerRef}
          id="karaoke-lyrics-viewport"
          className="relative h-[420px] sm:h-[460px] overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-36 sm:py-44 scroll-smooth focus:outline-none select-none"
          tabIndex={0}
        >
          {linesToRender.map((line, lIdx) => {
            const isLineActive = line.lineIndex === activeLineIndex;
            const isLinePast = line.lineIndex < activeLineIndex || (activeLineIndex === -1 && line.end < currentTime);
            const isBlankLine = !line.text || line.text.trim() === '';

            if (isBlankLine) {
              return <div key={`blank-${lIdx}`} className="h-6 sm:h-8" />;
            }

            return (
              <React.Fragment key={`line-frag-${lIdx}`}>
                {/* Section Spacing & Subtle Musical Divider for lyrical section transitions */}
                {line.sectionBreak && lIdx > 0 && (
                  <div key={`section-gap-${lIdx}`} className="pt-6 sm:pt-8 pb-3 mb-[32px] flex items-center justify-center">
                    <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent rounded-full" />
                  </div>
                )}

                {/* Individual Lyric Line Container */}
                <div
                  key={`line-${lIdx}`}
                  ref={isLineActive ? activeLineRef : null}
                  onClick={() => handleSeekToTimestamp(line.start)}
                  role="group"
                  aria-label={`Línea ${lIdx + 1}`}
                  className={`group block w-full max-w-[760px] mx-auto text-center mb-[12px] ${line.sectionBreak ? 'mt-[32px]' : ''} leading-[1.4] py-2 sm:py-3 cursor-pointer transition-all duration-300 ${
                    isLineActive
                      ? 'opacity-100 scale-[1.06] z-10 font-bold'
                      : isLinePast
                      ? 'opacity-[0.40] scale-[0.97] hover:opacity-65'
                      : 'opacity-[0.58] scale-[0.98] hover:opacity-80'
                  }`}
                >
                  <div
                    className={`w-full max-w-[760px] mx-auto flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1 text-center transition-all duration-200 ${
                      fontSize === 'normal'
                        ? 'text-lg sm:text-xl md:text-2xl'
                        : fontSize === 'large'
                        ? 'text-xl sm:text-2xl md:text-3xl lg:text-[34px]'
                        : 'text-2xl sm:text-3xl md:text-4xl lg:text-[38px]'
                    }`}
                  >
                    {line.words && line.words.length > 0 ? (
                      line.words.map((w, wIdx) => {
                        const isWordActive = currentTime >= w.start && currentTime < w.end;
                        const isWordCompleted = currentTime >= w.end;

                        return (
                          <span
                            key={`w-${lIdx}-${wIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSeekToTimestamp(w.start);
                            }}
                            className={`transition-all duration-150 inline-block px-1 py-0.5 rounded ${
                              isWordActive
                                ? 'text-amber-300 font-extrabold scale-[1.08] drop-shadow-[0_0_16px_rgba(245,158,11,0.6)]'
                                : isWordCompleted
                                ? isLineActive
                                  ? 'text-amber-100 font-bold opacity-95'
                                  : 'text-slate-300 font-medium'
                                : isLineActive
                                ? 'text-slate-300 font-medium opacity-80'
                                : 'text-slate-400 font-normal'
                            }`}
                          >
                            {w.word}
                          </span>
                        );
                      })
                    ) : (
                      <span
                        className={`transition-colors duration-200 ${
                          isLineActive
                            ? 'text-amber-300 font-extrabold drop-shadow-[0_0_14px_rgba(245,158,11,0.5)]'
                            : isLinePast
                            ? 'text-slate-400 font-medium'
                            : 'text-slate-300 font-medium'
                        }`}
                      >
                        {line.text}
                      </span>
                    )}
                  </div>
                </div>

                {/* Instrumental break indicator when musical pause between lines is >= 2.5 seconds */}
                {(() => {
                  const nextNonEmptyLine = linesToRender.slice(lIdx + 1).find((nl) => nl.text && nl.text.trim());
                  if (nextNonEmptyLine && nextNonEmptyLine.start - line.end >= 2.5) {
                    const isInterludeActive = currentTime > line.end && currentTime < nextNonEmptyLine.start;
                    return (
                      <div
                        key={`interlude-${lIdx}`}
                        className={`flex items-center justify-center py-2.5 transition-all duration-300 ${
                          isInterludeActive ? 'opacity-100 scale-100' : 'opacity-40'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all ${
                            isInterludeActive
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse'
                              : 'text-slate-500 bg-slate-900/60 border border-slate-800/80'
                          }`}
                        >
                          <Music2 className="w-3.5 h-3.5" />
                          <span>Solo Instrumental ({Math.max(1, Math.round(nextNonEmptyLine.start - line.end))}s)</span>
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Player Controls Dock */}
      <div className="bg-slate-950/95 border-t border-slate-800/90 px-5 sm:px-7 py-4 space-y-3">
        {/* Progress Bar and Timers */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="text-amber-400 font-semibold">{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="relative flex items-center group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 rounded-lg bg-slate-800 appearance-none cursor-pointer accent-amber-400 focus:outline-none"
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${(currentTime / (duration || 1)) * 100}%, #1e293b ${(currentTime / (duration || 1)) * 100}%, #1e293b 100%)`,
              }}
            />
          </div>
        </div>

        {/* Buttons and Volume Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Left: Secondary toggles (Font, Auto-scroll) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Desactivar auto-scroll' : 'Activar auto-scroll'}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                autoScroll
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (fontSize === 'normal') setFontSize('large');
                else if (fontSize === 'large') setFontSize('xlarge');
                else setFontSize('normal');
              }}
              title="Cambiar tamaño de letra"
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              Texto: {fontSize === 'normal' ? 'Normal' : fontSize === 'large' ? 'Grande' : 'XL'}
            </button>
          </div>

          {/* Center: Playback Transport Controls */}
          <div className="flex items-center gap-2 sm:gap-3 mx-auto">
            <button
              type="button"
              onClick={handleRestart}
              title="Reiniciar canción"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 hover:bg-slate-800/80 active:scale-95 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>
          </div>

          {/* Right: Speed & Volume */}
          <div className="flex items-center gap-3">
            {/* Playback speed selector */}
            <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
              {[0.75, 1.0, 1.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleRateChange(rate)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    playbackRate === rate
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Volume */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="text-slate-400 hover:text-slate-200"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1.5 bg-slate-800 rounded appearance-none accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Tip */}
        <p className="text-[11px] text-center text-slate-500">
          Haz clic en cualquier palabra o verso para saltar directamente a ese momento de la canción.
        </p>
      </div>
    </div>
  );
};
