export const PRELUDE = `
bpm=60

// return a multiplier for the input value to convert it to decibels
db=x->10**(x/20)

mix=in->in
`

export const POSTLUDE = `
post((L,R)->[mix(L),mix(R)])
`
