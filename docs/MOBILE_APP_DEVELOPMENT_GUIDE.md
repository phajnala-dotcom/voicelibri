# Mobile App Development Guide v3.0

> **Comprehensive Technical Specification for VoiceLibri**  
> **AI-Powered Multi-Voice Dramatized Audiobook Platform**  
> **Target:** React Native (Expo) iOS & Android + PWA for Testing  
> **Last Updated:** January 6, 2026  
> **For:** AI-Assisted Development (Claude Opus 4.5 / Sonnet 4.5)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
   - 1.4 Competitive Analysis (Audible, Speechify, Spotify, etc.)
2. [Business Model & Pricing Strategy](#2-business-model--pricing-strategy)
   - 2.1 Cost Analysis (Local Storage, Google Cloud)
   - 2.6 Platform Payment Compliance (CRITICAL)
   - 2.7 System Limits & Quotas
   - 2.8 Generation Failure & Refund Policy
   - **2.9 Referral Program (MVP - Viral Growth Engine)** ⭐ NEW
   - 2.11 Gift Program (Phase 2)
   - **2.18 UI/UX Reference: TortugaPower/BookPlayer** ⭐ NEW
3. [Technology Stack Decisions](#3-technology-stack-decisions)
   - 3.3 Storage Stack (Local-Only MVP, Sandboxed)
4. [Architecture Overview](#4-architecture-overview)
5. [API Contract v2.0](#5-api-contract-v20)
   - 5.6 Offline Sync & Conflict Resolution
   - 5.7 Security Requirements
   - 5.8 GDPR/CCPA Compliance
6. [Mobile App Implementation](#6-mobile-app-implementation)
7. [Backend Refactoring Guide](#7-backend-refactoring-guide)
   - **7.5 Cloud Infrastructure (Google Cloud Platform)** ⭐ NEW
8. [Design System](#8-design-system)
9. [Development Phases (Realistic 4-Month MVP)](#9-development-phases-realistic-4-month-mvp)
   - Deferred Features List
   - MVP Test Matrix
10. [AI Development Instructions](#10-ai-development-instructions)
11. [Appendices](#appendix-a-free-ebook-resources)
    - A: Free Ebook Resources
    - B: Launch Checklist
    - C: Monitoring & Analytics
    - D: Quick Reference Card

---

## 1. Executive Summary

### 1.1 Product Vision

**VoiceLibri** is an AI-powered audiobook generation platform that transforms any ebook (TXT, EPUB, MOBI, Kindle, PDF, DOC, DOCX) into professionally dramatized, multi-voice audiobooks with optional translation to 100+ languages.

**Unique Value Proposition (Technical Moat):**
- Multi-voice dramatization with automatic character detection
- Translation to listener's native language
- ~€0.13-0.17/hour generation cost vs €10-30/hour human narration
- Instant availability vs weeks/months for traditional production

### 1.2 Competitive Landscape

| Platform | Content | Voices | Languages | Price |
|----------|---------|--------|-----------|-------|
| **Audible** | Licensed catalog | Human (top actors) | Original only | €9.99-14.99/month (1 book) |
| **Spotify Audiobooks** | Licensed catalog | Human | Limited | €10.99/month (15 hours) |
| **Google Play Books** | Licensed + TTS | Single TTS | TTS: Many | Per-book purchase |
| **VoiceLibri (Ours)** | User's ebooks | Multi-voice AI | 100+ languages | $7.99-17.99/month |

**Key Differentiators:**
1. **Any ebook** → Bring your own content (free ebooks, purchased, etc.)
2. **Dramatized** → Multiple AI voices for characters (not monotone TTS)
3. **Translated** → Listen in YOUR language, not just original
4. **Affordable** → Subscription covers multiple large books

### 1.3 MVP Scope (Phase 1)

**MUST HAVE:**
- [ ] User authentication (email + social)
- [ ] Audiobook library with offline playback
- [ ] Background audio with lock screen controls
- [ ] Book upload with ALL basic formats:
  - [ ] TXT (plain text, UTF-8)
  - [ ] EPUB (standard ebook format)
  - [ ] MOBI (DRM-free only)
  - [ ] Kindle AZW3/KF8 (DRM-free only)
  - [ ] PDF (with text extraction)
  - [ ] DOC/DOCX (Microsoft Word)
- [ ] **Easy upload via Share Sheet** (receive ebooks from other apps)
- [ ] Cost estimate before generation
- [ ] Generation progress tracking
- [ ] Sleep timer
- [ ] Playback speed control (0.5x - 2.0x)
- [ ] Chapter navigation
- [ ] Tiered pricing: Free (2hrs) + Standard ($7.99) + Premium ($17.99)
- [ ] PWA testing frontend for testers
- [ ] **App Settings page** (standard app feature)
- [ ] **Book Settings** (language, character voices with preview)
- [ ] **App Localization** (5 languages - see Section 2.15)
- [ ] **Free Classics Library** (Gutenberg integration - see Section 2.16)

**SHOULD HAVE (Phase 2):**
- [ ] Book sharing via deep links
- [ ] Bookmarks and notes
- [ ] Push notifications (generation complete)
- [ ] Extended Free Classics categories (genres, authors, bookshelves)

**COULD HAVE (Phase 3):**
- [ ] Book Intelligence (AI summaries, character guides)
- [ ] Social features (recommendations)
- [ ] Family sharing

### 1.4 Competitive Analysis

#### Market Landscape Overview

The audiobook/text-to-speech market has three main segments:

1. **Premium Audiobook Platforms** — Licensed content, human narration (Audible, Spotify)
2. **TTS Utility Apps** — Convert any text to speech (Speechify, NaturalReader)
3. **Library/Subscription Services** — Bundled access (Everand, Storytel, Libby)

**VoiceLibri** creates a **new category**: AI-dramatized audiobooks with multi-voice generation.

#### Detailed Competitor Comparison

| Feature | VoiceLibri (Ours) | Audible | Speechify | Spotify | Everand (Scribd) | Google Play Books |
|---------|------------------|---------|-----------|---------|------------------|-------------------|
| **Content Source** | User's ebooks | Licensed catalog | User's docs/web | Licensed catalog | Licensed catalog | Purchased + TTS |
| **Voice Type** | Multi-voice AI | Human narrators | Single AI voice | Human narrators | Human narrators | Single TTS |
| **Dramatization** | ✅ Auto character detection | ✅ Pre-recorded | ❌ Monotone | ✅ Pre-recorded | ✅ Pre-recorded | ❌ Monotone |
| **Translation** | ✅ 100+ languages | ❌ Original only | ✅ 60+ languages | ❌ Original only | ❌ Original only | ✅ TTS only |
| **Offline** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Price** | €9.99/mo (25hrs) | €9.99-14.99/mo (1 book) | €11.58/mo | €10.99/mo (15hrs) | €12.99/mo | Per-book |
| **Free Tier** | 2 hrs/month | 30-day trial | Limited | 15 hrs/month | 30-day trial | TTS free |

#### Individual Competitor Deep-Dive

##### 🎧 Audible (Amazon)

| Aspect | Details |
|--------|---------|
| **Model** | €9.99-14.99/month for 1-2 credits; €7.95 Plus (unlimited Audible Originals) |
| **Catalog** | 750,000+ titles, exclusive Amazon originals |
| **Strengths** | Top-tier human narration, celebrity readers, massive catalog, seamless Alexa integration |
| **Weaknesses** | Expensive per-book (€15-30), no translation, limited to their catalog |
| **Target** | Premium audiobook consumers, English speakers |

**VoiceLibri Advantage vs Audible:**
- ✅ **Any book** — Not limited to Audible's catalog
- ✅ **Translation** — Listen in your native language
- ✅ **Price** — €9.99 for ~4-5 books vs 1 book
- ❌ **Voice quality** — Human narration still superior for now

##### 🗣️ Speechify

| Aspect | Details |
|--------|---------|
| **Model** | Free (limited), €11.58/month Premium, €14/month (billed annually) |
| **Features** | OCR for images/PDFs, browser extension, 60+ languages, celebrity voices |
| **Strengths** | Versatile input (web, PDF, images), fast reading speeds (up to 4.5x), accessibility focus |
| **Weaknesses** | **Single voice** (no dramatization), robotic for long-form, expensive for features |
| **Target** | Students, dyslexia/accessibility users, productivity-focused readers |

**VoiceLibri Advantage vs Speechify:**
- ✅ **Multi-voice dramatization** — Characters have different voices (our core moat!)
- ✅ **Designed for books** — Not generic TTS, optimized for fiction/narrative
- ✅ **Price** — Comparable but more value for audiobook use case
- ❌ **Input versatility** — Speechify handles PDFs, web pages, images better

##### 🎵 Spotify Audiobooks

| Aspect | Details |
|--------|---------|
| **Model** | Included with €10.99/month Premium (15 hours), then €12.99/book |
| **Catalog** | 200,000+ titles, growing rapidly |
| **Strengths** | Already have Spotify, good discovery, social sharing, combined with music |
| **Weaknesses** | 15-hour limit restrictive, no translation, tied to Spotify ecosystem |
| **Target** | Existing Spotify users wanting audiobooks |

**VoiceLibri Advantage vs Spotify:**
- ✅ **25 hours vs 15 hours** at similar price
- ✅ **Any ebook** — Not limited to their catalog
- ✅ **Translation** — Global audience reach
- ❌ **Discovery** — Spotify has better content discovery UX

##### 📚 Everand (formerly Scribd)

| Aspect | Details |
|--------|---------|
| **Model** | €12.99/month unlimited (throttled after heavy use) |
| **Catalog** | 500,000+ audiobooks, ebooks, magazines, podcasts |
| **Strengths** | All-you-can-read model, diverse content types |
| **Weaknesses** | Throttling for heavy users, no translation, inconsistent availability |
| **Target** | Voracious readers wanting variety |

**VoiceLibri Advantage vs Everand:**
- ✅ **Predictable usage** — No surprise throttling
- ✅ **Any ebook** — Including free/public domain
- ✅ **Translation** — Everand is English/original only
- ❌ **Catalog breadth** — Everand has more ready content

##### 📖 Google Play Books (TTS)

| Aspect | Details |
|--------|---------|
| **Model** | Buy ebooks, TTS is free on purchased/uploaded books |
| **Features** | Read aloud feature, Google Assistant integration |
| **Strengths** | Free TTS, good ecosystem integration, large ebook store |
| **Weaknesses** | **Single monotone voice**, not designed for long listening, no dramatization |
| **Target** | Casual listeners, accessibility users |

**VoiceLibri Advantage vs Google Play:****
- ✅ **Multi-voice dramatization** — Night and day difference for fiction
- ✅ **Audiobook-quality output** — Not just accessibility TTS
- ✅ **Translation** — Listen in any language
- ❌ **Price** — Google TTS is free (but quality reflects that)

##### 📱 Other Competitors

| App | Model | Key Feature | VoiceLibri Advantage |
|-----|-------|-------------|---------------------|
| **NaturalReader** | Freemium, $9.99/mo | PDF/doc TTS, natural voices | Multi-voice dramatization |
| **Voice Dream** | $19.99 one-time | Accessibility focus, sync across devices | Dramatization, translation |
| **Storytel** | €14.99/mo | Strong in Europe, local content | Translation, any ebook |
| **Libby** | Free (library card) | Free via libraries | No library card needed, dramatization |
| **Audiobooks.com** | €14.95/mo (1 credit) | Large catalog | Price, any ebook |

#### Competitive Positioning Matrix

```
                    HIGH VOICE QUALITY
                           │
         Audible ●         │         
         Storytel ●        │        
                           │
    ─────────────────────────────────────────
    LICENSED               │           USER'S
    CATALOG                │           CONTENT
    ONLY                   │
                           │    ● VoiceLibri ← Our Position
         Spotify ●         │    
         Everand ●         │         ● Speechify
                           │         ● NaturalReader
                           │         ● Google TTS
                           │
                    LOW VOICE QUALITY
```

**Our Unique Position:** The ONLY solution in the "User's Content + High Quality" quadrant.

#### Competitive Moat Analysis

| Moat Type | Strength | Explanation |
|-----------|----------|-------------|
| **Technical (Dramatization)** | 🟢 Strong | 6-12 months to replicate multi-voice character detection |
| **Translation + TTS combo** | 🟢 Strong | No competitor offers dramatized + translated |
| **Network Effects** | 🔴 Weak | No social features yet (add in Phase 3) |
| **Switching Costs** | 🟡 Medium | Audiobook library builds over time |
| **Brand** | 🔴 Weak | New entrant, need to build trust |
| **Cost Advantage** | 🟡 Medium | Gemini pricing could change; competitors can adopt |

#### Threats & Mitigation

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **Audible adds AI TTS** | Medium | High | Move fast, build loyal base, focus on translation |
| **Speechify adds multi-voice** | Medium | High | Deeper book optimization, character consistency |
| **Google improves Play Books TTS** | High | Medium | Focus on dramatization quality, not just TTS |
| **New AI TTS startup** | High | Medium | First-mover advantage, translation moat |
| **Gemini pricing increases** | Low | High | Prepare for multi-provider (ElevenLabs fallback) |

#### Go-to-Market Strategy vs Competitors

**DO NOT compete on:**
- Catalog size (Audible wins)
- Voice celebrity (Audible wins)
- Price alone (race to bottom)

**DO compete on:**
1. **"Your books, dramatized"** — Bring any ebook, get multi-voice audio
2. **"Listen in YOUR language"** — Translation is killer feature for non-English markets
3. **"Affordable for readers"** — €9.99 for 25 hours is best value proposition
4. **"Public domain goldmine"** — Free ebooks → premium audiobooks

**Target Market Priority:**
1. 🥇 **Non-English speakers** wanting English books in their language
2. 🥈 **Public domain enthusiasts** (Project Gutenberg, Standard Ebooks users)
3. 🥉 **Self-published authors** wanting audiobook versions
4. 🏅 **Niche content fans** (fan fiction, web novels, academic texts)

---

## 2. Business Model & Pricing Strategy

### 2.1 Cost Analysis (Critical)

**Your Variable Costs per Hour of Generated Audio:**

| Cost Component | Without Translation | With Translation |
|----------------|---------------------|------------------|
| Gemini TTS (primary) | €0.10-0.11 | €0.10-0.11 |
| LLM Character Analysis | €0.01-0.02 | €0.01-0.02 |
| Translation (Gemini) | - | €0.03-0.04 |
| **Subtotal Token Costs** | **€0.11-0.13** | **€0.14-0.17** |

**Fixed/Infrastructure Costs (Monthly):**

| Component | Estimated Monthly (100 users) | At Scale (1000+ users) |
|-----------|-------------------------------|------------------------|
| Google Cloud Run (auto-scaling) | €30-60 | €100-300 |
| Cloud SQL (Postgres) | €15-30 | €50-100 |
| CDN bandwidth (Cloud CDN) | €10-20 | €50-150 |
| Monitoring (Cloud Monitoring) | €0 (free tier) | €20-50 |
| Firebase Auth | €0 (free tier) | €0-25 |
| App store fees (15-30% of revenue) | Variable | Variable |
| **Total Fixed** | **~€55-110/month base** | **~€220-625/month** |

**📱 Audio Storage Model (MVP):**
> **IMPORTANT:** Audio files are stored **locally on user's device only** (sandboxed app storage).
> - No cloud storage costs for audio files in MVP
> - Users must re-generate if switching devices
> - Cloud Sync planned for Phase 3+

**Why Local-Only Storage for MVP:**
| Benefit | Impact |
|---------|--------|
| **Zero storage costs** | No S3/R2 costs for audio files |
| **Faster playback** | No streaming latency, instant local access |
| **Offline guaranteed** | Works without internet after generation |
| **Privacy** | Audio never leaves user's device |
| **Simplified architecture** | No sync conflicts, no cloud management |

**Trade-offs:**
- ❌ No cross-device sync (must re-generate on new device)
- ❌ Device storage used (user responsibility)
- ❌ Lost if app deleted without backup

**Blended Cost Assumption:** €0.15/hour average (mix of translated/non-translated)

### 2.2 Pricing Strategy (VoiceLibri Tiered Model)

**❌ REJECTED: Flat per-book pricing**
- Problem: 100-page book ≠ 500-page book (2hr vs 30hr audio)
- $2.99 for 30-hour book = $0.10/hour = LOSS after costs

**✅ FINAL: Tiered Hour-Based Pricing with Pay-As-You-Go**

```
┌─────────────────────────────────────────────────────────────────┐
│  VOICELIBRI PRICING MODEL                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FREE TRIAL:          2 hours (rounded up by sub-chunk)         │
│                       OR 14 days (whichever is earlier)         │
│                       User selects Standard/Premium on signup   │
│                       Then auto-converts to selected plan       │
│                                                                 │
│  STANDARD:            $7.99 USD/EUR per month                   │
│                       20 hours included                         │
│                       Good for casual listeners                 │
│                                                                 │
│  PREMIUM:             $17.99 USD/EUR per month                  │
│                       50 hours included                         │
│                       Best value for avid readers               │
│                                                                 │
│  PAY-AS-YOU-GO:       $0.50 USD/EUR per hour                    │
│                       Available BOTH:                           │
│                       • ON TOP of subscription (overage)        │
│                       • INSTEAD of subscription (standalone)    │
│                       Per-minute billing (industry standard)    │
│                       No subscription required for standalone   │
│                                                                 │
│  NOTE: Payment is for GENERATION time, not listening time.      │
│        Listening is unlimited forever once generated.           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Free Tier Behavior:**
- 2 hours = audiobook generation time (not listening)
- "Rounded up by sub-chunk" = playback won't hard-cut at 2:00:00; the chunk being played when limit is reached will finish
- After 2 hours OR 14 days → auto-converts to selected subscription plan
- Clear messaging at signup: "Your free trial will convert to [Standard/Premium] after 2 hours or 14 days"

**Pay-As-You-Go Details:**
- Available in TWO modes:
  1. **Overage mode:** For subscribers who exceed their monthly hours
  2. **Standalone mode:** For users who prefer no subscription commitment
- Per-minute billing (industry standard: AWS, Google Cloud use per-second)
- No maximum - users can generate as much as needed
- Billed monthly via App Store/Play Store

**Pay-As-You-Go Billing & Risk Management:**

| Question | Answer |
|----------|--------|
| **How is it billed?** | Monthly via App Store/Play Store at end of billing cycle |
| **What if user deletes app?** | ✅ No risk - App Store/Play Store handles billing. User's payment method is charged regardless of app status. Funds transferred to us automatically. |
| **What if user logs out?** | ✅ No risk - Billing is tied to App Store/Play Store account, not app login |
| **What if user disputes?** | Apple/Google handle disputes; we provide usage logs as evidence |
| **Minimum charge?** | $0.50 minimum (1 hour equivalent) to avoid micro-transactions |

**Settings Page - Billing Section UI:**
```
┌─────────────────────────────────────────────────────────────────┐
│  💳 Billing & Subscription                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Current Plan: Premium ($17.99/month)                           │
│  Renews: February 6, 2026                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Monthly Hours                                          │    │
│  │  ████████████████████░░░░░░░░░░  35:42 / 50:00 hrs     │    │
│  │  Remaining: 14:18                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Pay-As-You-Go This Month                               │    │
│  │  Hours used:     02:34 (hh:mm)                          │    │
│  │  Amount to bill: $1.29                                  │    │
│  │  (Billed at end of billing cycle)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [ Manage Subscription ]  [ Purchase Hours ]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Unit Economics Analysis

**Per Standard Subscriber ($7.99/month):**

| Metric | Light User | Average | Power User |
|--------|------------|---------|------------|
| Hours used | 8 hrs | 15 hrs | 20 hrs (max) |
| Your cost | $1.20 | $2.25 | $3.00 |
| App store cut (15%) | $1.20 | $1.20 | $1.20 |
| **Gross margin** | **$5.59 (70%)** | **$4.54 (57%)** | **$3.79 (47%)** |

**Per Premium Subscriber ($17.99/month):**

| Metric | Light User | Average | Power User |
|--------|------------|---------|------------|
| Hours used | 20 hrs | 35 hrs | 50 hrs (max) |
| Your cost | $3.00 | $5.25 | $7.50 |
| App store cut (15%) | $2.70 | $2.70 | $2.70 |
| **Gross margin** | **$12.29 (68%)** | **$10.04 (56%)** | **$7.79 (43%)** |

**Pay-As-You-Go User (Standalone, no subscription):**

| Metric | Occasional | Regular | Heavy |
|--------|------------|---------|-------|
| Hours used | 2 hrs | 10 hrs | 30 hrs |
| Revenue | $1.00 | $5.00 | $15.00 |
| Your cost | $0.30 | $1.50 | $4.50 |
| App store cut (15%) | $0.15 | $0.75 | $2.25 |
| **Gross margin** | **$0.55 (55%)** | **$2.75 (55%)** | **$8.25 (55%)** |

**Break-even Analysis:**
- Fixed costs: ~$100-150/month
- Average margin per subscriber: ~$5-8
- **Break-even: ~20-25 paying subscribers**
- **Target Year 1: 100-500 subscribers = $500-3,500/month profit**

### 2.4 Competitive Position vs Audible

| Factor | Audible | VoiceLibri |
|--------|---------|-----------|
| Monthly cost | $14.99 | $7.99-17.99 |
| Content | 1 book (any length) | 20-50 hours (~3-8 books) |
| Voice quality | Human (top tier) | AI (good, improving) |
| Catalog | Huge, licensed | User's own ebooks |
| Formats | Audible only | TXT, EPUB, MOBI, Kindle, PDF, DOC/DOCX |
| Languages | Original only | 100+ translations |
| Wait time | Instant (catalog) | 5-30 min generation |

**Positioning:** NOT competing with Audible for licensed content. Targeting:
1. Public domain/free ebook enthusiasts
2. Non-English speakers wanting content in their language
3. Self-publishers wanting audiobook versions
4. Niche content not available on Audible
5. Users with ebook collections in various formats

### 2.5 User Experience: Cost Transparency

**CRITICAL: Show estimated cost BEFORE generation**

```
┌─────────────────────────────────────────────────────────────────┐
│  📖 "Harry Potter a kámen mudrců"                               │
│                                                                 │
│  Estimated audiobook: ~8.5 hours                                │
│  Characters detected: 12 unique voices                          │
│  Translation: Czech → English                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Cost: 8.5 hours from your balance                        │  │
│  │  Your balance: 20.0 hours (Standard)                      │  │
│  │  Remaining after: 11.5 hours                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [ Cancel ]                    [ Generate Audiobook ]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 Platform Payment Compliance (CRITICAL)

**Apple App Store (iOS):**
- ❗ **MUST use App Store IAP** for subscriptions and hour purchases
- Apple takes 15% (Small Business Program) or 30% cut
- Use StoreKit 2 via `expo-in-app-purchases` or RevenueCat
- Cannot link to external payment pages for digital goods
- Can mention web pricing but cannot show "buy on web" buttons

**Google Play Store (Android):**
- ✅ **Can use Stripe directly** for subscriptions (Google allows alternatives as of 2024)
- OR use Play Billing for consistency
- Recommendation: Use Stripe on Android for better margins (2.9% vs 15-30%)

**RevenueCat Recommendation:**
```typescript
// Use RevenueCat to abstract both platforms
import Purchases from 'react-native-purchases';

// Initialize
await Purchases.configure({ apiKey: Platform.OS === 'ios' 
  ? 'appl_xxx' 
  : 'goog_xxx' // or Stripe key
});

// Purchase
const { customerInfo } = await Purchases.purchasePackage(package);
```

**Margin Impact:**
| Platform | Payment Method | Fee | €9.99 Sub → You Get |
|----------|---------------|-----|--------------------|
| iOS | App Store IAP | 15% | €8.49 |
| Android | Stripe | 2.9% | €9.70 |
| Android | Play Billing | 15% | €8.49 |
| Web | Stripe | 2.9% | €9.70 |

### 2.7 System Limits & Quotas

| Limit | Value | Rationale |
|-------|-------|----------|
| Max file size | 50 MB | Prevents abuse, covers 99% of ebooks |
| Max chapters | 200 | Memory/processing limits |
| Max characters (text) | 2M chars | ~500k words, ~50hr audiobook |
| Max audio per book | 50 hours | Storage cost control |
| Max concurrent generations | 2 per user | Server capacity |
| Audio URL expiry | 24 hours | Security, forces re-auth |
| Free tier limit | 2 hours OR 14 days | Conversion funnel |

**File Format Support (ALL required for MVP v1.0):**
| Format | Status | Notes | Implementation |
|--------|--------|-------|----------------|
| TXT | ✅ MVP | Plain text, UTF-8 | Native parsing |
| EPUB | ✅ MVP | Standard ebook format | epub.js / epubjs |
| MOBI | ✅ MVP | Amazon legacy format | mobi-parser (DRM-free only) |
| AZW3/KF8 | ✅ MVP | Kindle format | kf8-parser (DRM-free only) |
| PDF | ✅ MVP | Document format | pdf-parse + pdf.js |
| DOC | ✅ MVP | Word 97-2003 | mammoth.js |
| DOCX | ✅ MVP | Word 2007+ | mammoth.js |

**DRM Policy (Important):**
- MOBI/Kindle: Only DRM-free files are supported
- If DRM detected: Show message "This file is DRM-protected. Please use a DRM-free version."
- Legal note: DRM removal is illegal under DMCA/EU law; we do not support it
- DRM-free Kindle ebooks exist: Many indie authors and some publishers opt out of DRM

### 2.8 Generation Failure & Refund Policy

**Automatic Retry Logic (Backend):**
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 5000, 15000], // Exponential backoff
  retryableErrors: ['RATE_LIMITED', 'TTS_TIMEOUT', 'NETWORK_ERROR'],
  nonRetryableErrors: ['INVALID_CONTENT', 'QUOTA_EXCEEDED'],
};
```

**Quota Exhaustion Mid-Generation:**
- If user runs out of hours mid-book: Generation pauses
- Partial audio is saved (completed chapters)
- User notified: "Generation paused - purchase more hours to continue"
- Resume within 7 days or partial refund issued

**Refund Rules:**
| Scenario | Action |
|----------|--------|
| Generation fails (our fault) | 100% hours refunded automatically |
| User cancels mid-generation | Refund unused estimated hours |
| User deletes book < 24h | 100% hours refunded |
| User deletes book > 24h | No refund (prevents abuse) |
| Quality complaint | Manual review, case-by-case |

### 2.9 Referral Program (MVP - Viral Growth Engine) 🚀

**Purpose:** Drive viral user acquisition through incentivized referrals. This is a KEY MVP feature for organic growth.

**Program Structure:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  VOICELIBRI REFERRAL PROGRAM                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WHO CAN REFER:                                                          │
│  • Any signed-up user (even free trial users!)                           │
│  • No subscription required to share referral links                      │
│                                                                          │
│  REWARD FOR REFERRER:                                                    │
│  🎁 +20 FREE HOURS when referee makes FIRST subscription payment         │
│  • Hours added on top of current subscription                            │
│  • If in trial: hours available immediately for generation               │
│  • No maximum referrals - unlimited earning potential                    │
│                                                                          │
│  REWARD FOR REFEREE:                                                     │
│  • Standard free trial (2 hours OR 14 days)                              │
│  • (Consider: +2 bonus hours for signing up via referral)                │
│                                                                          │
│  TRACKING:                                                               │
│  • Unique referral link per user: voicelibri.app/r/{user_code}           │
│  • Deep link opens App Store/Play Store with attribution                 │
│  • Attribution tracked for 30 days after click                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Technical Implementation:**

```typescript
// Referral link generation
interface ReferralCode {
  userId: string;
  code: string;        // e.g., "ALEX7K2M"
  createdAt: Date;
  totalReferrals: number;
  successfulReferrals: number;  // Converted to paying
  hoursEarned: number;
}

// API endpoints
POST /api/referral/generate     → { code, link }
GET  /api/referral/stats        → { totalClicks, signups, conversions, hoursEarned }
POST /api/referral/validate     → Validate code on signup
POST /api/referral/reward       → Triggered by payment webhook
```

**UI Components (MVP):**

1. **Share Button in Settings/Profile:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🎁 Invite Friends, Get Free Hours                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Share your link and earn 20 FREE hours when                    │
│  your friend makes their first payment!                         │
│                                                                  │
│  Your referral link:                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ voicelibri.app/r/ALEX7K2M              [ 📋 Copy ]      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [ 📱 Share via... ]                                            │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  Your Stats:                                                     │
│  👥 Friends invited: 12                                          │
│  ✅ Successful referrals: 4                                      │
│  🎧 Hours earned: 80                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

2. **Referral Dashboard (Settings → My Referrals):**
   - List of referrals with status (signed up, converted, pending)
   - Total hours earned
   - Shareable stats card for social proof

**Share Options:**
- Native share sheet (iOS/Android)
- Direct: WhatsApp, Telegram, SMS, Email
- Copy link to clipboard
- Generate shareable image with stats

**Anti-Fraud Measures:**
- One referral credit per unique device/IP combination
- Payment must be completed (not just trial signup)
- 30-day attribution window
- Manual review for accounts with >20 referrals/month

### 2.10 Revenue Optimization Strategies

**MVP (Month 1-5):**
1. Two-tier pricing: Standard ($7.99) + Premium ($17.99)
2. Pay-as-you-go on top of subscription
3. First 2 hours free (credit card required at signup for auto-conversion)
4. **Referral program active from day 1** (20 hours per conversion)

**Post-Launch (Month 6-9):**
1. Annual subscription discount (2 months free)
2. Internet Archive catalog integration (see 2.12)
3. Gift Program (see 2.11)

**Growth (Month 10+):**
1. Family plan ($24.99/month, 80 hours shared)
2. Student discount (50% off)
3. B2B API for publishers

### 2.11 Gift Program (Phase 2)

**Planned for Phase 2 release:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🎁 GIFT VOICELIBRI HOURS                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Give the gift of audiobooks to friends & family!               │
│                                                                  │
│  Select gift amount:                                            │
│  ○ 10 hours  - $5.00                                            │
│  ○ 25 hours  - $10.00                                           │
│  ○ 50 hours  - $17.99                                           │
│  ● Custom    - [ 30 ] hours = $10.80                            │
│                                                                  │
│  Recipient email: [_________________________]                    │
│                                                                  │
│  Personal message (optional):                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Happy Birthday! Enjoy your favorite books as            │    │
│  │ audiobooks. Love, Alex                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [ 🎁 Send Gift ]                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features (Phase 2):**
- Gift to existing users or invite new users
- Redeemable gift codes
- Gift wrap email with personalized message
- Share via email, SMS, or link
- Pricing: $0.36/hour (discount vs pay-as-you-go $0.50)

### 2.12 PWA Testing Frontend

**Purpose:** A Progressive Web App that mirrors the React Native app design for testing purposes.

**Why PWA for Testing:**
- Faster iteration for testers (no app install required)
- Cross-platform testing on any device with a browser
- Easier for non-technical testers to access
- Design validation before native implementation
- Backend API testing without mobile build delays

**Technical Stack:**
```
apps/pwa/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/
│   ├── manifest.json
│   └── icons/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css (Tailwind)
    ├── components/           # Mirror native components
    │   ├── ui/
    │   ├── library/
    │   ├── player/
    │   └── generation/
    ├── hooks/                # Same hooks as native
    ├── services/             # Same API client
    └── stores/               # Same Zustand stores
```

**Tech Choices:**
- Vite + React + TypeScript (same as current frontend, but expanded)
- Tailwind CSS (NativeWind-compatible classes)
- TanStack Query + Zustand (same as native)
- Web Audio API for playback
- Service Worker for offline support

**Deployment:** Vercel or Netlify (free tier) for tester access

**Design Parity:**
- Same color scheme, typography, spacing as mobile
- Responsive: Mobile-first design that works on desktop
- Same user flows as React Native app

### 2.11 Internet Archive Ebook Catalog (Optional Feature)

**Feasibility Evaluation:**

**What Internet Archive Offers:**
- 20+ million ebooks in various formats
- Public domain and openly licensed content
- Free API access (archive.org/developers)
- Formats: EPUB, PDF, plain text, MOBI, Kindle

**Internet Archive API Terms Analysis (Critical):**

| Aspect | Status | Details |
|--------|--------|---------|
| **Commercial Use** | ⚠️ Limited | ToS states "scholarship and research purposes only" |
| **Rate Limits** | ✅ Reasonable | No explicit limits documented; ~100 req/min recommended |
| **Authentication** | ✅ Optional | API works without auth; auth needed for uploads |
| **Licensing** | ✅ Per-item | Each item has its own license (public domain, CC, etc.) |
| **Redistribution** | ⚠️ Prohibited | Cannot recirculate content; linking is OK |

**ToS Key Points (archive.org/about/terms.php):**
- "Access is granted for scholarship and research purposes only"
- "You certify that your use will be limited to noninfringing or fair use under copyright law"
- "You agree not to recirculate" content
- No explicit prohibition on commercial linking/discovery

**Legal Analysis:**
- Public domain content: ✅ Free to use commercially
- Open Library lending: ⚠️ Controlled Digital Lending (legal gray area)
- Our use case analysis:

| Activity | Legal Status | Reasoning |
|----------|--------------|-----------|
| Searching their API | ✅ Legal | Just querying metadata |
| Linking to downloads | ✅ Legal | Standard web linking |
| Direct file download | ⚠️ Gray area | ToS says "scholarship only" but public domain is public domain |
| User downloads → uploads to us | ✅ Legal | User's independent action |
| Caching their content | ❌ Not allowed | ToS prohibits recirculation |

**Recommended Approach:**
- **Option A (Safest):** Search & Link only - zero legal risk
- **Option B (Acceptable):** Direct download for PUBLIC DOMAIN items only (verify license per item)

**Implementation Options:**

**Option A: Search & Link (RECOMMENDED)**
- In-app search of Internet Archive catalog
- Show ebook metadata (title, author, description, formats)
- Deep link to archive.org for download
- User downloads → uploads to VoiceLibri
- **Effort:** ~8-16 hours
- **Legal risk:** Zero (just linking)

**Option B: Direct Download Integration**
- Fetch ebook file directly from archive.org API
- Only for items with verified public domain / CC0 license
- Auto-import into VoiceLibri for processing
- **Effort:** ~24-40 hours
- **Legal risk:** Low if license verified per item

**Option C: White-Label Catalog (NOT RECOMMENDED)**
- Cache popular public domain titles
- Pre-generate popular audiobooks
- **Effort:** ~80+ hours
- **Legal risk:** HIGH - violates "no recirculation" ToS

**Recommendation:** 
- MVP: Option A only (search & link)
- Phase 2: Option B with per-item license verification
- NEVER: Option C (ToS violation)

**Technical Implementation - Option A (Search & Link):**

```typescript
// services/internetArchive.ts

interface ArchiveSearchResult {
  identifier: string;
  title: string;
  creator?: string;
  year?: string;
  format: string[];
  downloads?: number;
}

interface ArchiveBookDetails {
  identifier: string;
  metadata: {
    title: string;
    creator: string;
    description: string;
    licenseurl?: string;
    rights?: string;
  };
  files: Array<{
    name: string;
    format: string;
    size: string;
  }>;
}

// Search for ebooks
export async function searchArchive(query: string, limit = 20): Promise<ArchiveSearchResult[]> {
  const params = new URLSearchParams({
    q: `${query} mediatype:texts`,
    output: 'json',
    rows: limit.toString(),
    'fl[]': 'identifier,title,creator,year,format,downloads',
    sort: 'downloads desc', // Popular first
  });
  
  const response = await fetch(
    `https://archive.org/advancedsearch.php?${params}`
  );
  const data = await response.json();
  return data.response.docs;
}

// Get book details and available formats
export async function getBookDetails(identifier: string): Promise<ArchiveBookDetails> {
  const response = await fetch(
    `https://archive.org/metadata/${identifier}`
  );
  return response.json();
}

// Check if book is public domain (safe for Option B)
export function isPublicDomain(book: ArchiveBookDetails): boolean {
  const rights = book.metadata.rights?.toLowerCase() || '';
  const license = book.metadata.licenseurl?.toLowerCase() || '';
  
  return (
    rights.includes('public domain') ||
    license.includes('publicdomain') ||
    license.includes('cc0') ||
    rights.includes('no known copyright')
  );
}

// Get download URL for specific format
export function getDownloadUrl(identifier: string, filename: string): string {
  return `https://archive.org/download/${identifier}/${filename}`;
}

// Get direct link to book page (for Option A)
export function getBookPageUrl(identifier: string): string {
  return `https://archive.org/details/${identifier}`;
}
```

**UI Component - Archive Browser:**

```tsx
// components/generation/ArchiveBrowser.tsx
import { useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, Linking } from 'react-native';
import { searchArchive, getBookPageUrl } from '../../services/internetArchive';

export function ArchiveBrowser({ onSelectBook }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const books = await searchArchive(query);
    setResults(books);
    setLoading(false);
  };

  const handleOpenInArchive = (identifier: string) => {
    Linking.openURL(getBookPageUrl(identifier));
  };

  return (
    <View className="flex-1 bg-dark p-4">
      <Text className="text-white text-xl font-bold mb-4">
        📚 Free Ebooks from Internet Archive
      </Text>
      
      <View className="flex-row gap-2 mb-4">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search for books..."
          className="flex-1 bg-dark-200 text-white p-3 rounded-lg"
        />
        <Pressable onPress={handleSearch} className="bg-primary-500 px-4 rounded-lg">
          <Text className="text-white">Search</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.identifier}
        renderItem={({ item }) => (
          <Pressable 
            onPress={() => handleOpenInArchive(item.identifier)}
            className="bg-dark-200 p-4 rounded-lg mb-2"
          >
            <Text className="text-white font-semibold">{item.title}</Text>
            <Text className="text-gray-400">{item.creator}</Text>
            <Text className="text-primary-500 text-sm mt-2">
              Tap to open in Internet Archive →
            </Text>
          </Pressable>
        )}
      />

      <Text className="text-gray-500 text-xs mt-4 text-center">
        Download the ebook from Internet Archive, then upload it to VoiceLibri
      </Text>
    </View>
  );
}
```

**Time Estimates:**
| Option | Backend | Frontend | Testing | Total |
|--------|---------|----------|---------|-------|
| A: Search & Link | 4 hrs | 8 hrs | 4 hrs | **16 hrs** |
| B: Direct Download | 16 hrs | 16 hrs | 8 hrs | **40 hrs** |

### 2.12 Easy Ebook Upload via Share Sheet

**Problem:** Manually uploading ebooks is friction-heavy. Users must:
1. Open VoiceLibri
2. Navigate to Upload
3. Browse files
4. Select ebook

**Solution:** Register VoiceLibri as a Share Target for ebook formats.

**User Experience:**
1. User opens ebook in any app (Files, email, browser, Kindle, etc.)
2. Taps "Share" button
3. Sees "VoiceLibri" as sharing option
4. Taps VoiceLibri → ebook automatically imports
5. VoiceLibri opens with cost estimate screen

**Implementation - iOS (Share Extension):**

```typescript
// app.json - Expo config
{
  "expo": {
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "CFBundleDocumentTypes": [
          {
            "CFBundleTypeName": "EPUB",
            "CFBundleTypeRole": "Viewer",
            "LSHandlerRank": "Alternate",
            "LSItemContentTypes": ["org.idpf.epub-container"]
          },
          {
            "CFBundleTypeName": "PDF",
            "CFBundleTypeRole": "Viewer",
            "LSHandlerRank": "Alternate",
            "LSItemContentTypes": ["com.adobe.pdf"]
          },
          {
            "CFBundleTypeName": "Text",
            "CFBundleTypeRole": "Viewer",
            "LSHandlerRank": "Alternate",
            "LSItemContentTypes": ["public.plain-text"]
          },
          {
            "CFBundleTypeName": "Word Document",
            "CFBundleTypeRole": "Viewer",
            "LSHandlerRank": "Alternate",
            "LSItemContentTypes": [
              "org.openxmlformats.wordprocessingml.document",
              "com.microsoft.word.doc"
            ]
          }
        ]
      }
    }
  }
}
```

**Implementation - Android (Intent Filter):**

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<activity>
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:mimeType="application/epub+zip" />
    <data android:mimeType="application/pdf" />
    <data android:mimeType="text/plain" />
    <data android:mimeType="application/msword" />
    <data android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
    <data android:mimeType="application/x-mobipocket-ebook" />
  </intent-filter>
</activity>
```

**Handle Incoming Files in React Native:**

```typescript
// hooks/useIncomingFile.ts
import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';

export function useIncomingFile() {
  useEffect(() => {
    // Handle initial URL (app opened via share)
    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingFile(url);
    });

    // Handle URL while app is running
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingFile(url);
    });

    return () => subscription.remove();
  }, []);

  const handleIncomingFile = async (url: string) => {
    // Copy file to app's document directory
    const fileUri = decodeURIComponent(url.replace('file://', ''));
    
    // Navigate to generation screen with file
    router.push({
      pathname: '/generate',
      params: { importedFile: fileUri }
    });
  };
}
```

**Effort Estimate:** ~16-24 hours (iOS + Android + testing)

### 2.13 App Settings Page

**Standard app settings structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ Settings                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACCOUNT                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 👤 Profile                              john@email.com  │    │
│  │ 💳 Billing & Subscription                    Premium >  │    │
│  │ 🔔 Notifications                                   On > │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  PLAYBACK                                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ⏩ Default Playback Speed                        1.25x > │    │
│  │ ⏭️  Skip Forward Duration                          30s > │    │
│  │ ⏮️  Skip Backward Duration                         15s > │    │
│  │ 💤 Default Sleep Timer                            Off > │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  GENERATION                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🌍 Default Target Language           Same as app lang > │    │
│  │ 🎭 Default Voice Preset                      Dramatic > │    │
│  │ 📚 Internet Archive Browser                           > │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  APP                                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🌐 App Language                             English >   │    │
│  │ 🌙 Theme                                       Dark >   │    │
│  │ 💾 Storage Usage                          2.4 GB >      │    │
│  │ 📖 Free Ebook Resources                              >  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  SUPPORT                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ❓ Help & FAQ                                         > │    │
│  │ 📧 Contact Support                                    > │    │
│  │ 📜 Privacy Policy                                     > │    │
│  │ 📜 Terms of Service                                   > │    │
│  │ ℹ️  About VoiceLibri                          v1.0.0 > │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [ Log Out ]                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.14 Book Settings (Per-Book Configuration)

**Before generation, user can configure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📖 Book Settings: "Pride and Prejudice"                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TRANSLATION                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📄 Source Language (detected):            English       │    │
│  │ 🎯 Target Language:                       Slovak    >   │    │
│  │    (Defaults to app language)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  CHARACTER VOICES (Top 5 detected)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │ 👩 Elizabeth Bennet         [▶️ Preview]                 │    │
│  │    Voice: Aoede (Female, Warm)                      >   │    │
│  │                                                         │    │
│  │ 👨 Mr. Darcy               [▶️ Preview]                  │    │
│  │    Voice: Charon (Male, Deep)                       >   │    │
│  │                                                         │    │
│  │ 👩 Mrs. Bennet             [▶️ Preview]                  │    │
│  │    Voice: Kore (Female, Expressive)                 >   │    │
│  │                                                         │    │
│  │ 👨 Mr. Bennet              [▶️ Preview]                  │    │
│  │    Voice: Fenrir (Male, Calm)                       >   │    │
│  │                                                         │    │
│  │ 📖 Narrator                [▶️ Preview]                  │    │
│  │    Voice: Puck (Neutral, Clear)                     >   │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  💡 More characters will be auto-assigned similar voices        │
│                                                                 │
│  [ Cancel ]                    [ Generate Audiobook ]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Voice Preview Implementation:**

```typescript
// components/generation/VoiceSelector.tsx
import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { api } from '../../services/api';

const AVAILABLE_VOICES = [
  { id: 'Aoede', name: 'Aoede', gender: 'Female', description: 'Warm, gentle' },
  { id: 'Charon', name: 'Charon', gender: 'Male', description: 'Deep, authoritative' },
  { id: 'Kore', name: 'Kore', gender: 'Female', description: 'Expressive, dynamic' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'Male', description: 'Calm, measured' },
  { id: 'Puck', name: 'Puck', gender: 'Neutral', description: 'Clear, narrative' },
  // ... more voices
];

interface VoiceSelectorProps {
  characterName: string;
  selectedVoice: string;
  onVoiceSelect: (voiceId: string) => void;
  sampleText?: string;
}

export function VoiceSelector({ 
  characterName, 
  selectedVoice, 
  onVoiceSelect,
  sampleText = "Hello, I am the voice for this character."
}: VoiceSelectorProps) {
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const playPreview = async (voiceId: string) => {
    // Stop any playing audio
    if (sound) await sound.unloadAsync();
    
    setPreviewLoading(voiceId);
    
    try {
      // Get preview audio from backend
      const audioUrl = await api.getVoicePreview(voiceId, sampleText);
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );
      setSound(newSound);
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setPreviewLoading(null);
    }
  };

  return (
    <View className="bg-dark-200 rounded-lg p-4 mb-2">
      <Text className="text-white font-semibold mb-2">{characterName}</Text>
      
      {AVAILABLE_VOICES.map((voice) => (
        <Pressable
          key={voice.id}
          onPress={() => onVoiceSelect(voice.id)}
          className={`flex-row items-center p-3 rounded-lg mb-1 ${
            selectedVoice === voice.id ? 'bg-primary-500/20' : 'bg-dark-300'
          }`}
        >
          <View className="flex-1">
            <Text className="text-white">{voice.name}</Text>
            <Text className="text-gray-400 text-sm">
              {voice.gender} • {voice.description}
            </Text>
          </View>
          
          <Pressable 
            onPress={() => playPreview(voice.id)}
            className="p-2"
          >
            {previewLoading === voice.id ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : (
              <Text className="text-primary-500">▶️</Text>
            )}
          </Pressable>
        </Pressable>
      ))}
    </View>
  );
}
```

### 2.15 App Localization (Multi-Language Support)

**MVP Languages (Implementation Order):**
1. 🇬🇧 **English (en)** - Default, primary development language
2. 🇸🇰 **Slovak (sk)** - Founder's market
3. 🇨🇿 **Czech (cs)** - Similar market, shared resources
4. 🇩🇪 **German (de)** - Large European market
5. 🇪🇸 **Spanish (es)** - Global reach, Americas + Europe

> **Note:** This exact sequence defines implementation priority. English first (all strings), then Slovak, Czech, German, Spanish.

**Language Auto-Behavior:**
- App language = Default target language for translations
- User sets app to Slovak → New books default to Slovak output
- Can be overridden per-book in Book Settings


**Implementation - i18next:**

```typescript
// i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { storage } from '../stores/mmkv';

import en from './locales/en.json';
import sk from './locales/sk.json';
import cs from './locales/cs.json';

const resources = { en, sk, cs };

// Get saved language or detect from device
const getInitialLanguage = () => {
  const saved = storage.getString('app.language');
  if (saved && resources[saved]) return saved;
  
  // Detect from device
  const deviceLang = Localization.locale.split('-')[0];
  return resources[deviceLang] ? deviceLang : 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;

// Change language
export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
  storage.set('app.language', lang);
  
  // Also update default target language for generation
  storage.set('generation.defaultTargetLanguage', lang);
};
```

**Translation Files Structure:**

```json
// i18n/locales/en.json
{
  "common": {
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save",
    "delete": "Delete",
    "loading": "Loading..."
  },
  "tabs": {
    "library": "Library",
    "generate": "Generate",
    "settings": "Settings"
  },
  "library": {
    "title": "My Library",
    "empty": "No audiobooks yet",
    "emptyHint": "Upload an ebook to get started",
    "generating": "Generating..."
  },
  "generate": {
    "title": "Generate Audiobook",
    "selectFile": "Select Ebook",
    "supportedFormats": "TXT, EPUB, MOBI, PDF, DOC, DOCX",
    "estimatedHours": "Estimated: {{hours}} hours",
    "generateButton": "Generate Audiobook",
    "insufficientHours": "Need {{hours}} more hours"
  },
  "player": {
    "chapter": "Chapter {{number}}",
    "sleepTimer": "Sleep Timer",
    "speed": "Speed"
  },
  "settings": {
    "title": "Settings",
    "account": "Account",
    "profile": "Profile",
    "billing": "Billing & Subscription",
    "notifications": "Notifications",
    "playback": "Playback",
    "defaultSpeed": "Default Playback Speed",
    "skipForward": "Skip Forward Duration",
    "skipBackward": "Skip Backward Duration",
    "generation": "Generation",
    "targetLanguage": "Default Target Language",
    "voicePreset": "Default Voice Preset",
    "app": "App",
    "language": "App Language",
    "theme": "Theme",
    "storage": "Storage Usage",
    "support": "Support",
    "help": "Help & FAQ",
    "contact": "Contact Support",
    "privacy": "Privacy Policy",
    "terms": "Terms of Service",
    "about": "About VoiceLibri",
    "logout": "Log Out"
  },
  "bookSettings": {
    "title": "Book Settings",
    "sourceLanguage": "Source Language (detected)",
    "targetLanguage": "Target Language",
    "characterVoices": "Character Voices",
    "preview": "Preview",
    "moreCharacters": "More characters will be auto-assigned similar voices"
  }
}
```

```json
// i18n/locales/sk.json
{
  "common": {
    "cancel": "Zrušiť",
    "confirm": "Potvrdiť",
    "save": "Uložiť",
    "delete": "Vymazať",
    "loading": "Načítava sa..."
  },
  "tabs": {
    "library": "Knižnica",
    "generate": "Vytvoriť",
    "settings": "Nastavenia"
  },
  "library": {
    "title": "Moja knižnica",
    "empty": "Zatiaľ žiadne audioknihy",
    "emptyHint": "Nahrajte e-knihu a začnite",
    "generating": "Vytvára sa..."
  },
  "generate": {
    "title": "Vytvoriť audioknihu",
    "selectFile": "Vybrať e-knihu",
    "supportedFormats": "TXT, EPUB, MOBI, PDF, DOC, DOCX",
    "estimatedHours": "Odhadovaný čas: {{hours}} hodín",
    "generateButton": "Vytvoriť audioknihu",
    "insufficientHours": "Potrebujete ešte {{hours}} hodín"
  },
  "settings": {
    "title": "Nastavenia",
    "language": "Jazyk aplikácie",
    "logout": "Odhlásiť sa"
  }
}
```

**Time to Add New Language:**

| Task | Time | Notes |
|------|------|-------|
| Translation file creation | 2-4 hrs | ~200 strings to translate |
| QA & review | 1-2 hrs | Check context, plurals |
| RTL support (if needed) | 4-8 hrs | Arabic, Hebrew, etc. |
| **Total per language** | **3-6 hrs** | For LTR languages |

**Adding German (de) example:**
1. Create `i18n/locales/de.json`
2. Translate all keys from `en.json`
3. Add to `resources` object in `i18n/index.ts`
4. Test all screens
5. **Estimated time: 4 hours**

### 2.16 Free Classics Library (Project Gutenberg Integration)

**Feature Overview:**
VoiceLibri includes a built-in "Free Classics" library powered by Project Gutenberg's 77,000+ public domain ebooks. Users can browse, search, and instantly convert classic literature to dramatized audiobooks with one tap.

#### Legal Framework

**Source:** [gutenberg.org/policy/license.html](https://www.gutenberg.org/policy/license.html)

> *"If you strip the Project Gutenberg license and all references to Project Gutenberg from the text, you are left with a text unprotected by U.S. intellectual property law. You can do anything you want with that text."*

| Requirement | Our Compliance |
|-------------|----------------|
| Strip PG trademark from processed content | ✅ Backend removes headers/footers |
| No royalties for commercial use | ✅ Only if trademark removed |
| Attribution required? | ❌ Not required, but we credit in About |
| Rate limiting (~100/day) | ✅ Gutendex API has no enforced limits |

**Result:** Zero licensing fees, zero royalties, fully legal commercial use.

#### Language Availability in Gutenberg

**CRITICAL FINDING from API research:**

| Language | ISO Code | Books Available | MVP Status |
|----------|----------|-----------------|------------|
| 🇬🇧 English | en | **73,000+** | ✅ Primary catalog |
| 🇩🇪 German | de | **2,396** | ✅ Good selection |
| 🇪🇸 Spanish | es | **901** | ✅ Adequate |
| 🇨🇿 Czech | cs | **12** | ⚠️ Very limited |
| 🇸🇰 Slovak | sk | **0** | ❌ None available |

**Implications for MVP:**
- Slovak/Czech users: Feature shows "English Classics" or German classics
- German users: Full German classics + English
- Spanish users: Spanish classics + English
- App UI language ≠ Catalog language (explained in UX)

#### Technical Architecture

**API:** Gutendex (third-party JSON API, not official PG)
- **Endpoint:** `https://gutendex.com/books`
- **Authentication:** None required
- **Rate Limits:** No enforced limits (but courtesy: don't abuse)
- **Recommendation:** "For long-term use, run your own server"

```typescript
// types/gutenberg.ts
interface GutenbergBook {
  id: number;
  title: string;
  authors: Array<{
    name: string;
    birth_year: number | null;
    death_year: number | null;
  }>;
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean; // false = public domain
  download_count: number;
  formats: {
    'application/epub+zip'?: string;
    'text/plain; charset=utf-8'?: string;
    'text/html'?: string;
    'image/jpeg'?: string; // Cover image
  };
}

interface GutenbergResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}
```

**API Queries:**

```typescript
// services/gutendex.ts
const GUTENDEX_BASE = 'https://gutendex.com';

export const gutendexApi = {
  // Popular books in a language
  getPopular: (lang: string = 'en', page: number = 1) =>
    fetch(`${GUTENDEX_BASE}/books?languages=${lang}&copyright=false&page=${page}`)
      .then(r => r.json() as Promise<GutenbergResponse>),

  // Search by title/author
  search: (query: string, lang?: string) => {
    const params = new URLSearchParams({
      search: query,
      copyright: 'false', // Only public domain
    });
    if (lang) params.set('languages', lang);
    return fetch(`${GUTENDEX_BASE}/books?${params}`)
      .then(r => r.json() as Promise<GutenbergResponse>);
  },

  // Get single book details
  getBook: (id: number) =>
    fetch(`${GUTENDEX_BASE}/books/${id}`)
      .then(r => r.json() as Promise<GutenbergBook>),

  // Browse by topic/genre
  getByTopic: (topic: string, lang?: string) => {
    const params = new URLSearchParams({
      topic,
      copyright: 'false',
    });
    if (lang) params.set('languages', lang);
    return fetch(`${GUTENDEX_BASE}/books?${params}`)
      .then(r => r.json() as Promise<GutenbergResponse>);
  },
};
```

#### Backend Processing

**Critical:** Strip PG headers before TTS processing.

```typescript
// backend/src/gutenbergProcessor.ts

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

export function stripGutenbergHeaders(text: string): string {
  let cleanText = text;

  // Find start marker and remove everything before it
  for (const marker of PG_START_MARKERS) {
    const startIdx = cleanText.indexOf(marker);
    if (startIdx !== -1) {
      // Find end of the START line
      const lineEnd = cleanText.indexOf('\n', startIdx);
      cleanText = cleanText.substring(lineEnd + 1);
      break;
    }
  }

  // Find end marker and remove everything after it
  for (const marker of PG_END_MARKERS) {
    const endIdx = cleanText.indexOf(marker);
    if (endIdx !== -1) {
      cleanText = cleanText.substring(0, endIdx);
      break;
    }
  }

  // Remove any remaining "Project Gutenberg" references
  cleanText = cleanText.replace(/Project Gutenberg/gi, '');

  return cleanText.trim();
}

// Download and process
export async function downloadAndProcessGutenberg(bookId: number): Promise<string> {
  // 1. Get book metadata
  const book = await gutendexApi.getBook(bookId);
  
  // 2. Get text format URL (prefer UTF-8 plain text)
  const textUrl = book.formats['text/plain; charset=utf-8'] ||
                  book.formats['text/plain; charset=us-ascii'];
  
  if (!textUrl) {
    throw new Error('No plain text format available');
  }
  
  // 3. Download content
  const response = await fetch(textUrl);
  const rawText = await response.text();
  
  // 4. Strip PG headers (REQUIRED for legal compliance)
  const cleanText = stripGutenbergHeaders(rawText);
  
  return cleanText;
}
```

#### Mobile UI Implementation

**Screen: Free Classics Library**

```typescript
// screens/FreeClassicsScreen.tsx
import React, { useState } from 'react';
import { FlatList, Image, Pressable, View, Text, TextInput } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { gutendexApi } from '../services/gutendex';
import { useAppLanguage } from '../hooks/useAppLanguage';

const CATALOG_LANGUAGES = {
  en: { name: 'English', books: '73,000+' },
  de: { name: 'German', books: '2,396' },
  es: { name: 'Spanish', books: '901' },
};

export function FreeClassicsScreen() {
  const { appLanguage } = useAppLanguage();
  const [catalogLang, setCatalogLang] = useState<string>(
    CATALOG_LANGUAGES[appLanguage] ? appLanguage : 'en'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['gutenberg', catalogLang, searchQuery],
    queryFn: ({ pageParam = 1 }) =>
      searchQuery
        ? gutendexApi.search(searchQuery, catalogLang)
        : gutendexApi.getPopular(catalogLang, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.next ? extractPage(lastPage.next) : undefined,
  });

  const books = data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <View style={styles.container}>
      {/* Language Selector */}
      <View style={styles.languageRow}>
        <Text style={styles.label}>Catalog Language:</Text>
        {Object.entries(CATALOG_LANGUAGES).map(([code, { name, books }]) => (
          <Pressable
            key={code}
            style={[
              styles.langChip,
              catalogLang === code && styles.langChipActive,
            ]}
            onPress={() => setCatalogLang(code)}
          >
            <Text>{name} ({books})</Text>
          </Pressable>
        ))}
      </View>

      {/* Explanation for Slovak/Czech users */}
      {appLanguage === 'sk' || appLanguage === 'cs' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {appLanguage === 'sk'
              ? '📚 Slovenské knihy nie sú v katalógu. Prehliadajte anglické alebo nemecké klasiky a nechajte ich preložiť do slovenčiny!'
              : '📚 České knihy nejsou v katalogu. Prohlížejte anglickou nebo německou klasiku a nechte ji přeložit do češtiny!'}
          </Text>
        </View>
      ) : null}

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search titles or authors..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Book List */}
      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <BookCard book={item} onPress={() => handleBookSelect(item)} />
        )}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

function BookCard({ book, onPress }: { book: GutenbergBook; onPress: () => void }) {
  const coverUrl = book.formats['image/jpeg'];
  const author = book.authors[0]?.name || 'Unknown';

  return (
    <Pressable style={styles.bookCard} onPress={onPress}>
      {coverUrl && (
        <Image source={{ uri: coverUrl }} style={styles.cover} />
      )}
      <View style={styles.bookInfo}>
        <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.author}>{author}</Text>
        <Text style={styles.downloads}>📥 {book.download_count.toLocaleString()}</Text>
      </View>
      <View style={styles.action}>
        <Text style={styles.actionText}>🎧 Create Audiobook</Text>
      </View>
    </Pressable>
  );
}
```

**Book Detail + Generate Flow:**

```typescript
// screens/GutenbergBookDetailScreen.tsx
export function GutenbergBookDetailScreen({ route }) {
  const { bookId } = route.params;
  const { data: book } = useQuery({
    queryKey: ['gutenberg-book', bookId],
    queryFn: () => gutendexApi.getBook(bookId),
  });

  const handleGenerate = async () => {
    // Navigate to generation screen with Gutenberg source
    navigation.navigate('Generate', {
      source: 'gutenberg',
      gutenbergId: bookId,
      title: book.title,
      author: book.authors[0]?.name,
      sourceLanguage: book.languages[0],
    });
  };

  // ... render book details, summary, subjects
}
```

#### Title Localization Strategy

**Goal:** All 5 language users see book titles in THEIR language - using the official localized title when available (e.g., "Pýcha a předsudek" in Czech, not machine-translated "Hrdost a předsudek").

**Architecture: Hybrid Approach**

| Priority | Source | Coverage | Example |
|----------|--------|----------|---------|
| 1️⃣ | Curated mappings | Top ~200 classics | "Pride and Prejudice" → "Pýcha a předsudek" (cs) |
| 2️⃣ | Wikipedia API | ~10,000 titles | Fetch localized article titles |
| 3️⃣ | Translation API | All remaining | DeepL/Google fallback |

**Curated Title Mappings (Essential Classics):**

```typescript
// data/classicTitles.ts
// Official localized titles for popular works - prevents bad machine translations

export const CURATED_TITLES: Record<number, Record<string, string>> = {
  // Gutenberg ID → { langCode: "Official Local Title" }
  
  // Pride and Prejudice (ID: 1342)
  1342: {
    en: "Pride and Prejudice",
    de: "Stolz und Vorurteil",
    es: "Orgullo y prejuicio",
    cs: "Pýcha a předsudek",
    sk: "Pýcha a predsudok",
  },
  
  // Crime and Punishment (ID: 2554)
  2554: {
    en: "Crime and Punishment",
    de: "Schuld und Sühne",
    es: "Crimen y castigo",
    cs: "Zločin a trest",
    sk: "Zločin a trest",
  },
  
  // Don Quixote (ID: 996)
  996: {
    en: "Don Quixote",
    de: "Don Quijote",
    es: "Don Quijote de la Mancha",
    cs: "Důmyslný rytíř Don Quijote de la Mancha",
    sk: "Dômyselný rytier Don Quijote de la Mancha",
  },
  
  // War and Peace (ID: 2600)
  2600: {
    en: "War and Peace",
    de: "Krieg und Frieden",
    es: "Guerra y paz",
    cs: "Vojna a mír",
    sk: "Vojna a mier",
  },
  
  // Frankenstein (ID: 84)
  84: {
    en: "Frankenstein",
    de: "Frankenstein",
    es: "Frankenstein",
    cs: "Frankenstein",
    sk: "Frankenstein",
  },
  
  // The Metamorphosis (ID: 5200)
  5200: {
    en: "The Metamorphosis",
    de: "Die Verwandlung",
    es: "La metamorfosis",
    cs: "Proměna",
    sk: "Premena",
  },
  
  // ... ~200 more essential classics
  // Full list maintained in separate JSON file
};

// Author name translations (some need localization)
export const CURATED_AUTHORS: Record<string, Record<string, string>> = {
  "Dostoyevsky, Fyodor": {
    en: "Fyodor Dostoevsky",
    de: "Fjodor Dostojewski",
    es: "Fiódor Dostoyevski",
    cs: "Fjodor Michajlovič Dostojevskij",
    sk: "Fiodor Michajlovič Dostojevskij",
  },
  "Kafka, Franz": {
    en: "Franz Kafka",
    de: "Franz Kafka",
    es: "Franz Kafka",
    cs: "Franz Kafka",
    sk: "Franz Kafka",
  },
  // ... more authors
};
```

**Wikipedia API Fallback (For Titles Not in Curated List):**

```typescript
// services/titleLocalization.ts
import { CURATED_TITLES, CURATED_AUTHORS } from '../data/classicTitles';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TITLE_CACHE_KEY = 'title_translations_v1';

interface LocalizedTitle {
  title: string;
  author: string;
  source: 'curated' | 'wikipedia' | 'translated';
}

// Try Wikipedia API for localized title
async function fetchWikipediaTitle(
  englishTitle: string,
  targetLang: string
): Promise<string | null> {
  try {
    // Search English Wikipedia for the book
    const searchUrl = `https://en.wikipedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(englishTitle)}` +
      `&prop=langlinks&lllang=${targetLang}&format=json&origin=*`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    const pages = Object.values(data.query.pages);
    const page = pages[0] as any;
    
    if (page.langlinks && page.langlinks.length > 0) {
      return page.langlinks[0]['*']; // Localized title
    }
    return null;
  } catch {
    return null;
  }
}

// Machine translation fallback (DeepL or Google)
async function translateTitle(
  title: string,
  targetLang: string
): Promise<string> {
  // Use your translation API endpoint
  const response = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: title,
      sourceLang: 'en',
      targetLang: targetLang,
    }),
  });
  const data = await response.json();
  return data.translation;
}

