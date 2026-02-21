# VoiceLibri Development Manual - Part 2: API Contract & Backend

> **Purpose:** Complete API specification for LLM coding agents  
> **Aligned with:** MOBILE_APP_DEVELOPMENT_GUIDE.md Sections 5, 7  
> **Audience:** Claude Opus 4.5 (Supervisor), GPT 5.1 Codex Max (Implementation)  
> **Last Updated:** January 7, 2026

---

## 1. API Design Principles

1. **Idempotency:** All mutating requests accept `Idempotency-Key` header
2. **Pagination:** All list endpoints use cursor-based pagination
3. **Rate Limiting:** Clear limits with `X-RateLimit-*` headers
4. **Caching:** ETags for conditional requests
5. **Versioning:** URL path versioning (`/api/v1/`, `/api/v2/`)

---

## 2. Authentication

### 2.1 Token Format

- **Access Token:** JWT, 1-hour expiry
- **Refresh Token:** Opaque token, 30-day expiry
- **Storage:** Access in memory, refresh in SecureStore (mobile) or httpOnly cookie (web)

### 2.2 Auth Endpoints

**All endpoints require `Authorization: Bearer <token>` except:**
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/social`

```yaml
POST /api/v1/auth/register:
  description: Create new account with email/password
  body:
    email: string (required, valid email)
    password: string (required, min 8 chars)
  response: 201
    user:
      id: string (uuid)
      email: string
      createdAt: ISO8601
    accessToken: string (JWT)
    refreshToken: string
  errors:
    400: { error: "VALIDATION_ERROR", message: "Invalid email format" }
    409: { error: "EMAIL_EXISTS", message: "Email already registered" }

POST /api/v1/auth/login:
  description: Authenticate with email/password
  body:
    email: string (required)
    password: string (required)
  response: 200
    user:
      id: string
      email: string
      subscription: Subscription | null
      hoursBalance: number
    accessToken: string
    refreshToken: string
  errors:
    401: { error: "INVALID_CREDENTIALS", message: "Invalid email or password" }
    423: { error: "ACCOUNT_LOCKED", message: "Too many failed attempts" }

POST /api/v1/auth/refresh:
  description: Exchange refresh token for new access token
  body:
    refreshToken: string (required)
  response: 200
    accessToken: string
    refreshToken: string (rotated)
  errors:
    401: { error: "INVALID_TOKEN", message: "Refresh token expired or invalid" }

POST /api/v1/auth/social:
  description: Authenticate via Google or Apple
  body:
    provider: "google" | "apple" (required)
    idToken: string (required, from OAuth provider)
  response: 200
    user: User
    accessToken: string
    refreshToken: string
    isNewUser: boolean
  errors:
    401: { error: "INVALID_TOKEN", message: "Social token invalid" }
    400: { error: "UNSUPPORTED_PROVIDER", message: "Provider not supported" }

POST /api/v1/auth/logout:
  description: Invalidate refresh token
  headers:
    Authorization: Bearer <accessToken>
  body:
    refreshToken: string (optional, invalidate specific token)
  response: 200
    success: true
```

---

## 3. User & Subscription Endpoints

```yaml
GET /api/v1/user/profile:
  description: Get current user profile with subscription info
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    id: string
    email: string
    subscription:
      plan: "free" | "standard" | "premium" | "none"
      expiresAt: ISO8601 | null
      hoursIncluded: number
      hoursUsed: number
      willRenew: boolean
    hoursBalance: number  # Pay-as-you-go balance
    createdAt: ISO8601
    settings:
      defaultLanguage: string
      defaultSpeed: number
      notificationsEnabled: boolean

PATCH /api/v1/user/settings:
  description: Update user preferences
  headers:
    Authorization: Bearer <accessToken>
  body:
    defaultLanguage?: string (ISO 639-1)
    defaultSpeed?: number (0.5-2.0)
    notificationsEnabled?: boolean
  response: 200
    settings: { ... updated settings }

POST /api/v1/user/subscription/validate:
  description: Validate App Store / Play Store receipt (called by RevenueCat webhook)
  headers:
    Authorization: Bearer <webhookSecret>
  body:
    event: string (INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.)
    app_user_id: string
    product_id: string
    purchased_at_ms: number
    expires_at_ms: number | null
    environment: "SANDBOX" | "PRODUCTION"
  response: 200
    success: true

