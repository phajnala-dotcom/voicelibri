# VoiceLibri Mobile App Development Guide
## Comprehensive Technical Specification for AI-Powered Multi-Voice Audiobook Generation

**Document Version:** 3.0  
**App Name:** VoiceLibri  
**Target Platforms:** iOS, Android, PWA (testing)  
**Last Updated:** January 6, 2026  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Requirements](#2-product-requirements)
3. [Technology Stack Decisions](#3-technology-stack-decisions)
4. [Architecture Overview](#4-architecture-overview)
5. [API Contract v2.0](#5-api-contract-v20)
6. [Mobile App Implementation](#6-mobile-app-implementation)
7. [Backend Refactoring Guide](#7-backend-refactoring-guide)
8. [Design System](#8-design-system)
9. [Development Phases](#9-development-phases)
10. [AI Development Instructions](#10-ai-development-instructions)
11. [Appendices](#appendices)

---

## 1. Executive Summary

### 1.1 Project Vision

**VoiceLibri** transforms any ebook into a professional multi-voice audiobook using AI. Unlike existing TTS apps that produce robotic single-voice output, VoiceLibri creates an immersive listening experience with distinct character voices, emotional narration, and natural pacing.

**Target Market:** 
- Avid readers who want to consume more books
- Commuters and multitaskers
- People with visual impairments or reading difficulties
- Language learners wanting native pronunciation
- Users of TXT, EPUB, MOBI, AZW3/KF8, PDF, DOC, and DOCX files

### 1.2 Competitive Analysis

| Feature | VoiceLibri | Audible | Speechify | Voice Dream | ElevenLabs |
|---------|------------|---------|-----------|-------------|------------|
| **Multi-voice AI** | âś… Yes | âťŚ Human only | âťŚ Single voice | âťŚ Single voice | âś… Yes |
| **Character detection** | âś… Auto | N/A | âťŚ No | âťŚ No | âťŚ Manual |
| **Own books** | âś… Any format | âťŚ Audible only | âś… Yes | âś… Yes | âś… Yes |
| **Price model** | Hours-based | Per book | $139/year | $14.99 once | Per character |
| **Offline playback** | âś… Yes | âś… Yes | âś… Yes | âś… Yes | âťŚ No |
| **Translation** | âś… Yes | âťŚ No | âś… Yes | âťŚ No | âťŚ No |
| **Formats supported** | 7 formats | 1 (AAX) | 5 formats | 6 formats | Text only |

### 1.3 Competitor Deep Dive

#### Speechify (Market Leader in TTS)
**Pricing:** $139/year or $11.58/month (annual only on mobile)
**Strengths:**
- Excellent OCR for scanned documents
- Celebrity voice clones (Snoop Dogg, Gwyneth Paltrow)
- Chrome extension for web reading
- Fast processing

**Weaknesses:**
- Single voice only (no character differentiation)
- Expensive for casual users
- No dialogue detection
- Robotic for fiction

**Our Advantage:** Multi-voice dramatization makes fiction actually enjoyable. Speechify is great for articles/textbooks, terrible for novels.

#### Voice Dream Reader
**Pricing:** $14.99 one-time (iOS), $9.99 (Android) + voice packs
**Strengths:**
- Mature, stable app (10+ years)
- Excellent accessibility features
- Works with many formats
- One-time purchase model

**Weaknesses:**
- Outdated UI
- Uses older TTS engines
- No cloud sync between devices
- Single voice only

**Our Advantage:** Modern AI voices that don't sound like robots. Cloud sync. Character voices.

#### ElevenLabs Reader
**Pricing:** Free tier (10k chars/month), $5-$22/month for more
**Strengths:**
- Best-in-class voice quality
- Voice cloning capability
- Emotional range

**Weaknesses:**
- Character-based pricing (expensive for books)
- No automatic character detection
- Manual voice assignment
- Web-focused, mobile app limited

**Our Advantage:** Automatic character detection + hour-based pricing makes full books affordable. 50,000 word novel â‰ 300k characters = $60+ on ElevenLabs vs ~$4 on VoiceLibri.

#### Audible
**Pricing:** $14.95/month for 1 credit, books $15-40 each
**Strengths:**
- Largest audiobook library
- Professional narration
- Established user base

**Weaknesses:**
- Only Audible content (no own books)
- Expensive per book
- No customization

**Our Advantage:** Bring your own books. Generate audiobooks from any source.

### 1.4 Our Unique Value Proposition

1. **Automatic Character Detection** - AI identifies speaking characters
2. **Multi-Voice Dramatization** - Each character gets a unique voice
3. **Affordable Hour-Based Pricing** - Pay for listening time, not characters
4. **Any Ebook Format** - TXT, EPUB, MOBI, AZW3/KF8, PDF, DOC, DOCX (DRM-free)
5. **Translation Built-In** - Listen to foreign books in your language

---

## 2. Product Requirements

### 2.1 Supported Ebook Formats

| Format | Extension | Support Level | Notes |
|--------|-----------|---------------|-------|
| Plain Text | .txt | âś… Full | Native support |
| EPUB | .epub | âś… Full | Most common ebook format |
| MOBI | .mobi | âś… Full | Older Kindle format (DRM-free only) |
| AZW3/KF8 | .azw3, .azw | âś… Full | Modern Kindle format (DRM-free only) |
| PDF | .pdf | âš ď¸Ź Good | Text extraction, layout may vary |
| Word Doc | .doc | âš ď¸Ź Good | Legacy format |
| Word DocX | .docx | âś… Full | Modern Word documents |

**DRM Note:** Kindle books with DRM cannot be processed. Users must provide DRM-free files. We will display a clear error message: *"This file appears to be DRM-protected. Please provide a DRM-free version."*

### 2.2 Pricing Model (CRITICAL - Platform Compliant)

> **âš ď¸Ź IMPORTANT:** All in-app purchases MUST go through App Store (iOS) or Play Store (Android). No external payment links in-app.

#### Pricing Tiers

| Tier | Monthly Price | Hours Included | Per-Hour Value | Best For |
|------|---------------|----------------|----------------|----------|
| **Free Trial** | $0 | 2 hours OR 14 days | - | Try before buy |
| **Standard** | $7.99/month | 20 hours | $0.40/hr | Casual readers |
| **Premium** | $17.99/month | 50 hours | $0.36/hr | Avid readers |
| **Pay-as-you-go** | $0.50/hour | As needed | $0.50/hr | Occasional use |

#### Pay-As-You-Go (PAYG) Options

**Two PAYG Scenarios:**

1. **Standalone PAYG (No subscription)**
   - User has NO active subscription
   - Pays $0.50 per hour for any book generation
   - Good for: Users who only generate 1-2 books per year
   - Hour packs: 5 hours ($2.50), 15 hours ($7.50), 30 hours ($15)

2. **Overage PAYG (Subscription + Extra)**
   - User HAS Standard or Premium subscription
   - After monthly hours depleted, PAYG kicks in automatically
   - Same rate: $0.50/hour
   - Example: Premium user (50 hrs) wants to generate 60-hour audiobook
     - First 50 hours: Included in subscription
     - Next 10 hours: $5.00 overage charge

**UI Flow for Overage:**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              đź“š Generate Audiobook                      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Estimated length: 12.5 hours                          â”‚
â”‚                                                        â”‚
â”‚  Your balance:                                         â”‚
â”‚  â”śâ”€ Subscription: 8.2 hours remaining                  â”‚
â”‚  â””â”€ Pay-as-you-go: 0 hours                            â”‚
â”‚                                                        â”‚
â”‚  âš ď¸Ź You need 4.3 more hours                           â”‚
â”‚                                                        â”‚
â”‚  Options:                                              â”‚
â”‚  â—‹ Add 5 hours ($2.50) â† Recommended                  â”‚
â”‚  â—‹ Add 15 hours ($7.50)                               â”‚
â”‚  â—‹ Upgrade to Premium ($17.99/mo for 50 hrs)          â”‚
â”‚                                                        â”‚
â”‚  [Continue with 5-hour pack]                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### Annual Plans (Deferred to Phase 2)

| Plan | Annual Price | Monthly Equivalent | Savings |
|------|--------------|-------------------|---------|
| Standard Annual | $79.99/year | $6.67/month | 17% off |
| Premium Annual | $179.99/year | $15/month | 17% off |

**Why deferred:** Apple's IAP review process is slower for annual subscriptions. Launch with monthly to iterate faster.

### 2.3 Free Trial Mechanics

**Two-pronged approach to prevent abuse:**

1. **Time-limited:** 14 days from account creation
2. **Usage-limited:** Maximum 2 hours of generated audio

**Whichever comes first ends the trial.**

**Why both limits?**
- Time-only: User creates account, waits, creates another â†’ abuse
- Hours-only: User never uses trial hours, returns months later â†’ complexity
- Both: Clear expectation, fair usage, simple to explain

**Trial UI Copy:**
> "Your free trial includes 2 hours of audiobook generation, valid for 14 days. Generate your first book today!"

### 2.4 Price Justification

**Our Costs per Hour of Generated Audio:**
- Gemini TTS API: ~$0.08/hour
- LLM (character detection): ~$0.02/hour
- Server compute: ~$0.05/hour
- Storage (R2): ~$0.01/hour
- **Total COGS: ~$0.16/hour**

**Gross Margins:**
| Plan | Price/Hour | COGS | Gross Margin |
|------|------------|------|--------------|
| Standard | $0.40 | $0.16 | 60% |
| Premium | $0.36 | $0.16 | 56% |
| PAYG | $0.50 | $0.16 | 68% |

After Apple/Google's 15-30% cut, margins remain healthy at 30-50%.

### 2.5 MVP Feature Scope

#### âś… Must Have (MVP)
- User registration/login (email + social)
- Upload ebook (TXT, EPUB, MOBI, AZW3, PDF, DOC, DOCX)
- Generate audiobook with multi-voice AI
- Audio player with standard controls
- Background playback
- Chapter navigation
- Playback speed control (0.5x - 2.0x)
- Download for offline listening
- Subscription management (Standard + Premium)
- Pay-as-you-go purchases
- Basic error handling

#### âŹł Should Have (Post-MVP)
- Book library organization (folders, tags)
- Bookmarks within audio
- Sleep timer
- CarPlay / Android Auto
- Share audiobook (deep link)
- Translation feature
- Push notifications (generation complete)

#### âťŚ Won't Have (Out of Scope)
- Social features (reviews, sharing)
- Audiobook marketplace
- Voice cloning (legal complexity)
- Real-time streaming (always download first)
- DRM support (legal complexity)

### 2.6 Platform-Specific Requirements

#### iOS (App Store)
- **Payments:** All digital content purchases through IAP
- **External Links:** Cannot link to web payment (Steering Rule relaxed but risky)
- **Free Trial:** Can offer auto-renewable subscription with trial
- **PAYG:** Consumable IAP for hour packs

#### Android (Play Store)  
- **Payments:** Digital content through Play Billing (can use Stripe for physical goods)
- **Alternative Billing:** Allowed in EU (7% reduced fee) but complex
- **Recommendation:** Use Play Billing for simplicity

#### PWA (Web)
- **Payments:** Stripe directly (no platform cut!)
- **Use Case:** Testing, web fallback, desktop users
- **Limitation:** No background audio when browser closed

### 2.7 RevenueCat Integration

> **RevenueCat Configuration:** Single source of truth for entitlements and subscription management across iOS/Android.

**Configuration exports and initializes RevenueCat SDK with the app's public API key. Creates a Purchases instance that connects to RevenueCat servers on app launch. The SDK automatically handles receipt validation, subscription status synchronization, and platform-specific IAP flows for both iOS and Android.**

### 2.8 Retry Policy for API Calls

**Implements exponential backoff strategy for failed API requests. Base delay of 1 second doubles with each retry up to 3 attempts (1s, 2s, 4s maximum). Only retries server errors (5xx) and network failures. Returns last error after all retries exhausted. Configurable via RetryConfig interface for different endpoint requirements.**

### 2.9 User Flow: First-Time Experience

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  1. ONBOARDING (3 screens max)                                              â”‚
â”‚     â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                   â”‚
â”‚     â”‚   đźŽ§ AI      â”‚  â”‚  đź“š Upload   â”‚  â”‚  đźŽ­ Multi   â”‚                   â”‚
â”‚     â”‚  Audiobooks  â”‚  â”‚  Any Ebook   â”‚  â”‚   Voice     â”‚                   â”‚
â”‚     â”‚              â”‚  â”‚              â”‚  â”‚             â”‚                   â”‚
â”‚     â”‚ Transform    â”‚  â”‚ TXT, EPUB,   â”‚  â”‚ Characters  â”‚                   â”‚
â”‚     â”‚ your books   â”‚  â”‚ PDF & more   â”‚  â”‚ come alive  â”‚                   â”‚
â”‚     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                   â”‚
â”‚           â—Ź                â—‹                  â—‹           [Get Started]    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  2. SIGN UP                                                                  â”‚
â”‚     â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚     â”‚  Create your account                                          â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  [  Continue with Google  ]                                   â”‚        â”‚
â”‚     â”‚  [  Continue with Apple   ]                                   â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ or â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                                â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  Email: [________________________]                            â”‚        â”‚
â”‚     â”‚  Password: [____________________]                             â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  [  Create Account  ]                                         â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  Already have an account? Sign in                            â”‚        â”‚
â”‚     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  3. EMPTY LIBRARY (First launch)                                            â”‚
â”‚     â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚     â”‚                         đź“š                                    â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚              Your library is empty                            â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚       Upload your first ebook to get started                  â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚            [ + Upload Ebook ]                                 â”‚        â”‚
â”‚     â”‚                                                               â”‚        â”‚
â”‚     â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€            â”‚        â”‚
â”‚     â”‚  đź†“ Free trial: 2 hours of audio generation                   â”‚        â”‚
â”‚     â”‚     Valid for 14 days                                         â”‚        â”‚
â”‚     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚                                                                              â”‚
â”‚     [Library]        [Generate]        [Settings]                           â”‚
â”‚         â—Ź                â—‹                  â—‹                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.10 Progressive Web App (PWA) Strategy

#### Why PWA First?

1. **Rapid Testing:** Deploy and iterate without App Store review cycles
2. **Cost Savings:** No $99 Apple Developer fee during testing
3. **Universal Access:** Testers can use any device with a browser
4. **Shared Codebase:** Core logic (API calls, state) reusable in React Native
5. **Fallback:** Desktop users can use PWA permanently

#### PWA Scope (Limited)

| Feature | PWA Support | Notes |
|---------|-------------|-------|
| Authentication | âś… Full | Supabase works everywhere |
| Library browsing | âś… Full | Standard web UI |
| Book generation | âś… Full | Same API |
| Audio playback | âš ď¸Ź Limited | No background play when tab closed |
| Offline playback | âš ď¸Ź Limited | Service worker caching, but less reliable |
| Push notifications | âš ď¸Ź Limited | Web Push API, Safari quirky |
| File upload | âś… Full | All 7 formats |
| Payments | âś… Full | Stripe direct (no App Store cut!) |

#### PWA Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Framework | React + TypeScript | Same as React Native knowledge |
| Styling | Tailwind CSS | Same utility classes as NativeWind |
| State | TanStack Query + Zustand | Identical to mobile |
| Audio | Web Audio API / Howler.js | Browser-native |
| Routing | React Router | Standard SPA routing |
| Build | Vite | Fast builds, good PWA support |
| Hosting | Vercel or Netlify | Free tier, automatic HTTPS |

#### PWA Folder Structure

> **PWA Project Structure:** Standard Vite React TypeScript project with PWA capabilities. Root contains index.html entry point, Vite and TypeScript configurations, and Tailwind setup. The src directory mirrors the mobile app structure: main.tsx bootstraps the React app, App.tsx provides root layout with QueryClient and auth providers, pages folder contains route components (Library, Generate, Player, Settings, Auth), components folder has reusable UI elements (BookCard, AudioPlayer, FileUploader), hooks folder contains custom hooks matching mobile (useLibrary, usePlayer, useAuth, useGeneration), services folder has API client and audio player wrapper using Web Audio API/Howler.js, stores folder contains Zustand stores for player and settings state. The public folder holds PWA manifest.json for installability and service-worker.js for offline caching.

### 2.11 Internet Archive Integration (Public Domain Books)

> **Purpose:** Let users discover and generate audiobooks from free, public domain books directly in the app.

#### Feature Overview

| Aspect | Details |
|--------|---------|
| Source | Internet Archive's Open Library |
| Content | Public domain books (pre-1928 US, varies by country) |
| Formats | EPUB, PDF, plain text |
| Cost to user | Free (just uses their generation hours) |
| Legal status | Public domain = no copyright issues |

#### User Flow

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Generate Tab                                                                â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  [ Upload Your Ebook ]                                                  â”‚â”‚
â”‚  â”‚                                                                          â”‚â”‚
â”‚  â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ or â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                                   â”‚â”‚
â”‚  â”‚                                                                          â”‚â”‚
â”‚  â”‚  đź“š Browse Free Public Domain Books                                      â”‚â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚â”‚
â”‚  â”‚  â”‚  đź”Ť [Search classic literature...                    ] [Search] â”‚   â”‚â”‚
â”‚  â”‚  â”‚                                                                  â”‚   â”‚â”‚
â”‚  â”‚  â”‚  Popular Classics:                                               â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”           â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â”‚ đź“–       â”‚ â”‚ đź“–       â”‚ â”‚ đź“–       â”‚ â”‚ đź“–       â”‚           â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â”‚ Pride &  â”‚ â”‚ Moby     â”‚ â”‚ Dracula  â”‚ â”‚ Sherlock â”‚           â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â”‚ Prejudiceâ”‚ â”‚ Dick     â”‚ â”‚          â”‚ â”‚ Holmes   â”‚           â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â”‚ Austen   â”‚ â”‚ Melville â”‚ â”‚ Stoker   â”‚ â”‚ Doyle    â”‚           â”‚   â”‚â”‚
â”‚  â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”           â”‚   â”‚â”‚
â”‚  â”‚  â”‚                                                                  â”‚   â”‚â”‚
â”‚  â”‚  â”‚  [Browse Full Catalog â†’]                                        â”‚   â”‚â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### Internet Archive API Integration

> **Internet Archive Service:** TypeScript service class with three main functions: (1) searchBooks performs text search against Open Library API, accepting query string and optional limit parameter, returns array of ArchiveBook objects with title, author, year, formats, and coverUrl; (2) getBookDetails fetches detailed book information by Open Library ID including description and available download URLs for EPUB, PDF, and text formats; (3) isPublicDomain checks publication year against 1928 threshold for US public domain status. All functions use standard fetch API with error handling and response parsing.

> **Archive Browser Component:** React Native functional component providing searchable UI for Internet Archive. Maintains state for search query, results array, loading status, and selected book. Features TextInput for search with debounced API calls, FlatList rendering BookCard components for results, and onSelect callback prop when user chooses a book. Styled with NativeWind classes for dark theme consistency. Includes empty state messaging and loading indicators.

#### Legal Considerations

| Concern | Our Approach |
|---------|--------------|
| Copyright status | Only show pre-1928 works (US safe) |
| International users | Display disclaimer about local laws |
| Internet Archive ToS | Read-only API use, compliant |
| Attribution | Show "Sourced from Internet Archive" |

**Disclaimer Text (in app):**
> "These books are in the public domain in the United States. Copyright laws vary by country. Please verify public domain status in your jurisdiction before generating."

### 2.12 Share Sheet / File Import (Mobile)

> **Purpose:** Allow users to import ebooks from other apps via iOS Share Sheet or Android Intent.

#### Supported Import Sources

| Source | iOS | Android | Formats |
|--------|-----|---------|---------|
| Files app | âś… | âś… | All 7 |
| Email attachments | âś… | âś… | All 7 |
| Cloud drives (Dropbox, GDrive) | âś… | âś… | All 7 |
| Kindle app | âťŚ | âťŚ | DRM blocks |
| Safari downloads | âś… | N/A | All 7 |
| Chrome downloads | N/A | âś… | All 7 |

#### iOS Configuration (app.json)

> **iOS Share Extension Configuration:** Expo app.json plugins section configures iOS document types via CFBundleDocumentTypes. Declares app can open files with extensions: txt, epub, mobi, azw3, azw, pdf, doc, docx. Each format maps to appropriate UTI (Uniform Type Identifier) such as public.plain-text, org.idpf.epub-container, application/pdf, etc. This enables the app to appear in iOS Share Sheet and "Open In" menus when users interact with supported file types in other apps.

#### Android Configuration

> **Android Intent Filter Configuration:** AndroidManifest.xml intent-filter declares the app can receive files via ACTION_VIEW and ACTION_SEND intents. Specifies MIME types for all supported formats: text/plain, application/epub+zip, application/x-mobipocket-ebook, application/pdf, application/msword, and application/vnd.openxmlformats-officedocument.wordprocessingml.document. The BROWSABLE and DEFAULT categories ensure the app appears in Android's app chooser when users open or share supported file types from file managers, email clients, or browsers.

#### Handling Incoming Files

> **useIncomingFile Hook:** Custom React hook using Expo Linking API to handle files opened via Share Sheet or Intent. On mount, registers URL event listener and checks for initial URL. When file URL detected, extracts filename from path, copies file to app's cache directory using expo-file-system, updates component state with local file URI. Returns object containing file (with uri and name), loading boolean, and error state. Cleans up event listener on unmount. Enables seamless "Open In VoiceLibri" workflow from any app.

### 2.13 Settings Screen Structure

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Settings                                                                    â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚                                                                              â”‚
â”‚  ACCOUNT                                                                     â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đź‘¤  john@example.com                                           [Edit] â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đź’ł  Subscription: Premium                                              â”‚â”‚
â”‚  â”‚      41.5 hours remaining Â· Renews Jan 15                       [Manage]â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đźŽ  Pay-as-you-go: 5.0 hours                            [Purchase More]â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  PLAYBACK                                                                    â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đźŽšď¸Ź  Default Speed                                               1.0x  â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  âŹ©  Skip Forward Duration                                        30s  â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  âŹŞ  Skip Back Duration                                           15s  â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đź”Š  Volume Boost                                                [OFF] â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  GENERATION                                                                  â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đźŽ­  Default Voice Style                                       Dramatic â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đźŚŤ  Default Output Language                                    English â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  STORAGE                                                                     â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đź’ľ  Downloaded Audiobooks                                      2.4 GB  â”‚â”‚
â”‚  â”‚      12 books                                              [Manage â†’]  â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đź—‘ď¸Ź  Clear Cache                                               128 MB  â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  RESOURCES                                                                   â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đź“š  Free Ebook Sources                                              â†’ â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  âť“  Help & FAQ                                                      â†’ â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đź“§  Contact Support                                                 â†’ â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  LEGAL                                                                       â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đź“„  Privacy Policy                                                  â†’ â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  đź“„  Terms of Service                                                â†’ â”‚â”‚
â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚  â”‚  â„ąď¸Ź  App Version                                              1.0.0 (1) â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  [Sign Out]                                                                  â”‚
â”‚                                                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.14 Book Settings & Voice Preview

> **Purpose:** Allow users to customize voice settings per book before generation.

#### Book Settings Screen

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Book Settings                                                             â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚                                                                              â”‚
â”‚  đź“– "Pride and Prejudice"                                                    â”‚
â”‚  by Jane Austen                                                              â”‚
â”‚  Estimated: 12.5 hours Â· 61 chapters                                         â”‚
â”‚                                                                              â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚                                                                              â”‚
â”‚  VOICE STYLE                                                                 â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  â—‹ Default     - Balanced narration                                     â”‚â”‚
â”‚  â”‚  â—Ź Dramatic    - Expressive, emotional delivery                         â”‚â”‚
â”‚  â”‚  â—‹ Calm        - Soft, relaxed tone                                     â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  NARRATOR VOICE                                                              â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  Selected: Aria (Female, British)                          [Change â†’]  â”‚â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”           â”‚â”‚
â”‚  â”‚  â”‚  â–¶  "It is a truth universally acknowledged..."  0:05   â”‚           â”‚â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”           â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  OUTPUT LANGUAGE                                                             â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  đźŚŤ English (Original)                                      [Change â†’]  â”‚â”‚
â”‚  â”‚                                                                          â”‚â”‚
â”‚  â”‚  âš ď¸Ź Translation adds ~20% to generation time                            â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚                                                                              â”‚
â”‚  COST ESTIMATE                                                               â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  Hours required:        12.5 hrs                                        â”‚â”‚
â”‚  â”‚  Your balance:          41.5 hrs (Premium)                              â”‚â”‚
â”‚  â”‚  Remaining after:       29.0 hrs                                        â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚                    [  Generate Audiobook  ]                              â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### Voice Selection Modal

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Select Narrator Voice                                              [Done]  â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚                                                                              â”‚
â”‚  đź”Ť [Search voices...                                            ]          â”‚
â”‚                                                                              â”‚
â”‚  RECOMMENDED FOR THIS BOOK                                                   â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  â—Ź Aria        Female Â· British Â· Warm                         â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ James       Male Â· British Â· Authoritative                  â–¶ 0:05  â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚                                                                              â”‚
â”‚  ALL VOICES                                                                  â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚  â”‚  Female Voices                                                          â”‚â”‚
â”‚  â”‚  â—‹ Aria        British Â· Warm                                  â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ Zephyr      American Â· Bright                               â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ Nova        American Â· Professional                         â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ Luna        Spanish Â· Melodic                               â–¶ 0:05  â”‚â”‚
â”‚  â”‚                                                                          â”‚â”‚
â”‚  â”‚  Male Voices                                                            â”‚â”‚
â”‚  â”‚  â—‹ Orion       American Â· Deep                                 â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ James       British Â· Authoritative                         â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ Felix       German Â· Clear                                  â–¶ 0:05  â”‚â”‚
â”‚  â”‚  â—‹ Marcus      American Â· Friendly                             â–¶ 0:05  â”‚â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### Voice Preview Component

> **VoiceSelector Component:** React Native functional component for selecting TTS voices with preview capability. Displays list of available voices (fetched from API or hardcoded) with name, gender, accent, and description. Each voice row includes play button that calls previewVoice function to generate and play a short sample phrase via Gemini TTS. Currently playing voice shows loading spinner and stop button. Selected voice highlighted with primary color. Props: selectedVoice (current selection), onSelect (callback with voice ID), bookTitle (for contextual preview text). Uses react-native-audio-pro for preview playback. Memoizes voice list for performance.

### 2.15 Localization Support

> **Purpose:** Support multiple languages for UI and potential future markets.

#### Supported Languages (MVP)

| Language | Code | Market Priority | Status |
|----------|------|-----------------|--------|
| English | en | Primary | âś… Default |
| Slovak | sk | Home market | âś… MVP |
| Czech | cs | Adjacent market | âś… MVP |

#### i18next Setup

> **i18next Configuration:** Initializes internationalization using i18next with react-i18next bindings and expo-localization for device language detection. Configuration sets fallback language to English, enables interpolation escaping for security, and loads translation resources for en, sk, and cs locales. The initialization detects device locale via getLocales()[0].languageCode and attempts to match supported languages. Returns configured i18n instance for use with I18nextProvider wrapper component.

> **Translation JSON Files:** Separate JSON files for each locale (en.json, sk.json, cs.json) containing nested translation keys. Structure includes common section (appName: "VoiceLibri"), tabs (library, generate, settings), library screen strings (title, emptyTitle, emptySubtitle, booksCount with interpolation), generation strings (uploadTitle, uploadSubtitle with format list, estimatedHours, generateButton), and player strings (nowPlaying, chapter, speed, sleepTimer). Keys match across all locale files for consistency. Interpolation syntax uses double curly braces: {{count}}, {{formats}}.

---

## 3. Technology Stack Decisions

### 3.1 Framework: Expo with Development Builds

**Decision: Expo SDK 53+ with Development Builds (NOT Expo Go)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Expo Go | Zero config, instant testing | Limited native modules | âťŚ Can't use audio library |
| **Expo Dev Build** | Full native access, EAS builds | Longer build times | âś… Best balance |
| Bare React Native | Full control | Manual linking, no EAS | âťŚ Overkill |

**Why Development Builds:**
- `react-native-audio-pro` requires native code (not in Expo Go)
- EAS Build handles iOS/Android compilation in cloud
- Still get Expo's excellent DX (hot reload, easy config)
- Can add any native module when needed

### 3.2 Audio Player: react-native-audio-pro

**Decision: react-native-audio-pro (NOT expo-av, NOT react-native-track-player)**

| Library | Background Play | Lock Screen | Stability | Last Update |
|---------|-----------------|-------------|-----------|-------------|
| expo-av | âťŚ Limited | âťŚ No | âš ď¸Ź Issues | Active |
| react-native-track-player | âś… Yes | âś… Yes | âš ď¸Ź Maintainer issues | Sporadic |
| **react-native-audio-pro** | âś… Yes | âś… Yes | âś… Stable | Active |

**Key Features We Need:**
- Background playback (app minimized)
- Lock screen controls (iOS/Android)
- Chapter/track management
- Playback speed control (0.5x - 2.0x)
- Sleep timer support
- Offline file playback

> **react-native-audio-pro Usage:** Creates AudioPlayer instance with event callbacks for progress updates (position/duration in milliseconds), playback state changes (playing/paused/stopped/buffering), and track changes. loadTrack method accepts audio file URL/path with metadata (title, artist, album, artwork URL) for lock screen display. Player methods include play(), pause(), seekTo(ms), setRate(speed), and skipToNext()/skipToPrevious() for playlist navigation. Supports both remote URLs and local file:// paths for offline playback.

### 3.3 Local Storage Strategy

**Three-tier storage approach:**

| Storage | Technology | Use Case | Size Limit |
|---------|------------|----------|------------|
| Fast KV | MMKV | Settings, tokens, playback position | ~50MB |
| Structured | WatermelonDB | Book metadata, chapters, sync queue | ~500MB |
| Files | expo-file-system | Audio files (MP3) | Device limit |

> **MMKV Setup:** Initializes MMKV storage instance with unique app identifier for isolation. Provides type-safe wrapper functions for common operations: getString/setString for auth tokens and IDs, getNumber/setNumber for playback positions and settings, getBoolean/setBoolean for feature flags. MMKV is synchronous and significantly faster than AsyncStorage, suitable for frequently accessed data like current playback position. Encryption can be enabled by passing encryption key to constructor.

> **WatermelonDB Schema:** Defines SQLite-backed database schema with three tables. Books table: id (string), title, author, coverPath (nullable), totalDuration (number), chapterCount (number), status (string: ready/generating/error), generatedAt (number timestamp), isDownloaded (boolean), with index on status. Chapters table: id, bookId (foreign key indexed), number, title, duration, audioUrl, audioPath (nullable for downloaded files), isDownloaded boolean. PlaybackProgress table: id, bookId (indexed), chapterId, position (seconds), updatedAt (timestamp), synced (boolean) for offline sync queue. Schema version tracked for migrations.

### 3.4 State Management

**Decision: Zustand + TanStack Query (NOT Redux, NOT Context alone)**

| Concern | Solution | Why |
|---------|----------|-----|
| Server state | TanStack Query | Caching, refetching, mutations |
| UI state | Zustand | Simple, no boilerplate |
| Persistent state | MMKV (via Zustand persist) | Fast, synchronous |

> **Zustand playerStore:** Creates typed store using Zustand's create function with PlayerState interface. State includes: currentBookId (string|null), currentChapter (number), isPlaying (boolean), position (number in seconds), duration (number), playbackSpeed (number, default 1.0). Actions: setCurrentBook(id, chapter) updates book context, updateProgress(pos, dur) updates playback state, setPlaybackState(playing) toggles play/pause, setPlaybackSpeed(speed) changes rate. Lightweight alternative to Redux with no action creators or reducers needed.

> **TanStack Query Hooks:** Custom hooks wrapping useQuery for data fetching. useBooks hook fetches paginated book list from /api/v1/books with 5-minute staleTime, returns books array, loading/error states, and fetchNextPage function for infinite scroll. useBook(id) fetches single book details with chapters, enabled only when id is truthy. useGenerationStatus(jobId) polls /api/v1/jobs/{jobId} every 2 seconds while status is 'processing', auto-stops on completion/error. All hooks use typed API client with proper error handling.

### 3.5 UI Framework: NativeWind v4

**Decision: NativeWind (Tailwind for React Native)**

| Option | Learning Curve | Performance | Consistency |
|--------|---------------|-------------|-------------|
| StyleSheet | Low | Best | Manual |
| Styled Components | Medium | Good | Good |
| **NativeWind** | Low (if know Tailwind) | Good | Great (web parity) |

**Why NativeWind:**
- Same classes as web Tailwind (mental model reuse)
- Dark mode built-in
- Responsive design utilities
- Active development, v4 stable

> **NativeWind tailwind.config.js:** Extends default Tailwind configuration for React Native. Content array points to all TSX files in src folder. Theme extends colors with primary palette (50-900 blue shades for brand), dark background variants (primary #0f0f23, secondary #1a1a2e, tertiary #16213e for elevation), and surface colors for cards. Requires nativewind/preset in presets array. Works with babel-preset-expo configured with jsxImportSource: "nativewind" for automatic className support on React Native components.

> **BookCard Component:** Functional React Native component demonstrating NativeWind styling. Uses styled() wrapper from nativewind for Pressable to enable className prop. Outer container has bg-surface-secondary, rounded-xl, p-4, flex-row, gap-4 classes with active:opacity-80 for press feedback. Contains Image with fixed dimensions (w-20 h-28) and rounded corners, flex-1 View for text content with justify-center. Title uses text-white font-semibold text-lg with numberOfLines={2} for truncation. Author in text-gray-400 text-sm. Duration badge uses semi-transparent primary background (bg-primary-500/20) with matching text color. Conditional rendering for "Generating..." status indicator.
### 3.6 Navigation: Expo Router v3

**Decision: Expo Router (file-based routing)**

> **Expo Router Folder Structure:** File-based routing under src/app directory. _layout.tsx files define nested layouts. Root index.tsx redirects to /library or /auth based on auth state. (auth) group contains login.tsx and register.tsx with shared auth layout. (tabs) group configures bottom tab navigation with _layout.tsx defining tab bar, containing library.tsx (main screen), generate.tsx (upload & generate), and settings.tsx. Dynamic routes: book/[id].tsx for book detail/player screen, player/[id].tsx for full-screen playback. Brackets denote dynamic segments extracted via useLocalSearchParams hook.

### 3.7 Authentication: Supabase Auth

**Decision: Supabase Auth (NOT Firebase, NOT custom)**

| Option | Cost | Setup | Features |
|--------|------|-------|----------|
| Firebase Auth | Free tier | Medium | Full suite |
| **Supabase Auth** | Free tier | Easy | Email, Social, Magic Link |
| Custom JWT | â‚¬0 | Hard | Full control |

**Why Supabase:**
- Generous free tier (50k MAU)
- Built-in social auth (Google, Apple)
- Works great with React Native
- Can self-host later if needed

---

## 4. Architecture Overview

### 4.1 System Architecture

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                              MOBILE APP                                      â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚  â”‚   Library   â”‚  â”‚  Generator  â”‚  â”‚   Player    â”‚  â”‚  Settings   â”‚        â”‚
â”‚  â”‚    Screen   â”‚  â”‚   Screen    â”‚  â”‚   Screen    â”‚  â”‚   Screen    â”‚        â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚         â”‚                â”‚                â”‚                â”‚                â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚  â”‚                    STATE MANAGEMENT                             â”‚        â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â”‚  â”‚   Zustand   â”‚  â”‚  TanStack   â”‚  â”‚    MMKV     â”‚             â”‚        â”‚
â”‚  â”‚  â”‚  (UI State) â”‚  â”‚   Query     â”‚  â”‚  (Persist)  â”‚             â”‚        â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚                             â”‚                                               â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚  â”‚                    LOCAL STORAGE                                â”‚        â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â”‚  â”‚ WatermelonDBâ”‚  â”‚    Expo     â”‚  â”‚   Audio     â”‚             â”‚        â”‚
â”‚  â”‚  â”‚ (Metadata)  â”‚  â”‚ FileSystem  â”‚  â”‚   Player    â”‚             â”‚        â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â”‚ HTTPS (REST + SSE)
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                              BACKEND API                                     â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚  â”‚                     Express.js Server                            â”‚        â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â”‚  â”‚    Auth     â”‚  â”‚  Generation â”‚  â”‚   Library   â”‚             â”‚        â”‚
â”‚  â”‚  â”‚ Controller  â”‚  â”‚ Controller  â”‚  â”‚ Controller  â”‚             â”‚        â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â”‚         â”‚                â”‚                â”‚                      â”‚        â”‚
â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â”‚  â”‚              Service Layer                     â”‚             â”‚        â”‚
â”‚  â”‚  â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚             â”‚        â”‚
â”‚  â”‚  â”‚  â”‚ Chunker  â”‚ â”‚ TTS      â”‚ â”‚ Dramatizeâ”‚       â”‚             â”‚        â”‚
â”‚  â”‚  â”‚  â”‚ Service  â”‚ â”‚ Service  â”‚ â”‚ Service  â”‚       â”‚             â”‚        â”‚
â”‚  â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚             â”‚        â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚        â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”‚
â”‚                                                                              â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                   â”‚
â”‚  â”‚   Supabase    â”‚  â”‚  Cloudflare   â”‚  â”‚    Stripe     â”‚                   â”‚
â”‚  â”‚   (Auth+DB)   â”‚  â”‚  R2 (Storage) â”‚  â”‚  (Payments)   â”‚                   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                           EXTERNAL SERVICES                                  â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                       â”‚
â”‚  â”‚  Gemini API   â”‚  â”‚  Gemini API   â”‚                                       â”‚
â”‚  â”‚  (TTS 2.5)    â”‚  â”‚  (LLM Flash)  â”‚                                       â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 4.2 Data Flow: Book Generation

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  1. USER UPLOADS EBOOK                                                       â”‚
â”‚     â””â”€â–ş POST /api/v1/books/estimate                                         â”‚
â”‚         â””â”€â–ş Response: { estimatedHours: 8.5, estimatedCost: "8.5 hours" }   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  2. USER CONFIRMS GENERATION                                                 â”‚
â”‚     â””â”€â–ş POST /api/v1/books/generate                                         â”‚
â”‚         â”śâ”€â–ş Deduct hours from balance                                       â”‚
â”‚         â”śâ”€â–ş Create job record                                               â”‚
â”‚         â””â”€â–ş Return: { jobId: "abc123", status: "queued" }                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  3. BACKGROUND PROCESSING (Server)                                           â”‚
â”‚     â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”‚
â”‚     â”‚  a) Parse ebook (chapters, metadata)                        â”‚         â”‚
â”‚     â”‚  b) Clean text (remove artifacts, normalize)                â”‚         â”‚
â”‚     â”‚  c) Detect characters (LLM analysis)                        â”‚         â”‚
â”‚     â”‚  d) Dramatize (assign voices to dialogue)                   â”‚         â”‚
â”‚     â”‚  e) Generate TTS (parallel per chapter)                     â”‚         â”‚
â”‚     â”‚  f) Upload audio to R2                                      â”‚         â”‚
â”‚     â”‚  g) Update job status                                       â”‚         â”‚
â”‚     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  4. APP POLLS FOR STATUS / RECEIVES SSE                                      â”‚
â”‚     â””â”€â–ş GET /api/v1/jobs/{jobId}/status                                     â”‚
â”‚         â””â”€â–ş Response: { status: "processing", progress: 45, chapter: 3 }    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                    â”‚
                                    â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  5. GENERATION COMPLETE                                                      â”‚
â”‚     â””â”€â–ş Push notification to app                                            â”‚
â”‚     â””â”€â–ş App downloads chapter audio files                                   â”‚
â”‚     â””â”€â–ş Store in local filesystem                                           â”‚
â”‚     â””â”€â–ş Update WatermelonDB                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 4.3 Offline-First Strategy

**Principle:** App must work fully offline after initial download.

> **SyncManager Class:** Service class managing offline-first data synchronization. downloadBook(bookId, onProgress) method iterates through book chapters, downloads each audio file to local filesystem path (documentDirectory/audiobooks/{bookId}/{chapterId}.mp3), reports combined progress across all chapters, and updates WatermelonDB chapter records with local audioPath and isDownloaded flag. syncProgress() method queries unsynced PlaybackProgress records (where synced=false), batches them into single API call, and marks as synced on success. Failures are logged but not thrownâ€”will retry on next sync. Uses expo-file-system downloadAsync with progress callback for download tracking.

---

## 5. API Contract v2.0

### 5.1 API Design Principles

1. **Idempotency:** All mutating requests accept `Idempotency-Key` header
2. **Pagination:** All list endpoints use cursor-based pagination
3. **Rate Limiting:** Clear limits with `X-RateLimit-*` headers
4. **Caching:** ETags for conditional requests
5. **Versioning:** URL path versioning (`/api/v1/`, `/api/v2/`)

### 5.2 Authentication

**All endpoints require `Authorization: Bearer <token>` except:**
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

**Token Format:** JWT with 1-hour expiry, refresh token with 30-day expiry.

### 5.3 Core Endpoints

#### Authentication

> **Auth Endpoints (YAML Specification):**
> 
> **POST /api/v1/auth/register** - Creates new user account. Request body requires email (string) and password (string, min 8 chars). Returns user object (id, email, createdAt), accessToken (JWT), and refreshToken.
> 
> **POST /api/v1/auth/login** - Authenticates existing user. Request body: email and password. Returns user object with subscription and hoursBalance, plus accessToken and refreshToken.
> 
> **POST /api/v1/auth/refresh** - Refreshes expired access token. Request body: refreshToken string. Returns new accessToken and rotated refreshToken.
> 
> **POST /api/v1/auth/social** - Social authentication. Request body: provider ("google" | "apple") and idToken from OAuth flow. Returns same structure as login.

#### User & Subscription

> **User & Subscription Endpoints (YAML Specification):**
> 
> **GET /api/v1/user/profile** - Returns authenticated user's profile. Response includes: id, email, subscription object (plan: "free"|"pro"|"none", expiresAt ISO8601 or null, hoursIncluded, hoursUsed), hoursBalance (pay-as-you-go balance), createdAt timestamp.
> 
> **POST /api/v1/user/subscription** - Creates or updates subscription. Requires Idempotency-Key header. Body: plan ("pro_monthly"|"pro_annual") and paymentMethodId (Stripe). Returns subscription object and receiptUrl.
> 
> **POST /api/v1/user/purchase-hours** - Purchases PAYG hour pack. Requires Idempotency-Key header. Body: package ("5_hours"|"15_hours"|"30_hours") and paymentMethodId. Returns hoursAdded, new hoursBalance, and receiptUrl.

#### Library Management

> **Library Endpoints (YAML Specification):**
> 
> **GET /api/v1/books** - Lists user's audiobook library. Query params: cursor (optional pagination), limit (default 20, max 100), status filter ("all"|"ready"|"generating"|"error"). Supports If-None-Match header for caching. Returns books array with id, title, author, coverUrl, totalDuration (seconds), chapterCount, status, progress (0-100 if generating), createdAt. Also returns nextCursor, totalCount. Response headers include ETag and X-RateLimit-* headers.
> 
> **GET /api/v1/books/{bookId}** - Gets single book details. Returns full book object with chapters array (each chapter: id, number, title, duration, audioUrl as signed URL with 24h expiry), characters array (name, voiceId, voiceName, lineCount), generatedAt, hoursUsed.
> 
> **DELETE /api/v1/books/{bookId}** - Deletes book and audio files. Returns success boolean and hoursRefunded (if deleted within 24h of generation).

#### Book Generation

> **Generation Endpoints (YAML Specification):**
> 
> **POST /api/v1/books/estimate** - Estimates generation cost before committing. Body: file (multipart) OR text (raw string), options object with translateTo (ISO 639-1 code or null) and voicePreset ("default"|"dramatic"|"calm"). Returns: estimatedHours, estimatedChapters, estimatedCharacters, detectedLanguage, translationSurcharge (if applicable), userBalance object (subscription hours remaining + PAYG balance), canGenerate boolean, insufficientHours (number if can't generate).
> 
> **POST /api/v1/books/generate** - Starts audiobook generation. Requires Idempotency-Key header. Body: file or text, optional title/author, options. Returns: jobId, bookId, status "queued", estimatedMinutes, queue position.
> 
> **GET /api/v1/jobs/{jobId}** - Polls job status. Returns: id, bookId, status ("queued"|"processing"|"completed"|"failed"), progress (0-100), currentPhase ("parsing"|"analyzing"|"dramatizing"|"generating"|"finalizing"), currentChapter, totalChapters, error message if failed, startedAt, completedAt timestamps.
> 
> **GET /api/v1/jobs/{jobId}/stream** - Server-Sent Events endpoint for real-time progress. Content-Type: text/event-stream. Events: "progress" (data: progress, phase, chapter), "complete" (data: bookId, totalDuration), "error" (data: message, code).

#### Playback Sync

> **Sync Endpoints (YAML Specification):**
> 
> **POST /api/v1/sync/progress** - Batch syncs playback positions. Body: updates array of objects (bookId, chapterId, position in seconds, updatedAt ISO8601). Returns: synced count, conflicts array (bookId, serverPosition, serverUpdatedAt) for client-side resolution.
> 
> **GET /api/v1/sync/progress/{bookId}** - Gets server's playback position for a book. Returns: bookId, chapterId, position, updatedAt.

### 5.4 Error Response Format

> **Error Response JSON Structure:** All errors return consistent format with "error" object containing: code (string constant like "INSUFFICIENT_HOURS"), message (human-readable string like "You need 5.2 more hours to generate this book"), and optional details object with contextual data (e.g., required hours, available hours, purchaseUrl for resolution).

**Standard Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Valid token but no permission |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `INSUFFICIENT_HOURS` | 402 | Not enough hours balance |
| `RATE_LIMITED` | 429 | Too many requests |
| `GENERATION_FAILED` | 500 | TTS/LLM error during generation |
| `FILE_TOO_LARGE` | 413 | Ebook exceeds size limit |
| `UNSUPPORTED_FORMAT` | 415 | File format not supported |

### 5.5 Rate Limits

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Authentication | 10 | 1 minute |
| Estimates | 30 | 1 minute |
| Generation | 5 | 1 hour |
| Library reads | 100 | 1 minute |
| Progress sync | 60 | 1 minute |

### 5.6 Offline Sync & Conflict Resolution

**Strategy: Last-Write-Wins with Client Priority for Playback**

Playback position is user-critical; we trust the client (they know where they stopped).

> **Sync Conflict Resolution Algorithm:** TypeScript function resolveConflict takes SyncDecision object containing bookId, client/server positions and timestamps. Logic: If timestamps are within 60 seconds, prefer the larger position (user progressed further). Otherwise, most recent timestamp wins. Returns 'client' or 'server' to indicate which value should be kept. This prioritizes user experienceâ€”if they listened further on one device, that position is preserved.

**Sync Behavior:**
| Scenario | Behavior |
|----------|----------|
| App goes online | Push local changes, pull server changes |
| Conflict detected | Apply resolution algorithm above |
| Server unreachable | Queue changes locally, retry with backoff |
| Fresh install | Pull all server state, no conflicts possible |

**Download Resume:**

> **Chapter Download with Resume Support:** Async function downloadChapter handles resumable downloads. Checks for existing partial file (.partial extension) using FileSystem.getInfoAsync. If partial exists, sets Range header to resume from that byte offset. Uses FileSystem.createDownloadResumable for download with progress callback reporting percentage complete. On success, moves temp file to final path using FileSystem.moveAsync. On failure, keeps partial file for future resume attempt. Enables reliable downloads over unstable connections.

### 5.7 Security Requirements

**Transport Security:**
- All API calls over HTTPS (TLS 1.2+)
- Certificate pinning recommended for production (expo-secure-store)
- No sensitive data in URL query params (use POST body or headers)

**Authentication:**
- JWT access tokens: 1 hour expiry
- Refresh tokens: 30 days expiry, stored in SecureStore (not MMKV)
- Refresh token rotation on each use

**Data Protection:**

> **Sensitive Data Storage Pattern:** Uses expo-secure-store for tokens (encrypted at OS level) and MMKV for non-sensitive data (fast access). Example: SecureStore.setItemAsync('refreshToken', token) for credentials. MMKV storage.set('lastPlayedBookId', bookId) for preferences. Critical rule: NEVER store tokens in MMKV or AsyncStorageâ€”these are not encrypted and can be extracted from device backups.

**PII Handling:**
- Email stored in Supabase (encrypted at rest)
- Playback history: no PII, just bookId + position
- Audio files: no user PII embedded
- Logs: redact email, userId in production

**Signed URLs:**
- All audio URLs are signed with 24h expiry
- Prevents hotlinking and unauthorized access
- Client must re-fetch book details to get fresh URLs

### 5.8 GDPR/CCPA Compliance Endpoints

> **GDPR/CCPA Endpoints (YAML Specification):**
> 
> **GET /api/v1/user/data-export** (GDPR Article 20) - Returns all user data in JSON format. Response includes: profile (email, createdAt, subscription), books array (id, title, createdAt, hoursUsed), playbackHistory array (bookId, position, updatedAt), billingHistory array (date, amount, description). Note: Large payload delivered via email link.
> 
> **DELETE /api/v1/user/account** (GDPR Article 17) - Initiates account deletion. Body requires confirmation string "DELETE MY ACCOUNT" exactly. Returns success boolean and deletionScheduled timestamp (30-day grace period). Behavior: Immediateâ€”disable login, anonymize analytics. After 30 daysâ€”delete all audio files and personal data. Retainedâ€”anonymized usage stats for analytics.

**Implementation Note:** These endpoints are **Phase 2** (post-MVP). For MVP launch, handle manually via support email with 30-day SLA.

---

## 6. Mobile App Implementation

### 6.1 Project Setup

**Step 1: Create Expo Project**

> **Terminal Command:** npx create-expo-app@latest voicelibri-app --template tabs && cd voicelibri-app â€” Creates new Expo project with tab navigation template, TypeScript configured, and basic folder structure.

**Step 2: Install Core Dependencies**

> **Terminal Commands (npm/npx):** Install dependencies in groups: (1) Storage: npx expo install react-native-mmkv @nozbe/watermelondb; (2) State: npm install zustand @tanstack/react-query; (3) UI: npm install nativewind tailwindcss, npx expo install react-native-reanimated; (4) Audio: npm install react-native-audio-pro (requires dev build); (5) Auth: npm install @supabase/supabase-js; (6) Utilities: npx expo install expo-file-system expo-secure-store expo-notifications. Note: expo-router already included with tabs template.

**Step 3: Configure Development Build**

> **EAS Build Commands:** (1) npm install -g eas-cli â€” installs EAS CLI globally; (2) eas login â€” authenticates with Expo account; (3) eas build:configure â€” creates eas.json with build profiles; (4) eas build --profile development --platform ios â€” builds iOS simulator development client; (5) eas build --profile development --platform android â€” builds Android emulator APK. Development builds required for native modules like react-native-audio-pro.

**Step 4: Configure NativeWind**

> **babel.config.js:** Module exports function returning configuration object. Presets array includes babel-preset-expo with jsxImportSource set to "nativewind" for automatic className support, plus "nativewind/babel" preset for Tailwind class transformation. This enables using Tailwind utility classes directly on React Native components.

> **tailwind.config.js:** Standard Tailwind configuration extended for React Native. Content array targets all tsx files in src folder. Presets includes nativewind/preset. Theme extends colors with primary palette (blue shades 50-900 matching brand), and dark variants for backgrounds (DEFAULT #0f0f23, 100 #1a1a2e, 200 #16213e, 300 #1f2937). Empty plugins array ready for extensions.

### 6.2 Folder Structure

> **Project Folder Structure Description:**
> 
> **src/app/** - Expo Router screens: _layout.tsx (root with providers), index.tsx (entry redirect), (auth)/ group (login, register), (tabs)/ group (library index, generate, settings with tab bar layout), book/[id].tsx (book detail), player/[id].tsx (full-screen player).
> 
> **src/components/** - Reusable UI: ui/ folder (Button, Card, Input, Modal, ProgressBar), library/ folder (BookCard, BookList, EmptyLibrary), player/ folder (MiniPlayer, FullPlayer, ChapterList, SleepTimer, SpeedControl), generation/ folder (FileUploader, CostEstimate, ProgressTracker).
> 
> **src/hooks/** - Custom hooks: useAuth, useLibrary, usePlayer, useGeneration, useSubscription.
> 
> **src/services/** - Business logic: api.ts (API client), auth.ts (Supabase), audioPlayer.ts (player wrapper), downloadManager.ts (background downloads), syncManager.ts (offline sync).
> 
> **src/stores/** - Zustand stores: playerStore.ts, authStore.ts, settingsStore.ts.
> 
> **src/database/** - WatermelonDB: schema.ts, models/ folder (Book, Chapter, PlaybackProgress), index.ts (database instance).
> 
> **src/utils/** - Helpers: formatters.ts (duration, dates), validators.ts (input validation), constants.ts.
> 
> **src/types/** - TypeScript: api.ts (response types), models.ts (data models), navigation.ts.

### 6.3 Core Components Implementation

#### Root Layout with Providers

> **src/app/_layout.tsx:** Root layout component wrapping entire app with required providers. Imports Stack from expo-router. Creates QueryClient instance with 5-minute staleTime and 2 retries default. Component hierarchy: GestureHandlerRootView (required for gestures) â†’ QueryClientProvider â†’ DatabaseProvider (WatermelonDB) â†’ AuthProvider (context) â†’ Stack navigator with headerShown:false and dark background (#0f0f23). MiniPlayer component rendered outside Stack for persistent bottom player. Imports global.css for NativeWind styles.

#### Library Screen

> **src/app/(tabs)/index.tsx:** Main library screen component. Uses useLibrary custom hook returning books array, generatingBooks array, loading states, refetch function, fetchNextPage, and hasNextPage boolean. Layout: Header View with pt-16 for status bar, displays "Library" title and book count. GeneratingBooks component shown conditionally for in-progress generations. FlatList renders BookCard components with 16px padding and 12px gap, pull-to-refresh via RefreshControl with blue tint, infinite scroll via onEndReached calling fetchNextPage when hasNextPage is true, threshold 0.5. EmptyLibrary component shown when books array empty.

#### Audio Player Service

> **src/services/audioPlayer.ts:** Singleton AudioService class managing playback. Private player instance (AudioPlayer from react-native-audio-pro), saveProgressInterval for periodic persistence. initialize() creates player with callbacks: onProgress updates Zustand store with position/duration, onStateChange updates playback state, onTrackChange updates current track. Sets 5-second interval for saveProgress(). loadBook(bookId, chapterId?) fetches book from DB, retrieves last position/chapter from MMKV, builds playlist from chapters with metadata (id, url, title, artist, album, artwork), calls setPlaylist, skips to correct chapter index, seeks to saved position. Control methods: play(), pause(), seekTo(position), skipForward(30s default), skipBackward(15s default), setPlaybackSpeed(rate), nextChapter(), previousChapter(). saveProgress() writes current position and chapter to MMKV keyed by bookId. destroy() clears interval and destroys player instance.

#### Full Screen Player

> **src/app/player/[id].tsx:** Full-screen player screen component. Extracts id from useLocalSearchParams. Destructures from usePlayerStore: isPlaying, position, duration, playbackSpeed, currentChapter, currentBook. handlePlayPause async function toggles audioService.pause() or play(). Layout: Dark background with px-6 padding. Close button (chevron-down icon) positioned absolute top-16 left-6, calls router.back(). Center section: Book cover Image 72x72 with rounded corners and shadow. Track info section: Book title (text-2xl bold, single line), chapter title (text-lg gray). Progress section: Slider component with value=position, min=0, max=duration, onSlidingComplete calls seekTo, blue track colors. Time labels showing formatDuration for position and duration. Control row: Previous chapter (skip-back icon), rewind 15s (flipped refresh icon with "15" label), large play/pause button (80px circle, primary blue), forward 30s (refresh icon with "30" label), next chapter (skip-forward icon). Bottom controls row: SpeedButton showing current speed with border, SleepTimerButton, chapter list button (list icon).
#### Generation Flow

> **src/app/(tabs)/generate.tsx:** Generation screen component. Local state: file (DocumentPicker asset or null), translateTo (language code or null). Uses useGeneration hook providing: estimate object, isEstimating boolean, estimateError, getEstimate function, generate function, isGenerating boolean. handleFilePick async function: calls DocumentPicker.getDocumentAsync with type filter for text/plain and application/epub+zip, copyToCacheDirectory true. If not canceled, sets file state and calls getEstimate with file and options. handleGenerate async function: validates file and estimate exist, checks canGenerate flagâ€”if false, shows Alert with "Insufficient Hours" message offering purchase navigation. If can generate, calls generate(file, {translateTo}). Layout: ScrollView with dark background. Header section with "Generate" title and subtitle. FileUploader component with file prop and loading state. CostEstimate component shown when estimate exists, displays hours, balance, translation option. Generate Button enabled only when canGenerate is true, shows hour cost in label. Tips section at bottom with format recommendations and ebook resource link.

### 6.4 Sleep Timer Implementation

> **src/components/player/SleepTimer.tsx:** Sleep timer component with modal selection. TIMER_OPTIONS constant array: 15/30/45/60 minutes, "End of chapter", and "Off" (null value). SleepTimerButton component: useState for modalVisible, destructures sleepTimer and setSleepTimer from playerStore. useRef for timer timeout. useEffect watches sleepTimerâ€”if type is 'time' with endsAt timestamp, calculates remaining milliseconds, sets setTimeout to pause audio and clear timer. Cleanup clears timeout on unmount or timer change. handleSelect function: null clears timer, 'chapter' sets type:'chapter', numbers set type:'time' with endsAt calculated as Date.now() + minutes*60*1000, then closes modal. Renders moon icon (blue when timer active), remaining minutes text below. Modal: transparent background with slide animation, dark rounded bottom sheet with option list. Each option is Pressable with py-4, highlighted if currently selected. Cancel button at bottom.

---

## 7. Backend Refactoring Guide

### 7.1 Current State Analysis

The current `apps/backend/src/index.ts` is ~2330 lines in a single file. This needs refactoring for:
- Maintainability
- Testability
- Scalability
- Separation of concerns

### 7.2 Target Architecture

> **Target Backend Folder Structure:**
> 
> **apps/backend/src/index.ts** - Minimal entry point, imports and starts app.
> 
> **app.ts** - Express app configuration, middleware setup, route mounting.
> 
> **config/** - Environment and service configuration: index.ts (env validation with Zod), gemini.ts (Gemini API setup), supabase.ts (Supabase client).
> 
> **controllers/** - HTTP request handlers: authController.ts, bookController.ts, generationController.ts, subscriptionController.ts, syncController.ts. Each controller class with methods for each endpoint.
> 
> **services/** - Business logic layer: authService.ts, bookService.ts, generationService.ts (orchestration), chunkingService.ts (text splitting), dramatizationService.ts (character extraction + voice tagging), ttsService.ts (Gemini TTS calls), translationService.ts, storageService.ts (R2/S3 uploads), subscriptionService.ts (Stripe).
> 
> **models/** - Data models: Book.ts, Chapter.ts, Job.ts, User.ts.
> 
> **middleware/** - Express middleware: auth.ts (JWT verification), rateLimit.ts, validation.ts (request validation), idempotency.ts (idempotency key handling), errorHandler.ts (global error handler).
> 
> **routes/** - Route definitions: index.ts (aggregator), authRoutes.ts, bookRoutes.ts, generationRoutes.ts, subscriptionRoutes.ts.
> 
> **workers/** - Background processors: generationWorker.ts (job processing), cleanupWorker.ts (temp file cleanup).
> 
> **utils/** - Utilities: logger.ts (structured logging), errors.ts (custom error classes), validators.ts (Zod schemas), helpers.ts.
> 
> **types/** - TypeScript definitions: api.ts, services.ts, gemini.ts.

### 7.3 Refactoring Strategy

**Phase 1: Extract Configuration**

> **src/config/index.ts:** Uses Zod for environment variable validation. Defines envSchema with z.object containing: NODE_ENV (enum development/production/test, defaults to development), PORT (coerced number, default 3001), GEMINI_API_KEY (non-empty string), SUPABASE_URL (valid URL), SUPABASE_ANON_KEY (non-empty), STRIPE_SECRET_KEY (non-empty), R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET (all non-empty strings), JWT_SECRET (min 32 chars). Exports parsed config objectâ€”throws on invalid environment, provides type-safe access throughout app.

**Phase 2: Create Service Classes**

> **src/services/ttsService.ts:** TTSService class wrapping Gemini TTS API. Constructor initializes GoogleGenAI client with API key from config. Interface TTSRequest defines text, voice, optional language. Interface TTSResult defines audioBuffer (Buffer) and durationMs. generateSpeech(request) async method: records start time, calls client.models.generateContent with model 'gemini-2.5-flash-preview-tts', contents containing text, generationConfig specifying responseModalities: ['AUDIO'] and speechConfig with prebuiltVoiceConfig. Extracts base64 audio data from response.candidates[0].content.parts[0].inlineData.data, throws if missing. Converts to Buffer, estimates duration from file size (bytesPerSecond ~16000 for PCM). Logs success with voice, textLength, duration, latency. Catches and logs errors with full context before rethrowing.

**Phase 3: Create Controllers**

> **src/controllers/generationController.ts:** GenerationController class with constructor dependency injection for GenerationService. Uses Zod schemas: estimateSchema validates optional text string and options object (translateTo nullable, voicePreset enum). generateSchema extends estimate with optional title/author. estimate() method: async Express handler, parses body with estimateSchema, validates file or text provided (returns 400 if neither), calls generationService.estimate with text/filePath/options/userId, returns JSON response. generate() method: parses body, extracts idempotencyKey from headers (returns 400 if missing), calls generationService.startGeneration, returns 202 Accepted with job details. getJobStatus() method: extracts jobId from params, calls service, returns 404 if not found. streamJobProgress() method: sets SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive), subscribes to job events, writes "event: {type}\ndata: {json}\n\n" format, ends response on complete/error, unsubscribes on client disconnect.

**Phase 4: Implement Middleware**

> **src/middleware/idempotency.ts:** Middleware for preventing duplicate mutations. IDEMPOTENCY_TTL constant set to 24 hours in seconds. Async middleware function: extracts idempotency-key header, passes through if not present. Constructs cacheKey as "idempotency:{userId}:{key}". Checks Redis for cached responseâ€”if found, parses JSON and returns cached status/body immediately. If not cached, intercepts res.json by wrapping original method: stores response in Redis with TTL before calling original json(). This ensures identical requests within 24 hours return same response without re-processing.

### 7.4 Migration Plan

| Week | Task | Files Affected |
|------|------|----------------|
| 1 | Extract config, create folder structure | 5-10 new files |
| 2 | Extract TTS service, chunking service | Move from index.ts |
| 3 | Extract dramatization, translation services | Move from index.ts |
| 4 | Create controllers, routes | New files |
| 5 | Add middleware (auth, rate limit, idempotency) | New files |
| 6 | Add proper logging, error handling | Throughout |
| 7 | Add tests for services | test/ folder |
| 8 | Remove old code from index.ts | index.ts cleanup |

---

## 8. Design System

### 8.1 Color Palette

> **Design System Colors (TypeScript Constants):**
> 
> **Backgrounds:** primary '#0f0f23' (main app background), secondary '#1a1a2e' (cards, elevated surfaces), tertiary '#16213e' (input backgrounds).
> 
> **Text:** primary '#ffffff', secondary '#a1a1aa', tertiary '#71717a', disabled '#52525b'.
> 
> **Primary (Brand Blue):** 50 '#eff6ff', 100 '#dbeafe', 500 '#3b82f6' (main accent), 600 '#2563eb', 700 '#1d4ed8'.
> 
> **Status:** success '#22c55e', warning '#f59e0b', error '#ef4444'.
> 
> **Borders:** default '#27272a', focus '#3b82f6'.

### 8.2 Typography

> **Typography Scale (TypeScript Constants):**
> 
> **Headings:** h1 (fontSize: 32, fontWeight: '700', lineHeight: 40), h2 (fontSize: 24, fontWeight: '700', lineHeight: 32), h3 (fontSize: 20, fontWeight: '600', lineHeight: 28).
> 
> **Body:** body (fontSize: 16, fontWeight: '400', lineHeight: 24), bodySmall (fontSize: 14, fontWeight: '400', lineHeight: 20).
> 
> **Labels:** label (fontSize: 14, fontWeight: '500', lineHeight: 20), caption (fontSize: 12, fontWeight: '400', lineHeight: 16).

### 8.3 Spacing System

> **Spacing Scale (TypeScript Constants):** xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, 2xl: 48px. Use consistent spacing throughout for visual rhythm.

### 8.4 Component Guidelines

**Buttons:**
- Primary: Blue background, white text
- Secondary: Transparent with border
- Ghost: No background, no border
- Minimum touch target: 44x44 points

**Cards:**
- Border radius: 16px (rounded-2xl)
- Padding: 16px
- Shadow: None (use background color difference)

**Inputs:**
- Height: 48px
- Border radius: 12px
- Focus state: Blue border

---

## 9. Development Phases (Realistic 5-Month MVP)

> **Target:** Solo vibe-coder, 10-15 hours/week = ~250 hours total  
> **Goal:** Launched on both App Store & Play Store in 20 weeks  
> **Note:** Extended from 4 months to accommodate PWA + all formats

### Phase 0: PWA Testing Frontend (Weeks 1-2) ~20 hours

**Week 1: PWA Setup**
- [ ] Create apps/pwa folder structure
- [ ] Vite + React + TypeScript setup
- [ ] Tailwind CSS configuration (NativeWind-compatible)
- [ ] Basic routing (react-router-dom)
- [ ] Deploy to Vercel/Netlify

**Week 2: PWA Core Features**
- [ ] Auth screens (Login, Register)
- [ ] Library view (list books)
- [ ] Basic audio player (Web Audio API)
- [ ] File upload interface
- [ ] Connect to backend API
- [ ] Share PWA link with testers

**Deliverable:** Working PWA for testers to validate API and UX

### Phase 1: Foundation (Weeks 3-5) ~40 hours

**Week 3: Project Bootstrap**
- [ ] Create Expo project with TypeScript
- [ ] Configure NativeWind + Tailwind
- [ ] Set up folder structure per Section 6.2
- [ ] Configure ESLint, Prettier, TypeScript strict
- [ ] Create EAS development build (iOS + Android)
- [ ] Test dev build on physical device

**Week 4: Auth + Storage**
- [ ] Supabase project setup
- [ ] Auth screens (Login, Register, Forgot Password)
- [ ] Social auth (Google, Apple Sign-In)
- [ ] MMKV + SecureStore setup
- [ ] API client with TanStack Query

**Week 5: Navigation + Backend Connection**
- [ ] Tab navigation structure
- [ ] Connect to existing backend API
- [ ] Basic error handling
- [ ] Loading states component library

**Deliverable:** Working auth flow, connected to backend

### Phase 2: Backend Format Support (Weeks 6-8) ~30 hours

**Week 6: Core Format Parsers**
- [ ] PDF text extraction (pdf-parse)
- [ ] DOC/DOCX parsing (mammoth.js)
- [ ] Unified parser interface

**Week 7: Kindle/MOBI Formats**
- [ ] MOBI parser integration (DRM-free)
- [ ] AZW3/KF8 parser (DRM-free)
- [ ] DRM detection and user messaging
- [ ] Format conversion pipeline

**Week 8: Testing & Integration**
- [ ] Test all 7 formats end-to-end
- [ ] Error handling for corrupted files
- [ ] Format detection auto-routing
- [ ] Update PWA with format support

**Deliverable:** Backend supports all 7 formats (TXT, EPUB, MOBI, AZW3, PDF, DOC, DOCX)

### Phase 3: Core Mobile Features (Weeks 9-13) ~60 hours

**Week 9-10: Library**
- [ ] Book list screen with pull-to-refresh
- [ ] Book detail screen
- [ ] WatermelonDB schema + models
- [ ] Offline book metadata storage

**Week 11-12: Audio Player**
- [ ] Integrate react-native-audio-pro
- [ ] Full-screen player UI
- [ ] Mini player (persistent bottom bar)
- [ ] Background playback + lock screen
- [ ] Playback speed (0.5x - 2.0x)
- [ ] Chapter navigation

**Week 13: Offline & Sync**
- [ ] Chapter download manager
- [ ] Download progress UI
- [ ] Playback position sync
- [ ] Basic conflict resolution

**Deliverable:** Fully functional offline audiobook player

### Phase 4: Generation + Payments (Weeks 14-17) ~50 hours

**Week 14: Generation Flow**
- [ ] File picker (ALL 7 formats)
- [ ] Cost estimate screen
- [ ] Generation confirmation modal
- [ ] Progress tracking (polling)

**Week 15: Generation Polish**
- [ ] SSE for real-time progress (or keep polling if simpler)
- [ ] Push notification setup (Expo Notifications)
- [ ] "Generation complete" notification
- [ ] Error handling for failed generations

**Week 16: Payments (iOS)**
- [ ] RevenueCat integration
- [ ] App Store IAP products: Standard ($7.99), Premium ($17.99)
- [ ] Subscription purchase flow
- [ ] Restore purchases

**Week 17: Payments (Android) + Sleep Timer**
- [ ] Android IAP or Stripe setup
- [ ] Pay-as-you-go billing implementation
- [ ] Receipt validation backend
- [ ] Sleep timer feature
- [ ] Settings screen (speed default, notifications, etc.)

**Deliverable:** Complete MVP feature set with tiered pricing

### Phase 5: Launch Prep (Weeks 18-20) ~50 hours

**Week 18: Quality & Edge Cases**
- [ ] Error boundaries (crash gracefully)
- [ ] Empty states (no books, no internet)
- [ ] Network error retry UI
- [ ] Input validation
- [ ] DRM error messaging

**Week 19: Platform Compliance**
- [ ] iOS ATT prompt (App Tracking Transparency)
- [ ] Push notification permission flow
- [ ] Privacy policy page (in-app webview)
- [ ] Terms of service page
- [ ] Sentry crash reporting

**Week 20: App Store Assets & Launch**
- [ ] App icon (1024x1024) - "VoiceLibri"
- [ ] Screenshots: iPhone 6.7", 6.5", 5.5"
- [ ] Screenshots: Android phone
- [ ] Feature graphic (Play Store)
- [ ] App description, keywords (both stores)
- [ ] Privacy policy URL hosted
- [ ] TestFlight beta (10-20 testers)
- [ ] Fix critical beta feedback
- [ ] App Store submission (Books category)
- [ ] Play Store submission (Books & Reference)
- [ ] Monitor crash reports day 1

**Deliverable:** đźš€ VoiceLibri LIVE on both stores!

---

### Deferred to Phase 2 (Post-Launch)

These features are valuable but NOT required for MVP:

| Feature | Why Deferred | Target |
|---------|--------------|--------|
| Annual subscription | Adds IAP complexity | Month 6 |
| Internet Archive catalog | Optional enhancement | Month 6 |
| Referral program | Needs backend work | Month 7 |
| GDPR data export API | Manual via email for now | Month 7 |
| Bookmarks & notes | Nice-to-have | Month 7 |
| Book sharing (deep links) | Marketing feature | Month 8 |
| Family plan | Complex entitlements | Month 9 |
| Full accessibility audit | VoiceOver basics only for MVP | Month 6 |

---

### MVP Test Matrix (Week 18-19)

**Must Test Before Launch:**

| Scenario | iOS | Android | PWA |
|----------|-----|---------|-----|
| Fresh install â†’ Register â†’ Generate book | â | â | â |
| Upload each format (TXT, EPUB, MOBI, AZW3, PDF, DOC, DOCX) | â | â | â |
| DRM-protected file â†’ Error message | â | â | â |
| Login â†’ Resume playback from last position | â | â | â |
| Background playback (app minimized) | â | â | N/A |
| Lock screen controls (play/pause/skip) | â | â | N/A |
| Airplane mode â†’ Play downloaded book | â | â | â |
| Kill app â†’ Reopen â†’ Resume position | â | â | â |
| Purchase Standard subscription (sandbox) | â | â | N/A |
| Purchase Premium subscription (sandbox) | â | â | N/A |
| Restore purchase on new device | â | â | N/A |
| Generation fails â†’ Error message shown | â | â | â |
| Sleep timer stops playback | â | â | â |
| Chapter skip forward/backward | â | â |
| Playback speed 0.5x, 1.5x, 2.0x | â | â |
| Download chapter â†’ Offline playback | â | â |
| Poor network â†’ Graceful degradation | â | â |
| App update â†’ Data preserved | â | â |

---

## 10. AI Development Instructions

### 10.1 For Claude Opus 4.5 / Sonnet 4.5

**Context Setting:**
When starting a new conversation about this project, provide:

```
I'm building VoiceLibri, a React Native (Expo) app for AI-generated audiobooks.

Tech stack:
- Expo SDK 53+ with development builds
- NativeWind v4 for styling
- react-native-audio-pro for audio playback
- MMKV + WatermelonDB for storage
- TanStack Query + Zustand for state
- Supabase for auth
- Backend: Express + TypeScript + Gemini TTS

Please follow the architecture in MOBILE_APP_DEVELOPMENT_GUIDE.md.
Use TypeScript strict mode.
Use functional components with hooks.
Follow the folder structure defined in section 6.2.
```

### 10.2 Code Generation Guidelines

**DO:**
- Generate complete, working code (no TODOs or placeholders)
- Include TypeScript types
- Use NativeWind classes for styling
- Handle loading and error states
- Add proper accessibility labels
- Include comments for complex logic

**DON'T:**
- Use class components
- Use inline styles (use NativeWind)
- Ignore TypeScript errors
- Skip error handling
- Use deprecated APIs

### 10.3 Testing Instructions

```
When implementing features:
1. Start with types (types/*.ts)
2. Implement service layer (services/*.ts)
3. Create store if needed (stores/*.ts)
4. Build UI components (components/*.tsx)
5. Create screen (app/*.tsx)
6. Test on both iOS and Android
```

### 10.4 Common Patterns

**API Hook Pattern:**

> **hooks/useBooks.ts Pattern:** Custom hook using TanStack Query's useQuery. Returns query result with typed data. QueryKey is ['books'] for cache identification. QueryFn is async function calling api.get<BooksResponse>('/api/v1/books'), returns response.data.books array. This pattern provides automatic caching, refetching, loading/error states, and TypeScript inference.

**Component Pattern:**

> **components/BookCard.tsx Pattern:** Functional component with typed props interface (BookCardProps: book: Book, onPress?: function). Destructures props. Returns Pressable with className for NativeWind styling, onPress handler. Children render book data. Export as named function, not default, for better tree-shaking and imports.

**Store Pattern:**

> **stores/playerStore.ts Pattern:** Zustand store created with create<StateInterface> generic. Interface defines state shape (currentBookId, isPlaying, etc.) plus action functions (setCurrentBook). Implementation passes set function to factory returning initial state object with action implementations using set({...updates}). Export usePlayerStore hook for component consumption.

---

## Appendix A: Free Ebook Resources

Include these in app settings for user convenience:

| Source | URL | Content |
|--------|-----|---------|
| Project Gutenberg | gutenberg.org | 70,000+ public domain books |
| Standard Ebooks | standardebooks.org | High-quality public domain |
| Open Library | openlibrary.org | Millions of books |
| ManyBooks | manybooks.net | 50,000+ free ebooks |
| Feedbooks | feedbooks.com | Public domain + original |
| Librivox | librivox.org | Free audiobooks (compare quality) |

---

## Appendix B: Launch Checklist

### Pre-Launch (Week 15)

**Accounts & Setup:**
- [ ] Apple Developer account ($99/year) - apply 1-2 weeks early
- [ ] Google Play Console ($25 one-time)
- [ ] App Store Connect: Create app, set pricing
- [ ] Play Console: Create app, set up closed testing
- [ ] RevenueCat account + IAP products configured
- [ ] Sentry account (free tier)
- [ ] Support email: support@yourapp.com

**App Store Assets:**
- [ ] App icon 1024x1024 (no alpha, no rounded corners for iOS)
- [ ] iOS Screenshots: 6.7" (1290Ă—2796), 6.5" (1284Ă—2778), 5.5" (1242Ă—2208)
- [ ] Android Screenshots: Phone (1080Ă—1920+), 7" tablet optional
- [ ] Play Store Feature Graphic: 1024Ă—500
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Keywords (iOS: 100 chars comma-separated)
- [ ] What's New text

**Legal Pages (Host on your domain):**
- [ ] Privacy Policy URL - REQUIRED
- [ ] Terms of Service URL - REQUIRED  
- [ ] EULA (can use Apple's standard)
- [ ] Support URL

### Technical Checklist (Week 15-16)

**Backend:**
- [ ] Production API endpoint (not localhost!)
- [ ] HTTPS with valid certificate
- [ ] Environment variables secured
- [ ] Database backups configured
- [ ] Rate limiting enabled
- [ ] Error monitoring (Sentry backend)

**Mobile:**
- [ ] Production API URL in app config
- [ ] RevenueCat production keys
- [ ] Sentry DSN configured
- [ ] Push notification certificates (iOS)
- [ ] Firebase Cloud Messaging setup (Android)
- [ ] App signing: iOS certificates + Android keystore BACKED UP
- [ ] EAS production build profile

**iOS Specific:**
- [ ] ATT (App Tracking Transparency) prompt implemented
- [ ] NSUserTrackingUsageDescription in Info.plist
- [ ] Background audio entitlement
- [ ] Push notification entitlement
- [ ] Export compliance: "No" if no custom encryption (uses HTTPS only)

**Android Specific:**
- [ ] Target SDK 34+ (current requirement)
- [ ] ProGuard/R8 rules for native modules
- [ ] Data safety form completed
- [ ] App content rating questionnaire

### Compliance (MVP Minimum)

**Privacy (Do These for Launch):**
- [ ] Privacy policy explains: data collected, how used, third parties
- [ ] Disclose: Supabase (auth), Sentry (crashes), RevenueCat (payments)
- [ ] Support email for data requests (manual handling OK for MVP)

**GDPR (EU Users):**
- [ ] Privacy policy mentions GDPR rights
- [ ] Users can request data deletion via email (manual for MVP)
- [ ] No data sold to third parties âś“

**CCPA (California):**
- [ ] "Do Not Sell My Info" link (even if you don't sell - say so)
- [ ] Deletion request process documented

**Apple ATT:**

> **ATT Implementation:** Import requestTrackingPermissionsAsync from expo-tracking-transparency. Call BEFORE initializing any analytics that use IDFA. Await the permission request, check if status equals 'granted'. If granted, initialize analytics with device ID tracking. If denied, initialize analytics without IDFAâ€”still works but with less precise attribution. This prompt is required by Apple for apps using advertising identifier.

**If NOT using IDFA tracking (simpler):**
- Skip ATT prompt entirely
- Use Mixpanel/Amplitude without device ID tracking
- Declare "No" for tracking in App Store Connect
---

## Appendix C: Monitoring & Analytics

**Recommended Stack (MVP):**
- **Crash Reporting:** Sentry (free tier: 5k events/month) - REQUIRED
- **Analytics:** Mixpanel (free tier: 20M events/month) - REQUIRED  
- **Backend Uptime:** Better Uptime or UptimeRobot (free tier)
- **Log Aggregation:** Railway/Render built-in logs (MVP), Logtail later

**Sentry Setup:**

> **Sentry React Native Configuration:** In app/_layout.tsx, import Sentry from @sentry/react-native. Call Sentry.init() with configuration object: dsn (your project's Sentry DSN URL), environment set based on __DEV__ flag ('development' or 'production'), tracesSampleRate at 0.2 (20% of transactions sampled for performance monitoring). Wrap the root layout component export with Sentry.wrap() HOC to enable automatic error boundary and performance tracking.

**Key Events to Track (Mixpanel):**

> **Mixpanel Event Tracking:** Essential events to track for product analytics: 'app_opened' (daily active users), 'user_registered' with method property ('email'|'google'|'apple'), 'book_generation_started' with estimatedHours and hasTranslation properties, 'book_generation_completed' with actualHours and chapterCount, 'playback_started' with bookId and chapter number, 'playback_session_ended' with duration and bookId, 'subscription_started' with plan and price, 'subscription_cancelled' with reason property for churn analysis.

**Key Metrics Dashboard:**
| Metric | Target (Month 1) | How to Measure |
|--------|------------------|----------------|
| DAU | 50+ | Mixpanel |
| Registration â†’ First Book | >30% | Funnel analysis |
| Free â†’ Paid conversion | >5% | RevenueCat |
| Generation success rate | >95% | Backend logs |
| Crash-free sessions | >99% | Sentry |
| API P95 latency | <500ms | Sentry Performance |
| App Store rating | >4.0 | App Store Connect |

**Correlation IDs (Backend):**

> **Request ID Middleware:** Express middleware for request tracing. Generates or extracts x-request-id header (uses existing if present, generates UUID v4 if not). Attaches requestId to req object. Sets response header for client correlation. Creates child logger with requestId and userId contextâ€”all logs from this request automatically include correlation ID. Mobile client should also send x-request-id header (generate UUID per request) to enable end-to-end tracing between app and backend logs.

---

## Appendix D: Quick Reference Card

**Stack Summary:**
```
Mobile:     Expo SDK 53+ | NativeWind | react-native-audio-pro
PWA:        Vite | React | Tailwind CSS | Web Audio API
Storage:    MMKV (fast) | WatermelonDB (SQLite) | SecureStore (tokens)
State:      Zustand (UI) | TanStack Query (server)
Auth:       Supabase Auth
Payments:   RevenueCat (IAP abstraction)
Backend:    Express | TypeScript | Gemini TTS
Formats:    TXT, EPUB, MOBI, AZW3/KF8, PDF, DOC, DOCX
Database:   Supabase (Postgres)
Storage:    Cloudflare R2
Monitor:    Sentry | Mixpanel
```

**Key Commands:**
```bash
# Development
npx expo start --dev-client
eas build --profile development --platform ios

# PWA Development
cd apps/pwa && npm run dev

# Production
eas build --profile production --platform all
eas submit --platform ios
eas submit --platform android

# Useful
npx expo install --check  # Fix version mismatches
eas diagnostics          # Debug build issues
```

**Cost Estimates (Monthly):**
| Item | Free Tier | Paid (Scale) |
|------|-----------|-------------|
| Supabase | 500MB DB, 1GB storage | $25/month |
| Sentry | 5k events | $26/month |
| Mixpanel | 20M events | Free for long time |
| RevenueCat | $10k MTR | 1% + $0.008 |
| Cloudflare R2 | 10GB storage | $0.015/GB |
| Railway/Render | 500 hours | $5-20/month |
| Vercel (PWA) | Hobby free | $20/month |
| Apple Developer | - | $99/year |
| Google Play | - | $25 one-time |

**Break-Even Reminder:**
- Fixed costs: ~$100-150/month
- Margin per Standard subscriber ($7.99): ~$4.50
- Margin per Premium subscriber ($17.99): ~$10.00
- **Break-even: ~20-25 subscribers**

**Pricing Quick Reference:**
| Plan | Price | Hours | Per-Hour Value |
|------|-------|-------|----------------|
| Free Trial | $0 | 2 hrs OR 14 days | - |
| Standard | $7.99/mo | 20 hrs | $0.40/hr |
| Premium | $17.99/mo | 50 hrs | $0.36/hr |
| Pay-as-you-go | $0.50/hr | Unlimited | $0.50/hr |

---

*Document Version: 3.0 (Summary Edition - Code blocks replaced with technical descriptions)*  
*App Name: VoiceLibri*  
*Last Updated: January 6, 2026*  
*Total: ~12,000 words | ~24 A4 pages*  
*Maintainer: AI Development Assistant*
