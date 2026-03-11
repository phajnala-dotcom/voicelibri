
VoiceLibri
Technick├í dokument├ícia
Verzia 1.2  ÔÇó  Febru├ír 2026
Komer─Źn├í AI platforma na dramatizovan├ę audioknihy s viacer├Żmi hlasmi

Propriet├írna technol├│gia ÔÇó Pre intern├ę pou┼żitie


Obsah

1. ├Ü─Źel a rozsah dokumentu
2. Syst├ęmov├í architekt├║ra
   2.1. Vysoko├║rov┼łov├Ż diagram
   2.2. Technologick├Ż stack
   2.3. Adres├írov├í ┼ítrukt├║ra monorepa
3. Audiobook genera─Źn├Ż pipeline
   3.1. Preh─żad f├íz pipeline
   3.2. F├íza 1 ÔÇö Import a spracovanie e-knihy
   3.3. F├íza 2 ÔÇö Preklad kapitol
   3.4. F├íza 3 ÔÇö Extrakcia post├ív (CharacterRegistry)
   3.5. F├íza 4 ÔÇö Hybridn├í dramatiz├ícia
   3.6. F├íza 5 ÔÇö Two-Speaker chunking
   3.7. F├íza 6 ÔÇö TTS synt├ęza
   3.8. F├íza 7 ÔÇö Konsolid├ícia a soundscape
4. Backend moduly ÔÇö podrobn├Ż preh─żad
   4.1. index.ts ÔÇö API server a orchestr├ícia
   4.2. bookChunker.ts ÔÇö Parsovanie a chunking
   4.3. hybridDramatizer.ts ÔÇö Hybridn├í dramatiz├ícia
   4.4. hybridTagger.ts ÔÇö Detektor dial├│gov
   4.5. characterRegistry.ts ÔÇö Register post├ív
   4.6. llmCharacterAnalyzer.ts ÔÇö LLM anal├Żza post├ív
   4.7. voiceAssigner.ts ÔÇö Prira─Ćovanie hlasov
   4.8. geminiVoices.ts ÔÇö Datab├íza hlasov
   4.9. ttsClient.ts ÔÇö TTS klient
   4.10. twoSpeakerChunker.ts ÔÇö 2-speaker chunking
   4.11. chapterChunker.ts ÔÇö Kapitolov├ę chunkovanie
   4.12. chapterTranslator.ts ÔÇö Preklad kapitol
   4.13. tempChunkManager.ts ÔÇö Spr├íva temp s├║borov
   4.14. audiobookManager.ts ÔÇö Spr├íva kni┼żnice
   4.15. audiobookWorker.ts ÔÇö Background worker
   4.16. costTracker.ts ÔÇö Sledovanie n├íkladov
   4.17. promptConfig.ts ÔÇö Konfigur├ícia promptov
   4.18. soundscapeCompat.ts ÔÇö Soundscape pipeline
   4.19. formatExtractors.ts ÔÇö Multi-form├ítov├ę extraktory
   4.20. textCleaner.ts ÔÇö ─îistenie textu
   4.21. audioUtils.ts ÔÇö Audio utility
   4.22. Ostatn├ę moduly
5. REST API rozhranie
   5.1ÔÇô5.6. Endpointy pod─ża kateg├│ri├ş
6. Syst├ęm hlasov a postavy
7. Frontend PWA architekt├║ra
   7.1. State management (Zustand)
   7.2. Audio prehr├ívanie ÔÇö dva m├│dy
   7.3. Obrazovky a komponenty
8. Mobiln├í aplik├ícia (Expo / React Native)
9. D├ítov├ę modely a ├║lo┼żisko
10. V├Żkonnostn├ę obmedzenia a limity
11. Spracovanie ch├Żb a odolnos┼ą
12. Sledovanie n├íkladov (CostTracker)
13. Testovanie a kvalita
14. Konfigur├ícia a nasadenie
15. Roz┼í├şrite─żnos┼ą a bud├║ce funkcie


# 1. ├Ü─Źel a rozsah dokumentu

Tento dokument poskytuje komplexn├║ technick├║ dokument├íciu platformy VoiceLibri ÔÇö komer─Źn├ęho AI syst├ęmu na premenu elektronick├Żch kn├şh na dramatizovan├ę audioknihy s viacer├Żmi hlasmi. Dokument├ícia je ur─Źen├í pre v├Żvoj├írov na ├║rovni junior+ a pokr├Żva cel├║ architekt├║ru, genera─Źn├Ż pipeline, API rozhranie, frontend a mobiln├║ aplik├íciu.
Cie─żov├í skupina:
Junior a senior v├Żvoj├íri pracuj├║ci na VoiceLibri
Nov├ş ─Źlenovia t├şmu, ktor├ş potrebuj├║ onboarding
Architekti hodnotiacie technologick├ę rozhodnutia
QA in┼żinieri testuj├║ci pipeline a API
Rozsah dokument├ície:
Celkov├í syst├ęmov├í architekt├║ra (monorepo, backend, web PWA, mobiln├í appka)
Kompletn├Ż audiobook genera─Źn├Ż pipeline (7 f├íz, od importu e-knihy po WAV v├Żstup)
Detailn├Ż popis v┼íetk├Żch ~22 backend modulov a ich funkci├ş
REST API referencia (30+ endpointov)
Frontend architekt├║ra (Zustand stores, TanStack Query, React komponenty, hooky)
Mobiln├í aplik├ícia (Expo SDK 54, React Native)
Syst├ęm 30 Gemini hlasov a s├ęmantick├ę prira─Ćovanie postav├ím
Error handling, v├Żkonnostn├ę limity, n├íkladov├í anal├Żza
Konfigur├ícia, nasadenie, testovanie

# 2. Syst├ęmov├í architekt├║ra


## 2.1. Vysoko├║rov┼łov├Ż diagram

