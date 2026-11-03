/* eslint-disable -- Phase 1: the legacy script, moved verbatim into a module. It is typed, linted
   and split into modules step by step in Phase 2 (docs/refactor-plan.md); this header goes away in
   step 2.9. */
// @ts-nocheck -- same reason.
import * as THREE from 'three';
import * as Tone from 'tone';
import './styles/main.css';
import skyVertexShader from './world/sky/sky.vert.glsl?raw';
import skyFragmentShader from './world/sky/sky.frag.glsl?raw';
import bodyVertexShader from './world/sky/celestial-body.vert.glsl?raw';
import bodyFragmentShader from './world/sky/celestial-body.frag.glsl?raw';
import { InputController } from './input/InputController';
import { requireEl } from './ui/dom';
import { installTestHooks } from './testing/testHooks';
import { BIOMES as BIOME_CONFIG } from './config/biomes';
import { CAMERA_MODES } from './config/cameras';
import { CELESTIAL_PALETTE } from './config/celestial';
import { ARRANGEMENT_PHASES, RADIO_STATIONS } from './config/stations';
import { HALF_WIDTH, SCENERY_COUNT, SEGMENT_LEN, TOTAL_LENGTH, X_SEGMENTS, Z_SEGMENTS } from './config/world';
import { paletteToColors, withThreeColors } from './world/colors';
import { landformBlend, terrainElevation } from './world/landforms';
import { roadDerivativeX, roadX, roadY } from './world/road';
import { PALETTE_KEYS } from './config/biomes';
import { ROAD_CORRIDOR_HALF_WIDTH } from './config/road';
import {
  advanceCelestialTime,
  CELESTIAL_DISTANCE,
  celestialLighting,
  celestialState,
} from './sim/celestialCycle';

/********************************************************************
 * 1. BIOME & HORIZON DEFINITIONS
 ********************************************************************/
const BIOMES = BIOME_CONFIG.map(withThreeColors);

/********************************************************************
 * 2. MULTI-CHANNEL PROCEDURAL SYNTH RADIO ENGINE (Tone.js)
 ********************************************************************/

class CarRadio {
  constructor() {
    this.isInitialized = false;
    this.isPlaying = false;
    this.stationIndex = 0;
    this.step = 0;
    this.barCount = 0;
    this.eqBars = document.querySelectorAll('.eq-bar');

    // Non-looping generative state
    this.progressionIdx = 0;
    this.chordIdx = 0;
    this.phaseIdx = 1; // Start in CRUISE
    this.barsInCurrentPhase = 0;
    this.phaseTargetBars = 8;
    this.arpDirection = 1;
    this.arpWalkIdx = 0;
    this.melodyDegree = 7;
    this.euclidRotation = 0;
    this.speedMod = 0.5;
  }

