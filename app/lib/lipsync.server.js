/**
 * Shared LipSync pipeline helpers for the WebSocket gateway.
 * Uses NVIDIA Audio2Face-3D with deterministic mock fallback.
 */

const DEFAULT_AUDIO2FACE_URL =
  'https://health.api.nvidia.com/v1/nvidia/audio2face-3d';

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

function normaliseBlendshapes(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = clamp(Number(v) || 0);
  return out;
}

function normBlendshapeName(name) {
  if (!name) return name;
  if (/^[a-z]/.test(name)) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function parseA2FResponse(data) {
  if (!data) return null;
  const raw = data.blendshapes ?? data.animation?.blendshapes ?? data.frames;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const first = raw[0];

  if (first.values && Array.isArray(first.values) && first.labels) {
    return raw.map((frame) => ({
      timestamp: Math.round((frame.time_stamp ?? frame.timeStamp ?? 0) * 1000),
      blendshapes: normaliseBlendshapes(
        Object.fromEntries(
          frame.labels.map((lbl, i) => [normBlendshapeName(lbl), frame.values[i]])
        )
      ),
    }));
  }

  if (first.name !== undefined && first.value !== undefined) {
    const frameMap = {};
    for (const bs of raw) {
      const rawT = bs.timestamp ?? bs.time_stamp ?? 0;
      const t = Math.round(rawT < 100 ? rawT * 1000 : rawT);
      if (!frameMap[t]) frameMap[t] = { timestamp: t, blendshapes: {} };
      frameMap[t].blendshapes[normBlendshapeName(bs.name)] = bs.value;
    }
    return Object.values(frameMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((f) => ({ ...f, blendshapes: normaliseBlendshapes(f.blendshapes) }));
  }

  if (first.blendshapes || first.shapes) {
    return raw.map((f, i) => ({
      timestamp: f.timestamp ?? f.time ?? i * 33,
      blendshapes: normaliseBlendshapes(
        Object.fromEntries(
          Object.entries(f.blendshapes ?? f.shapes ?? {}).map(([k, v]) => [normBlendshapeName(k), v])
        )
      ),
    }));
  }

  return null;
}

export function buildVisemeTimeline(frames) {
  const visemes = [];
  const vtimes = [];
  const vdurations = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const next = frames[i + 1] ?? frame;

    let winner = 'sil';
    let winnerVal = 0;
    for (const [k, v] of Object.entries(frame.blendshapes)) {
      if (k.startsWith('viseme_') && v > winnerVal) {
        winner = k.replace('viseme_', '') || 'sil';
        winnerVal = v;
      }
    }

    visemes.push(winner);
    vtimes.push(frame.timestamp);
    vdurations.push(Math.max(1, next.timestamp - frame.timestamp));
  }

  return { visemes, vtimes, vdurations };
}

export function generateMockBlendshapes(audioBase64, durationSec) {
  const rawBytes = (audioBase64.length * 3) / 4;
  const estimatedMs = (rawBytes / (16000 * 2)) * 1000;
  const durationMs = Math.max(
    1200,
    Math.round(
      (typeof durationSec === 'number' && Number.isFinite(durationSec)
        ? durationSec * 1000
        : estimatedMs)
    )
  );
  const frames = [];

  const PHONEMES = [
    { jaw: 0.65, funnel: 0.1, smile: 0.18, pucker: 0.0, stretch: 0.1, cheekSq: 0.08, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.05, tongueOut: 0.0 },
    { jaw: 0.18, funnel: 0.0, smile: 0.5, pucker: 0.0, stretch: 0.3, cheekSq: 0.15, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.45, funnel: 0.5, smile: 0.0, pucker: 0.12, stretch: 0.0, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.08, tongueOut: 0.0 },
    { jaw: 0.1, funnel: 0.65, smile: 0.0, pucker: 0.45, stretch: 0.0, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.05, close: 0.0, press: 0.0, shrugLo: 0.1, tongueOut: 0.0 },
    { jaw: 0.35, funnel: 0.12, smile: 0.25, pucker: 0.0, stretch: 0.08, cheekSq: 0.05, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.06, funnel: 0.18, smile: 0.08, pucker: 0.0, stretch: 0.0, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.15, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.12, funnel: 0.04, smile: 0.1, pucker: 0.0, stretch: 0.05, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.12 },
    { jaw: 0.02, funnel: 0.0, smile: 0.15, pucker: 0.0, stretch: 0.0, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.08, close: 0.6, press: 0.5, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.08, funnel: 0.0, smile: 0.2, pucker: 0.0, stretch: 0.2, cheekSq: 0.1, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.3, funnel: 0.05, smile: 0.1, pucker: 0.0, stretch: 0.0, cheekSq: 0.12, noseSnr: 0.08, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.06, tongueOut: 0.0 },
    { jaw: 0.05, funnel: 0.0, smile: 0.12, pucker: 0.0, stretch: 0.0, cheekSq: 0.0, noseSnr: 0.1, rollLo: 0.0, close: 0.4, press: 0.25, shrugLo: 0.0, tongueOut: 0.0 },
    { jaw: 0.2, funnel: 0.0, smile: 0.15, pucker: 0.0, stretch: 0.12, cheekSq: 0.0, noseSnr: 0.0, rollLo: 0.0, close: 0.0, press: 0.0, shrugLo: 0.0, tongueOut: 0.06 },
  ];

  let seed = audioBase64.length;
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed & 0x7fffffff) / 0x7fffffff;
  }

  const syllables = [];
  let cursor = 60 + rand() * 80;
  let syllableIndex = 0;
  while (cursor < durationMs - 120) {
    const stress = 0.3 + rand() * 0.7;
    const dur = 100 + stress * 160 + rand() * 80;
    const phoneme = PHONEMES[Math.floor(rand() * PHONEMES.length)];
    syllables.push({ start: cursor, duration: dur, stress, peak: 0.35 + stress * 0.5, phoneme, index: syllableIndex++ });
    const isWordBound = rand() < 0.22;
    const isPhraseBreak = rand() < 0.06;
    if (isPhraseBreak) {
      cursor += dur + 350 + rand() * 300;
    } else if (isWordBound) {
      cursor += dur + 180 + rand() * 250;
    } else {
      cursor += dur + 25 + rand() * 50;
    }
  }

  const breathCycle = 3200 + rand() * 1000;
  const breathPhase = rand() * Math.PI * 2;

  for (let ts = 0; ts < durationMs; ts += 20) {
    let envelope = 0;
    let ph = null;
    let nextPh = null;
    let coarticulationT = 0;

    for (let si = 0; si < syllables.length; si++) {
      const syl = syllables[si];
      const rel = ts - syl.start;
      if (rel < 0 || rel > syl.duration) continue;
      const atkEnd = syl.duration * 0.15;
      const relStart = syl.duration * 0.7;
      let env;
      if (rel < atkEnd) env = rel / atkEnd;
      else if (rel < relStart) env = 1.0;
      else env = 1.0 - (rel - relStart) / (syl.duration - relStart);
      env *= syl.peak;
      if (env > envelope) {
        envelope = env;
        ph = syl.phoneme;
        if (si + 1 < syllables.length && rel > relStart) {
          nextPh = syllables[si + 1].phoneme;
          coarticulationT = ((rel - relStart) / (syl.duration - relStart)) * 0.35;
        }
      }
    }

    if (!ph) {
      ph = { jaw: 0, funnel: 0, smile: 0, pucker: 0, stretch: 0, cheekSq: 0, noseSnr: 0, rollLo: 0, close: 0, press: 0, shrugLo: 0, tongueOut: 0 };
    }

    if (nextPh && coarticulationT > 0) {
      const ct = coarticulationT;
      ph = {
        jaw: ph.jaw * (1 - ct) + nextPh.jaw * ct,
        funnel: ph.funnel * (1 - ct) + nextPh.funnel * ct,
        smile: ph.smile * (1 - ct) + nextPh.smile * ct,
        pucker: ph.pucker * (1 - ct) + nextPh.pucker * ct,
        stretch: ph.stretch * (1 - ct) + nextPh.stretch * ct,
        cheekSq: ph.cheekSq * (1 - ct) + nextPh.cheekSq * ct,
        noseSnr: ph.noseSnr * (1 - ct) + nextPh.noseSnr * ct,
        rollLo: ph.rollLo * (1 - ct) + nextPh.rollLo * ct,
        close: ph.close * (1 - ct) + nextPh.close * ct,
        press: ph.press * (1 - ct) + nextPh.press * ct,
        shrugLo: ph.shrugLo * (1 - ct) + nextPh.shrugLo * ct,
        tongueOut: ph.tongueOut * (1 - ct) + nextPh.tongueOut * ct,
      };
    }

    const n1 = Math.sin(ts * 0.0137) * 0.02;
    const n2 = Math.sin(ts * 0.0071 + 1.7) * 0.015;
    const n3 = Math.sin(ts * 0.0193 + 0.8) * 0.01;
    const asym = 0.94 + Math.sin(ts * 0.0031) * 0.06;
    const breathVal = Math.sin((ts / breathCycle) * Math.PI * 2 + breathPhase);
    const breathJaw = (breathVal * 0.5 + 0.5) * 0.02;
    const breathNose = (breathVal * 0.5 + 0.5) * 0.03;

    const jaw = ph.jaw * envelope + n1 + breathJaw;
    const funnel = ph.funnel * envelope;
    const smile = ph.smile * envelope + n2;
    const pucker = ph.pucker * envelope;
    const stretch = ph.stretch * envelope;
    const cheekSq = ph.cheekSq * envelope + (envelope > 0.3 ? 0.04 : 0);
    const noseSnr = ph.noseSnr * envelope + breathNose * (1 - envelope);
    const rollLo = ph.rollLo * envelope;
    const mClose = ph.close * envelope;
    const press = ph.press * envelope;
    const shrugLo = ph.shrugLo * envelope;
    const tongueOut = ph.tongueOut * envelope;
    const browUp = envelope > 0.5 ? (envelope - 0.5) * 0.12 : 0;
    const browMicro = Math.sin(ts * 0.0043 + 2.1) * 0.015;
    const eyeSq = envelope > 0.3 ? (envelope - 0.3) * 0.08 : 0;

    frames.push({
      timestamp: Math.round(ts),
      blendshapes: {
        jawOpen: clamp(jaw),
        mouthLowerDownLeft: clamp(jaw * 0.8 * asym),
        mouthLowerDownRight: clamp(jaw * 0.8 / asym),
        mouthUpperUpLeft: clamp(jaw * 0.4 * asym),
        mouthUpperUpRight: clamp(jaw * 0.4 / asym),
        mouthSmileLeft: clamp(smile * asym),
        mouthSmileRight: clamp(smile / asym),
        mouthFunnel: clamp(funnel),
        mouthPucker: clamp(pucker),
        mouthStretchLeft: clamp(stretch * asym),
        mouthStretchRight: clamp(stretch / asym),
        mouthRollLower: clamp(rollLo),
        mouthRollUpper: clamp(rollLo * 0.3),
        mouthClose: clamp(mClose),
        mouthPressLeft: clamp(press * asym),
        mouthPressRight: clamp(press / asym),
        mouthShrugLower: clamp(shrugLo),
        mouthShrugUpper: clamp(shrugLo * 0.4),
        mouthFrownLeft: clamp((1 - envelope) * 0.03),
        mouthFrownRight: clamp((1 - envelope) * 0.03),
        tongueOut: clamp(tongueOut),
        cheekSquintLeft: clamp(cheekSq * asym),
        cheekSquintRight: clamp(cheekSq / asym),
        noseSneerLeft: clamp(noseSnr * asym),
        noseSneerRight: clamp(noseSnr / asym),
        eyeSquintLeft: clamp(eyeSq),
        eyeSquintRight: clamp(eyeSq),
        browInnerUp: clamp(browUp + browMicro),
        browOuterUpLeft: clamp(browUp * 0.6 + browMicro * 0.4 + n3),
        browOuterUpRight: clamp(browUp * 0.6 + browMicro * 0.4 - n3),
        viseme_aa: clamp(jaw > 0.3 ? envelope * 0.6 : 0),
        viseme_O: clamp(funnel > 0.2 ? envelope * 0.5 : 0),
        viseme_FF: clamp(jaw < 0.1 && envelope > 0.2 ? envelope * 0.3 : 0),
        viseme_SS: clamp(jaw < 0.12 && stretch > 0.1 ? envelope * 0.25 : 0),
        viseme_PP: clamp(mClose > 0.3 ? envelope * 0.4 : 0),
        viseme_TH: clamp(tongueOut > 0.05 ? envelope * 0.3 : 0),
      },
    });
  }

  return frames;
}

