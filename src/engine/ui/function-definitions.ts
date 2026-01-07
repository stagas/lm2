import type { FunctionSignature } from 'mini-code'
import { SCALE_INTERVALS } from '../../mini/scales.ts'

export const functionDefinitions: Record<string, FunctionSignature> = {
  't': {
    name: 't',
    parameters: [],
    returnType: 'number',
    description: 'BPM adjusted time elapsed: 1 t = ¼ note.',
    examples: [
      'saw([c4,a4,f4,e4][t]) |> out($)',
    ],
    type: 'variable',
  },
  'scale': {
    name: 'scale',
    type: 'variable',
    parameters: [],
    returnType: 'string',
    description: 'The scale to use.\n\nAvailable scales:\n\n' + Object.keys(SCALE_INTERVALS).join(', '),
    examples: [
      `scale='minor' trig=every(1/8) drawbar(#scale.step(trig)*o4)*ad(.01,.5,4,trig) |> out($)`,
    ],
  },
  '#scale': {
    name: '#scale',
    parameters: [],
    returnType: 'array',
    description: 'The current scale in an array of frequencies.\n\nAvailable scales:\n\n'
      + Object.keys(SCALE_INTERVALS).join(', '),
    examples: [
      `scale='minor' trig=every(1/8) drawbar(#scale.step(trig)*o4)*ad(.01,.5,4,trig) |> out($)`,
    ],
    type: 'variable',
  },
  '.map': {
    name: '[].map',
    parameters: [
      { name: 'cb', type: '(x: any, i: number, arr: array) -> any',
        description: 'Callback function that transforms each element.' },
    ],
    returnType: 'array',
    description: 'Maps over an array and returns a new array with the results.',
    examples: [
      '[60,62,65].map((x,i)->rhodes2(note(x*(1.03**i)))).avg() |> out($)',
    ],
  },
  '.glide': {
    name: '[].glide',
    parameters: [
      { name: 'bar', type: 'number', description: 'Step duration in bars (1 = 4 beats).' },
      {
        name: 'exponent',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Curve shape: 1=linear, >0 uses pow(t,exp), <0 uses logarithmic curve base=-exp.',
      },
    ],
    returnType: 'number',
    description: 'Iterates numeric array values on a beat-locked bar division and glides between them.',
    examples: [
      `scale='aeolian' trig=euclid(3,8,bar:.25)
;[#1,#3,#5].glide(1/4,exponent:.2) |> cs80($*o3,trig) |> $+velvet($,.8) |> limiter($) |> out($)`,
    ],
  },
  '.sum': {
    name: '[].sum',
    parameters: [],
    returnType: 'number',
    description: 'Sums an array and returns the result.',
    examples: [
      '[1,2,3].sum() |> print($)',
    ],
  },
  '.avg': {
    name: '[].avg',
    parameters: [],
    returnType: 'number',
    description: 'Averages an array and returns the result.',
    examples: [
      '[60,62,65].map(x->rhodes2(note(x))).avg() |> out($)',
    ],
  },
  '.step': {
    name: '[].step',
    parameters: [
      { name: 'trig', type: 'number', description: 'Trigger impulse that advances to next array element.' },
    ],
    returnType: 'number',
    description: 'Steps through array elements on trigger impulses, wrapping around when reaching the end.',
    examples: [
      `scale='pentatonic' trig=euclid(5,8,bar:.25) env=ad(.01,.5,5,trig)
#scale.step(trig) |> rhodes2($*o4)*env |> out($)`,
    ],
  },
  '.random': {
    name: '[].random',
    parameters: [
      { name: 'trig', type: 'number', description: 'Trigger impulse that selects a random array element.' },
      { name: 'seed', type: 'number', description: 'Random seed (optional, default: 0).', optional: true },
    ],
    returnType: 'number',
    description: 'Selects random array elements on trigger impulses.',
    examples: [
      `scale='yu' trig=euclid(5,8,bar:.25) env=ad(.01,.5,5,trig)
#scale.random(trig) |> drawbar($*[o3,o4,o5].random(trig))*env |> out($)`,
    ],
  },
  '.reverse': {
    name: '[].reverse',
    parameters: [],
    returnType: 'array',
    description: 'Reverses the array in place and returns the reversed array.',
    examples: [
      `scale='aeolian' trig=euclid(3,8,bar:.25) env=ad(.01,.75 ,5,trig)
;((t+2)%4>2?#scale:#scale.reverse()).step(trig) |> rhodes($*o3)*env |> limiter($) |> out($)`,
    ],
  },
  '.shuffle': {
    name: '[].shuffle',
    parameters: [
      { name: 'seed', type: 'number', description: 'Random seed (optional, default: random).', optional: true },
    ],
    returnType: 'array',
    description: 'Shuffles the array elements randomly and returns the shuffled array.',
    examples: [
      `scale='yu' trig=euclid(3,8,bar:.25) env=ad(.01,.5,5,trig)
#scale.shuffle(42).step(trig) |> drawbar($*o4)*env |> out($)`,
    ],
  },
  'shuffle': {
    name: 'shuffle',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to shuffle.' },
      { name: 'seed', type: 'number', description: 'Random seed (optional, default: random).', optional: true },
    ],
    returnType: 'array',
    description: 'Shuffles the array elements randomly and returns the shuffled array.',
    examples: [
      'shuffle([1,2,3,4]) |> print($)',
      'shuffle([1,2,3,4], 42) |> print($)',
    ],
  },
  oversample: {
    name: 'oversample',
    parameters: [
      { name: 'times', type: 'number', description: 'Oversampling factor (1..16).' },
      { name: 'callback', type: '() -> number | [L:number, R:number]', description: 'Signal generator callback.' },
    ],
    returnType: 'number | [L:number, R:number]',
    description:
      'Evaluates a signal at a higher internal sample rate and downsamples back to reduce aliasing (CPU heavy).',
    examples: [
      'oversample(8, () -> saw(440)) |> out($)',
      'oversample(8, cb: () -> [saw(220), saw(221)]) |> out($)',
    ],
  },
  out: {
    name: 'out',
    parameters: [
      {
        name: 'signal',
        type: 'number | [L:number, R:number]',
        description:
          'Audio-rate signal to be mixed into the output channels. If a single signal is provided, it will be sent to both left and right channels. If an array [L, R] is provided, L goes to left channel and R to right channel.',
      },
      {
        name: 'R',
        type: 'number',
        optional: true,
        description:
          'Audio-rate signal to be mixed into the right output channel (for backward compatibility with out(L, R) syntax)',
      },
    ],
    returnType: 'number',
    description: 'Routes signals to the stereo output bus so that `... |> out($)` becomes the final mix-down stage.',
    examples: [
      'sine(440) |> out($)',
      'out([sine(440), sine(441)])',
      'out(sine(440), sine(441))', // backward compatibility
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
        description: 'Audio-rate signal to be mixed into the right output channel (defaults to L).',
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
        type: '([L:number, R:number]) -> [L,R]',
        description: 'Post-processing callback.',
      },
    ],
    returnType: 'number',
    description:
      'Registers a post-processing stage that runs after all `out`/`solo` mixing; multiple `post` calls chain in order.',
    examples: [
      'post(([L, R]) -> [L, R])',
      'post(([L, R]) -> [L * .5, R * .5])',
    ],
  },
  sine: {
    name: 'sine',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
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
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Triangle wave oscillator.',
    examples: [
      'tri(220) |> out($)',
      'tri(hz, .01, trig) * .2 |> out($)',
    ],
  },
  saw: {
    name: 'saw',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Sawtooth wave oscillator.',
    examples: [
      'saw(110) |> out($)',
      'saw(hz, .02, trig) * .2 |> out($)',
    ],
  },
  ramp: {
    name: 'ramp',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Ramp wave oscillator (inverted sawtooth).',
    examples: [
      'ramp(110) |> out($)',
      'ramp(hz, .02, trig) * .2 |> out($)',
    ],
  },
  sqr: {
    name: 'sqr',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Square wave oscillator.',
    examples: [
      'sqr(55) |> out($)',
      'sqr(hz, .01, trig) * .2 |> out($)',
    ],
  },
  pwm: {
    name: 'pwm',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz.' },
      {
        name: 'width',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Pulse width control (0..1).',
      },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger that resets the phase back to 0 when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Pulse width modulation oscillator.',
    examples: [
      'pwm(110, width:.2) |> out($)',
      'pwm(hz, lfotri(1)) |> out($)',
    ],
  },
  phasor: {
    name: 'phasor',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Start offset in seconds applied when the trigger fires (0 = start at 0).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger that resets the ramp and starts it again when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description: 'Ramp oscillator that goes from 0 to 1 and can be retriggered.',
    examples: [
      'phasor(1, 0, trig) |> out($)',
      'phasor(1, .25, trig) |> out($)',
    ],
  },
  impulse: {
    name: 'impulse',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency in hertz (negative values clamp to zero).' },
      {
        name: 'offset',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Phase offset in seconds applied when the trigger fires (0 = no offset).',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0.',
      },
    ],
    returnType: 'number',
    description:
      'Impulse oscillator that produces steady impulses (1 sample of value 1, rest 0) at the given frequency.',
    examples: [
      'impulse(440) |> out($)',
      'impulse(hz, 0, trig) |> out($)',
    ],
  },
  zerox: {
    name: 'zerox',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal to detect zero crossings.' },
    ],
    returnType: 'number',
    description: 'Zero crossing detector that outputs a trigger impulse when the signal crosses from ≤0 to >0.',
    examples: [
      'sine(1) |> zerox($) |> out($)',
      'saw(0.1) |> zerox($) |> ad(0.01, 0.1, trig:$) |> sine(440) |> out($)',
    ],
  },
  pitchshift: {
    name: 'pitchshift',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal to pitch shift.' },
      {
        name: 'ratio',
        type: 'number',
        description: 'Pitch shift ratio (0.5 = octave down, 2 = octave up, 1 = same).',
      },
    ],
    returnType: 'number',
    description: 'Pitch shifts the input signal using granular synthesis.',
    examples: [
      'sine(440) |> pitchshift($, 2) |> out($)',
      'sine(440) |> pitchshift($, 0.5) |> out($)',
    ],
  },
  ad: {
    name: 'ad',
    parameters: [
      { name: 'attack', type: 'number', description: 'Time in seconds to ramp from 0 up to 1.' },
      { name: 'decay', type: 'number', description: 'Time in seconds to fall back from 1 to 0.' },
      {
        name: 'exponent',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description:
          'Curve shape: 0/1/-1=linear, >1=exponential, 0>..<1=subexponential <-1=logarithmic -0>..<-1=sublogarithmic.',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger input (defaults to 0) that restarts the attack phase when it fires.',
      },
    ],
    returnType: 'number',
    description: 'Attack/decay envelope that emits a single bump per trigger pulse.',
    examples: [
      'drawbar(a4) * ad(.01,.3,2,trig:every(1/8)) |> out($)',
    ],
  },
  adsr: {
    name: 'adsr',
    parameters: [
      { name: 'attack', type: 'number', description: 'Time to ramp from 0 to 1.' },
      { name: 'decay', type: 'number', description: 'Time to fall from 1 to the sustain level.' },
      { name: 'sustain', type: 'number', description: 'Level (0–1) held while the trigger is high.' },
      { name: 'release', type: 'number', description: 'Time to fall from sustain back to 0 once the trigger drops.' },
      {
        name: 'exponent',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description:
          'Curve shape: 0/1/-1=linear, >1=exponential, 0>..<1=subexponential <-1=logarithmic -0>..<-1=sublogarithmic.',
      },
      {
        name: 'trig',
        type: 'number',
        optional: true,
        description: 'Trigger signal that keeps the envelope in sustain until it goes back to 0.',
      },
    ],
    returnType: 'number',
    description:
      'Full attack/decay/sustain/release envelope. Always reaches 1, settles at sustain while trig is high, then decays to 0.',
    examples: [
      `trig=step(lfosaw(1/2),.5) supersaw(a4) * adsr(.1,.2,.3,.75,trig) |> out($)`,
    ],
  },
  envfollow: {
    name: 'envfollow',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to envelope-follow.' },
      {
        name: 'attack',
        type: 'number',
        optional: true,
        defaultValue: 0.01,
        description: 'Attack time in seconds (how quickly it responds to signal increases).',
      },
      {
        name: 'release',
        type: 'number',
        optional: true,
        defaultValue: 0.1,
        description: 'Release time in seconds (how quickly it responds to signal decreases).',
      },
    ],
    returnType: 'number',
    description:
      'Envelope follower that tracks the amplitude of an input signal with separate attack and release times.',
    examples: [
      'sine(440) |> envfollow($) |> out($)',
      'envfollow(saw(hz), attack: 0.005, release: 0.2) |> out($)',
      'sine(220) * envfollow($, attack: 0.01, release: 0.05) |> out($)',
    ],
  },
  analyser: {
    name: 'analyser',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to create an analyser.' },
    ],
    returnType: 'number',
    description: 'Creates an analyser for the signal. Returns the original signal.',
    examples: [
      `saw(330)*ad(.01,.2,trig:every(1/8)) |> analyser($)
|> out($)`,
    ],
  },
  amplitude: {
    name: 'amplitude',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to create an amplitude analyser.' },
    ],
    returnType: 'number',
    description: 'Creates an amplitude analyser widget for the signal. Returns the original signal.',
    examples: [
      `saw(330)*ad(.01,.2,trig:every(1/8)) |> amplitude($)
|> out($)`,
    ],
  },
  waveform: {
    name: 'waveform',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to create a waveform analyser.' },
    ],
    returnType: 'number',
    description: 'Creates a waveform analyser widget for the signal. Returns the original signal.',
    examples: [
      `saw(330)*ad(.01,.2,trig:every(1/8)) |> waveform($)
|> out($)`,
    ],
  },
  spectrum: {
    name: 'spectrum',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to create a spectrum analyser.' },
    ],
    returnType: 'number',
    description: 'Creates a spectrum analyser widget for the signal. Returns the original signal.',
    examples: [
      `saw(330)*ad(.01,.2,trig:every(1/8)) |> spectrum($)
|> out($)`,
    ],
  },
  level: {
    name: 'level',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to create a level meter analyser.' },
    ],
    returnType: 'number',
    description: 'Creates a level meter (VU) analyser widget for the signal. Returns the original signal.',
    examples: [
      `saw(330)*ad(.01,.2,trig:every(1/8)) |> level($)
|> out($)`,
    ],
  },
  print: {
    name: 'print',
    parameters: [
      { name: 'signal', type: 'number', description: 'Signal to print/inspect.' },
    ],
    returnType: 'number',
    description: 'Creates a print analyser widget that shows the values it receives. Returns the original signal.',
    examples: [
      '[1,2,3,4,5].random(every(1/8)) |> print($)',
    ],
  },
  compressor: {
    name: 'compressor',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'attack', type: 'number', description: 'Attack time in seconds (0.0001 .. 1)' },
      { name: 'release', type: 'number', description: 'Release time in seconds (0.0001 .. 5)' },
      { name: 'threshold', type: 'number', description: 'Threshold in dB (-60 .. 0)' },
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
  expander: {
    name: 'expander',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'attack', type: 'number', description: 'Attack time in seconds (0.0001 .. 1)' },
      { name: 'release', type: 'number', description: 'Release time in seconds (0.0001 .. 5)' },
      { name: 'threshold', type: 'number', description: 'Threshold in dB (-60 .. 0)' },
      { name: 'ratio', type: 'number', description: 'Expansion ratio (1 .. 100)' },
      { name: 'knee', type: 'number', description: 'Knee width in dB (0 .. 40)' },
      { name: 'key', type: 'number', optional: true, description: 'Optional sidechain key signal' },
    ],
    returnType: 'number',
    description:
      'Expands the input signal. When `key` is provided, gain reduction is driven by the key signal (sidechain) but applied to `in`.',
    examples: [
      'expander(saw(hz), .01, .1, -24, 2, 6) |> out($)',
      'expander(in:$, attack:.005, release:.2, threshold:-18, ratio:4, knee:8) |> out($)',
    ],
  },
  gate: {
    name: 'gate',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'attack', type: 'number', description: 'Attack time in seconds (0.0001 .. 1)' },
      { name: 'release', type: 'number', description: 'Release time in seconds (0.0001 .. 5)' },
      { name: 'threshold', type: 'number', description: 'Threshold in dB (-60 .. 0)' },
      { name: 'knee', type: 'number', description: 'Knee width in dB (0 .. 40)' },
      { name: 'hold', type: 'number', description: 'Hold time in seconds (0 .. 1)' },
      { name: 'key', type: 'number', optional: true, description: 'Optional sidechain key signal' },
    ],
    returnType: 'number',
    description:
      'Noise gate that heavily attenuates signals below threshold. When `key` is provided, gating is driven by the key signal (sidechain) but applied to `in`.',
    examples: [
      'gate(saw(hz), .001, .08, -24, 0, .02) |> out($)',
      'gate(in:$, attack:.0005, release:.12, threshold:-20, knee:0, hold:.03) |> out($)',
    ],
  },
  limiter: {
    name: 'limiter',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'release', type: 'number', description: 'Release time in seconds (0.0001 .. 5)' },
      { name: 'threshold', type: 'number', description: 'Threshold in dB (-80 .. 0)' },
    ],
    returnType: 'number',
    description:
      'Limits the input signal to never exceed the threshold. Uses infinite ratio (hard limiting) with per-sample attack.',
    examples: [
      'limiter(saw(hz), .1, -12) |> out($)',
      'limiter(in:$, release:.05, threshold:-6) |> out($)',
    ],
  },
  mini: {
    name: 'mini',
    parameters: [
      { name: 'pattern', type: 'string', description: 'Mini notation sequence' },
      {
        name: 'color',
        type: 'string',
        optional: true,
        description: 'UI color hint for the sequence (e.g. \'#05f\')',
      },
    ],
    returnType: 'number',
    description: 'Defines a Mini notation sequence. It compiles and returns a sequence reference.',
    examples: [
      'mel = mini(\'scale dorian [i ii v]$.5/2\', \'#05f\')',
      'play(mel, (trig, velocity, hz) -> sine(hz, trig) * velocity) |> out($)',
    ],
  },
  play: {
    name: 'play',
    parameters: [
      { name: 'seq', type: 'sequence', description: 'Reference returned by `mini(pattern)`' },
      {
        name: 'cb',
        type: '(trig: number, velocity: number, hz: number) -> number',
        description: 'Callback that runs for each voice',
      },
      {
        name: 'voices',
        type: 'number',
        optional: true,
        description: 'Override automatic voice allocation with a fixed number of voices (1..16)',
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
    description: 'Plays a sequence reference with the provided callback.',
    examples: [
      'play(seq, (trig, velocity, hz) -> sine(hz, trig) * velocity) |> out($)',
      'play(seq, (trig, velocity, hz) -> sine(hz, trig) * velocity, voices:4) |> out($)',
      'play(seq, (trig, velocity, hz) -> sine(hz, trig) * velocity, bar:2) |> out($)',
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
      `bpm=144
perc=(seed,trig)->pink(seed,trig)*ad(.01,.08,15,trig)
every=1/2 q=.5
 perc(23,at(0,   every,prob:.9,seed:123))
+perc(45,at(1/12,every,prob:.9,seed:456))
+perc(67,at(3/12,every,prob:.9,seed:789))
|> bp($,70,q)+bp($,720,q)+bp($,1300,q) |> $+freeverb($,.796)
|> out($)
`,
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
        name: 'exponent',
        type: 'number',
        optional: true,
        defaultValue: 1,
        description: 'Curve shape: 1=linear, >1=exponential, <1=logarithmic.',
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
  record: {
    name: 'record',
    parameters: [
      { name: 'seconds', type: 'number', description: 'Duration to record in seconds (clamped to 0..1)' },
      { name: 'cb', type: '() -> number',
        description: 'Callback to generate the sample signal (called at audio rate)' },
    ],
    returnType: 'number',
    description:
      'Records `seconds` of the callback output into an in-memory sample (once on playback start, then cached until the callback changes). Returns a sample reference for `sampler`.',
    examples: [
      'tone = record(.5, () -> sine(220))',
      'sampler(sample: tone, trig)',
    ],
  },
  delay: {
    name: 'delay',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be delayed' },
      { name: 'seconds', type: 'number', description: 'Delay time in seconds (clamped to 0..10)' },
      {
        name: 'feedback',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Feedback amount; 0 produces a single echo only',
      },
      {
        name: 'cb',
        type: '(in: number) -> number',
        optional: true,
        defaultValue: 'x -> x',
        description: 'Applied to the feedback signal',
      },
    ],
    returnType: 'number',
    description: 'Delay effect as a signal method; returns the delayed signal (wet only).',
    examples: [
      'sine(440) |> delay($, seconds:.25) |> out($)',
      'sine(220) |> delay($, seconds:.35, feedback:.4, cb:x -> lp(x, cutoff:1000, q:.8)) |> out($)',
    ],
  },
  freeverb: {
    name: 'freeverb',
    parameters: [
      { name: 'in', type: 'number | [L:number, R:number]', description: 'Signal to reverberate (mono or stereo)' },
      {
        name: 'roomSize',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Room size (0..1); higher values increase decay/feedback',
      },
      {
        name: 'damping',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'High-frequency damping (0..1); higher values damp more',
      },
    ],
    returnType: '[L:number, R:number]',
    description: 'Freeverb-style reverb effect; returns wet stereo signal.',
    examples: [
      'saw(hz) |> freeverb($, roomSize:.6, damping:.3) |> out($)',
      '[saw(220), saw(221)] |> freeverb($, roomSize:.6, damping:.3) |> out($)',
      'sine(220) |> freeverb($, roomSize:.85, damping:.1) |> out($)',
    ],
  },
  dattorro: {
    name: 'dattorro',
    parameters: [
      { name: 'in', type: 'number | [L:number, R:number]', description: 'Signal to reverberate (mono or stereo)' },
      {
        name: 'roomSize',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Room size/decay (0..1); higher values increase decay/feedback',
      },
      {
        name: 'damping',
        type: 'number',
        optional: true,
        defaultValue: 0.005,
        description: 'High-frequency damping (0..1); higher values damp more',
      },
      {
        name: 'bandwidth',
        type: 'number',
        optional: true,
        defaultValue: 0.9999,
        description: 'Input low-pass filter cutoff (0..1)',
      },
      {
        name: 'inputDiffusion1',
        type: 'number',
        optional: true,
        defaultValue: 0.75,
        description: 'First input diffuser amount (0..1)',
      },
      {
        name: 'inputDiffusion2',
        type: 'number',
        optional: true,
        defaultValue: 0.625,
        description: 'Second input diffuser amount (0..1)',
      },
      {
        name: 'decayDiffusion1',
        type: 'number',
        optional: true,
        defaultValue: 0.7,
        description: 'First decay diffuser amount (0..<1)',
      },
      {
        name: 'decayDiffusion2',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Second decay diffuser amount (0..<1)',
      },
      {
        name: 'excursionRate',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Modulation rate (0..2)',
      },
      {
        name: 'excursionDepth',
        type: 'number',
        optional: true,
        defaultValue: 0.7,
        description: 'Modulation depth (0..2)',
      },
      {
        name: 'preDelay',
        type: 'number',
        optional: true,
        defaultValue: 0,
        description: 'Pre-delay time in samples (0..sampleRate-1)',
      },
    ],
    returnType: '[L:number, R:number]',
    description: 'Dattorro-style plate reverb effect; returns wet stereo signal.',
    examples: [
      'saw(hz) |> dattorro($, 0.6) |> out($)',
      'saw(hz) |> dattorro($, roomSize:.6) |> out($)',
      '[saw(220), saw(221)] |> dattorro($, 0.75, 0, 0.9999, 0.75, 0.625, 0.7, 0.5, 0.01) |> out($)',
      '[saw(220), saw(221)] |> dattorro($, roomSize:.75, damping:.01) |> out($)',
    ],
  },
  fdn: {
    name: 'fdn',
    parameters: [
      { name: 'in', type: 'number | [L:number, R:number]', description: 'Signal to reverberate (mono or stereo)' },
      {
        name: 'roomSize',
        type: 'number',
        optional: true,
        defaultValue: 1.0,
        description: 'Room size scaling (0..1); affects delay line lengths',
      },
      {
        name: 'damping',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'High-frequency damping (0..1); 0=bright, 1=dark',
      },
      {
        name: 'decay',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Global feedback gain (0..1); higher values increase decay time',
      },
      {
        name: 'modulationDepth',
        type: 'number',
        optional: true,
        defaultValue: 1.0,
        description: 'Modulation depth scalar (0..1); affects chorus-like modulation',
      },
    ],
    returnType: '[L:number, R:number]',
    description:
      'Feedback Delay Network (FDN) reverb with 8 delay lines, Hadamard feedback matrix, and modulated fractional delays; returns wet stereo signal.',
    examples: [
      'saw(hz) |> fdn($, roomSize:0.8, decay:0.6) |> out($)',
      'saw(hz) |> fdn($, roomSize:1.0, decay:0.5, damping:0.3, modulationDepth:0.8) |> out($)',
      '[saw(220), saw(221)] |> fdn($, roomSize:0.9, decay:0.7, damping:0.2) |> out($)',
    ],
  },
  velvet: {
    name: 'velvet',
    parameters: [
      { name: 'in', type: 'number | [L:number, R:number]', description: 'Signal to reverberate (mono or stereo)' },
      {
        name: 'roomSize',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Room size scaling (0.1..2.0); affects delay line lengths',
      },
      {
        name: 'damping',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'High-frequency damping (0..1); higher values damp more',
      },
      {
        name: 'decay',
        type: 'number',
        optional: true,
        defaultValue: 0.5,
        description: 'Decay time control (0..1); higher values produce longer reverb tails',
      },
    ],
    returnType: '[L:number, R:number]',
    description:
      'Velvet noise reverb using 8 delay lines with rich texture and stereo decorrelation; returns wet stereo signal.',
    examples: [
      'saw(hz) |> velvet($, roomSize:0.8, damping:0.3) |> out($)',
      '[saw(220), saw(221)] |> velvet($, roomSize:1.2, damping:0.2) |> out($)',
      'sine(220) |> velvet($, roomSize:0.6, damping:0.8) |> out($)',
    ],
  },
  dc: {
    name: 'dc',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be DC-blocked' },
    ],
    returnType: 'number',
    description: 'DC blocker filter that removes very low frequency content (DC offset) from the signal.',
    examples: [
      'saw(110) |> dc($) |> out($)',
      'sine(440) + 0.1 |> dc($) |> out($)',
    ],
  },
  note: {
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
  degree: {
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
  getScale: {
    name: 'getScale',
    parameters: [],
    returnType: 'array',
    description:
      'Returns the current scale as an array of semitone intervals from the root. Use with scale directive (e.g., scale=\'dorian\').',
    examples: [
      'scale=\'pentatonic\'\n#scale // [0, 3, 5, 7, 10]',
      'scale=\'dorian\'\n#scale // [0, 2, 3, 5, 7, 9, 10]',
    ],
  },
  label: {
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
    description: 'Low-pass filter that attenuates high frequencies.',
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
    description: 'High-pass filter that attenuates low frequencies.',
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
    description: 'Band-pass filter that attenuates frequencies outside a specific range.',
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
    description: 'Band-stop filter that attenuates frequencies within a specific range.',
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
    description: 'Low-shelf filter that boosts or cuts low frequencies.',
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
    description: 'High-shelf filter that boosts or cuts high frequencies.',
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
    description: 'Peaking filter that boosts or cuts frequencies around a center point.',
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
    description: 'All-pass filter that changes phase without affecting frequency response.',
    examples: [
      'saw(220) |> ap($, cutoff:1000, q:1) |> out($)',
    ],
  },
  slp: {
    name: 'slp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be low-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Low-pass filter with resonance.',
    examples: [
      'saw(hz) |> slp($, cutoff:500) |> out($)',
    ],
  },
  shp: {
    name: 'shp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be high-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'High-pass filter with resonance.',
    examples: [
      'saw(hz) |> shp($, cutoff:200) |> out($)',
    ],
  },
  sbp: {
    name: 'sbp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be band-passed' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Band-pass filter with resonance.',
    examples: [
      'saw(hz) |> sbp($, cutoff:1000, q:2) |> out($)',
    ],
  },
  sbs: {
    name: 'sbs',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be band-stopped' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Band-stop filter with resonance.',
    examples: [
      'saw(hz) |> sbs($, cutoff:1000, q:5) |> out($)',
    ],
  },
  speak: {
    name: 'speak',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be peaked' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'Peaking filter with resonance.',
    examples: [
      'saw(hz) |> speak($, cutoff:1000, q:5) |> out($)',
    ],
  },
  sap: {
    name: 'sap',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be all-passed' },
      { name: 'cutoff', type: 'number', description: 'Center frequency in hertz' },
      { name: 'q', type: 'number', description: 'Q factor' },
    ],
    returnType: 'number',
    description: 'All-pass filter with resonance for phase shifting.',
    examples: [
      'saw(hz) |> sap($, cutoff:1000, q:1) |> out($)',
    ],
  },
  sah: {
    name: 'sah',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal to sample' },
      { name: 'trig', type: 'number', description: 'Trigger signal - samples when > 0 and rising' },
    ],
    returnType: 'number',
    description: 'Sample and hold - latches the input signal value when the trigger signal rises above 0.',
    examples: [
      'sine(440) |> sah($, every(1/4)) |> out($)',
      'noise() |> sah($, at(1/16)) |> out($)',
    ],
  },
  diodeladder: {
    name: 'diodeladder',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be filtered' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Resonance amount (0-1)' },
      { name: 'k', type: 'number', description: 'Special coefficient (0-1)' },
      { name: 'saturation', type: 'number', description: 'Input saturation amount' },
    ],
    returnType: 'number',
    description: 'Low-pass filter with diode-style saturation and resonance.',
    examples: [
      'saw(hz) |> diodeladder($, cutoff:1000, q:0.5, k:0.2) |> out($)',
    ],
  },
  olp: {
    name: 'olp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be low-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
    ],
    returnType: 'number',
    description: 'Simple low-pass filter.',
    examples: [
      'saw(hz) |> olp($, cutoff:1000) |> out($)',
    ],
  },
  ohp: {
    name: 'ohp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be high-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
    ],
    returnType: 'number',
    description: 'Simple high-pass filter.',
    examples: [
      'saw(hz) |> ohp($, cutoff:1000) |> out($)',
    ],
  },
  mlp: {
    name: 'mlp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be low-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Resonance factor' },
    ],
    returnType: 'number',
    description: 'Low-pass filter with Moog-style resonance.',
    examples: [
      'saw(hz) |> mlp($, cutoff:1000) |> out($)',
    ],
  },
  mhp: {
    name: 'mhp',
    parameters: [
      { name: 'in', type: 'number', description: 'Signal to be high-passed' },
      { name: 'cutoff', type: 'number', description: 'Cutoff frequency in hertz' },
      { name: 'q', type: 'number', description: 'Resonance factor' },
    ],
    returnType: 'number',
    description: 'High-pass filter with Moog-style resonance.',
    examples: [
      'saw(hz) |> mhp($, cutoff:200) |> out($)',
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
  white: {
    name: 'white',
    parameters: [
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Deterministic uncorrelated noise stream in -1..1 (stateful, advances every sample).',
    examples: [
      'white() |> out($)',
      'white(1234, trig) |> out($)',
    ],
  },
  gauss: {
    name: 'gauss',
    parameters: [
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Deterministic normal-like noise stream in -1..1 (stateful, advances every sample).',
    examples: [
      'gauss() |> out($)',
      'gauss(1234, trig) |> out($)',
    ],
  },
  pink: {
    name: 'pink',
    parameters: [
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Deterministic pink-ish noise stream in -1..1 (stateful, advances every sample).',
    examples: [
      'pink() |> out($)',
      'pink(1234, trig) |> out($)',
    ],
  },
  brown: {
    name: 'brown',
    parameters: [
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Deterministic brown-ish noise stream in -1..1 (stateful random walk with soft leak).',
    examples: [
      'brown() |> out($)',
      'brown(1234, trig) |> out($)',
    ],
  },
  random: {
    name: 'random',
    parameters: [
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (resets the random sequence when it changes, default: 1234)' },
    ],
    returnType: 'number',
    description: 'True random noise stream in 0..1 (stateful, advances every sample, no wavetable).',
    examples: [
      'random() |> out($)',
      'random(5678) * 2 - 1 |> out($)',
    ],
  },
  smooth: {
    name: 'smooth',
    parameters: [
      { name: 'rate', type: 'number', optional: true, defaultValue: 1,
        description: 'Change rate in Hz (higher values produce faster variation)' },
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'curve', type: 'number', optional: true, defaultValue: 0.5,
        description: 'Interpolation curve (0..1): 0=linear, 1=quintic smoothstep' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Continuous smooth noise stream in 0..1 (stateful, band-limited-ish).',
    examples: [
      'smooth() |> out($)',
      'smooth(1234, rate:4, trig:trig) |> out($)',
    ],
  },
  fractal: {
    name: 'fractal',
    parameters: [
      { name: 'rate', type: 'number', optional: true, defaultValue: 1,
        description: 'Base change rate in Hz for the first octave' },
      { name: 'seed', type: 'number', optional: true, defaultValue: 1234,
        description: 'Initial seed (deterministically initializes the noise stream when it changes, default: 1234)' },
      { name: 'octaves', type: 'number', optional: true, defaultValue: 4,
        description: 'Number of octaves to sum (higher = more detail)' },
      { name: 'gain', type: 'number', optional: true, defaultValue: 0.5,
        description: 'Amplitude multiplier per octave (0..1)' },
      { name: 'trig', type: 'number', optional: true, defaultValue: 0,
        description: 'Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0' },
    ],
    returnType: 'number',
    description: 'Multi-octave smooth variation (fBm-style) stream in 0..1 (stateful).',
    examples: [
      'fractal() |> out($)',
      'fractal(1234, rate:2, octaves:6, gain:.6, trig:trig) |> out($)',
    ],
  },
  sin: {
    name: 'sin',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Sine function.',
    examples: ['sin(t * 440 * 2 * 3.14159) |> out($)'],
  },
  cos: {
    name: 'cos',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Cosine function.',
    examples: ['cos(t * 440 * 2 * 3.14159) |> out($)'],
  },
  tan: {
    name: 'tan',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Tangent function.',
    examples: ['tan(x) |> out($)'],
  },
  asin: {
    name: 'asin',
    parameters: [{ name: 'x', type: 'number', description: 'Input value (-1..1)' }],
    returnType: 'number',
    description: 'Arcsine function.',
    examples: ['asin(sine(440)) |> out($)'],
  },
  acos: {
    name: 'acos',
    parameters: [{ name: 'x', type: 'number', description: 'Input value (-1..1)' }],
    returnType: 'number',
    description: 'Arccosine function.',
    examples: ['sine(110) |> acos($) |> out($)'],
  },
  tanh: {
    name: 'tanh',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Hyperbolic tangent function; useful for soft clipping.',
    examples: ['sine(220) * 5 |> tanh($) |> out($)'],
  },
  atan: {
    name: 'atan',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Arctangent function.',
    examples: ['atan(x) |> out($)'],
  },
  abs: {
    name: 'abs',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Absolute value.',
    examples: ['sine(110) |> abs($) |> out($)'],
  },
  sqrt: {
    name: 'sqrt',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Square root.',
    examples: ['sqrt(x) |> out($)'],
  },
  square: {
    name: 'square',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Square function (x²).',
    examples: ['square(sine(220)) |> out($)'],
  },
  cube: {
    name: 'cube',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Cube function (x³).',
    examples: ['cube(sine(220)) |> out($)'],
  },
  hypot: {
    name: 'hypot',
    parameters: [
      { name: 'x', type: 'number', description: 'First value' },
      { name: 'y', type: 'number', description: 'Second value' },
    ],
    returnType: 'number',
    description: 'Euclidean distance sqrt(x² + y²).',
    examples: ['hypot(3, 4) |> out($)'],
  },
  log: {
    name: 'log',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Natural logarithm.',
    examples: ['log(x) |> out($)'],
  },
  exp: {
    name: 'exp',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Exponential function (e^x).',
    examples: ['exp(x) |> out($)'],
  },
  log10: {
    name: 'log10',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Base-10 logarithm.',
    examples: ['log10(x) |> out($)'],
  },
  log2: {
    name: 'log2',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Base-2 logarithm.',
    examples: ['log2(x) |> out($)'],
  },
  exp2: {
    name: 'exp2',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Base-2 exponential function (2^x).',
    examples: ['exp2(x) |> out($)'],
  },
  min: {
    name: 'min',
    parameters: [
      { name: 'x', type: 'number', description: 'First value' },
      { name: 'y', type: 'number', description: 'Second value' },
    ],
    returnType: 'number',
    description: 'Minimum of two values.',
    examples: ['min(sine(220), 0.5) |> out($)'],
  },
  max: {
    name: 'max',
    parameters: [
      { name: 'x', type: 'number', description: 'First value' },
      { name: 'y', type: 'number', description: 'Second value' },
    ],
    returnType: 'number',
    description: 'Maximum of two values.',
    examples: ['max(sine(220), 0.5) |> out($)'],
  },
  clamp: {
    name: 'clamp',
    parameters: [
      { name: 'x', type: 'number', description: 'Value to clamp' },
      { name: 'lo', type: 'number', description: 'Lower bound' },
      { name: 'hi', type: 'number', description: 'Upper bound' },
    ],
    returnType: 'number',
    description: 'Clamps value between lo and hi.',
    examples: ['sine(220) * 2 |> clamp($, -0.5, 0.5) |> out($)'],
  },
  wrap: {
    name: 'wrap',
    parameters: [
      { name: 'x', type: 'number', description: 'Value to wrap' },
      { name: 'lo', type: 'number', description: 'Lower bound' },
      { name: 'hi', type: 'number', description: 'Upper bound' },
    ],
    returnType: 'number',
    description: 'Wraps value into range [lo, hi) with sawtooth pattern.',
    examples: ['t * 10 |> wrap($, 0, 1) |> out($)'],
  },
  mod: {
    name: 'mod',
    parameters: [
      { name: 'x', type: 'number', description: 'Dividend' },
      { name: 'y', type: 'number', description: 'Divisor' },
    ],
    returnType: 'number',
    description: 'Modulo operation: x - y * floor(x / y).',
    examples: ['mod(t * 10, 1) |> out($)'],
  },
  pingpong: {
    name: 'pingpong',
    parameters: [
      { name: 'x', type: 'number', description: 'Value to wrap' },
      { name: 'lo', type: 'number', description: 'Lower bound' },
      { name: 'hi', type: 'number', description: 'Upper bound' },
    ],
    returnType: 'number',
    description: 'Wraps value back and forth between lo and hi, producing a triangle-wave pattern.',
    examples: ['t * 10 |> pingpong($, 0, 1) |> out($)'],
  },
  fold: {
    name: 'fold',
    parameters: [
      { name: 'x', type: 'number', description: 'Value to fold' },
      { name: 'lo', type: 'number', description: 'Lower bound' },
      { name: 'hi', type: 'number', description: 'Upper bound' },
    ],
    returnType: 'number',
    description: 'Folds value at boundaries.',
    examples: ['sine(220) * 3 |> fold($, -0.5, 0.5) |> out($)'],
  },
  floor: {
    name: 'floor',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Rounds down to nearest integer.',
    examples: ['floor(sine(220) * 10) |> out($)'],
  },
  ceil: {
    name: 'ceil',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Rounds up to nearest integer.',
    examples: ['ceil(sine(220) * 10) |> out($)'],
  },
  round: {
    name: 'round',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Rounds to nearest integer.',
    examples: ['round(sine(220) * 10) |> out($)'],
  },
  trunc: {
    name: 'trunc',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Truncates to integer (rounds toward zero).',
    examples: ['trunc(sine(220) * 10) |> out($)'],
  },
  snap: {
    name: 'snap',
    parameters: [
      { name: 'x', type: 'number', description: 'Value to snap' },
      { name: 'step', type: 'number', description: 'Step size' },
    ],
    returnType: 'number',
    description: 'Snaps value to nearest multiple of step: round(x / step) * step.',
    examples: ['sine(220) |> snap($, 0.25) |> out($)'],
  },
  fract: {
    name: 'fract',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Fractional part (x - floor(x)).',
    examples: ['fract(t * 10) |> out($)'],
  },
  sign: {
    name: 'sign',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Sign function: -1 for negative, 0 for zero, 1 for positive.',
    examples: ['sign(sine(220)) |> out($)'],
  },
  lerp: {
    name: 'lerp',
    parameters: [
      { name: 'a', type: 'number', description: 'Start value' },
      { name: 'b', type: 'number', description: 'End value' },
      { name: 't', type: 'number', description: 'Interpolation factor (0..1)' },
    ],
    returnType: 'number',
    description: 'Linear interpolation: a + (b - a) * t.',
    examples: ['lerp(0, 1, sine(1)) |> out($)'],
  },
  smoothstep: {
    name: 'smoothstep',
    parameters: [
      { name: 'x', type: 'number', description: 'Input value' },
      { name: 'edge0', type: 'number', description: 'Lower edge' },
      { name: 'edge1', type: 'number', description: 'Upper edge' },
    ],
    returnType: 'number',
    description: 'Smooth Hermite interpolation between 0 and 1 when x is between edge0 and edge1.',
    examples: ['smoothstep(sine(1), -0.5, 0.5) |> out($)'],
  },
  smootherstep: {
    name: 'smootherstep',
    parameters: [
      { name: 'x', type: 'number', description: 'Input value' },
      { name: 'edge0', type: 'number', description: 'Lower edge' },
      { name: 'edge1', type: 'number', description: 'Upper edge' },
    ],
    returnType: 'number',
    description: 'Even smoother interpolation (6t⁵ - 15t⁴ + 10t³) between 0 and 1.',
    examples: ['smootherstep(sine(1), -0.5, 0.5) |> out($)'],
  },
  step: {
    name: 'step',
    parameters: [
      { name: 'x', type: 'number', description: 'Input value' },
      { name: 'edge', type: 'number', description: 'Edge threshold' },
    ],
    returnType: 'number',
    description: 'Step function: 0 if x < edge, 1 otherwise.',
    examples: ['step(sine(220), 0) |> out($)'],
  },
  heaviside: {
    name: 'heaviside',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Heaviside step function: 0 for x < 0, 0.5 for x = 0, 1 for x > 0.',
    examples: ['heaviside(sine(220)) |> out($)'],
  },
  select: {
    name: 'select',
    parameters: [
      { name: 'a', type: 'number', description: 'Value when condition is false' },
      { name: 'b', type: 'number', description: 'Value when condition is true' },
      { name: 'cond', type: 'number', description: 'Condition (0 = false, non-zero = true)' },
    ],
    returnType: 'number',
    description: 'Selects between two values based on condition.',
    examples: ['select(0, 1, sine(220) > 0) |> out($)'],
  },
  isnan: {
    name: 'isnan',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Returns 1 if x is NaN, 0 otherwise.',
    examples: ['isnan(x) |> out($)'],
  },
  isinf: {
    name: 'isinf',
    parameters: [{ name: 'x', type: 'number', description: 'Input value' }],
    returnType: 'number',
    description: 'Returns 1 if x is infinite, 0 otherwise.',
    examples: ['isinf(x) |> out($)'],
  },
  safediv: {
    name: 'safediv',
    parameters: [
      { name: 'x', type: 'number', description: 'Numerator' },
      { name: 'y', type: 'number', description: 'Denominator' },
    ],
    returnType: 'number',
    description: 'Safe division: returns 0 when y is 0, otherwise x / y.',
    examples: ['safediv(sine(220), sine(110)) |> out($)'],
  },
  db: {
    name: 'db',
    parameters: [{ name: 'x', type: 'number', description: 'Gain in decibels' }],
    returnType: 'number',
    description: 'Converts gain in decibels to linear gain.',
    examples: [
      'signal * db(6) |> out($)',
      'signal * db(-3) |> out($)',
    ],
  },
  semis: {
    name: 'semis',
    parameters: [{ name: 'x', type: 'number', description: 'Number of semitones' }],
    returnType: 'number',
    description: 'Converts semitones to frequency multiplier.',
    examples: [
      'note(60) * semis(7) |> sine(hz:$) |> out($)',
    ],
  },
  stereo: {
    name: 'stereo',
    parameters: [
      { name: 'in', type: 'number', description: 'Mono input signal' },
      { name: 'width', type: 'number', optional: true, defaultValue: 0, description: 'Stereo width in seconds' },
    ],
    returnType: '[L:number, R:number]',
    description: 'Converts mono signal to stereo, optionally with delay-based widening.',
    examples: [
      'sine(440) |> stereo($) |> out($)',
      'saw(220) |> stereo($, width:0.01) |> out($)',
    ],
  },
  mono: {
    name: 'mono',
    parameters: [{ name: 'in', type: '[L:number, R:number]', description: 'Stereo input signal' }],
    returnType: 'number',
    description: 'Converts stereo signal to mono by averaging channels.',
    examples: [
      '[saw(220), saw(221)] |> mono($) |> out($)',
    ],
  },
  stereowidth: {
    name: 'stereowidth',
    parameters: [
      { name: 'in', type: '[L:number, R:number]', description: 'Stereo input signal' },
      { name: 'width', type: 'number', optional: true, defaultValue: 1, description: 'Width multiplier' },
    ],
    returnType: '[L:number, R:number]',
    description: 'Adjusts stereo width using mid-side processing.',
    examples: [
      '[saw(220), saw(221)] |> stereowidth($, width:2) |> out($)',
      'stereo(saw(220)) |> stereowidth($, width:0.5) |> out($)',
    ],
  },
  widen: {
    name: 'widen',
    parameters: [
      { name: 'in', type: '[L:number, R:number]', description: 'Stereo input signal' },
      { name: 'seconds', type: 'number', optional: true, defaultValue: 0.0001, description: 'Delay time in seconds' },
    ],
    returnType: '[L:number, R:number]',
    description: 'Widens stereo signal by delaying high frequencies in right channel.',
    examples: [
      '[saw(220), saw(221)] |> widen($, seconds:0.005) |> out($)',
    ],
  },
  pan: {
    name: 'pan',
    parameters: [
      { name: 'in', type: '[L:number, R:number]', description: 'Stereo input signal' },
      { name: 'balance', type: 'number', optional: true, defaultValue: 0.5,
        description: 'Pan position (0=left, 1=right)' },
    ],
    returnType: '[L:number, R:number]',
    description: 'Pans stereo signal left or right.',
    examples: [
      '[saw(220), saw(221)] |> pan($, balance:0.2) |> out($)',
    ],
  },
  modDelay: {
    name: 'modDelay',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'baseDelay', type: 'number', description: 'Base delay time in seconds' },
      { name: 'depth', type: 'number', description: 'Modulation depth' },
      { name: 'rate', type: 'number', description: 'LFO rate in Hz' },
      { name: 'feedback', type: 'number', description: 'Feedback amount' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0, description: 'Phase offset' },
    ],
    returnType: 'number',
    description: 'Modulated delay effect with LFO-controlled delay time.',
    examples: [
      'sine(440) |> modDelay($, 0.1, 0.05, 1, 0.3) |> out($)',
    ],
  },
  flanger: {
    name: 'flanger',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'rate', type: 'number', optional: true, defaultValue: 1, description: 'LFO rate in Hz' },
      { name: 'depth', type: 'number', optional: true, defaultValue: 0.00125, description: 'Modulation depth' },
      { name: 'base', type: 'number', optional: true, defaultValue: 0.00125, description: 'Base delay time' },
      { name: 'feedback', type: 'number', optional: true, defaultValue: 0.7, description: 'Feedback amount' },
    ],
    returnType: 'number',
    description: 'Classic flanger effect using modulated comb filtering.',
    examples: [
      'saw(220) |> flanger($, rate:0.5, depth:0.005) |> out($)',
    ],
  },
  chorus: {
    name: 'chorus',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'voices', type: 'number', optional: true, defaultValue: 3, description: 'Number of chorus voices' },
      { name: 'base', type: 'number', optional: true, defaultValue: 0.02, description: 'Base delay time' },
      { name: 'depth', type: 'number', optional: true, defaultValue: 0.006, description: 'Modulation depth' },
      { name: 'rate', type: 'number', optional: true, defaultValue: 0.25, description: 'LFO rate' },
      { name: 'spread', type: 'number', optional: true, defaultValue: 0.5, description: 'Voice spread' },
    ],
    returnType: 'number',
    description: 'Multi-voice chorus effect with spread and modulation.',
    examples: [
      'sine(440) |> chorus($, voices:5, rate:0.3) |> out($)',
    ],
  },
  tap: {
    name: 'tap',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'seconds', type: 'number', description: 'Delay time in seconds' },
      { name: 'cb', type: 'function', description: 'Callback function for feedback processing' },
    ],
    returnType: 'number',
    description: 'Simple delay tap with callback processing.',
    examples: [
      'sine(440) |> tap($, 0.25, x -> x * 0.5) |> out($)',
    ],
  },
  comb: {
    name: 'comb',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'seconds', type: 'number', description: 'Delay time in seconds' },
      { name: 'feedback', type: 'number', description: 'Feedback amount' },
      { name: 'cb', type: 'function', description: 'Callback function for feedback processing' },
    ],
    returnType: 'number',
    description: 'Comb filter combining feedforward and feedback delay.',
    examples: [
      'saw(110) |> comb($, 0.1, 0.8, x -> lp(x, 1000)) |> out($)',
    ],
  },
  eq3: {
    name: 'eq3',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'low', type: 'number', optional: true, defaultValue: 0, description: 'Low frequency gain in dB' },
      { name: 'mid', type: 'number', optional: true, defaultValue: 0, description: 'Mid frequency gain in dB' },
      { name: 'high', type: 'number', optional: true, defaultValue: 0, description: 'High frequency gain in dB' },
      { name: 'lf', type: 'number', optional: true, defaultValue: 500, description: 'Low frequency cutoff' },
      { name: 'mf', type: 'number', optional: true, defaultValue: 2000, description: 'Mid frequency cutoff' },
      { name: 'hf', type: 'number', optional: true, defaultValue: 8000, description: 'High frequency cutoff' },
    ],
    returnType: 'number',
    description: '3-band equalizer with adjustable low, mid, and high frequency gains.',
    examples: [
      'saw(220) |> eq3($, low:6, mid:-3, high:2) |> out($)',
    ],
  },
  grain: {
    name: 'grain',
    parameters: [
      { name: 'speed', type: 'number', optional: true, defaultValue: 1, description: 'Playback speed' },
      { name: 'seed', type: 'number', description: 'Random seed' },
    ],
    returnType: 'number',
    description: 'Granular synthesis-inspired trigger generator based on speed.',
    examples: [
      'grain(speed:2, seed:123) |> out($)',
    ],
  },
  vocoder: {
    name: 'vocoder',
    parameters: [
      { name: 'carrier', type: 'number', description: 'Carrier signal' },
      { name: 'modulator', type: 'number', description: 'Modulator signal' },
      { name: 'numBands', type: 'number', optional: true, defaultValue: 16, description: 'Number of frequency bands' },
      { name: 'attack', type: 'number', optional: true, defaultValue: 0.01, description: 'Envelope attack time' },
      { name: 'release', type: 'number', optional: true, defaultValue: 0.04, description: 'Envelope release time' },
      { name: 'freqMin', type: 'number', optional: true, defaultValue: 100, description: 'Minimum frequency' },
      { name: 'freqMax', type: 'number', optional: true, defaultValue: 8000, description: 'Maximum frequency' },
    ],
    returnType: 'number',
    description: 'Vocoder effect using bandpass filters and envelope following.',
    examples: [
      'vocoder(carrier:saw(220), modulator:sine(110)) |> out($)',
    ],
  },
  karplus: {
    name: 'karplus',
    parameters: [
      { name: 'hz', type: 'number', description: 'Fundamental frequency' },
      { name: 'pluck', type: 'function', optional: true, defaultValue: 'pink', description: 'Pluck function' },
      { name: 'seed', type: 'number', optional: true, defaultValue: 334, description: 'Random seed' },
      { name: 'attack', type: 'number', optional: true, defaultValue: 0.0001, description: 'Attack time' },
      { name: 'decay', type: 'number', optional: true, defaultValue: 0.1, description: 'Decay time' },
      { name: 'exponent', type: 'number', optional: true, defaultValue: 40, description: 'Envelope exponent' },
      { name: 'damping', type: 'number', optional: true, defaultValue: 0.5, description: 'Damping amount' },
      { name: 'trig', type: 'number', description: 'Trigger signal' },
    ],
    returnType: 'number',
    description: 'Karplus-Strong plucked string synthesis algorithm.',
    examples: [
      'karplus(220, trig:every(1/2)) |> out($)',
    ],
  },
  metronome: {
    name: 'metronome',
    parameters: [],
    returnType: 'number',
    description: 'Generates a metronome sound with major/minor chord progression.',
    examples: [
      'metronome() |> out($)',
    ],
  },
  harmonics: {
    name: 'harmonics',
    parameters: [
      { name: 'hz', type: 'number', description: 'Fundamental frequency' },
      { name: 'numHarmonics', type: 'number', optional: true, defaultValue: 3, description: 'Number of harmonics' },
      { name: 'tilt', type: 'number', optional: true, defaultValue: 3, description: 'Spectral tilt' },
      { name: 'offset', type: 'number', optional: true, defaultValue: 0, description: 'Phase offset' },
      { name: 'trig', type: 'number', description: 'Trigger signal' },
    ],
    returnType: 'number',
    description: 'Additive synthesis with harmonic series and tilt control.',
    examples: [
      'harmonics(110, numHarmonics:5, tilt:2, trig:every(1/4)) |> out($)',
    ],
  },
  folded: {
    name: 'folded',
    parameters: [
      { name: 'hz', type: 'number', description: 'Fundamental frequency' },
      { name: 'numHarmonics', type: 'number', optional: true, defaultValue: 2, description: 'Number of harmonics' },
      { name: 'amount', type: 'number', optional: true, defaultValue: 2, description: 'Folding amount' },
    ],
    returnType: 'number',
    description: 'Wave folding synthesis with harmonic enhancement.',
    examples: [
      'folded(220, numHarmonics:4, amount:3) |> out($)',
    ],
  },
  pulsar: {
    name: 'pulsar',
    parameters: [
      { name: 'hz', type: 'number', description: 'Frequency' },
      { name: 'density', type: 'number', optional: true, defaultValue: 1, description: 'Pulse density' },
    ],
    returnType: 'number',
    description: 'Pulsar synthesis with phasor-controlled envelope.',
    examples: [
      'pulsar(110, density:2) |> out($)',
    ],
  },
  supersaw: {
    name: 'supersaw',
    parameters: [
      { name: 'hz', type: 'number', description: 'Fundamental frequency' },
      { name: 'voices', type: 'number', optional: true, defaultValue: 5, description: 'Number of detuned voices' },
      { name: 'spread', type: 'number', optional: true, defaultValue: 0.05, description: 'Detuning spread' },
    ],
    returnType: 'number',
    description: 'Supersaw oscillator with multiple detuned sawtooth voices.',
    examples: [
      'supersaw(110, voices:7, spread:0.1) |> out($)',
    ],
  },
  drawbar: {
    name: 'drawbar',
    parameters: [
      { name: 'hz', type: 'number', description: 'Fundamental frequency' },
      { name: 'bars', type: 'array', description: 'Drawbar settings array' },
    ],
    returnType: 'number',
    description: 'Hammond organ-style drawbar oscillator.',
    examples: [
      'drawbar(110, bars:[1,0.7,0.5,0.3,0.2]) |> out($)',
    ],
  },
  drum: {
    name: 'drum',
    parameters: [
      { name: 'noise', type: 'function', optional: true, defaultValue: 'white', description: 'Noise function' },
      { name: 'seed', type: 'number', optional: true, defaultValue: 42, description: 'Random seed' },
      { name: 'freqs', type: 'array', description: 'Filter frequencies' },
      { name: 'trig', type: 'number', description: 'Trigger signal' },
    ],
    returnType: 'number',
    description: 'Drum synthesis using filtered noise excitation.',
    examples: [
      'drum(trig:every(1/2)) |> out($)',
    ],
  },
  vowel: {
    name: 'vowel',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'vowelName', type: 'number', description: 'Vowel index (0=a, 1=e, 2=i, 3=o, 4=u)' },
    ],
    returnType: 'number',
    description: 'Formant filter for vowel sounds.',
    examples: [
      'sine(110) |> vowel($, va) |> out($)',
    ],
  },
  ring: {
    name: 'ring',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'hz', type: 'number', description: 'Modulation frequency' },
    ],
    returnType: 'number',
    description: 'Ring modulation effect.',
    examples: [
      'saw(220) |> ring($, 330) |> out($)',
    ],
  },
  tube: {
    name: 'tube',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'drive', type: 'number', optional: true, defaultValue: 3, description: 'Drive amount' },
      { name: 'bias', type: 'number', optional: true, defaultValue: 0.2, description: 'Bias offset' },
    ],
    returnType: 'number',
    description: 'Tube saturation/distortion using hyperbolic tangent.',
    examples: [
      'saw(220) |> tube($, drive:5, bias:0.1) |> out($)',
    ],
  },
  clip: {
    name: 'clip',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'x', type: 'number', optional: true, defaultValue: 1, description: 'Clipping threshold' },
    ],
    returnType: 'number',
    description: 'Hard clipping distortion.',
    examples: [
      'saw(220) * 2 |> clip($, 0.5) |> out($)',
    ],
  },
  bitcrush: {
    name: 'bitcrush',
    parameters: [
      { name: 'in', type: 'number', description: 'Input signal' },
      { name: 'rate', type: 'number', optional: true, defaultValue: 8000, description: 'Sample rate' },
    ],
    returnType: 'number',
    description: 'Bit crushing effect using sample and hold.',
    examples: [
      'saw(220) |> bitcrush($, rate:1000) |> out($)',
    ],
  },
  mix: {
    name: 'mix',
    parameters: [{ name: 'signal', type: 'number', description: 'Input signal' }],
    returnType: 'number',
    description: 'Mix operator that passes through signal unchanged.',
    examples: [
      'signal |> mix($)',
    ],
  },
  uni: {
    name: 'uni',
    parameters: [{ name: 'x', type: 'number', description: 'Input signal' }],
    returnType: 'number',
    description: 'Convert bipolar signal to unipolar ([-1,1] to [0,1]).',
    examples: [
      'sine(440) |> uni($) |> out($)',
    ],
  },
  bi: {
    name: 'bi',
    parameters: [{ name: 'x', type: 'number', description: 'Input signal' }],
    returnType: 'number',
    description: 'Convert unipolar signal to bipolar ([0,1] to [-1,1]).',
    examples: [
      'random() |> bi($) |> out($)',
    ],
  },
  crossfade: {
    name: 'crossfade',
    parameters: [
      { name: 'a', type: 'number', description: 'First signal' },
      { name: 'b', type: 'number', description: 'Second signal' },
      { name: 't', type: 'number', description: 'Crossfade position (0 = all A, 1 = all B)' },
    ],
    returnType: 'number',
    description: 'Crossfade between two signals.',
    examples: [
      'crossfade(sine(220), saw(220), lfosine(1)) |> out($)',
    ],
  },
  va: {
    name: 'va',
    parameters: [],
    returnType: 'number',
    description: 'Vowel constant for "a" sound (used with vowel function).',
    examples: [
      'sine(110) |> vowel($, va) |> out($)',
    ],
  },
  ve: {
    name: 've',
    parameters: [],
    returnType: 'number',
    description: 'Vowel constant for "e" sound (used with vowel function).',
    examples: [
      'sine(110) |> vowel($, ve) |> out($)',
    ],
  },
  vi: {
    name: 'vi',
    parameters: [],
    returnType: 'number',
    description: 'Vowel constant for "i" sound (used with vowel function).',
    examples: [
      'sine(110) |> vowel($, vi) |> out($)',
    ],
  },
  vo: {
    name: 'vo',
    parameters: [],
    returnType: 'number',
    description: 'Vowel constant for "o" sound (used with vowel function).',
    examples: [
      'sine(110) |> vowel($, vo) |> out($)',
    ],
  },
  vu: {
    name: 'vu',
    parameters: [],
    returnType: 'number',
    description: 'Vowel constant for "u" sound (used with vowel function).',
    examples: [
      'sine(110) |> vowel($, vu) |> out($)',
    ],
  },
}