GET /api/v1/user/usage:
  description: Get usage stats for current billing period
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    billingPeriod:
      start: ISO8601
      end: ISO8601
    subscription:
      hoursIncluded: number
      hoursUsed: number
      hoursRemaining: number
    payAsYouGo:
      hoursUsed: number
      amountDue: number (cents)
    generationHistory: Array<{
      bookId: string
      bookTitle: string
      hoursUsed: number
      generatedAt: ISO8601
    }>
```

---

## 4. Library Management Endpoints

```yaml
GET /api/v1/books:
  description: List user's audiobooks with pagination
  headers:
    Authorization: Bearer <accessToken>
    If-None-Match: string (optional, ETag for caching)
  query:
    cursor?: string (from previous response)
    limit?: number (default 20, max 100)
    status?: "all" | "ready" | "generating" | "error" (default "all")
    sortBy?: "createdAt" | "title" | "lastPlayed" (default "createdAt")
    sortOrder?: "asc" | "desc" (default "desc")
  response: 200
    books: Array<{
      id: string
      title: string
      author: string
      coverUrl: string | null
      totalDuration: number (seconds)
      chapterCount: number
      status: "ready" | "generating" | "error"
      progress: number | null (0-100 if generating)
      lastPlayedAt: ISO8601 | null
      createdAt: ISO8601
    }>
    nextCursor: string | null
    totalCount: number
  headers:
    ETag: string
    X-RateLimit-Limit: 100
    X-RateLimit-Remaining: 99
    X-RateLimit-Reset: timestamp

GET /api/v1/books/{bookId}:
  description: Get single book with all chapters
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    id: string
    title: string
    author: string
    description: string | null
    coverUrl: string | null
    totalDuration: number
    status: "ready" | "generating" | "error"
    sourceFormat: "txt" | "epub" | "mobi" | "azw3" | "pdf" | "doc" | "docx"
    sourceLanguage: string
    targetLanguage: string
    chapters: Array<{
      id: string
      number: number
      title: string
      duration: number
      audioUrl: string  # Signed URL, expires in 24h
    }>
    characters: Array<{
      name: string
      voiceId: string
      voiceName: string
      lineCount: number
    }>
    generatedAt: ISO8601 | null
    hoursUsed: number
  errors:
    404: { error: "NOT_FOUND", message: "Book not found" }

DELETE /api/v1/books/{bookId}:
  description: Delete a book and its audio files
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    success: true
    hoursRefunded: number | null  # If deleted within 24h of generation
  errors:
    404: { error: "NOT_FOUND", message: "Book not found" }
```

---

## 5. Book Generation Endpoints

```yaml
POST /api/v1/books/estimate:
  description: Get cost estimate before generation
  headers:
    Authorization: Bearer <accessToken>
  body:
    file: multipart/form-data (ebook file up to 50MB)
    # OR
    text: string (raw text content up to 2M chars)
    # OR
    gutenbergId: number (for Free Classics)
    options:
      targetLanguage?: string (ISO 639-1, default: source language)
      voicePreset?: "default" | "dramatic" | "calm" (default: "default")
  response: 200
    estimatedHours: number
    estimatedChapters: number
    estimatedCharacters: number
    detectedLanguage: string
    detectedTitle: string | null
    detectedAuthor: string | null
    translationSurcharge: number | null  # Extra hours for translation
    userBalance:
      subscription:
        hoursRemaining: number
      | null
      payAsYouGo: number
    canGenerate: boolean
    insufficientHours: number | null  # How many more hours needed
  errors:
    400: { error: "UNSUPPORTED_FORMAT", message: "File format not supported" }
    400: { error: "FILE_TOO_LARGE", message: "File exceeds 50MB limit" }
    400: { error: "DRM_PROTECTED", message: "This file is DRM-protected" }
    400: { error: "EMPTY_CONTENT", message: "Could not extract text from file" }