/** @deprecated Audio2Face removed. Use wordBoundariesToVisemes() for Azure TTS. */
export async function runLipSync(audioBase64, language = 'en-US', options = {}) {
  const nvidiaApiKey = options.nvidiaApiKey || process.env.NVIDIA_API_KEY || '';
  const audio2faceUrl = options.audio2faceUrl || DEFAULT_AUDIO2FACE_URL;

  if (nvidiaApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(audio2faceUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nvidiaApiKey}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          audio: audioBase64,
          fps: 30,
          emotion_strength: 0.5,
          face_mask_level: 0,
          face_mask_softness: 0.01,
          preferred_emotion: 'neutral',
          language,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.warn(`⚠️ A2F API ${resp.status}: ${errText.substring(0, 200)}`);
      } else {
        const data = await resp.json();
        const frames = parseA2FResponse(data);
        if (frames && frames.length > 0) {
          const jawVals = frames.map((f) => f.blendshapes.jawOpen ?? 0);
          console.log(
            `  ✅ NVIDIA A2F: ${frames.length} frames, jawOpen=[${Math.min(...jawVals).toFixed(3)}..${Math.max(...jawVals).toFixed(3)}]`
          );
          return { frames, isMock: false };
        }
        console.warn('⚠️ A2F returned empty/unparseable response:', JSON.stringify(data).substring(0, 300));
      }
    } catch (err) {
      console.warn('⚠️ Audio2Face error:', err.message);
    }
  }

  return { frames: generateMockBlendshapes(audioBase64), isMock: true };
}