  async init() {
    if (this.isInitialized) return;
    await Tone.start();

    // Master Bus with Glue Compression & Stereo Space
    this.compressor = new Tone.Compressor({ threshold: -18, ratio: 3.5, attack: 0.02, release: 0.25 });
    this.masterVol = new Tone.Volume(-6).toDestination();
    this.compressor.connect(this.masterVol);

    this.reverb = new Tone.Reverb({ decay: 4.8, wet: 0.42 }).connect(this.compressor);
    this.delay = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.34, wet: 0.32 }).connect(this.reverb);
    this.chorus = new Tone.Chorus(2.2, 3.5, 0.4).connect(this.reverb).start();

    // Slow LFO breathing on the pad filter so timbre never stays static
    this.padFilter = new Tone.Filter(1400, 'lowpass').connect(this.chorus);
    this.filterLFO = new Tone.LFO('0.07hz', 650, 2400).start();
    this.filterLFO.connect(this.padFilter.frequency);

    // 1. Lush Evolving Pad PolySynth
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 26 },
      envelope: { attack: 1.1, decay: 1.8, sustain: 0.72, release: 3.2 },
    }).connect(this.padFilter);
    this.padSynth.volume.value = -13;

    // 2. Dynamic Filter Bass MonoSynth
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
      filter: { Q: 2.8, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.008, decay: 0.24, sustain: 0.25, release: 0.35 },
      filterEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.15, baseFrequency: 65, octaves: 2.6 },
    }).connect(this.compressor);
    this.bassSynth.volume.value = -7;

    // 3. Generative Arpeggio / Pluck Synth
    this.arpFilter = new Tone.Filter(2600, 'lowpass').connect(this.delay);
    this.arpSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.006, decay: 0.32, sustain: 0.06, release: 0.55 },
    }).connect(this.arpFilter);
    this.arpSynth.volume.value = -10;

    // 4. Expressive Improvisational FM Lead Synth (with portamento glide)
    this.leadSynth = new Tone.MonoSynth({
      portamento: 0.06,
      oscillator: { type: 'fmsawtooth', modulationType: 'sine', modulationIndex: 2.5, harmonicity: 1 },
      filter: { Q: 1.8, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.03, decay: 0.45, sustain: 0.4, release: 0.9 },
      filterEnvelope: { attack: 0.04, decay: 0.35, sustain: 0.3, baseFrequency: 320, octaves: 3.2 },
    }).connect(this.delay);
    this.leadSynth.volume.value = -10;

    // 5. Full Drum Kit (Kick, Snare/Rim, Open/Closed Hat)
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 5.5,
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.3 },
    }).connect(this.compressor);
    this.kickSynth.volume.value = -8;

    this.snareSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.08 },
    });
    this.snareFilter = new Tone.Filter(1800, 'bandpass').connect(this.reverb);
    this.snareSynth.connect(this.snareFilter);
    this.snareSynth.volume.value = -14;

    this.hatSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    });
    this.hatFilter = new Tone.Filter(7500, 'highpass').connect(this.compressor);
    this.hatSynth.connect(this.hatFilter);
    this.hatSynth.volume.value = -19;

    // Radio static tuning sound
    this.staticNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.18, sustain: 0, release: 0.08 },
    }).connect(this.masterVol);
    this.staticNoise.volume.value = -16;

    // Main 16th-note generative clock
    this.loop = new Tone.Loop((time) => {
      this.tickStep(time);
    }, '16n').start(0);

    this.applyStationSettings();
    Tone.Transport.start();
    this.isInitialized = true;
    this.isPlaying = true;
  }

  getCurrentPhase() {
    return ARRANGEMENT_PHASES[this.phaseIdx % ARRANGEMENT_PHASES.length];
  }

  // Advance bar, evolve arrangement phase, and pick non-repeating chord progressions
  advanceBarState(st) {
    this.barCount++;
    this.barsInCurrentPhase++;

    // Transition arrangement phase after target bar length (organic 4 to 10 bars)
    if (this.barsInCurrentPhase >= this.phaseTargetBars) {
      this.barsInCurrentPhase = 0;
      // Weighted random jump to a new phase so structure never repeats identically
      const nextOffset = Math.random() < 0.65 ? 1 : 2 + Math.floor(Math.random() * 2);
      this.phaseIdx = (this.phaseIdx + nextOffset) % ARRANGEMENT_PHASES.length;
      const phase = this.getCurrentPhase();
      this.phaseTargetBars =
        phase === 'BREAKDOWN' || phase === 'INTRO'
          ? 4 + Math.floor(Math.random() * 3)
          : 6 + Math.floor(Math.random() * 5);

      // Shift arpeggiator & rhythmic rotation on phase change
      this.arpDirection = Math.random() < 0.5 ? 1 : -1;
      this.euclidRotation = Math.floor(Math.random() * 8);

      const phaseBadge = document.getElementById('station-phase');
      if (phaseBadge) phaseBadge.textContent = phase;
    }

    // Move to next chord in current progression, or Markov-branch to another progression
    this.chordIdx++;
    if (this.chordIdx >= 4) {
      this.chordIdx = 0;
      // 70% chance to switch to a different harmonic progression at end of 4-bar phrase
      if (Math.random() < 0.7) {
        const otherProgs = [0, 1, 2].filter((idx) => idx !== this.progressionIdx);
        this.progressionIdx = otherProgs[Math.floor(Math.random() * otherProgs.length)];
      }
    } else if (Math.random() < 0.14) {
      // Occasional mid-phrase harmonic substitution for surprise
      this.progressionIdx = (this.progressionIdx + 1) % st.progressions.length;
    }
  }

  // Generate dynamic chord voicing (inversions, open 9ths, octave drops)
  buildDynamicVoicing(rawNotes, phase) {
    const voiced = [...rawNotes];
    // Randomly drop or raise individual chord tones by an octave for fresh voicings
    if (Math.random() < 0.45 && voiced.length > 3) {
      const idx = 1 + Math.floor(Math.random() * (voiced.length - 1));
      voiced[idx] = Tone.Frequency(voiced[idx])
        .transpose(Math.random() < 0.5 ? 12 : -12)
        .toNote();
    }
    if (phase === 'BREAKDOWN' || phase === 'INTRO') {
      // Sparse, airy voicing
      return voiced.filter((_, i) => i !== 1);
    }
    if (phase === 'PEAK' || phase === 'SOLO') {
      // Add shimmering top octave extension
      const topNote = Tone.Frequency(voiced[voiced.length - 1])
        .transpose(12)
        .toNote();
      voiced.push(topNote);
    }
    return voiced;
  }

  tickStep(time) {
    if (!this.isPlaying) return;
    try {
      const st = RADIO_STATIONS[this.stationIndex];
      const stepInBar = this.step % 16;

      if (stepInBar === 0 && this.step > 0) {
        this.advanceBarState(st);
      }

      const phase = this.getCurrentPhase();
      const chordObj = st.progressions[this.progressionIdx][this.chordIdx];
      const isFillBar = this.barsInCurrentPhase === this.phaseTargetBars - 1;

      // Strictly non-negative humanize offset for polyphonic synths; exact `time` for MonoSynths
      const humanJitter = Math.random() * 0.005;
      const tPoly = time + humanJitter;
      const tMono = time;
      const velBase = 0.65 + this.speedMod * 0.25;

      // ----------------------------------------------------
      // 1. GENERATIVE PAD & HARMONIC SWELLS
      // ----------------------------------------------------
      if (stepInBar === 0) {
        const voicing = this.buildDynamicVoicing(chordObj.notes, phase);
        const dur = st.style === 'ambient' ? '1m' : '2n.';
        const padVel = (phase === 'BREAKDOWN' ? 0.5 : 0.78) * (0.9 + Math.random() * 0.2);
        this.padSynth.triggerAttackRelease(voicing, dur, tPoly, padVel);
      } else if (stepInBar === 10 && st.style === 'lofi' && Math.random() < 0.55) {
        // Neo-soul syncopated secondary chord stab
        const stabVoicing = chordObj.notes.slice(1, 5);
        this.padSynth.triggerAttackRelease(stabVoicing, '8n', tPoly, 0.45);
      }

      // ----------------------------------------------------
      // 2. EVOLVING BASSLINES (Root / Fifth / Octave / Passing)
      // ----------------------------------------------------
      if (phase !== 'INTRO') {
        if (st.style === 'synthwave' || st.style === 'cyber') {
          const activeBass =
            phase === 'BREAKDOWN'
              ? stepInBar === 0 || stepInBar === 8
              : stepInBar % 2 === 0 || (phase === 'PEAK' && stepInBar % 4 === 3);
          if (activeBass) {
            let bNote = chordObj.root;
            const r = Math.random();
            if (stepInBar === 14 && r < 0.65) bNote = chordObj.fifth;
            else if (stepInBar % 4 === 2 && r < 0.55) bNote = chordObj.octave;
            else if (r < 0.18) bNote = chordObj.fifth;

            const bVel = (stepInBar % 4 === 0 ? 0.9 : 0.68) * (0.85 + Math.random() * 0.2);
            this.bassSynth.triggerAttackRelease(bNote, '16n', tMono, bVel);
          }
        } else if (st.style === 'lofi' || st.style === 'americana') {
          const isBeat =
            stepInBar === 0 ||
            stepInBar === 6 ||
            stepInBar === 10 ||
            (stepInBar === 14 && Math.random() < 0.5);
          if (isBeat && !(phase === 'BREAKDOWN' && stepInBar > 0)) {
            let bNote = chordObj.root;
            if (stepInBar === 6 && Math.random() < 0.5) bNote = chordObj.fifth;
            if (stepInBar === 10) bNote = Math.random() < 0.6 ? chordObj.fifth : chordObj.octave;
            if (stepInBar === 14) bNote = st.scale[Math.floor(Math.random() * 5)];
            this.bassSynth.triggerAttackRelease(bNote, '8n', tMono, 0.78);
          }
        } else if (st.style === 'ambient') {
          if (stepInBar === 0 && (this.barCount % 2 === 0 || Math.random() < 0.4)) {
            const bNote = Math.random() < 0.75 ? chordObj.root : chordObj.fifth;
            this.bassSynth.triggerAttackRelease(bNote, '1m', tMono, 0.65);
          }
        }
      }

      // ----------------------------------------------------
      // 3. NON-REPEATING ARPEGGIATOR & PLUCK PATTERNS
      // ----------------------------------------------------
      const arpChance = phase === 'PEAK' ? 0.88 : phase === 'CRUISE' ? 0.72 : phase === 'SOLO' ? 0.55 : 0.35;
      const isArpStep =
        st.style === 'synthwave' || st.style === 'cyber'
          ? stepInBar % 2 === 0 || (phase === 'PEAK' && (stepInBar + this.euclidRotation) % 3 === 0)
          : st.style === 'americana'
            ? stepInBar % 2 === 0
            : (stepInBar + this.euclidRotation) % 4 === 2;

      if (isArpStep && Math.random() < arpChance) {
        if (Math.random() < 0.25) {
          this.arpDirection *= -1;
        }
        this.arpWalkIdx =
          (this.arpWalkIdx + this.arpDirection + chordObj.notes.length) % chordObj.notes.length;
        let note = chordObj.notes[this.arpWalkIdx];

        if (Math.random() < 0.28) {
          note = Tone.Frequency(note).transpose(12).toNote();
        } else if (Math.random() < 0.2) {
          note = st.scale[4 + Math.floor(Math.random() * (st.scale.length - 5))];
        }

        const arpDur = st.style === 'ambient' ? '2n' : '16n';
        const arpVel = (0.5 + Math.random() * 0.38) * velBase;
        this.arpSynth.triggerAttackRelease(note, arpDur, tPoly, arpVel);
      }

      // ----------------------------------------------------
      // 4. IMPROVISATIONAL MARKOV LEAD SYNTH MELODY
      // ----------------------------------------------------
      const leadActive =
        phase === 'SOLO' || phase === 'PEAK' || (phase === 'CRUISE' && this.barCount % 2 === 1);
      if (leadActive) {
        const isPhraseRest = stepInBar >= 11 && stepInBar <= 13 && Math.random() < 0.6;
        const leadProb = phase === 'SOLO' ? 0.52 : phase === 'PEAK' ? 0.36 : 0.2;

        if (!isPhraseRest && (stepInBar % 2 === 0 || Math.random() < 0.28) && Math.random() < leadProb) {
          const intervals = [-2, -1, -1, 0, 1, 1, 2, 3, -3];
          const delta = intervals[Math.floor(Math.random() * intervals.length)];
          this.melodyDegree = Math.max(3, Math.min(st.scale.length - 1, this.melodyDegree + delta));

          let leadNote = st.scale[this.melodyDegree];
          if ((stepInBar === 0 || stepInBar === 8) && Math.random() < 0.65) {
            const targetTone = chordObj.notes[2 + Math.floor(Math.random() * (chordObj.notes.length - 2))];
            leadNote = Tone.Frequency(targetTone).transpose(12).toNote();
          }

          const durations = ['8n', '8n.', '4n', '16n'];
          const dur = durations[Math.floor(Math.random() * durations.length)];
          const leadVel = (0.58 + Math.random() * 0.32) * velBase;
          this.leadSynth.triggerAttackRelease(leadNote, dur, tMono, leadVel);
        }
      }

      // ----------------------------------------------------
      // 5. DYNAMIC DRUMS, GHOST NOTES & BAR-END FILLS
      // ----------------------------------------------------
      if (st.style !== 'ambient' && phase !== 'INTRO' && phase !== 'BREAKDOWN') {
        const mainKick =
          st.style === 'cyber'
            ? stepInBar % 4 === 0
            : stepInBar === 0 ||
              stepInBar === 8 ||
              (stepInBar === 10 && st.style === 'lofi' && Math.random() < 0.6);
        const ghostKick = (stepInBar === 7 || stepInBar === 15) && Math.random() < 0.25;

        if (mainKick || ghostKick) {
          this.kickSynth.triggerAttackRelease('C1', '8n', tMono, mainKick ? 0.92 : 0.55);
        }

        const mainSnare = stepInBar === 4 || stepInBar === 12;
        const fillSnare = isFillBar && stepInBar >= 11 && Math.random() < 0.68;
        const ghostSnare = (stepInBar === 7 || stepInBar === 9 || stepInBar === 15) && Math.random() < 0.18;

        if (mainSnare || fillSnare || ghostSnare) {
          const sVel = mainSnare ? 0.82 : fillSnare ? 0.65 + (stepInBar - 11) * 0.06 : 0.32;
          this.snareSynth.triggerAttackRelease('16n', tMono, sVel);
        }

        const hatStep =
          phase === 'PEAK' || st.style === 'cyber'
            ? stepInBar % 2 === 0 || Math.random() < 0.35
            : stepInBar % 2 === 0;
        if (hatStep) {
          const isOpenHat =
            (stepInBar === 2 || stepInBar === 10 || (isFillBar && stepInBar === 14)) && Math.random() < 0.45;
          this.hatSynth.envelope.decay = isOpenHat ? 0.14 : 0.035;
          const hVel = (stepInBar % 4 === 2 ? 0.75 : 0.42) * (0.8 + Math.random() * 0.35);
          this.hatSynth.triggerAttackRelease('32n', tMono + 0.001, hVel);
        }
      } else if (phase === 'BREAKDOWN' && st.style !== 'ambient') {
        if (stepInBar === 0 && Math.random() < 0.7) {
          this.kickSynth.triggerAttackRelease('C1', '8n', tMono, 0.5);
        }
        if (stepInBar === 12 && Math.random() < 0.5) {
          this.hatSynth.envelope.decay = 0.09;
          this.hatSynth.triggerAttackRelease('32n', tMono + 0.001, 0.35);
        }
      }

      this.step++;
    } catch (e) {
      // Safely ignore any transient WebAudio timing overlaps
      this.step++;
    }
  }

  // Link driving speed & road energy directly to synthesizer filters and effects
  updateDrivingDynamics(speedKmh) {
    if (!this.isInitialized) return;
    this.speedMod = Math.max(0, Math.min(1, speedKmh / 200));
    const st = RADIO_STATIONS[this.stationIndex];

    // Open up the arpeggiator filter and delay feedback as you drive faster
    const baseCutoff = st.style === 'lofi' ? 1100 : st.style === 'ambient' ? 1800 : 1650;
    const dynamicCutoff = baseCutoff + this.speedMod * 2400;
    this.arpFilter.frequency.rampTo(dynamicCutoff, 0.25);
  }

  applyStationSettings() {
    const st = RADIO_STATIONS[this.stationIndex];
    Tone.Transport.bpm.rampTo(st.bpm, 0.6);
    Tone.Transport.swing = st.style === 'lofi' ? 0.22 : st.style === 'americana' ? 0.08 : 0.02;
    Tone.Transport.swingSubdivision = '16n';

    if (st.style === 'ambient') {
      this.reverb.wet.value = 0.68;
      this.delay.wet.value = 0.45;
      this.leadSynth.oscillator.modulationIndex.value = 1.4;
    } else if (st.style === 'lofi') {
      this.reverb.wet.value = 0.34;
      this.delay.wet.value = 0.24;
      this.leadSynth.oscillator.modulationIndex.value = 1.8;
    } else if (st.style === 'cyber') {
      this.reverb.wet.value = 0.38;
      this.delay.wet.value = 0.36;
      this.leadSynth.oscillator.modulationIndex.value = 4.2;
    } else {
      this.reverb.wet.value = 0.44;
      this.delay.wet.value = 0.34;
      this.leadSynth.oscillator.modulationIndex.value = 2.6;
    }

    // Update Radio UI
    document.getElementById('station-freq').textContent = st.freq;
    document.getElementById('station-name').textContent = st.name;
    document.getElementById('station-genre').textContent = st.genre;
    const phaseBadge = document.getElementById('station-phase');
    if (phaseBadge) phaseBadge.textContent = this.getCurrentPhase();
  }

  changeStation(dir) {
    this.stationIndex = (this.stationIndex + dir + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    this.progressionIdx = Math.floor(Math.random() * 3);
    this.chordIdx = 0;
    if (this.isInitialized && this.isPlaying) {
      this.staticNoise.triggerAttackRelease('16n');
    }
    this.applyStationSettings();
    const st = RADIO_STATIONS[this.stationIndex];
    showToast(`RADIO TUNED • ${st.freq} — ${st.name.toUpperCase()}`);
  }

  togglePower() {
    if (!this.isInitialized) return;
    this.isPlaying = !this.isPlaying;
    const btn = document.getElementById('radio-power');
    if (this.isPlaying) {
      btn.className =
        'p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30 transition cursor-pointer';
      showToast('RADIO ON');
    } else {
      btn.className =
        'p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/40 hover:bg-rose-500/30 transition cursor-pointer';
      showToast('RADIO MUTED');
    }
  }

  setVolume(db) {
    if (!this.isInitialized) return;
    this.masterVol.volume.value = parseFloat(db);
  }

  updateVisualizer(time) {
    this.eqBars.forEach((bar, i) => {
      if (!this.isPlaying) {
        bar.style.height = '3px';
        return;
      }
      const wave = Math.sin(time * 9 + i * 1.1) * 0.5 + 0.5;
      const jitter = Math.cos(time * 15 - i * 0.7) * 0.3 + 0.3;
      const h = Math.max(4, Math.min(26, Math.floor((wave * 0.65 + jitter * 0.35) * 26)));
      bar.style.height = `${h}px`;
    });
  }
}

