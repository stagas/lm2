import type { Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getIndexFromCall,
  getPosArg,
  resolveParamName,
} from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import { getKnobConfig, getParamNameForPosition, getValidParamNames } from './knob-config.ts'
import type { GenericKnobRef } from './types.ts'

/**
 * Creates a generic visitor that extracts knob parameters for any function
 * defined in the knob configuration.
 */
export function createGenericKnobVisitor(src: string, refs: GenericKnobRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (!calleeName) return

      const config = getKnobConfig(calleeName)
      if (!config) return

      const validParamNames = getValidParamNames(config)

      // Extract input arg if configured
      let inArgLoc: Loc | null = null
      let hasNamedInput = false
      if (config.hasInputParam) {
        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in') ?? findNamedArg(expr, 'input')
        hasNamedInput = !!namedIn
        inArgLoc = namedIn?.loc ?? pos0?.loc ?? null
      }

      // Extract key/sidechain arg if configured
      let keyArgLoc: Loc | null = null
      if (config.hasKeyParam) {
        const namedKey = findNamedArg(expr, 'key')
        // Find the last positional arg as fallback for key
        const posArgs = (expr.args ?? []).filter((a: any) => a.kind === 'pos')
        const lastPos = posArgs[posArgs.length - 1]
        keyArgLoc = namedKey?.loc ?? lastPos?.loc ?? null
      }

      // Extract knob parameters
      const knobParams: GenericKnobRef['knobParams'] = []
      const params: Record<string, number> = {}
      const seen = new Set<string>()

      // Initialize params with defaults
      for (const paramConfig of config.knobParams) {
        params[paramConfig.name] = paramConfig.defaultValue
      }
      for (const paramConfig of config.namedKnobParams ?? []) {
        params[paramConfig.name] = paramConfig.defaultValue
      }

      let posIndex = 0

      for (const a of expr.args ?? []) {
        if (!a) continue

        if (a.kind === 'pos') {
          const positionalOffset = (config.hasInputParam && !hasNamedInput) ? 1 : 0
          const isInputPos = positionalOffset === 1 && posIndex === 0
          const knobIndex = posIndex - positionalOffset
          posIndex++
          if (isInputPos) continue

          const paramName = getParamNameForPosition(config, knobIndex)
          if (!paramName) continue
          if (seen.has(paramName)) continue

          const v = tryEvalConstNumber(a.value)
          if (v != null && Number.isFinite(v)) {
            params[paramName] = v
            if (a.value?.loc && !a.value.loc.kernel && a.value.loc.line > 0) {
              seen.add(paramName)
              knobParams.push({ name: paramName, value: v, valueLoc: a.value.loc })
            }
          }
          continue
        }

        if (a.kind === 'named') {
          // Skip special params
          if (a.name === '%index' || a.name === 'index' || a.name === 'in' || a.name === 'input' || a.name === 'key') {
            continue
          }

          const resolvedName = resolveParamName(a.name, validParamNames)
          if (!resolvedName) continue
          if (seen.has(resolvedName)) continue

          const v = tryEvalConstNumber(a.value)
          if (v != null && Number.isFinite(v)) {
            params[resolvedName] = v
            if (a.value?.loc && !a.value.loc.kernel && a.value.loc.line > 0) {
              seen.add(resolvedName)
              knobParams.push({ name: resolvedName, value: v, valueLoc: a.value.loc })
            }
          }
        }
      }

      const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
      const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)
      const index = getIndexFromCall(expr)

      const ref: any = {
        functionName: calleeName,
        index,
        loc: calleeLoc,
        aboveLoc,
        callLoc: expr.loc,
        inArgLoc,
        keyArgLoc,
        knobParams,
        params,
      }

      // Add special arg location fields for specific function types
      if (calleeName.startsWith('lfo') || calleeName === 'smooth' || calleeName === 'fractal') {
        // LFOs: bar, offset, trig, seed
        ref.barArgLoc = findNamedArg(expr, 'bar')?.loc ?? getPosArg(expr, 0)?.loc ?? null
        ref.offsetArgLoc = findNamedArg(expr, 'offset')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.trigArgLoc = findNamedArg(expr, 'trig')?.loc ?? null
        ref.seedArgLoc = findNamedArg(expr, 'seed')?.loc ?? null
      } else if (calleeName === 'ad') {
        // AD: attack, decay, exponent, trig
        ref.attackArgLoc = findNamedArg(expr, 'attack')?.loc ?? getPosArg(expr, 0)?.loc ?? null
        ref.decayArgLoc = findNamedArg(expr, 'decay')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.exponentArgLoc = findNamedArg(expr, 'exponent')?.loc ?? getPosArg(expr, 2)?.loc ?? null
        ref.trigArgLoc = findNamedArg(expr, 'trig')?.loc ?? null
      } else if (calleeName === 'adsr') {
        // ADSR: attack, decay, sustain, release, exponent, trig
        ref.attackArgLoc = findNamedArg(expr, 'attack')?.loc ?? getPosArg(expr, 0)?.loc ?? null
        ref.decayArgLoc = findNamedArg(expr, 'decay')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.sustainArgLoc = findNamedArg(expr, 'sustain')?.loc ?? getPosArg(expr, 2)?.loc ?? null
        ref.releaseArgLoc = findNamedArg(expr, 'release')?.loc ?? getPosArg(expr, 3)?.loc ?? null
        ref.exponentArgLoc = findNamedArg(expr, 'exponent')?.loc ?? getPosArg(expr, 4)?.loc ?? null
        ref.trigArgLoc = findNamedArg(expr, 'trig')?.loc ?? null
      } else if (calleeName === 'envfollow') {
        // Envfollow: input, attack, release
        ref.inputArgLoc = inArgLoc
        ref.attackArgLoc = findNamedArg(expr, 'attack')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.releaseArgLoc = findNamedArg(expr, 'release')?.loc ?? getPosArg(expr, 2)?.loc ?? null
      } else if (calleeName === 'slew') {
        // Slew: input, up, down, exponent
        ref.upArgLoc = findNamedArg(expr, 'up')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.downArgLoc = findNamedArg(expr, 'down')?.loc ?? getPosArg(expr, 2)?.loc ?? null
        ref.exponentArgLoc = findNamedArg(expr, 'exponent')?.loc ?? findNamedArg(expr, 'exp')?.loc ?? getPosArg(expr, 3)?.loc ?? null
      } else if (['lp', 'hp', 'bp', 'bs', 'ls', 'hs', 'peak', 'ap', 'slp', 'shp', 'sbp', 'sbs', 'speak', 'sap', 'mlp', 'mhp', 'diodeladder', 'olp', 'ohp'].includes(calleeName)) {
        // Filters: input, cutoff, q, gain
        ref.cutArgLoc = findNamedArg(expr, 'cutoff')?.loc ?? findNamedArg(expr, 'cut')?.loc ?? getPosArg(expr, 1)?.loc ?? null
        ref.qArgLoc = findNamedArg(expr, 'q')?.loc ?? getPosArg(expr, 2)?.loc ?? null
        ref.gainArgLoc = findNamedArg(expr, 'gain')?.loc ?? getPosArg(expr, 3)?.loc ?? null
      } else if (['freeverb', 'dattorro', 'fdn', 'velvet'].includes(calleeName)) {
        // Reverbs: input, roomSize
        ref.roomSizeArgLoc = findNamedArg(expr, 'roomSize')?.loc ?? getPosArg(expr, 1)?.loc ?? null
      } else if (calleeName === 'slicer') {
        // Slicer: sample, threshold
        ref.sampleArgLoc = findNamedArg(expr, 'sample')?.loc ?? getPosArg(expr, 0)?.loc ?? null
        ref.thresholdArgLoc = findNamedArg(expr, 'threshold')?.loc ?? getPosArg(expr, 1)?.loc ?? null
      }

      // Add legacy index fields and type-specific fields for backward compatibility
      if (calleeName === 'compressor') {
        ref.compressorIndex = index
      } else if (calleeName === 'expander') {
        ref.expanderIndex = index
      } else if (calleeName === 'gate') {
        ref.gateIndex = index
      } else if (calleeName === 'limiter') {
        ref.limiterIndex = index
      } else if (calleeName === 'lfosine') {
        ref.lfoIndex = index
        ref.lfoType = 'sine'
      } else if (calleeName === 'lfotri') {
        ref.lfoIndex = index
        ref.lfoType = 'tri'
      } else if (calleeName === 'lfosaw') {
        ref.lfoIndex = index
        ref.lfoType = 'saw'
      } else if (calleeName === 'lforamp') {
        ref.lfoIndex = index
        ref.lfoType = 'ramp'
      } else if (calleeName === 'lfosqr') {
        ref.lfoIndex = index
        ref.lfoType = 'sqr'
      } else if (calleeName === 'lfosah') {
        ref.lfoIndex = index
        ref.lfoType = 'sah'
      } else if (calleeName === 'smooth') {
        ref.lfoIndex = index
        ref.lfoType = 'smooth'
      } else if (calleeName === 'fractal') {
        ref.lfoIndex = index
        ref.lfoType = 'fractal'
      } else if (calleeName === 'freeverb') {
        ref.reverbIndex = index
        ref.reverbKind = 'freeverb'
      } else if (calleeName === 'dattorro') {
        ref.reverbIndex = index
        ref.reverbKind = 'dattorro'
      } else if (calleeName === 'fdn') {
        ref.reverbIndex = index
        ref.reverbKind = 'fdn'
      } else if (calleeName === 'velvet') {
        ref.reverbIndex = index
        ref.reverbKind = 'velvet'
      } else if (calleeName === 'ad') {
        ref.adIndex = index
      } else if (calleeName === 'adsr') {
        ref.adsrIndex = index
      } else if (calleeName === 'envfollow') {
        ref.envfollowIndex = index
      } else if (calleeName === 'slew') {
        ref.slewIndex = index
      } else if (calleeName === 'slicer') {
        ref.slicerIndex = index
      } else if (['lp', 'hp', 'bp', 'bs', 'ls', 'hs', 'peak', 'ap', 'slp', 'shp', 'sbp', 'sbs', 'speak', 'sap', 'mlp', 'mhp', 'diodeladder', 'olp', 'ohp'].includes(calleeName)) {
        ref.filterIndex = index
        ref.filterType = calleeName
      }

      refs.push(ref)
    },
  }
}

