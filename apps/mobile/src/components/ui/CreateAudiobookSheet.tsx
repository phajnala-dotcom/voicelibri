/**
 * CreateAudiobookSheet - Bottom sheet modal for audiobook creation
 * Triggered from Library screen FAB and Book detail "Create Audiobook" button
 * 
 * Features:
 * - File selection from backend
 * - Text paste
 * - URL import
 * - Voice selection (male/female)
 * - Target language
 * - Multi-voice toggle
 */

import React, { useState, useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, borderRadius, typography, colors } from '../../theme';
import Text from './Text';
import Button from './Button';
import { usePlayerStore, useBookStore } from '../../stores';
import {
  createFromText,
  createFromUrl,
  type BookSelectResult,
  type AvailableBook,
} from '../../services/voiceLibriApi';

// ============================================================================
// VOICE OPTIONS (matches PWA-V2 GenerateScreen)
// ============================================================================

const MALE_VOICES = [
  { alias: 'Arthur', geminiName: 'Achird' },
  { alias: 'Albert', geminiName: 'Algieba' },
  { alias: 'Alex', geminiName: 'Algenib' },
  { alias: 'Charles', geminiName: 'Charon' },
  { alias: 'Eric', geminiName: 'Enceladus' },
  { alias: 'Fero', geminiName: 'Fenrir' },
  { alias: 'Ian', geminiName: 'Iapetus' },
  { alias: 'Milan', geminiName: 'Alnilam' },
  { alias: 'Oliver', geminiName: 'Orus' },
  { alias: 'Peter', geminiName: 'Puck' },
  { alias: 'Ross', geminiName: 'Rasalgethi' },
  { alias: 'Scott', geminiName: 'Schedar' },
  { alias: 'Simon', geminiName: 'Sadaltager' },
  { alias: 'Stan', geminiName: 'Sadachbia' },
  { alias: 'Umberto', geminiName: 'Umbriel' },
  { alias: 'Zachary', geminiName: 'Zubenelgenubi' },
];

const FEMALE_VOICES = [
  { alias: 'Ada', geminiName: 'Aoede' },
  { alias: 'Ash', geminiName: 'Achernar' },
  { alias: 'Callie', geminiName: 'Callirrhoe' },
  { alias: 'Cora', geminiName: 'Kore' },
  { alias: 'Desi', geminiName: 'Despina' },
  { alias: 'Erin', geminiName: 'Erinome' },
  { alias: 'Grace', geminiName: 'Gacrux' },
  { alias: 'Laura', geminiName: 'Laomedeia' },
  { alias: 'Lea', geminiName: 'Leda' },
  { alias: 'Paula', geminiName: 'Pulcherrima' },
  { alias: 'Sue', geminiName: 'Sulafat' },
  { alias: 'Toni', geminiName: 'Autonoe' },
  { alias: 'Vinnie', geminiName: 'Vindemiatrix' },
  { alias: 'Zara', geminiName: 'Zephyr' },
];