const CHAR_TO_VISEME_BASE = {
  // Silence
  ' ': 'viseme_sil', ',': 'viseme_sil', '.': 'viseme_sil',
  '!': 'viseme_sil', '?': 'viseme_sil', '\n': 'viseme_sil',
  // Bilabials
  'p': 'viseme_PP', 'b': 'viseme_PP', 'm': 'viseme_PP',
  // Labiodentals
  'f': 'viseme_FF', 'v': 'viseme_FF',
  // Dental fricatives
  't': 'viseme_TH', 'd': 'viseme_TH',
  // Sibilants
  's': 'viseme_SS', 'z': 'viseme_SS',
  // Alveolar nasals
  'n': 'viseme_nn',
  // Velars
  'k': 'viseme_kk', 'g': 'viseme_kk', 'c': 'viseme_kk', 'q': 'viseme_kk',
  // Affricates
  'j': 'viseme_CH', 'y': 'viseme_CH',
  // Rhotic
  'r': 'viseme_RR',
  // Open vowel
  'a': 'viseme_aa',
  // Mid vowels
  'e': 'viseme_E', 'i': 'viseme_I',
  // Round vowels
  'o': 'viseme_O', 'u': 'viseme_U',
  // Arabic pharyngeals/uvulars
  'ح': 'viseme_FF', 'خ': 'viseme_FF', 'ه': 'viseme_FF',
  'ق': 'viseme_kk', 'ك': 'viseme_kk', 'غ': 'viseme_kk',
  'ر': 'viseme_RR',
  'ع': 'viseme_aa', 'ا': 'viseme_aa', 'أ': 'viseme_aa',
  'م': 'viseme_PP', 'ب': 'viseme_PP',
  'و': 'viseme_U', 'ي': 'viseme_I',
  // French nasal vowels
  'ç': 'viseme_SS', 'œ': 'viseme_O', 'é': 'viseme_E',
  'è': 'viseme_E', 'ê': 'viseme_E', 'ù': 'viseme_U',
};

