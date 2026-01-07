export const PRELUDE = `
// Set the global BPM (beats per minute) for timing calculations
bpm=120

// Decay envelope
decay=(seconds=1,exponent=3,trig)->ad(.0001,seconds,exponent,trig)

// Convert decibels to linear gain multiplier (10^(dB/20))
db=x->10**(x/20)

// Convert bipolar signal to unipolar ([-1,1] to [0,1])
uni=x->x*.5+.5

// Convert unipolar signal to bipolar ([-1,1] to [0,1])
bi=x->x*2-1

// Crossfade between two signals
crossfade=(a,b,t)->lerp(a,b,clamp(t,0,1))

// Convert semitones to frequency multiplier (2^(semitones/12))
semis=x->2**(x/12)

// Convert mono signal to stereo, optionally with delay-based widening
stereo=(in,width=0)->[in,delay(in,seconds:width)]

// Convert stereo signal to mono by averaging channels
mono=([L,R])->(L+R)*.5

// Adjust stereo width using mid-side processing (1 = normal, 0 = mono, >1 = wider)
stereowidth=([L,R],width=1)->{
  mid=(L+R)*0.5
  side=(L-R)*0.5
  side*=width
  return [mid+side,mid-side]
}

// Widen stereo signal by delaying high frequencies in right channel
widen=([L,R],seconds=0.0001)->{
  cutoff=200
  loL=lp(L,cutoff)
  loR=lp(R,cutoff)
  hiL=hp(L,cutoff)
  hiR=hp(R,cutoff)
  return [loL+hiL,loR+delay(hiR,seconds)]
}

// Pan stereo signal (0=left, 0.5=center, 1=right)
pan=([L,R],balance=0.5)->{
  p=clamp(balance,0,1)
  return [L*(1-p),R*p]
}

// Modulated delay effect with LFO-controlled delay time
modDelay=(in,baseDelay,depth,rate,feedback,offset=0)->{
  lfo = lfosine(rate, offset)
  delayTime = baseDelay + depth * lfo
  delay(in, delayTime, feedback)
}

// Classic flanger effect (modulated comb filter)
flanger=(in,rate=1,depth=0.00125,base=0.00125,feedback=0.7)->{
  modDelay(in, base, depth, rate, feedback)
}

// Multi-voice chorus effect with spread and modulation
chorus=(in,voices=3,base=0.02,depth=0.006,rate=0.25,spread=.5)->{
  sum = 0
  voices = max(voices,1)

  for (i=0;i<voices;i++) {
    phase = (i / voices) * spread
    sum += modDelay(
      in,
      base,
      depth,
      rate,
      feedback:0,
      phase
    )
  }

  sum / voices
}

// Simple delay tap (alias for delay with callback)
tap=(in,seconds,cb)->delay(in,seconds,cb)

// Comb filter (feedforward + feedback delay)
comb=(in,seconds,feedback,cb)->in+delay(in,seconds,feedback,cb)

// 3-band equalizer with low/mid/high controls
eq3=(in,low=0,mid=0,high=0,lf=500,mf=2000,hf=8000)->{
  lo=ls(in,cutoff:lf,gain:low)
  mi=peak(in,cutoff:mf,q:1,gain:mid)
  hi=hs(in,cutoff:hf,gain:high)
  return lo+mi+hi
}

// Granular synthesis-inspired trigger generator based on speed
grain=(speed=1,seed)->step(random(seed),.999+.001*((1-clamp(speed,0,1))**.293))

// Vocoder effect using bandpass filters and envelope following
vocoder=(carrier,modulator,numBands=16,attack=.01,release=.04,freqMin=100,freqMax=8000)->{
  logRange = log(freqMax / freqMin)
  step     = logRange / (numBands - 1)
  r = exp(step)
  Q = clamp(1 / (r - 1), 1.5, 20)
  s = 0
  for (i=0; i<numBands-1; i++) {
    freq = freqMin * exp(i * step)
    modBand = bp(modulator, freq, Q)
    env     = envfollow(abs(modBand), attack, release)
    carBand = bp(carrier, freq, Q)
    s += carBand * env
  }
  s
}

// Karplus-Strong plucked string synthesis
karplus=(hz,pluck=pink,seed=334,attack=.0001,decay=.1,exponent=40,damping=.5,trig)->{
  exc = pluck(seed, trig) * ad(attack,decay,exponent,trig)
  delayTime = safediv(1, hz)
  dampingCutoff=hz*((1-damping)*63+1)
  oversample(16, () -> delay(exc,delayTime,1,x -> tanh(olp(x, dampingCutoff))))
}

// k5000
k5000=(
  hz,
  brightness=.99,
  motion=.5,
  density=12
)->{
  b = 1-clamp(brightness,0,1)
  m = clamp(motion,0,1)

  // Tilt curve (controls spectral centroid)
  tilt = 1 + 6*b

  // =====================
  // Additive engine
  // =====================
  s = 0
  maxH = min(density, floor(18000 / hz))

  for (i=1; i<=maxH; i++) {
    // Harmonic weight curve
    amp =
      exp(-log(i) * tilt)

      * (1 + m*fractal(.1 + i*.1, 1000+i))

    s += sine(hz*i) * amp
  }

  // Normalize
  s *= 1 / sqrt(maxH)

  // =====================
  // Gentle spectral polish (not subtractive!)
  // =====================
  s = ap(s, 800 + 2400*b, .6)
  s = ap(s, 1800 + 4200*b, .6)

  s
}

rhodes=(hz,vel=1,trig)->{
  v = clamp(vel,0,1)

  // Tine FM (velocity controls metallic bite)
  fmIndex = hz * (.2 + 2.8*v)
  fm = sine(hz*2.01) * fmIndex
  tine = sine(hz + fm, 0, trig)

  // Dual tone-bar resonances (slightly inharmonic)
  resonances = [
    bp(tine, hz*3.8, 7),
    bp(tine, hz*7.1, 9)
  ].sum()

  // Pickup / hammer click
  click = hp(tine, 2500, 0.7)
        * ad(.0004,.025,14,trig)
        * (.3 + .7*v)

  // Raw mix
  s = tine*.55 + resonances*.9 + click*.35

  // Envelope + velocity scaling
  s *= (.15 + .85*v)

  // Gentle saturation + DC cleanup
  s = tube(s, drive:2.0 + v, bias:.04)
  s = dc(s)

  // Pickup EQ tilt (brighter with velocity)
  s = ls(s, 250, -2*(1-v))
    + hs(s, 3200, 3*v)

  // Classic Rhodes chorus
  s = chorus(s, voices:3, rate:.22, depth:.005, spread:.6)

  s
}

/*
Softer, late-70s Rhodes character
Changes vs previous:
- Removed audio-rate FM entirely
- Uses filtered noise + short sine burst for hammer/tine attack
- Emphasizes tone-bar resonances over carrier brightness
- Lower pickup EQ tilt, less saturation
- Overall darker, woodier response
*/

rhodes2=(hz,vel=1,trig)->{
  v = clamp(vel,0,1)

  // Fundamental (very pure)
  core = sine(hz, trig)

  // Hammer / tine attack (noise, not FM)
  hammer =
    bp(pink(1234,trig), hz*2.5, 6)
    * ad(.0006,.04,10,trig)
    * (.25 + .6*v)

  // Tone-bar resonances (dominant character)
  resonances = [
    bp(core, hz*3.2, 8),
    bp(core, hz*6.4, 10)
  ].sum()

  // Slight beating via slow detune (control-rate, not audio-rate)
  det = 1 + (.002 + .004*v) * lfosine(.6)
  body = sine(hz*det) * .3

  // Mix (bars > fundamental)
  s =
    core*.35 +
    resonances*1.0 +
    body +
    hammer

  // Apply envelope + velocity
  s *= (.2 + .8*v)

  // Very gentle saturation (mostly for compression feel)
  s = tanh(s * (1.2 + .8*v))

  // Pickup EQ: dark, rounded top
  s = ls(s, 220, -1.5)
    |> hs($, 2800, 1.2*v)

  // Subtle chorus (slow + shallow)
  s = chorus(s, voices:2, rate:.15, depth:.003, spread:.4)

  s
}

cs80=(
  hz,
  vel=1,
  trig,
  cutoff=900,
  res=.6,
  brilliance=.4,
  aftertouch=.0
)->{
  v = clamp(vel,0,1)
  at = clamp(aftertouch,0,1)

  // =====================
  // Shared modulation
  // =====================
  vib = (.002 + .004*at) * lfosine(5.4)
  f   = hz * (1 + vib)

  // =====================
  // Voice I (saw-dominant, brassy)
  // =====================
  v1osc =
    saw(f,0,trig)*.7 +
    sine(f)*.3

  v1env = adsr(
    attack:.01,
    decay:.25,
    sustain:.6,
    release:1.6,
    exponent:3,
    trig
  )

  v1hp = hp(v1osc, 120 + 400*brilliance, .6)
  v1lp = mlp(
    v1hp,
    cutoff * (1 + v1env*1.5 + at*2),
    res + .15
  )

  v1 = v1lp * v1env

  // =====================
  // Voice II (pulse / sine, smoother)
  // =====================
  pw = .45 + .1*lfosine(.3)
  v2osc =
    oversample(12,()->pwm(f*1.002, pw, 0, trig))*.6 +
    sine(f*.5)*.4

  v2env = adsr(
    attack:.03,
    decay:.4,
    sustain:.5,
    release:2.4,
    exponent:3,
    trig
  )

  v2hp = hp(v2osc, 80, .7)
  v2lp = mlp(
    v2hp,
    cutoff*.7 * (1 + v2env + at*1.8),
    res*.8
  )

  v2 = v2lp * v2env

  // =====================
  // Layer mix + expressivity
  // =====================
  s = (v1 + v2) * (.25 + .75*v)

  // Signature CS-80 saturation (very gentle)
  s = tanh(s * 1.6)

  // Animate stereo (CS-80 is wide and alive)
  s = chorus(s, voices:3, rate:.18, depth:.006, spread:.7)

  s
}

// Generate metronome sound with major/minor chord progression
metronome=()->{
  trig=every(1/4)
  major=pink(184,trig)
  minor=pink(12122362,trig)
  ;[major,minor,minor,minor][t]*ad(.0001,.0310,20,trig) |> olp($,138.17+4839.33*ad(.0001,.0420,20.000,trig)) |> hp($,289.47 ) |> tanh($*8)
}

// Additive synthesis with harmonic series and tilt control
harmonics=(hz,numHarmonics=3,tilt=3,offset=0,trig)->{
  s = 0
  maxH = min(numHarmonics, floor(20000 / hz))
  for (i=1;i<maxH;i++) {
    f = hz * i
    amp = exp(-tilt * log(i))
    s += sine(f,offset,trig) * amp
  }
  norm = 1 / sqrt(maxH)
  s * norm
}

// Wave folding synthesis with harmonic enhancement
folded=(hz,numHarmonics=2,amount=2)->{
  s = 0
  amount=max(.0001,amount)
  numHarmonics=max(2,numHarmonics)
  for (i = 1; i<numHarmonics; i++) {
    s += sine(hz * i) * safediv(1, i)
  }
  fold(s, -1 / amount, 1 / amount)
}

// Pulsar synthesis with phasor-controlled envelope
pulsar=(hz,density=1)->{
  x = phasor(hz*(2**density))
  env = smoothstep(x,0,0.2)
  sine(hz) * env
}

// Supersaw oscillator with detuned voices
supersaw=(hz,voices=5,spread=.05)->{
  s = 0
  for (i=0;i<voices;i++) {
    d = (i/(voices-1)-.5)*spread
    s += saw(hz*(1+d))
  }
  s / voices
}

// Hammond organ-style drawbar oscillator
drawbar=(hz,bars=[1])->{
  s = 0
  for (i=0;i<bars.length;i++) {
    x=bars[i]
    if (x>0) {
      s += sine(hz*(i+1)) * x
    }
  }
  s / bars.sum()
}

// Drum synthesis using filtered noise excitation
drum=(noise=white,seed=42,freqs=[120,200,330,470],trig)->{
  exc = noise(seed,trig)
  s = 0
  for (i=0;i<freqs.length;i++) {
    s += bp(exc,freqs[i],20)
  }
  s
}

// Vowel formant constants (a,e,i,o,u)
va=0
ve=1
vi=2
vo=3
vu=4

// Formant filter for vowel sounds
vowel=(in,vowelName)->{
  F = [
    [730,1090,2440],  // a
    [530,1840,2480],  // e
    [270,2290,3010],  // i
    [570,840,2410],   // o
    [300,870,2240]    // u
  ]
  freqs = F[vowelName]
  s = in
  s = bp(s,freqs[0],6)
    + bp(s,freqs[1],6)
    + bp(s,freqs[2],6)
  s
}

// Ring modulation effect
ring=(in,hz)->in*sine(hz)

// Tube saturation/distortion
tube=(in,drive=3,bias=.2)->{
  tanh((in+bias)*drive)-tanh(bias*drive)
}

// Hard clipping distortion
clip=(in,x=1)->clamp(in,lo:-x,hi:x)

// Bit crushing effect using sample and hold
bitcrush=(in,rate=8000)->{
  trig = impulse(rate)
  sah(in,trig)
}

// Mix operator (passes through signal unchanged)
mix=|>$
`

export const POSTLUDE = `
post((sig)->dc(sig))
post((sig)->mix(sig))
`
