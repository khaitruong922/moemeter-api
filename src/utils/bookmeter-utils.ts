export const BASE_URL = 'https://bookmeter.com/';
export const BOOKS_PER_PAGE = 20;

export namespace DEFAULT_LIMITS {
	export const BOOKS_LIMIT = 20;
	export const SUMMARY_MONTHLY_LIMIT = 100;
	export const SUMMARY_YEARLY_LIMIT = 48;
}

export const joinBaseUrl = (url: string | undefined): string => {
	return url ? `${BASE_URL}${url}`.replace(/(?<!https:|http:)\/\//g, '/') : '';
};

export const isBoolQueryOn = (param: string | undefined): boolean => {
	return param === '1';
};