// Main function: Get localized book metadata
export async function getLocalizedBookInfo(
  book: GutenbergBook,
  targetLang: string
): Promise<LocalizedTitle> {
  const bookId = book.id;
  const originalTitle = book.title;
  const originalAuthor = book.authors[0]?.name || 'Unknown';
  
  // 1. Check curated mappings first (instant, most accurate)
  if (CURATED_TITLES[bookId]?.[targetLang]) {
    return {
      title: CURATED_TITLES[bookId][targetLang],
      author: CURATED_AUTHORS[originalAuthor]?.[targetLang] || originalAuthor,
      source: 'curated',
    };
  }
  
  // 2. Check local cache
  const cacheKey = `${bookId}_${targetLang}`;
  const cached = await AsyncStorage.getItem(`${TITLE_CACHE_KEY}_${cacheKey}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // 3. Try Wikipedia API
  const wikiTitle = await fetchWikipediaTitle(originalTitle, targetLang);
  if (wikiTitle) {
    const result: LocalizedTitle = {
      title: wikiTitle,
      author: CURATED_AUTHORS[originalAuthor]?.[targetLang] || originalAuthor,
      source: 'wikipedia',
    };
    await AsyncStorage.setItem(`${TITLE_CACHE_KEY}_${cacheKey}`, JSON.stringify(result));
    return result;
  }
  
  // 4. Fall back to machine translation
  const translatedTitle = await translateTitle(originalTitle, targetLang);
  const result: LocalizedTitle = {
    title: translatedTitle,
    author: CURATED_AUTHORS[originalAuthor]?.[targetLang] || originalAuthor,
    source: 'translated',
  };
  await AsyncStorage.setItem(`${TITLE_CACHE_KEY}_${cacheKey}`, JSON.stringify(result));
  return result;
}
```

**React Hook for Title Display:**

```typescript
// hooks/useLocalizedBook.ts
import { useQuery } from '@tanstack/react-query';
import { getLocalizedBookInfo } from '../services/titleLocalization';
import { useAppLanguage } from './useAppLanguage';

export function useLocalizedBook(book: GutenbergBook) {
  const { appLanguage } = useAppLanguage();
  
  return useQuery({
    queryKey: ['localizedBook', book.id, appLanguage],
    queryFn: () => getLocalizedBookInfo(book, appLanguage),
    staleTime: Infinity, // Titles don't change
    gcTime: 1000 * 60 * 60 * 24 * 30, // Cache 30 days
  });
}
```

**UI Display (Updated):**

```typescript
// components/BookCard.tsx
function BookCard({ book, onPress }: { book: GutenbergBook; onPress: () => void }) {
  const { data: localizedInfo, isLoading } = useLocalizedBook(book);
  const coverUrl = book.formats['image/jpeg'];

  return (
    <Pressable style={styles.bookCard} onPress={onPress}>
      {coverUrl && <Image source={{ uri: coverUrl }} style={styles.cover} />}
      <View style={styles.bookInfo}>
        {/* Show localized title */}
        <Text style={styles.title} numberOfLines={2}>
          {localizedInfo?.title || book.title}
        </Text>
        {/* Show source indicator for non-curated (optional, for debugging) */}
        {localizedInfo?.source === 'translated' && (
          <Text style={styles.translatedHint}>🔄</Text>
        )}
        <Text style={styles.author}>
          {localizedInfo?.author || book.authors[0]?.name}
        </Text>
        <Text style={styles.downloads}>
          📥 {book.download_count.toLocaleString()}
        </Text>
      </View>
      <View style={styles.action}>
        <Text style={styles.actionText}>🎧 Vytvoriť audioknihu</Text>
      </View>
    </Pressable>
  );
}
```

**Example UI Result (Slovak User):**
```
📖 Vojna a mier                    ← Curated Slovak title
   Lev Nikolajevič Tolstoj
   📥 89,234 downloads
   [🎧 Vytvoriť audioknihu]

📖 Pýcha a predsudok               ← Curated Slovak title  
   Jane Austen
   📥 156,789 downloads
   [🎧 Vytvoriť audioknihu]

📖 Der Struwwelpeter 🔄            ← Machine-translated (no curated)
   Heinrich Hoffmann
   📥 13,470 downloads
   [🎧 Vytvoriť audioknihu]
```

**Search: Also Localized**

Users can search in their language - the search checks both original titles AND localized titles:

```typescript
// services/gutendex.ts (updated)
export const gutendexApi = {
  searchLocalized: async (query: string, userLang: string) => {
    // 1. Search Gutendex with original query
    const results = await fetch(
      `${GUTENDEX_BASE}/books?search=${encodeURIComponent(query)}&copyright=false`
    ).then(r => r.json());
    
    // 2. If few results, also check our cached localized titles
    if (results.count < 10) {
      const localMatches = await searchLocalizedTitleCache(query, userLang);
      // Merge results, deduplicate by book ID
      // ...
    }
    
    return results;
  },
};
```

**Implementation Effort:**

| Task | Time | Notes |
|------|------|-------|
| Curated title JSON (~200 books) | 4 hrs | Manual research for accuracy |
| Wikipedia API integration | 2 hrs | Fetch + cache logic |
| Translation API fallback | 1 hr | Already have endpoint |
| useLocalizedBook hook | 1 hr | React Query integration |
| Search localization | 2 hrs | Dual-search logic |
| **Additional Total** | **10 hrs** | Added to base 12 hrs |

**Full Feature: 22 hours (~3 days)**

#### Implementation Timeline

| Task | Time | Notes |
|------|------|-------|
| Gutendex API service | 2 hrs | Fetch, search, pagination |
| Backend PG header stripper | 2 hrs | Critical for legal compliance |
| Free Classics list screen | 4 hrs | FlatList, search, language filter |
| Book detail screen | 2 hrs | Metadata, generate button |
| Integration with generation flow | 2 hrs | Connect to existing pipeline |
| Curated title mappings (~200 books) | 4 hrs | Manual research for accuracy |
| Wikipedia + Translation fallbacks | 3 hrs | API integration + caching |
| Localized search | 2 hrs | Search in user's language |
| **Total** | **21 hrs** | ~3 days |

#### Future Enhancements (Phase 2+)

- **Genre Categories:** Fiction, Science, Philosophy, History
- **Bookshelves:** Curated lists from Gutenberg (Harvard Classics, Nobel Prize Winners)
- **Favorites:** Save books for later
- **Reading Lists:** User-created collections
- **Offline Catalog:** Cache popular books for offline browsing

---

## 2.18 UI/UX Reference: TortugaPower/BookPlayer (CRITICAL)

> **🎯 MAJOR DESIGN DECISION:** VoiceLibri will use the open-source BookPlayer app as the PRIMARY UI/UX reference for building our audiobook player interface.

**Repository:** https://github.com/TortugaPower/BookPlayer

**What BookPlayer Is:**
- Open-source iOS audiobook player (Swift/SwiftUI)
- 3,800+ GitHub stars, actively maintained
- Feature-rich library management and player
- Clean, professional audiobook-focused design
- MIT licensed - free to reference and adapt concepts

**How We'll Use It:**

| Aspect | Approach |
|--------|----------|
| **UI Layouts** | Translate Swift layouts to TypeScript/React components |
| **Feature Set** | Adopt proven audiobook UX patterns |
| **Design Language** | Modernize with glassmorphism, updated icons |
| **Code** | Concept adaptation, NOT direct code port |
| **Stack** | TypeScript PWA (first) → React Native (clone) |

**Key BookPlayer Features to Adopt:**

1. **Library Management:**
   - Grid/list view toggle
   - Folder organization
   - Sort options (title, author, date added, recently played)
   - Search with filters
   - Progress indicators on book covers

2. **Player Interface:**
   - Large artwork display
   - Seek bar with chapter markers
   - Playback speed control (0.5x - 3.0x)
   - Sleep timer with multiple options (5/10/15/30/45/60 min, end of chapter)
   - Skip forward/backward buttons (configurable intervals)
   - Chapter list navigation
   - Lock screen integration

3. **Playback Features:**
   - Smart rewind (auto-rewind after pause based on pause duration)
   - Bookmarks with notes
   - Volume boost option
   - Global speed setting (same speed for all books)
   - Auto-play next chapter

4. **Settings & Customization:**
   - Skip interval configuration
   - Auto-sleep timer on play
   - Progress label options (remaining vs elapsed)
   - Theme customization

**VoiceLibri Improvements Over BookPlayer:**

| BookPlayer | VoiceLibri Enhancement |
|------------|------------------------|
| Standard iOS design | **Glassmorphism** with frosted glass effects |
| SF Symbols icons | **Custom modern icons** (outlined, animated) |
| Basic color themes | **Gradient accents**, glow effects |
| Static backgrounds | **Subtle animated gradients** |
| Standard lists | **Animated transitions**, micro-interactions |
| Basic player | **Waveform visualization**, character voice indicators |

**BookPlayer Structure to Study:**

```
BookPlayer/
├── BookPlayer/
│   ├── Library/           ← Library UI patterns
│   │   ├── MiniPlayer/    ← Persistent mini-player
│   │   └── Views/         ← List/grid components
│   ├── Player/            ← Full player screen
│   │   ├── Player Screen/ ← Main player UI
│   │   ├── Controls/      ← Playback controls
│   │   ├── SleepTimer.swift
│   │   └── PlayerManager.swift
│   ├── Settings/          ← Settings patterns
│   │   └── Sections/      ← Organized settings
│   └── Profile/           ← Account/subscription
├── BookPlayerKit/         ← Core services
│   └── CoreData/          ← Data models
└── BookPlayerWidgets/     ← Home screen widgets
```

**Implementation Approach:**

```
Phase 1: PWA (Weeks 1-5)
├── Study BookPlayer patterns
├── Translate to React components
├── Apply glassmorphism design system
├── Validate all features in browser
└── Test on iPhone via "Add to Home Screen"

Phase 2: React Native (Weeks 10-14)
├── Clone PWA component structure
├── Same component names, props, state
├── NativeWind (same Tailwind classes)
├── Add native-only features (background audio, IAP)
└── Platform-specific optimizations
```

**Specific Components to Reference:**

| BookPlayer File | VoiceLibri Component |
|-----------------|---------------------|
| `MiniPlayerView.swift` | `<MiniPlayer />` |
| `PlayerViewController.swift` | `<PlayerScreen />` |
| `SleepTimer.swift` | `useSleepTimer()` hook |
| `LibraryRootView.swift` | `<LibraryScreen />` |
| `PlayerControlsView.swift` | `<PlaybackControls />` |
| `BookmarkListView.swift` | `<BookmarkList />` |
| `SettingsPlayerControlsView.swift` | `<SettingsPlayback />` |

---

## 3. Technology Stack Decisions

### 3.1 Framework: Expo (NOT Bare React Native)

**Decision: Use Expo SDK 53+ with Development Builds**

| Consideration | Bare React Native | Expo (Managed) | Expo (Dev Build) ✅ |
|---------------|-------------------|----------------|---------------------|
| Setup time | Days | Minutes | Minutes |
| Native modules | Manual linking | Limited | Full access |
| OTA updates | Manual setup | Built-in | Built-in |
| EAS Build | N/A | Yes | Yes |
| Background audio | Complex | Expo AV | Any library |
| Maintenance | High | Low | Low |

**Why Expo Development Builds:**
- React Native official docs NOW recommend Expo
- EAS Build handles iOS/Android compilation
- OTA updates for instant bug fixes
- Access to ANY native library via dev builds
- 90% less DevOps overhead

**Expo SDK Version:** 53+ (ensure New Architecture support)

### 3.2 Audio Player: react-native-audio-pro

**Decision: Use react-native-audio-pro (NOT expo-av, NOT react-native-track-player)**

| Library | Stars | Maintained | Background | Lock Screen | Speed | Offline |
|---------|-------|------------|------------|-------------|-------|---------|
| expo-av | N/A | Yes | Limited | No | Yes | Yes |
| react-native-track-player | 3.2k | Slow updates | Yes | Yes | Yes | Yes |
| **react-native-audio-pro** | 184 | Active | Yes | Yes | Yes | Yes |

**Why react-native-audio-pro:**
```typescript
// Simple API, audiobook-focused features
import { AudioPlayer } from 'react-native-audio-pro';

const player = new AudioPlayer({
  onProgress: ({ position, duration }) => updateUI(position, duration),
  onStateChange: (state) => handleState(state),
});

// Load chapter
await player.load({
  url: 'file:///audiobooks/chapter1.mp3',
  title: 'Chapter 1: The Boy Who Lived',
  artist: 'J.K. Rowling',
  artwork: 'file:///covers/hp1.jpg',
});

// Audiobook-specific features
await player.setPlaybackSpeed(1.25);
await player.seekTo(position + 30000); // Skip 30s
await player.seekTo(position - 15000); // Back 15s
```

**Requires Expo Development Build** (not compatible with Expo Go)

### 3.3 Storage Stack (Local-Only MVP)

> **⚠️ CRITICAL:** Audio files are stored LOCALLY on device only (MVP). No cloud sync.

**Decision: MMKV + WatermelonDB + FileSystem (Sandboxed)**

| Data Type | Solution | Why |
|-----------|----------|-----|
| Auth tokens, settings | **MMKV** | 30x faster than AsyncStorage |
| Library metadata, progress | **WatermelonDB** | SQLite with lazy loading, 10k+ books |
| Audio files | **expo-file-system** | Native file management, sandboxed |
| Server cache | **TanStack Query** | Automatic cache invalidation |

**🔒 Sandboxed Storage (NOT visible in Files app):**

```typescript
// Audio Storage - Private App Directory
// Files are NOT accessible via iOS Files app or Android file managers

// iOS: Uses app's Documents directory (sandboxed)
// Android: Uses app's internal storage (not external SD card)

import * as FileSystem from 'expo-file-system';

// ✅ CORRECT - Private app storage (sandboxed)
const AUDIO_BASE_DIR = FileSystem.documentDirectory + 'audiobooks/';

// ❌ WRONG - Would be visible in Files app
// const AUDIO_BASE_DIR = FileSystem.cacheDirectory + 'audiobooks/';

// Directory structure (inside app sandbox)
// audiobooks/
// ├── {book-id}/
// │   ├── metadata.json       # Book info, voice assignments
// │   ├── chapter-001.mp3
// │   ├── chapter-002.mp3
// │   └── cover.jpg
// └── {another-book-id}/
//     └── ...
```

**Why Sandboxed Storage:**
| Benefit | Impact |
|---------|--------|
| **Privacy** | Users can't accidentally share/leak audiobook files |
| **Clean UX** | Files app isn't cluttered with audio chunks |
| **Similar to competitors** | Audible, Spotify, Podcasts all use sandboxed storage |
| **Prevents piracy** | Harder to extract and redistribute generated audio |
| **App control** | App manages cleanup, no orphaned files |

**Storage Implementation:**

```typescript
// services/audioStorage.ts
import * as FileSystem from 'expo-file-system';

const AUDIOBOOKS_DIR = FileSystem.documentDirectory + 'audiobooks/';

export const audioStorage = {
  // Ensure base directory exists
  async init() {
    const dirInfo = await FileSystem.getInfoAsync(AUDIOBOOKS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(AUDIOBOOKS_DIR, { intermediates: true });
    }
  },

  // Save generated audio chunk
  async saveChapter(bookId: string, chapterNum: number, audioData: string) {
    const bookDir = `${AUDIOBOOKS_DIR}${bookId}/`;
    await FileSystem.makeDirectoryAsync(bookDir, { intermediates: true });
    
    const filePath = `${bookDir}chapter-${String(chapterNum).padStart(3, '0')}.mp3`;
    await FileSystem.writeAsStringAsync(filePath, audioData, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return filePath;
  },

  // Get chapter file path for playback
  getChapterPath(bookId: string, chapterNum: number): string {
    return `${AUDIOBOOKS_DIR}${bookId}/chapter-${String(chapterNum).padStart(3, '0')}.mp3`;
  },

  // Delete entire book
  async deleteBook(bookId: string) {
    const bookDir = `${AUDIOBOOKS_DIR}${bookId}/`;
    await FileSystem.deleteAsync(bookDir, { idempotent: true });
  },

  // Get total storage used
  async getStorageUsed(): Promise<number> {
    const dirInfo = await FileSystem.getInfoAsync(AUDIOBOOKS_DIR);
    return dirInfo.size ?? 0;
  },

  // List all downloaded books
  async listBooks(): Promise<string[]> {
    const contents = await FileSystem.readDirectoryAsync(AUDIOBOOKS_DIR);
    return contents;
  },
};
```

**PWA Storage (IndexedDB - also sandboxed):**

```typescript
// services/audioStoragePWA.ts
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'voicelibri-audio';
const STORE_NAME = 'audioChunks';

export const audioStoragePWA = {
  async init() {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  },

  async saveChapter(bookId: string, chapterNum: number, audioBlob: Blob) {
    const db = await this.init();
    const key = `${bookId}/chapter-${chapterNum}`;
    await db.put(STORE_NAME, audioBlob, key);
    return key;
  },

  async getChapter(bookId: string, chapterNum: number): Promise<Blob | undefined> {
    const db = await this.init();
    const key = `${bookId}/chapter-${chapterNum}`;
    return db.get(STORE_NAME, key);
  },
};
```

**Cloud Sync Roadmap (Phase 3+):**

| Phase | Storage Model | Features |
|-------|---------------|----------|
| **MVP (Phase 1-2)** | Local only | Device storage, no sync |
| **Phase 3** | Optional cloud backup | Backup to Google Drive/iCloud |
| **Phase 4** | Full cloud sync | Cross-device library sync, streaming option |

**MMKV Setup:**
```typescript
// stores/mmkv.ts
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({
  id: 'voicelibri-storage',
  encryptionKey: 'your-encryption-key', // For sensitive data
});

// Type-safe wrapper
export const appStorage = {
  getAuthToken: () => storage.getString('auth.token'),
  setAuthToken: (token: string) => storage.set('auth.token', token),
  getPlaybackPosition: (bookId: string) => 
    storage.getNumber(`playback.${bookId}.position`) ?? 0,
  setPlaybackPosition: (bookId: string, position: number) => 
    storage.set(`playback.${bookId}.position`, position),
};
```

**WatermelonDB Schema:**
```typescript
// database/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'books',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'author', type: 'string' },
        { name: 'cover_path', type: 'string', isOptional: true },
        { name: 'total_duration', type: 'number' },
        { name: 'status', type: 'string' }, // 'generating' | 'ready' | 'error'
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'chapters',
      columns: [
        { name: 'book_id', type: 'string', isIndexed: true },
        { name: 'chapter_number', type: 'number' },
        { name: 'title', type: 'string' },
        { name: 'audio_path', type: 'string', isOptional: true },
        { name: 'duration', type: 'number' },
        { name: 'is_downloaded', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'playback_progress',
      columns: [
        { name: 'book_id', type: 'string', isIndexed: true },
        { name: 'chapter_id', type: 'string' },
        { name: 'position', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
```

### 3.4 State Management

**Decision: Zustand (UI state) + TanStack Query (server state)**

**Why NOT Redux:**
- Massive boilerplate for simple state
- TanStack Query handles server state better
- Zustand is 10x simpler for UI state

**Zustand Store:**
```typescript
// stores/playerStore.ts
import { create } from 'zustand';

interface PlayerState {
  currentBookId: string | null;
  currentChapter: number;
  isPlaying: boolean;
  playbackSpeed: number;
  sleepTimerMinutes: number | null;
  
  // Actions
  setCurrentBook: (bookId: string, chapter?: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setSleepTimer: (minutes: number | null) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentBookId: null,
  currentChapter: 0,
  isPlaying: false,
  playbackSpeed: 1.0,
  sleepTimerMinutes: null,
  
  setCurrentBook: (bookId, chapter = 0) => 
    set({ currentBookId: bookId, currentChapter: chapter }),
  togglePlayback: () => 
    set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (speed) => 
    set({ playbackSpeed: speed }),
  setSleepTimer: (minutes) => 
    set({ sleepTimerMinutes: minutes }),
}));
```

**TanStack Query for API:**
```typescript
// hooks/useLibrary.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export function useLibrary() {
  return useQuery({
    queryKey: ['library'],
    queryFn: api.getLibrary,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useGenerateBook() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.generateBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}
```

### 3.5 UI Framework: NativeWind v4

**Decision: NativeWind + gluestack-ui (free) OR NativewindUI ($149)**

| Option | Cost | Components | Quality |
|--------|------|------------|---------|
| NativeWind only | Free | Build yourself | Depends on you |
| gluestack-ui | Free | 30+ components | Good |
| **NativewindUI** | $149 one-time | 30+ premium | Excellent |

**Recommendation:** Start with gluestack-ui (free), upgrade to NativewindUI if needed.

**NativeWind Setup:**
```typescript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          900: '#0c4a6e',
        },
        surface: {
          DEFAULT: '#1a1a2e',
          secondary: '#16213e',
        },
      },
    },
  },
};
```

**Component Example:**
```tsx
// components/BookCard.tsx
import { View, Text, Image, Pressable } from 'react-native';
import { styled } from 'nativewind';

const StyledPressable = styled(Pressable);

export function BookCard({ book, onPress }) {
  return (
    <StyledPressable 
      onPress={onPress}
      className="bg-surface-secondary rounded-xl p-4 flex-row gap-4 active:opacity-80"
    >
      <Image 
        source={{ uri: book.coverUrl }}
        className="w-20 h-28 rounded-lg"
      />
      <View className="flex-1 justify-center">
        <Text className="text-white font-semibold text-lg" numberOfLines={2}>
          {book.title}
        </Text>
        <Text className="text-gray-400 text-sm mt-1">
          {book.author}
        </Text>
        <View className="flex-row items-center mt-2 gap-2">
          <View className="bg-primary-500/20 px-2 py-1 rounded">
            <Text className="text-primary-500 text-xs">
              {formatDuration(book.duration)}
            </Text>
          </View>
          {book.status === 'generating' && (
            <Text className="text-yellow-500 text-xs">Generating...</Text>
          )}
        </View>
      </View>
    </StyledPressable>
  );
}
```

### 3.6 Navigation: Expo Router v3

**Decision: Expo Router (file-based routing)**

```
src/
├── app/
│   ├── _layout.tsx          # Root layout
│   ├── index.tsx            # Redirect to /library or /auth
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab bar layout
│   │   ├── library.tsx      # Main library screen
│   │   ├── generate.tsx     # Upload & generate
│   │   └── settings.tsx     # Settings & subscription
│   ├── book/
│   │   └── [id].tsx         # Book detail/player
│   └── player/
│       └── [id].tsx         # Full-screen player
```

### 3.7 Authentication: Supabase Auth

**Decision: Supabase Auth (NOT Firebase, NOT custom)**

| Option | Cost | Setup | Features |
|--------|------|-------|----------|
| Firebase Auth | Free tier | Medium | Full suite |
| **Supabase Auth** | Free tier | Easy | Email, Social, Magic Link |
| Custom JWT | €0 | Hard | Full control |

**Why Supabase:**
- Generous free tier (50k MAU)
- Built-in social auth (Google, Apple)
- Works great with React Native
- Can self-host later if needed

---

## 4. Architecture Overview

### 4.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MOBILE APP                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Library   │  │  Generator  │  │   Player    │  │  Settings   │        │
│  │    Screen   │  │   Screen    │  │   Screen    │  │   Screen    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐        │
│  │                    STATE MANAGEMENT                             │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │        │
│  │  │   Zustand   │  │  TanStack   │  │    MMKV     │             │        │
│  │  │  (UI State) │  │   Query     │  │  (Persist)  │             │        │
│  │  └─────────────┘  └──────┬──────┘  └─────────────┘             │        │
│  └──────────────────────────┼─────────────────────────────────────┘        │
│                             │                                               │
│  ┌──────────────────────────┼─────────────────────────────────────┐        │
│  │                    LOCAL STORAGE                                │        │
│  │  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐             │        │
│  │  │ WatermelonDB│  │    Expo     │  │   Audio     │             │        │
│  │  │ (Metadata)  │  │ FileSystem  │  │   Player    │             │        │
│  │  └─────────────┘  └─────────────┘  └─────────────┘             │        │
│  └────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (REST + SSE)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND API                                     │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                     Express.js Server                            │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │        │
│  │  │    Auth     │  │  Generation │  │   Library   │             │        │
│  │  │ Controller  │  │ Controller  │  │ Controller  │             │        │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │        │
│  │         │                │                │                      │        │
│  │  ┌──────┴────────────────┴────────────────┴──────┐             │        │
│  │  │              Service Layer                     │             │        │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │             │        │
│  │  │  │ Chunker  │ │ TTS      │ │ Dramatize│       │             │        │
│  │  │  │ Service  │ │ Service  │ │ Service  │       │             │        │
│  │  │  └──────────┘ └──────────┘ └──────────┘       │             │        │
│  │  └───────────────────────────────────────────────┘             │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │   Supabase    │  │  Cloudflare   │  │    Stripe     │                   │
│  │   (Auth+DB)   │  │  R2 (Storage) │  │  (Payments)   │                   │
│  └───────────────┘  └───────────────┘  └───────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                  │
│  ┌───────────────┐  ┌───────────────┐                                       │
│  │  Gemini API   │  │  Gemini API   │                                       │
│  │  (TTS 2.5)    │  │  (LLM Flash)  │                                       │
│  └───────────────┘  └───────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Flow: Book Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. USER UPLOADS EBOOK                                                       │
│     └─► POST /api/v1/books/estimate                                         │
│         └─► Response: { estimatedHours: 8.5, estimatedCost: "8.5 hours" }   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. USER CONFIRMS GENERATION                                                 │
│     └─► POST /api/v1/books/generate                                         │
│         ├─► Deduct hours from balance                                       │
│         ├─► Create job record                                               │
│         └─► Return: { jobId: "abc123", status: "queued" }                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. BACKGROUND PROCESSING (Server)                                           │
│     ┌─────────────────────────────────────────────────────────────┐         │
│     │  a) Parse ebook (chapters, metadata)                        │         │
│     │  b) Clean text (remove artifacts, normalize)                │         │
│     │  c) Detect characters (LLM analysis)                        │         │
│     │  d) Dramatize (assign voices to dialogue)                   │         │
│     │  e) Generate TTS (parallel per chapter)                     │         │
│     │  f) Upload audio to R2                                      │         │
│     │  g) Update job status                                       │         │
│     └─────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. APP POLLS FOR STATUS / RECEIVES SSE                                      │
│     └─► GET /api/v1/jobs/{jobId}/status                                     │
│         └─► Response: { status: "processing", progress: 45, chapter: 3 }    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. GENERATION COMPLETE                                                      │
│     └─► Push notification to app                                            │
│     └─► App downloads chapter audio files                                   │
│     └─► Store in local filesystem                                           │
│     └─► Update WatermelonDB                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Offline-First Strategy