POST /api/v1/books/generate:
  description: Start audiobook generation
  headers:
    Authorization: Bearer <accessToken>
    Idempotency-Key: string (required, uuid)
  body:
    file: multipart/form-data
    # OR
    text: string
    # OR
    gutenbergId: number
    title?: string (auto-detected if not provided)
    author?: string (auto-detected if not provided)
    options:
      targetLanguage?: string
      voicePreset?: "default" | "dramatic" | "calm"
  response: 202
    jobId: string
    bookId: string
    status: "queued"
    estimatedMinutes: number
    position: number  # Queue position
  errors:
    400: { error: "VALIDATION_ERROR", message: "..." }
    402: { error: "INSUFFICIENT_HOURS", message: "Not enough hours", required: number }
    409: { error: "DUPLICATE_REQUEST", message: "Request already processing" }
    429: { error: "RATE_LIMIT", message: "Max 2 concurrent generations" }

GET /api/v1/jobs/{jobId}:
  description: Get generation job status
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    id: string
    bookId: string
    status: "queued" | "processing" | "completed" | "failed"
    progress: number (0-100)
    currentPhase: "parsing" | "analyzing" | "dramatizing" | "generating" | "finalizing"
    currentChapter: number | null
    totalChapters: number
    error: string | null
    startedAt: ISO8601 | null
    completedAt: ISO8601 | null
    estimatedRemainingMinutes: number | null
  errors:
    404: { error: "NOT_FOUND", message: "Job not found" }

POST /api/v1/jobs/{jobId}/cancel:
  description: Cancel a queued or processing job
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    success: true
    hoursRefunded: number
  errors:
    404: { error: "NOT_FOUND", message: "Job not found" }
    400: { error: "CANNOT_CANCEL", message: "Job already completed" }
```

---

## 6. Free Classics (Gutenberg) Endpoints

```yaml
POST /api/v1/classics/generate:
  description: Generate audiobook from Gutenberg book
  headers:
    Authorization: Bearer <accessToken>
    Idempotency-Key: string (required)
  body:
    gutenbergId: number (required)
    targetLanguage: string (required, ISO 639-1)
    voicePreset?: "default" | "dramatic" | "calm"
  response: 202
    jobId: string
    bookId: string
    status: "queued"
    estimatedMinutes: number
  errors:
    400: { error: "BOOK_NOT_FOUND", message: "Gutenberg book not found" }
    400: { error: "NO_TEXT_FORMAT", message: "No plain text available" }
    402: { error: "INSUFFICIENT_HOURS", message: "Not enough hours" }

# Note: Gutendex API (gutendex.com) is called directly from frontend
# Backend only handles: download → strip headers → process
```

---

## 7. Playback Sync Endpoints

```yaml
POST /api/v1/playback/position:
  description: Save playback position (called every 5s during playback)
  headers:
    Authorization: Bearer <accessToken>
  body:
    bookId: string (required)
    chapterIndex: number (required, 0-indexed)
    position: number (required, seconds)
    updatedAt: ISO8601 (required, client timestamp)
  response: 200
    success: true
  errors:
    404: { error: "NOT_FOUND", message: "Book not found" }

GET /api/v1/playback/position/{bookId}:
  description: Get last playback position for a book
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    chapterIndex: number
    position: number
    updatedAt: ISO8601
  errors:
    404: null  # Return null if no position saved, not an error

GET /api/v1/playback/positions:
  description: Get all playback positions (for sync on login)
  headers:
    Authorization: Bearer <accessToken>
  response: 200
    positions: Array<{
      bookId: string
      chapterIndex: number
      position: number
      updatedAt: ISO8601
    }>
```

---

## 8. Error Response Format

All errors follow this structure:

```typescript
interface ErrorResponse {
  error: string;      // Machine-readable error code
  message: string;    // Human-readable message
  details?: object;   // Additional context (validation errors, etc.)
  requestId?: string; // For debugging/support
}

