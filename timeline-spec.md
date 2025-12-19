Here we define the notation for a Timeline sequence.
The Timeline sequence is a progression of values in time that interpolate/glide to one another.
We define a set of points that will create interpolated glides between
those points.
The base division is 1 bar.

```
1,1 4,0e3 8,0 8,1 12,0l2
```
Translates:
1,1 -- at bar 1, value 1.
4,0e3 -- at beat 4, value 0, exponential curve power 3 from the previous value
8,0 -- at bar 8, value 0.
8,1 -- at bar 8, value 1 (abrupt change).
12,0l2 -- at bar 12, value 0, logarithmic curve power 2 from the previous value

```
timeline('1,1 4,0e3 8,0 8,1 12,0l2')*voice |> out($)
```

A dsp gen will be created for it with similar properties as with "mini"
it should generate history and audio and be hooked in prepareDsp exactly
like "mini", in order to create visualization.

A visualization is required that will be created similar to usePianorollWidget.ts
and will show the timeline values with a line across the full viewWidth of the canvas
exactly like pianoroll.
