export type groups = {
  [key: string]: string;
} | undefined

export const extractRegex = (str: string, regex: RegExp): Array<string> => {
  const matchesIterator = str.matchAll(regex);
  let matchedStrings: Array<string> = [];
  for (const match of matchesIterator) {
    matchedStrings = [...matchedStrings, match[1]];
  }
  return matchedStrings;
}

export const extractRegexGroup = (str: string, regex: RegExp): Array<groups> => {
  const matchesIterator = str.matchAll(regex);
  let matchedStrings: Array<groups> = [];
  for (const match of matchesIterator) {
    matchedStrings = [...matchedStrings, match.groups];
  }
  return matchedStrings;
}

export const escapeNewline = (str: string | undefined): string => {
  return str ? str.replace(/\r|\n/g, '') : '';
}

export const replaceAmpCode = (str: string | undefined): string => {
  return str ? str.replace(/%5Cu0026|\\u0026/g, '&') : '';
}