// Example validation error
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": {
    "email": "Invalid email format",
    "password": "Must be at least 8 characters"
  },
  "requestId": "req_abc123"
}
```

### Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `UNSUPPORTED_FORMAT` | 400 | File format not supported |
| `FILE_TOO_LARGE` | 400 | File exceeds size limit |
| `DRM_PROTECTED` | 400 | File has DRM protection |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `INVALID_TOKEN` | 401 | Token expired or invalid |
| `INSUFFICIENT_HOURS` | 402 | Not enough generation hours |
| `NOT_FOUND` | 404 | Resource not found |
| `EMAIL_EXISTS` | 409 | Email already registered |
| `DUPLICATE_REQUEST` | 409 | Idempotent request duplicate |
| `RATE_LIMIT` | 429 | Too many requests |
| `GENERATION_FAILED` | 500 | Internal generation error |

---

## 9. Rate Limits

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Auth (login/register) | 10 | 15 min |
| API (authenticated) | 100 | 1 min |
| Generation (start) | 10 | 1 hour |
| Concurrent generations | 2 | per user |
| File upload | 20 | 1 hour |

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

---

## 10. Backend Services Implementation

### 10.1 Book Parser Service

```typescript
// services/bookParser.ts

import { parse as parseEpub } from 'epub-parser';
import { extract as extractMobi } from 'mobi-parser';
import { extract as extractPdf } from 'pdf-parse';
import mammoth from 'mammoth';

type SupportedFormat = 'txt' | 'epub' | 'mobi' | 'azw3' | 'pdf' | 'doc' | 'docx';

interface ParseResult {
  title: string | null;
  author: string | null;
  language: string | null;
  chapters: Array<{
    title: string;
    content: string;
  }>;
  totalCharacters: number;
}

export async function parseBook(
  buffer: Buffer,
  format: SupportedFormat,
  filename: string
): Promise<ParseResult> {
  switch (format) {
    case 'txt':
      return parseTxt(buffer, filename);
    case 'epub':
      return parseEpubFile(buffer);
    case 'mobi':
    case 'azw3':
      return parseMobi(buffer);
    case 'pdf':
      return parsePdfFile(buffer);
    case 'doc':
    case 'docx':
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

async function parseTxt(buffer: Buffer, filename: string): Promise<ParseResult> {
  const content = buffer.toString('utf-8');
  const lines = content.split('\n');
  
  // Try to detect title from first non-empty line
  const title = lines.find(l => l.trim().length > 0)?.trim() || 
                filename.replace(/\.txt$/i, '');
  
  // Split into chapters by common patterns
  const chapters = splitIntoChapters(content);
  
  return {
    title,
    author: null,
    language: detectLanguage(content),
    chapters,
    totalCharacters: content.length,
  };
}

async function parseEpubFile(buffer: Buffer): Promise<ParseResult> {
  const epub = await parseEpub(buffer);
  
  // Check for DRM
  if (epub.encryption) {
    throw new Error('DRM_PROTECTED');
  }
  
  return {
    title: epub.metadata.title,
    author: epub.metadata.creator,
    language: epub.metadata.language,
    chapters: epub.chapters.map(ch => ({
      title: ch.title || `Chapter ${ch.index}`,
      content: stripHtml(ch.content),
    })),
    totalCharacters: epub.chapters.reduce((sum, ch) => sum + ch.content.length, 0),
  };
}

async function parseMobi(buffer: Buffer): Promise<ParseResult> {
  const mobi = await extractMobi(buffer);
  
  // Check for DRM
  if (mobi.hasDrm) {
    throw new Error('DRM_PROTECTED');
  }
  
  return {
    title: mobi.title,
    author: mobi.author,
    language: mobi.language,
    chapters: mobi.chapters.map((ch, i) => ({
      title: ch.title || `Chapter ${i + 1}`,
      content: stripHtml(ch.content),
    })),
    totalCharacters: mobi.chapters.reduce((sum, ch) => sum + ch.content.length, 0),
  };
}

async function parsePdfFile(buffer: Buffer): Promise<ParseResult> {
  const pdf = await extractPdf(buffer);
  
  // PDFs don't have chapters, split by page or heuristics
  const chapters = splitIntoChapters(pdf.text);
  
  return {
    title: pdf.info?.Title || null,
    author: pdf.info?.Author || null,
    language: detectLanguage(pdf.text),
    chapters,
    totalCharacters: pdf.text.length,
  };
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const content = result.value;
  
  const chapters = splitIntoChapters(content);
  
  return {
    title: null,
    author: null,
    language: detectLanguage(content),
    chapters,
    totalCharacters: content.length,
  };
}

// Helper: Split content into chapters
function splitIntoChapters(content: string): Array<{ title: string; content: string }> {
  // Common chapter patterns
  const patterns = [
    /^(Chapter|CHAPTER|Kapitola|KAPITOLA|Kapitel)\s+(\d+|[IVXLC]+)/gm,
    /^(PART|Part|Část|Teil)\s+(\d+|[IVXLC]+)/gm,
    /^\d+\.\s+[A-Z]/gm,
  ];
  
  // Find chapter breaks
  let splits: number[] = [0];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      splits.push(match.index);
    }
  }
  
  // If no chapters found, split by approximate size (~10k chars)
  if (splits.length === 1) {
    const chunkSize = 10000;
    for (let i = chunkSize; i < content.length; i += chunkSize) {
      // Find nearest paragraph break
      const nearestBreak = content.indexOf('\n\n', i);
      if (nearestBreak > 0) {
        splits.push(nearestBreak);
      }
    }
  }
  
  splits.push(content.length);
  splits = [...new Set(splits)].sort((a, b) => a - b);
  
  // Extract chapters
  const chapters = [];
  for (let i = 0; i < splits.length - 1; i++) {
    const chapterContent = content.slice(splits[i], splits[i + 1]).trim();
    if (chapterContent.length > 100) { // Skip very short sections
      chapters.push({
        title: `Chapter ${i + 1}`,
        content: chapterContent,
      });
    }
  }
  
  return chapters;
}

