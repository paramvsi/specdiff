// X-13: output order must not depend on the machine. String#localeCompare follows the process
// locale (ICU collation: in lt-LT "y" sorts before "j"), so sorts that shape output compare code points.
export const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
