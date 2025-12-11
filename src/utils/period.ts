export type Period = 'this_month' | 'last_month' | 'this_year';
export const getDateRangeForPeriod = (period: Period): [Date, Date] => {
	const now = new Date();
	if (period === 'this_month')
		return [
			new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
			new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)),
		];
	if (period === 'last_month')
		return [
			new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)),
			new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0)),
		];

	if (period === 'this_year')
		return [
			new Date(Date.UTC(now.getFullYear(), 0, 1)),
			new Date(Date.UTC(now.getFullYear(), 11, 31)),
		];
	throw new Error('ピリオドが無効です');
};

export const getYearPeriod = (year: number): [Date, Date] => {
	return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31))];
};
