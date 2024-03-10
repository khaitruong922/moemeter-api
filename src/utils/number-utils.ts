export const applyNaNVL = (num: number, altNum: number) => {
  return isNaN(num) ? altNum : num;
}

export const applyLimit = (num: number, lowerLimit?: number, upperlimit?: number) => {
  if (typeof lowerLimit === "number" && lowerLimit > num) return lowerLimit;
  if (typeof upperlimit === "number" && upperlimit < num) return upperlimit;
  return num;
}

export const parseNatNum = (str: string | undefined): number => {
  return str ? parseInt(str) : NaN;
}
