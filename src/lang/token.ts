export type TokenKind =
  | "eof"
  | "invalid"
  | "identifier"
  | "number"
  | "string"
  | "pipe_value"
  | "l_paren"
  | "r_paren"
  | "l_brace"
  | "r_brace"
  | "l_bracket"
  | "r_bracket"
  | "comma"
  | "colon"
  | "question"
  | "semicolon"
  | "dot"
  | "ellipsis"
  | "arrow"
  | "pipe"
  | "plus_plus"
  | "minus_minus"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "power"
  | "bang"
  | "tilde"
  | "amp"
  | "bar"
  | "caret"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "eq_eq"
  | "eq_eq_eq"
  | "and_and"
  | "or_or"
  | "shift_l"
  | "shift_r"
  | "shift_ur"
  | "assign"
  | "assign_plus"
  | "assign_minus"
  | "assign_star"
  | "assign_slash"
  | "assign_percent"
  | "assign_power"
  | "kw_true"
  | "kw_false"
  | "kw_null"
  | "kw_undefined"
  | "kw_if"
  | "kw_else"
  | "kw_for"
  | "kw_of"
  | "kw_while"
  | "kw_do"
  | "kw_switch"
  | "kw_case"
  | "kw_default"
  | "kw_break"
  | "kw_continue"
  | "kw_return"
  | "kw_try"
  | "kw_catch"
  | "kw_finally"
  | "kw_throw";

export type Token = {
  kind: TokenKind;
  lexeme: string;
  value?: number | string;
  line: number;
  column: number;
  length: number;
  kernel?: boolean;
};

export type LexError = {
  message: string;
  line: number;
  column: number;
  length: number;
  code: string;
};

export const keywords: Record<string, TokenKind> = {
  true: "kw_true",
  false: "kw_false",
  null: "kw_null",
  undefined: "kw_undefined",
  if: "kw_if",
  else: "kw_else",
  for: "kw_for",
  of: "kw_of",
  while: "kw_while",
  do: "kw_do",
  switch: "kw_switch",
  case: "kw_case",
  default: "kw_default",
  break: "kw_break",
  continue: "kw_continue",
  return: "kw_return",
  try: "kw_try",
  catch: "kw_catch",
  finally: "kw_finally",
  throw: "kw_throw",
};


