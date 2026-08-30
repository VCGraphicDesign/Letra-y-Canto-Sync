import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI, createPartFromUri } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);

dotenv.config();

const app = express();
const PORT = 3000;

// Setup CORS to allow cross-origin requests from Vercel frontends, Android Capacitor APKs, and local clients
const configuredOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile native calls, curl, background tasks)
      if (!origin) return callback(null, true);

      // Explicitly allow Capacitor, localhost, Vercel, and Cloud Run origins
      if (
        origin === 'capacitor://localhost' ||
        origin === 'ionic://localhost' ||
        origin === 'https://localhost' ||
        origin === 'http://localhost' ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.run.app') ||
        origin.endsWith('.aistudio.google.com') ||
        (configuredOrigin && (configuredOrigin === '*' || origin === configuredOrigin))
      ) {
        return callback(null, true);
      }

      // Default permissive callback for mobile / web app connectivity
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
  })
);

// Explicit preflight OPTIONS handler for all endpoints
app.options('*', cors());

// Setup multer memory storage for chunk uploads
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per chunk limit (chunks are typically 2-4MB)
  },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/webm',
]);

const ACCEPTED_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.mp4',
  '.webm',
]);

function getNormalizedMimeType(originalMime: string, originalName: string): string {
  if (originalMime && ACCEPTED_MIME_TYPES.has(originalMime.toLowerCase())) {
    const lower = originalMime.toLowerCase();
    if (lower === 'audio/x-wav' || lower === 'audio/wave') return 'audio/wav';
    if (lower === 'audio/x-m4a') return 'audio/mp4';
    if (lower === 'audio/x-flac') return 'audio/flac';
    return lower;
  }
  const ext = path.extname(originalName).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.ogg': return 'audio/ogg';
    case '.flac': return 'audio/flac';
    case '.mp4': return 'audio/mp4';
    case '.webm': return 'audio/webm';
    default: return originalMime || 'application/octet-stream';
  }
}

// Temporary upload sessions management
interface UploadSession {
  id: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  createdAt: number;
}

const uploadSessions = new Map<string, UploadSession>();
const SESSIONS_BASE_DIR = path.join(os.tmpdir(), 'lyric-sessions');

if (!fs.existsSync(SESSIONS_BASE_DIR)) {
  fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
}

function cleanSession(sessionId: string) {
  uploadSessions.delete(sessionId);
  const sessionDir = path.join(SESSIONS_BASE_DIR, sessionId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error cleaning session directory:', e);
    }
  }
}

// Periodic cleanup of stale sessions (> 30 minutes)
setInterval(() => {
  const now = Date.now();
  const TTL = 30 * 60 * 1000;
  for (const [id, session] of uploadSessions.entries()) {
    if (now - session.createdAt > TTL) {
      cleanSession(id);
    }
  }
}, 5 * 60 * 1000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Initialize chunked upload session
app.post('/api/upload/init', (req, res) => {
  try {
    const { filename, mimeType, totalSize, totalChunks } = req.body || {};

    if (!filename || typeof totalSize !== 'number' || typeof totalChunks !== 'number' || totalChunks <= 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_metadata',
        message: 'Metadatos de subida no válidos.',
      });
    }

    const normalizedMime = getNormalizedMimeType(mimeType || '', filename);
    const ext = path.extname(filename).toLowerCase();

    if (!ACCEPTED_MIME_TYPES.has(normalizedMime) && !ACCEPTED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        error: 'unsupported_file',
        message: 'El formato de audio no es compatible. Formatos aceptados: MP3, WAV, M4A, AAC, OGG, FLAC.',
      });
    }

    const sessionId = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_BASE_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    uploadSessions.set(sessionId, {
      id: sessionId,
      filename,
      mimeType: normalizedMime,
      totalSize,
      totalChunks,
      uploadedChunks: new Set<number>(),
      createdAt: Date.now(),
    });

    return res.json({
      success: true,
      sessionId,
    });
  } catch (err: any) {
    console.error('Error in /api/upload/init:', err);
    return res.status(500).json({
      success: false,
      error: 'init_error',
      message: 'No se pudo inicializar la subida de audio.',
    });
  }
});

// Upload individual binary chunk
app.post('/api/upload/chunk', chunkUpload.single('chunk') as any, (req, res) => {
  try {
    const { sessionId, chunkIndex } = req.body || {};
    const index = parseInt(chunkIndex, 10);
    const file = req.file;

    if (!sessionId || isNaN(index) || !file || !file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'invalid_chunk',
        message: 'Parámetros de fragmento no válidos.',
      });
    }

    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'session_not_found',
        message: 'La sesión de subida no existe o ha expirado.',
      });
    }

    if (index < 0 || index >= session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: 'invalid_chunk_index',
        message: 'Índice de fragmento fuera de rango.',
      });
    }

    const sessionDir = path.join(SESSIONS_BASE_DIR, sessionId);
    const chunkPath = path.join(sessionDir, `chunk_${index}`);
    fs.writeFileSync(chunkPath, file.buffer);

    session.uploadedChunks.add(index);

    return res.json({
      success: true,
      sessionId,
      chunkIndex: index,
      totalUploaded: session.uploadedChunks.size,
      totalChunks: session.totalChunks,
    });
  } catch (err: any) {
    console.error('Error in /api/upload/chunk:', err);
    return res.status(500).json({
      success: false,
      error: 'chunk_upload_error',
      message: 'Error al recibir el fragmento de audio.',
    });
  }
});

/**
 * Helper to parse status code, status text, and message from Gemini errors
 * including errors where error.message is a JSON string.
 */