**Principle:** App must work fully offline after initial download.

```typescript
// services/syncManager.ts
export class SyncManager {
  // Download book audio files for offline playback
  async downloadBook(bookId: string, onProgress: (p: number) => void) {
    const book = await api.getBook(bookId);
    const chapters = book.chapters;
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const localPath = `${FileSystem.documentDirectory}audiobooks/${bookId}/${chapter.id}.mp3`;
      
      await FileSystem.downloadAsync(chapter.audioUrl, localPath, {
        progressCallback: (progress) => {
          const overall = (i + progress.loaded / progress.total) / chapters.length;
          onProgress(overall * 100);
        },
      });
      
      // Update local DB
      await database.write(async () => {
        const chapterRecord = await database.get('chapters').find(chapter.id);
        await chapterRecord.update((c) => {
          c.audioPath = localPath;
          c.isDownloaded = true;
        });
      });
    }
  }
  
  // Sync playback progress to server when online
  async syncProgress() {
    const unsyncedProgress = await database
      .get('playback_progress')
      .query(Q.where('synced', false))
      .fetch();
    
    if (unsyncedProgress.length === 0) return;
    
    try {
      await api.batchSyncProgress(unsyncedProgress.map(p => ({
        bookId: p.bookId,
        chapterId: p.chapterId,
        position: p.position,
        updatedAt: p.updatedAt,
      })));
      
      await database.write(async () => {
        for (const progress of unsyncedProgress) {
          await progress.update((p) => { p.synced = true; });
        }
      });
    } catch (error) {
      // Will retry on next sync
      console.log('Sync failed, will retry:', error);
    }
  }
}
```

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

