import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import {
  Copy,
  Download,
  Check,
  Edit3,
  FileText,
  RotateCcw,
  FileDown,
} from 'lucide-react';

interface LyricsDisplayProps {
  lyrics: string;
  originalLyrics: string;
  songTitle?: string;
  onChange: (updated: string) => void;
  onResetToOriginal?: () => void;
}

export const LyricsDisplay: React.FC<LyricsDisplayProps> = ({
  lyrics,
  originalLyrics,
  songTitle = 'cancion',
  onChange,
  onResetToOriginal,
}) => {
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lyrics);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy lyrics:', err);
    }
  };

  const handleDownloadTxt = () => {
    const cleanFileName = songTitle
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .toLowerCase();

    const blob = new Blob([lyrics], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanFileName || 'letra'}_letra.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const rawSongName = songTitle ? songTitle.replace(/\.[^/.]+$/, '').trim() : '';
    const cleanFileName = rawSongName
      ? rawSongName.replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ]/g, '-').replace(/-+/g, '-').toLowerCase()
      : '';
    const outputFileName = cleanFileName ? `${cleanFileName}-lyrics.pdf` : 'lyrics.pdf';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm for A4
    const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm for A4
    const marginTop = 25;
    const marginBottom = 25;
    const marginLeft = 25;
    const marginRight = 25;
    const maxLineWidth = pageWidth - marginLeft - marginRight; // 160 mm

    const fontSize = 12;
    const lineSpacing = 7; // 7 mm per line
    const stanzaSpacing = 12; // 12 mm between stanzas

    let cursorY = marginTop;

    // Optional song title header
    if (rawSongName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      const titleLines = doc.splitTextToSize(rawSongName, maxLineWidth);
      doc.text(titleLines, marginLeft, cursorY);
      cursorY += titleLines.length * 6 + 4;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
      cursorY += 8;
    }

    // Lyrics Body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 41, 59);

    const rawLines = lyrics.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      if (rawLine.trim() === '') {
        // Blank line between stanzas
        cursorY += stanzaSpacing;
      } else {
        const wrappedSublines = doc.splitTextToSize(rawLine, maxLineWidth);
        for (const subline of wrappedSublines) {
          if (cursorY + lineSpacing > pageHeight - marginBottom) {
            doc.addPage();
            cursorY = marginTop;
          }
          doc.text(subline, marginLeft, cursorY);
          cursorY += lineSpacing;
        }
      }

      if (cursorY > pageHeight - marginBottom) {
        doc.addPage();
        cursorY = marginTop;
      }
    }

    doc.save(outputFileName);
  };

  const lineCount = lyrics.split('\n').filter((l) => l.trim().length > 0).length;
  const wordCount = lyrics.trim() ? lyrics.trim().split(/\s+/).length : 0;
  const isEdited = lyrics !== originalLyrics;

  const fontClass = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-loose',
  }[fontSize];

  return (
    <div
      id="lyrics-display-container"
      className="w-full rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col shadow-2xl overflow-hidden backdrop-blur-md"
    >
      {/* Top Header Bar */}
      <div className="border-b border-slate-800/80 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-950/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold tracking-tight text-slate-100 uppercase">
              LETRA
            </h2>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700/60">
            {lineCount} líneas &bull; {wordCount} palabras
          </span>
          {isEdited && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20">
              Editado
            </span>
          )}
        </div>

        {/* Action Controls: Zoom, Reset, Copy, Download TXT/PDF */}
        {lyrics.trim() !== '' && (
          <div id="lyrics-action-controls-bar" className="flex flex-wrap items-center gap-2">
            {/* Font Zoom Controls */}
            <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60">
              <button
                type="button"
                onClick={() => setFontSize('sm')}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  fontSize === 'sm' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Texto pequeño"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontSize('base')}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  fontSize === 'base' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Texto normal"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setFontSize('lg')}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  fontSize === 'lg' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Texto grande"
              >
                A+
              </button>
            </div>

            {/* Reset button if edited */}
            {isEdited && onResetToOriginal && (
              <button
                type="button"
                id="reset-lyrics-btn"
                onClick={onResetToOriginal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                title="Restaurar transcripción original"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Restaurar</span>
              </button>
            )}

            {/* COPIAR LETRA BUTTON */}
            <button
              type="button"
              id="copy-lyrics-btn"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-150 ${
                copied
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>COPIADO</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-400" />
                  <span>COPIAR LETRA</span>
                </>
              )}
            </button>

            {/* DESCARGAR TXT BUTTON */}
            <button
              type="button"
              id="download-txt-lyrics-btn"
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600 shadow-md transition-all active:scale-95"
              title="Descargar en formato texto plano (.txt)"
            >
              <FileDown className="w-4 h-4 text-amber-400" />
              <span>TXT</span>
            </button>

            {/* DESCARGAR PDF BUTTON */}
            <button
              type="button"
              id="download-lyrics-btn"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600 shadow-md transition-all active:scale-95"
              title="Descargar en formato documento PDF"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Editable Structured Lyrics Area */}
      <div className="relative p-4 sm:p-6 bg-slate-950/40 min-h-[320px] max-h-[560px] overflow-y-auto">
        <textarea
          ref={textareaRef}
          id="lyrics-textarea"
          value={lyrics}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Aquí aparecerá la transcripción exacta de la letra cantada estructurada por versos y estrofas..."
          rows={Math.max(14, lyrics.split('\n').length + 2)}
          className={`w-full bg-transparent border-0 text-slate-100 placeholder-slate-600 font-sans ${fontClass} focus:outline-none focus:ring-0 resize-none whitespace-pre-wrap selection:bg-amber-500 selection:text-slate-950`}
          spellCheck={false}
        />
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800/80 px-4 sm:px-6 py-2.5 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Edit3 className="w-3.5 h-3.5 text-amber-400/80" />
          Estructura de letra profesional. Haz clic en el texto para editar o corregir cualquier palabra.
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          Formatos: TXT &bull; PDF
        </span>
      </div>
    </div>
  );
};

