Compressor spec.

We create a 'compressor' gen for compressing the audio.
The signature will be: `compressor(in,attack,release,threshold,ratio,knee,key?)`

- in: the input signal
- attack: attack in seconds. (0.0001 .. 1)
- release: release in seconds. (0.0001 .. 5)
- threshold: threshold in db (-80 .. 0)
- ratio: compression ratio e.g 4 for 1:4 8 for 1:8 etc. (1 .. 20)
- knee: compression knee. (0 .. 40)
- key: the sidechain key signal, if given the input is compressed against this signal.

We also create UI widget for it. When a `compressor()` call is encountered in the code we create an "above" widget with a visualization of a) the gain reduction on the left like a vu-meter, b) the signal level overlayed with a ratio, knee and threshold continuous line with circles at the junction points. The visualization should use an analyser ring buffer similar to 'analyser' and 'useAnalyserWidget'.

We also create a "below" widget for the parameters, which will be a special "knobs array" widget, for the attack, release, threshold, ratio, knee parameters. It should try to fit the width and adjust the knobs visual accordingly. The knobs should be movable like we do with the `useSliderWidget`, click and drag up/down increases/decreases the amount. The changes should be reflected in the code immediately, it should rewrite the `compressor()` call with the parameters in place automatically e.g `compressor(in:$,attack:.0023,release:.03,threshold:-20,ratio:5,knee:5)` and retain 'in' and 'key' parameters where they were placed.

Make it all look good using our theme colors '#ea580c' and '#ff0' and grey for everything else and accordingly colors/gradient for the vu-meter.

Make it look like a decent compressor UI.

Base the compressor off of this code:

```
export class CompressorBlock {
  targetGain: f32 = 1.0
  currentGain: f32 = 1.0

  constructor() {
  }

  // @inline
  process(
    output: Float32Array,
    input: Float32Array,
    threshold: Float32Array,
    ratio: Float32Array,
    attack: Float32Array,
    release: Float32Array,
    knee: Float32Array,
  ): void {
    // Cache parameters (assuming they don't change per-sample)
    const th: f32 = Mathf.max(-80, Mathf.min(unchecked(threshold[0]), 0))
    const r: f32 = Mathf.max(1, Mathf.min(unchecked(ratio[0]), 20))
    const att: f32 = Mathf.max(0.0001, Mathf.min(unchecked(attack[0]), 1))
    const rel: f32 = Mathf.max(0.0001, Mathf.min(unchecked(release[0]), 5))
    const k: f32 = Mathf.max(0, Mathf.min(unchecked(knee[0]), 40))

    // Pre-calculate coefficients
    const attackCoeff: f32 = Mathf.exp(-1 / (att * sampleRate))
    const releaseCoeff: f32 = Mathf.exp(-1 / (rel * sampleRate))
    const kneeStart: f32 = th - k / 2
    const kneeEnd: f32 = th + k / 2
    const ratioFactor: f32 = 1 - 1 / r

    for (let i = 0; i < BLOCK_SIZE; i++) {
      // Analyze input signal level
      const inputLevel: f32 = Mathf.abs(unchecked(input[i]))
      const inputDb: f32 = 20 * Mathf.log10(Mathf.max(inputLevel, 0.0001))

      // Calculate target gain
      let reduction: f32 = 0

      if (k > 0) {
        if (inputDb < kneeStart) {
          reduction = 0
        }
        else if (inputDb > kneeEnd) {
          const overThreshold: f32 = inputDb - th
          reduction = overThreshold * ratioFactor
        }
        else {
          const kneeInput: f32 = inputDb - kneeStart
          const kneeOvershoot: f32 = kneeInput / k
          const overThreshold: f32 = kneeInput - k / 2
          reduction = overThreshold * ratioFactor * kneeOvershoot
        }
      }
      else {
        if (inputDb > th) {
          const overThreshold: f32 = inputDb - th
          reduction = overThreshold * ratioFactor
        }
      }

      this.targetGain = reduction > 0 ? Mathf.max(0.0, Mathf.pow(10, -reduction / 20)) : 1.0

      // Apply gain smoothing
      if (this.currentGain > this.targetGain) {
        this.currentGain = this.targetGain + (this.currentGain - this.targetGain) * attackCoeff
      }
      else {
        this.currentGain = this.targetGain - (this.targetGain - this.currentGain) * releaseCoeff
      }

      this.currentGain = Mathf.max(0.0, Mathf.min(1.0, this.currentGain))

      unchecked(output[i] = unchecked(input[i]) * this.currentGain)
    }
  }
}
```