// Helper: Detect language (simplified)
function detectLanguage(text: string): string {
  // Use first 1000 chars for detection
  const sample = text.slice(0, 1000).toLowerCase();
  
  // Common words by language
  const markers = {
    en: ['the', 'and', 'is', 'was', 'for', 'that'],
    cs: ['a', 'je', 'na', 'že', 'se', 'jako'],
    sk: ['a', 'je', 'na', 'že', 'sa', 'ako'],
    de: ['und', 'der', 'die', 'das', 'ist', 'für'],
    es: ['el', 'la', 'de', 'que', 'y', 'en'],
  };
  
  let maxScore = 0;
  let detectedLang = 'en';
  
  for (const [lang, words] of Object.entries(markers)) {
    const score = words.filter(w => sample.includes(` ${w} `)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }
  
  return detectedLang;
}

// Helper: Strip HTML tags
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}
```

### 10.2 Gutenberg Processor

```typescript
// services/gutenbergProcessor.ts

const PG_START_MARKERS = [
  '*** START OF THE PROJECT GUTENBERG',
  '*** START OF THIS PROJECT GUTENBERG',
  '*END*THE SMALL PRINT',
];

const PG_END_MARKERS = [
  '*** END OF THE PROJECT GUTENBERG',
  '*** END OF THIS PROJECT GUTENBERG',
  'End of the Project Gutenberg',
  'End of Project Gutenberg',
];

/**
 * Strip Project Gutenberg headers and footers
 * REQUIRED for legal compliance - removes PG trademark
 */
export function stripGutenbergHeaders(text: string): string {
  let cleanText = text;

  // Find and remove start header
  for (const marker of PG_START_MARKERS) {
    const startIdx = cleanText.indexOf(marker);
    if (startIdx !== -1) {
      // Find end of the START line
      const lineEnd = cleanText.indexOf('\n', startIdx);
      cleanText = cleanText.substring(lineEnd + 1);
      break;
    }
  }

  // Find and remove end footer
  for (const marker of PG_END_MARKERS) {
    const endIdx = cleanText.indexOf(marker);
    if (endIdx !== -1) {
      cleanText = cleanText.substring(0, endIdx);
      break;
    }
  }

  // Remove any remaining "Project Gutenberg" references
  cleanText = cleanText.replace(/Project Gutenberg/gi, '');
  
  // Clean up extra whitespace
  cleanText = cleanText.replace(/\n{4,}/g, '\n\n\n');

  return cleanText.trim();
}

/**
 * Download book from Gutenberg via Gutendex metadata
 */
