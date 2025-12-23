import type { FunctionSignature } from 'mini-code'

const miniCallbackType = '(trig: audio, velocity: audio, hz: audio) -> audio'

export const functionDefinitions: Record<string, FunctionSignature> = {
  out: {
    name: 'out',
    parameters: [
      { name: 'signal', type: 'number',
        description: 'Audio-rate signal that should be mixed into both output channels' },
    ],
    returnType: 'number',
    description: 'Routes a signal to the stereo output bus so that `... |> out($)` becomes the final mix-down stage.',
    examples: [
      'sine(440) |> out($)',
      'play(seq, (trig, _, hz) -> sine(hz, trig)) |> analyser($) |> out($)',
    ],
  },
  sine: {
    name: 'sine',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Phase-continuous sine oscillator; the optional trigger lets you restart the wave from zero.',
    examples: [
      'sine(440) |> out($)',
      'env = adsr(attack:.01, decay:.1, sustain:.4, release:.3, trig)\nsine(hz, trig) * env |> out($)',
    ],
  },
  ad: {
    name: 'ad',
    parameters: [
      { name: 'attack', type: 'number', description: 'Time in seconds to ramp from 0 up to 1' },
      { name: 'decay', type: 'number', description: 'Time in seconds to fall back from 1 to 0' },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger input (defaults to 0) that restarts the attack phase when it fires',
      },
    ],
    returnType: 'number',
    description: 'Attack/decay envelope that emits a single bump per trigger pulse.',
    examples: [
      'env = ad(.005, .2, trig)',
      'sine(440, trig) * ad(.01, .3, trig) |> out($)',
    ],
  },
  adsr: {
    name: 'adsr',
    parameters: [
      { name: 'attack', type: 'number', description: 'Time to ramp from 0 to 1' },
      { name: 'decay', type: 'number', description: 'Time to fall from 1 to the sustain level' },
      { name: 'sustain', type: 'number', description: 'Level (0–1) held while the trigger is high' },
      { name: 'release', type: 'number', description: 'Time to fall from sustain back to 0 once the trigger drops' },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that keeps the envelope in sustain until it goes back to 0',
      },
    ],
    returnType: 'number',
    description:
      'Full attack/decay/sustain/release envelope. Always reaches 1, settles at sustain while trig is high, then decays to 0.',
    examples: [
      'env = adsr(attack:.01, decay:.1, sustain:.3, release:.7, trig)',
      'adsr(attack:.01, decay:.05, sustain:.5, release:.2, trig) * sine(hz, trig) |> out($)',
    ],
  },
  analyser: {
    name: 'analyser',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal that should be copied into the analyser history ring' },
      {
        name: 'index',
        type: 'number',
        optional: true,
        description: 'Optional analyser slot index (0 by default) to overwrite from this signal',
      },
    ],
    returnType: 'number',
    description: 'Mirrors the signal into the UI’s analyser buffer while passing the original audio through unchanged.',
    examples: [
      'sine(440) |> analyser($) |> out($)',
      'playing |> analyser($, 1) |> out($)',
    ],
  },
  mini: {
    name: 'mini',
    parameters: [
      { name: 'pattern', type: 'string', description: 'Mini notation string describing the sequence to be played' },
      {
        name: 'callback',
        type: miniCallbackType,
        optional: true,
        description: 'Per-voice callback fired for each trigger (trig, velocity, hz) so you can synthesize audio',
      },
      {
        name: 'color',
        type: 'string',
        optional: true,
        description: 'Optional UI color hint for the sequence (compile-time only)',
      },
    ],
    returnType: 'sequence | audio',
    description:
      'Defines a Mini notation sequence. Without a callback it compiles to a sequence reference; with a callback the callback runs for every voice and its return value becomes audio.',
    examples: [
      'mel = mini(\'scale dorian [i ii v]$.5/2\', \'#05f\')',
      'play(mel, (trig, velocity, hz) -> sine(hz, trig) * velocity) |> out($)',
      'mini(\'c4 on 4/4\', (trig, _, hz) -> sine(hz, trig) * .5) |> out($)',
    ],
  },
  play: {
    name: 'play',
    parameters: [
      { name: 'sequence', type: 'sequence', description: 'Reference returned by `mini(pattern)`' },
      {
        name: 'callback',
        type: miniCallbackType,
        description: 'Callback that runs for each voice (trig, velocity, hz) and must return audio',
      },
    ],
    returnType: 'number',
    description:
      'Compile-time alias of `mini(sequence, callback)` that plays a sequence reference with the provided callback.',
    examples: [
      'play(seq, (trig, velocity, hz) -> sine(hz, trig) * velocity) |> out($)',
    ],
  },
  timeline: {
    name: 'timeline',
    parameters: [
      { name: 'pattern', type: 'string',
        description: 'Timeline notation string (`bar,value` pairs with optional curve specifiers)' },
      {
        name: 'color',
        type: 'string',
        optional: true,
        description: 'Optional color hint for the timeline widget (compile-time only)',
      },
    ],
    returnType: 'number',
    description:
      'Plays back a sequence of interpolated values defined in timeline notation; useful for automations or gating.',
    examples: [
      'tl = timeline(\'1,0 3,1l2 8,0\', \'#f00\')',
      'tl * (0 1) |> out($)',
    ],
  },
  sampler: {
    name: 'sampler',
    parameters: [
      {
        name: 'sample',
        type: 'number',
        description: 'Sample reference (usually returned by `freesound(id:…)`)',
      },
      { name: 'speed', type: 'number', optional: true, defaultValue: 1,
        description: 'Playback speed (negative values play backwards)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description:
          'Normalized start offset (0=beginning, 1=end); defaults to 1 when speed is a constant negative number',
      },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that starts playback when positive' },
      {
        name: 'repeat',
        type: 'boolean',
        optional: true,
        defaultValue: false,
        description: 'When true the sample loops; otherwise it stops at the end',
      },
    ],
    returnType: 'number',
    description:
      'Plays a sample that was uploaded from the main thread. Triggering, looping, and negative playback are supported.',
    examples: [
      'kick = freesound(id: 123456)',
      'sampler(sample: kick, trig)',
    ],
  },
  slicer: {
    name: 'slicer',
    parameters: [
      {
        name: 'sample',
        type: 'number',
        description: 'Sample reference returned by `freesound(id:…)`',
      },
      { name: 'speed', type: 'number', optional: true, defaultValue: 1,
        description: 'Playback speed (-1 for reverse)' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Normalized offset inside the slice' },
      {
        name: 'slice',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Normalized slice index (-1..1) that selects which detected slice to play',
      },
      {
        name: 'threshold',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Slice detection threshold (0..1); higher values produce fewer slices',
      },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that launches the chosen slice' },
      {
        name: 'repeat',
        type: 'boolean',
        optional: true,
        defaultValue: false,
        description: 'Loop the slice if true, otherwise stop when it ends',
      },
    ],
    returnType: 'number',
    description: 'Chooses one of the detected slices from a sample and plays it back with the requested speed/offset.',
    examples: [
      'slice = freesound(id: 123456)\nslicer(sample: slice, slice: .5, threshold: .4, trig)',
    ],
  },
  every: {
    name: 'every',
    parameters: [
      {
        name: 'bar',
        type: 'number',
        description: 'Interval in bars at which the gate can fire (1 = one bar, 0.25 = quarter note)',
      },
      {
        name: 'prob',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Probability (0..1) that each eligible bar actually fires',
      },
      {
        name: 'seed',
        type: 'number',
        optional: true,
        defaultValue: 1234,
        description: 'Seed for the built-in pseudorandom generator',
      },
      {
        name: 'swing',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Swing amount (0..1) shifts odd beats earlier',
      },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Seconds to delay the entire gate sequence',
      },
    ],
    returnType: 'number',
    description: 'Emits 1.0 whenever the playhead crosses the requested bars/probability, otherwise 0.',
    examples: [
      'pulse = every(1/4, prob:.6, swing:.1)',
      'pulse |> out($)',
    ],
  },
  at: {
    name: 'at',
    parameters: [
      {
        name: 'bar',
        type: 'number',
        description: 'Absolute bar position where the gate should fire',
      },
      {
        name: 'every',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Repeat interval in bars (leave zero to fire only once)',
      },
      {
        name: 'prob',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Probability that a hit actually happens',
      },
      {
        name: 'seed',
        type: 'number',
        optional: true,
        defaultValue: 1234,
        description: 'Seed used when sampling probability',
      },
    ],
    returnType: 'number',
    description: 'Fires a gate at an absolute bar and optionally every N bars after that, with probability control.',
    examples: [
      'if (at(bar: 16, every: 8)) sine(880) |> analyser($) |> out($)',
    ],
  },
  freesound: {
    name: 'freesound',
    parameters: [
      { name: 'id', type: 'number', description: 'Integer ID of a FreeSound sample' },
    ],
    returnType: 'number',
    description:
      'Compile-time helper that downloads and registers a FreeSound sample, returning a handle for `sampler`/`slicer`.',
    examples: [
      'kick = freesound(id: 123456)',
      'sampler(sample: kick, trig)',
    ],
  },
}
