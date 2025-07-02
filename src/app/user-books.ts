import { getHTML } from '../infra/html';
import { BOOKS_PER_PAGE, DEFAULT_LIMITS, isBoolQueryOn } from '../utils/bookmeter-utils';
import { applyNaNVL, isWithinLimits, parseNatNum } from '../utils/number-utils';
import { getOffsetsPerPage, getPageInfo } from '../utils/paging-utils';
import { extractRegex } from '../utils/string-utils';
import { getBooks, getBooksDetails } from './book';

type PerPage = Branded<number, 'PerPage'>;
export const parsePerPage = (query: string | undefined) => applyNaNVL(parseNatNum(query), DEFAULT_LIMITS.BOOKS_LIMIT) as PerPage;

type ReqPage = Branded<number, 'ReqPage'>;
export const parseReqPage = (query: string | undefined) => applyNaNVL(parseNatNum(query), 1) as ReqPage;

type IsAsc = Branded<boolean, 'IsAsc'>;
export const parseIsAsc = (query: string | undefined) => isBoolQueryOn(query) as IsAsc;

type JsonUserBooksParams = {
	perPage: PerPage;
	reqPage: ReqPage;
	isAsc: IsAsc;
};

export const getJsonUserBooks = async (url: string, params: JsonUserBooksParams) => {
	let { perPage } = params;
	const { reqPage, isAsc } = params;

	const totalCount = getBooksTotal(await getHTML(url));
	const pageInfo = getPageInfo(reqPage, perPage, totalCount);

	const { offsetStart, offsetEnd } = getOffsetsPerPage(reqPage, perPage, totalCount, isAsc);
	const firstPageFetch = ((offsetStart / BOOKS_PER_PAGE) | 0) + 1;
	const lastPageFetch = offsetEnd % BOOKS_PER_PAGE == 0 ? offsetEnd / BOOKS_PER_PAGE : ((offsetEnd / BOOKS_PER_PAGE) | 0) + 1;
	const offsetArrayStart = offsetStart - (firstPageFetch - 1) * BOOKS_PER_PAGE;
	const offsetArrayEnd = offsetEnd - (firstPageFetch - 1) * BOOKS_PER_PAGE;
	const offsetBookNo = totalCount - offsetStart;

	let listBooks: Array<string> = [];
	if (isWithinLimits(reqPage, 0, pageInfo.lastPage)) {
		await Promise.all(
			[...Array(1 + lastPageFetch - firstPageFetch)].map((_, i) => getHTML(url.concat(`?page=${i + firstPageFetch}`))),
		).then((pages) => pages.map((page) => (listBooks = [...listBooks, ...getBooks(page)])));
	}

	return {
		...getBooksDetails(listBooks, isAsc, { offsetArrayStart, offsetArrayEnd, offsetBookNo }),
		totalCount,
		pageInfo,
	};
};

const getBooksTotal = (html: string): number => {
	const totalCount = parseNatNum(extractRegex(html, /<div class="bm-pagination-notice">全(\d*?)件/g)[0]);
	return applyNaNVL(totalCount, 0);
};
