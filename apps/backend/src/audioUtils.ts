/**
 * Audio utilities for WAV file manipulation
 */

/**
 * Concatenates multiple WAV buffers into a single WAV buffer
 * All input WAVs must have the same sample rate, channels, and bit depth
 * 
 * @param wavBuffers - Array of WAV file buffers to concatenate
 * @returns Single concatenated WAV buffer
 */
export function concatenateWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) {
    throw new Error('No WAV buffers to concatenate');
  }
  
  if (wavBuffers.length === 1) {
    return wavBuffers[0];
  }
  
  // Extract PCM data from each WAV (skip 44-byte header)
  const pcmChunks: Buffer[] = [];
  let totalPcmSize = 0;
  
  for (const wav of wavBuffers) {
    const pcm = wav.slice(44); // Skip WAV header (44 bytes)
    pcmChunks.push(pcm);
    totalPcmSize += pcm.length;
  }
  
  // Use first WAV's header as template
  const firstWav = wavBuffers[0];
  const header = Buffer.from(firstWav.slice(0, 44));
  
  // Update file size in header (ChunkSize at offset 4)
  const newFileSize = 36 + totalPcmSize; // 36 = header size - 8
  header.writeUInt32LE(newFileSize, 4);
  
  // Update data chunk size (Subchunk2Size at offset 40)
  header.writeUInt32LE(totalPcmSize, 40);
  
  // Concatenate: header + all PCM data
  const result = Buffer.concat([header, ...pcmChunks]);
  
  return result;
}

/**
 * Adds silence (zeros) to WAV buffer
 * 
 * @param wavBuffer - Original WAV buffer
 * @param silenceDurationMs - Duration of silence to add in milliseconds
 * @param position - Where to add silence: 'start', 'end'
 * @returns WAV buffer with added silence
 */
export function addSilence(
  wavBuffer: Buffer,
  silenceDurationMs: number,
  position: 'start' | 'end' = 'end'
): Buffer {
  // Assume 24000 Hz, 16-bit, mono (Gemini TTS defaults)
  const sampleRate = 24000;
  const bytesPerSample = 2; // 16-bit
  const channels = 1; // Mono
  
  const silenceSamples = Math.floor((silenceDurationMs / 1000) * sampleRate);
  const silenceBytes = silenceSamples * bytesPerSample * channels;
  const silenceBuffer = Buffer.alloc(silenceBytes, 0); // Zeros = silence
  
  const header = wavBuffer.slice(0, 44);
  const pcmData = wavBuffer.slice(44);
  
  const newPcmData = position === 'start' 
    ? Buffer.concat([silenceBuffer, pcmData])
    : Buffer.concat([pcmData, silenceBuffer]);
  
  // Update header sizes
  const newFileSize = 36 + newPcmData.length;
  header.writeUInt32LE(newFileSize, 4);
  header.writeUInt32LE(newPcmData.length, 40);
  
  return Buffer.concat([header, newPcmData]);
}
