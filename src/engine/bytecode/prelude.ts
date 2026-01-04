export const PRELUDE = `
bpm=60

// return a multiplier for the input value to convert it to decibels
db=x->10**(x/20)

stereowidth=([L,R],width=1)->{
  mid=(L+R)*0.5
  side=(L-R)*0.5
  side*=width
  return [mid+side,mid-side]
}

widen=([L,R],seconds=0.0001)->{
  cutoff=200
  loL=lp(L,cutoff)
  loR=lp(R,cutoff)
  hiL=hp(L,cutoff)
  hiR=hp(R,cutoff)
  return [loL+hiL,loR+delay(hiR,seconds)]
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

  for (i=0;i<voices;i++) {
    phase = (i / voices) * spread
    sum += modDelay(
      in,
      base,
      depth,
      rate,
      feedback = 0,
      phase
    )
  }

  sum / voices
}

mix=in->in
`

export const POSTLUDE = `
post((sig)->dc(sig))
post((sig)->mix(sig))
`
