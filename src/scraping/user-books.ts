import { getHTML } from '../infra/html';
import { BOOKS_PER_PAGE, DEFAULT_LIMITS, isBoolQueryOn } from '../utils/bookmeter-utils';
import { applyNaNVL, isWithinLimits, parseNatNum } from '../utils/number-utils';
import { getOffsetsPerPage, getPageInfo, PageInfo } from '../utils/paging-utils';
import { BookData, BooksDetails, getBooks, getBooksDetails } from './book';

type PerPage = number | undefined;
export const parsePerPage = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), DEFAULT_LIMITS.BOOKS_LIMIT) as PerPage;

type ReqPage = number | undefined;
export const parseReqPage = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), 1) as ReqPage;

type IsAsc = boolean | undefined;
export const parseIsAsc = (query: string | undefined) => isBoolQueryOn(query) as IsAsc;

type JsonUserBooksParams = {
	perPage: PerPage;
	reqPage: ReqPage;
	isAsc: IsAsc;
};

export const getAllUserUniqueBookData = async (
	url: string,
	totalCount: number,
	retries: number = 1
): Promise<BookData[]> => {
	const res = await getJsonUserBooks(
		url,
		{
			perPage: 99999,
			reqPage: 1,
			isAsc: false,
		},
		totalCount,
		retries
	);
	const ids = new Set<number>();
	const uniqueBooks = [];
	for (const book of res.books) {
		if (ids.has(book.id)) continue;
		ids.add(book.id);
		uniqueBooks.push(book);
	}
	return uniqueBooks;
};

type JsonUserBooksResponse = BooksDetails & {
	totalCount: number;
	pageInfo: PageInfo;
	message?: string;
};

export const getJsonUserBooks = async (
	url: string,
	params: JsonUserBooksParams,
	totalCount: number,
	retries: number = 1
): Promise<JsonUserBooksResponse> => {
	let { perPage } = params;
	const { reqPage, isAsc } = params;
	const pageInfo = getPageInfo(reqPage, perPage, totalCount);

	if (retries <= 0) {
		throw new Error('Too many retries');
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
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	const booksDetails = getBooksDetails(listBooks, isAsc, {
		offsetArrayStart,
		offsetArrayEnd,
		offsetBookNo,
	});

	console.log('Expected:', expectedCount, 'Actual:', booksDetails.books.length);
	if (booksDetails.books.length === expectedCount)
		return {
			...booksDetails,
			totalCount,
			pageInfo,
		};

	return getJsonUserBooks(url, params, retries - 1);
};
