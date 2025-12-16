export type LangError = {
  message: string;
  line: number;
  column: number;
  length: number;
  code: string;
};

export function lineText(src: string, line: number): string {
  let cur = 1;
  let i = 0;
  let start = 0;
  while (i < src.length && cur < line) {
    if (src[i] === "\n") {
      cur++;
      start = i + 1;
    }
    i++;
  }
  let end = src.indexOf("\n", start);
  if (end === -1) end = src.length;
  return src.slice(start, end);
}


