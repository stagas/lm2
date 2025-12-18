# DSL Specification

## Overview

This DSL is designed for audio/music applications.

* **Syntax style**: C-style, most similar to JavaScript, with reduced ceremony inspired by CoffeeScript.
* **Statements**: Semicolons are optional. They are generally omitted but may be required to disambiguate adjacent expressions.
* **Whitespace**: Insignificant. Line breaks do not affect semantics. Lines may continue freely.
* **Comments**:

  * Single-line: `// comment`
  * Multi-line: `/* comment */`
* **Execution model**: Imperative, expression-based, and Turing-complete.
* **Control flow**: Full support for `for`, `while`, `do/while`, `if / else if / else`, `switch`, labels, `break`, `continue`, `return`, `try / catch / finally`, and `throw`.

---

## Pipe Operator

The pipe operator `|>` is a core feature.

* The left-hand side expression is evaluated first.
* Its result is bound to the special variable `$` for use in the right-hand side.
* `$` is read-only and immutable.
* `$` is scoped only to the right-hand side expression.
* Nested pipes create new `$` bindings that shadow outer ones.
* The right-hand side may be **any expression**, not just a function call.

Evaluation order:

```
a |> b($) |> c($)
```

is equivalent to:

```
c(b(a))
```

Example with nested pipes:

```
saw(hz:440)
  |> lp($, cut:500, q:0.75)
  |> out($)
```

```
a |> b($, c |> d($))
// The % in b($) refers to a
// The % in d($) refers to c
```

---

## Types and Values

All values are runtime values tagged with their type.

### Primitive Types

* **Number**

  * All numbers are floating-point.
  * Supports `+Infinity` and `-Infinity`.
  * `NaN` behaves like JavaScript.
  * Helper functions such as `isNaN()` and `isFinite()` are provided.
  * When used with bitwise operators, values are cast to 32-bit integers.

* **String**

  * Enclosed in single (`'`) or double (`"`) quotes.
  * May span multiple lines without escaping newlines.

* **Boolean**

  * `true`, `false`.

* **Null**

  * `null`.

* **Undefined**

  * `undefined`.

### Truthiness

The following values are falsey:

* `0`
* `""`
* `false`
* `null`
* `undefined`

All other values are truthy.

---

## Objects

* Objects are enclosed in `{}`.
* Objects are purely key–value maps (no prototype or inheritance model).
* Keys are identifiers or strings.
* Values may be of any type.

Example:

```
obj = {
  x: 1,
  y: 2,
  z: 3
}
```

Access and mutation:

```
obj.x        // 1
obj['y']     // 2
key = 'z'
obj[key]     // 3

obj.x = 10   // allowed
```

---

## Arrays

* Arrays are enclosed in `[]`.
* Arrays are first-class runtime values.
* Elements may be of any type.

Example:

```
arr = [1, 2, 3]
arr[0] = 10      // allowed
arr.push(4)      // allowed
```

* Direct assignment to `.length` is **silently ignored**.
* Length may only change via array methods such as `.push`, `.pop`, etc.

---

## Variables and Assignment

* Variables are dynamically typed.
* All variables are mutable (except `%`, which is read-only).
* Assignment uses `=`.
* **Assignments are expressions** and evaluate to the assigned value.

```
x = y = 3
foo(x = 2)
```

### Destructuring

Destructuring assignment is supported.

```
{x, y} = obj
[a, b] = arr
```

---

## Scope Rules

* Scope is **lexical**.
* There is no hoisting.
* Blocks introduce scope (`if`, `for`, function bodies, etc.).

### Assignment Resolution Rules

When assigning to a variable:

1. The runtime searches outward through enclosing scopes.
2. If a variable with that name exists, it is assigned.
3. If it does not exist in any outer scope, the variable is created in the **current block scope**.

Example:

```
if (true) {
  x = 1
}
// x does not exist here
```

```
x = 0
if (true) {
  x = 1
}
// x == 1
```

### Shadowing

* Regular variables do **not** shadow outer variables.
* Assignments always target the nearest existing binding if one exists.
* **Exception**: The pipe variable `%` is special and **does** shadow outer `%` bindings in nested pipes.