```yaml
POST /api/v1/auth/register:
  body:
    email: string (required)
    password: string (required, min 8 chars)
  response:
    user: { id, email, createdAt }
    accessToken: string
    refreshToken: string

POST /api/v1/auth/login:
  body:
    email: string
    password: string
  response:
    user: { id, email, subscription, hoursBalance }
    accessToken: string
    refreshToken: string

POST /api/v1/auth/refresh:
  body:
    refreshToken: string
  response:
    accessToken: string
    refreshToken: string

POST /api/v1/auth/social:
  body:
    provider: "google" | "apple"
    idToken: string
  response:
    user: { id, email, subscription, hoursBalance }
    accessToken: string
    refreshToken: string
```

#### User & Subscription

```yaml
GET /api/v1/user/profile:
  response:
    id: string
    email: string
    subscription:
      plan: "free" | "pro" | "none"
      expiresAt: ISO8601 | null
      hoursIncluded: number
      hoursUsed: number
    hoursBalance: number  # Pay-as-you-go balance
    createdAt: ISO8601

POST /api/v1/user/subscription:
  headers:
    Idempotency-Key: string
  body:
    plan: "pro_monthly" | "pro_annual"
    paymentMethodId: string  # Stripe payment method
  response:
    subscription: { plan, expiresAt, hoursIncluded }
    receiptUrl: string

POST /api/v1/user/purchase-hours:
  headers:
    Idempotency-Key: string
  body:
    package: "5_hours" | "15_hours" | "30_hours"
    paymentMethodId: string
  response:
    hoursAdded: number
    hoursBalance: number
    receiptUrl: string
```