VoiceLibri je TypeScript monorepo s npm workspaces. Pozost├íva z troch aplik├íci├ş a zdie─żan├ęho s├║borov├ęho ├║lo┼żiska audiokn├şh.
Diagram 1: Syst├ęmov├í architekt├║ra VoiceLibri
SYST├ëMOV├ü ARCHITEKT├ÜRA ÔÇö VYSOKO├ÜROV┼çOV├Ł DIAGRAM

ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
Ôöé                        MONOREPO  (npm workspaces)                       Ôöé
Ôöé                                                                         Ôöé
Ôöé  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ  Ôöé
Ôöé  Ôöé   apps/backend/    Ôöé  Ôöé    apps/pwa-v2/     Ôöé  Ôöé   apps/mobile/    Ôöé  Ôöé
Ôöé  Ôöé  Express + TS      Ôöé  Ôöé  React 18 + Vite    Ôöé  Ôöé  Expo SDK 54      Ôöé  Ôöé
Ôöé  Ôöé  Port 3001         Ôöé  Ôöé  Port 5180          Ôöé  Ôöé  iOS / Android    Ôöé  Ôöé
Ôöé  Ôöé                    Ôöé  Ôöé                     Ôöé  Ôöé                   Ôöé  Ôöé
Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé
Ôöé  Ôöé Ôöé AI Pipeline    Ôöé Ôöé  Ôöé Ôöé Zustand Stores  Ôöé Ôöé  Ôöé Ôöé Zustand +     Ôöé Ôöé  Ôöé
Ôöé  Ôöé Ôöé ÔŚĆ Gemini LLM   Ôöé Ôöé  Ôöé Ôöé ÔŚĆ player        Ôöé Ôöé  Ôöé Ôöé AsyncStorage  Ôöé Ôöé  Ôöé
Ôöé  Ôöé Ôöé ÔŚĆ Gemini TTS   ÔöéÔŚäÔöťÔöÇÔöÇÔöĄ Ôöé ÔŚĆ library       Ôöé Ôöé  Ôöé Ôöé TanStack Q    Ôöé Ôöé  Ôöé
Ôöé  Ôöé Ôöé ÔŚĆ ffmpeg       Ôöé Ôöé  Ôöé Ôöé ÔŚĆ theme         Ôöé Ôöé  Ôöé Ôöé expo-router   Ôöé Ôöé  Ôöé
Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé
Ôöé  Ôöé                    Ôöé  Ôöé                     Ôöé  Ôöé                   Ôöé  Ôöé
Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ Ôöé  Ôöé
Ôöé  Ôöé Ôöé 22 modulov     Ôöé Ôöé  Ôöé Ôöé TanStack Query  Ôöé Ôöé  Ôöé Ôöé Nat├şvne       Ôöé Ôöé  Ôöé
Ôöé  Ôöé Ôöé (src/*.ts)     Ôöé Ôöé  Ôöé Ôöé (server cache)  Ôöé Ôöé  Ôöé Ôöé komponenty    Ôöé Ôöé  Ôöé
Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś Ôöé  Ôöé
Ôöé  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś  Ôöé
Ôöé            Ôöé                                                             Ôöé
Ôöé            Ôľ╝                                                             Ôöé
Ôöé  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ       Ôöé
Ôöé  Ôöé                audiobooks/  (s├║borov├ę ├║lo┼żisko)               Ôöé       Ôöé
Ôöé  Ôöé                                                               Ôöé       Ôöé
Ôöé  Ôöé  {BookTitle}/                                                 Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ metadata.json         (stav, kapitoly, poz├şcia, prefs)  Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ character_registry.json  (postavy, hlasy, aliasy)       Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ cost_summary.json     (tokeny, USD n├íklady)             Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ temp/                 (sub-chunk WAV do─Źasn├ę s├║bory)    Ôöé       Ôöé
Ôöé  Ôöé  Ôöé   ÔöťÔöÇÔöÇ subchunk_001_000.wav                                Ôöé       Ôöé
Ôöé  Ôöé  Ôöé   ÔöťÔöÇÔöÇ subchunk_001_001.wav                                Ôöé       Ôöé
Ôöé  Ôöé  Ôöé   ÔööÔöÇÔöÇ ...                                                 Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ 01_Kapitola_Prv├í.wav  (konsolidovan├í kapitola)          Ôöé       Ôöé
Ôöé  Ôöé  ÔöťÔöÇÔöÇ 02_Kapitola_Druh├í.wav                                   Ôöé       Ôöé
Ôöé  Ôöé  ÔööÔöÇÔöÇ ...                                                     Ôöé       Ôöé
Ôöé  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś       Ôöé
Ôöé                                                                         Ôöé
Ôöé  EXTERN├ë SLU┼ŻBY:                                                        Ôöé
Ôöé  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ   Ôöé
Ôöé  Ôöé  Google Cloud Vertex AI                                          Ôöé   Ôöé
Ôöé  Ôöé  ÔŚĆ Gemini 2.5 Flash        Ôćĺ LLM (anal├Żza, preklad, tagging)   Ôöé   Ôöé
Ôöé  Ôöé  ÔŚĆ Gemini 2.5 Flash TTS    Ôćĺ Text-to-Speech (max 2 hlasy/req)  Ôöé   Ôöé
Ôöé  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś   Ôöé
Ôöé                                                                         Ôöé
Ôöé  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ   Ôöé
Ôöé  Ôöé  ffmpeg (lok├ílny)  Ôćĺ Audio mie┼íanie, soundscape, music intro     Ôöé   Ôöé
Ôöé  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś   Ôöé
ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

## 2.2. Technologick├Ż stack

Komponent
Technol├│gia
├Ü─Źel
Backend runtime
Node.js + TypeScript + Express
REST API server, pipeline orchestr├ícia
LLM engine
Google Vertex AI ÔÇö Gemini 2.5 Flash
Anal├Żza post├ív, dramatiz├ícia, preklad
TTS engine
Gemini 2.5 Flash TTS
Multi-speaker synt├ęza (max 2 hlasy/req)
Web frontend
React 18 + Vite + TypeScript
Progres├şvna webov├í aplik├ícia (PWA)
Stav (web)
Zustand + TanStack Query
Lok├ílny stav + server cache
┼át├Żly (web)
Tailwind CSS + Neumorphism UI
Responz├şvne 3D-efekt UI
Mobiln├í app
React Native + Expo SDK 54
Nat├şvna iOS/Android
Navig├ícia (mobile)
expo-router v6
S├║borov├Ż routing
Stav (mobile)
Zustand + AsyncStorage
Perzistentn├Ż stav
Audio
WAV (PCM 24kHz, 16-bit, mono)
Bezstratov├Ż v├Żstup
EPUB
adm-zip + fast-xml-parser
Extrahovanie textu z EPUB
PDF
pdf-parse
Extrahovanie z digit├ílnych PDF
DOCX
mammoth
Extrahovanie z Word
Zvuky
ffmpeg (extern├Ż)
Soundscape mix + music intro
Testy
vitest
Unit testy (backend)

## 2.3. Adres├írov├í ┼ítrukt├║ra monorepa

Diagram 2: Kompletn├í adres├írov├í ┼ítrukt├║ra
ebook-reader/                        # Kore┼ł monorepa
ÔöťÔöÇÔöÇ package.json                     # npm workspaces config
ÔöťÔöÇÔöÇ apps/
Ôöé   ÔöťÔöÇÔöÇ backend/                     # ÔöÇÔöÇ EXPRESS API SERVER ÔöÇÔöÇ
Ôöé   Ôöé   ÔöťÔöÇÔöÇ package.json
Ôöé   Ôöé   ÔöťÔöÇÔöÇ tsconfig.json
Ôöé   Ôöé   ÔöťÔöÇÔöÇ assets/                  # Vstupn├ę e-knihy
Ôöé   Ôöé   ÔööÔöÇÔöÇ src/
Ôöé   Ôöé       ÔöťÔöÇÔöÇ index.ts             # Hlavn├Ż server (3260 riadkov)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ bookChunker.ts       # Parsovanie, metad├íta, kapitoly (1165 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ hybridDramatizer.ts  # Hybridn├í dramatiz├ícia
Ôöé   Ôöé       ÔöťÔöÇÔöÇ hybridTagger.ts      # Rule-based tagger (628 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ llmCharacterAnalyzer.ts  # LLM anal├Żza post├ív (723 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ characterRegistry.ts # Per-chapter register (654 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ voiceAssigner.ts     # Prira─Ćovanie hlasov
Ôöé   Ôöé       ÔöťÔöÇÔöÇ geminiVoices.ts      # 30 hlasov + trait matching
Ôöé   Ôöé       ÔöťÔöÇÔöÇ ttsClient.ts         # Vertex AI TTS klient (499 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ twoSpeakerChunker.ts # 2-speaker limiter (404 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ chapterChunker.ts    # Ramp-up chunking
Ôöé   Ôöé       ÔöťÔöÇÔöÇ chapterTranslator.ts # Preklad 18 jazykov
Ôöé   Ôöé       ÔöťÔöÇÔöÇ tempChunkManager.ts  # Temp s├║bory + TTS gen (1834 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ audiobookManager.ts  # Kni┼żnica + metad├íta (540 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ audiobookWorker.ts   # Background worker (384 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ costTracker.ts       # Sledovanie n├íkladov
Ôöé   Ôöé       ÔöťÔöÇÔöÇ promptConfig.ts      # Centr├ílne prompty + kon┼ítanty
Ôöé   Ôöé       ÔöťÔöÇÔöÇ soundscapeCompat.ts     # Alt 4 soundscape pipeline (820 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ formatExtractors.ts  # 12+ form├ítov (744 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ textCleaner.ts       # Regex ─Źistenie (418 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ audioUtils.ts        # WAV concat + silence (84 r.)
Ôöé   Ôöé       ÔöťÔöÇÔöÇ dramatizedProcessor.ts  # PoC orchestr├ítor
Ôöé   Ôöé       ÔöťÔöÇÔöÇ dramatizedChunkerSimple.ts  # SPEAKER: parser
Ôöé   Ôöé       ÔöťÔöÇÔöÇ dialogueParserSimple.ts # ─îesk├ę ├║vodzovky
Ôöé   Ôöé       ÔööÔöÇÔöÇ parallelPipelineManager.ts # Reset stavu
Ôöé   Ôöé
Ôöé   ÔöťÔöÇÔöÇ pwa-v2/                      # ÔöÇÔöÇ REACT PWA ÔöÇÔöÇ
Ôöé   Ôöé   ÔööÔöÇÔöÇ src/
Ôöé   Ôöé       ÔöťÔöÇÔöÇ App.tsx              # Router + providermi
Ôöé   Ôöé       ÔöťÔöÇÔöÇ screens/             # Library, Generate, Classics, Settings
Ôöé   Ôöé       ÔöťÔöÇÔöÇ components/          # AppShell, FullPlayer, BookItem, ...
Ôöé   Ôöé       ÔöťÔöÇÔöÇ hooks/               # useAudioPlayback, useProgressiveAudio
Ôöé   Ôöé       ÔöťÔöÇÔöÇ stores/              # playerStore, libraryStore, themeStore
Ôöé   Ôöé       ÔöťÔöÇÔöÇ services/api.ts      # HTTP klient (352 r.)
Ôöé   Ôöé       ÔööÔöÇÔöÇ types/               # TypeScript rozhrania
Ôöé   Ôöé
Ôöé   ÔööÔöÇÔöÇ mobile/                      # ÔöÇÔöÇ EXPO MOBILN├ü APPKA ÔöÇÔöÇ
Ôöé       ÔöťÔöÇÔöÇ app/                     # expo-router routes
Ôöé       Ôöé   ÔöťÔöÇÔöÇ _layout.tsx          # Root + provideri
Ôöé       Ôöé   ÔöťÔöÇÔöÇ (tabs)/              # Explore, Library, Settings
Ôöé       Ôöé   ÔöťÔöÇÔöÇ book/[id].tsx        # Detail knihy
Ôöé       Ôöé   ÔööÔöÇÔöÇ player.tsx           # Mod├ílny prehr├íva─Ź
Ôöé       ÔööÔöÇÔöÇ src/
Ôöé           ÔöťÔöÇÔöÇ components/ui/       # Nat├şvne UI
Ôöé           ÔöťÔöÇÔöÇ stores/              # Zustand + AsyncStorage
Ôöé           ÔöťÔöÇÔöÇ services/            # API klient
Ôöé           ÔööÔöÇÔöÇ theme/               # Dark/light t├ęma
Ôöé
ÔöťÔöÇÔöÇ audiobooks/                      # Generovan├ę audioknihy
ÔöťÔöÇÔöÇ soundscape/                      # Zvukov├ę efekty + hudba
ÔööÔöÇÔöÇ docs/                            # Dokument├ícia


# 3. Audiobook genera─Źn├Ż pipeline

Jadrom VoiceLibri je sofistikovan├Ż multi-krokov├Ż pipeline, ktor├Ż transformuje e-knihu na dramatizovan├║ audioknihu. Pipeline be┼ż├ş na pozad├ş (startBackgroundDramatization) a umo┼ż┼łuje prehr├ívanie od prvej hotovej kapitoly (progressive playback). Cel├Ż process je asynchr├│nny a non-blocking vo─Źi API serveru.

## 3.1. Preh─żad f├íz pipeline

Diagram 3: Kompletn├Ż genera─Źn├Ż pipeline (v┼íetk├Żch 7 f├íz)
AUDIOBOOK GENERA─îN├Ł PIPELINE ÔÇö KOMPLETN├Ł FLOW

ÔĽöÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽŚ
ÔĽĹ                     POST /api/book/select                              ÔĽĹ
ÔĽĹ  { filename, narratorVoice, targetLanguage, dramatize }                ÔĽĹ
ÔĽÜÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽĄÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽŁ
                                       Ôöé
                    ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
                    Ôöé  F├üZA 1: IMPORT A SPRACOVANIE       Ôöé
                    Ôöé  loadBookFile()                      Ôöé
                    Ôöé  ÔŚĆ Detekcia form├ítu (.epub/.txt/...) Ôöé
                    Ôöé  ÔŚĆ Extrakcia textu (formatExtractors)Ôöé
                    Ôöé  ÔŚĆ ─îistenie textu (textCleaner)      Ôöé
                    Ôöé  ÔŚĆ Detekcia kapitol                  Ôöé
                    Ôöé  ÔŚĆ Parsovanie metad├ít (autor, jazyk) Ôöé
                    Ôöé  V├Żstup: BOOK_CHAPTERS[] (1-based)   Ôöé
                    ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
                                       Ôöé
                            ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
                            Ôöé  200 OK Ôćĺ klient     Ôöé
                            Ôöé  (book info + chunks) Ôöé
                            ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
                                       Ôöé
         ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
         Ôöé           startBackgroundDramatization()                    Ôöé
         Ôöé           (be┼ż├ş na pozad├ş, non-blocking)                    Ôöé
         Ôöé                                                             Ôöé
         Ôöé   ÔĽöÔĽÉÔĽÉ PRE KA┼ŻD├Ü KAPITOLU (sekven─Źne, 1 Ôćĺ N) ÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽŚ  Ôöé
         Ôöé   ÔĽĹ                                                       ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 2: PREKLAD (ak targetLanguage Ôëá null)       ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ChapterTranslator.translateChapter()              ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Gemini 2.5 Flash, temperature 0.2              ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Max 65536 v├Żstupn├Żch tokenov                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Normaliz├ícia ├║vodzoviek po preklade            ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ 18 podporovan├Żch jazykov                       ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 3: EXTRAKCIA POST├üV                         ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé CharacterRegistry.extractFromChapter()            ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ LLM volanie Ôćĺ JSON: meno, pohlavie, vlastnosti ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Alias detekcia (sameAs pole)                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Zamknutie hlasu po 1. priraden├ş (locked=true)  ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ BookInfo z kapitol 1-2 (┼ż├íner, t├│n, ├ęra)       ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Narrator in┼ítrukcia z BookInfo                 ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 4: HYBRIDN├ü DRAMATIZ├üCIA                    ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé tagChapterHybrid()                                ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé                                                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  hasDialogue()?ÔöÇÔöÇNIEÔöÇÔöÇÔľ║ NARRATOR: cel├Ż_text ($0) ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé       Ôöé                                           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé      ├üNO                                         ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé       Ôöé                                           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  applyRuleBasedTagging()                          ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé       Ôöé                                           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  confidence Ôëą 85%?                                ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé       Ôöé                                           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  (V┼żdy LLM pre speechStyle directives)           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé       Ôöé                                           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  LLM fallback Ôćĺ Gemini 2.5 Flash                 ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  ÔŚĆ extractDialogueParagraphs() (len dial├│gy)     ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  ÔŚĆ mergeWithNarration() Ôćĺ fin├ílny text           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé                                                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé  V├Żstup: "SPEAKER: text" + speechStyle directivesÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 5: TWO-SPEAKER CHUNKING                     ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé chunkForTwoSpeakers()                             ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Max 2 unik├ítni hovoriaci na chunk               ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Max 2500 bytov (hard limit API: 4000)           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Nepreru┼í├ş vetu v strede                         ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Merge consecutive same-speaker segments         ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé V├Żstup: TwoSpeakerChunk[] (sub-chunky)           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 6: TTS SYNT├ëZA                               ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé generateSubChunksParallel()                       ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Paralelizmus: 1 (kap.1), 3 (ostatn├ę)           ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ ttsClient.synthesizeMultiSpeaker()              ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Retry 3├Ś s exponenci├ílnym backoffom             ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Timeout: 120s per po┼żiadavka                    ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ V├Żstup: WAV buffer (24kHz, 16-bit, mono)       ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Ulo┼żenie: temp/subchunk_CCC_SSS.wav            ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 7a: KONSOLID├üCIA KAPITOLY                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé consolidateChapterFromSubChunks()                 ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Konkaten├ícia WAV sub-chunkov                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Tich├ę pauzy (500ms) medzi sub-chunkmi          ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ V├Żstup: 01_Chapter_Title.wav                   ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Aktualiz├ícia metadata.json                     ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöśÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                         Ôöé                             ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé F├üZA 7b: SOUNDSCAPE (volite─żn├í)                  ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé applySoundscapeToChapter()                        ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Ambient zvuky mixovan├ę cez ffmpeg               ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Music intro s voice-over narr├íciou              ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ Audio ducking po─Źas voice-over                  ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  Ôöé ÔŚĆ V├Żstup: {chapter}_soundscape.wav                ÔöéÔĽĹ  Ôöé
         Ôöé   ÔĽĹ  ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś ÔĽĹ  Ôöé
         Ôöé   ÔĽĹ                                                       ÔĽĹ  Ôöé
         Ôöé   ÔĽÜÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽÉÔĽŁ  Ôöé
         Ôöé                                                             Ôöé
         Ôöé   ÔŚĆ Aktualiz├ícia generationStatus Ôćĺ 'completed'             Ôöé
         Ôöé   ÔŚĆ Ulo┼żenie cost_summary.json                              Ôöé
         ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

## 3.2. F├íza 1 ÔÇö Import a spracovanie e-knihy

Funkcia loadBookFile() v index.ts spracov├íva vstupn├Ż s├║bor pod─ża jeho pr├şpony. V├Żstupom je text rozdelen├Ż na kapitoly.
Podporovan├ę form├íty (12+):
Form├ít
Pr├şpony
Extraktor
Modul
EPUB
.epub
extractTextFromEpub() + extractEpubChapters()
bookChunker.ts
Text
.txt
fs.readFileSync() + detectTextChapters()
bookChunker.ts
PDF
.pdf
extractTextFromPdf() (len digit├ílne PDF, nie sken)
formatExtractors.ts
HTML
.html, .htm
extractTextFromHtml()
formatExtractors.ts
MOBI/KF8
.mobi, .azw, .azw3
extractTextFromMobi()
formatExtractors.ts
Word
.docx
extractTextFromDocx() (mammoth)
formatExtractors.ts
LibreOffice
.odt
extractTextFromOdt()
formatExtractors.ts
RTF
.rtf
extractTextFromRtf()
formatExtractors.ts
Markdown
.md
extractTextFromMarkdown()
formatExtractors.ts
Pages
.pages
extractTextFromPages()
formatExtractors.ts
WPS
.wps
extractTextFromWps()
formatExtractors.ts
DOC (legacy)
.doc
extractTextFromDoc()
formatExtractors.ts
Detekcia kapitol:
EPUB: Pou┼ż├şva OPF manifest spine order, ka┼żd├Ż spine item = kapitola
TXT: Heuristick├Ż parser ÔÇö h─żad├í patterny "Chapter X", "KAPITOLA", "Kapitel", r├şmske ─Ź├şslice
Ak sa kapitoly nen├íjdu: cel├Ż text = 1 kapitola (createSingleChapter)
Text cleaning: removePageNumbers(), removeTOC(), removeEditorialNotes() pred chunk delen├şm

## 3.3. F├íza 2 ÔÇö Preklad kapitol

ChapterTranslator trieda (chapterTranslator.ts) preklad├í kapitoly ak targetLanguage Ôëá null.
Parameter
Hodnota
LLM model
Gemini 2.5 Flash
Temperature
0.2 (n├şzka = presn├Ż preklad)
Max output tokenov
65 536
Retry
2 opakovania s exponenci├ílnym backoffom
Post-processing
normalizeQuotesForDramatization() ÔÇö curly Ôćĺ straight
Podporovan├ę jazyky (18):
cs (─Źe┼ítina), sk (sloven─Źina), en (angli─Źtina), de (nem─Źina), fr (franc├║z┼ítina), es (┼ípaniel─Źina), it (talian─Źina), pt (portugal─Źina), pl (po─ż┼ítina), ru (ru┼ítina), uk (ukrajin─Źina), nl (holand─Źina), sv (┼ív├ęd─Źina), da (d├ín─Źina), no (n├│r─Źina), fi (f├şn─Źina), hu (ma─Ćar─Źina), ro (rumun─Źina).

## 3.4. F├íza 3 ÔÇö Extrakcia post├ív (CharacterRegistry)

Per-chapter extrakcia cez LLM (characterRegistry.ts):
LLM prompt obsahuje kompletn├Ż zoznam 30 Gemini hlasov Ôćĺ LLM priamo vyberie vhodn├Ż hlas
V├Żstup: JSON s poliami name, gender, traits[], suggestedVoice, aliases[], ageRange, role
Alias detekcia: sameAs pole sp├íja r├┤zne formy mena (napr. "Pan Harker" Ôćĺ "Jonathan Harker")
Voice locking: po prvom priraden├ş sa hlas nikdy nezmen├ş (locked: true)
BookInfo extrakcia z kap. 1-2: genre (horror, romance...), tone (dark, humorous...), voiceTone, period
BookInfo sa zamkne po 2. kapitole (bookInfoLocked: true)
Narrator TTS in┼ítrukcia: auto-generovan├í z BookInfo ("Narrate in a deep, atmospheric tone...")
Ulo┼żenie: character_registry.json v audiobook prie─Źinku

## 3.5. F├íza 4 ÔÇö Hybridn├í dramatiz├ícia

Modul hybridDramatizer.ts implementuje cost-optimized 3-strat├ęgiov├Ż pr├şstup:
Diagram 4: Hybridn├í dramatiz├ícia ÔÇö rozhodovac├ş strom
ROZHODOVAC├Ź STROM HYBRIDNEJ DRAMATIZ├üCIE

                    Vstup: text kapitoly
                             Ôöé
                    ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
                    Ôöé hasDialogue()?   Ôöé  (regex: ÔÇ×..." "..." ┬ź...┬╗ ...)
                    ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
                    NIE      Ôöé     ├üNO
                    Ôöé        Ôöé      Ôöé
            ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÉ   ÔöîÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
            Ôöé Strat├ęgia Ôöé   Ôöé Strat├ęgia 2 / 3        Ôöé
            Ôöé 1: auto   Ôöé   Ôöé                        Ôöé
            Ôöé NARRATOR  Ôöé   Ôöé applyRuleBasedTagging()Ôöé
            Ôöé $0, 100%  Ôöé   Ôöé ÔŚĆ Czech speech verbs   Ôöé
            Ôöé hotov├ę    Ôöé   Ôöé ÔŚĆ Attribution patterns Ôöé
            ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś   Ôöé ÔŚĆ Pronoun analysis     Ôöé
                            ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
                                     Ôöé
                            ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔľ╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
                            Ôöé confidence Ôëą 85%?Ôöé
                            ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöČÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
                            ├üNO      Ôöé     NIE
                            Ôöé        Ôöé      Ôöé
               ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔö╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔö╝ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś
               Ôöé (Ale v┼żdy LLM pre  Ôöé
               Ôöé  speechStyle!)      Ôöé
               Ôľ╝                     Ôľ╝
        ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
        Ôöé LLM fallback (Gemini 2.5 Flash)      Ôöé
        Ôöé ÔŚĆ extractDialogueParagraphs()         Ôöé
        Ôöé   Ôćĺ len odseky s ├║vodzovkami          Ôöé
        Ôöé ÔŚĆ LLM taguje dial├│gy + speechStyle    Ôöé
        Ôöé ÔŚĆ mergeWithNarration() Ôćĺ fin├ílny text  Ôöé
        Ôöé Cena: ~$0.01ÔÇô0.04/kapitola             Ôöé
        ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

V├ŁSTUP FORM├üT (Gemini TTS multi-speaker):
  [Read in a deep, dramatic voice:]
  NARRATOR: Temn├Ż hrad sa ─Źrtil nad ├║dol├şm...
  [Whisper fearfully:]
  JONATHAN: ─îo to bolo za zvuk?
  NARRATOR: Sp├Żtal sa, tras├║c sa na celom tele.
K─ż├║─Źov├ę funkcie hybridTagger.ts:
Funkcia
├Ü─Źel
Detail implement├ície
hasDialogue(text)
Detekcia dial├│gov
Regex: ÔÇ×ÔÇŽ", "ÔÇŽ", ┬źÔÇŽ┬╗, 'ÔÇŽ', curly quotes
countDialogues(text)
Po─Źet dial├│gov
Regex counting v┼íetk├Żch typov ├║vodzoviek
applyRuleBasedTagging(text, chars)
Rule-based tagger
Speech verbs (┼Öekl, zeptala se, 85+), attribution
calculateConfidence(tagged, chars)
Spo─żahlivos┼ą
Pomer priraden├Żch vs nepriraden├Żch dial├│gov
extractDialogueParagraphs(text)
Extrakcia dial├│gov
Filter odsekov s ├║vodzovkami Ôćĺ LLM input
mergeWithNarration(orig, tagged, chars)
Merge tagging
Neozna─Źen├Ż text Ôćĺ NARRATOR:
inferGender(name, context)
Inferencia pohlavia
5 met├│d: CZ koncovky (-ov├í, -sk├í), men├í, pronomen├í, sloves├í, adjekt├şva

## 3.6. F├íza 5 ÔÇö Two-Speaker chunking

Gemini TTS API podporuje maxim├ílne 2 hovorcov na API volanie. Modul twoSpeakerChunker.ts zabezpe─Źuje dodr┼żanie tohto limitu:
Max 2 unik├ítni hovoriaci na chunk (napr. NARRATOR + DRACULA, ale nie NARRATOR + DRACULA + MINA)
Max 2500 bytov na chunk (pracovn├Ż limit; hard limit API je 4000 B s rezervou pre directives)
Nepreru┼í├ş vetu v strede ÔÇö splitSegmentAtSentence() rozde─żuje na vetn├ę hranice
Merge consecutive same-speaker segments ÔÇö elimin├ícia kr├ítkych (<50B) segmentov toho ist├ęho hovoriaceho
V├Żstup: TwoSpeakerChunk[] (pole sub-chunkov, ka┼żd├Ż s max 2 hovorcami a spr├ívnou ve─żkos┼ąou)
formatForMultiSpeakerTTS() ÔÇö form├ítuje chunk pre Gemini TTS API volanie

## 3.7. F├íza 6 ÔÇö TTS synt├ęza (ttsClient.ts)

TTS klient komunikuje s Google Vertex AI REST API:
M├│d
Met├│da
Pou┼żitie
Max hovorcov
Single-speaker
synthesizeText()
Len narrator alebo 1 postava
1
Multi-speaker
synthesizeMultiSpeaker()
Dramatizovan├Ż text s 2 hovorcami
2
Vlastnosti:
Model: gemini-2.5-flash-tts (konfigurovate─żn├Ż cez TTS_MODEL env)
Retry: 3 opakovania s exponenci├ílnym backoffom (2s Ôćĺ 4s Ôćĺ 8s)
Timeout: 120 sek├║nd (AbortSignal.timeout)
Safety filter recovery: retry pri intermitentn├Żch SAFETY blokoch
Speech style directives: "[Read in a whisper:]", "[Thought, internal monologue:]"
Language code: volite─żn├Ż pre kr├ítke texty (prevencia misdetekcie jazyka)
V├Żstup: WAV buffer (PCM 24kHz, 16-bit, mono)
Voice lookup: 5-├║rov┼łov├Ż matching (exact Ôćĺ normalized Ôćĺ case-insensitive Ôćĺ partial Ôćĺ surname)

## 3.8. F├íza 7 ÔÇö Konsolid├ícia a soundscape

Po vygenerovan├ş v┼íetk├Żch sub-chunkov kapitoly pipeline pokra─Źuje konsolid├íciou a soundscape gener├íciou:

7a) Konsolid├ícia (tempChunkManager.ts Ôćĺ consolidateChapterFromSubChunks):
  - Na─Ź├ştanie v┼íetk├Żch subchunk_CCC_SSS.wav z temp/ prie─Źinka
  - Zoradenie pod─ża ─Ź├şseln├ęho indexu
  - WAV konkaten├ícia s tich├Żmi pauzami (500ms, SUBCHUNK_GAP_MS)
  - audioUtils.ts: concatenateWavBuffers() + addSilence()
  - Konverzia na OGG: 01_Chapter_Title.ogg
  - Aktualiz├ícia metadata.json: isConsolidated = true, duration v sekund├ích
  - Automatick├Ż cleanup temp sub-chunkov po ├║spe┼ínej konsolid├ícii

7b) Soundscape ÔÇö Alt 4 architekt├║ra (soundscapeCompat.ts):
  Soundscape pipeline pou┼ż├şva dvojf├ízov├Ż pr├şstup pre optim├ílny pou┼ż├şvate─żsk├Ż z├í┼żitok:

  F├üZA 1 ÔÇö Early Ambient Bed (po─Źas TTS generovania):
    - prepareEarlyAmbient() sa spust├ş fire-and-forget pri za─Źiatku TTS pre kapitolu
    - LLM Director (Gemini 2.5 Flash) analyzuje text kapitoly Ôćĺ SceneAnalysis:
      ÔŚĆ Identifik├ícia prostred├ş (les, hrad, mesto, interi├ęr, ...)
      ÔŚĆ Segment├ícia sc├ęn pod─ża charIndex (1ÔÇô6 sc├ęnick├Żch segmentov)
      ÔŚĆ Zoznam SFX udalost├ş (kroky, dvere, vietor, zvierat├í, ...)
      ÔŚĆ Intenzita sc├ęny (0.0ÔÇô1.0)
    - S├ęmantick├ę vyh─żad├ívanie ambient assetov: embedding search v katal├│gu (470+ zvukov)
    - generateAmbientBed(): ffmpeg generuje ambient OGG z odhadovanej d─║┼żky textu
    - Bez SFX (len ambient vrstva s crossfade medzi sc├ęnami)
    - V├Żstup: {chapter}_ambient.ogg (ambient bed)
    - Valid├ícia: ffmpeg volumedetect ÔÇö ak mean_volume < -55 dB, s├║bor sa vyma┼że (ticho)
    - Cachovanie: SceneAnalysis + resolved assets sa ulo┼żia pre F├ízu 2

  F├üZA 2 ÔÇö Full Soundscape (po konsolid├ícii):
    - applySoundscapeToChapter() Ôćĺ generateChapterSoundscapeFromSubchunks()
    - Reuse cachovanej SceneAnalysis + segment assets z F├ízy 1
    - Pre ka┼żd├Ż sub-chunk (s pr├şstupom k WAV pre silence detection):
      ÔŚĆ detectSilenceGaps() ÔÇö n├íjdenie tich├Żch miest (noise < -30dB, min 200ms)
      ÔŚĆ buildPlacedSfxEvents() ÔÇö umiestnenie SFX do tich├Żch miest:
        - Phase 1: Matching SFX Ôćĺ silence gap midpoint
        - Phase 2: Deduplik├ícia (1 SFX per gap)
        - Phase 3: Constraints (no boundary crossing, no ambient crossfade overlap)
        - Phase 4: Minimum 2s spacing medzi SFX
      ÔŚĆ generateSubchunkAmbientTrack() ÔÇö ffmpeg multi-stream mix (ambient + SFX)
    - Concaten├ícia sub-chunk ambientov Ôćĺ chapter ambient OGG (s 2s fade-in/out)
    - Nahradenie ambient bed z F├ízy 1 plnou verziou s SFX
    - Cleanup per-subchunk ambient s├║borov

  7c) Music Intro (soundscapeCompat.ts):
    - generateIntro(): hudobn├ę intro (5ÔÇô15s) s voice-over narr├íciou
    - Voice-over TTS v cie─żovom jazyku knihy
    - Music ducking: hudba sa stlm├ş na -12dB po─Źas voice-over
    - V├Żstup: {chapter}_intro.ogg

  Hlasitos┼ą soundscape:
    - LUFS normaliz├ícia: katal├│gov├ę assety sa normalizuj├║ na -16 LUFS (bl├şzko hlasov├ęho v├Żstupu)
    - Ambient volume: -3 dB (base) ÔÇö 3 dB pod ├║rov┼łou hlasu
    - Intenzita sc├ęny: volumeDb = -3 - (1 - intensity) * 3 (rozsah -3 a┼ż -6 dB)
    - SFX boost: +6 dB nad ambient Ôćĺ v├Żrazn├ę zvukov├ę efekty
    - Bez loudnorm (jednoduch├í volume korekcia pod─ża LUFS metad├ít z katal├│gu)

# 4. Backend moduly ÔÇö podrobn├Ż preh─żad

Backend pozost├íva z ~22 TypeScript modulov v apps/backend/src/. T├íto sekcia popisuje ├║─Źel, exportovan├ę funkcie a vz├íjomn├ę v├Ązby ka┼żd├ęho modulu.

## 4.1. index.ts ÔÇö API server a orchestr├ícia (3260 riadkov)

Hlavn├Ż Express server. Obsahuje v┼íetky API endpointy a orchestruje cel├Ż background pipeline.
Hlavn├ę zodpovednosti:
Express server s CORS, JSON body parsing (50MB limit), statick├Żm serv├şrovan├şm audiobooks/
V┼íetky REST API endpointy (30+ endpointov ÔÇö vi─Ć sekcia 5)
loadBookFile() ÔÇö detekcia form├ítu, extrakcia textu, parsovanie metad├ít, detekcia kapitol
startBackgroundDramatization() ÔÇö orchestr├ícia pipeline per kapitola (preklad Ôćĺ postavy Ôćĺ dramatiz├ícia Ôćĺ TTS Ôćĺ konsolid├ícia Ôćĺ soundscape)
In-memory glob├ílny stav: BOOK_CHAPTERS[], CHAPTER_SUBCHUNKS Map, VOICE_MAP, NARRATOR_VOICE, TARGET_LANGUAGE
Audio serving s prioritou: subchunk file Ôćĺ consolidated chapter Ôćĺ legacy temp Ôćĺ memory cache Ôćĺ 202 not ready
Automatick├í konsolid├ícia: checkAndConsolidateReadyChapters() po ka┼żdom sub-chunk played
AbortController pre cancellation background procesu pri v├Żbere novej knihy
K─ż├║─Źov├Ż in-memory stav:
// Glob├ílne premenn├ę v index.ts
let BOOK_TEXT: string = '';
let BOOK_CHAPTERS: Chapter[] = [];          // 1-based pole kapitol
let BOOK_METADATA: BookMetadata | null;
let BOOK_FORMAT: string = '';
let CURRENT_BOOK_FILE: string = '';
let VOICE_MAP: Record<string, string> = {}; // postava Ôćĺ Gemini hlas
let NARRATOR_VOICE: string = 'Enceladus';   // default narrator
let TARGET_LANGUAGE: string | null = null;
let COST_TRACKER: CostTracker | null = null;

const CHAPTER_SUBCHUNKS = new Map<number, TwoSpeakerChunk[]>();
const CHAPTER_DRAMATIZED = new Map<number, string>();
const CHAPTER_DRAMATIZATION_LOCK = new Map<number, Promise<string>>();
let TOTAL_SUBCHUNKS = 0;
const audioCache = new Map<string, Buffer>();

## 4.2. bookChunker.ts ÔÇö Parsovanie a chunking (1165 riadkov)

Zodpovednos┼ą: Na─Ź├ştanie e-kn├şh, parsovanie metad├ít, extrakcia kapitol, chunking textu.
Exportovan├í funkcia
├Ü─Źel
chunkBookText(text, options)
Rozdelenie textu na chunky (byte limit, sentence boundaries)
parseBookMetadata(filename, content, format)
Strategy pattern Ôćĺ BookMetadata (autor, jazyk, n├ízov)
extractEpubChapters(filepath)
EPUB Ôćĺ pole kapitol (OPF spine order)
detectTextChapters(text)
TXT Ôćĺ heuristick├í detekcia kapitol (Chapter, KAPITOLA...)
createSingleChapter(text, title)
Fallback: cel├Ż text = 1 kapitola
getBookInfo()
Vracia aktu├ílne BookMetadata
formatDuration(seconds)
Form├ítovanie trvania (HH:MM:SS)

## 4.3. hybridDramatizer.ts ÔÇö Hybridn├í dramatiz├ícia

Zodpovednos┼ą: Cost-optimized dramatiz├ícia (60ÔÇô80% ├║spora vs. ─Źist├Ż LLM).
Exportovan├í funkcia
├Ü─Źel
tagChapterHybrid(text, chars, bookInfo)
Hlavn├í funkcia ÔÇö 3-strat├ęgiov├Ż rozhodovac├ş strom
dramatizeBookStreaming(chapters, ...)
AsyncGenerator ÔÇö yielding dramatizovan├ę kapitoly postupne
dramatizeFirstChapterHybrid(text, chars)
┼ápeci├ílna cesta pre 1. kapitolu (r├Żchly time-to-audio)
Tri strat├ęgie:
Strat├ęgia 1 (bez dial├│gov): Auto-NARRATOR tag, cena $0, confidence 100%
Strat├ęgia 2 (vysok├í confidence Ôëą85%): Rule-based tagging, cena $0 (ale LLM pre speechStyle)
Strat├ęgia 3 (n├şzka confidence): LLM fallback len na dial├│gov├ę odseky, cena ~$0.01ÔÇô0.04/kap.

## 4.4. hybridTagger.ts ÔÇö Detektor dial├│gov (628 riadkov)

Zodpovednos┼ą: Rule-based detekcia a taggovanie dial├│gov, inferencia pohlavia.
Exportovan├í funkcia
├Ü─Źel
hasDialogue(text)
Pr├ştomnos┼ą dial├│gu (regex: 7+ typov ├║vodzoviek)
countDialogues(text)
Po─Źet dial├│gov v texte
applyRuleBasedTagging(text, characters)
Rule-based speaker attribution (85+ Czech speech verbs)
calculateConfidence(taggedText, characters)
Sk├│re spo─żahlivosti (0.0ÔÇô1.0)
extractDialogueParagraphs(text)
Filtrovanie odsekov s dial├│gmi pre LLM
mergeWithNarration(originalText, taggedDialogues, chars)
Zl├║─Źenie LLM tagov s narr├íciou
inferGender(name, contextText)
Inferencia pohlavia: CZ koncovky, men├í, pronomen├í, sloves├í, adjekt├şva

## 4.5. characterRegistry.ts ÔÇö Register post├ív (654 riadkov)

Trieda CharacterRegistry ÔÇö kumulat├şvny stav post├ív naprie─Ź kapitolami.
Met├│da / Export
├Ü─Źel
extractFromChapter(chapterText, chapterNum)
LLM extrakcia post├ív z kapitoly
getVoiceMap()
Record<string, string> ÔÇö postava Ôćĺ Gemini hlas
getAllCharacters()
V┼íetky postavy s locked/unlocked stavom
saveToFile(dir)
Ulo┼żenie do character_registry.json
loadFromFile(dir)
Na─Ź├ştanie registra z disku
BookInfo
Interface: genre, tone, voiceTone, period

## 4.6. llmCharacterAnalyzer.ts ÔÇö LLM anal├Żza (723 riadkov)

Trieda GeminiCharacterAnalyzer ÔÇö Gemini LLM volania pre anal├Żzu post├ív.
Met├│da / Export
├Ü─Źel
analyzeFullBook(text)
Cel├í kniha Ôćĺ CharacterProfile[] (meno, pohlavie, vlastnosti, hlas, vek)
tagChapterWithVoices(chapterText, chars)
Tagging kapitoly s voice markers + speechStyle
toTTSSpeakerAlias(name)
Normaliz├ícia: "Jan Nov├ík" Ôćĺ "JANNOVAK" (bez diakritiky, uppercase)
CharacterProfile interface
name, gender, traits[], suggestedVoice, aliases[], ageRange, role

## 4.7. voiceAssigner.ts ÔÇö Prira─Ćovanie hlasov

Heuristick├ę prira─Ćovanie hlasov na z├íklade pohlavia, veku a trait clusterov. Zabezpe─Źuje unik├ítnos┼ą.
Funkcia
├Ü─Źel
assignVoices(characters, narratorVoice)
Priradenie unik├ítnych Gemini hlasov
saveVoiceMap(dir, voiceMap)
Ulo┼żenie voice_map.json
loadVoiceMap(dir)
Na─Ź├ştanie voice mapy

## 4.8. geminiVoices.ts ÔÇö Datab├íza hlasov

30 predefinovan├Żch Gemini TTS hlasov so s├ęmantick├Żm matchingom.
Kateg├│ria
Po─Źet
Pr├şklady (Gemini Ôćĺ alias)
Mu┼żsk├ę (low)
5
AlgiebaÔćĺAlbert (deep, authoritative), AlnilamÔćĺMilan (warm)
Mu┼żsk├ę (medium)
7
PuckÔćĺPeter (youthful), AchirdÔćĺArthur (storyteller)
Mu┼żsk├ę (high)
4
UmbrielÔćĺUrban (energetic), LaomedeiaÔćĺLeo (clear)
┼Żensk├ę (low)
4
GacruxÔćĺGrace (strong), VindemiatrixÔćĺViola (theatrical)
┼Żensk├ę (medium)
6
AchernarÔćĺAsh (professional), SulafatÔćĺSarah (soothing)
┼Żensk├ę (high)
4
ZephyrÔćĺZara (light), ErinomeÔćĺErin (sweet)
selectVoiceForCharacter(traits, gender, ageRange): S├ęmantick├ę sk├│rovanie s 27 trait clustermi. Podporuje ─Źesk├ę aj anglick├ę traits (napr. "babi─Źka" Ôćĺ elderly cluster).

## 4.9. ttsClient.ts ÔÇö TTS klient (499 riadkov)

Google Vertex AI Gemini TTS klient.
Met├│da
├Ü─Źel
Detail
synthesizeText(text, voiceName, opts)
Single-speaker TTS
Volite─żn├Ż speechStyle, languageCode
synthesizeMultiSpeaker(turns, voiceConfig)
Multi-speaker TTS
Max 2 hlasy, multiSpeakerVoiceConfig
Konfigur├ícia: model=gemini-2.5-flash-tts, maxOutputTokens=8192, endpoint=us-central1-aiplatform.googleapis.com

## 4.10. twoSpeakerChunker.ts ÔÇö 2-speaker chunking (404 riadkov)

Funkcia
├Ü─Źel
chunkForTwoSpeakers(dramatizedText)
Rozdelenie na TwoSpeakerChunk[] (max 2 hovoriaci, max 2500B)
formatForMultiSpeakerTTS(chunk)
Form├ítovanie pre Gemini TTS API
getUniqueSpeakers(chunk)
Zoznam unik├ítnych hovorcov v chunku
splitSegmentAtSentence(segment, maxBytes)
Rozdelenie na vetn├ę hranice

## 4.11. chapterChunker.ts ÔÇö Kapitolov├ę chunkovanie

Ramp-up strat├ęgia: progres├şvne zvy┼íovanie ve─żkosti chunkov pre r├Żchly time-to-first-audio.
Ramp-up sekvencia (byte limity per chunk):
  Chunk 1:  300 B   ÔćÉ ve─żmi mal├Ż = r├Żchle audio
  Chunk 2:  500 B
  Chunk 3:  800 B
  Chunk 4: 1200 B
  Chunk 5: 1800 B
  Chunk 6: 2500 B
  Chunk 7+: 3500 B  ÔćÉ pln├Ż limit (pod 4000B hard limit)

GEMINI_TTS_HARD_LIMIT = 4000 bytov (valid├ícia)

## 4.12. chapterTranslator.ts ÔÇö Preklad kapitol

Export
├Ü─Źel
ChapterTranslator class
Preklad kapitol cez Gemini 2.5 Flash
translateChapter(text, targetLang)
Prelo┼żenie jednej kapitoly
normalizeQuotesForDramatization(text)
Normaliz├ícia ├║vodzoviek po preklade
SUPPORTED_LANGUAGES
18 jazykov s BCP-47 k├│dmi

## 4.13. tempChunkManager.ts ÔÇö Spr├íva temp s├║borov (1834 riadkov)

Najv├Ą─Ź┼í├ş modul. Zodpovedn├Ż za TTS gener├íciu, temp caching, voice lookup a konsolid├íciu.
Funkcia
├Ü─Źel
generateAndSaveTempChunk(chunk, index, ...)
Gener├ícia jedn├ęho sub-chunk WAV a ulo┼żenie do temp/
generateSubChunksParallel(chapter, chunks, ...)
Paraleln├í TTS gener├ícia (1-3 concurrent)
consolidateChapterFromSubChunks(bookTitle, ch)
Konsolid├ícia sub-chunkov Ôćĺ kapitola WAV
consolidateChapterSmart(bookTitle, ch)
Smart konsolid├ícia s kontrolou completeness
lookupVoice(speakerName, voiceMap)
5-├║rov┼łov├Ż voice matching
startPreDramatization(chapterText, ...)
Look-ahead dramatiz├ícia v pozad├ş
dramatizeTextCore(text, voiceMap, ...)
Core dramatiz├ícia + chunking
toBCP47(langCode)
Konverzia jazykov├ęho k├│du na BCP-47
Voice lookup priority (lookupVoice):
# 1. Exact match: voiceMap["Jonathan Harker"]
# 2. Normalized: trimmed, lowercased key match
# 3. Case-insensitive: porovnanie bez oh─żadu na ve─żkos┼ą p├şsmen
# 4. Partial match: k─ż├║─Ź obsahuje meno hovoriaceho alebo naopak
# 5. Surname match: posledn├ę slovo mena sa zhoduje
Fallback: narrator voice (ak sa ni─Ź nen├íjde)

## 4.14. audiobookManager.ts ÔÇö Spr├íva kni┼żnice (540 riadkov)

Funkcia
├Ü─Źel
createAudiobookFolder(title)
Vytvorenie {audiobooks}/{title}/ + temp/
saveAudiobookMetadata(title, metadata)
Ulo┼żenie metadata.json
loadAudiobookMetadata(title)
Na─Ź├ştanie metad├ít
listAudiobooks()
Zoznam v┼íetk├Żch audiokn├şh
deleteAudiobook(title)
Zmazanie prie─Źinka + metad├ít
getSubChunkPath(title, chapter, subchunk)
Cesta k temp/subchunk_CCC_SSS.wav
countChapterSubChunks(title, chapter)
Po─Źet sub-chunkov pre kapitolu
isChapterConsolidated(title, chapter)
Kontrola ─Źi existuje konsolidovan├Ż WAV

## 4.15. audiobookWorker.ts ÔÇö Background worker (384 riadkov)

Trieda AudiobookGenerationWorker (extends EventEmitter) pre queue-based gener├íciu.
Met├│da
├Ü─Źel
addBook(title, config)
Pridanie knihy do fronty
processQueue()
Spracovanie fronty (FIFO)
generateAudiobook(job)
Gener├ícia jednej audioknihy
generateAllChunks(job)
Paraleln├í gener├ícia chunkov (max 2 concurrent)
consolidateAllChapters(job)
Konsolid├ícia v┼íetk├Żch kapitol
getProgress()
Aktu├ílny stav gener├ície

## 4.16. costTracker.ts ÔÇö Sledovanie n├íkladov

Sleduje tokeny a USD per audiokniha cez 4 f├ízy pipeline.
F├íza
Input $/M tokenov
Output $/M tokenov
Typick├í cena/kap.
Extrakcia post├ív
$0.15
$0.60
$0.002ÔÇô0.005
Preklad
$0.15
$0.60
$0.01ÔÇô0.05
Dramatiz├ícia
$0.30
$2.50
$0.01ÔÇô0.04
Audio gener├ícia
$0.15
$0.60
$0.01ÔÇô0.03
Token estimation: slov├í ├Ś koeficient (slovansk├ę jazyky: 2.15, angli─Źtina: 1.38, default: 1.76). V├Żstup: cost_summary.json.

## 4.17. promptConfig.ts ÔÇö Konfigur├ícia promptov

Single source of truth pre v┼íetky LLM prompty, temperatures a kon┼ítanty.
Export
├Ü─Źel
Hodnota / Detail
getCharacterExtractionPrompt()
Prompt pre extrakciu post├ív
Obsahuje v┼íetk├Żch 30 hlasov
getVoiceTaggingPrompt()
Prompt pre voice tagging
SPEAKER: form├ít + speechStyle
getTranslationPrompt()
Prompt pre preklad
Zachovanie form├ítovania, ├║vodzoviek
buildNarratorInstruction(bookInfo)
Narrator TTS style
"Narrate in a [tone]..."
DEFAULT_NARRATOR_VOICE
Default narrator
Enceladus
SUBCHUNK_GAP_MS
Pauza medzi sub-chunkmi
500 ms
DRAMATIZATION_TIMEOUT_MS
Timeout pre dramatiz├íciu
300 000 ms (5 min)

## 4.18. soundscapeCompat.ts ÔÇö Soundscape pipeline (~820 riadkov)

Nov├Ż soundscape modul nahradil p├┤vodn├Ż soundscapeIntegration.ts. Implementuje Alt 4 architekt├║ru s dvojf├ízov├Żm ambient generovan├şm.

Z├ívislosti:
  - soundscape/ modul: ambientLayer.ts, ffmpegRunner.ts, llmDirector.ts, assetResolver.ts, catalogLoader.ts
  - Zdie─żan├Ż katal├│g: 470+ zvukov├Żch assetov s embedding vektormi a LUFS metad├ítami

Funkcia                                       ├Ü─Źel
prepareEarlyAmbient(options)                   Early ambient bed po─Źas TTS (F├íza 1, fire-and-forget)
generateAmbientBed(options)                    ffmpeg gener├ícia ambient OGG z odhadovanej d─║┼żky
applySoundscapeToChapter(bookTitle, ch, path)  Orchestr├ícia pln├ęho soundscape po konsolid├ícii (F├íza 2)
generateChapterSoundscapeFromSubchunks(opts)   Per-subchunk ambient + SFX Ôćĺ concaten├ícia Ôćĺ chapter ambient
resolveChapterAudioPath(chapterPath)           Resolve voice audio path pre playback
getAmbientAudioPath(chapterPath)               Cesta k ambient tracku (null ak neexistuje)
getIntroAudioPath(chapterPath)                 Cesta k intro tracku (null ak neexistuje)
startEarlyIntroGeneration(options)             Fire-and-forget gener├ícia music intro

Modul-level cache:
  - earlyAmbientCache: Map<string, { scene, segmentAssets }> ÔÇö cachuje SceneAnalysis + assety z F├ízy 1
  - K─ż├║─Ź: "bookTitle:chapterIndex"
  - Reuse v applySoundscapeToChapter() ÔÇö eliminuje redundantn├║ LLM anal├Żzu a embedding search

Soundscape modul (soundscape/):
  - ambientLayer.ts: ffmpeg filter_complex gener├ícia (ambient segmenty + SFX overlays)
  - ffmpegRunner.ts: runFfmpeg(), detectSilenceGaps(), getAudioDuration()
  - llmDirector.ts: analyzeChapterScene() ÔÇö LLM sc├ęnick├í anal├Żza (Gemini 2.5 Flash)
  - assetResolver.ts: s├ęmantick├ę vyh─żad├ívanie (embedding search) v katal├│gu zvukov
  - catalogLoader.ts: na─Ź├ştanie a cachovanie zvukov├ęho katal├│gu
  - subchunkSoundscape.ts: buildPlacedSfxEvents(), mapSfxEventsToSubchunks()
  - types.ts: SceneAnalysis, SceneSegment, SfxEvent, SilenceGap, SoundAsset, BookInfo

## 4.19. formatExtractors.ts (744 riadkov)

Multi-form├ítov├ę extraktory textu. Ka┼żd├Ż extraktor vracia ─Źist├Ż text.
Funkcia
Kni┼żnica
Pozn├ímka
extractTextFromEpub(path)
adm-zip + fast-xml-parser
OPF spine order
extractTextFromPdf(path)
pdf-parse
Len digit├ílne PDF (nie OCR sken)
extractTextFromDocx(path)
mammoth
Zachov├íva ┼ítrukt├║ru odsekov
extractTextFromHtml(path)
regex/cheerio
Strip HTML tagov
extractTextFromMobi(path)
custom parser
MOBI/KF8/AZW
extractTextFromOdt(path)
adm-zip (ZIP Ôćĺ content.xml)
OpenDocument form├ít
extractTextFromRtf(path)
regex stripping
RTF control words removal
extractTextFromMarkdown(path)
regex
Strip markdown syntaxu
SUPPORTED_EXTENSIONS
Set
.epub, .txt, .pdf, .html, .mobi, .docx, .odt, .rtf, .md, .pages, .wps, .doc
SUPPORTED_MIME_TYPES
Map
MIME Ôćĺ handler mapping

## 4.20. textCleaner.ts (418 riadkov)

Regex-based ─Źistenie textu od artefaktov e-kn├şh.
Funkcia
├Ü─Źel
cleanText(text)
Orchestr├ítor ÔÇö vol├í v┼íetky ─Źistenia
removePageNumbers(text)
Odstr├ínenie ─Ź├şsiel str├ín
removeTOC(text)
Odstr├ínenie obsahu (Table of Contents)
removeEditorialNotes(text)
Odstr├ínenie redak─Źn├Żch pozn├ímok
removePublisherInfo(text)
Odstr├ínenie inform├íci├ş o vydavate─żstve
normalizeWhitespace(text)
Normaliz├ícia medzier a riadkov

## 4.21. audioUtils.ts (84 riadkov)

Funkcia
├Ü─Źel
concatenateWavBuffers(buffers)
Konkaten├ícia viacer├Żch WAV bufferov do jedn├ęho
addSilence(durationMs)
Generovanie tichej pauzy (24kHz, 16-bit, mono)

## 4.22. Ostatn├ę moduly

Modul
Riadkov
├Ü─Źel
dramatizedProcessor.ts
~200
PoC pipeline orchestr├ítor (star┼íia verzia)
dramatizedChunkerSimple.ts
~150
Parser "SPEAKER: text" form├ítu
dialogueParserSimple.ts
~100
Jednoduch├Ż detektor dial├│gov (─Źesk├ę ├║vodzovky ÔÇ×...")
parallelPipelineManager.ts
~80
Reset glob├ílneho stavu pri prep├şnan├ş kn├şh


# 5. REST API rozhranie

Backend exponuje REST API na porte 3001. V┼íetky endpointy s├║ definovan├ę v index.ts.

## 5.1. Health & knihy

Met├│da
Endpoint
Popis
Odpove─Ć
GET
/api/health
Health check
200: {status, bookLoaded}
GET
/api/books
Zoznam kn├şh v assets/
200: [{filename, size, type}]
POST
/api/book/select
V├Żber + inicializ├ícia
200: {title, author, chapters, chunks}
GET
/api/book/info
Metad├íta aktu├ílnej knihy
200: BookMetadata
GET
/api/book/consolidated
Stav konsolid├ície
200: {chapters: [{index, consolidated}]}
POST
/api/book/from-text
Nov├í kniha z textu/base64
200: {title, chapters}
POST
/api/book/from-url
Nov├í kniha z URL
200: {title, chapters}

## 5.2. TTS & audio

Met├│da
Endpoint
Popis
Odpove─Ć
POST
/api/tts/chunk
Audio pre sub-chunk
200: WAV / 202: {retryAfterMs}
GET
/api/audiobooks/:title/subchunks/:ch/:sub
Stream sub-chunk
200: WAV stream
GET
/api/audiobooks/:title/chapters/:ch
Konsolidovan├í kapitola
200: WAV stream
Hlavi─Źky v odpovedi POST /api/tts/chunk:
X-Cache: subchunk_file | chapter_file | legacy_temp | file_scan | memory_cache | generated
X-Is-Whole-Chapter: true/false ÔÇö indikuje konsolidovan├║ kapitolu
X-Seek-Offset-Sec: float ÔÇö offset pre navig├íciu v konsolidovanej kapitole
Content-Type: audio/wav

## 5.3. Kni┼żnica

Met├│da
Endpoint
Popis
GET
/api/audiobooks
Zoznam audiokn├şh
GET
/api/audiobooks/:title
Metad├íta konkr├ętnej audioknihy
DELETE
/api/audiobooks/:title
Zmazanie audioknihy
POST
/api/audiobooks/generate
Background gener├ícia (worker)
GET
/api/audiobooks/:title/progress
Priebeh gener├ície
GET
/api/audiobooks/worker/status
Stav workera

## 5.4. Poz├şcia & preferencie

Met├│da
Endpoint
Popis
PUT
/api/audiobooks/:title/position
Ulo┼żenie poz├şcie prehr├ívania
GET
/api/audiobooks/:title/position
Na─Ź├ştanie poz├şcie
PUT
/api/audiobooks/:title/preferences
Ulo┼żenie preferenci├ş (hlas, r├Żchlos┼ą, soundscape)
GET
/api/audiobooks/:title/preferences
Na─Ź├ştanie preferenci├ş

## 5.5. Dramatiz├ícia & soundscape

Met├│da
Endpoint
Popis
GET
/api/dramatization/status
Stav background dramatiz├ície (phase, chapter, timeout)
GET
/api/dramatize/check/:bookFile
Kontrola cache pre dramatiz├íciu
POST
/api/dramatize/process
Spracovanie pred-tagovan├ęho textu
GET
/api/dramatize/voice-map
Voice map pre dramatizovan├Ż text
GET
/api/audiobooks/:title/soundscape/themes
Dostupn├ę soundscape t├ęmy

## 5.6. Error form├ít

// ┼átandardn├Ż error response (v┼íetky endpointy):
{
  "error": "ERROR_CODE",         // napr. "NO_BOOK_LOADED", "CHUNK_NOT_READY"
  "message": "─Żudsky ─Źitate─żn├Ż popis chyby"
}

// HTTP k├│dy:
// 200 ÔÇö OK (audio alebo JSON)
// 202 ÔÇö Accepted, not ready yet (retryAfterMs pre polling)
// 400 ÔÇö Bad request (ch├Żbaj├║ce parametre, nepodporovan├Ż form├ít)
// 404 ÔÇö Not found (audiokniha, kapitola, sub-chunk)
// 500 ÔÇö Internal server error (TTS zlyhanie, file system error)


# 6. Syst├ęm hlasov a postavy


## 6.1. Datab├íza 30 Gemini hlasov

Ka┼żd├Ż hlas m├í: name (Gemini API meno), alias (frontend meno), gender, pitch (low/medium/high), characteristic (popis ┼ít├Żlu).
Gemini meno
Alias
Pohlavie
V├Ż┼íka
Charakteristika
Algieba
Albert
M
low
Deep, authoritative narrator
Alnilam
Milan
M
low
Warm, rich baritone
Schedar
Stefan
M
low
Gravelly, mature
Rasalgethi
Richard
M
low
Commanding, noble
Puck
Peter
M
medium
Youthful, enthusiastic
Achird
Arthur
M
medium
Classic storyteller
Orus
Oliver
M
medium
Friendly, conversational
Zubenelgenubi
Zbyn─Ťk
M
medium
Thoughtful, measured
Sadachbia
Samuel
M
medium
Gentle, calming
Enceladus
Eric
M
medium
Versatile narrator (DEFAULT)
Isonoe
Ivan
M
medium
Expressive, dynamic
Umbriel
Urban
M
high
Energetic, bright
Laomedeia
Leo
M
high
Clear, articulate
Despina
Daniel
M
high
Light, pleasant
Daphne
David
M
high
Smooth, refined
Fenrir
Filip
M
medium
Bold, adventurous
Achernar
Ash
F
medium
Professional, neutral
Gacrux
Grace
F
low
Strong, commanding
Vindemiatrix
Viola
F
low
Theatrical, dramatic
Charon
Charlotte
F
low
Mysterious, dark
Pulcherrima
Paula
F
low
Elegant, mature
Sulafat
Sarah
F
medium
Soothing, warm
Leda
Linda
F
medium
Friendly, approachable
Callirrhoe
Clara
F
medium
Intelligent, precise
Autonoe
Anna
F
medium
Expressive, emotional
Elara
Elena
F
medium
Soft, gentle
Zephyr
Zara
F
high
Light, airy, playful
Erinome
Erin
F
high
Sweet, youthful
Aoede
Andrea
F
high
Musical, lyrical
Kore
Karen
F
high
Bright, cheerful

## 6.2. S├ęmantick├Ż matching (trait clusters)

Funkcia selectVoiceForCharacter() pou┼ż├şva 27 s├ęmantick├Żch clusterov pre matching:
PR├ŹKLADY TRAIT CLUSTEROV (z geminiVoices.ts):

"elderly"   Ôćĺ ["elderly", "old", "aged", "wise", "ancient", "babi─Źka", "d─Ťde─Źek", "grandmother"]
"young"     Ôćĺ ["young", "youthful", "teen", "child", "boy", "girl", "d├şt─Ť", "mlad├Ż"]
"villain"   Ôćĺ ["villain", "evil", "sinister", "dark", "wicked", "cruel", "zl├Ż", "temn├Ż"]
"romantic"  Ôćĺ ["romantic", "passionate", "loving", "tender", "gentle", "l├ískypln├Ż"]
"military"  Ôćĺ ["military", "soldier", "commanding", "stern", "disciplined", "vojensk├Ż"]
"noble"     Ôćĺ ["noble", "aristocratic", "royal", "dignified", "regal", "┼ílechtick├Ż"]
"mysterious"Ôćĺ ["mysterious", "enigmatic", "secretive", "cryptic", "z├íhadn├Ż"]
"comedic"   Ôćĺ ["comedic", "funny", "humorous", "witty", "sarcastic", "vtipn├Ż"]
...

Scoring: Ka┼żd├Ż trait Ôćĺ najlep┼í├ş cluster Ôćĺ zoznam vhodn├Żch hlasov
         Hlas s najvy┼í┼í├şm sk├│re vyhr├íva (penaliz├ícia za duplicity)


# 7. Frontend PWA architekt├║ra

Web frontend je React 18 PWA (Progressive Web App) s Vite build syst├ęmom, Tailwind CSS ┼ít├Żlmi a neumorphism dizajnom.

## 7.1. State management (Zustand)

Diagram 6: Frontend Zustand stores
FRONTEND STATE ÔÇö 3 ZUSTAND STORES

ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
Ôöé playerStore  (voicelibri-player)  ÔÇö 313 riadkov                Ôöé
Ôöé Perzistencia: localStorage                                      Ôöé
ÔöťÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöĄ
Ôöé Stav:                                                           Ôöé
Ôöé   currentBook: Audiobook | null                                 Ôöé
Ôöé   currentChapterIndex: number                                   Ôöé
Ôöé   currentTime: number (sekundy v kapitole)                      Ôöé
Ôöé   isPlaying: boolean                                            Ôöé
Ôöé   playbackSpeed: number (0.5 ÔÇô 2.0)                            Ôöé
Ôöé   volume: number (0 ÔÇô 1)                                        Ôöé
Ôöé   progressivePlayback: {                                        Ôöé
Ôöé     enabled: boolean,                                           Ôöé
Ôöé     isGenerating: boolean,                                      Ôöé
Ôöé     currentSubChunk: number,                                    Ôöé
Ôöé     totalSubChunks: number,                                     Ôöé
Ôöé     phase: 'loading' | 'playing' | 'done'                      Ôöé
Ôöé   }                                                             Ôöé
Ôöé   sleepTimer: { endTime, duration, active }                     Ôöé
Ôöé Akcie:                                                          Ôöé
Ôöé   play(), pause(), seek(time), nextChapter(), prevChapter()     Ôöé
Ôöé   setPlaybackSpeed(speed), setVolume(vol)                       Ôöé
Ôöé   startProgressivePlayback(book), stopProgressivePlayback()     Ôöé
Ôöé   setSleepTimer(minutes)                                        Ôöé
ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
Ôöé libraryStore  (voicelibri-library)                              Ôöé
ÔöťÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöĄ
Ôöé Stav: books[], searchQuery, sortBy, filterStatus                Ôöé
Ôöé       generationProgress: Record<string, number>                Ôöé
Ôöé Akcie: addBook(), removeBook(), updateProgress()                Ôöé
Ôöé Computed: filteredBooks() ÔÇö search + filter + sort pipeline      Ôöé
ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

ÔöîÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
Ôöé themeStore  (voicelibri-theme)                                  Ôöé
ÔöťÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöĄ
Ôöé Stav: theme ('light' | 'dark' | 'system')                      Ôöé
Ôöé Akcie: setTheme(), toggleTheme()                                Ôöé
Ôöé Efekt: automatick├í detekcia system preference                   Ôöé
ÔööÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöś

## 7.2. Audio prehr├ívanie ÔÇö dva m├│dy s du├ílnym prehr├íva─Źom

VoiceLibri pou┼ż├şva du├ílny audio prehr├íva─Ź: voice (master) + ambient (follower). Oba HTML5 Audio elementy s├║ synchronizovan├ę.

M├│d                Hook                              Riadkov   Princ├şp
Chapter mode        useAudioPlayback                  180       ┼átandardn├Ż HTML5 Audio, prehr├ívanie OGG kapitol, auto-advance, poz├şcia ka┼żd├Żch 10s
Progressive mode    useProgressiveAudioPlayback        530       Du├ílny prehr├íva─Ź (voice + ambient), sub-chunk streaming, polling, auto-start

Progressive playback flow:
  1. GenerateScreen vol├í store.startProgressivePlayback(book) Ôćĺ nastav├ş playbackState='playing'
  2. Auto-start useEffect detekuje playbackMode='progressive' + ┼żiadny audio src
  3. Hook polluje HEAD /api/audiobooks/{title}/subchunks/{ch}/{sub} (500ms interval, max 30s)
  4. Po dostupnosti: fetch Ôćĺ Blob URL cache Ôćĺ audio.src Ôćĺ audio.play()
  5. Ambient bed (ak existuje): getChapterAmbientUrl() Ôćĺ ambient.src Ôćĺ ambient.play()
  6. Po konsolid├ícii: ambient hot-swap na pln├║ verziu s SFX (polling 3s interval)

Du├ílny prehr├íva─Ź:
  - audioRef (master): voice/TTS audio
  - ambientRef (follower): ambient/soundscape audio (loop=true)
  - Drift correction: ka┼żd├Żch 5s synchroniz├ícia currentTime (chapter mode)
  - Ambient volume: konfigurovate─żn├Ż (0.0ÔÇô1.0), default 0.5
  - Ambient enabled/disabled: toggle v UI

Frontend automaticky prep├şna medzi m├│dmi:
  - Ak existuje konsolidovan├í kapitola OGG Ôćĺ chapter mode
  - Ak sa kapitola e┼íte generuje Ôćĺ progressive mode (sub-chunk polling)
  - Po konsolid├ícii Ôćĺ seamless prechod na chapter mode

Soundscape toast: "ÔťĘ Creating your soundscape..." ÔÇö zobraz├ş sa pri prvom prehr├ívan├ş kapitoly bez ambient (5s auto-dismiss)


## 7.3. Obrazovky a komponenty

Router (React Router v6 v App.tsx):
Route
Obrazovka
Ve─żkos┼ą
Popis
/
LibraryScreen
247 r.
Zoznam audiokn├şh, search, sort, filter, delete, play
/generate
GenerateScreen
504 r.
Vytvorenie novej audioknihy: upload s├║boru, paste textu, URL import, nastavenia hlasu
/classics
ClassicsScreen
153 r.
Preh─żad klas├şk (placeholder s mock d├ítami)
/settings
SettingsScreen
215 r.
T├ęma, playback preferencie, about
Hlavn├ę komponenty:
Komponent
Ve─żkos┼ą
├Ü─Źel
AppShell
~100 r.
Layout wrapper: sidebar/header + content area + bottom nav
FullPlayer
380 r.
Pln├Ż prehr├íva─Ź: progress bar, controls, chapter list, speed, sleep timer
MiniPlayer
183 r.
Minimalizovan├Ż prehr├íva─Ź: play/pause, progress, title
BookItem
350 r.
Karta audioknihy: cover, title, author, progress, play/delete akcie
BookList
80 r.
Grid/list zobrazenie BookItem komponentov
BottomNavigation
~80 r.
Spodn├í navig├ícia: Library, Generate, Classics, Settings
API klient (services/api.ts, 352 riadkov):
V┼íetky fetch() volania na localhost:3001/api. Funkcie: fetchBooks(), selectBook(), fetchAudiobooks(), generateFromText(), generateFromUrl(), getSubChunkAudioUrl(), getChapterAudioUrl(), savePosition(), loadPosition(), getDramatizationStatus() at─Ć.


# 8. Mobiln├í aplik├ícia (Expo / React Native)

Mobiln├í appka je mobile-only (┼żiadna web podpora). Komunikuje s rovnak├Żm backendom na porte 3001.
Aspekt
Detail
Framework
Expo SDK 54.0.31, React Native 0.81.5, React 19.1.0
Navig├ícia
expo-router v6.0.21 (s├║borov├Ż routing: app/(tabs)/, app/book/[id].tsx)
State management
Zustand 5.0.0 + AsyncStorage (nie localStorage!)
Server state
TanStack Query (fetchBooks, fetchAudiobook, ...)
Anim├ície
moti + react-native-reanimated v4
Gest├í
react-native-gesture-handler + @gorhom/bottom-sheet
T├ęma
Custom ThemeContext (dark/light), expo-blur pre glassmorphism
Icons
@expo/vector-icons (Ionicons, MaterialIcons)
Provider stack (app/_layout.tsx):
<GestureHandlerRootView>           // Gesto handling
  <QueryClientProvider>            // TanStack Query
    <ThemeProvider>                 // Dark/light t├ęma
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  </QueryClientProvider>
</GestureHandlerRootView>
Tab navig├ícia:
Tab
Ikona
Obrazovka
Explore
compass
Objavovanie audiokn├şh (odpor├║─Źania, ┼ż├ínre)
Library
library
Kni┼żnica stiahnut├Żch/generovan├Żch audiokn├şh
Settings
settings
Nastavenia (t├ęma, ├║─Źet, hlas)
Mobile Zustand stores:
settingsStore: t├ęma, jazyk, defaultn├Ż hlas, playback speed (AsyncStorage persist)
bookStore: stiahnut├ę knihy, offline stav
playerStore: aktu├ílna kniha, kapitola, poz├şcia, hlasitos┼ą


# 9. D├ítov├ę modely a ├║lo┼żisko


## 9.1. AudiobookMetadata (metadata.json)

D├ítov├Ż model: AudiobookMetadata
interface AudiobookMetadata {
  title: string;                    // N├ízov knihy
  author: string;                   // Autor
  language: string;                 // K├│d jazyka (cs, sk, en, ...)
  totalChapters: number;            // Po─Źet kapitol
  chapters: ChapterMetadata[];      // Pole metad├ít kapitol
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string;              // ISO timestamp

  // Voice & dramatization
  voiceMap?: Record<string, string>;  // Postava Ôćĺ Gemini hlas
  sourceFile?: string;
  isDramatized?: boolean;
  dramatizationType?: 'llm-only' | 'hybrid-optimized';
  charactersFound?: number;
  dramatizationCost?: number;

  // Poz├şcia prehr├ívania (cross-device sync)
  playback?: {
    currentChapter: number;         // 0-based
    currentTime: number;            // sekundy
    lastPlayedAt: string;           // ISO timestamp
  };

  // U┼ż├şvate─żsk├ę preferencie
  userPreferences?: {
    narratorVoice?: string;
    playbackSpeed?: number;         // 0.75 ÔÇô 2.0
    soundscapeMusicEnabled?: boolean;
    soundscapeAmbientEnabled?: boolean;
    soundscapeThemeId?: string;
  };
}

interface ChapterMetadata {
  index: number;
  title: string;
  filename: string;                 // "01_Chapter_Title.wav"
  duration: number;                 // sekundy
  isGenerated: boolean;
  isConsolidated?: boolean;
  subChunksTotal?: number;
  subChunksGenerated?: number;
}

## 9.2. Backend in-memory stav

Backend udr┼żiava glob├ílny stav v pam├Ąti (nie datab├íza):
Premenn├í
Typ
├Ü─Źel
BOOK_TEXT
string
Cel├Ż extrahovan├Ż text aktu├ílnej knihy
BOOK_CHAPTERS
Chapter[]
1-based pole kapitol
BOOK_METADATA
BookMetadata | null
Metad├íta (autor, jazyk, ...)
VOICE_MAP
Record<string, string>
Postava Ôćĺ Gemini hlas
NARRATOR_VOICE
string
Aktu├ílny narrator (default: Enceladus)
TARGET_LANGUAGE
string | null
Cie─żov├Ż jazyk prekladu
CHAPTER_SUBCHUNKS
Map<number, TwoSpeakerChunk[]>
Kapitola Ôćĺ sub-chunky
CHAPTER_DRAMATIZED
Map<number, string>
Kapitola Ôćĺ dramatizovan├Ż text
audioCache
Map<string, Buffer>
In-memory audio cache
COST_TRACKER
CostTracker | null
Sledovanie n├íkladov


# 10. V├Żkonnostn├ę obmedzenia a limity

Parameter
Limit
Zd├┤vodnenie
Max ve─żkos┼ą e-knihy
50 MB
express.json({ limit: "50mb" })
Max bytov na TTS chunk
4000 B (hard limit)
Gemini TTS API limit
Pracovn├Ż limit na chunk
2500 B
Rezerva pre speechStyle directive
Max hovorcov na TTS req
2
Gemini multiSpeakerVoiceConfig limit
TTS timeout
120 s
AbortSignal.timeout v fetch()
TTS retry
3├Ś
Exponenci├ílny backoff: 2s, 4s, 8s
Dramatization timeout
5 min / kapitola
DRAMATIZATION_TIMEOUT_MS
Paraleln├í TTS gen.
1 (kap.1), 3 (ostatn├ę)
API rate limit balancing
Ramp-up chunks
300Ôćĺ500Ôćĺ800Ôćĺ1200Ôćĺ1800Ôćĺ2500Ôćĺ3500 B
R├Żchly time-to-first-audio
Silence gap
500 ms
SUBCHUNK_GAP_MS
Audio form├ít
WAV 24kHz, 16-bit, mono
Vertex AI default
Subchunk polling
2-3 s
retryAfterMs v 202 response


# 11. Spracovanie ch├Żb a odolnos┼ą

Chyba
Rie┼íenie
Modul
Gemini TTS 500/503
Retry 3├Ś s exponenci├ílnym backoffom
ttsClient.ts
Gemini Safety block
Retry (intermitentn├Ż filter)
ttsClient.ts
TTS timeout (120s)
Abort + retry
ttsClient.ts
Chunk > 4000 B
splitSegmentAtSentence Ôćĺ word boundary
twoSpeakerChunker.ts
Dramatiz├ícia zlyh├í
Fallback: NARRATOR: cel├Ż text
hybridDramatizer.ts
Preklad zlyh├í
Pokra─Źovanie s origin├ílnym textom
chapterTranslator.ts
Voice not found
5-├║rov┼łov├Ż lookupVoice Ôćĺ default narrator
tempChunkManager.ts
Kapitola bez dial├│gov
Auto-tag NARRATOR ($0)
hybridDramatizer.ts
Chapter timeout (5 min)
phase="failed", continue next
index.ts
PDF sken (nie OCR)
Odmietnutie s error spr├ívou
formatExtractors.ts
Nepodporovan├Ż form├ít
400 + zoznam podporovan├Żch
index.ts
Network error (frontend)
202 retry loop
api.ts
Memory exhaustion
Clear chunk maps, restart
index.ts
Background abort
AbortController.abort()
index.ts

# 12. Sledovanie n├íkladov

CostTracker sleduje tokeny a USD na 4 f├ízy pipeline. Token estimation: slov├í ├Ś jazykov├Ż koeficient.
F├íza
Input $/M tok.
Output $/M tok.
Typicky/kap.
Extrakcia post├ív
$0.15
$0.60
$0.002ÔÇô0.005
Preklad
$0.15
$0.60
$0.01ÔÇô0.05
Dramatiz├ícia
$0.30
$2.50
$0.01ÔÇô0.04
Audio gener├ícia
$0.15
$0.60
$0.01ÔÇô0.03
Jazykov├ę koeficienty tokeniz├ície:
Jazyk
Koeficient
Pr├şklad
Slovansk├ę (cs, sk, pl, ru, uk)
2.15
1000 slov Ôëł 2150 tokenov
Angli─Źtina
1.38
1000 slov Ôëł 1380 tokenov
Ostatn├ę
1.76
Priemern├Ż odhad
V├Żstup: cost_summary.json v audiobook prie─Źinku s breakdown per f├íza a celkov├Żm s├║─Źtom.

# 13. Testovanie a kvalita

Kombinovan├Ż pr├şstup: unit testy (vitest) + manu├ílne overovanie kvality audia.
Automatizovan├ę testy:
bookChunker.test.ts ÔÇö byte limity, sentence boundaries, chapter detection, ramp-up sekvencia
hybridTagger.test.ts ÔÇö rule-based tagging accuracy, confidence calculation
Spustenie: npx vitest (z apps/backend/)
Manu├ílne testovanie:
Kompletn├Ż pipeline: import Ôćĺ dramatiz├ícia Ôćĺ TTS Ôćĺ prehr├ívanie
Audio quality check: posluch WAV (hlasov├ę priradenie, plynulos┼ą, prirodzenos┼ą)
Multi-form├ítov├ę testy: EPUB, TXT, PDF, DOCX
Jazykov├ę testy: ─Źe┼ítina, angli─Źtina, sloven─Źina, nem─Źina
API monitoring: curl na progress, status, health endpointy
Frontend: navig├ícia, progressive playback, sleep timer, speed control

# 14. Konfigur├ícia a nasadenie


## 14.1. Environment├ílne premenn├ę

Premenn├í
Popis
Default
GOOGLE_CLOUD_PROJECT
ID Google Cloud projektu
(povinn├ę)
GOOGLE_CLOUD_LOCATION
Regi├│n Vertex AI
us-central1
GOOGLE_APPLICATION_CREDENTIALS
Cesta k service account JSON
(povinn├ę)
PORT
Port backendu
3001
TTS_MODEL
Gemini TTS model
gemini-2.5-flash-tts
LLM_MODEL
Gemini LLM model
gemini-2.5-flash

## 14.2. Development pr├şkazy

# Kore┼ł monorepa:
npm run dev             # Backend (3001) + PWA (5180) s├║─Źasne
npm run dev:backend     # Len backend
npm run dev:pwa         # Len PWA
npm run build           # Production build

# Mobiln├í appka:
cd apps/mobile
npx expo start          # Expo dev server
npx expo start --tunnel # Pre cross-network pr├şstup

# Testy:
cd apps/backend
npx vitest              # Unit testy
npx vitest --watch      # Watch m├│d

# 15. Roz┼í├şrite─żnos┼ą a bud├║ce funkcie

Oblas┼ą
Aktu├ílny stav
Pl├ínovan├ę
Form├íty
12+ (EPUB, TXT, PDF, HTML, MOBI, DOCX, ODT, RTF, MD, Pages, WPS, DOC)
OCR PDF podpora
Jazyky
18 jazykov (preklad + TTS)
─Äal┼íie jazyky, jazykov├í detekcia
├Ülo┼żisko
S├║borov├Ż syst├ęm + metadata.json
Cloud storage, PostgreSQL
Autentifik├ícia
Single user (┼żiadna auth)
JWT + multi-user
Platby
┼Żiadne
Stripe/payment integr├ícia
Mobile
Z├íkladn├í funk─Źnos┼ą
Offline prehr├ívanie, download kapitol
Soundscape
Ambient + music intro (ffmpeg)
AI-generovan├ę soundscapes
Kvalita
Manual testing
E2E testy (Playwright), CI/CD

