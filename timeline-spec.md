Here we define the notation for a Timeline sequence.
The Timeline sequence is a progression of values in time that interpolate/glide to one another.

```
/ -- rise
\ -- fall
0..1 -- target value is a real normal 0 to 1
b<number> -- beats duration to hold/rise/fall
e<number> -- exponent of curve(used with rise/fall)
```

Examples:

```
0b3 /b1 1b4 0b4
-- 0 for 3 beats, rise for 1 beat to the next value(1.0), hold for 4 beats, drop to 0 for 4 beats

/b2e5 .5b4 \b2e.5
-- rise for 2 beats with exponent 5 to value 0.5, hold 0.5 for 4 beats, fall for 2 beats with exponent 0.5
```

The API shall be similar to `mini(seq)` and it will be `timeline(beat,seq)`.
`beat` is the beat division to use for the beat calculations. e.g 1 (whole) 1/16 (sixteenths) etc.
For example:

```
timeline(1,'/b1 1b4 \b1')*voice |> out($)
```

A dsp gen will be created for it with similar properties as with "mini"
it should generate history and audio and be hooked in prepareDsp exactly
like "mini", in order to create visualization.

A visualization is required that will be created similar to usePianorollWidget.ts
and will show the timeline values with a line across the full viewWidth of the canvas
exactly like pianoroll.
