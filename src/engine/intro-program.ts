export const INTRO_PROGRAM = `
trig=at(1)
sine(hz-hz+35531 (0 100k)*sine(4554 (0 10k),trig) *ad(.0017,10.0000,10,trig),trig)*ad(.0002,.1,trig)|>lp($,69.71  +4100000*ad(.001,.0711,10,trig)) |> $+freeverb($,room:.852 ,damp:.15)*.6   |> limiter($) |> out($)
`
