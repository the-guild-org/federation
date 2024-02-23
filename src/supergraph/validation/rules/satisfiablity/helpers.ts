import type { OperationPath } from './operation-path';

export function occurrences(str: string, subString: string) {
  if (subString.length <= 0) {
    return str.length + 1;
  }

  let n = 0,
    pos = 0,
    step = subString.length;

  while (true) {
    pos = str.indexOf(subString, pos);
    if (pos >= 0) {
      ++n;
      pos += step;
    } else break;
  }
  return n;
}

export function scoreKeyFields(keyFields: string) {
  const fields = occurrences(keyFields, ' ') + 1;
  const innerSelectionSets = occurrences(keyFields, '{') * 3;

  return fields + innerSelectionSets;
}

export function isShortestPathToTail(currentPath: OperationPath, paths: OperationPath[]): boolean {
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];

    if (path.depth() <= currentPath.depth() && path.tail() === currentPath.tail()) {
      return false;
    }
  }

  return true;
}
