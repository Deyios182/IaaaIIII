
/**
 * Utility functions for basic Voice Biometrics (Fingerprinting)
 * Uses fundamental frequency (F0) Analysis via Autocorrelation.
 */

interface VoiceSignature {
    avgPitch: number;      // Hz
    pitchVariance: number; // Hz deviation
    spectralCentroid?: number;
}

/**
 * Extracts voice signature from raw PCM audio float data (mono).
 * @param buffer Float32Array of audio samples
 * @param sampleRate Sample rate (e.g. 16000 or 44100)
 */
export function extractVoiceFeatures(buffer: Float32Array, sampleRate: number): VoiceSignature | null {
    // 1. RMS Threshold (Ignore silence)
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);
    if (rms < 0.05) return null; // Too quiet

    // 2. Autocorrelation for Pitch (F0)
    const pitch = autoCorrelate(buffer, sampleRate);
    if (pitch === -1) return null; // No clear pitch found (noise/unvoiced)

    // TODO: For variance we need multiple frames. This function returns instantaneous pitch.
    // Ideally we aggregate this over time in Dashboard.

    // 3. Simple Spectral Centroid (Approximate brightness)
    // We don't have FFT here easily without WebAudio AnalyzerNode, so we can use Zero Crossing Rate as a proxy for now
    const zcr = calculateZeroCrossingRate(buffer);

    return {
        avgPitch: pitch,
        pitchVariance: 0, // Needs aggregation context
        spectralCentroid: zcr * sampleRate / 2 // Rough approximation
    };
}

/**
 * Autocorrelation algorithm to detect pitch
 */
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
    // Perform a naive autocorrelation
    let SIZE = buffer.length;
    let MAX_SAMPLES = Math.floor(SIZE / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;
    let foundGoodCorrelation = false;
    let correlations = new Float32Array(MAX_SAMPLES);

    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let lastCorrelation = 1;
    for (let offset = 0; offset < MAX_SAMPLES; offset++) {
        let correlation = 0;

        for (let i = 0; i < MAX_SAMPLES; i++) {
            correlation += Math.abs((buffer[i]) - (buffer[i + offset]));
        }
        correlation = 1 - (correlation / MAX_SAMPLES);
        correlations[offset] = correlation; // store it, for the tweaking we need to do below.

        if ((correlation > 0.9) && (correlation > lastCorrelation)) {
            foundGoodCorrelation = true;
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        } else if (foundGoodCorrelation) {
            // short-circuit - we found a good correlation, then it started getting bad
            // no need to continue.
            const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
            return sampleRate / (bestOffset + (8 * shift));
        }
        lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.01) {
        // console.log("f = " + sampleRate/bestOffset + "Hz (rms: " + rms + " confidence: " + bestCorrelation + ")")
        return sampleRate / bestOffset;
    }
    return -1;
}

function calculateZeroCrossingRate(buffer: Float32Array): number {
    let zeros = 0;
    for (let i = 0; i < buffer.length - 1; i++) {
        if ((buffer[i] >= 0 && buffer[i + 1] < 0) || (buffer[i] < 0 && buffer[i + 1] >= 0)) {
            zeros++;
        }
    }
    return zeros / buffer.length;
}

/**
 * Returns similarity score (0.0 to 1.0)
 * 1.0 = identical
 */
export function compareVoiceSignatures(sig1: VoiceSignature, sig2: VoiceSignature): number {
    // Basic Pitch Diff
    const pitchDiff = Math.abs(sig1.avgPitch - sig2.avgPitch);

    // Normalize difference
    // Human voice range ~85Hz to ~255Hz. 
    // A difference of > 40Hz is usually a different person (or different gender/tone)
    const MAX_PITCH_DIFF = 50;

    if (pitchDiff > MAX_PITCH_DIFF) return 0; // Completely different

    // Linear interpolation
    const score = 1 - (pitchDiff / MAX_PITCH_DIFF);
    return Math.max(0, score);
}
