import './style.css';

// ----------------------------------------------------------------
// 1. Quantum State & Probability Logic (Log-Normal Distribution)
// ----------------------------------------------------------------

/**
 * Computes the SHA-256 hash of a string using Web Crypto API.
 * Returns a Uint8Array.
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Maps 4 bytes starting at offset in a byte array to a float in (0, 1].
 */
function bytesToFloat(byteArray, offset) {
  const val = (byteArray[offset] << 24) | 
              (byteArray[offset + 1] << 16) | 
              (byteArray[offset + 2] << 8) | 
              byteArray[offset + 3];
  const uval = val >>> 0; // Convert to unsigned integer
  // Normalize to (0, 1]
  return (uval / 4294967296) * 0.999999 + 0.000001;
}

/**
 * Calculates a deterministic target date based on a message hash and spin.
 * Satisfies: Min 1 day, Max 12 years, Peak around 3 months.
 */
async function calculateTemporalCoordinate(message, userSpin) {
  const now = new Date();
  let searchSpin = 0;
  let finalDays = 90;
  let finalHour = 12;
  let finalMinute = 0;
  let hashHex = '';
  let finalHashBytes = null;

  const minMs = 24 * 60 * 60 * 1000; // 1 day
  const maxMs = 12 * 365.25 * 24 * 60 * 60 * 1000; // 12 years (~4383 days)

  // We search for a seed combination that fits our constraints
  while (true) {
    // Combine the message, user spin, and internal search spin
    const seed = `${message}|user:${userSpin}|ancilla:${searchSpin}`;
    const hashBytes = await sha256(seed);
    
    // Convert hash to hex for display
    const hex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Extract variables from the hash
    const u1 = bytesToFloat(hashBytes, 0); // strictly in (0, 1]
    const u2 = bytesToFloat(hashBytes, 4) - 0.000001; // in [0, 1)

    // Box-Muller transform for standard Normal distribution Z ~ N(0, 1)
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    // Log-Normal mapping: Y = e^(mu + sigma * Z)
    // Mode (peak density) is at e^(mu - sigma^2)
    // We want the peak to be around 90 days.
    // Let's set sigma = 1.0, mu = 5.50.
    // Mode = e^(5.50 - 1.0) = e^(4.50) ≈ 90 days (~3 months)
    const mu = 5.50;
    const sigma = 1.0;
    const days = Math.exp(mu + sigma * z);

    // Extract time from next bytes in the hash
    const hour = hashBytes[8] % 24;
    const minute = hashBytes[9] % 60;

    // Calculate trial date
    const trialDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    trialDate.setHours(hour, minute, 0, 0);

    const diffMs = trialDate.getTime() - now.getTime();

    // Check boundary constraints
    if (diffMs >= minMs && diffMs <= maxMs) {
      finalDays = days;
      finalHour = hour;
      finalMinute = minute;
      hashHex = hex;
      finalHashBytes = hashBytes;
      break; // Coherence collapsed successfully
    }

    searchSpin++;
    if (searchSpin > 100) {
      // Fallback clamp if we fail after 100 iterations (extremely rare)
      finalDays = Math.max(1, Math.min(4383, days));
      finalHour = hour;
      finalMinute = minute;
      hashHex = hex;
      finalHashBytes = hashBytes;
      break;
    }
  }

  // Calculate final date
  const targetDate = new Date(now.getTime() + finalDays * 24 * 60 * 60 * 1000);
  targetDate.setHours(finalHour, finalMinute, 0, 0);

  return {
    date: targetDate,
    hash: hashHex,
    hashBytes: finalHashBytes,
    days: finalDays
  };
}