#### Library Management

```yaml
GET /api/v1/books:
  query:
    cursor: string (optional)
    limit: number (default 20, max 100)
    status: "all" | "ready" | "generating" | "error" (default "all")
  headers:
    If-None-Match: string (optional, ETag)
  response:
    books: Array<{
      id: string
      title: string
      author: string
      coverUrl: string | null
      totalDuration: number (seconds)
      chapterCount: number
      status: "ready" | "generating" | "error"
      progress: number | null (0-100 if generating)
      createdAt: ISO8601
    }>
    nextCursor: string | null
    totalCount: number
  headers:
    ETag: string
    X-RateLimit-Limit: 100
    X-RateLimit-Remaining: 99
    X-RateLimit-Reset: 1704067200

GET /api/v1/books/{bookId}:
  response:
    id: string
    title: string
    author: string
    description: string | null
    coverUrl: string | null
    totalDuration: number
    status: "ready" | "generating" | "error"
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
    generatedAt: ISO8601
    hoursUsed: number

DELETE /api/v1/books/{bookId}:
  response:
    success: true
    hoursRefunded: number | null  # If deleted within 24h of generation
```

#### Book Generation

```yaml
POST /api/v1/books/estimate:
  body:
    file: multipart/form-data (ebook file)
    # OR
    text: string (raw text content)
    options:
      translateTo: string | null (ISO 639-1 language code)
      voicePreset: "default" | "dramatic" | "calm"
  response:
    estimatedHours: number
    estimatedChapters: number
    estimatedCharacters: number
    detectedLanguage: string
    translationSurcharge: number | null
    userBalance:
      subscription: { hoursRemaining: number } | null
      payAsYouGo: number
    canGenerate: boolean
    insufficientHours: number | null  # How many more hours needed

POST /api/v1/books/generate:
  headers:
    Idempotency-Key: string (required)
  body:
    file: multipart/form-data
    # OR
    text: string
    title: string (optional, auto-detected if not provided)
    author: string (optional)
    options:
      translateTo: string | null
      voicePreset: "default" | "dramatic" | "calm"
  response:
    jobId: string
    bookId: string
    status: "queued"
    estimatedMinutes: number
    position: number  # Queue position

GET /api/v1/jobs/{jobId}:
  response:
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

# Server-Sent Events for real-time progress
GET /api/v1/jobs/{jobId}/stream:
  response: text/event-stream
  events:
    - event: progress
      data: { progress: 45, phase: "generating", chapter: 3 }
    - event: complete
      data: { bookId: "...", totalDuration: 28800 }
    - event: error
      data: { message: "Generation failed", code: "TTS_ERROR" }
```

#### Playback Sync

```yaml
POST /api/v1/sync/progress:
  body:
    updates: Array<{
      bookId: string
      chapterId: string
      position: number (seconds)
      updatedAt: ISO8601
    }>
  response:
    synced: number
    conflicts: Array<{
      bookId: string
      serverPosition: number
      serverUpdatedAt: ISO8601
    }>

GET /api/v1/sync/progress/{bookId}:
  response:
    bookId: string
    chapterId: string
    position: number
    updatedAt: ISO8601
```

### 5.4 Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_HOURS",
    "message": "You need 5.2 more hours to generate this book",
    "details": {
      "required": 8.5,
      "available": 3.3,
      "purchaseUrl": "/api/v1/user/purchase-hours"
    }
  }
}
```

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

```typescript
// Sync Algorithm
interface SyncDecision {
  bookId: string;
  clientPosition: number;
  clientUpdatedAt: number;
  serverPosition: number;
  serverUpdatedAt: number;
}

function resolveConflict(sync: SyncDecision): 'client' | 'server' {
  // If timestamps within 60 seconds, prefer larger position (user progressed)
  const timeDiff = Math.abs(sync.clientUpdatedAt - sync.serverUpdatedAt);
  if (timeDiff < 60000) {
    return sync.clientPosition > sync.serverPosition ? 'client' : 'server';
  }
  // Otherwise, most recent wins
  return sync.clientUpdatedAt > sync.serverUpdatedAt ? 'client' : 'server';
}
```

**Sync Behavior:**
| Scenario | Behavior |
|----------|----------|
| App goes online | Push local changes, pull server changes |
| Conflict detected | Apply resolution algorithm above |
| Server unreachable | Queue changes locally, retry with backoff |
| Fresh install | Pull all server state, no conflicts possible |

**Download Resume:**
```typescript
// Chapter download with resume support
async function downloadChapter(chapter: Chapter, onProgress: (p: number) => void) {
  const localPath = `${FileSystem.documentDirectory}books/${chapter.bookId}/${chapter.id}.mp3`;
  const tempPath = `${localPath}.partial`;
  
  // Check for partial download
  const existingInfo = await FileSystem.getInfoAsync(tempPath);
  const resumeFrom = existingInfo.exists ? existingInfo.size : 0;
  
  const download = FileSystem.createDownloadResumable(
    chapter.audioUrl,
    tempPath,
    { headers: resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {} },
    (progress) => onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite)
  );
  
  try {
    await download.downloadAsync();
    await FileSystem.moveAsync({ from: tempPath, to: localPath });
  } catch (error) {
    // Keep partial file for resume
    throw error;
  }
}
```

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
```typescript
// Sensitive data storage
import * as SecureStore from 'expo-secure-store';

// ✅ Tokens in SecureStore (encrypted)
await SecureStore.setItemAsync('refreshToken', token);

// ✅ Non-sensitive in MMKV (fast)
storage.set('lastPlayedBookId', bookId);

// ❌ NEVER store tokens in MMKV or AsyncStorage
```

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

```yaml
# Data Export (GDPR Article 20)
GET /api/v1/user/data-export:
  description: Returns all user data in JSON format
  response:
    profile: { email, createdAt, subscription }
    books: Array<{ id, title, createdAt, hoursUsed }>
    playbackHistory: Array<{ bookId, position, updatedAt }>
    billingHistory: Array<{ date, amount, description }>
  note: "Delivered via email link (large payload)"

# Account Deletion (GDPR Article 17)
DELETE /api/v1/user/account:
  body:
    confirmation: "DELETE MY ACCOUNT"  # Requires exact string
  response:
    success: true
    deletionScheduled: ISO8601  # 30-day grace period
  behavior:
    - Immediate: Disable login, anonymize analytics
    - 30 days: Delete all audio files, personal data
    - Retained: Anonymized usage stats for analytics
