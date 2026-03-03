/**
 * Test Route: Audio2Face API Integration
 * 
 * Test the NVIDIA Audio2Face integration and verify it's working correctly.
 * 
 * Usage:
 *   GET /api/test.audio2face
 * 
 * Returns:
 *   - API status and error messages
 *   - Sample blendshape frames
 *   - Animation duration
 */

import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';
import { generateLipSync } from '~/lib/nvidia-nim.server';

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Create a minimal WAV buffer (1 second of silence)
    const WAV_HEADER = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0xf0, 0x00, 0x00, // File size - 1 (61476 bytes for ~1s @ 16kHz)
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16)
      0x01, 0x00, // AudioFormat (1 = PCM)
      0x01, 0x00, // NumChannels (1 = mono)
      0x80, 0x3e, 0x00, 0x00, // SampleRate (16000 Hz)
      0x00, 0x7d, 0x00, 0x00, // ByteRate (sample_rate * num_channels * bytes_per_sample)
      0x02, 0x00, // BlockAlign (num_channels * bytes_per_sample)
      0x10, 0x00, // BitsPerSample (16)
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0xf0, 0x00, 0x00, // Subchunk2Size (61440 bytes)
    ]);

    // Create audio data: header + silence
    const audioData = Buffer.concat([
      WAV_HEADER,
      Buffer.alloc(61440), // Silence padding
    ]);

    console.log('🧪 Testing Audio2Face API...');
    console.log(`   Audio buffer: ${(audioData.length / 1024).toFixed(1)}KB`);

    const blendshapes = await generateLipSync(audioData);

    console.log(`✅ Audio2Face test successful: ${blendshapes.length} frames`);

    return json(
      {
        status: '✅ API Working',
        message: 'Audio2Face API is responding correctly',
        frames: blendshapes.length,
        duration: blendshapes[blendshapes.length - 1]?.timestamp ?? 0,
        durationSeconds: (
          (blendshapes[blendshapes.length - 1]?.timestamp ?? 0) / 1000
        ).toFixed(2),
        sample: blendshapes.slice(0, 5), // First 5 frames
        lastFrame: blendshapes[blendshapes.length - 1],
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('❌ Audio2Face test failed:', errorMessage);

    return json(
      {
        status: '⚠️ API Test Failed',
        message: 'See error details below',
        error: errorMessage,
        timestamp: new Date().toISOString(),
        hints: [
          'Check NVIDIA_API_KEY is set in .env',
          'Verify API key is valid at https://build.nvidia.com',
          'Check network connectivity',
          'API URL: https://health.api.nvidia.com/v1/nvidia/audio2face-3d',
        ],
      },
      { status: 500 }
    );
  }
};