const radio = new CarRadio();

/********************************************************************
 * 3. THREE.JS WORLD, CURVING ROAD, SKY DOME & GRAND TOURER CAR
 ********************************************************************/
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x4a1936, 0.00105);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.4, 2400);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

// Realistic Multi-Source Lighting
const hemiLight = new THREE.HemisphereLight(0xffd6a5, 0x0f172a, 0.72);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffb74d, 1.85);
dirLight.position.set(45, 110, -260);
scene.add(dirLight);

// Under-car road bounce fill light
const carFillLight = new THREE.PointLight(0xff8c42, 0.65, 14);
scene.add(carFillLight);

// Procedural Micro-Asphalt Texture for Realistic Wet/Specular Road Surface
function createAsphaltBumpMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(256, 256);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const grain = 115 + Math.floor(Math.random() * 45);
    imgData.data[i] = grain;
    imgData.data[i + 1] = grain;
    imgData.data[i + 2] = grain;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 90);
  return tex;
}

// Custom Atmospheric Sky Dome Shader with Volumetric Clouds & Mie Scattering
const skyGeo = new THREE.SphereGeometry(1250, 64, 40);
const skyUniforms = {
  uTopColor: { value: BIOMES[0].skyTop.clone() },
  uMidColor: { value: BIOMES[0].skyMid.clone() },
  uHorizonColor: { value: BIOMES[0].skyHorizon.clone() },
  uSunColor: { value: BIOMES[0].sunColor.clone() },
  uCelestialDir: { value: new THREE.Vector3(0.0, 0.14, -1.0).normalize() },
  uNightFactor: { value: 0.0 },
  uTime: { value: 0 },
};
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: skyUniforms,
  vertexShader: skyVertexShader,
  fragmentShader: skyFragmentShader,
});
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// Realistic Atmospheric Solar & Lunar Disc Shader (Morphs between Sun and Textured Moon)
const sunGeo = new THREE.PlaneGeometry(360, 360);
const sunUniforms = {
  uSunColor: { value: BIOMES[0].sunColor.clone() },
  uHorizonColor: { value: BIOMES[0].skyHorizon.clone() },
  uIsMoon: { value: 0.0 },
  uOpacity: { value: 1.0 },
  uTime: { value: 0 },
};
const sunMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  fog: false,
  blending: THREE.AdditiveBlending,
  uniforms: sunUniforms,
  vertexShader: bodyVertexShader,
  fragmentShader: bodyFragmentShader,
});
const horizonSun = new THREE.Mesh(sunGeo, sunMat);
scene.add(horizonSun);

// Soft Circular Starfield with Variable Star Sizes
const starCount = 1500;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI * 0.44;
  const r = CELESTIAL_DISTANCE;
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.cos(phi) + 60;
  starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

  const brightness = 0.45 + Math.random() * 0.55;
  starColors[i * 3] = brightness;
  starColors[i * 3 + 1] = brightness * (0.95 + Math.random() * 0.05);
  starColors[i * 3 + 2] = 1.0;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const starMat = new THREE.PointsMaterial({
  size: 1.9,
  vertexColors: true,
  transparent: true,
  opacity: 0.7,
  fog: false,
});
const starField = new THREE.Points(starGeo, starMat);
scene.add(starField);

const terrainGeo = new THREE.BufferGeometry();
const numVerts = (Z_SEGMENTS + 1) * (X_SEGMENTS + 1);
const positions = new Float32Array(numVerts * 3);
const colors = new Float32Array(numVerts * 3);
const uvs = new Float32Array(numVerts * 2);
const indices = [];

for (let iz = 0; iz <= Z_SEGMENTS; iz++) {
  for (let ix = 0; ix <= X_SEGMENTS; ix++) {
    const idx = (iz * (X_SEGMENTS + 1) + ix) * 2;
    uvs[idx] = ix / X_SEGMENTS;
    uvs[idx + 1] = iz / Z_SEGMENTS;
  }
}

for (let iz = 0; iz < Z_SEGMENTS; iz++) {
  for (let ix = 0; ix < X_SEGMENTS; ix++) {
    const a = iz * (X_SEGMENTS + 1) + ix;
    const b = iz * (X_SEGMENTS + 1) + ix + 1;
    const c = (iz + 1) * (X_SEGMENTS + 1) + ix;
    const d = (iz + 1) * (X_SEGMENTS + 1) + ix + 1;
    indices.push(a, b, d);
    indices.push(a, d, c);
  }
}
terrainGeo.setIndex(indices);
terrainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

const asphaltBump = createAsphaltBumpMap();
const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.14,
  bumpMap: asphaltBump,
  bumpScale: 0.045,
  flatShading: false,
});
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
// CRITICAL: Disable frustum culling because vertices are dynamically streamed in world space
terrainMesh.frustumCulled = false;
scene.add(terrainMesh);

// Detailed Roadside Scenery Pool (Multi-tier Pines, Curved Palms, Saguaro Cacti, Highway Reflector Posts)
const sceneryObjects = [];
const sceneryGroup = new THREE.Group();
scene.add(sceneryGroup);

const sharedBarkMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.9 });
const sharedPostBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
const sharedReflectorMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d });
const sharedFoliageMat = new THREE.MeshStandardMaterial({ color: 0x164e35, roughness: 0.75 });
const sharedCactusMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });

