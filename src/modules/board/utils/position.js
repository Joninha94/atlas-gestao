// Fractional indexing — posição entre dois itens sem renumerar todos
// Spec seção 4.4: usar double precision, com gap grande (65536) inicial.

const GAP = 65536;

export function between(prev, next) {
  if (prev == null && next == null) return GAP;
  if (prev == null) return next / 2;
  if (next == null) return prev + GAP;
  return (prev + next) / 2;
}

export function initialPositions(count) {
  return Array.from({ length: count }, (_, i) => (i + 1) * GAP);
}

// Retorna a posição para inserir no início de uma lista
export function atStart(firstPos) {
  return firstPos == null ? GAP : firstPos / 2;
}

// Retorna a posição para inserir no fim de uma lista
export function atEnd(lastPos) {
  return lastPos == null ? GAP : lastPos + GAP;
}