```

**Implementation Note:** These endpoints are **Phase 2** (post-MVP). For MVP launch, handle manually via support email with 30-day SLA.

---

## 6. Mobile App Implementation

### 6.1 Project Setup

**Step 1: Create Expo Project**
```bash
npx create-expo-app@latest voicelibri-app --template tabs
cd voicelibri-app
```

**Step 2: Install Core Dependencies**
```bash
# Navigation (already included with tabs template)
npx expo install expo-router

# Storage
npx expo install react-native-mmkv @nozbe/watermelondb

# State Management
npm install zustand @tanstack/react-query

# UI
npm install nativewind tailwindcss
npx expo install react-native-reanimated

# Audio (requires development build)
npm install react-native-audio-pro

# Auth
npm install @supabase/supabase-js

# Utilities
npx expo install expo-file-system expo-secure-store expo-notifications
```

**Step 3: Configure Development Build**
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Create development build (iOS simulator)
eas build --profile development --platform ios

# Create development build (Android emulator)
eas build --profile development --platform android
```

**Step 4: Configure NativeWind**
```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        dark: {
          DEFAULT: '#0f0f23',
          100: '#1a1a2e',
          200: '#16213e',
          300: '#1f2937',
        },
      },
    },
  },
  plugins: [],
};
```

### 6.2 Folder Structure

```
src/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout with providers
│   ├── index.tsx                 # Entry redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Library (home)
│   │   ├── generate.tsx          # Upload & generate
│   │   └── settings.tsx          # Settings & subscription
│   ├── book/
│   │   └── [id].tsx              # Book detail screen
│   └── player/
│       └── [id].tsx              # Full-screen player
│
├── components/
│   ├── ui/                       # Base UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── ProgressBar.tsx
│   ├── library/
│   │   ├── BookCard.tsx
│   │   ├── BookList.tsx
│   │   └── EmptyLibrary.tsx
│   ├── player/
│   │   ├── MiniPlayer.tsx
│   │   ├── FullPlayer.tsx
│   │   ├── ChapterList.tsx
│   │   ├── SleepTimer.tsx
│   │   └── SpeedControl.tsx
│   └── generation/
│       ├── FileUploader.tsx
│       ├── CostEstimate.tsx
│       └── ProgressTracker.tsx
│
├── hooks/
│   ├── useAuth.ts
│   ├── useLibrary.ts
│   ├── usePlayer.ts
│   ├── useGeneration.ts
│   └── useSubscription.ts
│
├── services/
│   ├── api.ts                    # API client
│   ├── auth.ts                   # Supabase auth
│   ├── audioPlayer.ts            # Audio player wrapper
│   ├── downloadManager.ts        # Background downloads
│   └── syncManager.ts            # Offline sync
│
├── stores/
│   ├── playerStore.ts            # Playback state
│   ├── authStore.ts              # Auth state
│   └── settingsStore.ts          # User preferences
│
├── database/
│   ├── schema.ts                 # WatermelonDB schema
│   ├── models/
│   │   ├── Book.ts
│   │   ├── Chapter.ts
│   │   └── PlaybackProgress.ts
│   └── index.ts                  # Database instance
│
├── utils/
│   ├── formatters.ts             # Duration, date formatting
│   ├── validators.ts             # Input validation
│   └── constants.ts              # App constants
│
└── types/
    ├── api.ts                    # API response types
    ├── models.ts                 # Data model types
    └── navigation.ts             # Navigation types
```

### 6.3 Core Components Implementation

#### Root Layout with Providers
```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from '../database';
import { AuthProvider } from '../contexts/AuthContext';
import { MiniPlayer } from '../components/player/MiniPlayer';
import '../global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider database={database}>
          <AuthProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0f0f23' },
              }}
            />
            <MiniPlayer />
          </AuthProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

#### Library Screen
```tsx
// src/app/(tabs)/index.tsx
import { View, FlatList, RefreshControl } from 'react-native';
import { useLibrary } from '../../hooks/useLibrary';
import { BookCard } from '../../components/library/BookCard';
import { EmptyLibrary } from '../../components/library/EmptyLibrary';
import { GeneratingBooks } from '../../components/library/GeneratingBooks';

export default function LibraryScreen() {
  const { 
    books, 
    generatingBooks,
    isLoading, 
    isRefreshing,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useLibrary();

  return (
    <View className="flex-1 bg-dark">
      {/* Header */}
      <View className="px-4 pt-16 pb-4">
        <Text className="text-white text-3xl font-bold">Library</Text>
        <Text className="text-gray-400 mt-1">
          {books.length} audiobooks
        </Text>
      </View>

      {/* Generating Books Section */}
      {generatingBooks.length > 0 && (
        <GeneratingBooks books={generatingBooks} />
      )}

      {/* Book List */}
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookCard book={item} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<EmptyLibrary />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetch}
            tintColor="#3b82f6"
          />
        }
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}
```

#### Audio Player Service
```tsx
// src/services/audioPlayer.ts
import { AudioPlayer } from 'react-native-audio-pro';
import { storage } from '../stores/mmkv';
import { usePlayerStore } from '../stores/playerStore';

class AudioService {
  private player: AudioPlayer | null = null;
  private saveProgressInterval: NodeJS.Timeout | null = null;

  async initialize() {
    this.player = new AudioPlayer({
      onProgress: ({ position, duration }) => {
        usePlayerStore.getState().updateProgress(position, duration);
      },
      onStateChange: (state) => {
        usePlayerStore.getState().setPlaybackState(state);
      },
      onTrackChange: (track) => {
        usePlayerStore.getState().setCurrentTrack(track);
      },
    });

    // Save progress every 5 seconds
    this.saveProgressInterval = setInterval(() => {
      this.saveProgress();
    }, 5000);
  }

  async loadBook(bookId: string, chapterId?: string) {
    const store = usePlayerStore.getState();
    const book = await this.getBookFromDB(bookId);
    
    // Get last position if resuming
    const lastProgress = storage.getNumber(`progress.${bookId}`) ?? 0;
    const lastChapter = storage.getString(`chapter.${bookId}`) ?? book.chapters[0].id;
    
    const startChapter = chapterId ?? lastChapter;
    const startPosition = chapterId ? 0 : lastProgress;

    // Build playlist from chapters
    const playlist = book.chapters.map((ch) => ({
      id: ch.id,
      url: ch.audioPath || ch.audioUrl,
      title: ch.title,
      artist: book.author,
      album: book.title,
      artwork: book.coverPath || book.coverUrl,
    }));

    await this.player?.setPlaylist(playlist);
    
    // Skip to correct chapter and position
    const chapterIndex = book.chapters.findIndex(c => c.id === startChapter);
    if (chapterIndex > 0) {
      await this.player?.skipToTrack(chapterIndex);
    }
    if (startPosition > 0) {
      await this.player?.seekTo(startPosition);
    }

    store.setCurrentBook(bookId, chapterIndex);
  }

  async play() {
    await this.player?.play();
  }

  async pause() {
    await this.player?.pause();
  }

  async seekTo(position: number) {
    await this.player?.seekTo(position);
  }

  async skipForward(seconds: number = 30) {
    const current = await this.player?.getPosition() ?? 0;
    await this.player?.seekTo(current + seconds * 1000);
  }

  async skipBackward(seconds: number = 15) {
    const current = await this.player?.getPosition() ?? 0;
    await this.player?.seekTo(Math.max(0, current - seconds * 1000));
  }

  async setPlaybackSpeed(speed: number) {
    await this.player?.setRate(speed);
    usePlayerStore.getState().setPlaybackSpeed(speed);
  }

  async nextChapter() {
    await this.player?.skipToNext();
  }

  async previousChapter() {
    await this.player?.skipToPrevious();
  }

  private saveProgress() {
    const { currentBookId, currentChapter, position } = usePlayerStore.getState();
    if (currentBookId && position > 0) {
      storage.set(`progress.${currentBookId}`, position);
      storage.set(`chapter.${currentBookId}`, currentChapter);
    }
  }

  private async getBookFromDB(bookId: string) {
    // Implementation using WatermelonDB
  }

  destroy() {
    if (this.saveProgressInterval) {
      clearInterval(this.saveProgressInterval);
    }
    this.player?.destroy();
  }
}

export const audioService = new AudioService();
```

#### Full Screen Player
```tsx
// src/app/player/[id].tsx
import { View, Text, Image, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { usePlayerStore } from '../../stores/playerStore';
import { audioService } from '../../services/audioPlayer';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration } from '../../utils/formatters';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { 
    isPlaying, 
    position, 
    duration,
    playbackSpeed,
    currentChapter,
    currentBook,
  } = usePlayerStore();

  const handlePlayPause = async () => {
    if (isPlaying) {
      await audioService.pause();
    } else {
      await audioService.play();
    }
  };

  return (
    <View className="flex-1 bg-dark px-6">
      {/* Close Button */}
      <Pressable 
        onPress={() => router.back()}
        className="absolute top-16 left-6 z-10"
      >
        <Ionicons name="chevron-down" size={32} color="white" />
      </Pressable>

      {/* Cover Art */}
      <View className="flex-1 justify-center items-center pt-20">
        <Image
          source={{ uri: currentBook?.coverUrl }}
          className="w-72 h-72 rounded-2xl shadow-2xl"
        />
      </View>

      {/* Track Info */}
      <View className="py-6">
        <Text className="text-white text-2xl font-bold text-center" numberOfLines={1}>
          {currentBook?.title}
        </Text>
        <Text className="text-gray-400 text-lg text-center mt-1">
          {currentBook?.chapters[currentChapter]?.title}
        </Text>
      </View>

      {/* Progress Slider */}
      <View className="mb-4">
        <Slider
          value={position}
          minimumValue={0}
          maximumValue={duration}
          onSlidingComplete={(value) => audioService.seekTo(value)}
          minimumTrackTintColor="#3b82f6"
          maximumTrackTintColor="#374151"
          thumbTintColor="#3b82f6"
        />
        <View className="flex-row justify-between px-1">
          <Text className="text-gray-400 text-sm">
            {formatDuration(position)}
          </Text>
          <Text className="text-gray-400 text-sm">
            {formatDuration(duration)}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View className="flex-row justify-center items-center gap-8 mb-8">
        {/* Previous Chapter */}
        <Pressable onPress={() => audioService.previousChapter()}>
          <Ionicons name="play-skip-back" size={32} color="white" />
        </Pressable>

        {/* Rewind 15s */}
        <Pressable onPress={() => audioService.skipBackward(15)}>
          <View className="items-center">
            <Ionicons name="refresh" size={28} color="white" 
              style={{ transform: [{ scaleX: -1 }] }} />
            <Text className="text-white text-xs">15</Text>
          </View>
        </Pressable>

        {/* Play/Pause */}
        <Pressable
          onPress={handlePlayPause}
          className="w-20 h-20 rounded-full bg-primary-500 justify-center items-center"
        >
          <Ionicons 
            name={isPlaying ? "pause" : "play"} 
            size={36} 
            color="white"
            style={{ marginLeft: isPlaying ? 0 : 4 }}
          />
        </Pressable>

        {/* Forward 30s */}
        <Pressable onPress={() => audioService.skipForward(30)}>
          <View className="items-center">
            <Ionicons name="refresh" size={28} color="white" />
            <Text className="text-white text-xs">30</Text>
          </View>
        </Pressable>

        {/* Next Chapter */}
        <Pressable onPress={() => audioService.nextChapter()}>
          <Ionicons name="play-skip-forward" size={32} color="white" />
        </Pressable>
      </View>

      {/* Bottom Controls */}
      <View className="flex-row justify-around pb-12">
        {/* Speed Control */}
        <SpeedButton 
          speed={playbackSpeed} 
          onPress={() => /* Show speed modal */} 
        />

        {/* Sleep Timer */}
        <SleepTimerButton />

        {/* Chapter List */}
        <Pressable onPress={() => /* Show chapters modal */}>
          <Ionicons name="list" size={24} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

function SpeedButton({ speed, onPress }) {
  return (
    <Pressable 
      onPress={onPress}
      className="px-3 py-1 rounded-full border border-gray-600"
    >
      <Text className="text-white font-medium">{speed}x</Text>
    </Pressable>
  );
}
```

#### Generation Flow
```tsx
// src/app/(tabs)/generate.tsx
import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useGeneration } from '../../hooks/useGeneration';
import { FileUploader } from '../../components/generation/FileUploader';
import { CostEstimate } from '../../components/generation/CostEstimate';
import { Button } from '../../components/ui/Button';

export default function GenerateScreen() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [translateTo, setTranslateTo] = useState<string | null>(null);
  
  const { 
    estimate, 
    isEstimating,
    estimateError,
    getEstimate,
    generate,
    isGenerating,
  } = useGeneration();

  const handleFilePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'application/epub+zip'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      setFile(result.assets[0]);
      await getEstimate(result.assets[0], { translateTo });
    }
  };

  const handleGenerate = async () => {
    if (!file || !estimate) return;

    if (!estimate.canGenerate) {
      Alert.alert(
        'Insufficient Hours',
        `You need ${estimate.insufficientHours.toFixed(1)} more hours. Would you like to purchase more?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Purchase', onPress: () => router.push('/settings/subscription') },
        ]
      );
      return;
    }

    await generate(file, { translateTo });
  };

  return (
    <ScrollView className="flex-1 bg-dark">
      <View className="px-4 pt-16 pb-4">
        <Text className="text-white text-3xl font-bold">Generate</Text>
        <Text className="text-gray-400 mt-1">
          Transform your ebooks into audiobooks
        </Text>
      </View>

      {/* File Upload */}
      <View className="px-4 mt-4">
        <FileUploader
          file={file}
          onPress={handleFilePick}
          isLoading={isEstimating}
        />
      </View>

      {/* Cost Estimate */}
      {estimate && (
        <CostEstimate
          estimate={estimate}
          translateTo={translateTo}
          onTranslateChange={setTranslateTo}
          className="mx-4 mt-6"
        />
      )}

      {/* Generate Button */}
      {estimate && (
        <View className="px-4 mt-8">
          <Button
            title={estimate.canGenerate 
              ? `Generate (${estimate.estimatedHours.toFixed(1)} hours)`
              : `Need ${estimate.insufficientHours.toFixed(1)} more hours`
            }
            onPress={handleGenerate}
            disabled={!estimate.canGenerate || isGenerating}
            loading={isGenerating}
            variant={estimate.canGenerate ? 'primary' : 'secondary'}
          />
        </View>
      )}

      {/* Tips */}
      <View className="px-4 mt-8 pb-8">
        <Text className="text-gray-400 text-sm">
          💡 Tip: TXT and EPUB files work best. PDF conversion coming soon!
        </Text>
        <Text className="text-gray-400 text-sm mt-2">
          📚 Need ebooks? Check Settings → Free Ebook Resources
        </Text>
      </View>
    </ScrollView>
  );
}
```

### 6.4 Sleep Timer Implementation

```tsx
// src/components/player/SleepTimer.tsx
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { audioService } from '../../services/audioPlayer';
import { usePlayerStore } from '../../stores/playerStore';

const TIMER_OPTIONS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: 'End of chapter', value: 'chapter' },
  { label: 'Off', value: null },
];

export function SleepTimerButton() {
  const [modalVisible, setModalVisible] = useState(false);
  const { sleepTimer, setSleepTimer } = usePlayerStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sleepTimer?.type === 'time' && sleepTimer.endsAt) {
      const remaining = sleepTimer.endsAt - Date.now();
      if (remaining > 0) {
        timerRef.current = setTimeout(async () => {
          await audioService.pause();
          setSleepTimer(null);
        }, remaining);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sleepTimer]);

  const handleSelect = (value: number | 'chapter' | null) => {
    if (value === null) {
      setSleepTimer(null);
    } else if (value === 'chapter') {
      setSleepTimer({ type: 'chapter' });
    } else {
      setSleepTimer({
        type: 'time',
        endsAt: Date.now() + value * 60 * 1000,
      });
    }
    setModalVisible(false);
  };

  const remainingMinutes = sleepTimer?.endsAt
    ? Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)
    : null;

  return (
    <>
      <Pressable onPress={() => setModalVisible(true)}>
        <View className="items-center">
          <Ionicons 
            name="moon" 
            size={24} 
            color={sleepTimer ? '#3b82f6' : 'white'} 
          />
          {remainingMinutes && (
            <Text className="text-primary-500 text-xs mt-1">
              {remainingMinutes}m
            </Text>
          )}
        </View>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-dark-100 rounded-t-3xl px-6 py-8">
            <Text className="text-white text-xl font-bold mb-6">Sleep Timer</Text>
            
            {TIMER_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => handleSelect(option.value)}
                className={`py-4 border-b border-gray-800 ${
                  (sleepTimer?.type === 'chapter' && option.value === 'chapter') ||
                  (!sleepTimer && option.value === null)
                    ? 'bg-primary-500/20'
                    : ''
                }`}
              >
                <Text className="text-white text-lg">{option.label}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setModalVisible(false)}
              className="mt-4 py-4 items-center"
            >
              <Text className="text-gray-400 text-lg">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
```

---

## 7. Backend Refactoring Guide

### 7.1 Current State Analysis

The current `apps/backend/src/index.ts` is ~2330 lines in a single file. This needs refactoring for:
- Maintainability
- Testability
- Scalability
- Separation of concerns

### 7.2 Target Architecture

```
apps/backend/src/
├── index.ts                      # Entry point (minimal)
├── app.ts                        # Express app configuration
├── config/
│   ├── index.ts                  # Environment config
│   ├── gemini.ts                 # Gemini API config
│   └── supabase.ts               # Supabase config
│
├── controllers/
│   ├── authController.ts         # Auth endpoints
│   ├── bookController.ts         # Library CRUD
│   ├── generationController.ts   # Generation endpoints
│   ├── subscriptionController.ts # Subscription management
│   └── syncController.ts         # Progress sync
│
├── services/
│   ├── authService.ts            # Auth business logic
│   ├── bookService.ts            # Book management
│   ├── generationService.ts      # Orchestrates generation
│   ├── chunkingService.ts        # Text chunking
│   ├── dramatizationService.ts   # Character extraction + tagging
│   ├── ttsService.ts             # Gemini TTS calls
│   ├── translationService.ts     # Translation
│   ├── storageService.ts         # R2/S3 uploads
│   └── subscriptionService.ts    # Stripe integration
│
├── models/
│   ├── Book.ts
│   ├── Chapter.ts
│   ├── Job.ts
│   └── User.ts
│
├── middleware/
│   ├── auth.ts                   # JWT verification
│   ├── rateLimit.ts              # Rate limiting
│   ├── validation.ts             # Request validation
│   ├── idempotency.ts            # Idempotency key handling
│   └── errorHandler.ts           # Global error handler
│
├── routes/
│   ├── index.ts                  # Route aggregator
│   ├── authRoutes.ts
│   ├── bookRoutes.ts
│   ├── generationRoutes.ts
│   └── subscriptionRoutes.ts
│
├── workers/
│   ├── generationWorker.ts       # Background job processor
│   └── cleanupWorker.ts          # Temp file cleanup
│
├── utils/
│   ├── logger.ts                 # Structured logging
│   ├── errors.ts                 # Custom error classes
│   ├── validators.ts             # Zod schemas
│   └── helpers.ts                # Utility functions
│
└── types/
    ├── api.ts                    # API types
    ├── services.ts               # Internal types
    └── gemini.ts                 # Gemini API types
```

### 7.3 Refactoring Strategy

**Phase 1: Extract Configuration**
```typescript
// src/config/index.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  GEMINI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY: z.string().min(1),
  R2_SECRET_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});

export const config = envSchema.parse(process.env);
```

**Phase 2: Create Service Classes**
```typescript
// src/services/ttsService.ts
import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TTSRequest {
  text: string;
  voice: string;
  language?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
}

export class TTSService {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }

  async generateSpeech(request: TTSRequest): Promise<TTSResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: request.text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voice } },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) {
        throw new Error('No audio data in response');
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      const durationMs = this.estimateDuration(audioBuffer);

      logger.info('TTS generated', {
        voice: request.voice,
        textLength: request.text.length,
        durationMs,
        latencyMs: Date.now() - startTime,
      });

      return { audioBuffer, durationMs };
    } catch (error) {
      logger.error('TTS generation failed', { error, request });
      throw error;
    }
  }

  private estimateDuration(audioBuffer: Buffer): number {
    // Estimate based on file size and typical bitrate
    const bytesPerSecond = 16000; // Approximate for PCM
    return (audioBuffer.length / bytesPerSecond) * 1000;
  }
}
```

**Phase 3: Create Controllers**
```typescript
// src/controllers/generationController.ts
import { Request, Response, NextFunction } from 'express';
import { GenerationService } from '../services/generationService';
import { z } from 'zod';

const estimateSchema = z.object({
  text: z.string().optional(),
  options: z.object({
    translateTo: z.string().nullable().optional(),
    voicePreset: z.enum(['default', 'dramatic', 'calm']).optional(),
  }).optional(),
});

const generateSchema = estimateSchema.extend({
  title: z.string().optional(),
  author: z.string().optional(),
});

export class GenerationController {
  constructor(private generationService: GenerationService) {}

  estimate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = estimateSchema.parse(req.body);
      const file = req.file;

      if (!body.text && !file) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Text or file required' },
        });
      }

      const estimate = await this.generationService.estimate({
        text: body.text,
        filePath: file?.path,
        options: body.options,
        userId: req.userId!,
      });

      res.json(estimate);
    } catch (error) {
      next(error);
    }
  };

  generate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = generateSchema.parse(req.body);
      const file = req.file;
      const idempotencyKey = req.headers['idempotency-key'] as string;

      if (!idempotencyKey) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key header required' },
        });
      }

      const result = await this.generationService.startGeneration({
        text: body.text,
        filePath: file?.path,
        title: body.title,
        author: body.author,
        options: body.options,
        userId: req.userId!,
        idempotencyKey,
      });

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  };

  getJobStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = await this.generationService.getJobStatus(jobId, req.userId!);

      if (!job) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Job not found' },
        });
      }

      res.json(job);
    } catch (error) {
      next(error);
    }
  };

  streamJobProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const unsubscribe = this.generationService.subscribeToJob(
        jobId,
        req.userId!,
        (event) => {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event.data)}\n\n`);

          if (event.type === 'complete' || event.type === 'error') {
            res.end();
          }
        }
      );

      req.on('close', () => {
        unsubscribe();
      });
    } catch (error) {
      next(error);
    }
  };
}
```

**Phase 4: Implement Middleware**
```typescript
// src/middleware/idempotency.ts
import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) {
    return next();
  }

  const cacheKey = `idempotency:${req.userId}:${idempotencyKey}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const response = JSON.parse(cached);
    return res.status(response.status).json(response.body);
  }

  // Intercept response to cache it
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    redis.setex(cacheKey, IDEMPOTENCY_TTL, JSON.stringify({
      status: res.statusCode,
      body,
    }));
    return originalJson(body);
  };

  next();
}
```

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

