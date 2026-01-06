# Rhythm and modulation

Rhythm in loopmaster often starts with a trigger. A trigger is usually a signal that emits `1` briefly, then returns to `0`.

```
trig = every(1/4)
sine(880, trig) * ad(0.005, 0.15, trig) * 0.2 |> out($)
```

## Euclidean rhythms

`euclid(pulses, steps)` spreads hits evenly over a grid.

```
trig = euclid(5, 16)
env = ad(0.002, 0.12, trig)
sine(220, trig) * env * 0.25 |> out($)
```

## Beat-synced LFOs

Use `lfotri`, `lfosine`, and friends to modulate filters, pitch, or effects.

```
cut = 200 + lfotri(1/8) * 2400
saw(110) |> lp($, cutoff:cut, q:0.7) * 0.18 |> out($)
```

## Random variation

Deterministic randomness can keep things musical.

```
trig = every(1/8, prob:0.8, seed:42)
hz = [110, 220, 330, 440].random(trig, seed:123)
env = ad(0.002, 0.08, trig)
sine(hz, trig) * env * 0.2 |> out($)
```

