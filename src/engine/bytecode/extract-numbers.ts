import {
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
} from './types.ts'

export function createNumberParamsVisitor(out: NumberWithParamsInfo[]) {
  return {
    visitExpr(expr: any): void {
      if (expr.kind === 'number' && expr.slider) {
        const min = Number(expr.slider.min ?? 0)
        const max = Number(expr.slider.max ?? 0)
        out.push({
          line: expr.loc.line,
          column: expr.loc.column,
          length: expr.loc.length,
          widgetLength: Number(expr.slider.widgetLength ?? expr.loc.length),
          value: Number(expr.value ?? 0),
          min,
          max,
          precision: expr.slider.precision,
          exp: expr.slider.exp,
        })
      }
    },
  }
}

export function createNumberLiteralsVisitor(out: NumberLiteralInfo[]) {
  return {
    visitExpr(expr: any): void {
      if (expr.kind === 'number') {
        out.push({
          line: expr.loc.line,
          column: expr.loc.column,
          length: expr.loc.length,
          value: Number(expr.value ?? 0),
        })
      }
    },
  }
}