### 7.5 Cloud Infrastructure (Google Cloud Platform)

> **Decision:** Use Google Cloud for ALL infrastructure to keep services under one roof.

**Why Google Cloud:**
| Benefit | Impact |
|---------|--------|
| **Single ecosystem** | One billing, one console, unified IAM |
| **Gemini integration** | Same provider as our TTS API |
| **Auto-scaling** | Cloud Run scales to zero, no idle costs |
| **Global CDN** | Cloud CDN with edge locations |
| **Competitive pricing** | Often cheaper than AWS for our workload |

**Infrastructure Stack:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  GOOGLE CLOUD PLATFORM - VoiceLibri Infrastructure                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │  Cloud Run       │     │  Cloud SQL       │                      │
│  │  (Backend API)   │────▶│  (PostgreSQL)    │                      │
│  │  Auto-scaling    │     │  db-f1-micro     │                      │
│  │  min: 0, max: 10 │     │  10GB storage    │                      │
│  └────────┬─────────┘     └──────────────────┘                      │
│           │                                                          │
│           │  ┌──────────────────┐                                   │
│           └─▶│  Gemini API      │                                   │
│              │  (TTS + LLM)     │                                   │
│              │  Same project    │                                   │
│              └──────────────────┘                                   │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │  Cloud CDN       │     │  Cloud Tasks     │                      │
│  │  (Static assets) │     │  (Job queue)     │                      │
│  │  Global edge     │     │  Async gen jobs  │                      │
│  └──────────────────┘     └──────────────────┘                      │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │  Firebase Auth   │     │  Cloud           │                      │
│  │  (User auth)     │     │  Monitoring      │                      │
│  │  Free tier OK    │     │  (Logs/Metrics)  │                      │
│  └──────────────────┘     └──────────────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Cost Breakdown (100 Users - MVP):**

| Service | Configuration | Est. Monthly Cost |
|---------|---------------|-------------------|
| **Cloud Run** | 1 vCPU, 512MB, scale 0-10 | €15-30 |
| **Cloud SQL** | db-f1-micro, 10GB | €10-15 |
| **Cloud CDN** | 10GB bandwidth | €5-10 |
| **Cloud Tasks** | 1M requests | €0 (free tier) |
| **Firebase Auth** | 10k MAU | €0 (free tier) |
| **Cloud Monitoring** | Basic logs | €0 (free tier) |
| **Secret Manager** | 5 secrets | €0 (free tier) |
| **Total MVP** | | **~€30-55/month** |

**Scaling Configuration (Auto-scale):**

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: voicelibri-api
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"      # Scale to zero
        autoscaling.knative.dev/maxScale: "10"     # Max instances
        run.googleapis.com/cpu-throttling: "false" # Full CPU during requests
    spec:
      containerConcurrency: 80   # Requests per instance
      timeoutSeconds: 300        # TTS generation can be slow
      containers:
        - image: gcr.io/voicelibri/api:latest
          resources:
            limits:
              cpu: "1"
              memory: "1Gi"
          env:
            - name: NODE_ENV
              value: "production"
            - name: GEMINI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: gemini-api-key
                  key: latest
```

**Deployment Pipeline (Cloud Build):**

```yaml
# cloudbuild.yaml
steps:
  # Build
  - name: 'node:20'
    entrypoint: 'npm'
    args: ['ci']
    dir: 'apps/backend'
  
  - name: 'node:20'
    entrypoint: 'npm'
    args: ['run', 'build']
    dir: 'apps/backend'
  
  # Docker build
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/api:$COMMIT_SHA', '.']
    dir: 'apps/backend'
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/api:$COMMIT_SHA']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'voicelibri-api'
      - '--image=gcr.io/$PROJECT_ID/api:$COMMIT_SHA'
      - '--region=europe-west1'
      - '--platform=managed'
      - '--allow-unauthenticated'

timeout: '1200s'
```

**At Scale (1000+ Users):**

| Service | Configuration | Est. Monthly Cost |
|---------|---------------|-------------------|
| **Cloud Run** | 2 vCPU, 2GB, scale 0-50 | €100-200 |
| **Cloud SQL** | db-g1-small, 50GB | €50-80 |
| **Cloud CDN** | 100GB bandwidth | €30-50 |
| **Cloud Tasks** | 10M requests | €10 |
| **Firebase Auth** | 100k MAU | €0-25 |
| **Cloud Monitoring** | Full stack | €20-50 |
| **Total Scaled** | | **~€210-415/month** |

---

## 8. Design System - Premium UI/UX Standards

> **Goal:** App Store-featured quality design that builds instant user trust  
> **Inspiration:** Spotify, Audible, Apple Music, Linear, Raycast, **TortugaPower/BookPlayer**  
> **Principle:** Dark-first, glass morphism accents, buttery animations

### 8.1 Design Philosophy

**VoiceLibri Brand Identity:**
- **Premium & Sophisticated** — Not another cheap TTS app
- **Dark Mode First** — Reduces eye strain for audiobook listeners
- **Minimal & Focused** — One primary action per screen
- **Delightful Micro-interactions** — Smooth animations everywhere

**Design Pillars:**
| Pillar | Implementation |
|--------|----------------|
| **Trust** | Clean typography, professional colors, no clutter |
| **Delight** | Spring animations, haptic feedback, smooth transitions |
| **Clarity** | Clear hierarchy, obvious CTAs, readable text |
| **Speed** | Skeleton loaders, optimistic UI, perceived performance |

### 8.2 Color System

**Dark Theme (Primary - Default)**

```typescript
// theme/colors.ts
export const darkTheme = {
  // Backgrounds - Rich, layered depth
  background: {
    base: '#09090b',        // Pure dark (zinc-950)
    elevated: '#18181b',    // Cards, modals (zinc-900)
    surface: '#27272a',     // Input fields (zinc-800)
    overlay: 'rgba(0,0,0,0.8)', // Modal backdrop
  },
  
  // Text - High contrast for readability
  text: {
    primary: '#fafafa',     // Main text (zinc-50)
    secondary: '#a1a1aa',   // Subtitles (zinc-400)
    tertiary: '#71717a',    // Timestamps (zinc-500)
    muted: '#52525b',       // Disabled (zinc-600)
    inverse: '#09090b',     // On light backgrounds
  },
  
  // Brand Accent - Vibrant purple-blue gradient
  accent: {
    primary: '#8b5cf6',     // Violet-500 (main CTA)
    primaryHover: '#7c3aed', // Violet-600
    secondary: '#06b6d4',   // Cyan-500 (secondary actions)
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
  },
  
  // Status Colors
  status: {
    success: '#22c55e',     // Green-500
    warning: '#f59e0b',     // Amber-500
    error: '#ef4444',       // Red-500
    info: '#3b82f6',        // Blue-500
  },
  
  // Glass Morphism
  glass: {
    background: 'rgba(24, 24, 27, 0.8)',
    border: 'rgba(255, 255, 255, 0.1)',
    blur: 'blur(20px)',
  },
  
  // Player-specific
  player: {
    progress: '#8b5cf6',
    progressBg: '#27272a',
    waveform: '#8b5cf6',
    waveformBg: '#3f3f46',
  },
};

// Light Theme (Optional - for accessibility)
export const lightTheme = {
  background: {
    base: '#ffffff',
    elevated: '#f4f4f5',
    surface: '#e4e4e7',
    overlay: 'rgba(0,0,0,0.5)',
  },
  text: {
    primary: '#09090b',
    secondary: '#52525b',
    tertiary: '#71717a',
    muted: '#a1a1aa',
    inverse: '#fafafa',
  },
  accent: {
    primary: '#7c3aed',
    primaryHover: '#6d28d9',
    secondary: '#0891b2',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)',
  },
  // ... same status colors
};
```

**Gradient Accents (For CTAs & Highlights):**
```css
/* Primary CTA gradient */
.btn-primary {
  background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);
}

/* Playing indicator */
.now-playing {
  background: linear-gradient(90deg, #8b5cf6, #ec4899, #8b5cf6);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

/* Book cover overlay */
.cover-gradient {
  background: linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.9) 100%);
}
```

### 8.3 Typography - Inter Font Family

**Why Inter?** Free, highly legible, excellent for mobile, supports all 5 languages.

```typescript
// theme/typography.ts
export const typography = {
  // Display - Hero text, marketing
  display: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 1.1,
    letterSpacing: -1.5,
  },
  
  // Headings
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 1.2, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 1.3 },
  h3: { fontSize: 20, fontWeight: '600', lineHeight: 1.4 },
  h4: { fontSize: 18, fontWeight: '600', lineHeight: 1.4 },
  
  // Body
  body: { fontSize: 16, fontWeight: '400', lineHeight: 1.6 },
  bodyMedium: { fontSize: 16, fontWeight: '500', lineHeight: 1.6 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 1.5 },
  
  // UI Elements
  label: { fontSize: 14, fontWeight: '600', lineHeight: 1.4, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 1.4 },
  overline: { fontSize: 11, fontWeight: '600', lineHeight: 1.4, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  // Numeric (for timers, prices)
  mono: { fontFamily: 'JetBrains Mono, monospace', fontWeight: '500' },
};

// Tailwind config (NativeWind)
// tailwind.config.js
module.exports = {
  theme: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
  },
};
```

### 8.4 Spacing & Layout Grid

```typescript
// 4px base unit system
export const spacing = {
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};

