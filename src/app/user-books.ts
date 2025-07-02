import { getHTML } from '../infra/html';
import { BOOKS_PER_PAGE, DEFAULT_LIMITS, isBoolQueryOn } from '../utils/bookmeter-utils';
import { applyNaNVL, isWithinLimits, parseNatNum } from '../utils/number-utils';
import { getOffsetsPerPage, getPageInfo } from '../utils/paging-utils';
import { extractRegex } from '../utils/string-utils';
import { getBooks, getBooksDetails } from './book';

type PerPage = Branded<number, 'PerPage'>;
export const parsePerPage = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), DEFAULT_LIMITS.BOOKS_LIMIT) as PerPage;

type ReqPage = Branded<number, 'ReqPage'>;
export const parseReqPage = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), 1) as ReqPage;

type IsAsc = Branded<boolean, 'IsAsc'>;
export const parseIsAsc = (query: string | undefined) => isBoolQueryOn(query) as IsAsc;

type JsonUserBooksParams = {
	perPage: PerPage;
	reqPage: ReqPage;
	isAsc: IsAsc;
};

export const getJsonUserBooks = async (
	url: string,
	params: JsonUserBooksParams,
	retries: number = 2
) => {
	let { perPage } = params;
	const { reqPage, isAsc } = params;
	const totalCount = getBooksTotal(await getHTML(url));
	const pageInfo = getPageInfo(reqPage, perPage, totalCount);

	if (retries <= 0) {
		return {
			books: [],
			count: 0,
			totalCount,
			pageInfo,
			message: 'Too many retries, returning empty result',
		};
	}

	let { offsetStart, offsetEnd } = getOffsetsPerPage(reqPage, perPage, totalCount, isAsc);
	if (offsetStart < 0 || offsetStart >= totalCount) {
		return {
			books: [],
			count: 0,
			totalCount,
			pageInfo,
		};
	}
	offsetEnd = Math.min(offsetEnd, totalCount);

	const firstPageFetch = ((offsetStart / BOOKS_PER_PAGE) | 0) + 1;
	const lastPageFetch =
		offsetEnd % BOOKS_PER_PAGE == 0
			? offsetEnd / BOOKS_PER_PAGE
			: ((offsetEnd / BOOKS_PER_PAGE) | 0) + 1;
	const offsetArrayStart = offsetStart - (firstPageFetch - 1) * BOOKS_PER_PAGE;
	const offsetArrayEnd = offsetEnd - (firstPageFetch - 1) * BOOKS_PER_PAGE;
	const offsetBookNo = totalCount - offsetStart;
	const expectedCount = offsetArrayEnd - offsetArrayStart;

	let listBooks: Array<string> = [];
	if (isWithinLimits(reqPage, 0, pageInfo.lastPage)) {
		for (let i = firstPageFetch; i <= lastPageFetch; i++) {
			const pageHTML = await getHTML(url.concat(`?page=${i}`));
			listBooks = [...listBooks, ...getBooks(pageHTML)];
			if (i < lastPageFetch) await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	const booksDetails = getBooksDetails(listBooks, isAsc, {
		offsetArrayStart,
		offsetArrayEnd,
		offsetBookNo,
	});
	if (booksDetails.books.length === expectedCount)
		return {
			...booksDetails,
			totalCount,
			pageInfo,
		};

	return getJsonUserBooks(url, params, retries - 1);
};

const getBooksTotal = (html: string): number => {
	const totalCount = parseNatNum(
		extractRegex(html, /<div class="bm-pagination-notice">全(\d*?)件/g)[0]
	);
	return applyNaNVL(totalCount, 0);
};