function parseGeminiErrorInfo(error: any): {
  code: number | null;
  statusName: string;
  message: string;
  rawMessage: string;
} {
  let code: number | null = null;
  let statusName = '';
  let message = '';
  const rawMessage = String(error?.message || '');

  if (error) {
    if (typeof error.status === 'number') code = error.status;
    else if (typeof error.code === 'number') code = error.code;
    else if (typeof error.statusCode === 'number') code = error.statusCode;

    if (typeof error.status === 'string') statusName = error.status;
    else if (typeof error.statusName === 'string') statusName = error.statusName;

    if (typeof error.message === 'string') message = error.message;

    // Detect if error.message is a raw JSON string like {"error":{"code":503,"message":"..."}}
    if (rawMessage.trim().startsWith('{') && rawMessage.includes('"error"')) {
      try {
        const parsed = JSON.parse(rawMessage.trim());
        if (parsed.error) {
          if (typeof parsed.error.code === 'number') code = parsed.error.code;
          if (typeof parsed.error.status === 'string') statusName = parsed.error.status;
          if (typeof parsed.error.message === 'string') message = parsed.error.message;
        }
      } catch {
        // ignore parse error
      }
    }
  }

  return {
    code,
    statusName: statusName.toUpperCase(),
    message: message.toUpperCase(),
    rawMessage,
  };
}

/**
 * Helper to determine if a Gemini API error is transient and retryable.
 * Retryable status codes: 408, 429, 500, 502, 503, 504.
 * Retryable status names: UNAVAILABLE, RESOURCE_EXHAUSTED, INTERNAL, DEADLINE_EXCEEDED.
 */
function isRetryableGeminiError(error: any): boolean {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  const retryableCodes = [408, 429, 500, 502, 503, 504];
  if (info.code !== null && retryableCodes.includes(info.code)) {
    return true;
  }

  const retryableNames = [
    'UNAVAILABLE',
    'RESOURCE_EXHAUSTED',
    'INTERNAL',
    'DEADLINE_EXCEEDED',
    'FETCH_ERROR',
    'ECONNRESET',
    'ETIMEDOUT',
    'HIGH DEMAND',
  ];
  if (
    retryableNames.some(
      (name) => info.statusName.includes(name) || info.message.includes(name)
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the error is 503 or indicates high demand / service unavailable.
 */
function isOverloadedOrHighDemandError(error: any): boolean {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  if (info.code === 503 || info.code === 502 || info.code === 504) return true;
  return (
    info.statusName.includes('UNAVAILABLE') ||
    info.message.includes('HIGH DEMAND') ||
    info.message.includes('UNAVAILABLE')
  );
}

/**
 * Checks if the error is a quota exhaustion (429 or daily limit) for the specific model.
 * When true, retrying the same model will not succeed, so we immediately proceed to the next fallback model.
 */
function isDailyOrHardQuotaError(error: any): boolean {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  if (info.code === 429) return true;
  const lowerMsg = info.message.toLowerCase();
  const details = JSON.stringify(error.details || error.response || '').toLowerCase();
  return (
    info.statusName.includes('RESOURCE_EXHAUSTED') ||
    lowerMsg.includes('resource_exhausted') ||
    lowerMsg.includes('generaterequestsperday') ||
    lowerMsg.includes('free_tier_requests') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('limit: 20') ||
    details.includes('quotafailure') ||
    details.includes('generaterequestsperday') ||
    details.includes('resource_exhausted')
  );
}

/**
 * Calculates exponential backoff delay with jitter.
 * Formula: delay = min(maxDelayMs, baseDelayMs * 2^retryIndex) + random_jitter
 */
function calculateBackoffDelay(retryIndex: number, baseDelayMs = 800, maxDelayMs = 4000): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, retryIndex));
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(maxDelayMs, exponential) + jitter;
}

// Helper to convert audio to FLAC (16kHz, mono) using ffmpeg
async function convertAudioToFlac(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'flac',
    outputPath,
  ]);
}

// Helper to probe audio duration in seconds using ffprobe
async function getAudioDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch (err) {
    console.warn('[Audio Duration Probe Warning]:', err);
    return 0;
  }
}

// Helper to extract a FLAC chunk segment
async function extractAudioChunkFlac(
  inputFlacPath: string,
  outputChunkPath: string,
  startTimeSec: number,
  durationSec: number
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', startTimeSec.toString(),
    '-t', durationSec.toString(),
    '-i', inputFlacPath,
    '-c:a', 'flac',
    outputChunkPath,
  ]);
}

// Helper to call Groq Whisper API
async function callGroqWhisper(
  audioFilePath: string,
  groqApiKey: string,
  fileNameLabel: string
): Promise<{ text: string; words?: Array<{ word: string; start: number; end: number }>; segments?: Array<{ text: string; start: number; end: number }>; duration?: number }> {
  const audioBuffer = fs.readFileSync(audioFilePath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/flac' });

  const groqFormData = new FormData();
  groqFormData.append('file', audioBlob, fileNameLabel || 'audio.flac');
  groqFormData.append('model', 'whisper-large-v3');
  groqFormData.append('response_format', 'verbose_json');
  groqFormData.append('timestamp_granularities[]', 'word');
  groqFormData.append('timestamp_granularities[]', 'segment');
  groqFormData.append('temperature', '0');
  // NOTE: language parameter is intentionally omitted so Whisper automatically detects
  // and accurately transcribes Spanish, English, or bilingual Spanish/English content.

  const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: groqFormData,
  });

  if (!groqResponse.ok) {
    const errorBody = await groqResponse.text();
    let parsedError: any = null;
    try {
      parsedError = JSON.parse(errorBody);
    } catch (e) {
      // ignore
    }

    const statusCode = groqResponse.status;
    const err = new Error(parsedError?.error?.message || errorBody) as any;
    err.statusCode = statusCode;
    err.code = parsedError?.error?.code || 'GROQ_API_ERROR';
    throw err;
  }

  return (await groqResponse.json()) as any;
}

