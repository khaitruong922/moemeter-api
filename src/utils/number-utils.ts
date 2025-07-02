export const applyNaNVL = (num: number, altNum: number) => {
	return isNaN(num) ? altNum : num;
};

export const isWithinLimits = (num: number, lowerLimit?: number, upperlimit?: number): boolean => {
	if (typeof lowerLimit === 'number' && lowerLimit > num) return false;
	if (typeof upperlimit === 'number' && upperlimit < num) return false;
	return true;
};

export const applyLimits = (num: number, lowerLimit?: number, upperlimit?: number) => {
	if (typeof lowerLimit === 'number' && lowerLimit > num) return lowerLimit;
	if (typeof upperlimit === 'number' && upperlimit < num) return upperlimit;
	return num;
};

export const parseNatNum = (str: string | undefined): number => {
	return str ? parseInt(str) : NaN;
};