const LANGUAGES = [
  { label: 'Original', value: 'original' },
  { label: 'English', value: 'en-US' },
  { label: 'Czech', value: 'cs-CZ' },
  { label: 'German', value: 'de-DE' },
  { label: 'Spanish', value: 'es-ES' },
  { label: 'French', value: 'fr-FR' },
  { label: 'Italian', value: 'it-IT' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean', value: 'ko-KR' },
  { label: 'Polish', value: 'pl-PL' },
  { label: 'Portuguese', value: 'pt-BR' },
  { label: 'Russian', value: 'ru-RU' },
  { label: 'Slovak', value: 'sk-SK' },
  { label: 'Ukrainian', value: 'uk-UA' },
  { label: 'Chinese', value: 'zh-CN' },
];

// ============================================================================
// TYPES
// ============================================================================

export interface CreateAudiobookSheetRef {
  open: (preselectedFile?: AvailableBook) => void;
  close: () => void;
}

interface CreateAudiobookSheetProps {
  onCreated?: (bookTitle: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const CreateAudiobookSheet = forwardRef<CreateAudiobookSheetRef, CreateAudiobookSheetProps>(
  ({ onCreated }, ref) => {
    const { theme, isDark } = useTheme();
    const router = useRouter();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const { setShowMiniPlayer, setNowPlaying } = usePlayerStore();
    const { addBook } = useBookStore();
    
    // Snap points for bottom sheet
    const snapPoints = useMemo(() => ['92%'], []);
    
    // Input state
    const [inputMode, setInputMode] = useState<'file' | 'text' | 'url'>('file');
    const [selectedFile, setSelectedFile] = useState<AvailableBook | null>(null);
    const [localFileUri, setLocalFileUri] = useState<string | null>(null);
    const [localFileName, setLocalFileName] = useState<string | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    
    // Settings state
    const [narratorGender, setNarratorGender] = useState<'female' | 'male'>('female');
    const [narratorVoice, setNarratorVoice] = useState('Ada');
    const [targetLanguage, setTargetLanguage] = useState('original');
    const [multiVoice, setMultiVoice] = useState(true);
    
    // UI state
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [showLanguagePicker, setShowLanguagePicker] = useState(false);
    
    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      open: (preselectedFile?: AvailableBook) => {
        if (preselectedFile) {
          setSelectedFile(preselectedFile);
          setInputMode('file');
        }
        bottomSheetRef.current?.expand();
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));
    
    // Get voices based on gender
    const availableVoices = narratorGender === 'female' ? FEMALE_VOICES : MALE_VOICES;
    
    // Handle gender change - reset voice to first of new gender
    const handleGenderChange = (gender: 'female' | 'male') => {
      Haptics.selectionAsync();
      setNarratorGender(gender);
      setNarratorVoice(gender === 'female' ? FEMALE_VOICES[0].alias : MALE_VOICES[0].alias);
    };
    
    // Convert voice alias to Gemini name
    const aliasToGeminiName = (alias: string): string => {
      const allVoices = [...MALE_VOICES, ...FEMALE_VOICES];
      const voice = allVoices.find(v => v.alias === alias);
      return voice?.geminiName || 'Aoede';
    };
    
    // Supported file extensions for audiobook generation
    const SUPPORTED_EXTENSIONS = ['epub', 'txt', 'md', 'markdown', 'html', 'htm', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'mobi', 'azw', 'azw3', 'kf8', 'pages', 'wps'];
    
    // MIME types that are explicitly NOT supported (audio, video, images, etc.)
    const UNSUPPORTED_MIME_PREFIXES = ['audio/', 'video/', 'image/', 'font/', 'model/'];
    
    // MIME types for supported formats (per expo-document-picker docs)
    // Only these file types will be visible in the file picker
    // NOTE: iOS may still show some files in browse mode due to UTI limitations
    const SUPPORTED_MIME_TYPES = [
      // Ebooks
      'application/epub+zip',                                              // EPUB
      'application/x-mobipocket-ebook',                                    // MOBI
      'application/vnd.amazon.ebook',                                      // AZW/KF8
      // Documents
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword',                                                // DOC
      'application/vnd.oasis.opendocument.text',                          // ODT
      'application/rtf',                                                   // RTF
      'text/rtf',                                                          // RTF alt
      'application/pdf',                                                   // PDF
      'application/vnd.apple.pages',                                       // Pages
      'application/vnd.ms-works',                                          // WPS
      // Text
      'text/plain',                                                        // TXT
      'text/markdown',                                                     // MD
      'text/x-markdown',                                                   // MD alt
      'text/html',                                                         // HTML
    ];
    
    // Check if a MIME type is explicitly unsupported
    const isUnsupportedMimeType = (mimeType: string | undefined): boolean => {
      if (!mimeType) return false;
      return UNSUPPORTED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
    };
    
    // Handle file selection from device using expo-document-picker (per official docs)
    const handleSelectFile = async () => {
      try {
        Haptics.selectionAsync();
        setIsLoadingFile(true);
        setError(null);
        
        // Use getDocumentAsync per official expo-document-picker docs
        // Only show supported file types - no */* wildcard
        // copyToCacheDirectory: true allows expo-file-system to read immediately
        const result = await DocumentPicker.getDocumentAsync({
          type: SUPPORTED_MIME_TYPES,
          copyToCacheDirectory: true,
        });
        
        if (result.canceled) {
          console.log('Document picker cancelled');
          setIsLoadingFile(false);
          return;
        }
        
        // Get the first picked asset
        const asset = result.assets[0];
        console.log('📄 Selected file:', asset.name, asset.uri, asset.mimeType);
        
        // First check: Reject explicitly unsupported MIME types (audio, video, images)
        // This catches cases where iOS UTI filtering didn't work perfectly
        if (isUnsupportedMimeType(asset.mimeType)) {
          const mimeCategory = asset.mimeType?.split('/')[0] || 'unknown';
          setError(`${mimeCategory.charAt(0).toUpperCase() + mimeCategory.slice(1)} files are not supported.\n\nVoiceLibri can only convert text-based files to audiobooks.\n\nSupported formats:\n• Ebooks: EPUB, MOBI, AZW\n• Documents: DOCX, DOC, ODT, RTF, PDF\n• Text: TXT, MD, HTML`);
          setIsLoadingFile(false);
          return;
        }
        
        // Second check: Validate file extension
        const ext = asset.name.toLowerCase().split('.').pop() || '';
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          setError(`Unsupported file type: .${ext}\n\nSupported formats:\n• Ebooks: EPUB, MOBI, AZW\n• Documents: DOCX, DOC, ODT, RTF, PDF\n• Text: TXT, MD, HTML`);
          setIsLoadingFile(false);
          return;
        }
        
        // Store file info - show filename in the text input area
        setLocalFileUri(asset.uri);
        setLocalFileName(asset.name);
        setSelectedFile(null);
        setPastedText(asset.name); // Show filename in the text input
        setUrlInput('');
        setInputMode('file');
        
        // Auto-fill title from filename (remove extension)
        const titleFromFile = asset.name.replace(/\.[^.]+$/i, '');
        setCustomTitle(titleFromFile);
        
        setIsLoadingFile(false);
      } catch (err) {
        console.error('Document picker error:', err);
        setError(err instanceof Error ? err.message : 'Failed to pick file');
        setIsLoadingFile(false);
      }
    };
    
    // Clear selected local file
    const handleClearLocalFile = () => {
      setLocalFileUri(null);
      setLocalFileName(null);
      setPastedText(''); // Clear the text input showing filename
      setCustomTitle('');
      setError(null);
      setInputMode('file');
    };
    
    // Handle text input change
    const handleTextChange = (text: string) => {
      // If a file is selected, ignore text changes (filename is shown)
      if (localFileName) return;
      
      // Check if it looks like a URL
      if (text.startsWith('http://') || text.startsWith('https://')) {
        setUrlInput(text);
        setPastedText('');
        setSelectedFile(null);
        setInputMode('url');
      } else {
        setPastedText(text);
        setUrlInput('');
        if (text) setSelectedFile(null);
        setInputMode(text ? 'text' : 'file');
      }
      setError(null);
    };
    
    // Reset form
    const resetForm = () => {
      setSelectedFile(null);
      setLocalFileUri(null);
      setLocalFileName(null);
      setPastedText('');
      setUrlInput('');
      setCustomTitle('');
      setInputMode('file');
      setIsGenerating(false);
      setProgress(0);
      setError(null);
    };
    
    // Handle create audiobook
    const handleCreate = async () => {
      if (!localFileUri && !pastedText && !urlInput) {
        setError('Please select a book from your device, paste text, or enter a URL');
        return;
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsGenerating(true);
      setError(null);
      setProgress(0);
      
      try {
        const geminiVoice = aliasToGeminiName(narratorVoice);
        let result: BookSelectResult;
        
        // Choose API based on input mode
        if (inputMode === 'text' && pastedText) {
          result = await createFromText({
            text: pastedText,
            title: customTitle || 'Pasted Text',
            detectChapters: true,
            narratorVoice: geminiVoice,
            targetLanguage,
          });
        } else if (inputMode === 'url' && urlInput) {
          result = await createFromUrl({
            url: urlInput,
            narratorVoice: geminiVoice,
            targetLanguage,
          });
        } else if (localFileUri && localFileName) {
          // Read file content using expo-file-system (per official docs)
          // For document picker results, create File from the asset object
          console.log('📖 Reading local file:', localFileName, 'from:', localFileUri);
          
          // Create File object from URI (per expo-file-system docs)
          const file = new File(localFileUri);
          
          // Check file extension to determine how to process
          const ext = localFileName.toLowerCase().split('.').pop() || '';
          
          // Define format categories
          const BINARY_FORMATS = ['epub', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'mobi', 'azw', 'azw3', 'kf8', 'pages', 'wps'];
          const TEXT_FORMATS = ['txt', 'md', 'markdown', 'html', 'htm'];
          
          const isBinaryFormat = BINARY_FORMATS.includes(ext);
          const isTextFormat = TEXT_FORMATS.includes(ext);
          
          console.log(`📄 File type: ${ext}, isBinary: ${isBinaryFormat}, isText: ${isTextFormat}`);
          
          if (!isBinaryFormat && !isTextFormat) {
            throw new Error(`Unsupported file format: .${ext}\n\nSupported formats:\n• Ebooks: EPUB, MOBI, AZW, KF8\n• Documents: DOCX, DOC, ODT, RTF, PDF\n• Text: TXT, MD, HTML`);
          }
          
          if (isBinaryFormat) {
            // For binary files (EPUB, DOCX, PDF, etc.), read as base64 and send to backend
            const base64Content = await file.base64();
            console.log(`📚 ${ext.toUpperCase()} file size (base64):`, base64Content.length);
            
            // Send as base64 to backend for processing
            result = await createFromText({
              text: base64Content,
              title: customTitle || localFileName.replace(new RegExp(`\\.${ext}$`, 'i'), ''),
              detectChapters: true,
              narratorVoice: geminiVoice,
              targetLanguage,
              isBase64File: true,          // Signal to backend this is base64 binary file
              fileExtension: ext,           // Tell backend the file type
            });
          } else {
            // For text files (TXT, MD, HTML), read as string
            const textContent = await file.text();
            console.log('📄 Text file length:', textContent.length);
            
            if (!textContent || textContent.trim().length === 0) {
              throw new Error('The selected file appears to be empty or could not be read.');
            }
            
            result = await createFromText({
              text: textContent,
              title: customTitle || localFileName.replace(/\.[^.]+$/i, ''),
              detectChapters: true,
              narratorVoice: geminiVoice,
              targetLanguage,
              fileExtension: ext,           // Tell backend the file type for proper processing
            });
          }
        } else {
          throw new Error('No valid input provided');
        }
        
        const bookTitle = result.audiobookTitle || result.title;
        
        // NOTE: createFromText/createFromUrl already triggers background dramatization and TTS
        // generation via loadBookFile(). No need to call generateAudiobook separately.
        // The backend will automatically process the book and generate audio.
        console.log(`✅ Book loaded and generation started: ${bookTitle}`);
        
        // Create book object for library
        const hasChapters = result.chapters && result.chapters.length > 0;
        const book = {
          id: bookTitle,
          title: result.title,
          author: result.author || 'Unknown Author',
          coverUrl: null,
          totalDuration: result._internal?.durationSeconds || 0,
          chapters: hasChapters ? result.chapters!.map((ch, i) => ({
            id: `ch-${i}`,
            title: ch.title,
            index: i,
            duration: 0,
            url: '',
          })) : [{
            id: 'ch-0',
            title: 'Full Text',
            index: 0,
            duration: 0,
            url: '',
          }],
          isGenerated: false,
          generationProgress: 0,
        };
        
        // Add to library
        addBook(book);
        
        // Close sheet - don't try to play yet since generation just started
        bottomSheetRef.current?.close();
        resetForm();
        setIsGenerating(false);
        onCreated?.(bookTitle);
        
        // Notify user
        console.log(`✅ Audiobook "${bookTitle}" generation started!`);
      } catch (err) {
        console.error('Generation error:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate audiobook');
        setIsGenerating(false);
      }
    };
    
    // Render backdrop
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      []
    );
    
    // Styles
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: theme.colors.card,
      },
      header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      title: {
        fontSize: typography['2xl'],
        fontWeight: typography.bold,
        color: theme.colors.text,
      },
      closeButton: {
        padding: spacing.xs,
      },
      content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
      },
      section: {
        marginTop: spacing.lg,
      },
      sectionTitle: {
        fontSize: typography.sm,
        fontWeight: typography.semibold,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
      },
      card: {
        backgroundColor: theme.colors.cardElevated,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
      },
      inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      },
      textInput: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: typography.base,
        color: theme.colors.text,
        minHeight: 48,
      },
      uploadButton: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.lg,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      },
      selectedFile: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
        gap: spacing.sm,
      },
      selectedFileName: {
        flex: 1,
        fontSize: typography.sm,
        color: theme.colors.text,
      },
      clearButton: {
        padding: spacing.xs,
      },
      settingsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      settingsLabel: {
        fontSize: typography.base,
        color: theme.colors.text,
      },
      settingsValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      },
      settingsValueText: {
        fontSize: typography.base,
        color: theme.colors.textSecondary,
      },
      genderToggle: {
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        padding: 2,
      },
      genderButton: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
      },
      genderButtonActive: {
        backgroundColor: theme.colors.primary,
      },
      genderText: {
        fontSize: typography.sm,
        color: theme.colors.textMuted,
      },
      genderTextActive: {
        color: '#fff',
        fontWeight: typography.medium,
      },
      toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
      },
      toggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        padding: 2,
        justifyContent: 'center',
      },
      toggleOff: {
        backgroundColor: theme.colors.border,
      },
      toggleOn: {
        backgroundColor: theme.colors.primary,
      },
      toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
      },
      toggleKnobOn: {
        alignSelf: 'flex-end',
      },
      error: {
        backgroundColor: colors.error + '20',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
      },
      errorText: {
        flex: 1,
        fontSize: typography.sm,
        color: colors.error,
      },
      createButton: {
        marginTop: spacing.xl,
        marginBottom: spacing['2xl'],
      },
      progressContainer: {
        alignItems: 'center',
        padding: spacing.xl,
      },
      progressText: {
        fontSize: typography.base,
        color: theme.colors.textSecondary,
        marginTop: spacing.md,
      },
      // Picker modal styles
      pickerOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
      },
      pickerContent: {
        backgroundColor: theme.colors.card,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        maxHeight: Dimensions.get('window').height * 0.5,
      },
      pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      pickerTitle: {
        fontSize: typography.lg,
        fontWeight: typography.semibold,
        color: theme.colors.text,
      },
      pickerList: {
        padding: spacing.md,
      },
      pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.xs,
      },
      pickerItemSelected: {
        backgroundColor: theme.colors.primary + '20',
      },
      pickerItemText: {
        flex: 1,
        fontSize: typography.base,
        color: theme.colors.text,
      },
      pickerItemTextSelected: {
        color: theme.colors.primary,
        fontWeight: typography.medium,
      },
    });
    
    // Voice picker
    const renderVoicePicker = () => (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Voice</Text>
            <TouchableOpacity onPress={() => setShowVoicePicker(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {availableVoices.map((voice) => (
              <TouchableOpacity
                key={voice.alias}
                style={[
                  styles.pickerItem,
                  narratorVoice === voice.alias && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setNarratorVoice(voice.alias);
                  setShowVoicePicker(false);
                }}
              >
                <Ionicons
                  name="mic"
                  size={20}
                  color={theme.colors.textSecondary}
                  style={{ marginRight: spacing.sm }}
                />
                <Text
                  style={[
                    styles.pickerItemText,
                    narratorVoice === voice.alias && styles.pickerItemTextSelected,
                  ]}
                >
                  {voice.alias}
                </Text>
                {narratorVoice === voice.alias && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
    
    // Language picker
    const renderLanguagePicker = () => (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Target Language</Text>
            <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.value}
                style={[
                  styles.pickerItem,
                  targetLanguage === lang.value && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTargetLanguage(lang.value);
                  setShowLanguagePicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    targetLanguage === lang.value && styles.pickerItemTextSelected,
                  ]}
                >
                  {lang.label}
                </Text>
                {targetLanguage === lang.value && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
    
    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.card }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.textMuted }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Audiobook</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => bottomSheetRef.current?.close()}
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          
          <BottomSheetScrollView contentContainerStyle={styles.content}>
            {/* Error message */}
            {error && (
              <View style={styles.error}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Ionicons name="close" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Input Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Source</Text>
              <View style={styles.card}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Paste text or URL..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={pastedText || urlInput}
                    onChangeText={handleTextChange}
                    multiline
                    editable={!localFileName} // Disable editing when file is selected
                  />
                  {localFileName ? (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleClearLocalFile}
                    >
                      <Ionicons name="close" size={22} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleSelectFile}
                    >
                      <Ionicons name="folder-open" size={22} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
            
            {/* Settings Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Settings</Text>
              <View style={styles.card}>
                {/* Target Language */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setShowLanguagePicker(true)}
                >
                  <Text style={styles.settingsLabel}>Target Language</Text>
                  <View style={styles.settingsValue}>
                    <Text style={styles.settingsValueText}>
                      {LANGUAGES.find(l => l.value === targetLanguage)?.label || 'Original'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
                
                {/* Narrator Gender */}
                <View style={styles.settingsRow}>
                  <Text style={styles.settingsLabel}>Narrator Gender</Text>
                  <View style={styles.genderToggle}>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        narratorGender === 'female' && styles.genderButtonActive,
                      ]}
                      onPress={() => handleGenderChange('female')}
                    >
                      <Text
                        style={[
                          styles.genderText,
                          narratorGender === 'female' && styles.genderTextActive,
                        ]}
                      >
                        Female
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        narratorGender === 'male' && styles.genderButtonActive,
                      ]}
                      onPress={() => handleGenderChange('male')}
                    >
                      <Text
                        style={[
                          styles.genderText,
                          narratorGender === 'male' && styles.genderTextActive,
                        ]}
                      >
                        Male
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Narrator Voice */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setShowVoicePicker(true)}
                >
                  <Text style={styles.settingsLabel}>Narrator Voice</Text>
                  <View style={styles.settingsValue}>
                    <Text style={styles.settingsValueText}>{narratorVoice}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
                
                {/* Multi-voice Toggle */}
                <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.settingsLabel}>Multi-voice Dramatization</Text>
                  <TouchableOpacity
                    style={[styles.toggle, multiVoice ? styles.toggleOn : styles.toggleOff]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMultiVoice(!multiVoice);
                    }}
                  >
                    <View style={[styles.toggleKnob, multiVoice && styles.toggleKnobOn]} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            {/* Create Button or Progress */}
            {isGenerating ? (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.progressText}>
                  Creating audiobook... {progress > 0 ? `${progress}%` : ''}
                </Text>
              </View>
            ) : (
              <Button
                title="Create Audiobook"
                onPress={handleCreate}
                disabled={!localFileUri && !pastedText && !urlInput}
                icon={<Ionicons name="sparkles" size={20} color="#fff" />}
                style={styles.createButton}
              />
            )}
          </BottomSheetScrollView>
          
          {/* Pickers */}
          {showVoicePicker && renderVoicePicker()}
          {showLanguagePicker && renderLanguagePicker()}
        </View>
      </BottomSheet>
    );
  }
);

CreateAudiobookSheet.displayName = 'CreateAudiobookSheet';

export default CreateAudiobookSheet;
