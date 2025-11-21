export const applyNaNVL = (num: number, altNum: number) => {
	return isNaN(num) ? altNum : num;
};

export const parseNatNum = (str: string | undefined): number => {
	return str ? parseInt(str) : NaN;
};