---

## Operators

### Arithmetic

```
+  -  *  /  %  **
```

### Comparison

```
==  <  <=  >  >=
```

* There is only `==`.
* Equality follows JavaScript-style **loose equality** semantics (type coercion applies).
* Objects and arrays compare by reference.

### Logical

```
&&  ||  !
```

* `&&` and `||` short-circuit.

### Bitwise

```
&  |  ^  ~  <<  >>  >>>
```

### Assignment

```
=  +=  -=  *=  /=  %=  **=
```

### Unary

```
-  !
```

Operator precedence follows standard JavaScript rules.

---

## Functions

### Definition

Functions are first-class values.

```
f = (x, y) -> {
  x + y
}
```

* Functions introduce a new lexical scope.
* The last expression is the implicit return value.
* `return` may be used to exit early.

Single-parameter shorthand:

```
double = x -> x * 2
```

Single-expression functions may omit braces.

---

## Function Parameters

Functions support:

* Positional parameters
* Named parameters
* Shorthand named parameters
* Default values
* Rest (variadic) parameters

### Defining Parameters

Function parameters are defined by their names in parentheses:

```
f = (x, y, z) -> x + y + z
```

### Named Parameters in Calls

When **calling** a function, you may pass arguments:

* **Positionally**: `f(1, 2, 3)`
* **By name**: `f(x:1, y:2, z:3)`
* **Mixed**: `f(1, y:2, z:3)`

### Shorthand Named Parameters

When calling a function, if a variable name matches the parameter name, you can use shorthand syntax:

```
hz = 440
cut = 200
q = 1

// These are equivalent:
saw(hz:hz) |> lp($, cut:cut, q:q)
saw(hz) |> lp($, cut, q)
```

The shorthand `lp($, cut, q)` is equivalent to `lp($, cut:cut, q:q)`.

### Default Values

```
f = (x = 1, y = 2) -> x + y
```

* If an argument is missing, the default is used.
* If no default exists, the parameter is `undefined`.

### Rest Parameters

```
f = (x, ...rest) -> rest
```

### Arity Rules

* Passing too many arguments: extras are ignored unless captured by a rest parameter.
* Passing too few arguments: missing parameters are `undefined` or use defaults.
* Callbacks may accept fewer parameters than provided without issue.

---

## Control Flow

### `if / else if / else`

`if` is an expression.

```
value = if (x < 1) y else z
```

---

### Loops

#### `for`

```
for (i = 0; i < 10; i++) {
  ...
}
```

```
for (value of values) {
  ...
}
```

```
for (value, index, length of values) {
  ...
}
```

* `i`, `value`, `index`, and `length` exist only within the loop scope.
* Loops are **not expressions** and do not return values.

Single-expression form:

```
for (v of values) doSomething(v)
```

#### `while` / `do while`

```
while (condition) {
  ...
}

do {
  ...
} while (condition)
```

---

### `switch`

```
switch (expression) {
  case value1: {
    ...
    break
  }
  case value2: {
    ...
    continue
  }
  default:
    ...
}
```

* `switch` does not return a value.
* `break` exits the switch.
* `continue` within a switch **without an enclosing loop** behaves like `break` (exits the switch).
* `continue` within a switch **with an enclosing loop** applies to the nearest loop.

---

### Labels

```
outer:
for (v of values) {
  inner:
  for (x of otherValues) {
    if (a) continue outer
    if (b) break
    if (c) break outer
  }
}
```

---

### `return`

```
f = () -> {
  if (x) return y
  z
}
```

---

## Error Handling

### Error Objects

Both syntax errors and runtime errors are represented as objects with the following properties:

* `message` - String describing the error
* `line` - Line number where the error occurred
* `column` - Column number where the error occurred
* `length` - Length of the problematic token
* `code` - The code that caused the error

### Throwing

```
throw value
```

* Any value may be thrown.

### Try / Catch / Finally

```
try {
  ...
} catch (error) {
  ...
} finally {
  ...
}
```

* `try`, `catch`, and `finally` do **not** produce values.

### Unhandled Errors

* Unhandled errors unwind the call stack.
* Program execution resumes afterward as if the error were caught and ignored.

---