// Helper to format raw transcribed words and segments into professional song lyric lines and stanzas
function structureLyricsFromWhisper(
  words: Array<{ word: string; start: number; end: number }>,
  segments: Array<{ text: string; start: number; end: number }>,
  rawFallbackText: string
): {
  formattedLyrics: string;
  syncedWords: Array<{ word: string; start: number; end: number; lineIndex: number }>;
} {
  // If word-level timestamps are available, build precise musical phrase lines and stanzas
  if (Array.isArray(words) && words.length > 0) {
    const syncedWords: Array<{ word: string; start: number; end: number; lineIndex: number }> = [];
    const stanzas: string[][] = [];
    let currentLineWords: Array<{ word: string; start: number; end: number }> = [];
    let currentStanzaLines: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const currentWordObj = words[i];
      const wordStr = (currentWordObj.word || '').trim();
      if (!wordStr) continue;

      const nextWordObj = i < words.length - 1 ? words[i + 1] : null;
      const pause = nextWordObj ? Math.max(0, nextWordObj.start - currentWordObj.end) : 0;

      currentLineWords.push({
        word: wordStr,
        start: typeof currentWordObj.start === 'number' ? currentWordObj.start : 0,
        end: typeof currentWordObj.end === 'number' ? currentWordObj.end : 0,
      });

      const hasSentencePunctuation = /[.!?…¿¡]$/.test(wordStr);
      const hasPhrasePunctuation = /[,;:\-—"]$/.test(wordStr);

      const isLastWord = i === words.length - 1;
      const isSectionPause = pause >= 1.6; // Clear stanza break
      const isVocalRestPause = pause >= 0.45; // Vocal rest between phrases
      const isPunctuatedSentencePause = hasSentencePunctuation && (pause >= 0.2 || currentLineWords.length >= 3);
      const isPunctuatedPhrasePause = hasPhrasePunctuation && (pause >= 0.25 || currentLineWords.length >= 4);
      const isLineCadenceLength = currentLineWords.length >= 6 && pause >= 0.22;
      const isPhraseLimit = currentLineWords.length >= 8 && (pause >= 0.15 || hasPhrasePunctuation);
      const isHardPhraseLimit = currentLineWords.length >= 10;

      const shouldBreakLine =
        isLastWord ||
        isSectionPause ||
        isVocalRestPause ||
        isPunctuatedSentencePause ||
        isPunctuatedPhrasePause ||
        isLineCadenceLength ||
        isPhraseLimit ||
        isHardPhraseLimit;

      if (shouldBreakLine) {
        const lineText = currentLineWords.map((w) => w.word).join(' ');
        const lineIdx = stanzas.reduce((acc, s) => acc + s.length, 0) + currentStanzaLines.length;

        currentLineWords.forEach((cw) => {
          syncedWords.push({
            word: cw.word,
            start: Number(cw.start.toFixed(3)),
            end: Number(cw.end.toFixed(3)),
            lineIndex: lineIdx,
          });
        });

        currentStanzaLines.push(lineText);
        currentLineWords = [];

        if (isSectionPause || isLastWord) {
          if (currentStanzaLines.length > 0) {
            stanzas.push(currentStanzaLines);
            currentStanzaLines = [];
          }
        }
      }
    }

    if (currentStanzaLines.length > 0) {
      stanzas.push(currentStanzaLines);
    }

    const formattedLyrics = stanzas.map((stanza) => stanza.join('\n')).join('\n\n');

    return {
      formattedLyrics: formattedLyrics.trim(),
      syncedWords,
    };
  }

  // Fallback using segments if words are not available
  if (Array.isArray(segments) && segments.length > 0) {
    const stanzas: string[][] = [];
    let currentStanzaLines: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = (seg.text || '').trim();
      if (!text) continue;

      const nextSeg = i < segments.length - 1 ? segments[i + 1] : null;
      const pause = nextSeg ? Math.max(0, nextSeg.start - seg.end) : 0;

      currentStanzaLines.push(text);

      if (pause >= 1.6 || i === segments.length - 1) {
        if (currentStanzaLines.length > 0) {
          stanzas.push(currentStanzaLines);
          currentStanzaLines = [];
        }
      }
    }

    if (currentStanzaLines.length > 0) {
      stanzas.push(currentStanzaLines);
    }

    const formattedLyrics = stanzas.map((stanza) => stanza.join('\n')).join('\n\n');
    return {
      formattedLyrics: formattedLyrics.trim(),
      syncedWords: [],
    };
  }

  return {
    formattedLyrics: (rawFallbackText || '').trim(),
    syncedWords: [],
  };
}

