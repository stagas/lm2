export const PRELUDE = `
bpm=60

// return a multiplier for the input value to convert it to decibels
db=x->10**(x/20)

// return a multiplier to shift a value by a number of semitones
semis=x->2**(x/12)

// convert a mono signal to a stereo signal and optionally widen it
stereo=(in,width=0)->[in,delay(in,seconds:width)]

// convert a stereo signal to a mono signal
mono=([L,R])->(L+R)*.5

// change the stereo width of a stereo signal
stereowidth=([L,R],width=1)->{
  mid=(L+R)*0.5
  side=(L-R)*0.5
  side*=width
  return [mid+side,mid-side]
}

// widen a stereo signal
widen=([L,R],seconds=0.0001)->{
  cutoff=200
  loL=lp(L,cutoff)
  loR=lp(R,cutoff)
  hiL=hp(L,cutoff)
  hiR=hp(R,cutoff)
  return [loL+hiL,loR+delay(hiR,seconds)]
}

// pan a stereo signal left or right (0=left, 0.5=center, 1=right)
pan=([L,R],balance=0.5)->{
  p=clamp(balance,0,1)
  return [L*(1-p),R*p]
}

modDelay=(in,baseDelay,depth,rate,feedback,offset=0)->{
  lfo = lfosine(rate, offset)
  delayTime = baseDelay + depth * lfo
  delay(in, delayTime, feedback)
}

flanger=(in,rate=1,depth=0.00125,base=0.00125,feedback=0.7)->{
  modDelay(in, base, depth, rate, feedback)
}

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

comb=(in,seconds,feedback,cb)->in+delay(in,seconds,feedback,cb)

eq3=(in,low=0,mid=0,high=0,lf=500,mf=2000,hf=8000)->{
  lo=ls(in,cutoff:lf,gain:low)
  mi=peak(in,cutoff:mf,q:1,gain:mid)
  hi=hs(in,cutoff:hf,gain:high)
  return lo+mi+hi
}

grain=(speed=1,seed)->step(random(seed),.999+.001*((1-clamp(speed,0,1))**.293))

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

karplus=(hz,pluck=pink,seed=334,attack=.0001,decay=.1,exponent=40,damping=.5,trig)->{
  exc = pluck(seed, trig) * ad(attack,decay,exponent,trig)
  delayTime = safediv(1, hz)
  dampingCutoff=hz*((1-damping)*63+1)
  oversample(16, () -> delay(exc,delayTime,1,x -> tanh(olp(x, dampingCutoff))))
}

metronome=()->{
  trig=every(1/4)
  major=pink(184,trig)
  minor=pink(12122362,trig)
  ;[major,minor,minor,minor][t]*ad(.0001,.0310,20,trig) |> olp($,138.17+4839.33*ad(.0001,.0420,20.000,trig)) |> hp($,289.47 ) |> tanh($*8)
}

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

folded=(hz,numHarmonics=2,amount=2)->{
  s = 0
  amount=max(.0001,amount)
  numHarmonics=max(2,numHarmonics)
  for (i = 1; i<numHarmonics; i++) {
    s += sine(hz * i) * safediv(1, i)
  }
  fold(s, -1 / amount, 1 / amount)
}

pulsar=(hz,density=1)->{
  x = phasor(hz*(2**density))
  env = smoothstep(x,0,0.2)
  sine(hz) * env
}

supersaw=(hz,voices=5,spread=.05)->{
  s = 0
  for (i=0;i<voices;i++) {
    d = (i/(voices-1)-.5)*spread
    s += saw(hz*(1+d))
  }
  s / voices
}

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

drum=(noise=white,seed=42,freqs=[120,200,330,470],trig)->{
  exc = noise(seed,trig)
  s = 0
  for (i=0;i<freqs.length;i++) {
    s += bp(exc,freqs[i],20)
  }
  s
}

va=0
ve=1
vi=2
vo=3
vu=4

vowel=(in,vowelName)->{
  F = [
    [730,1090,2440],
    [530,1840,2480],
    [270,2290,3010],
    [570,840,2410],
    [300,870,2240]
  ]
  freqs = F[vowelName]
  s = in
  s = bp(s,freqs[0],6)
    + bp(s,freqs[1],6)
    + bp(s,freqs[2],6)
  s
}

ring=(in,hz)->in*sine(hz)

tube=(in,drive=3,bias=.2)->{
  tanh((in+bias)*drive)-tanh(bias*drive)
}

clip=(in,x=1)->clamp(in,-x,x)

tap=(in,seconds,cb)->delay(in,seconds,cb)

mix=|>$
`

export const POSTLUDE = `
post((sig)->dc(sig))
post((sig)->mix(sig))
`
