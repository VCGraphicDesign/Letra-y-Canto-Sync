var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_multer = __toESM(require("multer"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_child_process = require("child_process");
var import_util = require("util");
var import_genai = require("@google/genai");
var import_vite = require("vite");
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var configuredOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
app.use(
  (0, import_cors.default)({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin === "capacitor://localhost" || origin === "ionic://localhost" || origin === "https://localhost" || origin === "http://localhost" || origin.startsWith("http://localhost:") || origin.startsWith("https://localhost:") || origin.endsWith(".vercel.app") || origin.endsWith(".run.app") || origin.endsWith(".aistudio.google.com") || configuredOrigin && (configuredOrigin === "*" || origin === configuredOrigin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    credentials: true
  })
);
app.options("*", (0, import_cors.default)());
var chunkStorage = import_multer.default.memoryStorage();
var chunkUpload = (0, import_multer.default)({
  storage: chunkStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
    // 10MB per chunk limit (chunks are typically 2-4MB)
  }
});
app.use(import_express.default.json({ limit: "10mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "10mb" }));
var ACCEPTED_MIME_TYPES = /* @__PURE__ */ new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/webm"
]);
var ACCEPTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".mp4",
  ".webm"
]);
function getNormalizedMimeType(originalMime, originalName) {
  if (originalMime && ACCEPTED_MIME_TYPES.has(originalMime.toLowerCase())) {
    const lower = originalMime.toLowerCase();
    if (lower === "audio/x-wav" || lower === "audio/wave") return "audio/wav";
    if (lower === "audio/x-m4a") return "audio/mp4";
    if (lower === "audio/x-flac") return "audio/flac";
    return lower;
  }
  const ext = import_path.default.extname(originalName).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".mp4":
      return "audio/mp4";
    case ".webm":
      return "audio/webm";
    default:
      return originalMime || "application/octet-stream";
  }
}
var uploadSessions = /* @__PURE__ */ new Map();
var SESSIONS_BASE_DIR = import_path.default.join(import_os.default.tmpdir(), "lyric-sessions");
if (!import_fs.default.existsSync(SESSIONS_BASE_DIR)) {
  import_fs.default.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
}
function cleanSession(sessionId) {
  uploadSessions.delete(sessionId);
  const sessionDir = import_path.default.join(SESSIONS_BASE_DIR, sessionId);
  if (import_fs.default.existsSync(sessionDir)) {
    try {
      import_fs.default.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Error cleaning session directory:", e);
    }
  }
}
setInterval(() => {
  const now = Date.now();
  const TTL = 30 * 60 * 1e3;
  for (const [id, session] of uploadSessions.entries()) {
    if (now - session.createdAt > TTL) {
      cleanSession(id);
    }
  }
}, 5 * 60 * 1e3);
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", serverTime: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/upload/init", (req, res) => {
  try {
    const { filename, mimeType, totalSize, totalChunks } = req.body || {};
    if (!filename || typeof totalSize !== "number" || typeof totalChunks !== "number" || totalChunks <= 0) {
      return res.status(400).json({
        success: false,
        error: "invalid_metadata",
        message: "Metadatos de subida no v\xE1lidos."
      });
    }
    const normalizedMime = getNormalizedMimeType(mimeType || "", filename);
    const ext = import_path.default.extname(filename).toLowerCase();
    if (!ACCEPTED_MIME_TYPES.has(normalizedMime) && !ACCEPTED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        error: "unsupported_file",
        message: "El formato de audio no es compatible. Formatos aceptados: MP3, WAV, M4A, AAC, OGG, FLAC."
      });
    }
    const sessionId = import_crypto.default.randomUUID();
    const sessionDir = import_path.default.join(SESSIONS_BASE_DIR, sessionId);
    import_fs.default.mkdirSync(sessionDir, { recursive: true });
    uploadSessions.set(sessionId, {
      id: sessionId,
      filename,
      mimeType: normalizedMime,
      totalSize,
      totalChunks,
      uploadedChunks: /* @__PURE__ */ new Set(),
      createdAt: Date.now()
    });
    return res.json({
      success: true,
      sessionId
    });
  } catch (err) {
    console.error("Error in /api/upload/init:", err);
    return res.status(500).json({
      success: false,
      error: "init_error",
      message: "No se pudo inicializar la subida de audio."
    });
  }
});
app.post("/api/upload/chunk", chunkUpload.single("chunk"), (req, res) => {
  try {
    const { sessionId, chunkIndex } = req.body || {};
    const index = parseInt(chunkIndex, 10);
    const file = req.file;
    if (!sessionId || isNaN(index) || !file || !file.buffer) {
      return res.status(400).json({
        success: false,
        error: "invalid_chunk",
        message: "Par\xE1metros de fragmento no v\xE1lidos."
      });
    }
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "session_not_found",
        message: "La sesi\xF3n de subida no existe o ha expirado."
      });
    }
    if (index < 0 || index >= session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: "invalid_chunk_index",
        message: "\xCDndice de fragmento fuera de rango."
      });
    }
    const sessionDir = import_path.default.join(SESSIONS_BASE_DIR, sessionId);
    const chunkPath = import_path.default.join(sessionDir, `chunk_${index}`);
    import_fs.default.writeFileSync(chunkPath, file.buffer);
    session.uploadedChunks.add(index);
    return res.json({
      success: true,
      sessionId,
      chunkIndex: index,
      totalUploaded: session.uploadedChunks.size,
      totalChunks: session.totalChunks
    });
  } catch (err) {
    console.error("Error in /api/upload/chunk:", err);
    return res.status(500).json({
      success: false,
      error: "chunk_upload_error",
      message: "Error al recibir el fragmento de audio."
    });
  }
});
function parseGeminiErrorInfo(error) {
  let code = null;
  let statusName = "";
  let message = "";
  const rawMessage = String(error?.message || "");
  if (error) {
    if (typeof error.status === "number") code = error.status;
    else if (typeof error.code === "number") code = error.code;
    else if (typeof error.statusCode === "number") code = error.statusCode;
    if (typeof error.status === "string") statusName = error.status;
    else if (typeof error.statusName === "string") statusName = error.statusName;
    if (typeof error.message === "string") message = error.message;
    if (rawMessage.trim().startsWith("{") && rawMessage.includes('"error"')) {
      try {
        const parsed = JSON.parse(rawMessage.trim());
        if (parsed.error) {
          if (typeof parsed.error.code === "number") code = parsed.error.code;
          if (typeof parsed.error.status === "string") statusName = parsed.error.status;
          if (typeof parsed.error.message === "string") message = parsed.error.message;
        }
      } catch {
      }
    }
  }
  return {
    code,
    statusName: statusName.toUpperCase(),
    message: message.toUpperCase(),
    rawMessage
  };
}
function isRetryableGeminiError(error) {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  const retryableCodes = [408, 429, 500, 502, 503, 504];
  if (info.code !== null && retryableCodes.includes(info.code)) {
    return true;
  }
  const retryableNames = [
    "UNAVAILABLE",
    "RESOURCE_EXHAUSTED",
    "INTERNAL",
    "DEADLINE_EXCEEDED",
    "FETCH_ERROR",
    "ECONNRESET",
    "ETIMEDOUT",
    "HIGH DEMAND"
  ];
  if (retryableNames.some(
    (name) => info.statusName.includes(name) || info.message.includes(name)
  )) {
    return true;
  }
  return false;
}
function isOverloadedOrHighDemandError(error) {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  if (info.code === 503 || info.code === 502 || info.code === 504) return true;
  return info.statusName.includes("UNAVAILABLE") || info.message.includes("HIGH DEMAND") || info.message.includes("UNAVAILABLE");
}
function isDailyOrHardQuotaError(error) {
  if (!error) return false;
  const info = parseGeminiErrorInfo(error);
  if (info.code === 429) return true;
  const lowerMsg = info.message.toLowerCase();
  const details = JSON.stringify(error.details || error.response || "").toLowerCase();
  return info.statusName.includes("RESOURCE_EXHAUSTED") || lowerMsg.includes("resource_exhausted") || lowerMsg.includes("generaterequestsperday") || lowerMsg.includes("free_tier_requests") || lowerMsg.includes("quota") || lowerMsg.includes("limit: 20") || details.includes("quotafailure") || details.includes("generaterequestsperday") || details.includes("resource_exhausted");
}
function calculateBackoffDelay(retryIndex, baseDelayMs = 800, maxDelayMs = 4e3) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, retryIndex));
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(maxDelayMs, exponential) + jitter;
}
async function convertAudioToFlac(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "flac",
    outputPath
  ]);
}
async function getAudioDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch (err) {
    console.warn("[Audio Duration Probe Warning]:", err);
    return 0;
  }
}
async function extractAudioChunkFlac(inputFlacPath, outputChunkPath, startTimeSec, durationSec) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    startTimeSec.toString(),
    "-t",
    durationSec.toString(),
    "-i",
    inputFlacPath,
    "-c:a",
    "flac",
    outputChunkPath
  ]);
}
async function callGroqWhisper(audioFilePath, groqApiKey, fileNameLabel) {
  const audioBuffer = import_fs.default.readFileSync(audioFilePath);
  const audioBlob = new Blob([audioBuffer], { type: "audio/flac" });
  const groqFormData = new FormData();
  groqFormData.append("file", audioBlob, fileNameLabel || "audio.flac");
  groqFormData.append("model", "whisper-large-v3");
  groqFormData.append("response_format", "verbose_json");
  groqFormData.append("timestamp_granularities[]", "word");
  groqFormData.append("timestamp_granularities[]", "segment");
  groqFormData.append("temperature", "0");
  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`
    },
    body: groqFormData
  });
  if (!groqResponse.ok) {
    const errorBody = await groqResponse.text();
    let parsedError = null;
    try {
      parsedError = JSON.parse(errorBody);
    } catch (e) {
    }
    const statusCode = groqResponse.status;
    const err = new Error(parsedError?.error?.message || errorBody);
    err.statusCode = statusCode;
    err.code = parsedError?.error?.code || "GROQ_API_ERROR";
    throw err;
  }
  return await groqResponse.json();
}
function structureLyricsFromWhisper(words, segments, rawFallbackText) {
  if (Array.isArray(words) && words.length > 0) {
    const syncedWords = [];
    const stanzas = [];
    let currentLineWords = [];
    let currentStanzaLines = [];
    for (let i = 0; i < words.length; i++) {
      const currentWordObj = words[i];
      const wordStr = (currentWordObj.word || "").trim();
      if (!wordStr) continue;
      const nextWordObj = i < words.length - 1 ? words[i + 1] : null;
      const pause = nextWordObj ? Math.max(0, nextWordObj.start - currentWordObj.end) : 0;
      currentLineWords.push({
        word: wordStr,
        start: typeof currentWordObj.start === "number" ? currentWordObj.start : 0,
        end: typeof currentWordObj.end === "number" ? currentWordObj.end : 0
      });
      const hasSentencePunctuation = /[.!?…¿¡]$/.test(wordStr);
      const hasPhrasePunctuation = /[,;:\-—"]$/.test(wordStr);
      const isLastWord = i === words.length - 1;
      const isSectionPause = pause >= 1.6;
      const isVocalRestPause = pause >= 0.45;
      const isPunctuatedSentencePause = hasSentencePunctuation && (pause >= 0.2 || currentLineWords.length >= 3);
      const isPunctuatedPhrasePause = hasPhrasePunctuation && (pause >= 0.25 || currentLineWords.length >= 4);
      const isLineCadenceLength = currentLineWords.length >= 6 && pause >= 0.22;
      const isPhraseLimit = currentLineWords.length >= 8 && (pause >= 0.15 || hasPhrasePunctuation);
      const isHardPhraseLimit = currentLineWords.length >= 10;
      const shouldBreakLine = isLastWord || isSectionPause || isVocalRestPause || isPunctuatedSentencePause || isPunctuatedPhrasePause || isLineCadenceLength || isPhraseLimit || isHardPhraseLimit;
      if (shouldBreakLine) {
        const lineText = currentLineWords.map((w) => w.word).join(" ");
        const lineIdx = stanzas.reduce((acc, s) => acc + s.length, 0) + currentStanzaLines.length;
        currentLineWords.forEach((cw) => {
          syncedWords.push({
            word: cw.word,
            start: Number(cw.start.toFixed(3)),
            end: Number(cw.end.toFixed(3)),
            lineIndex: lineIdx
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
    const formattedLyrics = stanzas.map((stanza) => stanza.join("\n")).join("\n\n");
    return {
      formattedLyrics: formattedLyrics.trim(),
      syncedWords
    };
  }
  if (Array.isArray(segments) && segments.length > 0) {
    const stanzas = [];
    let currentStanzaLines = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = (seg.text || "").trim();
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
    const formattedLyrics = stanzas.map((stanza) => stanza.join("\n")).join("\n\n");
    return {
      formattedLyrics: formattedLyrics.trim(),
      syncedWords: []
    };
  }
  return {
    formattedLyrics: (rawFallbackText || "").trim(),
    syncedWords: []
  };
}
app.post("/api/transcribe", async (req, res) => {
  const { sessionId } = req.body || {};
  let sessionDir = null;
  try {
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "missing_session",
        message: "Identificador de sesi\xF3n de audio no proporcionado."
      });
    }
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "session_not_found",
        message: "La sesi\xF3n de subida no fue encontrada o ha expirado."
      });
    }
    sessionDir = import_path.default.join(SESSIONS_BASE_DIR, sessionId);
    if (session.uploadedChunks.size !== session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: "incomplete_upload",
        message: `Faltan fragmentos por subir (${session.uploadedChunks.size}/${session.totalChunks}).`
      });
    }
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = import_path.default.join(sessionDir, `chunk_${i}`);
      if (!import_fs.default.existsSync(chunkPath)) {
        return res.status(400).json({
          success: false,
          error: "missing_chunk_file",
          message: `El fragmento ${i} no est\xE1 presente en el servidor.`
        });
      }
    }
    const safeName = import_path.default.basename(session.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const reconstructedPath = import_path.default.join(sessionDir, `reconstructed_${safeName}`);
    const writeStream = import_fs.default.createWriteStream(reconstructedPath);
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = import_path.default.join(sessionDir, `chunk_${i}`);
      const chunkBuffer = import_fs.default.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
      try {
        import_fs.default.unlinkSync(chunkPath);
      } catch (e) {
      }
    }
    await new Promise((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on("error", reject);
    });
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({
        success: false,
        error: "missing_api_key",
        message: "La clave de API (GROQ_API_KEY) no est\xE1 configurada en el servidor. Por favor config\xFArala en las variables de entorno."
      });
    }
    const flacPath = import_path.default.join(sessionDir, `converted_${safeName}.flac`);
    try {
      await convertAudioToFlac(reconstructedPath, flacPath);
    } catch (conversionErr) {
      console.warn("[FLAC Conversion Warning, falling back to original]:", conversionErr);
      import_fs.default.copyFileSync(reconstructedPath, flacPath);
    }
    const flacStats = import_fs.default.statSync(flacPath);
    const GROQ_MAX_FILE_SIZE_BYTES = 24 * 1024 * 1024;
    const totalDuration = await getAudioDurationSeconds(flacPath);
    let formattedLyrics = "";
    let syncedWords = [];
    if (flacStats.size <= GROQ_MAX_FILE_SIZE_BYTES) {
      const groqData = await callGroqWhisper(flacPath, groqApiKey, `${safeName}.flac`);
      const rawText = (groqData?.text || "").trim();
      if (!rawText) {
        return res.status(422).json({
          success: false,
          error: "empty_transcription",
          message: "No se pudo detectar una letra en el audio con Groq Whisper."
        });
      }
      const rawWords = Array.isArray(groqData.words) ? groqData.words : [];
      const rawSegments = Array.isArray(groqData.segments) ? groqData.segments : [];
      const structured = structureLyricsFromWhisper(rawWords, rawSegments, rawText);
      formattedLyrics = structured.formattedLyrics;
      syncedWords = structured.syncedWords;
    } else {
      console.log(`[Groq Transcription]: File size (${(flacStats.size / (1024 * 1024)).toFixed(2)} MB) exceeds 24 MB. Initiating automatic FLAC chunking...`);
      const CHUNK_DURATION_SEC = 300;
      const OVERLAP_SEC = 2;
      const durationToUse = totalDuration > 0 ? totalDuration : Math.ceil(flacStats.size / 32e3);
      const numChunks = Math.max(1, Math.ceil(durationToUse / CHUNK_DURATION_SEC));
      const accumulatedWords = [];
      const accumulatedSegments = [];
      const accumulatedRawTexts = [];
      for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const chunkOffset = chunkIdx > 0 ? Math.max(0, chunkIdx * CHUNK_DURATION_SEC - OVERLAP_SEC) : 0;
        const currentChunkDuration = Math.min(
          CHUNK_DURATION_SEC + (chunkIdx > 0 ? OVERLAP_SEC : 0),
          Math.max(1, durationToUse - chunkOffset)
        );
        const chunkFlacPath = import_path.default.join(sessionDir, `flac_chunk_${chunkIdx}.flac`);
        try {
          await extractAudioChunkFlac(flacPath, chunkFlacPath, chunkOffset, currentChunkDuration);
          const chunkData = await callGroqWhisper(chunkFlacPath, groqApiKey, `chunk_${chunkIdx}.flac`);
          if (chunkData.text) {
            accumulatedRawTexts.push(chunkData.text.trim());
          }
          if (Array.isArray(chunkData.segments) && chunkData.segments.length > 0) {
            for (const seg of chunkData.segments) {
              accumulatedSegments.push({
                text: (seg.text || "").trim(),
                start: chunkOffset + (typeof seg.start === "number" ? seg.start : 0),
                end: chunkOffset + (typeof seg.end === "number" ? seg.end : 0)
              });
            }
          }
          if (Array.isArray(chunkData.words) && chunkData.words.length > 0) {
            for (const w of chunkData.words) {
              const wordStr = (w.word || "").trim();
              if (!wordStr) continue;
              const relativeStart = typeof w.start === "number" ? Math.max(0, w.start) : 0;
              const relativeEnd = typeof w.end === "number" ? Math.max(relativeStart + 0.05, w.end) : relativeStart + 0.3;
              const globalStart = chunkOffset + relativeStart;
              const globalEnd = chunkOffset + relativeEnd;
              if (chunkIdx > 0 && globalStart <= chunkOffset + OVERLAP_SEC + 0.2) {
                const isBoundaryDuplicate = accumulatedWords.some(
                  (prevWord) => Math.abs(prevWord.start - globalStart) < 0.45 && prevWord.word.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, "") === wordStr.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, "")
                );
                if (isBoundaryDuplicate) {
                  continue;
                }
              }
              accumulatedWords.push({
                word: wordStr,
                start: globalStart,
                end: globalEnd
              });
            }
          }
        } finally {
          try {
            if (import_fs.default.existsSync(chunkFlacPath)) {
              import_fs.default.unlinkSync(chunkFlacPath);
            }
          } catch (e) {
          }
        }
      }
      const structured = structureLyricsFromWhisper(
        accumulatedWords,
        accumulatedSegments,
        accumulatedRawTexts.join("\n")
      );
      formattedLyrics = structured.formattedLyrics;
      syncedWords = structured.syncedWords;
    }
    try {
      if (import_fs.default.existsSync(flacPath)) {
        import_fs.default.unlinkSync(flacPath);
      }
    } catch (e) {
    }
    return res.status(200).json({
      success: true,
      filename: session.filename,
      lyrics: formattedLyrics.trim(),
      words: syncedWords,
      duration: totalDuration > 0 ? totalDuration : void 0
    });
  } catch (error) {
    console.error("Transcription error:", error);
    const statusCode = error?.statusCode || (typeof error?.status === "number" && error.status >= 400 && error.status <= 599 ? error.status : 500);
    let friendlyMessage = "Ocurri\xF3 un error al procesar la transcripci\xF3n con Groq Whisper.";
    if (statusCode === 401) {
      friendlyMessage = "La clave de API de Groq (GROQ_API_KEY) es inv\xE1lida o no tiene permisos.";
    } else if (statusCode === 429) {
      friendlyMessage = "Se ha alcanzado el l\xEDmite de velocidad o cuota de Groq. Por favor intenta de nuevo en unos segundos.";
    } else if (statusCode === 413) {
      friendlyMessage = "El archivo de audio excede el l\xEDmite de tama\xF1o de Groq (25 MB).";
    }
    return res.status(statusCode).json({
      success: false,
      error: error?.code || "GROQ_TRANSCRIPTION_ERROR",
      message: friendlyMessage,
      details: error?.message
    });
  } finally {
    if (sessionId) {
      cleanSession(sessionId);
    }
  }
});
app.post("/api/sync-lyrics", async (req, res) => {
  const { sessionId, lyrics } = req.body || {};
  let uploadedGeminiFile = null;
  let sessionDir = null;
  try {
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "missing_session",
        message: "Identificador de sesi\xF3n de audio no proporcionado."
      });
    }
    if (!lyrics || typeof lyrics !== "string" || !lyrics.trim()) {
      return res.status(400).json({
        success: false,
        error: "missing_lyrics",
        message: "No se proporcion\xF3 la letra a sincronizar."
      });
    }
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "session_not_found",
        message: "La sesi\xF3n de subida no fue encontrada o ha expirado."
      });
    }
    sessionDir = import_path.default.join(SESSIONS_BASE_DIR, sessionId);
    if (session.uploadedChunks.size !== session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: "incomplete_upload",
        message: `Faltan fragmentos por subir (${session.uploadedChunks.size}/${session.totalChunks}).`
      });
    }
    const safeName = import_path.default.basename(session.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const reconstructedPath = import_path.default.join(sessionDir, `sync_reconstructed_${safeName}`);
    const writeStream = import_fs.default.createWriteStream(reconstructedPath);
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = import_path.default.join(sessionDir, `chunk_${i}`);
      if (import_fs.default.existsSync(chunkPath)) {
        const chunkBuffer = import_fs.default.readFileSync(chunkPath);
        writeStream.write(chunkBuffer);
        try {
          import_fs.default.unlinkSync(chunkPath);
        } catch (e) {
        }
      }
    }
    await new Promise((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on("error", reject);
    });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "missing_api_key",
        message: "La clave de API (GEMINI_API_KEY) no est\xE1 configurada en el servidor."
      });
    }
    const ai = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const uploadResult = await ai.files.upload({
      file: reconstructedPath,
      mimeType: session.mimeType
    });
    uploadedGeminiFile = uploadResult;
    let fileState = uploadResult;
    let attempts = 0;
    while (fileState.state === "PROCESSING" && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      fileState = await ai.files.get({ name: uploadResult.name });
      attempts++;
    }
    if (fileState.state === "FAILED") {
      throw new Error("El procesamiento del archivo de audio para sincronizaci\xF3n fall\xF3.");
    }
    const audioPartFromFile = fileState.uri ? {
      fileData: {
        fileUri: fileState.uri,
        mimeType: session.mimeType
      }
    } : null;
    let base64FallbackPart = null;
    try {
      const stats = import_fs.default.statSync(reconstructedPath);
      if (stats.size <= 20 * 1024 * 1024) {
        const fileBuffer = import_fs.default.readFileSync(reconstructedPath);
        base64FallbackPart = {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: session.mimeType
          }
        };
      }
    } catch (e) {
      console.warn("Could not prepare inline base64 fallback for sync:", e);
    }
    const partsToTry = [];
    if (audioPartFromFile) partsToTry.push(audioPartFromFile);
    if (base64FallbackPart) partsToTry.push(base64FallbackPart);
    if (partsToTry.length === 0) {
      throw new Error("No se pudo preparar la pista de audio para an\xE1lisis de sincronizaci\xF3n.");
    }
    const formattedLyricsNumbered = lyrics.split("\n").map((line, idx) => `[Line ${idx}]: ${line.trim()}`).join("\n");
    const SYNC_PROMPT = `You are an expert audio forced-alignment engine for sung music.
Listen carefully to this audio recording and align it with the exact TARGET LYRICS provided below.

TARGET LYRICS (GROUND TRUTH):
"""
${formattedLyricsNumbered}
"""

YOUR TASK:
Identify the exact acoustic timestamps (in seconds with 2 decimal places, e.g. 14.85) for EVERY word and EVERY line in the target lyrics as sung in the recording.

CRITICAL RULES FOR PRECISE VOCAL TIMING & INSTRUMENTAL GAPS:
1. GROUND TRUTH: The target lyrics text is the absolute reference. Preserve every word and line index exactly.
2. REAL AUDIO TIMESTAMPS: Timestamps MUST correspond to the actual physical seconds in the audio when the vocalist sings each word.
3. INSTRUMENTAL PAUSES & INTERLUDES: Songs often have guitar solos, drum breaks, instrumental bridges, or silent intervals between verses. NEVER compress, estimate, or artificially fast-forward these intervals. If line N ends at 32.40s and line N+1 does not start until 48.70s after an instrumental break, line N+1's start MUST be 48.70s.
4. CHRONOLOGICAL INTEGRITY: All timestamps must be strictly non-decreasing.
5. Return ONLY a valid JSON object matching this schema:
{
  "durationSeconds": 210.5,
  "lines": [
    {
      "lineIndex": 0,
      "text": "line text",
      "start": 12.30,
      "end": 16.80
    }
  ],
  "words": [
    {
      "word": "Hello",
      "start": 12.30,
      "end": 12.75,
      "lineIndex": 0,
      "confidence": 0.95
    }
  ]
}`;
    let response = null;
    const candidateModels = [
      "gemini-3.7-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite"
    ];
    let lastError = null;
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
                systemInstruction: "You are a high-precision vocal forced-alignment system for musical lyrics. Measure real acoustic singing timestamps for every word and line, faithfully respecting instrumental interludes and musical pauses.",
                responseMimeType: "application/json"
              }
            });
            if (response && response.text) {
              console.log(`Sync alignment succeeded with model: ${modelName}`);
              success = true;
              break;
            }
          } catch (err) {
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
                  `[Sync High Demand Spike] Model ${modelName} busy (${errInfo.code || "503"}), retrying in ${delay}ms...`
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
              const delay = calculateBackoffDelay(attempt, 800, 2e3);
              console.warn(
                `[Sync Transient Retry] Model ${modelName} attempt ${attempt + 1}, retrying in ${delay}ms...`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              attempt++;
            } else {
              console.warn(
                `[Sync Fallback] Model ${modelName} failed (${errInfo.code || errInfo.statusName || "error"}), trying next model...`
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
      throw lastError || new Error("No se pudo obtener la alineaci\xF3n temporal del audio.");
    }
    let parsedResult = null;
    try {
      let rawJson = response.text.trim();
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
      }
      parsedResult = JSON.parse(rawJson);
    } catch (parseErr) {
      console.warn("Direct JSON parse failed on alignment response, attempting regex recovery:", parseErr);
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("La respuesta de sincronizaci\xF3n no tuvo un formato JSON v\xE1lido.");
      }
    }
    const originalLines = lyrics.split("\n");
    let durationSeconds = Number(parsedResult.durationSeconds) || 180;
    const rawWords = Array.isArray(parsedResult.words) ? parsedResult.words.filter((w) => typeof w.start === "number" && !isNaN(w.start) && w.start >= 0) : [];
    const rawLines = Array.isArray(parsedResult.lines) ? parsedResult.lines.filter((l) => typeof l.start === "number" && !isNaN(l.start) && l.start >= 0) : [];
    const normalizeWord = (w) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const structuredLines = [];
    const allNormalizedWords = [];
    let lastAcousticLineEnd = 0;
    originalLines.forEach((lineText, idx) => {
      const trimmedLine = lineText.trim();
      if (!trimmedLine) {
        structuredLines.push({
          lineIndex: idx,
          text: "",
          start: lastAcousticLineEnd,
          end: lastAcousticLineEnd,
          words: []
        });
        return;
      }
      const tokens = trimmedLine.split(/\s+/).filter(Boolean);
      let matchedRawLine = rawLines.find((l) => l.lineIndex === idx);
      if (!matchedRawLine && rawLines[idx]) {
        matchedRawLine = rawLines[idx];
      }
      let lineWordsFromRaw = rawWords.filter((w) => w.lineIndex === idx);
      if (lineWordsFromRaw.length === 0 && rawWords.length > 0) {
        if (matchedRawLine && typeof matchedRawLine.start === "number") {
          lineWordsFromRaw = rawWords.filter(
            (w) => w.start >= matchedRawLine.start - 0.5 && w.end <= matchedRawLine.end + 1.2
          );
        }
      }
      lineWordsFromRaw.sort((a, b) => a.start - b.start);
      const tokenAnchors = tokens.map((token, tokenIdx) => ({
        token,
        tokenIdx
      }));
      let rawSearchPointer = 0;
      tokenAnchors.forEach((ta) => {
        const normToken = normalizeWord(ta.token);
        if (!normToken) return;
        let bestRawIdx = -1;
        for (let r = rawSearchPointer; r < lineWordsFromRaw.length; r++) {
          const rawW = lineWordsFromRaw[r];
          const normRaw = normalizeWord(rawW.word || "");
          if (!normRaw) continue;
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
            confidence: typeof matched.confidence === "number" ? matched.confidence : 0.95,
            word: matched.word
          };
          rawSearchPointer = bestRawIdx + 1;
        }
      });
      if (tokenAnchors.filter((ta) => ta.rawMatch).length === 0 && lineWordsFromRaw.length === tokens.length) {
        tokenAnchors.forEach((ta, tIdx) => {
          const raw = lineWordsFromRaw[tIdx];
          const start = Number(raw.start);
          const end = Number(raw.end > start ? raw.end : start + 0.35);
          ta.rawMatch = {
            start,
            end,
            confidence: raw.confidence || 0.9,
            word: raw.word
          };
        });
      }
      const matchedAnchors = tokenAnchors.filter((ta) => ta.rawMatch);
      let lineAcousticStart;
      let lineAcousticEnd;
      if (matchedAnchors.length > 0) {
        lineAcousticStart = matchedAnchors[0].rawMatch.start;
        lineAcousticEnd = matchedAnchors[matchedAnchors.length - 1].rawMatch.end;
      } else if (matchedRawLine && typeof matchedRawLine.start === "number" && matchedRawLine.start >= 0) {
        lineAcousticStart = matchedRawLine.start;
        lineAcousticEnd = matchedRawLine.end > lineAcousticStart ? matchedRawLine.end : lineAcousticStart + Math.max(1.5, tokens.length * 0.35);
      } else {
        lineAcousticStart = lastAcousticLineEnd + 0.3;
        lineAcousticEnd = lineAcousticStart + Math.max(1.5, tokens.length * 0.35);
      }
      if (lineAcousticStart < lastAcousticLineEnd) {
        lineAcousticStart = lastAcousticLineEnd;
      }
      if (lineAcousticEnd <= lineAcousticStart) {
        lineAcousticEnd = lineAcousticStart + Math.max(1.2, tokens.length * 0.3);
      }
      const currentLineWords = [];
      for (let tIdx = 0; tIdx < tokenAnchors.length; tIdx++) {
        const ta = tokenAnchors[tIdx];
        if (ta.rawMatch) {
          currentLineWords.push({
            word: ta.token,
            // ALWAYS preserve the user's edited word
            start: Number(ta.rawMatch.start.toFixed(2)),
            end: Number(ta.rawMatch.end.toFixed(2)),
            lineIndex: idx,
            confidence: ta.rawMatch.confidence
          });
        } else {
          let prevAnchorEnd = lineAcousticStart;
          for (let p = tIdx - 1; p >= 0; p--) {
            if (tokenAnchors[p].rawMatch) {
              prevAnchorEnd = tokenAnchors[p].rawMatch.end;
              break;
            }
          }
          let nextAnchorStart = lineAcousticEnd;
          for (let n = tIdx + 1; n < tokenAnchors.length; n++) {
            if (tokenAnchors[n].rawMatch) {
              nextAnchorStart = tokenAnchors[n].rawMatch.start;
              break;
            }
          }
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
            confidence: 0.8
          });
        }
      }
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
      lastAcousticLineEnd = finalLineEnd;
      structuredLines.push({
        lineIndex: idx,
        text: lineText,
        start: Number(finalLineStart.toFixed(2)),
        end: Number(finalLineEnd.toFixed(2)),
        words: currentLineWords
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
        syncedLyricsText: lyrics
      }
    });
  } catch (error) {
    console.error("Lyric synchronization error:", error);
    return res.status(500).json({
      success: false,
      error: "sync_error",
      message: "No se pudo sincronizar la letra con la canci\xF3n. " + (error.message || "Error en el an\xE1lisis de tiempos."),
      details: error.message
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
            const ai = new import_genai.GoogleGenAI({ apiKey });
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                await ai.files.delete({ name: fileNameToDelete });
                break;
              } catch (delErr) {
                if (attempt === 1 && (delErr?.status === "UNAVAILABLE" || delErr?.code === 503)) {
                  await new Promise((r) => setTimeout(r, 1e3));
                  continue;
                }
                break;
              }
            }
          }
        } catch (cleanupErr) {
        }
      })();
    }
  }
});
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "not_found",
    message: `Ruta ${req.method} ${req.path} no encontrada.`
  });
});
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  if (res.headersSent) {
    return next(err);
  }
  if (err.code === "LIMIT_FILE_SIZE" || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: "file_too_large",
      message: "El archivo de audio es demasiado grande para procesarlo de esta forma."
    });
  }
  return res.status(err.status || 500).json({
    success: false,
    error: err.code || "server_error",
    message: err.message || "Error interno del servidor al procesar la solicitud."
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Lyric Transcriber server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
