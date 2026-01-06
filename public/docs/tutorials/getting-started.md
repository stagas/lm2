# Getting started

loopmaster is a tiny language for making sound. Every line is a signal flow, and `out($)` sends the result to the speakers.

```
sine(220) * 0.2 |> out($)
```

## Pipes and the `$` placeholder

You can route a signal into the next function with `|>`. The placeholder `$` means “the signal from the left”.

```
saw(110) |> lp($, cutoff:800, q:0.7) |> out($)
```

## Sequences with Mini notation

Use `mini()` to define a pattern, then `play()` to turn it into voices.

```
mel = mini('scale dorian [i ii v]$.5/2', '#05f')
play(mel, (trig, velocity, hz) -> sine(hz, trig) * velocity) * 0.25 |> out($)
```

## Tips

- Start quiet: multiply your final signal by `0.1`–`0.3`.
- If you hear clicks, try envelopes like `ad(...)` or `adsr(...)`.
- Search the API below to discover building blocks.

