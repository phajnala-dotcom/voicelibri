# 📱 React Native Frontend Setup Guide

## For Audiobook App (Based on homielab/audiobookapp)

This guide covers setting up a React Native frontend for your AI-powered audiobook application, using the `homielab/audiobookapp` template as a foundation.

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup (Windows)](#2-environment-setup-windows)
3. [Fork & Clone Template](#3-fork--clone-template)
4. [Project Structure Overview](#4-project-structure-overview)
5. [Backend Integration](#5-backend-integration)
6. [Core Dependencies](#6-core-dependencies)
7. [Development Workflow](#7-development-workflow)
8. [Building for Production](#8-building-for-production)
9. [App Store Deployment](#9-app-store-deployment)

---

## 1. Prerequisites

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20+ LTS | JavaScript runtime |
| npm | 10+ | Package manager |
| Git | Latest | Version control |
| VS Code | Latest | IDE |
| Android Studio | Latest | Android SDK & Emulator |
| JDK | 17 | Java Development Kit |

### Hardware Requirements (Windows)

- **RAM:** 16GB minimum (Android emulator is memory-hungry)
- **Storage:** 50GB+ free space
- **CPU:** Intel/AMD with virtualization support (HAXM/Hyper-V)

---

## 2. Environment Setup (Windows)

### Step 2.1: Install Node.js - DONE

```powershell
# Using winget (recommended)
winget install OpenJS.NodeJS.LTS

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Step 2.2: Install Git - DONE

```powershell
winget install Git.Git

# Configure Git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Step 2.3: Install Android Studio

1. Download from: https://developer.android.com/studio
2. Run installer with these components:
   - ✅ Android SDK
   - ✅ Android SDK Platform
   - ✅ Android Virtual Device
   - ✅ Performance (Intel HAXM or Hyper-V)

3. After installation, open Android Studio → SDK Manager:
   - Install **Android 14 (API 34)** SDK Platform
   - Install **Android SDK Build-Tools 34.0.0**
   - Install **Android Emulator**
   - Install **Android SDK Platform-Tools**

### Step 2.4: Configure Environment Variables

```powershell
# Add to System Environment Variables (run as Administrator)
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")

# Add to PATH
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$newPath = "$currentPath;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:LOCALAPPDATA\Android\Sdk\emulator"
[System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")

# Restart terminal and verify
adb --version
emulator -list-avds
```

### Step 2.5: Create Android Emulator

1. Open Android Studio → Virtual Device Manager
2. Create Device → Phone → Pixel 7 (or similar)
3. Select System Image → **API 34** (x86_64)
4. Name it: `Pixel_7_API_34`
5. Finish

### Step 2.6: Install VS Code Extensions

```powershell
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension msjsdiag.vscode-react-native
code --install-extension dsznajder.es7-react-js-snippets
```

---

## 3. Fork & Clone Template

### Step 3.1: Fork the Repository

1. Go to: https://github.com/homielab/audiobookapp
2. Click **Fork** button (top right)
3. Name your fork (e.g., `audiobook-mobile-app`)
4. Create fork

### Step 3.2: Clone Your Fork

```powershell
# Navigate to your projects directory
cd C:\Projects  # or wherever you keep projects

# Clone your fork
git clone https://github.com/YOUR_USERNAME/audiobook-mobile-app.git
cd audiobook-mobile-app

# Add upstream remote (for pulling updates from original)
git remote add upstream https://github.com/homielab/audiobookapp.git
```

### Step 3.3: Install Dependencies

```powershell
# Install npm packages
npm install

# For iOS (requires macOS)
# cd ios && pod install && cd ..
```

### Step 3.4: Verify Setup

```powershell
# Start Metro bundler
npm start

# In another terminal, run Android
npm run android
```

---

## 4. Project Structure Overview

```
audiobook-mobile-app/
├── android/                 # Native Android code
│   ├── app/
│   │   ├── build.gradle    # App-level build config
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── java/...    # Native modules (if needed)
│   └── build.gradle        # Project-level build config
│
├── ios/                     # Native iOS code (macOS only)
│   ├── Podfile             # CocoaPods dependencies
│   └── AudiobookApp/       # Xcode project
│
├── src/                     # Main application code
│   ├── components/         # Reusable UI components
│   │   ├── Player/         # Audio player components
│   │   ├── Library/        # Library/bookshelf components
│   │   └── Common/         # Shared components
│   │
│   ├── screens/            # Full screens/pages
│   │   ├── HomeScreen.tsx
│   │   ├── PlayerScreen.tsx
│   │   ├── LibraryScreen.tsx
│   │   └── SettingsScreen.tsx
│   │
│   ├── services/           # API & business logic
│   │   ├── api.ts          # Backend API client
│   │   ├── audioService.ts # Audio playback service
│   │   └── storageService.ts # Local storage
│   │
│   ├── store/              # State management
│   │   ├── index.ts        # Store configuration
│   │   ├── playerSlice.ts  # Player state
│   │   └── librarySlice.ts # Library state
│   │
│   ├── hooks/              # Custom React hooks
│   │   ├── usePlayer.ts
│   │   └── useLibrary.ts
│   │
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   │
│   ├── utils/              # Utility functions
│   │   └── helpers.ts
│   │
│   └── App.tsx             # Root component
│
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
├── metro.config.js         # Metro bundler config
├── babel.config.js         # Babel transpiler config
└── app.json                # App metadata
```

---

## 5. Backend Integration

### Step 5.1: Create API Client

Create `src/services/api.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';

// Configuration
const API_CONFIG = {
  // Development: Use your local IP (not localhost for emulator)
  development: 'http://10.0.2.2:3001', // Android emulator -> host machine
  // development: 'http://YOUR_LOCAL_IP:3001', // Physical device
  
  // Production: Your deployed backend
  production: 'https://api.yourdomain.com',
};

const BASE_URL = __DEV__ ? API_CONFIG.development : API_CONFIG.production;

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor (for auth tokens)
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    // const token = await AsyncStorage.getItem('authToken');
    // if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (for error handling)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ============ API ENDPOINTS ============

// Health check
export const checkHealth = () => api.get('/api/health');

// Books
export const getBooks = () => api.get('/api/books');
export const selectBook = (params: {
  filename: string;
  dramatize: boolean;
  narratorVoice: string;
  targetLanguage?: string;
}) => api.post('/api/book/select', params);
export const getBookInfo = () => api.get('/api/book/info');

// Audiobooks (Library)
export const getAudiobooks = () => api.get('/api/audiobooks');
export const getAudiobook = (bookTitle: string) => 
  api.get(`/api/audiobooks/${encodeURIComponent(bookTitle)}`);
export const getChapterAudio = (bookTitle: string, chapterIndex: number) =>
  api.get(`/api/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`, {
    responseType: 'arraybuffer',
  });

// Generation
export const startGeneration = (params: {
  bookFile: string;
  narratorVoice?: string;
  targetLanguage?: string;
}) => api.post('/api/audiobooks/generate', params);
export const getGenerationProgress = (bookTitle: string) =>
  api.get(`/api/audiobooks/${encodeURIComponent(bookTitle)}/progress`);

// User State
export const savePlaybackPosition = (bookTitle: string, position: {
  chapterIndex: number;
  position: number;
  timestamp: number;
}) => api.put(`/api/audiobooks/${encodeURIComponent(bookTitle)}/position`, position);
export const getPlaybackPosition = (bookTitle: string) =>
  api.get(`/api/audiobooks/${encodeURIComponent(bookTitle)}/position`);

// TTS Streaming
export const getTTSChunk = (params: {
  chapterIndex: number;
  subChunkIndex: number;
}) => api.post('/api/tts/chunk', params, { responseType: 'arraybuffer' });

export default api;
```

### Step 5.2: Install Required Packages

```powershell
# HTTP client
npm install axios

# Audio playback (critical for audiobook app)
npm install react-native-track-player

# State management
npm install zustand

# Navigation
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context

# Storage
npm install @react-native-async-storage/async-storage

# File system (for downloads)
npm install react-native-fs

# UI components
npm install react-native-vector-icons
npm install react-native-linear-gradient
```

### Step 5.3: Configure react-native-track-player

Create `src/services/audioService.ts`:

```typescript
import TrackPlayer, {
  Capability,
  Event,
  RepeatMode,
  State,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';

// Initialize player
export const setupPlayer = async () => {
  try {
    await TrackPlayer.setupPlayer({
      // Player options
      minBuffer: 15, // seconds
      maxBuffer: 50,
      playBuffer: 2.5,
      backBuffer: 0,
    });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpBackward,
        Capability.JumpForward,
      ],
      progressUpdateEventInterval: 1,
      // Jump intervals (in seconds)
      forwardJumpInterval: 30,
      backwardJumpInterval: 15,
    });

    return true;
  } catch (error) {
    console.error('Failed to setup player:', error);
    return false;
  }
};

// Add tracks (chapters)
export const addChaptersToQueue = async (chapters: Array<{
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
}>) => {
  await TrackPlayer.reset();
  await TrackPlayer.add(chapters);
};

// Playback controls
export const playAudio = () => TrackPlayer.play();
export const pauseAudio = () => TrackPlayer.pause();
export const seekTo = (seconds: number) => TrackPlayer.seekTo(seconds);
export const skipToNext = () => TrackPlayer.skipToNext();
export const skipToPrevious = () => TrackPlayer.skipToPrevious();
export const setPlaybackRate = (rate: number) => TrackPlayer.setRate(rate);

// Get current state
export const getPlayerState = async () => {
  const state = await TrackPlayer.getState();
  const position = await TrackPlayer.getPosition();
  const duration = await TrackPlayer.getDuration();
  const track = await TrackPlayer.getCurrentTrack();
  
  return { state, position, duration, track };
};

// Custom hooks for components
export { usePlaybackState, useProgress };
```

---

## 6. Core Dependencies

### package.json (key dependencies)

```json
{
  "name": "audiobook-mobile-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.81.0",
    
    "react-native-track-player": "^4.1.1",
    
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/stack": "^6.4.1",
    "react-native-screens": "^3.34.0",
    "react-native-safe-area-context": "^4.11.0",
    
    "zustand": "^4.5.5",
    
    "axios": "^1.7.7",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "react-native-fs": "^2.20.0",
    
    "react-native-vector-icons": "^10.2.0",
    "react-native-linear-gradient": "^2.8.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.79",
    "@types/react-native": "^0.73.0",
    "typescript": "^5.5.4",
    "@babel/core": "^7.25.2",
    "@babel/preset-env": "^7.25.4",
    "@babel/runtime": "^7.25.6",
    "metro-react-native-babel-preset": "^0.77.0"
  }
}
```

---

## 7. Development Workflow

### Daily Development Commands

```powershell
# Terminal 1: Start Metro bundler
npm start

# Terminal 2: Start Android emulator (if not running)
emulator -avd Pixel_7_API_34

# Terminal 3: Run app on Android
npm run android

# Clean build (when things break)
cd android && ./gradlew clean && cd ..
npm start --reset-cache
```

### Hot Reload Tips

- **Save file** → Auto-reload (Fast Refresh)
- **Shake device / Ctrl+M** → Dev menu
- **R R** in terminal → Full reload
- **D** → Open dev menu

### Debugging

```powershell
# Chrome DevTools
# 1. Shake device → "Debug"
# 2. Opens chrome://inspect

# React DevTools
npm install -g react-devtools
react-devtools

# Flipper (recommended)
# Download from: https://fbflipper.com/
```

### Common Issues & Fixes

```powershell
# Metro cache issues
npm start --reset-cache

# Android build cache issues
cd android && ./gradlew clean && cd ..

# Node modules issues
rm -rf node_modules
rm package-lock.json
npm install

# Android emulator can't connect to backend
# Use 10.0.2.2 instead of localhost
# Or use your machine's local IP (ipconfig)
```

---

## 8. Building for Production

### Android Release Build

#### Step 8.1: Generate Signing Key

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# Move to android/app
mv my-upload-key.keystore android/app/
```

#### Step 8.2: Configure Signing

Edit `android/gradle.properties`:

```properties
MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=*****
MYAPP_UPLOAD_KEY_PASSWORD=*****
```

Edit `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

#### Step 8.3: Build AAB (Android App Bundle)

```powershell
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### iOS Release Build (requires macOS)

```bash
# Install pods
cd ios && pod install && cd ..

# Open in Xcode
open ios/AudiobookApp.xcworkspace

# In Xcode:
# 1. Select "Any iOS Device" as target
# 2. Product → Archive
# 3. Distribute App → App Store Connect
```

---

## 9. App Store Deployment

### Google Play Store

1. **Create Developer Account** ($25 one-time)
   - https://play.google.com/console

2. **Create App Listing**
   - App name, description, category
   - Screenshots (phone: 1080x1920, tablet: 1920x1200)
   - Feature graphic (1024x500)
   - Privacy policy URL

3. **Upload AAB**
   - Production → Create release
   - Upload app-release.aab
   - Write release notes

4. **Content Rating**
   - Fill out questionnaire
   - Usually "Everyone" for audiobooks

5. **Review & Publish**
   - Takes 1-3 days for first review

### Apple App Store

1. **Create Developer Account** ($99/year)
   - https://developer.apple.com

2. **App Store Connect Setup**
   - Create App → Platform: iOS
   - Bundle ID must match Xcode project

3. **Upload from Xcode**
   - Archive → Distribute → App Store Connect

4. **App Store Listing**
   - Screenshots for each device size
   - App preview videos (optional)
   - Description, keywords, category

5. **Review & Publish**
   - Takes 1-7 days for first review

---

## 🔗 Quick Reference Links

- **React Native Docs:** https://reactnative.dev/docs/getting-started
- **React Navigation:** https://reactnavigation.org/docs/getting-started
- **Track Player:** https://rntp.dev/docs/basics/getting-started
- **Zustand:** https://docs.pmnd.rs/zustand/getting-started/introduction
- **Android Studio:** https://developer.android.com/studio
- **Play Console:** https://play.google.com/console
- **App Store Connect:** https://appstoreconnect.apple.com

---

## 📞 Support

If you encounter issues:

1. Check React Native docs
2. Search GitHub Issues on homielab/audiobookapp
3. Stack Overflow with tag `react-native`
4. React Native Discord community

---

*Last updated: January 2026*
