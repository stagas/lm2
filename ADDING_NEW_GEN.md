### Adding a new `@as/assembly/gen/*` node (end-to-end checklist)

This project exposes audio generators (“gens”) through a small chain:

- `as/assembly/gen/<name>.ts`: DSP node (`Gen`) implementation (stateful, runs `process(out$, length)`).
- `as/assembly/dsp/builtins/<name>.ts`: VM builtin wrapper that reads args from the VM stack, allocates audio buffers, and calls the gen.
- Shared wiring so the TS bytecode encoder and AS VM agree on builtin ids and dispatch.
- `src/engine/ui/function-definitions.ts`: UI/editor docs + “is this call name defined?” list.

#### 1) Add the DSP node

- Create `as/assembly/gen/<name>.ts`
  - Export a `class <Name> extends Gen`
  - Add input pointer fields like `hz$: usize`, etc.
  - Implement:
    - `process(out$: usize, length: i32): void`
    - `reset(): void` (reset state)
    - `copyFrom(other: Gen): void` (copy state for hot-swaps)

#### 2) Add the VM builtin wrapper

- Create `as/assembly/dsp/builtins/<name>.ts`
  - Export `call<Name>(...)` (match the signature style used by `callSlew`, `callAt`, etc.)
  - Read positional + named args (`VmSym.*`) into `(tag, num, aux)` triples
  - Convert args to audio pointers via `audio.toAudioPtr(...)`
  - Allocate output via `audio.allocOut(program)` and call the gen from `program.gensPool.get(Op.<Name>)`

#### 3) Add / extend shared ids (stable)

These ids must be stable across TS+AS. Always **append** new enum entries.

- Update `as/assembly/syms.ts`
  - Add a `VmSym.<Name>` entry for the builtin name
  - Add any `VmSym.<ArgName>` entries used for **named arguments** (example: `Width` for `width:`)

- Update `as/assembly/shared.ts`
  - Add `Op.<Name>` for the gen pool switch (`program.gensPool.get(Op.<Name>)`)

#### 4) Register the gen in the pool

- Update `as/assembly/gens-pool.ts`
  - Import the new gen class
  - Add a `GenPool` field
  - Add it to:
    - `resetIndices()`
    - `reset()`
    - `get(op: Op)` switch
    - `copyFrom(...)`

#### 5) Make the VM treat it as a builtin

- Update `as/assembly/dsp/vm-env.ts`
  - Add a `VmSym.<Name>` case to push `VmTag.Builtin`

- Update `as/assembly/dsp/types.ts`
  - Add `VmBuiltin.<Name> = VmSym.<Name>`

- Update `as/assembly/dsp/vm-builtins.ts`
  - Import `call<Name>` from `./builtins/<name>`
  - Add a dispatch case `if (calleeAux === VmBuiltin.<Name>) { call<Name>(...); return }`

#### 6) Make the TS encoder emit the right symbol ids

- Update `src/engine/bytecode/builtin-syms.ts`
  - Add `<name>: VmSym.<Name>` so the compiler emits the stable builtin id
  - Add any named arg keys too (example: `width: VmSym.Width`)

#### 7) Expose it in the UI / editor

- Update `src/engine/ui/function-definitions.ts`
  - Add a `functionDefinitions.<name>` entry (signature + docs + examples)
  - This also updates the set of “known calls” used for undefined-name errors.


