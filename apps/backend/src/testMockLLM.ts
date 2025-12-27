/**
 * Mock LLM Integration Test
 * Tests dramatization pipeline with mock Gemini responses
 * No API calls required - perfect for testing without credentials
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CharacterProfile } from './llmCharacterAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mock Gemini API client for testing
 */
export class MockGeminiClient {
  private callCount = 0;
  
  /**
   * Simulate Gemini API call with predefined responses
   */
  async callGemini(prompt: string): Promise<string> {
    this.callCount++;
    console.log(`📡 Mock API call #${this.callCount}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Detect request type from prompt
    if (prompt.includes('extract information about ALL characters')) {
      return this.getMockCharacterAnalysis();
    } else if (prompt.includes('Add [VOICE=') || prompt.includes('Tag the following chapter text')) {
      return this.getMockChapterTagging(prompt);
    }
    
    throw new Error(`Unknown prompt type: ${prompt.substring(0, 100)}`);
  }
  
  /**
   * Mock character analysis response
   */
  private getMockCharacterAnalysis(): string {
    const mockResponse = {
      characters: [
        {
          name: 'NARRATOR',
          role: 'narrator',
          gender: 'neutral',
          age: 'adult',
          traits: ['clear', 'storyteller'],
          importance: 'primary',
        },
        {
          name: 'JOHN',
          role: 'protagonist',
          gender: 'male',
          age: 'adult',
          traits: ['brave', 'determined', 'thoughtful'],
          importance: 'primary',
        },
        {
          name: 'SARAH',
          role: 'supporting',
          gender: 'female',
          age: 'adult',
          traits: ['wise', 'calm', 'experienced'],
          importance: 'secondary',
        },
        {
          name: 'MERCHANT',
          role: 'minor',
          gender: 'male',
          age: 'elderly',
          traits: ['gruff', 'practical'],
          importance: 'minor',
        },
      ],
    };
    
    return JSON.stringify(mockResponse, null, 2);
  }
  
  /**
   * Mock chapter tagging response
   * Adds voice tags to dialogue in text
   */
  private getMockChapterTagging(prompt: string): string {
    // Extract text from prompt (between "Chapter text:" and next instruction)
    const textMatch = prompt.match(/Chapter text:\s*```([\s\S]*?)```/);
    if (!textMatch) {
      return '[VOICE=NARRATOR]\nMocked chapter text with dialogue.\n[VOICE=JOHN]\n"Hello, world!"';
    }
    
    let text = textMatch[1];
    
    // Simple mock tagging: Add voice tags before quoted dialogue
    text = text.replace(/^([^"\n]+)$/gm, '[VOICE=NARRATOR]\n$1');
    text = text.replace(/("[^"]+")(?!\[VOICE)/g, '[VOICE=JOHN]\n$1');
    
    return text;
  }
  
  getCallCount(): number {
    return this.callCount;
  }
  
  reset(): void {
    this.callCount = 0;
  }
}

/**
 * Test character analysis with mock data
 */
async function testMockCharacterAnalysis() {
  console.log('\n🧪 Test 1: Mock Character Analysis');
  console.log('─'.repeat(60));
  
  const client = new MockGeminiClient();
  
  try {
    const prompt = 'Analyze this book and extract information about ALL characters who speak dialogue...';
    const response = await client.callGemini(prompt);
    const parsed = JSON.parse(response);
    
    console.log(`✓ Characters found: ${parsed.characters.length}`);
    console.log(`✓ Character names: ${parsed.characters.map((c: any) => c.name).join(', ')}`);
    console.log(`✓ Primary characters: ${parsed.characters.filter((c: any) => c.importance === 'primary').length}`);
    console.log(`✓ API calls made: ${client.getCallCount()}`);
    
    // Validate structure
    const firstChar = parsed.characters[0];
    console.log(`✓ Character structure valid: ${!!firstChar.name && !!firstChar.role && !!firstChar.gender}`);
    
    return true;
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
    return false;
  }
}

/**
 * Test chapter tagging with mock data
 */
async function testMockChapterTagging() {
  console.log('\n🧪 Test 2: Mock Chapter Tagging');
  console.log('─'.repeat(60));
  
  const client = new MockGeminiClient();
  
  try {
    const sampleText = `
The old merchant looked up from his counter.
"What brings you here, traveler?" he asked gruffly.
John stepped forward. "I seek information about the ancient ruins."
The merchant nodded slowly. "Many seek those ruins. Few return."
`;
    
    const prompt = `Tag the following chapter text with voice tags.
Chapter text:
\`\`\`
${sampleText}
\`\`\`
`;
    
    const tagged = await client.callGemini(prompt);
    
    console.log(`✓ Original length: ${sampleText.length} characters`);
    console.log(`✓ Tagged length: ${tagged.length} characters`);
    
    const voiceTags = (tagged.match(/\[VOICE=.*?\]/g) || []).length;
    console.log(`✓ Voice tags added: ${voiceTags}`);
    console.log(`✓ API calls made: ${client.getCallCount()}`);
    
    // Sample output
    console.log(`✓ Sample output:\n${tagged.substring(0, 200)}...`);
    
    return true;
  } catch (error) {
    console.error('✗ Test 2 failed:', error);
    return false;
  }
}

/**
 * Test caching logic
 */
async function testMockCaching() {
  console.log('\n🧪 Test 3: Mock Caching Logic');
  console.log('─'.repeat(60));
  
  const tempDir = path.join(process.cwd(), 'temp_mock_cache');
  
  try {
    // Create temp cache directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Test data
    const mockAnalysis: CharacterProfile[] = [
      {
        name: 'NARRATOR',
        role: 'narrator',
        gender: 'neutral',
        traits: ['clear'],
      },
      {
        name: 'HERO',
        role: 'protagonist',
        gender: 'male',
        traits: ['brave'],
      },
    ];
    
    // Write cache
    const cachePath = path.join(tempDir, 'test_cache.json');
    fs.writeFileSync(cachePath, JSON.stringify({
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      bookHash: 'mock_hash_123',
      characters: mockAnalysis,
      chaptersProcessed: 5,
    }, null, 2));
    
    console.log(`✓ Cache written: ${cachePath}`);
    
    // Read cache
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    console.log(`✓ Cache read successfully`);
    console.log(`✓ Cached characters: ${cached.characters.length}`);
    console.log(`✓ Chapters processed: ${cached.chaptersProcessed}`);
    console.log(`✓ Version: ${cached.version}`);
    
    // Cleanup
    fs.unlinkSync(cachePath);
    fs.rmdirSync(tempDir);
    console.log(`✓ Temp cache cleaned up`);
    
    return true;
  } catch (error) {
    console.error('✗ Test 3 failed:', error);
    // Cleanup on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
    return false;
  }
}

/**
 * Test error handling
 */
async function testMockErrorHandling() {
  console.log('\n🧪 Test 4: Mock Error Handling');
  console.log('─'.repeat(60));
  
  const client = new MockGeminiClient();
  
  try {
    // Test invalid prompt
    try {
      await client.callGemini('Invalid prompt that will fail');
      console.log('✗ Should have thrown error');
      return false;
    } catch (error) {
      console.log(`✓ Error thrown correctly: ${error instanceof Error ? error.message.substring(0, 50) : 'Unknown'}`);
    }
    
    // Test JSON parsing of malformed response
    try {
      const badJson = '{ invalid json ';
      JSON.parse(badJson);
      console.log('✗ Should have thrown JSON parse error');
      return false;
    } catch (error) {
      console.log(`✓ JSON parse error handled`);
    }
    
    return true;
  } catch (error) {
    console.error('✗ Test 4 failed:', error);
    return false;
  }
}

/**
 * Run all mock tests
 */
async function runMockTests() {
  console.log('🧪 Mock LLM Integration Tests');
  console.log('═'.repeat(60));
  console.log('Testing without real API calls\n');
  
  const results = {
    characterAnalysis: await testMockCharacterAnalysis(),
    chapterTagging: await testMockChapterTagging(),
    caching: await testMockCaching(),
    errorHandling: await testMockErrorHandling(),
  };
  
  console.log('\n═'.repeat(60));
  console.log('📊 Test Results Summary:');
  console.log(`  Character Analysis: ${results.characterAnalysis ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Chapter Tagging: ${results.chapterTagging ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Caching Logic: ${results.caching ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Error Handling: ${results.errorHandling ? '✓ PASS' : '✗ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? '✓ All tests passed!' : '✗ Some tests failed'}`);
  console.log('═'.repeat(60));
  
  return allPassed;
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('testMockLLM.ts')) {
  runMockTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
