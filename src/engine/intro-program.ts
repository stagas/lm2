export const INTRO_PROGRAM = `
trig=at(1)
sine(hz-hz+35631 (0 100k)*sine(4554 (0 10k),trig) *ad(.0001,10.0000,10,trig),trig)*ad(.0004,.1,trig)|>lp($,69.71  +200000*ad(.001,.0711,10,trig)) |> $+chorus($,voices:4,depth:.0011,rate:.008,spread:.5)*.5 |>  $+velvet($,room:.770 ,damp:.35,decay:.65)*.6 |> limiter($)*.5 |> out($)
`
