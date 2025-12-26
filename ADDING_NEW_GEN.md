## Adding a new gen (end-to-end)

### Files you will touch (links)

- **DSP gen implementation**: [`as/assembly/gen/<name>.ts`](as/assembly/gen)
- **VM builtin wrapper**: [`as/assembly/dsp/builtins/<name>.ts`](as/assembly/dsp/builtins)
- **Stable symbol ids (TS+AS shared)**: [`as/assembly/dsp/vm-sym.ts`](as/assembly/dsp/vm-sym.ts)
- **Stable op ids (gen pool dispatch)**: [`as/assembly/shared.ts`](as/assembly/shared.ts)
- **Gen pool registration**: [`as/assembly/gens-pool.ts`](as/assembly/gens-pool.ts)
- **VM “builtin name” globals**: [`as/assembly/dsp/vm-env.ts`](as/assembly/dsp/vm-env.ts)
- **VM builtin id mapping**: [`as/assembly/dsp/types.ts`](as/assembly/dsp/types.ts)
- **VM builtin dispatch**: [`as/assembly/dsp/vm-builtins.ts`](as/assembly/dsp/vm-builtins.ts)
- **TS encoder builtin name → id**: [`src/engine/bytecode/builtin-syms.ts`](src/engine/bytecode/builtin-syms.ts)
- **Editor docs/known calls**: [`src/engine/ui/function-definitions.ts`](src/engine/ui/function-definitions.ts)

### Checklist

- **Implement the gen**
  - Add `as/assembly/gen/<name>.ts` exporting `class <Name> extends Gen`.
  - Add `*: usize` input pointers (example: `hz$: usize`).
  - Implement:
    - `process(out$: usize, length: i32): void`
    - `reset(): void` (only if the gen is stateful)
    - `copyFrom(other: Gen): void` (for hot-swaps; copy internal state only)

- **Add the VM builtin wrapper**
  - Add `as/assembly/dsp/builtins/<name>.ts` exporting `call<Name>(...)`.
  - Parse positional + named args into `(tag, num, aux)`.
  - Convert args with `audio.toAudioPtr(...)`.
  - Allocate output with `audio.allocOut(program)` + `program.getOutBuffer(outIndex)`.
  - Get the gen with `program.gensPool.get(Op.<Name>)` and call `process(...)`.
  - Push result with `stack.push(VmTag.Audio, 0.0, outIndex)`.

- **Append stable ids (do not reorder)**
  - Append `VmSym.<Name>` (and any `VmSym.<ArgKey>` named-arg keys) to `as/assembly/dsp/vm-sym.ts`.
  - Append `Op.<Name>` to `as/assembly/shared.ts`.

- **Register in the gen pool**
  - Import the class + add a `GenPool` field in `as/assembly/gens-pool.ts`.
  - Wire it into `resetIndices()`, `reset()`, `get(op)`, and `copyFrom(...)`.

- **Make the VM treat it as a builtin**
  - In `as/assembly/dsp/vm-env.ts`, add a `VmSym.<Name>` case that pushes `VmTag.Builtin`.
  - In `as/assembly/dsp/types.ts`, add `VmBuiltin.<Name> = VmSym.<Name>`.
  - In `as/assembly/dsp/vm-builtins.ts`, import `call<Name>` and add a dispatch `if (calleeAux === VmBuiltin.<Name>) { ... }`.

- **Make the TS encoder emit the builtin id**
  - Add `<callName>: VmSym.<Name>` to `src/engine/bytecode/builtin-syms.ts`.
  - Add any named-arg keys (e.g. `width: VmSym.Width`) if the call accepts named args.

- **Expose it in the editor**
  - Add/extend the entry in `src/engine/ui/function-definitions.ts` (this also makes the name “defined” for diagnostics).


## Adding a widget for a gen (with history ring buffer)

This is the pattern used by widgets like LP/LFO: the DSP builtin writes a best-effort history ring buffer in WASM memory, and the UI reads it to render a widget with latency-compensated time.

### Files you will touch (links)

- **History layout constants**: [`as/assembly/constants.ts`](as/assembly/constants.ts)
- **Program memory (history buffer storage)**: [`as/assembly/program.ts`](as/assembly/program.ts)
- **Builtin writes history**: [`as/assembly/dsp/builtins/<name>.ts`](as/assembly/dsp/builtins)
- **Expose history pointer to TS via struct**: [`src/engine/dsp/assembly.ts`](src/engine/dsp/assembly.ts)
- **Create a typed view over the history buffer**: [`src/engine/dsp/program.ts`](src/engine/dsp/program.ts)
- **TS-side call-site refs (where to place widgets)**:
  - [`src/engine/bytecode/extract-<name>.ts`](src/engine/bytecode)
  - [`src/engine/bytecode/types.ts`](src/engine/bytecode/types.ts)
  - [`src/engine/bytecode/bytecode.ts`](src/engine/bytecode/bytecode.ts)
- **Thread the refs through state**:
  - [`src/engine/dsp/program.ts`](src/engine/dsp/program.ts) (compile result shape)
  - [`src/engine/stores/dsp.ts`](src/engine/stores/dsp.ts)
  - [`src/engine/types.ts`](src/engine/types.ts)
  - [`src/engine/ui/DspSourceEditor.tsx`](src/engine/ui/DspSourceEditor.tsx)
- **Implement the widget hook**:
  - [`src/engine/ui/use<Thing>Widget.ts`](src/engine/ui)
  - Useful examples: [`src/engine/ui/useLpWidget.ts`](src/engine/ui/useLpWidget.ts)
  - Latency-compensated time helper: [`src/engine/ui/update-predicted-sample-count.ts`](src/engine/ui/update-predicted-sample-count.ts)

### Checklist

- **Define the history ring format**
  - In `as/assembly/constants.ts`, add `*_HISTORY_SIZE`, `*_ENTRY_SIZE`, and offsets like `*_WRITE_POS_OFFSET` / `*_DATA_OFFSET`.

- **Allocate the ring buffer in the WASM `Program`**
  - In `as/assembly/program.ts`, add a `StaticArray<f32>` sized as `DATA_OFFSET + HISTORY_SIZE * ENTRY_SIZE`.

- **Write history from the builtin**
  - In `as/assembly/dsp/builtins/<name>.ts`, after calling the gen, write one entry:
    - `writePos` → slot → base offset
    - store any params needed for UI + a `sampleCountMod` (commonly `& 0xfffff`)
    - increment `writePos` modulo the same mask

- **Expose the pointer to TS**
  - Add the new field to `ProgramStruct` in `src/engine/dsp/assembly.ts`.
  - In `src/engine/dsp/program.ts`, create a typed `Float32Array` view and export a small `{ writePos, raw }` object.

- **Extract call refs for widget anchoring**
  - Add `extract-<name>.ts` + a `*Ref` type that includes `loc`, `aboveLoc`, and any arg locs you want for future widgets/knobs.
  - Wire that extraction into `src/engine/bytecode/bytecode.ts` so `encodeLangToVmOps` returns the refs.

- **Render the widget**
  - Implement `use<Thing>Widget.ts`:
    - On `onBeforeDraw`, read new history entries and update per-index state.
    - In `render`, draw the static curve and a playhead/value marker using predicted sample count.
  - Wire it into `src/engine/ui/DspSourceEditor.tsx` (and thread refs through `src/engine/stores/dsp.ts` / `src/engine/types.ts` as needed).