export async function downloadGutenbergBook(gutenbergId: number): Promise<{
  title: string;
  author: string;
  language: string;
  content: string;
}> {
  // 1. Get metadata from Gutendex
  const metaResponse = await fetch(`https://gutendex.com/books/${gutenbergId}`);
  if (!metaResponse.ok) {
    throw new Error('BOOK_NOT_FOUND');
  }
  const metadata = await metaResponse.json();
  
  // 2. Get text format URL (prefer UTF-8)
  const textUrl = 
    metadata.formats['text/plain; charset=utf-8'] ||
    metadata.formats['text/plain; charset=us-ascii'] ||
    metadata.formats['text/plain'];
  
  if (!textUrl) {
    throw new Error('NO_TEXT_FORMAT');
  }
  
  // 3. Download content
  const textResponse = await fetch(textUrl);
  if (!textResponse.ok) {
    throw new Error('DOWNLOAD_FAILED');
  }
  const rawText = await textResponse.text();
  
  // 4. Strip PG headers (CRITICAL for legal compliance)
  const cleanContent = stripGutenbergHeaders(rawText);
  
  return {
    title: metadata.title,
    author: metadata.authors[0]?.name || 'Unknown',
    language: metadata.languages[0] || 'en',
    content: cleanContent,
  };
}
```

### 10.3 TTS Client (Gemini)

```typescript
// services/ttsClient.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface VoiceConfig {
  voiceId: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  style: 'default' | 'dramatic' | 'calm';
}

// Available Gemini voices
export const GEMINI_VOICES: VoiceConfig[] = [
  { voiceId: 'Aoede', name: 'Aoede', gender: 'female', style: 'default' },
  { voiceId: 'Charon', name: 'Charon', gender: 'male', style: 'dramatic' },
  { voiceId: 'Fenrir', name: 'Fenrir', gender: 'male', style: 'default' },
  { voiceId: 'Kore', name: 'Kore', gender: 'female', style: 'calm' },
  { voiceId: 'Puck', name: 'Puck', gender: 'neutral', style: 'default' },
  // ... more voices
];

interface TTSChunk {
  text: string;
  voiceId: string;
  type: 'narration' | 'dialogue';
  character?: string;
}

interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
}

export async function generateTTS(chunk: TTSChunk): Promise<TTSResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  // Configure voice and style
  const config = {
    voice: chunk.voiceId,
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0,
    },
  };
  
  // Generate audio
  const result = await model.generateContent({
    contents: [{ parts: [{ text: chunk.text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: chunk.voiceId,
          },
        },
      },
    },
  });
  
  // Extract audio data
  const audioData = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!audioData) {
    throw new Error('No audio generated');
  }
  
  const audioBuffer = Buffer.from(audioData.data, 'base64');
  
  // Estimate duration (MP3 at 128kbps)
  const durationMs = (audioBuffer.length * 8) / 128;
  
  return { audioBuffer, durationMs };
}

export async function generateChapterAudio(
  chunks: TTSChunk[],
  onProgress?: (progress: number) => void
): Promise<Buffer> {
  const audioBuffers: Buffer[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const result = await generateTTS(chunks[i]);
    audioBuffers.push(result.audioBuffer);
    
    if (onProgress) {
      onProgress(((i + 1) / chunks.length) * 100);
    }
    
    // Rate limiting - small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Concatenate audio buffers
  return Buffer.concat(audioBuffers);
}
```

### 10.4 Audio Streaming (Local Storage Model)

> **⚠️ ARCHITECTURE CHANGE:** Audio is stored LOCALLY on client devices only (MVP).
> No cloud storage for audio files. Server streams generated audio directly to client.

```typescript
// services/audioStreamService.ts

import { Response } from 'express';

/**
 * Stream audio chunks directly to client during generation
 * Client saves to local sandboxed storage
 * 
 * MVP Architecture:
 * - Audio generated on-demand by backend
 * - Streamed directly to client via SSE or chunked transfer
 * - Client saves to sandboxed Documents directory
 * - No server-side audio storage (no R2/S3/GCS)
 */

interface AudioChunk {
  chapterNumber: number;
  chunkIndex: number;
  totalChunks: number;
  audioBase64: string;  // Base64-encoded MP3 chunk
  durationMs: number;
}

/**
 * Stream audio generation progress to client
 * Uses Server-Sent Events for real-time updates
 */
export async function streamAudioToClient(
  res: Response,
  bookId: string,
  chapterNumber: number,
  chunks: string[],
  onChunkGenerated: (chunk: AudioChunk) => Promise<Buffer>
): Promise<void> {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  for (let i = 0; i < chunks.length; i++) {
    const audioBuffer = await onChunkGenerated({
      chapterNumber,
      chunkIndex: i,
      totalChunks: chunks.length,
      audioBase64: '',  // Will be filled by generator
      durationMs: 0
    });
    
    // Send chunk to client
    const chunkData: AudioChunk = {
      chapterNumber,
      chunkIndex: i,
      totalChunks: chunks.length,
      audioBase64: audioBuffer.toString('base64'),
      durationMs: estimateAudioDuration(audioBuffer)
    };
    
    res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
  }
  
  // Signal completion
  res.write(`data: ${JSON.stringify({ type: 'complete', chapterNumber })}\n\n`);
  res.end();
}

/**
 * Estimate audio duration from buffer size
 * Assumes 128kbps MP3 encoding
 */
function estimateAudioDuration(buffer: Buffer): number {
  const bitrate = 128000; // 128 kbps
  const bytes = buffer.length;
  return Math.round((bytes * 8 / bitrate) * 1000); // Duration in ms
}

/**
 * Generate signed temporary URL for audio download
 * Used for resumable downloads if streaming fails
 * Audio is cached temporarily on server (1 hour) then deleted
 */
export async function createTemporaryDownloadUrl(
  bookId: string,
  chapterNumber: number
): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 3600000; // 1 hour
  
  // Store in memory/Redis with auto-expiry
  // Client can use this URL to resume failed downloads
  return `/api/v1/audio/download/${bookId}/${chapterNumber}?token=${token}`;
}
```

**Client-Side Storage (React Native):**

```typescript
// services/localAudioStorage.ts (client-side)

