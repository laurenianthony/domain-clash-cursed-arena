let audioContext = null;
let masterGain = null;
let muted = false;
let initialized = false;

function initializeAudio() {
  if (initialized) {
    if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : 0.7;
    masterGain.connect(audioContext.destination);
    initialized = true;
    return audioContext;
  } catch {
    return null;
  }
}

export function activateAudio() {
  initializeAudio();
  return Boolean(audioContext);
}

export function toggleMute() {
  muted = !muted;
  if (masterGain && audioContext) masterGain.gain.setTargetAtTime(muted ? 0 : 0.7, audioContext.currentTime, 0.025);
  return muted;
}

export function isMuted() { return muted; }

function synth({ frequency = 220, endFrequency = frequency, duration = 0.14, type = "sine", volume = 0.18, filter = null, when = 0 } = {}) {
  const audio = initializeAudio();
  if (!audio || muted) return;
  const start = audio.currentTime + when;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.012, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  let destination = masterGain;
  if (filter) {
    const lowPass = audio.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.setValueAtTime(filter.start, start);
    lowPass.frequency.exponentialRampToValueAtTime(filter.end, start + duration);
    oscillator.connect(lowPass); lowPass.connect(gain);
  } else oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function noiseBurst({ duration = 0.08, volume = 0.05, highpass = 1200 } = {}) {
  const audio = initializeAudio();
  if (!audio || muted) return;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = highpass;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  source.connect(filter); filter.connect(gain); gain.connect(masterGain);
  source.start();
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

export function playCardSelect() {
  synth({ frequency: 420, endFrequency: 280, duration: 0.07, type: "triangle", volume: 0.07 });
}
export function playBlackFlash() {
  synth({ frequency: 58, endFrequency: 27, duration: 0.52, type: "sine", volume: 0.65 });
  synth({ frequency: 1050, endFrequency: 120, duration: 0.18, type: "sawtooth", volume: 0.16, when: 0.015 });
  noiseBurst({ duration: 0.16, volume: 0.14, highpass: 1800 });
}
export function playHit() {
  synth({ frequency: 170, endFrequency: 62, duration: 0.11, type: "triangle", volume: 0.19 });
  noiseBurst({ duration: 0.055, volume: 0.035, highpass: 500 });
}
export function playShield() {
  synth({ frequency: 620, endFrequency: 260, duration: 0.24, type: "sine", volume: 0.16 });
  synth({ frequency: 920, endFrequency: 460, duration: 0.2, type: "triangle", volume: 0.08, when: 0.045 });
}
export function playDomainExpansion() {
  for (let i = 0; i < 4; i++) synth({ frequency: 48 + i * 13, endFrequency: 92 + i * 23, duration: 1.8, type: i % 2 ? "sawtooth" : "sine", volume: 0.12, when: i * 0.08, filter: { start: 90, end: 1300 } });
}
export function playVictory() {
  [261.63, 329.63, 392, 523.25].forEach((frequency, index) => synth({ frequency, endFrequency: frequency * 1.01, duration: 0.48, type: "triangle", volume: 0.11, when: index * 0.13 }));
}

// Initialize only after the first trusted pointer or keyboard gesture.
if (typeof window !== "undefined") {
  const unlock = () => { activateAudio(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}
