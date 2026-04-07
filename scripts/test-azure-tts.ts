import 'dotenv/config';
import { synthesizeAzure } from '../modules/tts-lipsync/tts-azure.server';

async function main() {
  const result = await synthesizeAzure(
    'Bonjour, je suis ALIA, votre assistante de formation.',
    'fr-FR'
  );

  console.log('Audio size:', result.audioBuffer?.length ?? 0);
  console.log('Word boundaries:', result.wordBoundaries.length);
}

main().catch((error) => {
  console.error('Azure TTS test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