import * as FileSystem from 'expo-file-system';

const AUDIO_BASE_DIR = FileSystem.documentDirectory + 'audiobooks/';

/**
 * Save audio chunk to local sandboxed storage
 * NOT visible in iOS Files app or Android file managers
 */
export async function saveAudioChunk(
  bookId: string,
  chapterNumber: number,
  audioBase64: string
): Promise<string> {
  const dirPath = `${AUDIO_BASE_DIR}${bookId}/`;
  const filePath = `${dirPath}chapter-${chapterNumber.toString().padStart(3, '0')}.mp3`;
  
  // Ensure directory exists
  await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  
  // Write audio file
  await FileSystem.writeAsStringAsync(filePath, audioBase64, {
    encoding: FileSystem.EncodingType.Base64
  });
  
  return filePath;
}

/**
 * Get local path for chapter audio
 */
export function getLocalAudioPath(bookId: string, chapterNumber: number): string {
  return `${AUDIO_BASE_DIR}${bookId}/chapter-${chapterNumber.toString().padStart(3, '0')}.mp3`;
}

/**
 * Check if chapter audio exists locally
 */
export async function hasLocalAudio(bookId: string, chapterNumber: number): Promise<boolean> {
  const path = getLocalAudioPath(bookId, chapterNumber);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

/**
 * Delete all audio for a book
 */
export async function deleteBookAudio(bookId: string): Promise<void> {
  const dirPath = `${AUDIO_BASE_DIR}${bookId}/`;
  await FileSystem.deleteAsync(dirPath, { idempotent: true });
}

/**
 * Get total storage used by audiobooks
 */
export async function getAudioStorageSize(): Promise<number> {
  const info = await FileSystem.getInfoAsync(AUDIO_BASE_DIR);
  if (!info.exists) return 0;
  
  // Recursively calculate directory size
  // Implementation depends on file system helper
  return calculateDirectorySize(AUDIO_BASE_DIR);
}
```

---

## 11. System Limits

| Limit | Value | Rationale |
|-------|-------|----------|
| Max file size | 50 MB | Prevents abuse, covers 99% of ebooks |
| Max chapters | 200 | Memory/processing limits |
| Max characters (text) | 2M chars | ~500k words, ~50hr audiobook |
| Max audio per book | 50 hours | Storage cost control |
| Max concurrent generations | 2 per user | Server capacity |
| Audio URL expiry | 24 hours | Security, forces re-auth |
| Free tier limit | 2 hours OR 14 days | Conversion funnel |

---

*Part 2 of 5 - Continue to Part 3: Mobile Implementation*
