let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(freq1: number, freq2: number) {
  const ctx = getAudioContext();
  void ctx.resume();

  const now = ctx.currentTime;
  const duration = 0.09;
  const attack = 0.015;

  for (let i = 0; i < 2; i++) {
    const freq = i === 0 ? freq1 : freq2;
    const start = now + i * duration;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }
}

export function playStartCue() {
  playTone(523, 659);
}

export function playStopCue() {
  playTone(587, 440);
}