// Transcription endpoint using Groq Whisper Large V3 Turbo with FLAC compression and chunking fallback
app.post('/api/transcribe', async (req, res) => {
  const { sessionId } = req.body || {};
  let sessionDir: string | null = null;

  try {
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'missing_session',
        message: 'Identificador de sesión de audio no proporcionado.',
      });
    }

    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'session_not_found',
        message: 'La sesión de subida no fue encontrada o ha expirado.',
      });
    }

    sessionDir = path.join(SESSIONS_BASE_DIR, sessionId);

    // Verify that all expected chunks are present
    if (session.uploadedChunks.size !== session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: 'incomplete_upload',
        message: `Faltan fragmentos por subir (${session.uploadedChunks.size}/${session.totalChunks}).`,
      });
    }

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({
          success: false,
          error: 'missing_chunk_file',
          message: `El fragmento ${i} no está presente en el servidor.`,
        });
      }
    }

    // Reconstruct the exact original audio file in ascending chunk-index order
    const safeName = path.basename(session.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const reconstructedPath = path.join(sessionDir, `reconstructed_${safeName}`);
    const writeStream = fs.createWriteStream(reconstructedPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
      try {
        fs.unlinkSync(chunkPath);
      } catch (e) {
        // ignore
      }
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({
        success: false,
        error: 'missing_api_key',
        message: 'La clave de API (GROQ_API_KEY) no está configurada en el servidor. Por favor configúrala en las variables de entorno.',
      });
    }

    // Step 1: Convert the reconstructed audio to FLAC (16kHz mono)
    const flacPath = path.join(sessionDir, `converted_${safeName}.flac`);
    try {
      await convertAudioToFlac(reconstructedPath, flacPath);
    } catch (conversionErr: any) {
      console.warn('[FLAC Conversion Warning, falling back to original]:', conversionErr);
      fs.copyFileSync(reconstructedPath, flacPath);
    }

    const flacStats = fs.statSync(flacPath);
    const GROQ_MAX_FILE_SIZE_BYTES = 24 * 1024 * 1024; // 24 MB safe threshold (Groq max is 25 MB)
    const totalDuration = await getAudioDurationSeconds(flacPath);

    let formattedLyrics = '';
    let syncedWords: Array<{ word: string; start: number; end: number; lineIndex: number }> = [];

    // Step 2: If FLAC file is within the limit, process complete file
    if (flacStats.size <= GROQ_MAX_FILE_SIZE_BYTES) {
      const groqData = await callGroqWhisper(flacPath, groqApiKey, `${safeName}.flac`);
      const rawText = (groqData?.text || '').trim();

      if (!rawText) {
        return res.status(422).json({
          success: false,
          error: 'empty_transcription',
          message: 'No se pudo detectar una letra en el audio con Groq Whisper.',
        });
      }

      const rawWords = Array.isArray(groqData.words) ? groqData.words : [];
      const rawSegments = Array.isArray(groqData.segments) ? groqData.segments : [];

      const structured = structureLyricsFromWhisper(rawWords, rawSegments, rawText);
      formattedLyrics = structured.formattedLyrics;
      syncedWords = structured.syncedWords;
    } else {
      // Step 3: FLAC file exceeds 24 MB -> Sequential Chunking Fallback
      console.log(`[Groq Transcription]: File size (${(flacStats.size / (1024 * 1024)).toFixed(2)} MB) exceeds 24 MB. Initiating automatic FLAC chunking...`);

      // Chunks of 300 seconds (5 minutes) each with 2-second overlap to prevent clipping boundary words
      const CHUNK_DURATION_SEC = 300;
      const OVERLAP_SEC = 2.0;
      const durationToUse = totalDuration > 0 ? totalDuration : Math.ceil(flacStats.size / 32000);
      const numChunks = Math.max(1, Math.ceil(durationToUse / CHUNK_DURATION_SEC));

      const accumulatedWords: Array<{ word: string; start: number; end: number }> = [];
      const accumulatedSegments: Array<{ text: string; start: number; end: number }> = [];
      const accumulatedRawTexts: string[] = [];

      for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const chunkOffset = chunkIdx > 0 ? Math.max(0, chunkIdx * CHUNK_DURATION_SEC - OVERLAP_SEC) : 0;
        const currentChunkDuration = Math.min(
          CHUNK_DURATION_SEC + (chunkIdx > 0 ? OVERLAP_SEC : 0),
          Math.max(1, durationToUse - chunkOffset)
        );
        const chunkFlacPath = path.join(sessionDir, `flac_chunk_${chunkIdx}.flac`);

        try {
          await extractAudioChunkFlac(flacPath, chunkFlacPath, chunkOffset, currentChunkDuration);
          const chunkData = await callGroqWhisper(chunkFlacPath, groqApiKey, `chunk_${chunkIdx}.flac`);

          if (chunkData.text) {
            accumulatedRawTexts.push(chunkData.text.trim());
          }

          if (Array.isArray(chunkData.segments) && chunkData.segments.length > 0) {
            for (const seg of chunkData.segments) {
              accumulatedSegments.push({
                text: (seg.text || '').trim(),
                start: chunkOffset + (typeof seg.start === 'number' ? seg.start : 0),
                end: chunkOffset + (typeof seg.end === 'number' ? seg.end : 0),
              });
            }
          }

          if (Array.isArray(chunkData.words) && chunkData.words.length > 0) {
            for (const w of chunkData.words) {
              const wordStr = (w.word || '').trim();
              if (!wordStr) continue;
              const relativeStart = typeof w.start === 'number' ? Math.max(0, w.start) : 0;
              const relativeEnd = typeof w.end === 'number' ? Math.max(relativeStart + 0.05, w.end) : relativeStart + 0.3;

              const globalStart = chunkOffset + relativeStart;
              const globalEnd = chunkOffset + relativeEnd;

              // Only deduplicate boundary-overlap duplicate words at the immediate chunk transition
              if (chunkIdx > 0 && globalStart <= chunkOffset + OVERLAP_SEC + 0.2) {
                const isBoundaryDuplicate = accumulatedWords.some(
                  (prevWord) =>
                    Math.abs(prevWord.start - globalStart) < 0.45 &&
                    prevWord.word.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, '') ===
                      wordStr.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, '')
                );
                if (isBoundaryDuplicate) {
                  continue;
                }
              }

              accumulatedWords.push({
                word: wordStr,
                start: globalStart,
                end: globalEnd,
              });
            }
          }
        } finally {
          try {
            if (fs.existsSync(chunkFlacPath)) {
              fs.unlinkSync(chunkFlacPath);
            }
          } catch (e) {
            // ignore
          }
        }
      }

      const structured = structureLyricsFromWhisper(
        accumulatedWords,
        accumulatedSegments,
        accumulatedRawTexts.join('\n')
      );
      formattedLyrics = structured.formattedLyrics;
      syncedWords = structured.syncedWords;
    }

    // Clean up temporary converted FLAC file if exists
    try {
      if (fs.existsSync(flacPath)) {
        fs.unlinkSync(flacPath);
      }
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      success: true,
      filename: session.filename,
      lyrics: formattedLyrics.trim(),
      words: syncedWords,
      duration: totalDuration > 0 ? totalDuration : undefined,
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const statusCode = error?.statusCode || (typeof error?.status === 'number' && error.status >= 400 && error.status <= 599 ? error.status : 500);
    let friendlyMessage = 'Ocurrió un error al procesar la transcripción con Groq Whisper.';
    if (statusCode === 401) {
      friendlyMessage = 'La clave de API de Groq (GROQ_API_KEY) es inválida o no tiene permisos.';
    } else if (statusCode === 429) {
      friendlyMessage = 'Se ha alcanzado el límite de velocidad o cuota de Groq. Por favor intenta de nuevo en unos segundos.';
    } else if (statusCode === 413) {
      friendlyMessage = 'El archivo de audio excede el límite de tamaño de Groq (25 MB).';
    }
    return res.status(statusCode).json({
      success: false,
      error: error?.code || 'GROQ_TRANSCRIPTION_ERROR',
      message: friendlyMessage,
      details: error?.message,
    });
  } finally {
    // Clean up temporary local session files
    if (sessionId) {
      cleanSession(sessionId);
    }
  }
});

