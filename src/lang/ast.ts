export type Loc = {
  line: number
  column: number
  length: number
}

export type Program = {
  kind: 'program'
  body: Stmt[]
  loc: Loc
}

export type Stmt =
  | BlockStmt
  | ExprStmt
  | ForStmt
  | WhileStmt
  | DoWhileStmt
  | SwitchStmt
  | TryStmt
  | ThrowStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | LabelStmt
  | DestructureStmt

export type BlockStmt = {
  kind: 'block'
  body: Stmt[]
  loc: Loc
}

export type ExprStmt = {
  kind: 'expr_stmt'
  expr: Expr
  loc: Loc
}

export type LabelStmt = {
  kind: 'label'
  name: string
  stmt: Stmt
  loc: Loc
}

export type DestructurePattern =
  | { kind: 'obj'; keys: string[]; loc: Loc }
  | { kind: 'arr'; items: string[]; loc: Loc }

export type DestructureStmt = {
  kind: 'destructure'
  pattern: DestructurePattern
  value: Expr
  loc: Loc
}

export type ForHead =
  | {
    kind: 'c_style'
    init?: Expr
    test?: Expr
    update?: Expr
    loc: Loc
  }
  | {
    kind: 'of'
    value: string
    index?: string
    length?: string
    iterable: Expr
    loc: Loc
  }

export type ForStmt = {
  kind: 'for'
  head: ForHead
  body: Stmt
  loc: Loc
}

export type WhileStmt = {
  kind: 'while'
  test: Expr
  body: Stmt
  loc: Loc
}

export type DoWhileStmt = {
  kind: 'do_while'
  body: Stmt
  test: Expr
  loc: Loc
}

export type SwitchCase = {
  kind: 'case'
  test?: Expr
  body: Stmt[]
  loc: Loc
}

export type SwitchStmt = {
  kind: 'switch'
  test: Expr
  cases: SwitchCase[]
  loc: Loc
}

export type TryStmt = {
  kind: 'try'
  body: BlockStmt
  catchName?: string
  catchBody?: BlockStmt
  finallyBody?: BlockStmt
  loc: Loc
}

export type ThrowStmt = {
  kind: 'throw'
  value: Expr
  loc: Loc
}

export type ReturnStmt = {
  kind: 'return'
  value?: Expr
  loc: Loc
}

export type BreakStmt = {
  kind: 'break'
  label?: string
  loc: Loc
}

export type ContinueStmt = {
  kind: 'continue'
  label?: string
  loc: Loc
}

export type Expr =
  | NumberExpr
  | StringExpr
  | BoolExpr
  | NullExpr
  | UndefinedExpr
  | IdentExpr
  | PipeValueExpr
  | ArrayExpr
  | ObjectExpr
  | UnaryExpr
  | BinaryExpr
  | AssignExpr
  | MemberExpr
  | CallExpr
  | IfExpr
  | FuncExpr
  | PostfixExpr

export type NumberExpr = {
  kind: 'number'
  value: number
  raw: string
  loc: Loc
  slider?: { min: number; max: number; widgetLength: number; precision: number; exp?: number }
}
export type StringExpr = { kind: 'string'; value: string; raw: string; loc: Loc }
export type BoolExpr = { kind: 'bool'; value: boolean; loc: Loc }
export type NullExpr = { kind: 'null'; loc: Loc }
export type UndefinedExpr = { kind: 'undefined'; loc: Loc }

export type IdentExpr = { kind: 'ident'; name: string; loc: Loc }
export type PipeValueExpr = { kind: 'pipe_value'; loc: Loc }

export type ArrayExpr = { kind: 'array'; items: Expr[]; loc: Loc }

export type ObjectProp = { key: string; value: Expr; loc: Loc }
export type ObjectExpr = { kind: 'object'; props: ObjectProp[]; loc: Loc }

export type UnaryExpr = { kind: 'unary'; op: '-' | '!' | '~' | '++' | '--'; expr: Expr; loc: Loc }
export type PostfixExpr = { kind: 'postfix'; op: '++' | '--'; expr: Expr; loc: Loc }

export type BinaryOp =
  | '||'
  | '&&'
  | '=='
  | '<'
  | '<='
  | '>'
  | '>='
  | '|'
  | '^'
  | '&'
  | '<<'
  | '>>'
  | '>>>'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**'
  | '|>'

export type BinaryExpr = { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; loc: Loc }

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '**='
export type AssignExpr = { kind: 'assign'; op: AssignOp; target: Expr; value: Expr; loc: Loc }

export type MemberExpr = {
  kind: 'member'
  object: Expr
  prop: string
  computed: false
  loc: Loc
} | {
  kind: 'member'
  object: Expr
  index: Expr
  computed: true
  loc: Loc
}

export type Arg =
  | { kind: 'pos'; value: Expr; loc: Loc }
  | { kind: 'named'; name: string; value: Expr; loc: Loc }
  | { kind: 'shorthand'; name: string; loc: Loc }

export type CallExpr = { kind: 'call'; callee: Expr; args: Arg[]; loc: Loc }

export type IfExpr = {
  kind: 'if'
  test: Expr
  then: Expr | BlockStmt
  else: Expr | BlockStmt
  loc: Loc
  /** Location of the `if` keyword for `if (...) ... else ...` syntax. */
  ifLoc?: Loc
  /** Location of the `else` keyword for `if (...) ... else ...` syntax. */
  elseLoc?: Loc
  /** Location of the `?` token for ternary syntax. */
  questionLoc?: Loc
  /** Location of the `:` token for ternary syntax. */
  colonLoc?: Loc
}

export type Param = { name: string; isRest: boolean; default?: Expr; pattern?: DestructurePattern; loc: Loc }
export type FuncExpr = { kind: 'func'; params: Param[]; body: Expr | BlockStmt; loc: Loc }