const CHAR_TO_VISEME_BY_LANGUAGE = {
  'fr-FR': {
    'œ': 'viseme_E', 'ø': 'viseme_E', 'é': 'viseme_E', 'è': 'viseme_E', 'ê': 'viseme_E',
    'à': 'viseme_aa', 'â': 'viseme_aa', 'ô': 'viseme_O', 'ù': 'viseme_U', 'ç': 'viseme_SS',
  },
  'ar-SA': {
    'ص': 'viseme_SS', 'ض': 'viseme_TH', 'ط': 'viseme_TH', 'ظ': 'viseme_TH',
    'ح': 'viseme_FF', 'خ': 'viseme_kk', 'ع': 'viseme_aa',
    'ق': 'viseme_kk', 'غ': 'viseme_kk',
  },
  'es-ES': {
    'ñ': 'viseme_nn',
    'á': 'viseme_aa', 'é': 'viseme_E', 'í': 'viseme_I', 'ó': 'viseme_O', 'ú': 'viseme_U',
  },
};

const VISEME_JAW = {
  'viseme_aa': 0.55, 'viseme_O': 0.45, 'viseme_E': 0.30,
  'viseme_I': 0.25, 'viseme_U': 0.20, 'viseme_PP': 0.05,
  'viseme_FF': 0.10, 'viseme_TH': 0.15, 'viseme_DD': 0.15,
  'viseme_kk': 0.10, 'viseme_CH': 0.15, 'viseme_SS': 0.10,
  'viseme_nn': 0.08, 'viseme_RR': 0.18, 'viseme_sil': 0.0,
};

