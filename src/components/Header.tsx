import React from 'react';
import { Mic2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 pb-[2.15rem] pt-[calc(2.15rem+env(safe-area-inset-top,0px))]">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
            <Mic2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              VCL Letra y Canto Sync
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Transcripción y sincronización vocal en tiempo real
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