// Sync Lyrics endpoint: forced alignment of audio against existing user lyrics
app.post('/api/sync-lyrics', async (req, res) => {
  const { sessionId, lyrics } = req.body || {};
  let uploadedGeminiFile: any = null;
  let sessionDir: string | null = null;

  try {
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'missing_session',
        message: 'Identificador de sesión de audio no proporcionado.',
      });
    }

    if (!lyrics || typeof lyrics !== 'string' || !lyrics.trim()) {
      return res.status(400).json({
        success: false,
        error: 'missing_lyrics',
        message: 'No se proporcionó la letra a sincronizar.',
      });
    }

    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'session_not_found',
        message: 'La sesión de subida no fue encontrada o ha expirado.',
      });
    }

    sessionDir = path.join(SESSIONS_BASE_DIR, sessionId);

    // Verify chunk files
    if (session.uploadedChunks.size !== session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: 'incomplete_upload',
        message: `Faltan fragmentos por subir (${session.uploadedChunks.size}/${session.totalChunks}).`,
      });
    }

    // Reconstruct audio file
    const safeName = path.basename(session.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const reconstructedPath = path.join(sessionDir, `sync_reconstructed_${safeName}`);
    const writeStream = fs.createWriteStream(reconstructedPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (fs.existsSync(chunkPath)) {
        const chunkBuffer = fs.readFileSync(chunkPath);
        writeStream.write(chunkBuffer);
        try {
          fs.unlinkSync(chunkPath);
        } catch (e) {
          // ignore
        }
      }
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'missing_api_key',
        message: 'La clave de API (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Upload reconstructed audio file to Gemini Files API
    const uploadResult = await ai.files.upload({
      file: reconstructedPath,
      mimeType: session.mimeType,
    } as any);
    uploadedGeminiFile = uploadResult;

    let fileState = uploadResult;
    let attempts = 0;
    while (fileState.state === 'PROCESSING' && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      fileState = await ai.files.get({ name: uploadResult.name });
      attempts++;
    }

    if (fileState.state === 'FAILED') {
      throw new Error('El procesamiento del archivo de audio para sincronización falló.');
    }

    const audioPartFromFile = fileState.uri
      ? {
          fileData: {
            fileUri: fileState.uri,
            mimeType: session.mimeType,
          },
        }
      : null;

    let base64FallbackPart: any = null;
    try {
      const stats = fs.statSync(reconstructedPath);
      if (stats.size <= 20 * 1024 * 1024) {
        const fileBuffer = fs.readFileSync(reconstructedPath);
        base64FallbackPart = {
          inlineData: {
            data: fileBuffer.toString('base64'),
            mimeType: session.mimeType,
          },
        };
      }
    } catch (e) {
      console.warn('Could not prepare inline base64 fallback for sync:', e);
    }

    const partsToTry: any[] = [];
    if (audioPartFromFile) partsToTry.push(audioPartFromFile);
    if (base64FallbackPart) partsToTry.push(base64FallbackPart);

    if (partsToTry.length === 0) {
      throw new Error('No se pudo preparar la pista de audio para análisis de sincronización.');
    }

    const formattedLyricsNumbered = lyrics
      .split('\n')
      .map((line, idx) => `[Line ${idx}]: ${line.trim()}`)
      .join('\n');

    const SYNC_PROMPT =
      `You are an expert audio forced-alignment engine for sung music.\n` +
      `Listen carefully to this audio recording and align it with the exact TARGET LYRICS provided below.\n\n` +
      `TARGET LYRICS (GROUND TRUTH):\n` +
      `"""\n${formattedLyricsNumbered}\n"""\n\n` +
      `YOUR TASK:\n` +
      `Identify the exact acoustic timestamps (in seconds with 2 decimal places, e.g. 14.85) for EVERY word and EVERY line in the target lyrics as sung in the recording.\n\n` +
      `CRITICAL RULES FOR PRECISE VOCAL TIMING & INSTRUMENTAL GAPS:\n` +
      `1. GROUND TRUTH: The target lyrics text is the absolute reference. Preserve every word and line index exactly.\n` +
      `2. REAL AUDIO TIMESTAMPS: Timestamps MUST correspond to the actual physical seconds in the audio when the vocalist sings each word.\n` +
      `3. INSTRUMENTAL PAUSES & INTERLUDES: Songs often have guitar solos, drum breaks, instrumental bridges, or silent intervals between verses. NEVER compress, estimate, or artificially fast-forward these intervals. If line N ends at 32.40s and line N+1 does not start until 48.70s after an instrumental break, line N+1's start MUST be 48.70s.\n` +
      `4. CHRONOLOGICAL INTEGRITY: All timestamps must be strictly non-decreasing.\n` +
      `5. Return ONLY a valid JSON object matching this schema:\n` +
      `{\n` +
      `  "durationSeconds": 210.5,\n` +
      `  "lines": [\n` +
      `    {\n` +
      `      "lineIndex": 0,\n` +
      `      "text": "line text",\n` +
      `      "start": 12.30,\n` +
      `      "end": 16.80\n` +
      `    }\n` +
      `  ],\n` +
      `  "words": [\n` +
      `    {\n` +
      `      "word": "Hello",\n` +
      `      "start": 12.30,\n` +
      `      "end": 12.75,\n` +
      `      "lineIndex": 0,\n` +
      `      "confidence": 0.95\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    let response: any = null;
    const candidateModels = [
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
    let lastError: any = null;

    for (const audioContentPart of partsToTry) {
      for (const modelName of candidateModels) {
        let attempt = 0;
        let success = false;
        const maxAttemptsForModel = 2;

        while (attempt < maxAttemptsForModel && !success) {
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents: [audioContentPart, { text: SYNC_PROMPT }],
              config: {
                systemInstruction:
                  'You are a high-precision vocal forced-alignment system for musical lyrics. Measure real acoustic singing timestamps for every word and line, faithfully respecting instrumental interludes and musical pauses.',
                responseMimeType: 'application/json',
              },
            });
            if (response && response.text) {
              console.log(`Sync alignment succeeded with model: ${modelName}`);
              success = true;
              break;
            }
          } catch (err: any) {
            lastError = err;
            const isHardQuota = isDailyOrHardQuotaError(err);
            const isOverloaded = isOverloadedOrHighDemandError(err);
            const isTransient = isRetryableGeminiError(err);
            const errInfo = parseGeminiErrorInfo(err);

            if (isHardQuota) {
              console.warn(
                `[Sync Quota Fallback] Model ${modelName} reached quota limit. Trying next candidate model immediately...`
              );
              break;
            }

            if (isOverloaded) {
              if (attempt === 0) {
                const delay = calculateBackoffDelay(0, 600, 1200);
                console.warn(
                  `[Sync High Demand Spike] Model ${modelName} busy (${errInfo.code || '503'}), retrying in ${delay}ms...`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt++;
                continue;
              } else {
                console.warn(
                  `[Sync High Demand Fallback] Model ${modelName} busy, falling over to next model...`
                );
                break;
              }
            }

            if (isTransient && attempt < maxAttemptsForModel - 1) {
              const delay = calculateBackoffDelay(attempt, 800, 2000);
              console.warn(
                `[Sync Transient Retry] Model ${modelName} attempt ${attempt + 1}, retrying in ${delay}ms...`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              attempt++;
            } else {
              console.warn(
                `[Sync Fallback] Model ${modelName} failed (${errInfo.code || errInfo.statusName || 'error'}), trying next model...`
              );
              break;
            }
          }
        }

        if (success && response && response.text) {
          break;
        }
      }

      if (response && response.text) {
        break;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo obtener la alineación temporal del audio.');
    }

    let parsedResult: any = null;
    try {
      let rawJson = response.text.trim();
      if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
      }
      parsedResult = JSON.parse(rawJson);
    } catch (parseErr) {
      console.warn('Direct JSON parse failed on alignment response, attempting regex recovery:', parseErr);
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('La respuesta de sincronización no tuvo un formato JSON válido.');
      }
    }

    // Process and normalize words and lines against the user's edited lyrics
    const originalLines = lyrics.split('\n');
    let durationSeconds = Number(parsedResult.durationSeconds) || 180;

    const rawWords: Array<{ word: string; start: number; end: number; lineIndex: number; confidence?: number }> =
      Array.isArray(parsedResult.words)
        ? parsedResult.words.filter((w) => typeof w.start === 'number' && !isNaN(w.start) && w.start >= 0)
        : [];

    const rawLines: Array<{ lineIndex: number; text: string; start: number; end: number }> =
      Array.isArray(parsedResult.lines)
        ? parsedResult.lines.filter((l) => typeof l.start === 'number' && !isNaN(l.start) && l.start >= 0)
        : [];

    // Helper to clean words for comparison (lowercased, strip punctuation and accents)
    const normalizeWord = (w: string) =>
      w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

    // Sequence alignment: match user-edited tokens to raw detected audio word timestamps with Anchor Matching
    const structuredLines: Array<{
      lineIndex: number;
      text: string;
      start: number;
      end: number;
      words: Array<{ word: string; start: number; end: number; lineIndex: number; confidence?: number }>;
    }> = [];

    const allNormalizedWords: Array<{
      word: string;
      start: number;
      end: number;
      lineIndex: number;
      confidence?: number;
    }> = [];

    // Track the physical end of the last sung line to prevent negative overlaps while preserving real musical gaps
    let lastAcousticLineEnd = 0;

    originalLines.forEach((lineText, idx) => {
      const trimmedLine = lineText.trim();
      if (!trimmedLine) {
        // Blank line (paragraph break) - preserve empty line without polluting acoustic timestamps
        structuredLines.push({
          lineIndex: idx,
          text: '',
          start: lastAcousticLineEnd,
          end: lastAcousticLineEnd,
          words: [],
        });
        return;
      }

      const tokens = trimmedLine.split(/\s+/).filter(Boolean);

      // Find direct line match from Gemini acoustic detections
      let matchedRawLine = rawLines.find((l) => l.lineIndex === idx);
      if (!matchedRawLine && rawLines[idx]) {
        matchedRawLine = rawLines[idx];
      }

      // Collect raw candidate words for this line
      let lineWordsFromRaw = rawWords.filter((w) => w.lineIndex === idx);
      if (lineWordsFromRaw.length === 0 && rawWords.length > 0) {
        if (matchedRawLine && typeof matchedRawLine.start === 'number') {
          lineWordsFromRaw = rawWords.filter(
            (w) => w.start >= (matchedRawLine!.start - 0.5) && w.end <= (matchedRawLine!.end + 1.2)
          );
        }
      }

      // Sort raw words by acoustic start time
      lineWordsFromRaw.sort((a, b) => a.start - b.start);

      // STEP 1: Multi-pass Anchor Search
      // Match tokens against lineWordsFromRaw in monotonic forward order to find genuine acoustic anchors
      interface TokenAnchor {
        token: string;
        tokenIdx: number;
        rawMatch?: { start: number; end: number; confidence?: number; word: string };
      }

      const tokenAnchors: TokenAnchor[] = tokens.map((token, tokenIdx) => ({
        token,
        tokenIdx,
      }));

      let rawSearchPointer = 0;
      tokenAnchors.forEach((ta) => {
        const normToken = normalizeWord(ta.token);
        if (!normToken) return;

        let bestRawIdx = -1;
        // Search forward in raw detected words
        for (let r = rawSearchPointer; r < lineWordsFromRaw.length; r++) {
          const rawW = lineWordsFromRaw[r];
          const normRaw = normalizeWord(rawW.word || '');
          if (!normRaw) continue;

          // Exact match, prefix match or substring match
          if (normToken === normRaw) {
            bestRawIdx = r;
            break;
          } else if (normToken.startsWith(normRaw) || normRaw.startsWith(normToken)) {
            bestRawIdx = r;
            break;
          } else if (normToken.includes(normRaw) || normRaw.includes(normToken)) {
            bestRawIdx = r;
            break;
          }
        }

        if (bestRawIdx !== -1) {
          const matched = lineWordsFromRaw[bestRawIdx];
          const acousticStart = Number(matched.start);
          const acousticEnd = Number(matched.end > acousticStart ? matched.end : acousticStart + 0.35);
          ta.rawMatch = {
            start: acousticStart,
            end: acousticEnd,
            confidence: typeof matched.confidence === 'number' ? matched.confidence : 0.95,
            word: matched.word,
          };
          rawSearchPointer = bestRawIdx + 1;
        }
      });

      // If token count and raw word count are identical and no anchors were matched due to pronunciation/accents,
      // map 1-to-1 directly to preserve real acoustic audio boundaries
      if (tokenAnchors.filter((ta) => ta.rawMatch).length === 0 && lineWordsFromRaw.length === tokens.length) {
        tokenAnchors.forEach((ta, tIdx) => {
          const raw = lineWordsFromRaw[tIdx];
          const start = Number(raw.start);
          const end = Number(raw.end > start ? raw.end : start + 0.35);
          ta.rawMatch = {
            start,
            end,
            confidence: raw.confidence || 0.9,
            word: raw.word,
          };
        });
      }

      // STEP 2: Acoustic Line Boundaries & Natural Inter-Line Pause Preservation
      const matchedAnchors = tokenAnchors.filter((ta) => ta.rawMatch);
      let lineAcousticStart: number;
      let lineAcousticEnd: number;

      if (matchedAnchors.length > 0) {
        lineAcousticStart = matchedAnchors[0].rawMatch!.start;
        lineAcousticEnd = matchedAnchors[matchedAnchors.length - 1].rawMatch!.end;
      } else if (matchedRawLine && typeof matchedRawLine.start === 'number' && matchedRawLine.start >= 0) {
        lineAcousticStart = matchedRawLine.start;
        lineAcousticEnd = matchedRawLine.end > lineAcousticStart ? matchedRawLine.end : lineAcousticStart + Math.max(1.5, tokens.length * 0.35);
      } else {
        // Line wasn't detected in audio at all - position after previous line with standard conversational pause
        lineAcousticStart = lastAcousticLineEnd + 0.3;
        lineAcousticEnd = lineAcousticStart + Math.max(1.5, tokens.length * 0.35);
      }

      // Preserve acoustic start without artificial forward displacement.
      // Only clamp to lastAcousticLineEnd if it physically overlaps previous line.
      if (lineAcousticStart < lastAcousticLineEnd) {
        lineAcousticStart = lastAcousticLineEnd;
      }
      if (lineAcousticEnd <= lineAcousticStart) {
        lineAcousticEnd = lineAcousticStart + Math.max(1.2, tokens.length * 0.3);
      }

      // STEP 3: Localized Gap Filling Without Touching Known Anchors
      // For any tokens missing an acoustic match, estimate strictly within their immediate neighbors
      const currentLineWords: Array<{ word: string; start: number; end: number; lineIndex: number; confidence?: number }> = [];

      for (let tIdx = 0; tIdx < tokenAnchors.length; tIdx++) {
        const ta = tokenAnchors[tIdx];

        if (ta.rawMatch) {
          // 100% Genuine Acoustic Anchor - NEVER modify its acoustic start/end!
          currentLineWords.push({
            word: ta.token, // ALWAYS preserve the user's edited word
            start: Number(ta.rawMatch.start.toFixed(2)),
            end: Number(ta.rawMatch.end.toFixed(2)),
            lineIndex: idx,
            confidence: ta.rawMatch.confidence,
          });
        } else {
          // Unanchored token - find closest previous anchor and closest next anchor
          let prevAnchorEnd = lineAcousticStart;
          for (let p = tIdx - 1; p >= 0; p--) {
            if (tokenAnchors[p].rawMatch) {
              prevAnchorEnd = tokenAnchors[p].rawMatch!.end;
              break;
            }
          }

          let nextAnchorStart = lineAcousticEnd;
          for (let n = tIdx + 1; n < tokenAnchors.length; n++) {
            if (tokenAnchors[n].rawMatch) {
              nextAnchorStart = tokenAnchors[n].rawMatch!.start;
              break;
            }
          }

          // Count how many consecutive unanchored tokens are in this specific localized gap
          let gapStartIdx = tIdx;
          while (gapStartIdx > 0 && !tokenAnchors[gapStartIdx - 1].rawMatch) {
            gapStartIdx--;
          }
          let gapEndIdx = tIdx;
          while (gapEndIdx < tokenAnchors.length - 1 && !tokenAnchors[gapEndIdx + 1].rawMatch) {
            gapEndIdx++;
          }
          const numUnanchoredInGap = gapEndIdx - gapStartIdx + 1;
          const posInGap = tIdx - gapStartIdx;

          const availableGap = Math.max(0.2, nextAnchorStart - prevAnchorEnd);
          const slot = availableGap / numUnanchoredInGap;
          const wStart = prevAnchorEnd + posInGap * slot;
          const wEnd = wStart + slot * 0.92;

          currentLineWords.push({
            word: ta.token,
            start: Number(wStart.toFixed(2)),
            end: Number(Math.max(wStart + 0.1, wEnd).toFixed(2)),
            lineIndex: idx,
            confidence: 0.8,
          });
        }
      }

      // Guard: strictly ascending word timings inside the line
      for (let w = 1; w < currentLineWords.length; w++) {
        if (currentLineWords[w].start < currentLineWords[w - 1].start) {
          currentLineWords[w].start = Number((currentLineWords[w - 1].start + 0.04).toFixed(2));
        }
        if (currentLineWords[w].end <= currentLineWords[w].start) {
          currentLineWords[w].end = Number((currentLineWords[w].start + 0.15).toFixed(2));
        }
      }

      const finalLineStart = currentLineWords.length > 0 ? currentLineWords[0].start : lineAcousticStart;
      const finalLineEnd = currentLineWords.length > 0 ? currentLineWords[currentLineWords.length - 1].end : lineAcousticEnd;

      // Update the end of vocals for subsequent line comparison (DO NOT push forward future real timestamps)
      lastAcousticLineEnd = finalLineEnd;

      structuredLines.push({
        lineIndex: idx,
        text: lineText,
        start: Number(finalLineStart.toFixed(2)),
        end: Number(finalLineEnd.toFixed(2)),
        words: currentLineWords,
      });

      currentLineWords.forEach((w) => allNormalizedWords.push(w));
    });

    if (allNormalizedWords.length > 0) {
      const maxTime = allNormalizedWords[allNormalizedWords.length - 1].end;
      if (maxTime > durationSeconds) {
        durationSeconds = maxTime + 5;
      }
    }

    return res.status(200).json({
      success: true,
      syncResult: {
        durationSeconds: Number(durationSeconds.toFixed(2)),
        words: allNormalizedWords,
        lines: structuredLines,
        syncedLyricsText: lyrics,
      },
    });
  } catch (error: any) {
    console.error('Lyric synchronization error:', error);
    return res.status(500).json({
      success: false,
      error: 'sync_error',
      message: 'No se pudo sincronizar la letra con la canción. ' + (error.message || 'Error en el análisis de tiempos.'),
      details: error.message,
    });
  } finally {
    if (sessionId) {
      cleanSession(sessionId);
    }
    if (uploadedGeminiFile && uploadedGeminiFile.name) {
      const fileNameToDelete = uploadedGeminiFile.name;
      (async () => {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          if (apiKey) {
            const ai = new GoogleGenAI({ apiKey });
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                await ai.files.delete({ name: fileNameToDelete });
                break;
              } catch (delErr: any) {
                if (attempt === 1 && (delErr?.status === 'UNAVAILABLE' || delErr?.code === 503)) {
                  await new Promise((r) => setTimeout(r, 1000));
                  continue;
                }
                break;
              }
            }
          }
        } catch (cleanupErr) {
          // ignore
        }
      })();
    }
  }
});


// Explicit 404 JSON handler for unhandled /api requests
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'not_found',
    message: `Ruta ${req.method} ${req.path} no encontrada.`,
  });
});

// Global error handler ensuring JSON responses for API routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err.code === 'LIMIT_FILE_SIZE' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: 'file_too_large',
      message: 'El archivo de audio es demasiado grande para procesarlo de esta forma.',
    });
  }
  return res.status(err.status || 500).json({
    success: false,
    error: err.code || 'server_error',
    message: err.message || 'Error interno del servidor al procesar la solicitud.',
  });
});

// Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lyric Transcriber server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
