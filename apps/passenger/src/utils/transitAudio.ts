/**
 * Transit Station Chimes & Alarm Sounds
 * 
 * Uses the Web Audio API to synthesize acoustic transit station chimes and music
 * natively in-browser without requiring external audio file downloads.
 * 
 * Also supports playing any custom audio file placed at `/audio/song.mp3`.
 */

let activeAudioElement: HTMLAudioElement | null = null;
let activeSongAudioCtx: AudioContext | null = null;
let isSongCurrentlyPlaying = false;

/**
 * Plays the full 3-tone melodic Railway Arrival Chime (E5 -> G#5 -> B5)
 * when the bus arrives at or approaches the passenger's selected stop.
 */
export function playTransitChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();

    // 3-note harmonic arrival chime: E5 (659Hz) -> G#5 (830Hz) -> B5 (987Hz)
    const notes = [
      { freq: 659.25, time: 0.0, dur: 0.4 },
      { freq: 830.61, time: 0.25, dur: 0.45 },
      { freq: 987.77, time: 0.5, dur: 0.7 },
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      // Smooth attack & natural bell exponential decay
      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur);
    });
  } catch (e) {
    console.warn("[transitAudio] Chime playback notice:", e);
  }
}

/**
 * Plays a short, gentle single bell chime (A5, 880Hz)
 * to confirm when the passenger taps "Set Alarm".
 */
export function playPreviewChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn("[transitAudio] Preview chime notice:", e);
  }
}

/**
 * Stops any actively playing song or synthesizer.
 */
export function stopSong() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {}
    activeAudioElement = null;
  }
  if (activeSongAudioCtx) {
    try {
      void activeSongAudioCtx.close();
    } catch {}
    activeSongAudioCtx = null;
  }
  isSongCurrentlyPlaying = false;
}

export function isSongPlaying(): boolean {
  return isSongCurrentlyPlaying;
}

/**
 * Plays the song just for no reason!
 * 
 * 1. Checks if an MP3 file exists at `/audio/song.mp3` and plays it.
 * 2. If no MP3 file exists, synthesizes the iconic, cheerful, catchy
 *    melody ("Never Gonna Give You Up") using the Web Audio API synthesizer.
 */
export function playSong(onEnded?: () => void) {
  stopSong();
  isSongCurrentlyPlaying = true;

  // 1. Try playing custom audio file if provided in public/audio/song.mp3
  try {
    const audio = new Audio("/audio/song.mp3");
    audio.onended = () => {
      isSongCurrentlyPlaying = false;
      onEnded?.();
    };
    audio
      .play()
      .then(() => {
        activeAudioElement = audio;
      })
      .catch(() => {
        // MP3 file not present or autoplay blocked -> fallback to Web Audio synthesizer
        synthesizeCatchySong(onEnded);
      });
  } catch {
    synthesizeCatchySong(onEnded);
  }
}

/**
 * Built-in Web Audio melodic synthesizer for playing the song
 */
function synthesizeCatchySong(onEnded?: () => void) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      isSongCurrentlyPlaying = false;
      return;
    }

    const ctx = new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    activeSongAudioCtx = ctx;

    // Melody: [frequency (Hz), duration (s), isBass]
    // Iconic "Never Gonna Give You Up"
    const melody: Array<[number, number]> = [
      // Intro phrase
      [293.66, 0.18], // D4
      [329.63, 0.18], // E4
      [392.00, 0.18], // G4
      [329.63, 0.18], // E4
      [493.88, 0.35], // B4
      [493.88, 0.35], // B4
      [440.00, 0.55], // A4
      [0, 0.18],      // rest

      [293.66, 0.18], // D4
      [329.63, 0.18], // E4
      [392.00, 0.18], // G4
      [329.63, 0.18], // E4
      [440.00, 0.35], // A4
      [440.00, 0.35], // A4
      [392.00, 0.55], // G4
      [0, 0.18],      // rest

      // Chorus: Never gonna give you up
      [293.66, 0.18], // D4
      [329.63, 0.18], // E4
      [392.00, 0.18], // G4
      [329.63, 0.18], // E4
      [392.00, 0.28], // G4
      [440.00, 0.28], // A4
      [369.99, 0.28], // F#4
      [293.66, 0.25], // D4
      [329.63, 0.40], // E4
      [293.66, 0.20], // D4
      [261.63, 0.45], // C4
      [0, 0.18],      // rest

      // Never gonna let you down
      [293.66, 0.18], // D4
      [329.63, 0.18], // E4
      [392.00, 0.18], // G4
      [329.63, 0.18], // E4
      [523.25, 0.35], // C5
      [493.88, 0.28], // B4
      [440.00, 0.28], // A4
      [392.00, 0.35], // G4
      [440.00, 0.55], // A4
      [0, 0.20],      // rest

      // Never gonna run around and desert you
      [440.00, 0.22], // A4
      [493.88, 0.22], // B4
      [523.25, 0.30], // C5
      [440.00, 0.22], // A4
      [392.00, 0.25], // G4
      [329.63, 0.25], // E4
      [392.00, 0.50], // G4
      [440.00, 0.65], // A4
    ];

    let currentPlayTime = ctx.currentTime + 0.05;

    melody.forEach(([freq, dur]) => {
      if (freq > 0) {
        // Lead melody synth voice
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, currentPlayTime);

        // Punchy synth envelope
        gain.gain.setValueAtTime(0.001, currentPlayTime);
        gain.gain.exponentialRampToValueAtTime(0.22, currentPlayTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, currentPlayTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(currentPlayTime);
        osc.stop(currentPlayTime + dur);

        // Sub-bass companion note (1 octave down)
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = "sine";
        bassOsc.frequency.setValueAtTime(freq / 2, currentPlayTime);

        bassGain.gain.setValueAtTime(0.001, currentPlayTime);
        bassGain.gain.exponentialRampToValueAtTime(0.12, currentPlayTime + 0.02);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, currentPlayTime + dur);

        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassOsc.start(currentPlayTime);
        bassOsc.stop(currentPlayTime + dur);
      }
      currentPlayTime += dur;
    });

    const totalDurationMs = Math.round((currentPlayTime - ctx.currentTime) * 1000);
    setTimeout(() => {
      isSongCurrentlyPlaying = false;
      onEnded?.();
    }, totalDurationMs);
  } catch (err) {
    console.warn("[transitAudio] Synthesizer notice:", err);
    isSongCurrentlyPlaying = false;
  }
}
