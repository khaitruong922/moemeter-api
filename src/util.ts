export const escapeNewline = (str: string) => str.replace(/\r|\n/g, "");

export const extractRegex = (str: string, regex: RegExp): Array<string> => {
  const matchesIterator = str.matchAll(regex);
  let matchedStrings: Array<string> = [];
  for (const match of matchesIterator) {
    matchedStrings = [...matchedStrings, match[1]];
  }
  return matchedStrings;
};