// ----------------------------------------------------------------
// 2. Ambient Synthesizer & Sound FX (Web Audio API)
// ----------------------------------------------------------------
class QuantumSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.droneGain = null;
    
    this.lowOsc1 = null;
    this.lowOsc2 = null;
    this.lfo = null;
    this.isMuted = true;
    this.isActive = false;
  }

  init() {
    if (this.isActive) return;
    
    // Create audio context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime); // Start silent
    this.masterGain.connect(this.ctx.destination);

    // Reverb/Delay Simulation
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.6;
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = 0.4;
    
    // Connect delay loop
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.delayNode);
    this.delayNode.connect(this.masterGain);

    this.setupDrone();
    this.isActive = true;
    
    // Start ambient sequence
    this.startAmbientMelody();
  }

  setupDrone() {
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    // Deep minor chord drone (e.g., A1 = 55Hz and C2 = 65.4Hz)
    this.lowOsc1 = this.ctx.createOscillator();
    this.lowOsc1.type = 'triangle';
    this.lowOsc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

    this.lowOsc2 = this.ctx.createOscillator();
    this.lowOsc2.type = 'sawtooth';
    this.lowOsc2.frequency.setValueAtTime(55.2, this.ctx.currentTime); // Detune slightly for chorus

    // Lowpass filter to make it warm and eerie
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(180, this.ctx.currentTime);

    // Modulate lowpass frequency with LFO for movement
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime); // 0.2 Hz LFO
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 40; // Oscilate filter between 140Hz and 220Hz

    this.lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);

    // Connect nodes
    this.lowOsc1.connect(lowpass);
    this.lowOsc2.connect(lowpass);
    lowpass.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    // Start oscillators
    this.lowOsc1.start();
    this.lowOsc2.start();
    this.lfo.start();
  }

  startAmbientMelody() {
    // Generative ambient crystal bell notes
    const notes = [220.00, 261.63, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]; // A minor pentatonic
    
    const playNext = () => {
      if (!this.isActive || this.isMuted) {
        setTimeout(playNext, 3000 + Math.random() * 4000);
        return;
      }

      // Randomly pick a note
      const freq = notes[Math.floor(Math.random() * notes.length)];
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 1.5); // Slow attack
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 6.0); // Long decay

      osc.connect(gain);
      gain.connect(this.delayNode);
      gain.connect(this.masterGain);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 6.5);

      // Schedule next note in 4-8 seconds
      setTimeout(playNext, 4000 + Math.random() * 4000);
    };

    setTimeout(playNext, 2000);
  }

  playTick() {
    if (!this.isActive || this.isMuted) return;
    
    // Keystroke synthesis: brief high pass filter noise or tiny pulse
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    // Slightly randomize frequency for digital feeling
    osc.frequency.setValueAtTime(1000 + Math.random() * 600, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.008, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playSweep(duration, callback) {
    if (!this.isActive) {
      if (callback) setTimeout(callback, duration * 1000);
      return;
    }

    // Charging sound: rise in volume and pitch of low drone, and addition of high synth pad
    const t = this.ctx.currentTime;
    
    // Ramp up drone filter frequency
    this.lfo.frequency.linearRampToValueAtTime(8.0, t + duration); // Speed up LFO

    // Add rising sweep oscillator
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(110, t);
    sweepOsc.frequency.exponentialRampToValueAtTime(880, t + duration);

    // Filter for sweep
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.0;
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(3000, t + duration);

    sweepGain.gain.setValueAtTime(0.001, t);
    sweepGain.gain.linearRampToValueAtTime(0.08, t + duration * 0.8);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    sweepOsc.connect(filter);
    filter.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweepGain.connect(this.delayNode);

    sweepOsc.start();
    sweepOsc.stop(t + duration + 0.1);

    if (callback) {
      setTimeout(callback, duration * 1000);
    }
  }

  playCollapseChime() {
    if (!this.isActive || this.isMuted) return;

    const t = this.ctx.currentTime;
    
    // Reset LFO speed
    this.lfo.frequency.setValueAtTime(0.2, t);

    // Deep sub drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, t);
    subOsc.frequency.exponentialRampToValueAtTime(40, t + 1.2);
    
    subGain.gain.setValueAtTime(0.25, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start();
    subOsc.stop(t + 1.6);

    // High crystalline chime (major triad or fifth chime)
    const frequencies = [880, 1100, 1320, 1760]; // A triad chime
    frequencies.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + index * 0.05); // slight arpeggio delay
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.05, t + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + index * 0.1);

      osc.connect(gain);
      gain.connect(this.delayNode);
      gain.connect(this.masterGain);
      
      osc.start();
      osc.stop(t + 3.0 + index * 0.1);
    });
  }

  playErasureSound() {
    if (!this.isActive || this.isMuted) return;

    const t = this.ctx.currentTime;

    // Dissolve noise sound: white noise with decreasing bandpass filter
    // Construct buffer source for noise
    const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 1.2);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    noise.stop(t + 1.5);

    // Eerie high bell pitch slide downwards
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(150, t + 1.0);

    oscGain.gain.setValueAtTime(0.04, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start();
    osc.stop(t + 1.3);
  }

  setMute(mute) {
    this.isMuted = mute;
    if (!this.isActive) {
      this.init();
    }
    
    if (this.masterGain) {
      const targetVolume = this.isMuted ? 0 : 0.35;
      this.masterGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.3);
    }
  }
}

