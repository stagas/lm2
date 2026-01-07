// @ts-ignore
@external("host", "sampleLen")
export declare function hostSampleLen(sampleIndex: i32): i32

// @ts-ignore
@external("host", "sampleVersion")
export declare function hostSampleVersion(sampleIndex: i32): i32

// @ts-ignore
@external("host", "sampleRead")
export declare function hostSampleRead(sampleIndex: i32, start: i32, length: i32, out$: usize): i32

// @ts-ignore
@external("host", "sampleSet")
export declare function hostSampleSet(sampleIndex: i32, length: i32, in$: usize): void

// @ts-ignore
@external("host", "sampleSlices")
export declare function hostSampleSlices(sampleIndex: i32, threshold: f32, out$: usize, max: i32): i32


