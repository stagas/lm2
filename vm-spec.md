We want to replace the current bytecode implementation with the new
language's bytecode.

We want the language to be interpreted entirely in a new VM in AssemblyScript
at control-rate, and replace or extend the capabilities of the current DSP VM
implementation to support the full language specification features at runtime.

A compiler is necessary to resolve early interactions such as when to use
scalar-to-scalar operations when both hand sides of a binary operation are
scalars (optimization), when one is audio we need implementations in AssemblyScript
for all binary operations in scalar-to-audio and audio-to-scalar for non commutative
such as division or subtraction, commutative operations such as multiplication
and addition can use scalar-to-audio and just swap the operands. These are then
lifted to audio-rate values and are handled by audio-to-audio operations.

We should be able to set the control-rate at any division of the WebAudio's
AudioWorklet chunk (128), so 4, 8, 16, 32 or 64, defined by a runtime AssemblyScript
global. Bulk audio opreations then happen with that length and are advanced
in position until they fill the 128 chunk buffer.

All language feature must be supported at runtime, including jumps and error
handling.

The audio must never halt. When there is an error the last valid program without
an error must be kept in memory and reused. The block is repeated with the valid
program. The error is reported to the frontend.

We integrate existing code with the new language VM and produce a valid software
that works just like before these changes.

The final `mini` API should look like this in the language:

```
mini(pattern:'<mini notation pattern>',cb:(trig,velocity,hz)->{
  env=adsr(attack:.01,decay:.2,sustain:.3,release:.2,trig)
  osc(hz,trig)*env*velocity
}) |> out($)
```