function createSceneryItem(index) {
  const holder = new THREE.Group();

  // 1. Multi-Tiered Alpine Pine Tree Group
  const pineGroup = new THREE.Group();
  const pineTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 3.2, 8), sharedBarkMat);
  pineTrunk.position.y = 1.6;
  pineGroup.add(pineTrunk);
  for (let t = 0; t < 3; t++) {
    const radius = 2.7 - t * 0.62;
    const height = 4.2 - t * 0.55;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 9), sharedFoliageMat);
    cone.position.y = 3.8 + t * 2.25;
    pineGroup.add(cone);
  }
  holder.add(pineGroup);

  // 2. Curved Tropical Palm Tree Group
  const palmGroup = new THREE.Group();
  for (let s = 0; s < 5; s++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 - s * 0.02, 0.26 - s * 0.02, 1.7, 7),
      sharedBarkMat,
    );
    seg.position.set(Math.sin(s * 0.18) * 0.55, s * 1.55 + 0.8, 0);
    seg.rotation.z = -s * 0.07;
    palmGroup.add(seg);
  }
  const frondHub = new THREE.Group();
  frondHub.position.set(0.95, 7.8, 0);
  for (let f = 0; f < 7; f++) {
    const angle = (f / 7) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.8, 5), sharedFoliageMat);
    frond.scale.set(1.0, 1.0, 0.22);
    frond.rotation.z = Math.PI * 0.36;
    const pivot = new THREE.Group();
    pivot.rotation.y = angle;
    frond.position.set(1.6, -0.3, 0);
    pivot.add(frond);
    frondHub.add(pivot);
  }
  palmGroup.add(frondHub);
  holder.add(palmGroup);

  // 3. Sculpted Saguaro Cactus Group
  const cactusGroup = new THREE.Group();
  const mainStem = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 5.8, 10), sharedCactusMat);
  mainStem.position.y = 2.9;
  cactusGroup.add(mainStem);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 2.2, 8), sharedCactusMat);
  armL.position.set(-0.65, 3.6, 0);
  armL.rotation.z = -0.35;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.9, 8), sharedCactusMat);
  armR.position.set(0.65, 3.1, 0);
  armR.rotation.z = 0.35;
  cactusGroup.add(armL, armR);
  holder.add(cactusGroup);

  // 4. Realistic Highway Delineator Post with Glowing Reflector Strip
  const postGroup = new THREE.Group();
  const postStem = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.08), sharedPostBodyMat);
  postStem.position.y = 0.58;
  const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.1), sharedReflectorMat);
  reflector.position.y = 0.92;
  postGroup.add(postStem, reflector);
  holder.add(postGroup);

  const side = index % 2 === 0 ? -1 : 1;
  const isNearRoad = index % 3 === 0;
  const offset = isNearRoad ? side * 9.35 : side * (16 + ((index * 17) % 85));
  const randomScale = 0.82 + (index % 7) * 0.11;

  holder.scale.setScalar(isNearRoad ? 1.0 : randomScale);
  holder.rotation.y = (index * 1.7) % (Math.PI * 2);

  holder.userData = {
    side,
    isNearRoad,
    offset,
    zOffset: -index * (TOTAL_LENGTH / SCENERY_COUNT),
    pineGroup,
    palmGroup,
    cactusGroup,
    postGroup,
  };

  sceneryGroup.add(holder);
  sceneryObjects.push(holder);
}

for (let i = 0; i < SCENERY_COUNT; i++) {
  createSceneryItem(i);
}

// Sculpted 1980s Retrowave Wedge Supercar (Countach / Testarossa Inspired)
const carGroup = new THREE.Group();
scene.add(carGroup);

// 80s Pearlescent Miami White / Chrome-Silver Synthwave Finish with Clearcoat
const bodyPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0xf1f5f9,
  metalness: 0.62,
  roughness: 0.18,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
});
const trimBlackMat = new THREE.MeshStandardMaterial({
  color: 0x0f141c,
  metalness: 0.35,
  roughness: 0.45,
});
const glassCanopyMat = new THREE.MeshPhysicalMaterial({
  color: 0x090b14,
  metalness: 0.95,
  roughness: 0.06,
  clearcoat: 1.0,
});
const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
const neonAmberMat = new THREE.MeshBasicMaterial({ color: 0xff9e00 });
const exhaustMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.18 });

// 1. Sharp Front Chin Spoiler & Ground-Effect Side Skirts
const chinSpoiler = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.11, 4.86), trimBlackMat);
chinSpoiler.position.set(0, 0.23, 0);
carGroup.add(chinSpoiler);

// Neon Cyan Retrowave Underglow Strip + Road Reflection Light
const underglowStrip = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.03, 3.8), neonCyanMat);
underglowStrip.position.set(0, 0.17, 0);
carGroup.add(underglowStrip);

const underglowLight = new THREE.PointLight(0x00f5d4, 0.85, 8.5);
underglowLight.position.set(0, 0.25, 0);
carGroup.add(underglowLight);

// 2. Angular 80s Wedge Main Fuselage
const lowerWedge = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.38, 4.72), bodyPaintMat);
lowerWedge.position.set(0, 0.46, 0);
carGroup.add(lowerWedge);

// Iconic 80s Wrap-Around Black Bumper Rub-Strip & Side Impact Line
const bumperBelt = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.055, 4.78), trimBlackMat);
bumperBelt.position.set(0, 0.43, 0);
carGroup.add(bumperBelt);

// Sloped Razor-Sharp Front Hood / Nose Wedge
const noseWedge = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.24, 1.85), bodyPaintMat);
noseWedge.position.set(0, 0.53, -1.52);
noseWedge.rotation.x = 0.14;
carGroup.add(noseWedge);

// Recessed Center Hood Vent & NACA Ducts
const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.65), trimBlackMat);
hoodVent.position.set(0, 0.61, -1.45);
hoodVent.rotation.x = 0.14;
carGroup.add(hoodVent);

// 3. Testarossa-Style Side Strake Louvers (Horizontal Side Air Intakes)
const sideIntakeBoxL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 1.95), trimBlackMat);
sideIntakeBoxL.position.set(-1.05, 0.5, 0.15);
const sideIntakeBoxR = sideIntakeBoxL.clone();
sideIntakeBoxR.position.x = 1.05;
carGroup.add(sideIntakeBoxL, sideIntakeBoxR);

for (let s = 0; s < 4; s++) {
  const yStrake = 0.38 + s * 0.075;
  const strakeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 2.02), bodyPaintMat);
  strakeL.position.set(-1.05, yStrake, 0.15);
  const strakeR = strakeL.clone();
  strakeR.position.x = 1.05;
  carGroup.add(strakeL, strakeR);
}

// 4. Boxy Countach Flared Wheel Arch Fenders
const archGeo = new THREE.BoxGeometry(0.24, 0.36, 1.08);
const archFL = new THREE.Mesh(archGeo, bodyPaintMat);
archFL.position.set(-1.04, 0.54, -1.42);
const archFR = archFL.clone();
archFR.position.x = 1.04;

const archRearGeo = new THREE.BoxGeometry(0.28, 0.42, 1.18);
const archRL = new THREE.Mesh(archRearGeo, bodyPaintMat);
archRL.position.set(-1.06, 0.58, 1.38);
const archRR = archRL.clone();
archRR.position.x = 1.06;
carGroup.add(archFL, archFR, archRL, archRR);

// Rear Upper Engine Deck Haunches & Periscope Air Scoops
const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.28, 1.75), bodyPaintMat);
rearDeck.position.set(0, 0.72, 1.45);
carGroup.add(rearDeck);

const scoopL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.78), trimBlackMat);
scoopL.position.set(-0.68, 0.88, 1.15);
const scoopR = scoopL.clone();
scoopR.position.x = 0.68;
carGroup.add(scoopL, scoopR);

// 5. Open-Top 1980s Cabriolet (Spyder) Cockpit, Interior & Speedster Tonneau
const windshieldGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b1528,
  metalness: 0.25,
  roughness: 0.05,
  transparent: true,
  opacity: 0.58,
  clearcoat: 1.0,
});
const leatherMat = new THREE.MeshStandardMaterial({
  color: 0x1c1917,
  roughness: 0.65,
  metalness: 0.1,
});
const seatAccentMat = new THREE.MeshStandardMaterial({
  color: 0x334155,
  roughness: 0.55,
});
const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });

// Frameless Raked Cabrio Windshield + A-Pillars
const windshieldGlass = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.46, 0.05), windshieldGlassMat);
windshieldGlass.position.set(0, 0.84, -0.58);
windshieldGlass.rotation.x = -0.68;
carGroup.add(windshieldGlass);

const aPillarGeo = new THREE.BoxGeometry(0.06, 0.48, 0.07);
const aPillarL = new THREE.Mesh(aPillarGeo, trimBlackMat);
aPillarL.position.set(-0.8, 0.84, -0.58);
aPillarL.rotation.x = -0.68;
const aPillarR = aPillarL.clone();
aPillarR.position.x = 0.8;
const topHeader = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.05, 0.07), trimBlackMat);
topHeader.position.set(0, 1.01, -0.43);
carGroup.add(aPillarL, aPillarR, topHeader);

// Rearview Mirror suspended on windshield header
const rearViewMirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.06), trimBlackMat);
rearViewMirror.position.set(0, 0.96, -0.4);
carGroup.add(rearViewMirror);

