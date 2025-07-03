export const BASE_URL = 'https://bookmeter.com/';
export const BOOKS_PER_PAGE = 20;

export const DEFAULT_LIMITS = {
	BOOKS_LIMIT: 20,
	USERS_LIMIT: 20,
	SUMMARY_MONTHLY_LIMIT: 100,
	SUMMARY_YEARLY_LIMIT: 48,
} as const;

export const joinBaseUrl = (url: string | undefined): string => {
	return url ? `${BASE_URL}${url}`.replace(/(?<!https:|http:)\/\//g, '/') : '';
};

export const getBookUrl = (bookId: number): string => {
	return joinBaseUrl(`books/${bookId}`);
};

export const isBoolQueryOn = (param: string | undefined): boolean => {
	return param === '1';
};