const FPS_MS = 1000 / 30;

/**
 * Convert ElevenLabs character alignment to 30fps RPM viseme frames.
 * alignment = { characters[], character_start_times_seconds[], character_end_times_seconds[] }
 */
export function alignmentToVisemes(alignment, language = 'en-US') {
  if (!alignment || !Array.isArray(alignment.characters)) return [];
  const languageMap = CHAR_TO_VISEME_BY_LANGUAGE[language] ?? {};
  const charToViseme = { ...CHAR_TO_VISEME_BASE, ...languageMap };
  const frames = [];

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i].toLowerCase();
    const startMs = alignment.character_start_times_seconds[i] * 1000;
    const endMs = alignment.character_end_times_seconds[i] * 1000;
    const viseme = charToViseme[char] ?? 'viseme_sil';
    const jawVal = VISEME_JAW[viseme] ?? 0.0;

    for (let t = startMs; t < endMs; t += FPS_MS) {
      frames.push({
        timestamp: Math.round(t),
        blendshapes: {
          jawOpen: jawVal,
          [viseme]: 0.95,
        },
      });
    }
  }

  const seen = new Map();
  for (const f of frames) seen.set(f.timestamp, f);
  return [...seen.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function wordBoundariesToVisemes(wordBoundaries, language = 'en-US') {
  if (!Array.isArray(wordBoundaries) || wordBoundaries.length === 0) return [];

  const fakeAlignment = {
    characters: wordBoundaries.flatMap((wb) => String(wb.word || '').toLowerCase().split('')),
    character_start_times_seconds: wordBoundaries.flatMap((wb) => {
      const word = String(wb.word || '');
      const startSec = Number(wb.audioOffset || 0) / 10_000_000;
      const charDur = (Number(wb.duration || 0) / 10_000_000) / Math.max(1, word.length);
      return word.split('').map((_, ci) => startSec + ci * charDur);
    }),
    character_end_times_seconds: wordBoundaries.flatMap((wb) => {
      const word = String(wb.word || '');
      const startSec = Number(wb.audioOffset || 0) / 10_000_000;
      const charDur = (Number(wb.duration || 0) / 10_000_000) / Math.max(1, word.length);
      return word.split('').map((_, ci) => startSec + (ci + 1) * charDur);
    }),
  };

  return alignmentToVisemes(fakeAlignment, language);
}
