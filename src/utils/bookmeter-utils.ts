export const BASE_URL = 'https://bookmeter.com/';
export const DEFAULT_BOOKS_LIMIT = 20;
export const BOOKS_PER_PAGE = 20;

export const joinBaseUrl = (url: string | undefined) => {
  return url ? `${BASE_URL}${url}`.replace(/(?<!https:|http:)\/\//g, "/") : undefined;
}

export const isAscQuery = (order: string | undefined) => {
  return order === '1';
}