// Recessed Open Cabin Tub Floor & Center Console Tunnel
const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.1, 1.45), trimBlackMat);
cabinFloor.position.set(0, 0.52, 0.05);
const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 1.38), leatherMat);
centerConsole.position.set(0, 0.62, 0.02);
carGroup.add(cabinFloor, centerConsole);

// 80s Gated Shifter on Center Console
const shiftGate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.18), exhaustMat);
shiftGate.position.set(0, 0.75, -0.12);
const shiftStick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), exhaustMat);
shiftStick.position.set(0, 0.82, -0.12);
shiftStick.rotation.x = -0.18;
const shiftKnob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), trimBlackMat);
shiftKnob.position.set(0, 0.9, -0.14);
carGroup.add(shiftGate, shiftStick, shiftKnob);

// 80s Digital Synthwave Dashboard Binnacle & Steering Wheel
const dashBoard = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.26, 0.42), leatherMat);
dashBoard.position.set(0, 0.72, -0.62);
const digiCluster = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.04), neonCyanMat);
digiCluster.position.set(-0.42, 0.78, -0.41);
const radioScreen = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.04), neonPinkMat);
radioScreen.position.set(0, 0.74, -0.41);
carGroup.add(dashBoard, digiCluster, radioScreen);

const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.024, 8, 18), trimBlackMat);
steeringWheel.position.set(-0.42, 0.78, -0.28);
steeringWheel.rotation.x = -0.32;
carGroup.add(steeringWheel);

// Twin 80s Ribbed Sports Bucket Seats + Headrests
[-0.44, 0.44].forEach((seatX) => {
  const seatGroup = new THREE.Group();
  seatGroup.position.set(seatX, 0.58, 0.22);

  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.52), leatherMat);
  cushion.position.set(0, 0.04, -0.06);

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.11), leatherMat);
  backrest.position.set(0, 0.26, 0.18);
  backrest.rotation.x = -0.22;

  // Ribbed Daytona-style seat inserts
  for (let r = 0; r < 3; r++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.12), seatAccentMat);
    rib.position.set(0, 0.16 + r * 0.1, 0.17 - r * 0.02);
    rib.rotation.x = -0.22;
    seatGroup.add(rib);
  }

  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.09), leatherMat);
  headrest.position.set(0, 0.56, 0.25);
  headrest.rotation.x = -0.18;

  seatGroup.add(cushion, backrest, headrest);
  carGroup.add(seatGroup);
});

// Twin Aerodynamic Cabrio Speedster Humps / Roll-Hoops Behind Seats
[-0.44, 0.44].forEach((humpX) => {
  const rollHoop = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 8, 16, Math.PI), exhaustMat);
  rollHoop.position.set(humpX, 0.88, 0.56);
  carGroup.add(rollHoop);

  const speedsterFairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.65), bodyPaintMat);
  speedsterFairing.position.set(humpX, 0.86, 0.9);
  speedsterFairing.rotation.x = -0.16;
  carGroup.add(speedsterFairing);
});

// 6. Stepped Black Engine Bay Louver Vent Between Rear Deck Haunches
for (let l = 0; l < 4; l++) {
  const louverSlat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.16), trimBlackMat);
  louverSlat.position.set(0, 0.87, 1.15 + l * 0.22);
  louverSlat.rotation.x = -0.12;
  carGroup.add(louverSlat);
}

// Flag-Style Angular 80s Side Mirrors
const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.18), bodyPaintMat);
mirrorL.position.set(-1.08, 0.86, -0.68);
const mirrorR = mirrorL.clone();
mirrorR.position.x = 1.08;
carGroup.add(mirrorL, mirrorR);

// 7. Classic Countach High-Mount Delta Wing with Side Endplates
const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.055, 0.44), bodyPaintMat);
wingBlade.position.set(0, 1.12, 2.12);
wingBlade.rotation.x = -0.08;

const endplateGeo = new THREE.BoxGeometry(0.05, 0.24, 0.52);
const wingEndL = new THREE.Mesh(endplateGeo, bodyPaintMat);
wingEndL.position.set(-1.07, 1.12, 2.12);
const wingEndR = wingEndL.clone();
wingEndR.position.x = 1.07;

const strutGeo = new THREE.BoxGeometry(0.06, 0.32, 0.24);
const strutL = new THREE.Mesh(strutGeo, trimBlackMat);
strutL.position.set(-0.48, 0.96, 2.1);
const strutR = strutL.clone();
strutR.position.x = 0.48;
carGroup.add(wingBlade, wingEndL, wingEndR, strutL, strutR);

// 8. Retrowave Segmented Slatted Rear Taillight Fascia & Outrun Grid Glow
const rearFascia = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.34, 0.1), trimBlackMat);
rearFascia.position.set(0, 0.66, 2.33);
carGroup.add(rearFascia);

const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff1e56 });
// Horizontal slatted neon taillight bars + vertical dividers
for (let r = 0; r < 3; r++) {
  const tailSlat = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.042, 0.12), tailLightMat);
  tailSlat.position.set(0, 0.58 + r * 0.075, 2.34);
  carGroup.add(tailSlat);
}
for (let c = -3; c <= 3; c++) {
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.13), trimBlackMat);
  divider.position.set(c * 0.28, 0.655, 2.34);
  carGroup.add(divider);
}

// Synthwave Neon License Plate ("OUTRUN 86")
const plateBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.08), trimBlackMat);
plateBack.position.set(0, 0.4, 2.35);
const plateGlow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.09), neonCyanMat);
plateGlow.position.set(0, 0.4, 2.35);
carGroup.add(plateBack, plateGlow);

const tailGlowLight = new THREE.PointLight(0xff1e56, 1.8, 8.5);
tailGlowLight.position.set(0, 0.68, 2.75);
carGroup.add(tailGlowLight);

// 9. Motorized Pop-Up Headlight Pods + Amber Fog Light Bank
const popUpHeadlights = [];
const headlightGlassMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
[-0.68, 0.68].forEach((xPos) => {
  const podPivot = new THREE.Group();
  podPivot.position.set(xPos, 0.56, -2.02);

  const podHousing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.36), bodyPaintMat);
  podHousing.position.set(0, 0.09, -0.12);

  const podBezel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.06), trimBlackMat);
  podBezel.position.set(0, 0.09, -0.29);

  const twinLens = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.07), headlightGlassMat);
  twinLens.position.set(0, 0.09, -0.3);

  podPivot.add(podHousing, podBezel, twinLens);
  carGroup.add(podPivot);
  popUpHeadlights.push(podPivot);
});

// Lower Front Bumper Amber Retrowave Fog Lights
const fogL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.065, 0.1), neonAmberMat);
fogL.position.set(-0.68, 0.34, -2.38);
const fogR = fogL.clone();
fogR.position.x = 0.68;
carGroup.add(fogL, fogR);

// Quad Ansa-Style Angled Exhaust Tips & Rear Diffuser Fins
[-0.66, -0.48, 0.48, 0.66].forEach((xPos) => {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 12), exhaustMat);
  pipe.rotation.x = Math.PI / 2 + 0.12;
  pipe.position.set(xPos, 0.31, 2.38);
  carGroup.add(pipe);
});

// 10. Deep-Dish 80s Gold & Chrome Turbofan / Phone-Dial Wheels
const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 24);
tireGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.85 });

const chromeLipGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.39, 20);
chromeLipGeo.rotateZ(Math.PI / 2);
const chromeRimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.12 });

const goldCenterGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.4, 16);
goldCenterGeo.rotateZ(Math.PI / 2);
const goldWheelMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 });

const finGeo = new THREE.BoxGeometry(0.41, 0.48, 0.04);
const centerKnockoffGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.43, 8);
centerKnockoffGeo.rotateZ(Math.PI / 2);

const wheelPositions = [
  [-1.08, 0.42, -1.42],
  [1.08, 0.42, -1.42],
  [-1.12, 0.42, 1.38],
  [1.12, 0.42, 1.38],
];
const wheels = wheelPositions.map((pos) => {
  const wheelHub = new THREE.Group();
  wheelHub.position.set(...pos);

  const tire = new THREE.Mesh(tireGeo, tireMat);
  const chromeLip = new THREE.Mesh(chromeLipGeo, chromeRimMat);
  const goldCore = new THREE.Mesh(goldCenterGeo, goldWheelMat);
  const knockoff = new THREE.Mesh(centerKnockoffGeo, neonCyanMat);
  wheelHub.add(tire, chromeLip, goldCore, knockoff);

  // 6-Star 80s Turbofan / Campagnolo Spokes
  for (let s = 0; s < 6; s++) {
    const spoke = new THREE.Mesh(finGeo, goldWheelMat);
    spoke.rotation.x = (s / 6) * Math.PI;
    wheelHub.add(spoke);
  }

  carGroup.add(wheelHub);
  return wheelHub;
});

// Car Headlight Beams
const headLightL = new THREE.SpotLight(0xfffbeb, 4.2, 130, Math.PI / 4.5, 0.55, 1.2);
headLightL.position.set(-0.75, 0.65, -2.2);
headLightL.target.position.set(-0.75, 0.05, -38);
carGroup.add(headLightL);
carGroup.add(headLightL.target);

const headLightR = new THREE.SpotLight(0xfffbeb, 4.2, 130, Math.PI / 4.5, 0.55, 1.2);
headLightR.position.set(0.75, 0.65, -2.2);
headLightR.target.position.set(0.75, 0.05, -38);
carGroup.add(headLightR);
carGroup.add(headLightR.target);