const synth = new QuantumSynth();

// ----------------------------------------------------------------
// 3. Canvas Wave Function Particles Animation
// ----------------------------------------------------------------
class ParticlePortal {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.state = 'idle'; // 'idle', 'typing', 'collapsing', 'collapsed', 'erasing'
    this.width = 0;
    this.height = 0;
    
    this.portalX = 0;
    this.portalY = 0;
    this.portalRadius = 130;
    this.collapseTime = 0;
    this.collapseProgress = 0;
    
    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.createParticles(350);
    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // Position center portal
    this.portalX = this.width / 2;
    // Align with card center (approx 350px down)
    this.portalY = 320;
  }

  createParticles(count) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      // Pick a random orbital range
      const distance = 80 + Math.random() * 220;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.003 + Math.random() * 0.006) * (Math.random() > 0.5 ? 1 : -1);
      
      // Select cyan, magenta, or purple
      const hueChoice = Math.random();
      let hue = 270; // Purple
      if (hueChoice < 0.33) hue = 180; // Teal/Cyan
      else if (hueChoice < 0.66) hue = 320; // Magenta

      this.particles.push({
        baseDistance: distance,
        distance: distance,
        angle: angle,
        speed: speed,
        size: 0.8 + Math.random() * 1.5,
        hue: hue,
        saturation: 30 + Math.random() * 15,
        lightness: 40 + Math.random() * 12,
        alpha: 0.12 + Math.random() * 0.35,
        radialOffset: Math.random() * Math.PI * 2,
        radialSpeed: 0.02 + Math.random() * 0.03,
        x: 0,
        y: 0
      });
    }
  }

  setState(newState) {
    this.state = newState;
    if (newState === 'collapsing') {
      this.collapseTime = Date.now();
    } else if (newState === 'erasing') {
      this.particles.forEach(p => {
        // Give particles outward explosion speed
        p.speed *= 5;
        p.radialVelocity = 12 + Math.random() * 18;
      });
      setTimeout(() => {
        this.setState('idle');
        this.createParticles(350);
      }, 1500);
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Subtle background cosmos glow
    const radialGlow = this.ctx.createRadialGradient(
      this.portalX, this.portalY, 0,
      this.portalX, this.portalY, this.portalRadius * 2.5
    );
    radialGlow.addColorStop(0, 'rgba(15, 10, 30, 0.08)');
    radialGlow.addColorStop(0.5, 'rgba(5, 3, 15, 0.02)');
    radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = radialGlow;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const tNow = Date.now();

    this.particles.forEach(p => {
      if (this.state === 'idle') {
        p.angle += p.speed;
        // Natural gentle waving motion
        const wave = Math.sin(tNow * p.radialSpeed + p.radialOffset) * 8;
        p.distance = p.baseDistance + wave;
        p.alpha = Math.max(0.1, p.alpha - 0.001); // smooth stabilization
      } 
      else if (this.state === 'typing') {
        p.angle += p.speed * 2.2;
        // Agitated wave motion
        const wave = Math.sin(tNow * p.radialSpeed * 3 + p.radialOffset) * 18;
        p.distance = p.baseDistance + wave;
        p.alpha = Math.min(0.8, p.alpha + 0.02);
      } 
      else if (this.state === 'collapsing') {
        // Accelerate spin & pull directly into center point
        const elapsed = tNow - this.collapseTime;
        const duration = 2500; // 2.5 seconds collapse
        const progress = Math.min(1, elapsed / duration);
        this.collapseProgress = progress;

        p.angle += p.speed * (1 + progress * 20);
        // Exponential pull-in
        const easeInQuad = progress * progress;
        p.distance = p.baseDistance * (1 - easeInQuad);
        
        // Increase opacity as they condense
        p.alpha = (0.2 + progress * 0.8);
      } 
      else if (this.state === 'collapsed') {
        p.distance = 0;
        p.alpha = 0;
      }
      else if (this.state === 'erasing') {
        p.angle += p.speed;
        p.distance += p.radialVelocity;
        p.radialVelocity *= 0.95; // decelerate explosion
        p.alpha -= 0.012; // fade out
      }

      // Convert polar coordinates to Cartesian relative to portal center
      p.x = this.portalX + Math.cos(p.angle) * p.distance;
      p.y = this.portalY + Math.sin(p.angle) * p.distance;

      // Draw particle
      this.ctx.fillStyle = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${p.alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw central elements based on state
    if (this.state === 'collapsed') {
      // Static pulsating glow core
      const pulseSize = 6 + Math.sin(tNow * 0.006) * 2;
      const coreGlow = this.ctx.createRadialGradient(
        this.portalX, this.portalY, 0,
        this.portalX, this.portalY, 30
      );
      coreGlow.addColorStop(0, '#ffffff');
      coreGlow.addColorStop(0.2, 'rgba(79, 139, 150, 0.5)');
      coreGlow.addColorStop(0.6, 'rgba(114, 90, 148, 0.15)');
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      this.ctx.fillStyle = coreGlow;
      this.ctx.beginPath();
      this.ctx.arc(this.portalX, this.portalY, 30, 0, Math.PI * 2);
      this.ctx.fill();

      // Sharp central white spark
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(this.portalX, this.portalY, pulseSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    } 
    else if (this.state === 'collapsing') {
      // Draw quantum coordinate intersection lines
      const strokeVal = Math.floor(this.collapseProgress * 50);
      this.ctx.strokeStyle = `rgba(79, 139, 150, ${this.collapseProgress * 0.3})`;
      this.ctx.lineWidth = 0.5;
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.portalX - 200, this.portalY);
      this.ctx.lineTo(this.portalX + 200, this.portalY);
      this.ctx.moveTo(this.portalX, this.portalY - 200);
      this.ctx.lineTo(this.portalX, this.portalY + 200);
      this.ctx.stroke();
      
      // Draw an outer ring collapse
      this.ctx.strokeStyle = `rgba(163, 111, 137, ${1 - this.collapseProgress})`;
      this.ctx.beginPath();
      this.ctx.arc(this.portalX, this.portalY, 150 * (1 - this.collapseProgress), 0, Math.PI*2);
      this.ctx.stroke();
    }

    requestAnimationFrame(() => this.animate());
  }
}

let portal = null;

// ----------------------------------------------------------------
// 4. Application Flow & UI Controller
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Initialize canvas portal
  portal = new ParticlePortal('quantum-canvas');

  // DOM Elements
  const audioToggle = document.getElementById('audio-toggle');
  const volumeIcon = document.getElementById('volume-icon');
  const muteX = volumeIcon.querySelector('.mute-x');
  const wavesMid = volumeIcon.querySelector('.wave-mid');
  const wavesOuter = volumeIcon.querySelector('.wave-outer');
  const audioStatusText = document.getElementById('audio-status-text');

  const reminderText = document.getElementById('reminder-text');
  const charCount = document.getElementById('char-count');
  const ancillaSpin = document.getElementById('ancilla-spin');
  const ancillaVal = document.getElementById('ancilla-val');
  const quantumForm = document.getElementById('quantum-form');

  const revealToggle = document.getElementById('reveal-toggle');
  const revealLabel = document.getElementById('reveal-label');
  const revealEye = document.getElementById('reveal-eye');
  const revealEyeOff = document.getElementById('reveal-eye-off');
  let dateRevealed = false; // the collapsed date starts concealed; reveal on demand

  // Header "coherence" readout: mostly hovers 95-100%, with occasional dips.
  const coherenceVal = document.getElementById('coherence-val');
  function tickCoherence() {
    const r = Math.random();
    let pct;
    if (r < 0.72) pct = 95 + Math.random() * 5;        // usual: 95-100%
    else if (r < 0.92) pct = 90 + Math.random() * 5;   // occasional: 90-95%
    else if (r < 0.99) pct = 82 + Math.random() * 8;   // rare dip: 82-90%
    else pct = 70 + Math.random() * 12;                // very rare: 70-82%
    coherenceVal.textContent = String(Math.round(Math.min(100, pct)));
    setTimeout(tickCoherence, 5000 + Math.random() * 4000);
  }
  tickCoherence(); // start drifting right away
  
  const screenInput = document.getElementById('screen-input');
  const screenCollapsing = document.getElementById('screen-collapsing');
  const screenResult = document.getElementById('screen-result');

  const terminalLines = document.getElementById('terminal-lines');
  const loadingBar = document.getElementById('loading-bar');
  
  const targetDateEl = document.getElementById('target-date');
  const targetTimeEl = document.getElementById('target-time');
  const targetRelativeEl = document.getElementById('target-relative');
  
  const btnCopy = document.getElementById('btn-copy');
  const btnGcal = document.getElementById('btn-gcal');
  const btnIcal = document.getElementById('btn-ical');
  
  const detailsToggle = document.getElementById('details-toggle');
  const detailsDrawer = document.getElementById('details-drawer');
  
  const metricPsi = document.getElementById('metric-psi');
  const metricTheta = document.getElementById('metric-theta');
  const metricEntropy = document.getElementById('metric-entropy');
  const metricT2 = document.getElementById('metric-t2');
  const metricHash = document.getElementById('metric-hash');

  const eraseBtn = document.getElementById('erase-btn');

  // Cached state for calculation results
  let collapsedState = {
    message: '',
    date: null,
    hash: ''
  };

  // Audio Toggle Logic
  audioToggle.addEventListener('click', () => {
    const isMuted = !synth.isMuted;
    synth.setMute(isMuted);

    if (isMuted) {
      muteX.classList.remove('hidden');
      wavesMid.classList.add('hidden');
      wavesOuter.classList.add('hidden');
      audioStatusText.innerText = 'AMBIENT OFF';
      audioToggle.title = 'Enable Ambient Coherence Frequencies';
    } else {
      muteX.classList.add('hidden');
      wavesMid.classList.remove('hidden');
      wavesOuter.classList.remove('hidden');
      audioStatusText.innerText = 'AMBIENT ON';
      audioToggle.title = 'Mute Ambient Frequencies';
    }
  });

  // Interactivity: Typing effect and keystroke sounds
  reminderText.addEventListener('input', (e) => {
    const text = e.target.value;
    charCount.innerText = text.length;

    // Trigger audio key tick
    synth.playTick();

    // Accelerate particles while typing to show resonance
    if (text.length > 0) {
      if (portal.state === 'idle') {
        portal.setState('typing');
      }
    } else {
      portal.setState('idle');
    }
  });

  reminderText.addEventListener('blur', () => {
    if (reminderText.value.length === 0 && portal.state === 'typing') {
      portal.setState('idle');
    }
  });

  // Slider adjustment
  ancillaSpin.addEventListener('input', (e) => {
    const val = e.target.value;
    ancillaVal.innerText = `Spin-${val} (ψ${getSubscriptChar(val)})`;
    synth.playTick();
  });

  function getSubscriptChar(val) {
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇'];
    return subscripts[val] || val;
  }

  // The collapsed date starts hidden on the result screen (the redacted look).
  // A reveal/hide button lets the user peek and re-conceal at will. Either way
  // the real date is still written into the calendar export actions below, so
  // you can anchor a reminder without ever seeing when it will surface.
  function renderTargetDate() {
    const d = collapsedState && collapsedState.date;
    if (!d) return;
    if (dateRevealed) {
      const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
      targetDateEl.innerText = d.toLocaleDateString(undefined, optionsDate);
      targetTimeEl.innerText = d.toLocaleTimeString(undefined, optionsTime);
      targetRelativeEl.innerText = getRelativeString(d);
    } else {
      targetDateEl.innerText = '▓▓▓▓▓ ▓▓, ▓▓▓▓';
      targetTimeEl.innerText = '▓▓:▓▓';
      targetRelativeEl.innerText = 'hidden until it arrives';
    }
  }

  function updateRevealButton() {
    revealLabel.textContent = dateRevealed ? 'hide date' : 'reveal date';
    revealEye.classList.toggle('hidden', dateRevealed);
    revealEyeOff.classList.toggle('hidden', !dateRevealed);
    revealToggle.setAttribute('aria-pressed', String(dateRevealed));
  }

  revealToggle.addEventListener('click', () => {
    dateRevealed = !dateRevealed;
    renderTargetDate();
    updateRevealButton();
    synth.playTick();
  });

  // Form submit: Start collapsing process
  quantumForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = reminderText.value.trim();
    if (!msg) return;

    const spin = parseInt(ancillaSpin.value, 10);
    
    // 1. Move to collapsing screen
    screenInput.classList.remove('active');
    screenInput.classList.add('hidden');
    screenCollapsing.classList.remove('hidden');
    screenCollapsing.classList.add('active');

    // Update portal state
    portal.setState('collapsing');

    // 2. Play sweep sound
    synth.playSweep(2.5);

    // 3. Perform the calculation (async)
    const result = await calculateTemporalCoordinate(msg, spin);
    collapsedState = {
      message: msg,
      date: result.date,
      hash: result.hash
    };

    // Calculate details deterministically for the metrics drawer
    const hBytes = result.hashBytes;
    
    // Wave amplitude: psi = a + bi, where a = hBytes[20]/255, a^2 + b^2 = 1
    const a = (hBytes[20] / 255) * 0.9 + 0.05; // avoid pure 0 or 1
    const b = Math.sqrt(1 - a * a);
    const psiStr = `${a.toFixed(3)} + ${b.toFixed(3)}i`;
    
    // Phase: theta = angle in rad, based on hBytes[21]
    const theta = (hBytes[21] / 255) * Math.PI * 2;
    const thetaStr = `${theta.toFixed(3)} rad`;
    
    // Entropy: map hBytes[22] to entropy between 1.0 and 2.5 qubits
    const entropy = 1.0 + (hBytes[22] / 255) * 1.5;
    const entropyStr = `${entropy.toFixed(3)} qubits`;
    
    // T2 Decoherence Time: map hBytes[23] to range 1e-13 to 9e-13 s
    const t2 = (1.0 + (hBytes[23] / 255) * 8.0) * 1e-13;
    const t2Str = `${t2.toExponential(2)} s`;

    // 4. Run simulated terminal printing logs
    const logs = [
      { text: "INITIALIZING QUANTUM MULTIPLEXER ARRAY...", delay: 0 },
      { text: `QUBIT REGISTERS COHERENT WITH ANCILLA ψ${getSubscriptChar(spin)}`, delay: 350 },
      { text: "APPLYING HADAMARD ENCODINGS // WAVE FUNCTION AMPLIFIED", delay: 700 },
      { text: "DETERMINING SPIN RESONANCE AND DENSITY PROJECTION...", delay: 1100, class: 'accent-line' },
      { text: `COHERENCE ENTROPY MATCHED: ${entropyStr}`, delay: 1550 },
      { text: "COLLAPSING WAVE STATE ALONG GEODESIC AXIS...", delay: 1950, class: 'magenta-line' },
      { text: "SUCCESS: SPACE-TIME DELAY SOLVED DETERMINISTICALLY", delay: 2350 }
    ];

    // Reset terminal display
    terminalLines.innerHTML = '';
    
    // Animate progress bar & terminal lines
    const startProgress = Date.now();
    const duration = 2500;
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startProgress;
      const pct = Math.min(100, (elapsed / duration) * 100);
      loadingBar.style.width = `${pct}%`;
      
      if (elapsed >= duration) {
        clearInterval(progressInterval);
      }
    }, 30);

    logs.forEach(log => {
      setTimeout(() => {
        const line = document.createElement('div');
        if (log.class) line.className = log.class;
        line.innerText = `> ${log.text}`;
        terminalLines.appendChild(line);
        // Scroll terminal to bottom
        terminalLines.scrollTop = terminalLines.scrollHeight;
      }, log.delay);
    });

    // 5. Complete transition
    setTimeout(() => {
      // Play final chime
      synth.playCollapseChime();
      portal.setState('collapsed');

      // Populate results. The date starts hidden; the reveal button on the
      // result screen lets the user show it (and hide it again) on demand.
      dateRevealed = false;
      renderTargetDate();
      updateRevealButton();

      // Populate metric values
      metricPsi.innerText = psiStr;
      metricTheta.innerText = thetaStr;
      metricEntropy.innerText = entropyStr;
      metricT2.innerText = t2Str;
      metricHash.innerText = result.hash;

      // Update calendar button links
      setupCalendarActions(result.date, msg);

      // Hide loading, show results
      screenCollapsing.classList.remove('active');
      screenCollapsing.classList.add('hidden');
      screenResult.classList.remove('hidden');
      screenResult.classList.add('active');
    }, 2800);
  });

  // Calculate relative text (e.g. "in 3 months, 2 days")
  function getRelativeString(targetDate) {
    const diffMs = targetDate.getTime() - new Date().getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours === 0) {
        return `in ${diffMins} minutes`;
      }
      return `in ${diffHours} hours, ${diffMins % 60} minutes`;
    }

    if (diffDays < 30) {
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}, ${diffHours % 24} hour${diffHours % 24 !== 1 ? 's' : ''}`;
    }

    const months = Math.floor(diffDays / 30.44);
    const remainingDays = Math.floor(diffDays % 30.44);

    if (months < 12) {
      return `in ${months} month${months > 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    return `in ${years} year${years > 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
  }

  // Setup Google Calendar & iCal Export Buttons
  function setupCalendarActions(date, message) {
    const startISO = date.toISOString().replace(/-|:|\.\d\d\d/g, "");
    // Default 30 min duration
    const endDate = new Date(date.getTime() + 30 * 60 * 1000);
    const endISO = endDate.toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    // Google Calendar URL
    const title = encodeURIComponent("📩 You have one quantum mail!");
    const details = encodeURIComponent(`The quantum wave function has decohered.\n\nYour reminder text:\n"${message}"\n\nCoordinates mapped via Quantum Reminder Calculator.`);
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startISO}/${endISO}&details=${details}`;
    
    btnGcal.onclick = () => {
      synth.playTick();
      window.open(gcalUrl, '_blank');
    };

    // iCal Downloader
    btnIcal.onclick = () => {
      synth.playTick();
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Quantum Reminder//Temporal Portal//EN
BEGIN:VEVENT
UID:${Date.now()}@quantum.reminder
DTSTAMP:${new Date().toISOString().replace(/-|:|\.\d\d\d/g, "")}
DTSTART:${startISO}
DTEND:${endISO}
SUMMARY:📩 You have one quantum mail!
DESCRIPTION:The quantum wave function has decohered.\\n\\nYour reminder text:\\n"${message.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"\\n\\nCoordinates mapped via Quantum Reminder Calculator.
END:VEVENT
END:VCALENDAR`;
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'quantum-reminder.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Copy to Clipboard
    btnCopy.onclick = () => {
      synth.playTick();
      const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
      
      const copyText = `Coordinate: ${date.toLocaleDateString(undefined, optionsDate)} at ${date.toLocaleTimeString(undefined, optionsTime)} (${getRelativeString(date)})
Reminder: "${message}"`;
      
      navigator.clipboard.writeText(copyText).then(() => {
        const span = btnCopy.querySelector('span');
        const originalText = span.innerText;
        span.innerText = 'Copied!';
        btnCopy.style.borderColor = 'var(--color-quantum-green)';
        setTimeout(() => {
          span.innerText = originalText;
          btnCopy.style.borderColor = '';
        }, 1500);
      });
    };
  }

  // Toggle Quantum details metrics
  detailsToggle.addEventListener('click', () => {
    synth.playTick();
    const isExpanded = detailsDrawer.classList.contains('active');
    
    if (isExpanded) {
      detailsDrawer.classList.remove('active');
      detailsToggle.classList.remove('active');
    } else {
      detailsDrawer.classList.add('active');
      detailsToggle.classList.add('active');
    }
  });

  // Erasure Protocol Action
  eraseBtn.addEventListener('click', () => {
    // 1. Play dissolution audio
    synth.playErasureSound();

    // 2. Set portal canvas to explosive scattering
    portal.setState('erasing');

    // 3. Visual fade effects
    screenResult.classList.remove('active');
    screenResult.classList.add('hidden');
    
    // Clear variables immediately
    collapsedState = {
      message: '',
      date: null,
      hash: ''
    };
    
    reminderText.value = '';
    charCount.innerText = '0';
    ancillaSpin.value = '0';
    ancillaVal.innerText = 'Spin-0 (ψ₀)';

    // Make metrics drawer collapsed again
    detailsDrawer.classList.remove('active');
    detailsToggle.classList.remove('active');

    // 4. Return to welcome screen
    setTimeout(() => {
      screenInput.classList.remove('hidden');
      screenInput.classList.add('active');
    }, 600);
  });
});
