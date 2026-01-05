/**
 * Centralized configuration for auto-generating knobs for DSP functions.
 *
 * This defines which functions should have their numeric parameters
 * automatically extracted and turned into UI knobs.
 */

export type KnobMode = 'linear' | 'exp2'

export type KnobParamConfig = {
  /** Canonical parameter name. */
  name: string
  /** Default value if not specified (best-effort compile-time snapshot). */
  defaultValue: number
  /** UI range min. */
  min: number
  /** UI range max. */
  max: number
  /** UI curve. */
  mode: KnobMode
  precision?: number
  stepPerPx?: number
}

export type FunctionKnobConfig = {
  /** The function name(s) that this config applies to. */
  functionNames: string[]
  /**
   * Positional knob params (in-order).
   *
   * If `hasInputParam` is true, positional knob params start after the signal/input argument.
   */
  knobParams: KnobParamConfig[]
  /** Extra knobs that are only available as named params (e.g. `seed:`). */
  namedKnobParams?: KnobParamConfig[]
  /** Whether this function has an `in`/`input` signal parameter (first positional). */
  hasInputParam?: boolean
  /** Whether this function has a `key` sidechain parameter. */
  hasKeyParam?: boolean
}

export const KNOB_CONFIGS: FunctionKnobConfig[] = [
  // Compressor
  {
    functionNames: ['compressor'],
    hasInputParam: true,
    hasKeyParam: true,
    knobParams: [
      { name: 'attack', defaultValue: 0.01, min: 0.0001, max: 1, mode: 'exp2', precision: 4 },
      { name: 'release', defaultValue: 0.1, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'threshold', defaultValue: -24, min: -60, max: 0, mode: 'linear', precision: 0, stepPerPx: 0.15 },
      { name: 'ratio', defaultValue: 4, min: 1, max: 20, mode: 'linear', precision: 2, stepPerPx: 0.05 },
      { name: 'knee', defaultValue: 6, min: 0, max: 40, mode: 'linear', precision: 1, stepPerPx: 0.2 },
    ],
  },

  // Expander
  {
    functionNames: ['expander'],
    hasInputParam: true,
    hasKeyParam: true,
    knobParams: [
      { name: 'attack', defaultValue: 0.01, min: 0.0001, max: 1, mode: 'exp2', precision: 4 },
      { name: 'release', defaultValue: 0.1, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'threshold', defaultValue: -24, min: -60, max: 0, mode: 'linear', precision: 0, stepPerPx: 0.15 },
      { name: 'ratio', defaultValue: 2, min: 1, max: 100, mode: 'linear', precision: 2, stepPerPx: 0.05 },
      { name: 'knee', defaultValue: 6, min: 0, max: 40, mode: 'linear', precision: 1, stepPerPx: 0.2 },
    ],
  },

  // Gate
  {
    functionNames: ['gate'],
    hasInputParam: true,
    hasKeyParam: true,
    knobParams: [
      { name: 'attack', defaultValue: 0.001, min: 0.0001, max: 1, mode: 'exp2', precision: 4 },
      { name: 'release', defaultValue: 0.5, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'threshold', defaultValue: -24, min: -60, max: 0, mode: 'linear', precision: 0, stepPerPx: 0.15 },
      { name: 'ratio', defaultValue: 100, min: 1, max: 100, mode: 'linear', precision: 2, stepPerPx: 0.05 },
      { name: 'knee', defaultValue: 0, min: 0, max: 40, mode: 'linear', precision: 1, stepPerPx: 0.2 },
      { name: 'hold', defaultValue: 0.02, min: 0, max: 1, mode: 'linear', precision: 2 },
    ],
  },

  // Limiter
  {
    functionNames: ['limiter'],
    hasInputParam: true,
    knobParams: [
      { name: 'release', defaultValue: 0.1, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'threshold', defaultValue: 0, min: -80, max: 0, mode: 'linear', precision: 0, stepPerPx: 0.15 },
    ],
  },

  // Filters
  {
    functionNames: ['lp', 'hp', 'bp', 'bs', 'ls', 'hs', 'peak', 'ap', 'slp', 'shp', 'sbp', 'sbs', 'speak', 'sap', 'mlp',
      'mhp', 'diodeladder', 'olp', 'ohp'],
    hasInputParam: true,
    knobParams: [
      { name: 'cutoff', defaultValue: 1000, min: 20, max: 20000, mode: 'exp2', precision: 2 },
      { name: 'q', defaultValue: 1, min: 0.05, max: 24, mode: 'exp2', precision: 3 },
      { name: 'gain', defaultValue: 0, min: -24, max: 24, mode: 'linear', precision: 2 },
    ],
  },

  // Reverbs
  {
    functionNames: ['freeverb', 'dattorro', 'fdn', 'velvet'],
    hasInputParam: true,
    knobParams: [
      { name: 'roomSize', defaultValue: 0.5, min: 0, max: 1, mode: 'linear', precision: 3 },
    ],
  },

  // LFOs
  {
    functionNames: ['lfosine', 'lfotri', 'lfosaw', 'lforamp', 'lfosqr', 'lfosah', 'smooth', 'fractal'],
    knobParams: [
      { name: 'bar', defaultValue: 1, min: 0.25, max: 64, mode: 'exp2', precision: 2 },
      { name: 'offset', defaultValue: 0, min: -1, max: 1, mode: 'linear', precision: 3 },
    ],
    namedKnobParams: [
      { name: 'seed', defaultValue: 0, min: 0, max: 1000000, mode: 'linear', precision: 0 }, // fractal only
    ],
  },

  // Envelopes
  {
    functionNames: ['ad'],
    knobParams: [
      { name: 'attack', defaultValue: 0.01, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'decay', defaultValue: 0.1, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
      { name: 'exponent', defaultValue: 1, min: 0.1, max: 8, mode: 'exp2', precision: 3 },
    ],
  },
  {
    functionNames: ['adsr'],
    knobParams: [
      { name: 'attack', defaultValue: 0.01, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'decay', defaultValue: 0.1, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
      { name: 'sustain', defaultValue: 0.7, min: 0, max: 1, mode: 'linear', precision: 3 },
      { name: 'release', defaultValue: 0.1, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
      { name: 'exponent', defaultValue: 1, min: 0.1, max: 8, mode: 'exp2', precision: 3 },
    ],
  },
  {
    functionNames: ['envfollow'],
    hasInputParam: true,
    knobParams: [
      { name: 'attack', defaultValue: 0.01, min: 0.0001, max: 5, mode: 'exp2', precision: 4 },
      { name: 'release', defaultValue: 0.1, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
    ],
  },

  // Slew
  {
    functionNames: ['slew'],
    hasInputParam: true,
    knobParams: [
      { name: 'up', defaultValue: 0.01, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
      { name: 'down', defaultValue: 0.01, min: 0.0001, max: 10, mode: 'exp2', precision: 4 },
      { name: 'exponent', defaultValue: 1, min: 0.1, max: 8, mode: 'exp2', precision: 3 },
    ],
  },

  // Slicer
  {
    functionNames: ['slicer'],
    knobParams: [
      { name: 'threshold', defaultValue: 0.5, min: 0, max: 1, mode: 'linear', precision: 3 },
    ],
  },
]

/**
 * Get the knob configuration for a function name
 */
export function getKnobConfig(functionName: string): FunctionKnobConfig | null {
  return KNOB_CONFIGS.find(config => config.functionNames.includes(functionName)) ?? null
}

/**
 * Get the parameter name for a positional index
 */
export function getParamNameForPosition(config: FunctionKnobConfig, knobIndex: number): string | null {
  return config.knobParams[knobIndex]?.name ?? null
}

/**
 * Get all valid parameter names for a function
 */
export function getValidParamNames(config: FunctionKnobConfig): string[] {
  return [
    ...config.knobParams.map(p => p.name),
    ...(config.namedKnobParams?.map(p => p.name) ?? []),
  ]
}

export function getKnobParamConfig(config: FunctionKnobConfig, name: string): KnobParamConfig | null {
  return config.knobParams.find(p => p.name === name)
    ?? config.namedKnobParams?.find(p => p.name === name)
    ?? null
}