// Screen padding
export const layout = {
  screenPadding: 16,      // Mobile side padding
  cardPadding: 16,
  sectionGap: 24,         // Between sections
  itemGap: 12,            // Between list items
  
  // Safe areas (handled by SafeAreaView)
  bottomTabHeight: 80,    // With labels
  miniPlayerHeight: 64,
  headerHeight: 56,
};
```

### 8.5 Component Library

#### Buttons

```tsx
// components/ui/Button.tsx
import { Pressable, Text, ActivityIndicator } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onPress: () => void;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  loading, 
  disabled,
  children, 
  onPress,
  fullWidth,
  icon,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const variantStyles = {
    primary: 'bg-violet-500 active:bg-violet-600',
    secondary: 'bg-zinc-800 border border-zinc-700 active:bg-zinc-700',
    ghost: 'bg-transparent active:bg-zinc-800',
    danger: 'bg-red-500 active:bg-red-600',
  };

  const sizeStyles = {
    sm: 'h-9 px-3 text-sm rounded-lg',
    md: 'h-12 px-5 text-base rounded-xl',
    lg: 'h-14 px-6 text-lg rounded-2xl',
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={animatedStyle}
      className={`
        flex-row items-center justify-center gap-2
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50' : ''}
      `}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          {icon}
          <Text className={`font-semibold ${variant === 'primary' ? 'text-white' : 'text-zinc-100'}`}>
            {children}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

// Gradient Primary Button (for main CTAs)
export function GradientButton({ children, onPress, ...props }: ButtonProps) {
  return (
    <LinearGradient
      colors={['#8b5cf6', '#06b6d4']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="rounded-xl"
    >
      <Pressable 
        onPress={onPress}
        className="h-14 px-6 items-center justify-center"
        {...props}
      >
        <Text className="text-white font-bold text-lg">{children}</Text>
      </Pressable>
    </LinearGradient>
  );
}
```

#### Cards

```tsx
// components/ui/Card.tsx
import { View, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';

interface CardProps {
  children: React.ReactNode;
  variant?: 'solid' | 'glass' | 'outline';
  onPress?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ 
  children, 
  variant = 'solid', 
  onPress,
  padding = 'md' 
}: CardProps) {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const variantStyles = {
    solid: 'bg-zinc-900',
    outline: 'bg-transparent border border-zinc-800',
    glass: '', // Handled by BlurView
  };

  const Container = onPress ? Pressable : View;

  if (variant === 'glass') {
    return (
      <Container onPress={onPress}>
        <BlurView 
          intensity={40} 
          tint="dark"
          className={`rounded-2xl overflow-hidden ${paddingStyles[padding]}`}
        >
          <View className="bg-white/5 absolute inset-0" />
          {children}
        </BlurView>
      </Container>
    );
  }

  return (
    <Container
      onPress={onPress}
      className={`
        rounded-2xl overflow-hidden
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${onPress ? 'active:opacity-90 active:scale-[0.99]' : ''}
      `}
    >
      {children}
    </Container>
  );
}
```

#### Book Cover Card (Premium Design)

```tsx
// components/BookCoverCard.tsx
import { View, Text, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface BookCoverCardProps {
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
    progress?: number; // 0-100
    duration?: string;
  };
  size?: 'sm' | 'md' | 'lg';
  onPress: () => void;
}

export function BookCoverCard({ book, size = 'md', onPress }: BookCoverCardProps) {
  const sizeStyles = {
    sm: { width: 120, height: 180 },
    md: { width: 160, height: 240 },
    lg: { width: 200, height: 300 },
  };

  const dimensions = sizeStyles[size];

  return (
    <Pressable 
      onPress={onPress}
      className="active:scale-[0.98] transition-transform"
    >
      <Animated.View 
        entering={FadeIn.duration(300)}
        style={dimensions}
        className="rounded-2xl overflow-hidden bg-zinc-800"
      >
        {/* Cover Image */}
        {book.coverUrl ? (
          <Image 
            source={{ uri: book.coverUrl }}
            className="absolute inset-0 w-full h-full"
            resizeMode="cover"
          />
        ) : (
          // Placeholder gradient for books without covers
          <LinearGradient
            colors={['#3f3f46', '#27272a']}
            className="absolute inset-0 items-center justify-center"
          >
            <Text className="text-6xl">📚</Text>
          </LinearGradient>
        )}

        {/* Bottom gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(9,9,11,0.95)']}
          locations={[0.3, 1]}
          className="absolute inset-0"
        />

        {/* Content */}
        <View className="absolute bottom-0 left-0 right-0 p-3">
          <Text 
            className="text-white font-semibold text-sm"
            numberOfLines={2}
          >
            {book.title}
          </Text>
          <Text 
            className="text-zinc-400 text-xs mt-0.5"
            numberOfLines={1}
          >
            {book.author}
          </Text>

          {/* Progress bar */}
          {book.progress !== undefined && (
            <View className="mt-2">
              <View className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                <View 
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${book.progress}%` }}
                />
              </View>
              {book.duration && (
                <Text className="text-zinc-500 text-xs mt-1">
                  {book.duration} remaining
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Now Playing indicator */}
        {book.isPlaying && (
          <View className="absolute top-2 right-2 bg-violet-500 rounded-full p-1.5">
            <NowPlayingBars />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Animated playing indicator bars
function NowPlayingBars() {
  return (
    <View className="flex-row items-end gap-0.5 h-3">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          className="w-0.5 bg-white rounded-full"
          style={{
            height: 4 + Math.random() * 8,
            // Add animation in implementation
          }}
        />
      ))}
    </View>
  );
}
```

#### Audio Player (Full-Screen Premium Design)

```tsx
// screens/PlayerScreen.tsx
import { View, Text, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';

export function PlayerScreen() {
  const { currentBook, isPlaying, position, duration } = usePlayer();

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Background blur from cover art */}
      <Image
        source={{ uri: currentBook.coverUrl }}
        className="absolute inset-0 w-full h-full opacity-30"
        blurRadius={50}
      />
      <LinearGradient
        colors={['transparent', '#09090b']}
        className="absolute inset-0"
      />

      {/* Content */}
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable onPress={navigation.goBack}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </Pressable>
          <View>
            <Text className="text-zinc-400 text-xs text-center uppercase tracking-wider">
              Now Playing
            </Text>
            <Text className="text-white text-sm font-medium text-center">
              Chapter {currentChapter.number}
            </Text>
          </View>
          <Pressable>
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Cover Art */}
        <View className="flex-1 items-center justify-center px-12">
          <Animated.View 
            className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl"
            style={[
              { shadowColor: '#8b5cf6', shadowRadius: 40, shadowOpacity: 0.3 }
            ]}
          >
            <Image
              source={{ uri: currentBook.coverUrl }}
              className="w-full h-full"
              resizeMode="cover"
            />
          </Animated.View>
        </View>

        {/* Track Info */}
        <View className="px-6 mt-6">
          <Text className="text-white text-2xl font-bold" numberOfLines={1}>
            {currentBook.title}
          </Text>
          <Text className="text-zinc-400 text-lg mt-1">
            {currentBook.author}
          </Text>
        </View>

        {/* Progress Slider */}
        <View className="px-6 mt-6">
          <Slider
            minimumValue={0}
            maximumValue={duration}
            value={position}
            onSlidingComplete={seekTo}
            minimumTrackTintColor="#8b5cf6"
            maximumTrackTintColor="#3f3f46"
            thumbTintColor="#8b5cf6"
          />
          <View className="flex-row justify-between mt-1">
            <Text className="text-zinc-500 text-xs font-mono">
              {formatTime(position)}
            </Text>
            <Text className="text-zinc-500 text-xs font-mono">
              -{formatTime(duration - position)}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View className="flex-row items-center justify-center gap-8 mt-6 mb-4">
          {/* Skip Back 15s */}
          <Pressable 
            onPress={() => skip(-15)}
            className="active:opacity-70"
          >
            <Ionicons name="play-back" size={32} color="#fff" />
            <Text className="text-white text-xs text-center">15</Text>
          </Pressable>

          {/* Previous Chapter */}
          <Pressable onPress={prevChapter} className="active:opacity-70">
            <Ionicons name="play-skip-back" size={36} color="#fff" />
          </Pressable>

          {/* Play/Pause - Large gradient button */}
          <Pressable 
            onPress={togglePlayPause}
            className="active:scale-95"
          >
            <LinearGradient
              colors={['#8b5cf6', '#7c3aed']}
              className="w-20 h-20 rounded-full items-center justify-center"
            >
              <Ionicons 
                name={isPlaying ? 'pause' : 'play'} 
                size={36} 
                color="#fff"
                style={{ marginLeft: isPlaying ? 0 : 4 }}
              />
            </LinearGradient>
          </Pressable>

          {/* Next Chapter */}
          <Pressable onPress={nextChapter} className="active:opacity-70">
            <Ionicons name="play-skip-forward" size={36} color="#fff" />
          </Pressable>

          {/* Skip Forward 30s */}
          <Pressable 
            onPress={() => skip(30)}
            className="active:opacity-70"
          >
            <Ionicons name="play-forward" size={32} color="#fff" />
            <Text className="text-white text-xs text-center">30</Text>
          </Pressable>
        </View>

        {/* Bottom Controls */}
        <View className="flex-row items-center justify-around px-6 py-4 mb-4">
          <SpeedButton currentSpeed={playbackSpeed} onPress={cycleSpeed} />
          <SleepTimerButton />
          <ChapterListButton />
          <AirPlayButton />
        </View>
      </SafeAreaView>
    </View>
  );
}

// Speed button with elegant display
function SpeedButton({ currentSpeed, onPress }) {
  return (
    <Pressable 
      onPress={onPress}
      className="items-center active:opacity-70"
    >
      <View className="bg-zinc-800 px-3 py-1.5 rounded-lg">
        <Text className="text-white font-semibold">{currentSpeed}×</Text>
      </View>
      <Text className="text-zinc-500 text-xs mt-1">Speed</Text>
    </Pressable>
  );
}
```

#### Mini Player (Persistent Bottom Bar)

```tsx
// components/MiniPlayer.tsx
import { View, Text, Image, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeIn, 
  SlideInDown,
  useAnimatedGestureHandler,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export function MiniPlayer() {
  const { currentBook, isPlaying, progress } = usePlayer();
  const navigation = useNavigation();

  if (!currentBook) return null;

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(navigation.navigate)('Player');
  });

  return (
    <Animated.View 
      entering={SlideInDown.springify()}
      className="absolute bottom-20 left-4 right-4"
    >
      <GestureDetector gesture={tapGesture}>
        <BlurView 
          intensity={60} 
          tint="dark"
          className="rounded-2xl overflow-hidden"
        >
          {/* Progress bar at top */}
          <View className="h-0.5 bg-zinc-700">
            <View 
              className="h-full bg-violet-500"
              style={{ width: `${progress}%` }}
            />
          </View>

          <View className="flex-row items-center p-3 gap-3">
            {/* Cover thumbnail */}
            <Image
              source={{ uri: currentBook.coverUrl }}
              className="w-12 h-12 rounded-lg"
            />

            {/* Info */}
            <View className="flex-1">
              <Text className="text-white font-semibold" numberOfLines={1}>
                {currentBook.title}
              </Text>
              <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                Chapter {currentChapter.number}
              </Text>
            </View>

            {/* Controls */}
            <Pressable 
              onPress={togglePlayPause}
              className="w-11 h-11 items-center justify-center"
            >
              <Ionicons 
                name={isPlaying ? 'pause' : 'play'} 
                size={28} 
                color="#fff" 
              />
            </Pressable>

            <Pressable 
              onPress={() => skip(30)}
              className="w-11 h-11 items-center justify-center"
            >
              <Ionicons name="play-forward" size={24} color="#a1a1aa" />
            </Pressable>
          </View>
        </BlurView>
      </GestureDetector>
    </Animated.View>
  );
}
```

### 8.6 Animation Guidelines

**Use React Native Reanimated 3 for all animations:**

```typescript
// Timing configurations for consistent feel
export const animations = {
  // Quick interactions (buttons, toggles)
  quick: { duration: 150 },
  
  // Standard transitions (cards, modals)
  standard: { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) },
  
  // Emphasized (page transitions, important elements)
  emphasized: { duration: 500, easing: Easing.bezier(0.4, 0, 0, 1) },
  
  // Spring configs
  springy: { damping: 15, stiffness: 150 },
  bouncy: { damping: 10, stiffness: 180 },
  stiff: { damping: 20, stiffness: 300 },
};

// Common patterns
const fadeIn = FadeIn.duration(300);
const slideUp = SlideInDown.springify().damping(15);
const scalePress = useAnimatedStyle(() => ({
  transform: [{ scale: withSpring(pressed ? 0.97 : 1) }],
}));
```

**Haptic Feedback (Use Sparingly):**
```typescript
import * as Haptics from 'expo-haptics';

// Light - Button presses, selections
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Medium - Important actions (start playback)
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

// Success - Generation complete, purchase success
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// Warning - Errors, alerts
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
```

### 8.7 Loading & Empty States

**Skeleton Loaders (Not Spinners):**

```tsx
// components/ui/Skeleton.tsx
import Animated, { 
  useAnimatedStyle, 
  withRepeat, 
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

export function Skeleton({ width, height, borderRadius = 8 }) {
  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      withRepeat(withTiming(1, { duration: 1000 }), -1, true),
      [0, 1],
      ['#27272a', '#3f3f46']
    );
    return { backgroundColor };
  });

  return (
    <Animated.View 
      style={[{ width, height, borderRadius }, animatedStyle]} 
    />
  );
}

// Book card skeleton
export function BookCardSkeleton() {
  return (
    <View className="w-40">
      <Skeleton width={160} height={240} borderRadius={16} />
      <Skeleton width={120} height={16} borderRadius={4} className="mt-3" />
      <Skeleton width={80} height={12} borderRadius={4} className="mt-2" />
    </View>
  );
}
```

**Empty States (Friendly & Actionable):**

```tsx
// components/EmptyState.tsx
interface EmptyStateProps {
  icon: string; // Emoji or icon name
  title: string;
  description: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-6xl mb-4">{icon}</Text>
      <Text className="text-white text-xl font-semibold text-center">
        {title}
      </Text>
      <Text className="text-zinc-400 text-center mt-2 leading-6">
        {description}
      </Text>
      {action && (
        <GradientButton 
          onPress={action.onPress}
          className="mt-6"
        >
          {action.label}
        </GradientButton>
      )}
    </View>
  );
}

// Usage examples:
<EmptyState
  icon="📚"
  title="No audiobooks yet"
  description="Upload your first ebook or explore our Free Classics library"
  action={{ label: "Browse Free Classics", onPress: () => navigate('FreeClassics') }}
/>

<EmptyState
  icon="🔍"
  title="No results found"
  description="Try searching for a different title or author"
/>

<EmptyState
  icon="📶"
  title="No internet connection"
  description="Your downloaded books are still available offline"
  action={{ label: "View Downloads", onPress: () => navigate('Downloads') }}
/>
```

### 8.8 App Icons & Splash Screen

**App Icon Guidelines:**
- Size: 1024×1024 (will be scaled down)
- No transparency (iOS rejects)
- No rounded corners (iOS adds automatically)
- Design: Simple, recognizable at small sizes
- Concept: Headphones + book/waveform in violet gradient

**Splash Screen:**
```typescript
// app.config.ts
export default {
  expo: {
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#09090b', // Match app background
    },
    ios: {
      splash: {
        dark: {
          image: './assets/splash.png',
          backgroundColor: '#09090b',
        },
      },
    },
  },
};
```

### 8.9 Design Resources & Tools

**Recommended Tools:**
| Tool | Purpose | Cost |
|------|---------|------|
| Figma | UI design, prototyping | Free tier |
| Iconify | 100k+ icons | Free |
| Unsplash/Pexels | Placeholder images | Free |
| Realtime Colors | Color palette generator | Free |
| Mobbin | UI inspiration (Spotify, Audible) | Free tier |

**Icon Libraries:**
```bash
npx expo install @expo/vector-icons  # Built-in (Ionicons, MaterialIcons)
npm install lucide-react-native      # Modern, consistent icons
```

**Design Tokens Export:**
```bash
# If using Figma with Tokens plugin, export to:
# /theme/tokens.json → Auto-generate colors.ts, typography.ts
```

---

## 9. Development Phases (Realistic 5-Month MVP)

> **Target:** Solo vibe-coder, 10-15 hours/week = ~250 hours total  
> **Goal:** Launched on both App Store & Play Store in 20 weeks  
> **Strategy:** PWA FIRST → React Native as clone of proven UI

### Development Sequence & Rationale

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND DEVELOPMENT ORDER                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1️⃣ PWA (TypeScript/Vite)              Weeks 1-5                   │
│      └── Primary development target                                  │
│      └── iPhone "Add to Home Screen" for realistic testing           │
│      └── Fast iteration, instant deploys                             │
│      └── Validate ALL features before native                         │
│                                                                      │
│   2️⃣ React Native (Expo)                Weeks 10-16                 │
│      └── Clone proven PWA patterns                                   │
│      └── Same component names, same state logic                      │
│      └── Add native-only: background audio, IAP                      │
│      └── NativeWind = same Tailwind classes                          │
│                                                                      │
│   3️⃣ Backend (Express/Hono)             Parallel: Weeks 6-9         │
│      └── Already exists (POC)                                        │
│      └── Add format support, scale for production                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why PWA First?**
| Benefit | Impact |
|---------|--------|
| No App Store delays | Test instantly on iPhone via Safari |
| Hot reload | See changes in <1 second |
| Same TypeScript | Code patterns transfer to React Native |
| Tailwind → NativeWind | Same utility classes work in both |
| Lower risk | Validate UX before investing in native complexity |
| Tester access | Share URL, no TestFlight invites needed |

---

### Phase 1: PWA Complete Frontend (Weeks 1-5) ~60 hours

**Week 1: PWA Project Setup**
- [ ] Create `apps/pwa` folder structure
- [ ] Vite + React + TypeScript + SWC
- [ ] Tailwind CSS (same config as NativeWind)
- [ ] React Router DOM (tab-based navigation pattern)
- [ ] Deploy to Vercel (auto-deploy on push)
- [ ] PWA manifest.json + service worker
- [ ] Test "Add to Home Screen" on iPhone

**Week 2: Auth + Library Core**
- [ ] Auth screens: Login, Register, Forgot Password
- [ ] Social auth buttons (Google, Apple)
- [ ] API client setup (TanStack Query)
- [ ] Library screen: book list with search
- [ ] Empty state: "No audiobooks yet"
- [ ] Connect to backend API

**Week 3: Audio Player**
- [ ] Full-screen player UI
- [ ] Mini player (bottom bar)
- [ ] Web Audio API / Howler.js playback
- [ ] Playback controls: play, pause, seek
- [ ] Playback speed: 0.5x, 1x, 1.5x, 2x
- [ ] Chapter navigation
- [ ] Sleep timer (30 min, 1 hr, end of chapter)

**Week 4: Upload + Generation Flow**
- [ ] File picker (all 7 formats)
- [ ] Drag-and-drop upload zone
- [ ] Cost estimate modal (before generation)
- [ ] Generation progress screen
- [ ] Polling for status updates
- [ ] "Generation complete" UI

**Week 5: Settings + Free Classics**
- [ ] Settings screen (language, speed default)
- [ ] Language selector (5 languages)
- [ ] Free Classics library (Gutendex integration)
- [ ] Book detail screen (Gutenberg books)
- [ ] "Create Audiobook" flow from Free Classics
- [ ] Localized book titles display
- [ ] Polish, error states, loading states

**Deliverable:** Complete PWA that testers use on iPhone "as an app"

---

### Phase 2: Backend Format Support (Weeks 6-9) ~40 hours

**Week 6: Core Format Parsers**
- [ ] PDF text extraction (pdf-parse)
- [ ] DOC/DOCX parsing (mammoth.js)
- [ ] Unified parser interface

**Week 7: Kindle/MOBI Formats**
- [ ] MOBI parser integration (DRM-free)
- [ ] AZW3/KF8 parser (DRM-free)
- [ ] DRM detection → user-friendly error
- [ ] Format conversion pipeline

**Week 8: Gutenberg Integration**
- [ ] Gutendex API service
- [ ] PG header stripper (legal compliance)
- [ ] Download → Strip → Process pipeline
- [ ] Curated title mappings (top 200 books)

**Week 9: Testing & Integration**
- [ ] Test all 7 formats end-to-end
- [ ] Test Gutenberg → audiobook flow
- [ ] Error handling for corrupted files
- [ ] Update PWA with all features

**Deliverable:** Backend supports all formats + Free Classics ready

---

### Phase 3: React Native Clone (Weeks 10-14) ~60 hours

**Week 10: Project Bootstrap**
- [ ] Create Expo project with TypeScript
- [ ] Configure NativeWind (same Tailwind config as PWA)
- [ ] Copy folder structure from PWA
- [ ] ESLint, Prettier, TypeScript strict
- [ ] Create EAS development build

**Week 11: Clone Auth + Library**
- [ ] Port auth screens (same component names)
- [ ] Port library screen
- [ ] MMKV + SecureStore for tokens
- [ ] Connect same API client logic
- [ ] Test on physical device

**Week 12: Native Audio Player**
- [ ] Integrate react-native-audio-pro
- [ ] Port player UI from PWA
- [ ] Background playback + lock screen controls
- [ ] Media session (now playing info)
- [ ] Chapter navigation

**Week 13: Clone Generation + Settings**
- [ ] Port upload flow (native file picker)
- [ ] Add Share Sheet receiver (iOS/Android)
- [ ] Port generation progress screen
- [ ] Port settings + language selector
- [ ] Port Free Classics screens

**Week 14: Offline Support**
- [ ] WatermelonDB setup
- [ ] Chapter download manager
- [ ] Download progress UI
- [ ] Offline playback validation
- [ ] Sync position across devices

**Deliverable:** React Native app with feature parity to PWA

---

### Phase 4: Payments + Polish (Weeks 15-17) ~40 hours

**Week 15: iOS Payments**
- [ ] RevenueCat integration
- [ ] App Store IAP: Standard ($7.99), Premium ($17.99)
- [ ] Purchase flow UI
- [ ] Restore purchases
- [ ] Sandbox testing

**Week 16: Android Payments + Pay-As-You-Go**
- [ ] Android IAP via RevenueCat
- [ ] Or: Stripe for Android (if avoiding Google 30%)
- [ ] Pay-as-you-go credit packages
- [ ] Receipt validation backend

**Week 17: Polish & Edge Cases**
- [ ] Error boundaries
- [ ] Empty states
- [ ] Network error retry
- [ ] DRM error messaging
- [ ] Sleep timer (native)
- [ ] Playback speed persistence

**Deliverable:** Complete monetized apps ready for review

---

### Phase 5: Launch Prep (Weeks 18-20) ~50 hours

**Week 18: Platform Compliance**
- [ ] iOS ATT prompt
- [ ] Push notification setup (Expo)
- [ ] Privacy policy + Terms pages
- [ ] Sentry crash reporting
- [ ] Analytics (PostHog or similar)

**Week 19: Store Assets**
- [ ] App icon 1024x1024
- [ ] iPhone screenshots (6.7", 6.5", 5.5")
- [ ] Android screenshots
- [ ] Feature graphic (Play Store)
- [ ] App Store description + keywords
- [ ] Play Store listing

**Week 20: Beta + Launch**
- [ ] TestFlight beta (10-20 testers)
- [ ] Fix critical feedback
- [ ] App Store submission
- [ ] Play Store submission
- [ ] Monitor day 1 crashes
- [ ] PWA remains live for web access

**Deliverable:** 🚀 VoiceLibri LIVE on App Store, Play Store, and Web!

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
| Fresh install → Register → Generate book | ☐ | ☐ | ☐ |
| Upload each format (TXT, EPUB, MOBI, AZW3, PDF, DOC, DOCX) | ☐ | ☐ | ☐ |
| DRM-protected file → Error message | ☐ | ☐ | ☐ |
| Login → Resume playback from last position | ☐ | ☐ | ☐ |
| Background playback (app minimized) | ☐ | ☐ | N/A |
| Lock screen controls (play/pause/skip) | ☐ | ☐ | N/A |
| Airplane mode → Play downloaded book | ☐ | ☐ | ☐ |
| Kill app → Reopen → Resume position | ☐ | ☐ | ☐ |
| Purchase Standard subscription (sandbox) | ☐ | ☐ | N/A |
| Purchase Premium subscription (sandbox) | ☐ | ☐ | N/A |
| Restore purchase on new device | ☐ | ☐ | N/A |
| Generation fails → Error message shown | ☐ | ☐ | ☐ |
| Sleep timer stops playback | ☐ | ☐ | ☐ |
| Chapter skip forward/backward | ☐ | ☐ | ☐ |
| Playback speed 0.5x, 1.5x, 2.0x | ☐ | ☐ | ☐ |
| Free Classics → Search → Generate | ☐ | ☐ | ☐ |
| Localized titles display (SK/CS user) | ☐ | ☐ | ☐ |
| Download chapter → Offline playback | ☐ | ☐ | ☐ |
| Poor network → Graceful degradation | ☐ | ☐ | ☐ |
| App update → Data preserved | ☐ | ☐ | N/A |

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
```typescript
// hooks/useBooks.ts
export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const response = await api.get<BooksResponse>('/api/v1/books');
      return response.data.books;
    },
  });
}
```

**Component Pattern:**
```tsx
// components/BookCard.tsx
interface BookCardProps {
  book: Book;
  onPress?: () => void;
}

export function BookCard({ book, onPress }: BookCardProps) {
  return (
    <Pressable onPress={onPress} className="...">
      {/* ... */}
    </Pressable>
  );
}
```

**Store Pattern:**
```typescript
// stores/playerStore.ts
interface PlayerState {
  currentBookId: string | null;
  isPlaying: boolean;
  setCurrentBook: (id: string) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentBookId: null,
  isPlaying: false,
  setCurrentBook: (id) => set({ currentBookId: id }),
}));
```

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
- [ ] iOS Screenshots: 6.7" (1290×2796), 6.5" (1284×2778), 5.5" (1242×2208)
- [ ] Android Screenshots: Phone (1080×1920+), 7" tablet optional
- [ ] Play Store Feature Graphic: 1024×500
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
- [ ] No data sold to third parties ✓

**CCPA (California):**
- [ ] "Do Not Sell My Info" link (even if you don't sell - say so)
- [ ] Deletion request process documented

**Apple ATT:**
```typescript
// Request tracking permission (required if using analytics with IDFA)
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

// Call BEFORE initializing analytics
const { status } = await requestTrackingPermissionsAsync();
if (status === 'granted') {
  // Initialize analytics with IDFA
} else {
  // Initialize analytics without IDFA (still works, less precise)
}
```

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
```typescript
// app/_layout.tsx
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://xxx@sentry.io/xxx',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2, // 20% of transactions for performance
});

// Wrap root component
export default Sentry.wrap(RootLayout);
```

**Key Events to Track (Mixpanel):**
```typescript
// Track these events minimum
mixpanel.track('app_opened');
mixpanel.track('user_registered', { method: 'email' | 'google' | 'apple' });
mixpanel.track('book_generation_started', { estimatedHours, hasTranslation });
mixpanel.track('book_generation_completed', { actualHours, chapterCount });
mixpanel.track('playback_started', { bookId, chapter });
mixpanel.track('playback_session_ended', { duration, bookId });
mixpanel.track('subscription_started', { plan, price });
mixpanel.track('subscription_cancelled', { reason });
```

**Key Metrics Dashboard:**
| Metric | Target (Month 1) | How to Measure |
|--------|------------------|----------------|
| DAU | 50+ | Mixpanel |
| Registration → First Book | >30% | Funnel analysis |
| Free → Paid conversion | >5% | RevenueCat |
| Generation success rate | >95% | Backend logs |
| Crash-free sessions | >99% | Sentry |
| API P95 latency | <500ms | Sentry Performance |
| App Store rating | >4.0 | App Store Connect |

**Correlation IDs (Backend):**
```typescript
// middleware/requestId.ts
import { v4 as uuid } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuid();
  res.setHeader('x-request-id', req.requestId);
  
  // Attach to all logs
  req.log = logger.child({ requestId: req.requestId, userId: req.userId });
  next();
}

// Mobile: Send request ID for debugging
api.interceptors.request.use((config) => {
  config.headers['x-request-id'] = uuid();
  return config;
});
```

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

*Document Version: 3.1*  
*App Name: VoiceLibri*  
*Last Updated: January 7, 2026*  
*Total: ~18,000 words | ~36 A4 pages*  
*Maintainer: AI Development Assistant*
