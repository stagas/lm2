# DSP CLI Tools

Command-line tools for working with the DSP engine.

## eval-dsp

Evaluates a DSP program and outputs the compilation results and audio samples.

### Usage

```bash
bun src/cli/eval-dsp.ts "<program>"
bun src/cli/eval-dsp.ts --file <path>
```

### Options

- `--file, -f <path>` - Read program from file
- `--help, -h` - Show help message

### Examples

Simple sine wave:
```bash
bun src/cli/eval-dsp.ts "out(sine(440))"
```

Sine wave with amplitude:
```bash
bun src/cli/eval-dsp.ts "out(sine(440) * 0.5)"
```

Sawtooth wave:
```bash
bun src/cli/eval-dsp.ts "out(saw(220) * 0.3)"
```

From file:
```bash
bun src/cli/eval-dsp.ts --file examples/simple.lm
```

### Output

The tool outputs:

1. **Program Source** - The DSP source code
2. **AST** - Abstract Syntax Tree (truncated to 50 lines)
3. **Bytecode** - VM bytecode instructions (user code only)
4. **VM Ops** - Raw VM operation codes (first 100)
5. **VM Literals** - Non-zero literal values used in the program
6. **Output Samples** - First 32 of 128 audio samples (stereo)
7. **Console Output** - Any console.log/warn output from the program
8. **Summary** - Statistics about the compilation and execution

### How It Works

1. Loads the WASM binary from `as/build/index.wasm`
2. Compiles the DSP source code to bytecode
3. Creates a DSP instance in WASM memory
4. Writes the bytecode ops and literals to WASM
5. Processes one audio chunk (128 samples at 48kHz)
6. Reads back the output samples and displays results

### Notes

- The tool runs exactly one chunk (128 samples) of audio processing
- Sample rate is 48kHz (default)
- BPM is 60 (default, unless specified in the program)
- Programs using `mini()` sequences may output silence in the first chunk if no events are triggered yet
- Console.log and console.warn calls from the WASM code are captured and displayed

