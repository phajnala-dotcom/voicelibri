# 📡 API Contract: Backend ↔ React Native Mobile App

## Version 1.0 | January 2026

This document defines the complete API contract between your TypeScript backend and the React Native mobile application.

---

## 📋 Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Common Types](#3-common-types)
4. [Endpoints](#4-endpoints)
   - [Health & Status](#41-health--status)
   - [Books & Library](#42-books--library)
   - [Audiobook Generation](#43-audiobook-generation)
   - [Audio Streaming](#44-audio-streaming)
   - [User State](#45-user-state)
   - [Settings](#46-settings)
5. [Error Handling](#5-error-handling)
6. [WebSocket Events](#6-websocket-events)
7. [Backend Implementation Notes](#7-backend-implementation-notes)

---

## 1. Overview

### Base URLs

```
Development:  http://10.0.2.2:3001    (Android emulator → host)
              http://localhost:3001   (iOS simulator)
              http://YOUR_IP:3001     (Physical device)

Production:   https://api.yourdomain.com
```

### Headers

```http
Content-Type: application/json
Authorization: Bearer <token>   # Future: when auth is implemented
X-App-Version: 1.0.0           # For version checking
X-Platform: android|ios        # For platform-specific handling
```

### Response Format

All responses follow this structure:

```typescript
// Success response
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-06T12:00:00Z",
    "requestId": "uuid"
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }  // Optional
  }
}
```

---

## 2. Authentication

> **Note:** Authentication is planned for future implementation. Current API is open.

### Future Authentication Flow

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

### Token Format (Future)

```typescript
interface AuthToken {
  accessToken: string;   // JWT, expires in 1 hour
  refreshToken: string;  // Expires in 30 days
  expiresAt: number;     // Unix timestamp
}
```

---

## 3. Common Types

### TypeScript Definitions

```typescript
// ============ CORE ENTITIES ============

interface Book {
  id: string;
  filename: string;
  title: string;
  author?: string;
  language?: string;
  format: 'txt' | 'epub';
  sizeBytes: number;
  chapters: number;
  createdAt: string;
}

interface Audiobook {
  id: string;
  bookId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  
  // Generation info
  status: 'pending' | 'generating' | 'completed' | 'failed';
  sourceLanguage?: string;
  targetLanguage?: string;
  narratorVoice: string;
  dramatized: boolean;
  
  // Content info
  chapters: AudiobookChapter[];
  totalDurationSeconds: number;
  totalSizeBytes: number;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface AudiobookChapter {
  index: number;          // 1-based chapter number
  title: string;
  durationSeconds: number;
  sizeBytes: number;
  subChunks: number;      // Number of sub-chunks
  audioUrl: string;       // Relative URL to audio file
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

interface PlaybackPosition {
  bookId: string;
  chapterIndex: number;
  positionSeconds: number;
  playbackSpeed: number;
  timestamp: string;      // Last updated
}

interface UserPreferences {
  defaultNarratorVoice: string;
  defaultTargetLanguage: string;
  defaultPlaybackSpeed: number;
  sleepTimerMinutes: number;
  skipSilenceEnabled: boolean;
  autoPlayNext: boolean;
  theme: 'light' | 'dark' | 'system';
}

interface GenerationProgress {
  bookId: string;
  status: 'pending' | 'translating' | 'dramatizing' | 'generating_audio' | 'completed' | 'failed';
  
  // Progress tracking
  totalChapters: number;
  completedChapters: number;
  currentChapter: number;
  
  // Detailed progress for current chapter
  currentChapterProgress: {
    phase: 'translating' | 'dramatizing' | 'tts';
    totalSubChunks: number;
    completedSubChunks: number;
  };
  
  // Timing
  startedAt: string;
  estimatedCompletionAt?: string;
  
  // Error info
  error?: {
    code: string;
    message: string;
    chapterIndex?: number;
  };
}

// ============ VOICE OPTIONS ============

interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  preview_url?: string;
}

interface Language {
  code: string;           // e.g., 'en-US', 'sk-SK'
  name: string;           // e.g., 'English (US)'
  nativeName: string;     // e.g., 'English'
}
```

---

## 4. Endpoints

### 4.1 Health & Status

#### `GET /api/health`

Check if backend is running and responsive.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "2.0.0",
    "uptime": 3600,
    "timestamp": "2026-01-06T12:00:00Z"
  }
}
```

#### `GET /api/status`

Get detailed system status.

**Response:**
```json
{
  "success": true,
  "data": {
    "services": {
      "tts": "operational",
      "llm": "operational",
      "storage": "operational"
    },
    "queue": {
      "pendingJobs": 2,
      "activeJobs": 1
    },
    "resources": {
      "diskSpaceAvailable": "50GB",
      "memoryUsage": "45%"
    }
  }
}
```

---

### 4.2 Books & Library

#### `GET /api/books`

List available source books (e-books) that can be converted.

**Response:**
```json
{
  "success": true,
  "data": {
    "books": [
      {
        "id": "book_123",
        "filename": "Harry Potter.txt",
        "title": "Harry Potter a kameň mudrcov",
        "author": "J.K. Rowling",
        "language": "sk",
        "format": "txt",
        "sizeBytes": 524288,
        "chapters": 17,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    ],
    "total": 1
  }
}
```

#### `GET /api/audiobooks`

List all audiobooks in user's library.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `completed`, `generating`, `all` |
| `sort` | string | Sort by: `title`, `createdAt`, `lastPlayed` |
| `order` | string | `asc` or `desc` |

**Response:**
```json
{
  "success": true,
  "data": {
    "audiobooks": [
      {
        "id": "ab_456",
        "bookId": "book_123",
        "title": "Harry Potter and the Philosopher's Stone",
        "author": "J.K. Rowling",
        "coverUrl": "/api/audiobooks/ab_456/cover",
        "status": "completed",
        "sourceLanguage": "sk",
        "targetLanguage": "en-US",
        "narratorVoice": "Achird",
        "dramatized": true,
        "chapters": [
          {
            "index": 1,
            "title": "Chapter 1",
            "durationSeconds": 1200,
            "sizeBytes": 2400000,
            "subChunks": 15,
            "audioUrl": "/api/audiobooks/ab_456/chapters/1/audio",
            "status": "completed"
          }
        ],
        "totalDurationSeconds": 36000,
        "totalSizeBytes": 72000000,
        "createdAt": "2026-01-05T10:00:00Z",
        "completedAt": "2026-01-05T12:00:00Z"
      }
    ],
    "total": 1
  }
}
```

#### `GET /api/audiobooks/:id`

Get detailed information about a specific audiobook.

**Response:**
```json
{
  "success": true,
  "data": {
    "audiobook": {
      "id": "ab_456",
      "bookId": "book_123",
      "title": "Harry Potter and the Philosopher's Stone",
      "author": "J.K. Rowling",
      "description": "The first book in the Harry Potter series...",
      "coverUrl": "/api/audiobooks/ab_456/cover",
      "status": "completed",
      "sourceLanguage": "sk",
      "targetLanguage": "en-US",
      "narratorVoice": "Achird",
      "dramatized": true,
      "voiceMap": {
        "NARRATOR": "Achird",
        "HARRY": "Puck",
        "HAGRID": "Orus"
      },
      "chapters": [...],
      "totalDurationSeconds": 36000,
      "totalSizeBytes": 72000000,
      "createdAt": "2026-01-05T10:00:00Z",
      "completedAt": "2026-01-05T12:00:00Z"
    }
  }
}
```

#### `DELETE /api/audiobooks/:id`

Delete an audiobook from library.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "freedBytes": 72000000
  }
}
```

---

### 4.3 Audiobook Generation

#### `POST /api/audiobooks/generate`

Start generating a new audiobook from source book.

**Request Body:**
```json
{
  "bookId": "book_123",
  "targetLanguage": "en-US",
  "narratorVoice": "Achird",
  "dramatize": true,
  "priority": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "audiobookId": "ab_456",
    "status": "pending",
    "estimatedDurationMinutes": 120,
    "queuePosition": 1
  }
}
```

#### `GET /api/audiobooks/:id/progress`

Get real-time generation progress.

**Response:**
```json
{
  "success": true,
  "data": {
    "bookId": "ab_456",
    "status": "generating_audio",
    "totalChapters": 17,
    "completedChapters": 5,
    "currentChapter": 6,
    "currentChapterProgress": {
      "phase": "tts",
      "totalSubChunks": 15,
      "completedSubChunks": 8
    },
    "startedAt": "2026-01-06T10:00:00Z",
    "estimatedCompletionAt": "2026-01-06T12:00:00Z"
  }
}
```

#### `POST /api/audiobooks/:id/cancel`

Cancel ongoing generation.

**Response:**
```json
{
  "success": true,
  "data": {
    "cancelled": true,
    "partialChapters": 5
  }
}
```

#### `POST /api/audiobooks/:id/regenerate-chapter`

Regenerate a specific chapter (for editing voices, fixing issues).

**Request Body:**
```json
{
  "chapterIndex": 5,
  "voiceOverrides": {
    "HARRY": "Fenrir"
  }
}
```

---

### 4.4 Audio Streaming

#### `GET /api/audiobooks/:id/chapters/:chapterIndex/audio`

Stream chapter audio file.

**Headers:**
```http
Range: bytes=0-1048575  # Optional: for range requests
```

**Response:**
- Content-Type: `audio/mpeg` or `audio/wav`
- Supports HTTP Range Requests for seeking

#### `GET /api/audiobooks/:id/chapters/:chapterIndex/subchunks/:subChunkIndex`

Stream individual sub-chunk (for real-time playback during generation).

**Response:**
- Content-Type: `audio/wav`
- Smaller files for faster streaming

#### `HEAD /api/audiobooks/:id/chapters/:chapterIndex/audio`

Get audio file metadata without downloading.

**Response Headers:**
```http
Content-Length: 2400000
Content-Type: audio/mpeg
Accept-Ranges: bytes
X-Duration-Seconds: 1200
```

---

### 4.5 User State

#### `GET /api/user/position/:bookId`

Get saved playback position for a book.

**Response:**
```json
{
  "success": true,
  "data": {
    "position": {
      "bookId": "ab_456",
      "chapterIndex": 5,
      "positionSeconds": 342.5,
      "playbackSpeed": 1.25,
      "timestamp": "2026-01-06T11:30:00Z"
    }
  }
}
```

#### `PUT /api/user/position/:bookId`

Save playback position (should be called periodically during playback).

**Request Body:**
```json
{
  "chapterIndex": 5,
  "positionSeconds": 342.5,
  "playbackSpeed": 1.25
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "saved": true,
    "timestamp": "2026-01-06T11:30:00Z"
  }
}
```

#### `GET /api/user/history`

Get recently played audiobooks.

**Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "bookId": "ab_456",
        "title": "Harry Potter",
        "coverUrl": "/api/audiobooks/ab_456/cover",
        "lastPlayed": "2026-01-06T11:30:00Z",
        "progress": 0.35,
        "chapterIndex": 5,
        "positionSeconds": 342.5
      }
    ]
  }
}
```

---

### 4.6 Settings

#### `GET /api/voices`

Get available TTS voices.

**Response:**
```json
{
  "success": true,
  "data": {
    "voices": [
      {
        "id": "Achird",
        "name": "Achird",
        "gender": "male",
        "language": "en-US",
        "preview_url": "/api/voices/Achird/preview"
      },
      {
        "id": "Aoede",
        "name": "Aoede",
        "gender": "female",
        "language": "en-US",
        "preview_url": "/api/voices/Aoede/preview"
      }
    ]
  }
}
```

#### `GET /api/languages`

Get supported languages for translation.

**Response:**
```json
{
  "success": true,
  "data": {
    "languages": [
      {
        "code": "en-US",
        "name": "English (US)",
        "nativeName": "English"
      },
      {
        "code": "sk-SK",
        "name": "Slovak",
        "nativeName": "Slovenčina"
      },
      {
        "code": "cs-CZ",
        "name": "Czech",
        "nativeName": "Čeština"
      }
    ]
  }
}
```

#### `GET /api/user/preferences`

Get user preferences.

**Response:**
```json
{
  "success": true,
  "data": {
    "preferences": {
      "defaultNarratorVoice": "Achird",
      "defaultTargetLanguage": "en-US",
      "defaultPlaybackSpeed": 1.0,
      "sleepTimerMinutes": 30,
      "skipSilenceEnabled": false,
      "autoPlayNext": true,
      "theme": "dark"
    }
  }
}
```

#### `PUT /api/user/preferences`

Update user preferences.

**Request Body:**
```json
{
  "defaultPlaybackSpeed": 1.25,
  "sleepTimerMinutes": 45
}
```

---

## 5. Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | Not allowed to access resource |
| `NOT_FOUND` | 404 | Resource not found |
| `BOOK_NOT_FOUND` | 404 | Specified book doesn't exist |
| `AUDIOBOOK_NOT_FOUND` | 404 | Specified audiobook doesn't exist |
| `CHAPTER_NOT_FOUND` | 404 | Chapter index out of range |
| `GENERATION_IN_PROGRESS` | 409 | Audiobook is already being generated |
| `GENERATION_FAILED` | 500 | Audiobook generation failed |
| `TTS_ERROR` | 500 | Text-to-speech service error |
| `LLM_ERROR` | 500 | Language model service error |
| `STORAGE_ERROR` | 500 | File storage error |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "BOOK_NOT_FOUND",
    "message": "The requested book could not be found",
    "details": {
      "bookId": "invalid_id"
    }
  }
}
```

### Client Error Handling

```typescript
// React Native error handler
async function apiCall<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const apiError = error.response?.data?.error;
      
      switch (apiError?.code) {
        case 'UNAUTHORIZED':
          // Redirect to login
          navigation.navigate('Login');
          break;
        case 'RATE_LIMITED':
          // Show retry message
          Alert.alert('Please wait', 'Too many requests. Try again later.');
          break;
        case 'GENERATION_FAILED':
          // Show failure message with option to retry
          Alert.alert('Generation Failed', apiError.message, [
            { text: 'Retry', onPress: () => retryGeneration() },
            { text: 'Cancel', style: 'cancel' }
          ]);
          break;
        default:
          // Generic error
          Alert.alert('Error', apiError?.message || 'Something went wrong');
      }
    }
    throw error;
  }
}
```

---

## 6. WebSocket Events

For real-time updates during audiobook generation.

### Connection

```typescript
const ws = new WebSocket('ws://api.yourdomain.com/ws');

ws.onopen = () => {
  // Subscribe to book generation events
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'generation',
    bookId: 'ab_456'
  }));
};
```

### Event Types

#### `generation.progress`

```json
{
  "type": "generation.progress",
  "bookId": "ab_456",
  "data": {
    "status": "generating_audio",
    "currentChapter": 6,
    "completedChapters": 5,
    "totalChapters": 17,
    "subChunkProgress": {
      "current": 8,
      "total": 15
    }
  }
}
```

#### `generation.chapter_complete`

```json
{
  "type": "generation.chapter_complete",
  "bookId": "ab_456",
  "data": {
    "chapterIndex": 5,
    "durationSeconds": 1200,
    "audioUrl": "/api/audiobooks/ab_456/chapters/5/audio"
  }
}
```

#### `generation.complete`

```json
{
  "type": "generation.complete",
  "bookId": "ab_456",
  "data": {
    "totalDurationSeconds": 36000,
    "totalChapters": 17
  }
}
```

#### `generation.error`

```json
{
  "type": "generation.error",
  "bookId": "ab_456",
  "data": {
    "code": "TTS_ERROR",
    "message": "Failed to generate audio for chapter 6",
    "chapterIndex": 6
  }
}
```

---

## 7. Backend Implementation Notes

### Required Changes to Current Backend

#### 7.1 New Endpoints to Add

```typescript
// Add to apps/backend/src/index.ts

// ============ MOBILE API ROUTES ============

// Books listing
app.get('/api/books', async (req, res) => {
  // Return list of source e-books from assets directory
});

// Audiobooks CRUD
app.get('/api/audiobooks', async (req, res) => {
  // List all audiobooks with metadata
});

app.get('/api/audiobooks/:id', async (req, res) => {
  // Get detailed audiobook info
});

app.delete('/api/audiobooks/:id', async (req, res) => {
  // Delete audiobook and free storage
});

// Streaming endpoints
app.get('/api/audiobooks/:id/chapters/:chapterIndex/audio', async (req, res) => {
  // Stream audio with Range request support
  const range = req.headers.range;
  if (range) {
    // Partial content response for seeking
  }
});

app.head('/api/audiobooks/:id/chapters/:chapterIndex/audio', async (req, res) => {
  // Return metadata without body
});

// User state persistence
app.get('/api/user/position/:bookId', async (req, res) => { ... });
app.put('/api/user/position/:bookId', async (req, res) => { ... });
app.get('/api/user/preferences', async (req, res) => { ... });
app.put('/api/user/preferences', async (req, res) => { ... });

// Configuration endpoints
app.get('/api/voices', async (req, res) => {
  // Return available Gemini TTS voices
});

app.get('/api/languages', async (req, res) => {
  // Return supported translation languages
});
```

#### 7.2 Response Wrapper Helper

```typescript
// Add to apps/backend/src/utils/response.ts

export function successResponse<T>(data: T, meta?: object) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function errorResponse(code: string, message: string, details?: object) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

// Usage:
app.get('/api/books', async (req, res) => {
  try {
    const books = await getBooks();
    res.json(successResponse({ books, total: books.length }));
  } catch (error) {
    res.status(500).json(errorResponse('SERVER_ERROR', error.message));
  }
});
```

#### 7.3 Audio Streaming with Range Support

```typescript
// Add to apps/backend/src/utils/streaming.ts

import fs from 'fs';
import path from 'path';

export async function streamAudioFile(
  filePath: string,
  req: Request,
  res: Response
) {
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // Parse Range header
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg',
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    // Full file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    });

    fs.createReadStream(filePath).pipe(res);
  }
}
```

#### 7.4 User State Storage

```typescript
// Add to apps/backend/src/services/userStateService.ts

import fs from 'fs';
import path from 'path';

const USER_STATE_DIR = path.join(process.cwd(), 'user_state');

interface PlaybackPosition {
  bookId: string;
  chapterIndex: number;
  positionSeconds: number;
  playbackSpeed: number;
  timestamp: string;
}

export async function savePlaybackPosition(
  userId: string, // Future: when auth is implemented
  bookId: string,
  position: Omit<PlaybackPosition, 'bookId' | 'timestamp'>
): Promise<void> {
  const data: PlaybackPosition = {
    bookId,
    ...position,
    timestamp: new Date().toISOString(),
  };
  
  const filePath = path.join(USER_STATE_DIR, `${bookId}_position.json`);
  await fs.promises.mkdir(USER_STATE_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function getPlaybackPosition(
  bookId: string
): Promise<PlaybackPosition | null> {
  const filePath = path.join(USER_STATE_DIR, `${bookId}_position.json`);
  
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}
```

---

## 📝 Implementation Checklist

### Backend Changes Required

- [ ] Add `/api/books` endpoint (list source e-books)
- [ ] Add `/api/audiobooks` endpoints (CRUD)
- [ ] Add audio streaming with Range request support
- [ ] Add `/api/user/position` endpoints
- [ ] Add `/api/user/preferences` endpoints
- [ ] Add `/api/voices` endpoint
- [ ] Add `/api/languages` endpoint
- [ ] Implement response wrapper helpers
- [ ] Add WebSocket support for real-time progress
- [ ] Add CORS configuration for mobile app

### Frontend (React Native) Implementation

- [ ] Create API client service
- [ ] Implement audio player with react-native-track-player
- [ ] Create library screen with audiobook list
- [ ] Create player screen with controls
- [ ] Implement playback position sync
- [ ] Add generation progress UI
- [ ] Implement offline playback support
- [ ] Add settings screen

---

*API Contract Version: 1.0*
*Last Updated: January 2026*
