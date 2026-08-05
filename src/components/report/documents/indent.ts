/** Tree rows are flat DOM siblings; depth is expressed as left padding. */
export function indentStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${depth * 12 + 4}px` };
}