// Soft Volumetric Headlight Cones on Road
const coneGeo = new THREE.ConeGeometry(4.4, 28, 24, 1, true);
coneGeo.rotateX(Math.PI / 2);
const coneMat = new THREE.MeshBasicMaterial({
  color: 0xfef08a,
  transparent: true,
  opacity: 0.055,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const lightCone = new THREE.Mesh(coneGeo, coneMat);
lightCone.position.set(0, 0.42, -16.2);
carGroup.add(lightCone);

/********************************************************************
 * 4. DRIVING PHYSICS, CONTROLS & DYNAMIC BIOME BLENDING
 ********************************************************************/
const state = {
  zPos: 0,
  distanceKm: 0,
  speedKmh: 118,
  cruiseSpeedKmh: 120,
  cruiseControl: true,
  laneAssist: true,
  lateralOffset: 0, // Offset from road center (-7 to +7)
  lateralVelocity: 0,
  steerInput: 0,
  throttleInput: 0,
  brakeInput: 0,
  cameraMode: 0, // 0: Chase, 1: Hood/Bonnet, 2: Panoramic Drone
  headlightsOn: true,
  zenMode: false,
  currentBiomeIdx: 0,
  targetBiomeIdx: 0,
  biomeLerp: 1.0,
  // Celestial Day-Night Cycle State (Starts during golden sunset so user watches the sunset -> moonrise -> moonset -> sunrise)
  celestialTime: 0.18,
  celestialSpeed: 0.0072, // Full day + night cycle every ~140 seconds
  cameraDragYaw: 0,
  cameraDragPitch: 0,
  isDraggingCamera: false,
};

// Base Biome Colors (before Day-Night atmospheric modulation)
const baseBiomeColors = paletteToColors(BIOME_CONFIG[0].palette);

// Dynamic Colors for smooth Biome + Day/Night transitions
const liveColors = paletteToColors(BIOME_CONFIG[0].palette);

// Celestial Palette Anchors for Day, Golden Sunset/Sunrise, Twilight, and Moonlit Night
const celestialColors = paletteToColors(CELESTIAL_PALETTE);

function blendWeightedColors(target, c1, w1, c2, w2, c3, w3, c4, w4) {
  return target.setRGB(
    c1.r * w1 + c2.r * w2 + c3.r * w3 + c4.r * w4,
    c1.g * w1 + c2.g * w2 + c3.g * w3 + c4.g * w4,
    c1.b * w1 + c2.b * w2 + c3.b * w3 + c4.b * w4,
  );
}

function cycleBiome() {
  state.currentBiomeIdx = state.targetBiomeIdx;
  state.targetBiomeIdx = (state.targetBiomeIdx + 1) % BIOMES.length;
  state.biomeLerp = 0;

  const b = BIOMES[state.targetBiomeIdx];
  document.getElementById('current-biome-label').textContent = b.name;
  const dot = document.getElementById('biome-indicator-dot');
  dot.style.backgroundColor = b.dotColor;
  dot.style.boxShadow = `0 0 10px ${b.dotColor}`;
  showToast(`HORIZON SHIFT • ${b.name.toUpperCase()}`);
}

// Update Terrain Vertices Around Current Z Position
const asphaltBaseColor = new THREE.Color(0x161922);
const asphaltWearColor = new THREE.Color(0x202430);
const shoulderColor = new THREE.Color(0x282c3a);
const guardrailColor = new THREE.Color(0x64748b);
const tempColor = new THREE.Color();

function updateRoadAndTerrainGeometry(playerZ) {
  const baseZ = Math.floor(playerZ / SEGMENT_LEN) * SEGMENT_LEN;
  const posAttr = terrainGeo.attributes.position;
  const colAttr = terrainGeo.attributes.color;

  let idx = 0;
  for (let iz = 0; iz <= Z_SEGMENTS; iz++) {
    // Extend well behind camera (+65) for Drone/Chase views and far ahead (-TOTAL_LENGTH)
    const worldZ = baseZ + 65 - iz * SEGMENT_LEN;
    const roadCenterX = roadX(worldZ);
    const roadCenterY = roadY(worldZ);
    const zStepIndex = Math.round(worldZ / SEGMENT_LEN);

    for (let ix = 0; ix <= X_SEGMENTS; ix++) {
      const u = (ix / X_SEGMENTS) * 2 - 1; // -1 to +1
      // Non-linear distribution so road & shoulders have high vertex density
      const signedPow = Math.sign(u) * Math.pow(Math.abs(u), 1.55);
      const localX = signedPow * HALF_WIDTH;
      const worldX = roadCenterX + localX;

      const distFromRoad = Math.abs(localX);
      const elevOffset = terrainElevation(worldX, worldZ, distFromRoad);
      let worldY = roadCenterY + elevOffset;

      // Subtle raised curb/shoulder lip
      if (distFromRoad >= 8.2 && distFromRoad <= 9.6) {
        worldY += 0.18;
      }

      posAttr.setXYZ(idx, worldX, worldY, worldZ);

      // Realistic Road Markings, Tire Wear Tracks, Shoulders & Multi-Landform Coloring
      if (distFromRoad < 8.1) {
        if (distFromRoad < 0.24 && Math.abs(zStepIndex % 5) < 2) {
          // Center dashed highway stripe
          tempColor.copy(liveColors.roadStripeColor);
        } else if (distFromRoad > 7.45 && distFromRoad < 7.85) {
          // Crisp painted outer fog line
          tempColor.copy(liveColors.gridColor).lerp(new THREE.Color(0xffffff), 0.35);
        } else {
          // Subtle dual-lane tire polish wear
          const laneCenterDist = Math.abs(distFromRoad - 3.8);
          const wearFactor = Math.max(0, 1.0 - laneCenterDist * 0.65);
          tempColor.copy(asphaltBaseColor).lerp(asphaltWearColor, wearFactor * 0.65);
        }
      } else if (distFromRoad < ROAD_CORRIDOR_HALF_WIDTH) {
        // Gravel shoulder & guardrail verge
        const vergeBlend = (distFromRoad - 8.1) / 3.1;
        tempColor.copy(shoulderColor).lerp(liveColors.terrainColor, vergeBlend);
        if (distFromRoad > 8.9 && distFromRoad < 9.5 && Math.abs(zStepIndex % 2) === 0) {
          tempColor.lerp(guardrailColor, 0.45);
        }
      } else if (elevOffset < -6.0) {
        // Sunken Valley / Canyon Riverbed Tint
        const depthRatio = Math.min(1.0, Math.abs(elevOffset + 6.0) / 38.0);
        tempColor.copy(liveColors.terrainColor).lerp(liveColors.gridColor, depthRatio * 0.28);
      } else {
        // Multi-stop elevation coloring: Valley Floor -> Rocky Slopes -> High Ridge Highlights & Strata
        const hRatio = Math.min(1.0, Math.max(0.0, elevOffset / 92.0));
        const strataBand = Math.sin(worldY * 0.22) * 0.06;
        if (hRatio < 0.55) {
          tempColor.copy(liveColors.terrainColor).lerp(liveColors.mountainColor, hRatio / 0.55 + strataBand);
        } else {
          const peakBlend = (hRatio - 0.55) / 0.45;
          tempColor.copy(liveColors.mountainColor).lerp(liveColors.peakColor, peakBlend * 0.9);
        }
      }

      colAttr.setXYZ(idx, tempColor.r, tempColor.g, tempColor.b);
      idx++;
    }
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}

// Recycle Roadside Scenery Along the Curving Road
function updateScenery(playerZ) {
  const targetBiome = BIOMES[state.targetBiomeIdx];
  sharedReflectorMat.color.copy(liveColors.gridColor);
  sharedFoliageMat.color.copy(liveColors.terrainColor).lerp(liveColors.gridColor, 0.28);

  for (let i = 0; i < sceneryObjects.length; i++) {
    const obj = sceneryObjects[i];
    let z = obj.userData.zOffset;

    // Wrap scenery ahead when passed
    while (z > playerZ + 25) {
      z -= TOTAL_LENGTH;
    }
    while (z < playerZ - TOTAL_LENGTH + 25) {
      z += TOTAL_LENGTH;
    }
    obj.userData.zOffset = z;

    const rX = roadX(z);
    const rY = roadY(z);
    const worldX = rX + obj.userData.offset;

    const distFromRoad = Math.abs(obj.userData.offset);
    const worldY = rY + terrainElevation(worldX, z, distFromRoad);

    obj.position.set(worldX, worldY, z);

    if (obj.userData.isNearRoad) {
      obj.userData.postGroup.visible = true;
      obj.userData.pineGroup.visible = false;
      obj.userData.palmGroup.visible = false;
      obj.userData.cactusGroup.visible = false;
      obj.rotation.y = 0;
    } else {
      obj.userData.postGroup.visible = false;
      obj.userData.pineGroup.visible = targetBiome.sceneryType === 'pines';
      obj.userData.palmGroup.visible = targetBiome.sceneryType === 'palms';
      obj.userData.cactusGroup.visible = targetBiome.sceneryType === 'cacti';
    }
  }
}

/********************************************************************
 * 5. INPUT LISTENERS & UI HOOKS
 ********************************************************************/
const input = new InputController(
  {
    onCommand(command) {
      switch (command) {
        case 'cruise':
          return toggleCruiseControl();
        case 'radioNext':
          return radio.changeStation(1);
        case 'biome':
          return cycleBiome();
        case 'camera':
          return cycleCamera();
        case 'headlights':
          return toggleHeadlights();
        case 'zen':
          return toggleZenMode();
      }
    },
    onLookStart() {
      state.isDraggingCamera = true;
    },
    onLookMove(dx, dy) {
      state.cameraDragYaw = Math.max(-0.85, Math.min(0.85, state.cameraDragYaw - dx * 0.0035));
      state.cameraDragPitch = Math.max(-0.25, Math.min(0.35, state.cameraDragPitch + dy * 0.0025));
    },
    onLookEnd() {
      state.isDraggingCamera = false;
    },
  },
  {
    lookTarget: renderer.domElement,
    touchPads: [
      { element: requireEl('touch-left'), action: 'left' },
      { element: requireEl('touch-right'), action: 'right' },
      { element: requireEl('touch-gas'), action: 'throttle' },
      { element: requireEl('touch-brake'), action: 'brake' },
    ],
  },
);

// UI Button Listeners
document.getElementById('start-journey-btn').addEventListener('click', async () => {
  await radio.init();
  const overlay = document.getElementById('ignition-overlay');
  overlay.style.opacity = '0';
  setTimeout(() => (overlay.style.display = 'none'), 700);
  showToast('ENGINE STARTED • 88.5 FM NIGHTCALL SYNTHWAVE');
});

document.getElementById('btn-biome').addEventListener('click', cycleBiome);
document.getElementById('btn-camera').addEventListener('click', cycleCamera);
document.getElementById('btn-headlights').addEventListener('click', toggleHeadlights);
document.getElementById('btn-zen').addEventListener('click', toggleZenMode);
document.getElementById('btn-cruise').addEventListener('click', toggleCruiseControl);
document.getElementById('btn-autosteer').addEventListener('click', toggleLaneAssist);

document.getElementById('radio-prev').addEventListener('click', () => radio.changeStation(-1));
document.getElementById('radio-next').addEventListener('click', () => radio.changeStation(1));
document.getElementById('radio-power').addEventListener('click', () => radio.togglePower());
document.getElementById('radio-volume').addEventListener('input', (e) => radio.setVolume(e.target.value));

function toggleCruiseControl() {
  state.cruiseControl = !state.cruiseControl;
  if (state.cruiseControl) {
    state.cruiseSpeedKmh = Math.max(80, Math.round(state.speedKmh));
  }
  updateCruiseUI();
  showToast(
    state.cruiseControl ? `CRUISE CONTROL SET AT ${state.cruiseSpeedKmh} KM/H` : 'CRUISE CONTROL OFF',
  );
}

function updateCruiseUI() {
  const btn = document.getElementById('btn-cruise');
  if (state.cruiseControl) {
    btn.className =
      'px-3 py-1 rounded-xl text-[11px] font-mono-tech font-semibold tracking-wider border transition flex items-center gap-1.5 cursor-pointer bg-emerald-500/20 border-emerald-400/50 text-emerald-300';
    btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> CRUISE: ON`;
  } else {
    btn.className =
      'px-3 py-1 rounded-xl text-[11px] font-mono-tech font-semibold tracking-wider border transition flex items-center gap-1.5 cursor-pointer bg-white/5 border-white/15 text-slate-400';
    btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-500"></span> CRUISE: OFF`;
  }
}

function toggleLaneAssist() {
  state.laneAssist = !state.laneAssist;
  const btn = document.getElementById('btn-autosteer');
  if (state.laneAssist) {
    btn.className =
      'px-3 py-1 rounded-xl text-[11px] font-mono-tech font-semibold tracking-wider border transition flex items-center gap-1.5 cursor-pointer bg-sky-500/20 border-sky-400/50 text-sky-300';
    btn.textContent = 'LANE ASSIST: ON';
    showToast('COMFORT LANE ASSIST ENABLED');
  } else {
    btn.className =
      'px-3 py-1 rounded-xl text-[11px] font-mono-tech font-semibold tracking-wider border transition flex items-center gap-1.5 cursor-pointer bg-white/5 border-white/15 text-slate-400';
    btn.textContent = 'LANE ASSIST: OFF';
    showToast('MANUAL STEERING MODE');
  }
}

function cycleCamera() {
  state.cameraMode = (state.cameraMode + 1) % CAMERA_MODES.length;
  document.getElementById('camera-label').textContent = CAMERA_MODES[state.cameraMode];
  showToast(`VIEW • ${CAMERA_MODES[state.cameraMode].toUpperCase()}`);
}

function toggleHeadlights() {
  state.headlightsOn = !state.headlightsOn;
  headLightL.visible = state.headlightsOn;
  headLightR.visible = state.headlightsOn;
  lightCone.visible = state.headlightsOn;
  // Flip motorized 80s pop-up headlights up or down
  popUpHeadlights.forEach((pod) => {
    pod.rotation.x = state.headlightsOn ? 0 : -0.42;
  });
  showToast(state.headlightsOn ? 'POP-UP HEADLIGHTS UP' : 'POP-UP HEADLIGHTS RETRACTED');
}

function toggleZenMode() {
  state.zenMode = !state.zenMode;
  const bottomHud = document.getElementById('bottom-hud');
  bottomHud.style.opacity = state.zenMode ? '0' : '1';
  bottomHud.style.pointerEvents = state.zenMode ? 'none' : 'none';
  showToast(state.zenMode ? 'ZEN HORIZON VIEW (PRESS H TO RESTORE)' : 'DASHBOARD RESTORED');
}

let toastTimer = null;
function showToast(msg) {
  const banner = document.getElementById('toast-banner');
  document.getElementById('toast-text').textContent = msg;
  banner.style.opacity = '1';
  banner.style.transform = 'translate(-50%, 0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'translate(-50%, -8px)';
  }, 2600);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/********************************************************************
 * 6. MAIN ANIMATION LOOP
 ********************************************************************/
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // 1. Smoothly Interpolate Base Biome Colors
  if (state.biomeLerp < 1.0) {
    state.biomeLerp = Math.min(1.0, state.biomeLerp + dt * 0.35);
  }
  const bFrom = BIOMES[state.currentBiomeIdx];
  const bTo = BIOMES[state.targetBiomeIdx];
  const bt = state.biomeLerp;

  for (const key of PALETTE_KEYS) baseBiomeColors[key].copy(bFrom[key]).lerp(bTo[key], bt);

  // 1B. Day/night cycle (src/sim/celestialCycle.ts)
  state.celestialTime = advanceCelestialTime(state.celestialTime, dt, state.celestialSpeed);
  const sky = celestialState(state.celestialTime);
  const skyLight = celestialLighting(sky);
  const {
    isMoon,
    elevationY: celestialElevationY,
    lateralX: celestialLateralX,
    bodyOpacity,
    phaseLabel,
  } = sky;
  const { golden: goldenWeight, day: dayWeight, twilight: twilightWeight, night: nightWeight } = sky.weights;

  const skyPhaseEl = document.getElementById('time-phase-label');
  if (skyPhaseEl && skyPhaseEl.textContent !== phaseLabel) {
    skyPhaseEl.textContent = phaseLabel;
  }

  // Compose live sky, fog, sun/moon, and terrain colors from weights
  blendWeightedColors(
    liveColors.skyTop,
    baseBiomeColors.skyTop,
    goldenWeight,
    celestialColors.daySkyTop,
    dayWeight,
    celestialColors.twilightTop,
    twilightWeight,
    celestialColors.nightTop,
    nightWeight,
  );

  blendWeightedColors(
    liveColors.skyMid,
    baseBiomeColors.skyMid,
    goldenWeight,
    celestialColors.daySkyMid,
    dayWeight,
    celestialColors.twilightMid,
    twilightWeight,
    celestialColors.nightMid,
    nightWeight,
  );

  blendWeightedColors(
    liveColors.skyHorizon,
    baseBiomeColors.skyHorizon,
    goldenWeight,
    celestialColors.dayHorizon,
    dayWeight,
    celestialColors.twilightHorizon,
    twilightWeight,
    celestialColors.nightHorizon,
    nightWeight,
  );

  liveColors.fogColor.copy(liveColors.skyHorizon).lerp(liveColors.skyMid, 0.38);

  if (isMoon > 0.5) {
    liveColors.sunColor.copy(celestialColors.moonColor);
  } else {
    liveColors.sunColor.copy(baseBiomeColors.sunColor).lerp(celestialColors.daySun, dayWeight * 0.65);
  }

  const { darkFactor } = skyLight;
  liveColors.terrainColor.copy(baseBiomeColors.terrainColor).lerp(celestialColors.nightTerrain, darkFactor);
  liveColors.mountainColor
    .copy(baseBiomeColors.mountainColor)
    .lerp(celestialColors.nightMountain, darkFactor);
  liveColors.peakColor.copy(baseBiomeColors.peakColor).lerp(celestialColors.nightPeak, darkFactor * 0.65);
  liveColors.gridColor.copy(baseBiomeColors.gridColor);
  liveColors.roadStripeColor.copy(baseBiomeColors.roadStripeColor);

  // Push updated colors & uniforms to shaders and lights
  skyUniforms.uTopColor.value.copy(liveColors.skyTop);
  skyUniforms.uMidColor.value.copy(liveColors.skyMid);
  skyUniforms.uHorizonColor.value.copy(liveColors.skyHorizon);
  skyUniforms.uSunColor.value.copy(liveColors.sunColor);
  skyUniforms.uNightFactor.value = skyLight.nightFactor;
  skyUniforms.uCelestialDir.value.fromArray(skyLight.celestialDir);

  sunUniforms.uSunColor.value.copy(liveColors.sunColor);
  sunUniforms.uHorizonColor.value.copy(liveColors.skyHorizon);
  sunUniforms.uIsMoon.value = isMoon;
  sunUniforms.uOpacity.value = bodyOpacity;

  starMat.opacity = skyLight.starOpacity;

  scene.fog.color.copy(liveColors.fogColor);
  dirLight.color.copy(liveColors.sunColor);
  dirLight.intensity = skyLight.sunIntensity;
  hemiLight.color.copy(liveColors.skyHorizon);
  hemiLight.groundColor.copy(liveColors.terrainColor);
  hemiLight.intensity = skyLight.hemiIntensity;
  carFillLight.color.copy(liveColors.skyHorizon);

  skyUniforms.uTime.value = elapsed;
  sunUniforms.uTime.value = elapsed;

  // 2. Throttle, Braking & Cruise Control Physics
  const gasPressed = input.state.isActive('throttle');
  const brakePressed = input.state.isActive('brake');
  const leftPressed = input.state.isActive('left');
  const rightPressed = input.state.isActive('right');

  if (gasPressed) {
    state.speedKmh = Math.min(220, state.speedKmh + 48 * dt);
    if (state.cruiseControl) state.cruiseSpeedKmh = Math.round(state.speedKmh);
    tailLightMat.color.setHex(0xd91636);
    tailGlowLight.intensity = 1.4;
  } else if (brakePressed) {
    state.speedKmh = Math.max(0, state.speedKmh - 75 * dt);
    tailLightMat.color.setHex(0xff2a4b);
    tailGlowLight.intensity = 3.2;
  } else {
    tailLightMat.color.setHex(0xd91636);
    tailGlowLight.intensity = 1.4;
    if (state.cruiseControl) {
      const diff = state.cruiseSpeedKmh - state.speedKmh;
      state.speedKmh += diff * 1.8 * dt;
    } else {
      // Gentle natural coasting
      state.speedKmh = Math.max(0, state.speedKmh - 12 * dt);
    }
  }

  // Advance along Endless Z Axis
  const metersPerSec = state.speedKmh / 3.6;
  state.zPos -= metersPerSec * dt;
  state.distanceKm += (metersPerSec * dt) / 1000;

  // Scroll road micro-grain texture with player motion
  asphaltBump.offset.y = state.zPos * 0.12;

  // 3. Comfort Steering & Automatic Road Curvature Following
  let steerTarget = 0;
  if (leftPressed) steerTarget = -1;
  if (rightPressed) steerTarget = 1;

  if (steerTarget !== 0) {
    state.lateralVelocity += steerTarget * 18 * dt;
  } else if (state.laneAssist) {
    // Gently relax toward the cruising lane
    const desiredLaneOffset = 2.1; // Right-hand cruising lane
    const pull = (desiredLaneOffset - state.lateralOffset) * 2.4;
    state.lateralVelocity += pull * dt;
  }

  state.lateralVelocity *= Math.pow(0.08, dt); // Smooth damping
  state.lateralOffset += state.lateralVelocity * dt;
  state.lateralOffset = Math.max(-6.2, Math.min(6.2, state.lateralOffset));

  // 4. Position & Orient Grand Tourer Car on the Curving 3D Road
  const carRoadX = roadX(state.zPos);
  const carRoadY = roadY(state.zPos);
  const lookAheadZ = state.zPos - 8.0;
  const nextRoadX = roadX(lookAheadZ);
  const nextRoadY = roadY(lookAheadZ);

  const carWorldX = carRoadX + state.lateralOffset;
  const carWorldY = carRoadY + 0.05;
  carGroup.position.set(carWorldX, carWorldY, state.zPos);
  carFillLight.position.set(carWorldX, carWorldY + 2.2, state.zPos - 1.0);

  // Compute smooth tangent heading & pitch
  const dx = nextRoadX + state.lateralOffset + state.lateralVelocity * 0.22 - carWorldX;
  const dy = nextRoadY - carRoadY;
  const dz = lookAheadZ - state.zPos;

  const yawAngle = Math.atan2(-dx, -dz);
  const pitchAngle = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
  const rollAngle = -state.lateralVelocity * 0.018;

  carGroup.rotation.set(pitchAngle, yawAngle, rollAngle, 'YXZ');

  // Spin wheels proportionally to speed
  wheels.forEach((w) => {
    w.rotation.x -= metersPerSec * dt * 1.4;
  });

  // 5. Update Camera Position Based on Selected View Mode
  if (!state.isDraggingCamera) {
    state.cameraDragYaw *= Math.pow(0.15, dt);
    state.cameraDragPitch *= Math.pow(0.15, dt);
  }

  if (state.cameraMode === 0) {
    // Chase Camera
    const camDist = 8.4 + (state.speedKmh / 220) * 1.6;
    const camHeight = 2.85 + state.cameraDragPitch * 4;
    const camOffsetX = Math.sin(yawAngle + state.cameraDragYaw) * camDist;
    const camOffsetZ = Math.cos(yawAngle + state.cameraDragYaw) * camDist;

    camera.position.lerp(
      new THREE.Vector3(carWorldX + camOffsetX, carWorldY + camHeight, state.zPos + camOffsetZ),
      10 * dt,
    );
    const lookTarget = new THREE.Vector3(
      nextRoadX + state.lateralOffset * 0.6,
      nextRoadY + 1.35,
      state.zPos - 26,
    );
    camera.lookAt(lookTarget);
    carGroup.visible = true;
  } else if (state.cameraMode === 1) {
    // Bonnet / First-Person Hood View
    const hoodX = carWorldX - Math.sin(yawAngle) * 0.6;
    const hoodZ = state.zPos - Math.cos(yawAngle) * 0.6;
    camera.position.set(hoodX, carWorldY + 1.38, hoodZ);

    const farX = roadX(state.zPos - 45) + state.lateralOffset * 0.5 + Math.sin(state.cameraDragYaw) * 20;
    const farY = roadY(state.zPos - 45) + 1.35 - state.cameraDragPitch * 12;
    camera.lookAt(farX, farY, state.zPos - 45);
    carGroup.visible = true;
  } else {
    // Panoramic Cinema Drone Cam
    const orbitAngle = elapsed * 0.22 + state.cameraDragYaw;
    const droneX = carWorldX + Math.sin(orbitAngle) * 14;
    const droneZ = state.zPos + Math.cos(orbitAngle) * 14;
    camera.position.lerp(new THREE.Vector3(droneX, carWorldY + 6.5, droneZ), 6 * dt);
    camera.lookAt(carWorldX, carWorldY + 1.2, state.zPos - 12);
    carGroup.visible = true;
  }

  // 6. Anchor Sky Dome, Starfield & Rising/Setting Sun or Moon to Player Z
  skyDome.position.set(carWorldX, carWorldY, state.zPos);
  starField.position.set(carWorldX, carWorldY * 0.5, state.zPos);
  starField.rotation.y = elapsed * 0.008;
  horizonSun.position.set(
    carWorldX + roadDerivativeX(state.zPos) * 95 + celestialLateralX,
    carWorldY + celestialElevationY,
    state.zPos - CELESTIAL_DISTANCE,
  );
  dirLight.position.set(
    carWorldX + celestialLateralX * 0.5,
    carWorldY + Math.max(25, celestialElevationY * 0.8),
    state.zPos - 260,
  );

  // 7. Rebuild Road Mesh & Scenery Around Player
  updateRoadAndTerrainGeometry(state.zPos);
  updateScenery(state.zPos);

  // 8. Update Dashboard HUD, Landform Readout & Radio Equalizer
  const currentLandform = landformBlend(state.zPos).activeName;
  const landformEl = document.getElementById('landform-label');
  if (landformEl && landformEl.textContent !== currentLandform) {
    landformEl.textContent = currentLandform;
    showToast(`ENTERING • ${currentLandform.toUpperCase()}`);
  }

  const roundedSpeed = Math.round(state.speedKmh);
  document.getElementById('speed-display').textContent = roundedSpeed;
  document.getElementById('odometer-val').textContent = state.distanceKm.toFixed(1);
  const gear = roundedSpeed === 0 ? 'P' : 'D' + Math.min(6, Math.max(1, Math.ceil(roundedSpeed / 32)));
  document.getElementById('gear-display').textContent = `GEAR ${gear}`;

  radio.updateDrivingDynamics(state.speedKmh);
  radio.updateVisualizer(elapsed);

  renderer.render(scene, camera);
}

window.onload = function () {
  animate();
};

// Test-only hooks (window.__HD__) for e2e and visual tests; stripped from production builds.
if (import.meta.env.MODE !== 'production') {
  installTestHooks({ state, BIOMES, CAMERA_MODES, renderer, clock, animate });
}
