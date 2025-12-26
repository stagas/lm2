import type { FunctionSignature } from 'mini-code'

const miniCallbackType = '(trig: audio, velocity: audio, hz: audio) -> audio'
const postCallbackType = '(L: audio, R: audio) -> array'

export const functionDefinitions: Record<string, FunctionSignature> = {
  out: {
    name: 'out',
    parameters: [
      {
        name: 'L',
        type: 'number',
        description: 'Audio-rate signal to be mixed into the left output channel (and right as well if R is omitted)',
      },
      {
        name: 'R',
        type: 'number',
        optional: true,
        description: 'Audio-rate signal to be mixed into the right output channel (defaults to L)',
      },
    ],
    returnType: 'number',
    description: 'Routes signals to the stereo output bus so that `... |> out($)` becomes the final mix-down stage.',
    examples: [
      'sine(440) |> out($)',
      'out(sine(440), sine(441))',
      'play(seq, (trig, _, hz) -> sine(hz, trig)) |> analyser($) |> out($)',
    ],
  },
  solo: {
    name: 'solo',
    parameters: [
      {
        name: 'L',
        type: 'number',
        description:
          'Audio-rate signal to be mixed into the left output channel (and right as well if R is omitted); mutes non-solo outs when any solo exists',
      },
      {
        name: 'R',
        type: 'number',
        optional: true,
        description: 'Audio-rate signal to be mixed into the right output channel (defaults to L)',
      },
    ],
    returnType: 'number',
    description:
      'Like `out`, but when there is at least one `solo` call, all regular `out` calls are muted and all `solo` signals are summed to the output.',
    examples: [
      'sine(440) |> solo($)',
      'solo(sine(440), sine(441))',
    ],
  },
  post: {
    name: 'post',
    parameters: [
      {
        name: 'callback',
        type: postCallbackType,
        description: 'Post-processing callback that receives the final (L,R) mix and must return [L,R]',
      },
    ],
    returnType: 'number',
    description:
      'Registers a post-processing stage that runs after all `out`/`solo` mixing; multiple `post` calls chain in order.',
    examples: [
      'post((L, R) -> [L, R])',
      'post((L, R) -> [L * .5, R * .5])',
    ],
  },
  sine: {
    name: 'sine',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
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
      'env = adsr(attack:.01, decay:.1, sustain:.4, release:.3, trig)\nsine(hz, 0, trig) * env |> out($)',
      'sine(hz, .05, trig) * env |> out($)',
    ],
  },
  tri: {
    name: 'tri',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Band-limited triangle oscillator (polyBLEP).',
    examples: [
      'tri(220) |> out($)',
      'tri(hz, .01, trig) * .2 |> out($)',
    ],
  },
  saw: {
    name: 'saw',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Band-limited saw oscillator (polyBLEP).',
    examples: [
      'saw(110) |> out($)',
      'saw(hz, .02, trig) * .2 |> out($)',
    ],
  },
  ramp: {
    name: 'ramp',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Band-limited ramp oscillator (inverted saw, polyBLEP).',
    examples: [
      'ramp(110) |> out($)',
      'ramp(hz, .02, trig) * .2 |> out($)',
    ],
  },
  sqr: {
    name: 'sqr',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Band-limited square oscillator (polyBLEP).',
    examples: [
      'sqr(55) |> out($)',
      'sqr(hz, .01, trig) * .2 |> out($)',
    ],
  },
  pwm: {
    name: 'pwm',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'width',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Pulse width control (-1..1); 0 is centered, positive shifts the duty cycle',
      },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger that resets the phase back to 0 when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Band-limited PWM oscillator (polyBLEP).',
    examples: [
      'pwm(110, width:.2) * .2 |> out($)',
      'pwm(hz, 0, 0, saw(.1)) * .2 |> out($)',
    ],
  },
  phasor: {
    name: 'phasor',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Start offset in seconds applied when the trigger fires (0 = start at 0)',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger that resets the ramp and starts it again when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'One-shot 0..1 ramp that stops at 1.0 after it completes (retriggerable).',
    examples: [
      'phasor(1, 0, trig) |> out($)',
      'phasor(1, .25, trig) |> out($)',
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
  compressor: {
    name: 'compressor',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'attack', type: 'number', description: 'Attack time in seconds (0.0001 .. 1)' },
      { name: 'release', type: 'number', description: 'Release time in seconds (0.0001 .. 5)' },
      { name: 'threshold', type: 'number', description: 'Threshold in dB (-80 .. 0)' },
      { name: 'ratio', type: 'number', description: 'Compression ratio (1 .. 20)' },
      { name: 'knee', type: 'number', description: 'Knee width in dB (0 .. 40)' },
      { name: 'key', type: 'number', optional: true, description: 'Optional sidechain key signal' },
    ],
    returnType: 'number',
    description:
      'Compresses the input signal. When `key` is provided, gain reduction is driven by the key signal (sidechain) but applied to `in`.',
    examples: [
      'compressor(saw(hz), .01, .1, -24, 4, 6) |> out($)',
      'compressor(in:$, attack:.005, release:.2, threshold:-18, ratio:6, knee:8) |> out($)',
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
      { name: 'seq', type: 'sequence', description: 'Reference returned by `mini(pattern)`' },
      {
        name: 'cb',
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
      {
        name: 'repeat',
        type: 'boolean',
        optional: true,
        defaultValue: false,
        description: 'When true the sample loops; otherwise it stops at the end',
      },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that starts playback when positive' },
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
        description: 'Normalized slice index (0..1) that selects which detected slice to play',
      },
      {
        name: 'threshold',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Slice detection threshold (0..1); higher values produce fewer slices',
      },
      {
        name: 'repeat',
        type: 'boolean',
        optional: true,
        defaultValue: false,
        description: 'Loop the slice if true, otherwise stop when it ends',
      },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that launches the chosen slice' },
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
  euclid: {
    name: 'euclid',
    parameters: [
      {
        name: 'pulses',
        type: 'number',
        description: 'Number of hits (beats) to distribute across the step grid',
      },
      {
        name: 'steps',
        type: 'number',
        description: 'Number of steps in the grid',
      },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Rotation offset in steps (positive values shift the pattern left)',
      },
      {
        name: 'bar',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Duration in bars for a full cycle of the pattern',
      },
    ],
    returnType: 'number',
    description: 'Generates trigger impulses using a Euclidean rhythm (Tidal-style).',
    examples: [
      'trig = euclid(3, 8)',
      'trig = euclid(3, 8, 1)',
      'trig = euclid(5, 16, 0, 1/2)',
    ],
  },
  slew: {
    name: 'slew',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be slewed (limited)' },
      { name: 'up', type: 'number', description: 'Rise rate factor when signal increases' },
      {
        name: 'down',
        type: 'number',
        optional: true,
        description: 'Fall rate when signal decreases (defaults to up rate if ≤ 0)',
      },
      {
        name: 'exp',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Curve shape: 1=linear, >1=exponential, <1=logarithmic',
      },
    ],
    returnType: 'number',
    description:
      'Rate-limits a signal to prevent sudden jumps. Useful for smoothing control signals, portamento effects, or creating more natural parameter changes.',
    examples: [
      'sine(freq |> slew($,up:.01,down:.03)) |> out($)',
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
  '.map': {
    name: '.map',
    parameters: [
      { name: 'callback', type: 'function', description: 'Callback to be called for each element' },
    ],
    returnType: 'array',
    description: 'Maps over an array and returns a new array with the results.',
    examples: [
      '[1,2,3].map(x -> x * 2)',
    ],
  },
  '.sum': {
    name: '.sum',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to be summed' },
    ],
    returnType: 'number',
    description: 'Sums an array and returns the result.',
    examples: [
      'array.sum() |> out($)',
    ],
  },
  'note': {
    name: 'note',
    parameters: [
      { name: 'midi', type: 'number', description: 'MIDI note number' },
    ],
    returnType: 'number',
    description: 'Converts a MIDI note number to a frequency.',
    examples: [
      'note(60) |> out($)',
    ],
  },
  'degree': {
    name: 'degree',
    parameters: [
      { name: 'degree', type: 'number', description: 'Degree of the scale' },
    ],
    returnType: 'number',
    description: 'Converts a degree of the scale to a frequency.',
    examples: [
      'degree(1) |> out($)',
    ],
  },
  'label': {
    name: 'label',
    parameters: [
      { name: 'bar', type: 'number', description: 'Bar position of the label' },
      { name: 'text', type: 'string', description: 'Label text' },
      { name: 'color', type: 'string', optional: true, defaultValue: '#ff0', description: 'Color of the label' },
    ],
    returnType: 'number',
    description: 'Creates a label in the timeline (0-based).',
    examples: [
      'label(0, \'intro\')',
      'label(64, \'groove\', \'#f00\')',
    ],
  },
  lp: {
    name: 'lp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be low-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Low-passes a signal with a biquad filter.',
    examples: [
      'saw(hz) |> lp($, cutoff:500, q:0.75) |> out($)',
    ],
  },
  hp: {
    name: 'hp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be high-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'High-passes a signal with a biquad filter.',
    examples: [
      'saw(hz) |> hp($, cutoff:200, q:0.75) |> out($)',
    ],
  },
  bp: {
    name: 'bp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be band-passed' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Band-passes a signal with a biquad filter.',
    examples: [
      'saw(hz) |> bp($, cutoff:1000, q:2) |> out($)',
    ],
  },
  bs: {
    name: 'bs',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be band-stopped' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Band-stops (notches) a signal with a biquad filter.',
    examples: [
      'saw(hz) |> bs($, cutoff:1000, q:5) |> out($)',
    ],
  },
  ls: {
    name: 'ls',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be low-shelved' },
      { name: 'cutoff', type: 'number', description: 'Corner frequency in hertz' },
      { name: 'gain', type: 'number', description: 'Gain in decibels' },
    ],
    returnType: 'number',
    description: 'Applies a low-shelf filter with adjustable gain.',
    examples: [
      'saw(hz) |> ls($, cutoff:200, gain:6) |> out($)',
    ],
  },
  hs: {
    name: 'hs',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be high-shelved' },
      { name: 'cutoff', type: 'number', description: 'Corner frequency in hertz' },
      { name: 'gain', type: 'number', description: 'Gain in decibels' },
    ],
    returnType: 'number',
    description: 'Applies a high-shelf filter with adjustable gain.',
    examples: [
      'saw(hz) |> hs($, cutoff:3000, gain:-3) |> out($)',
    ],
  },
  peak: {
    name: 'peak',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be peaked' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
      { name: 'gain', type: 'number', description: 'Gain in decibels' },
    ],
    returnType: 'number',
    description: 'Applies a peaking filter with adjustable gain and Q.',
    examples: [
      'saw(hz) |> peak($, cutoff:1000, q:5, gain:6) |> out($)',
    ],
  },
  ap: {
    name: 'ap',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be all-passed' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Applies an all-pass filter for phase shifting.',
    examples: [
      'saw(hz) |> ap($, cutoff:1000, q:1) |> out($)',
    ],
  },
  lfosine: {
    name: 'lfosine',
    parameters: [
      { name: 'bar', type: 'number', description: 'Beat-locked period in whole-note units (e.g. 1/16)' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Beat offset in whole-note units',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0',
      },
    ],
    returnType: 'number',
    description: 'Beat-locked sine LFO in 0..1 synced to the global sample clock.',
    examples: [
      'lfosine(1/16)',
      'lfosine(1/16, 0, trig)',
      'lfosine(bar:1/16, offset:1/64, trig)',
    ],
  },
  lfotri: {
    name: 'lfotri',
    parameters: [
      { name: 'bar', type: 'number', description: 'Beat-locked period in whole-note units (e.g. 1/16)' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Beat offset in whole-note units' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Beat-locked triangle LFO in 0..1 synced to the global sample clock.',
    examples: [
      'lfotri(1/8)',
      'lfotri(1/8, 0, trig)',
      'lfotri(bar:1/8, offset:-1/32, trig)',
    ],
  },
  lfosaw: {
    name: 'lfosaw',
    parameters: [
      { name: 'bar', type: 'number', description: 'Beat-locked period in whole-note units (e.g. 1/16)' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Beat offset in whole-note units' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Beat-locked saw LFO in 0..1 synced to the global sample clock.',
    examples: [
      'lfosaw(1/4)',
      'lfosaw(1/4, 0, trig)',
      'lfosaw(bar:1/4, offset:1/16, trig)',
    ],
  },
  lforamp: {
    name: 'lforamp',
    parameters: [
      { name: 'bar', type: 'number', description: 'Beat-locked period in whole-note units (e.g. 1/16)' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Beat offset in whole-note units' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Beat-locked ramp LFO in 0..1 synced to the global sample clock.',
    examples: [
      'lforamp(1/4)',
      'lforamp(1/4, 0, trig)',
      'lforamp(bar:1/4, offset:-1/16, trig)',
    ],
  },
  lfosqr: {
    name: 'lfosqr',
    parameters: [
      { name: 'bar', type: 'number', description: 'Beat-locked period in whole-note units (e.g. 1/16)' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Beat offset in whole-note units' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Beat-locked square LFO in 0..1 synced to the global sample clock.',
    examples: [
      'lfosqr(1/8)',
      'lfosqr(1/8, 0, trig)',
      'lfosqr(bar:1/8, offset:1/32, trig)',
    ],
  },
  lfosah: {
    name: 'lfosah',
    parameters: [
      { name: 'bar', type: 'number', description: 'Hold interval in whole-note units (e.g. 1/16)' },
      {
        name: 'seed',
        type: 'number',
        optional: true,
        defaultValue: 1234,
        description: 'Deterministic seed used for the held random values',
      },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0,
        description: 'Beat offset in whole-note units' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the cycle alignment to the offset position when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Beat-locked sample-and-hold LFO in 0..1, deterministic per (seed, cycle).',
    examples: [
      'lfosah(1/16)',
      'lfosah(1/16, 1234, 0, trig)',
      'lfosah(bar:1/16, seed:42, offset:1/64, trig)',
    ],
  },
}
