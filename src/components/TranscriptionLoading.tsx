import React, { useState, useEffect } from 'react';
import { Sparkles, Mic, Radio, Music2 } from 'lucide-react';

export const TranscriptionLoading: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    'Procesando archivo de audio...',
    'Separando pista vocal de instrumentales...',
    'Analizando fonética y palabras cantadas...',
    'Estructurando versos, estribillos y coros...',
    'Finalizando transcripción exacta...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      id="transcription-loading-card"
      className="w-full rounded-xl bg-slate-900/95 border border-amber-500/30 p-8 sm:p-10 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-md"
    >
      {/* Background ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Central Audio Processing Waveform Graphic */}
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
          <Mic className="w-9 h-9 animate-pulse" />
        </div>
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-slate-900"></span>
        </span>
      </div>

      {/* Animated Audio Equalizer Waveform */}
      <div className="flex items-center justify-center gap-1.5 h-10 w-full max-w-xs px-4">
        {[25, 60, 90, 45, 100, 75, 30, 85, 95, 40, 70, 90, 60, 35, 80, 50].map((h, index) => (
          <div
            key={index}
            className="w-1.5 bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 rounded-full"
            style={{
              height: `${h}%`,
              animation: `bounceWave 1.2s ease-in-out infinite alternate`,
              animationDelay: `${index * 0.08}s`,
            }}
          />
        ))}
      </div>

      {/* Title & Message */}
      <div className="space-y-2 max-w-md">
        <h3 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          Analizando la canción y transcribiendo la letra...
        </h3>
        <p className="text-xs text-amber-400/80 font-mono tracking-wide">
          {steps[activeStep]}
        </p>
        <p className="text-xs text-slate-400 leading-relaxed pt-1">
          Identificando palabras exactas cantadas por la voz principal.
        </p>
      </div>

      <style>{`
        @keyframes bounceWave {
          0% { height: 15%; opacity: 0.4; }
          100% { height: 95%; opacity: 1; }
        }
      `}</style>
    </div>
  );
};
