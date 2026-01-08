export const INTRO_PROGRAM = `
trig=at(1)
sine(hz-hz+35631 (0 100k)*sine(4554 (0 10k),trig) *ad(.0001,10.0000,10,trig),trig)*ad(.0004,.1,trig)|>lp($,69.71  +200000*ad(.001,.0711,10,trig)) |> limiter($)*.5 |> out($)
`
