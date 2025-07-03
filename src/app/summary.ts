import { getHTML } from '../infra/html';
import { DEFAULT_LIMITS, isBoolQueryOn, joinBaseUrl } from '../utils/bookmeter-utils';
import { applyNaNVL, isWithinLimits, parseNatNum } from '../utils/number-utils';
import { getOffsetsPerPage, getPageInfo } from '../utils/paging-utils';
import { extractRegex, extractRegexGroup, groups } from '../utils/string-utils';
import { getBooks, getBooksDetails, getBookThumbnailUrl, type OffsetBookParams } from './book';

type PerPageMonthly = Branded<number, 'PerPageMonthly'>;
export const parsePerPageMonthly = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), DEFAULT_LIMITS.SUMMARY_MONTHLY_LIMIT) as PerPageMonthly;

type PerPageYearly = Branded<number, 'PerPageYearly'>;
export const parsePerPageYearly = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), DEFAULT_LIMITS.SUMMARY_YEARLY_LIMIT) as PerPageYearly;

type ReqPage = Branded<number, 'ReqPage'>;
export const parseReqPage = (query: string | undefined) =>
	applyNaNVL(parseNatNum(query), 1) as ReqPage;

type IsAsc = Branded<boolean, 'IsAsc'>;
export const parseIsAsc = (query: string | undefined) => isBoolQueryOn(query) as IsAsc;

type IsShort = Branded<boolean, 'IsShort'>;
export const parseIsShort = (query: string | undefined) => isBoolQueryOn(query) as IsShort;

type JsonSummaryMonthlyParams = {
	perPage: PerPageMonthly;
	reqPage: ReqPage;
	isAsc: IsAsc;
};

export const getJsonSummaryMonthly = async (url: string, params: JsonSummaryMonthlyParams) => {
	let { perPage } = params;
	const { reqPage, isAsc } = params;

	const html = await getHTML(url);
	const summaryMonthlyDetails = getSummaryMonthlyDetails(html);
	const totalCount = applyNaNVL(parseNatNum(summaryMonthlyDetails?.totalCount), 0);
	const pageInfo = getPageInfo(reqPage, perPage, totalCount);

	const { offsetStart, offsetEnd } = getOffsetsPerPage(reqPage, perPage, totalCount, isAsc);
	const offsetArrayStart = offsetStart;
	const offsetArrayEnd = offsetEnd;
	const offsetBookNo = totalCount - offsetStart;

	let listBooks: Array<string>;
	if (isWithinLimits(reqPage, 0, pageInfo.lastPage)) {
		listBooks = getBooks(html);
	} else {
		listBooks = [];
	}

	return {
		...getBooksDetails(listBooks, isAsc, { offsetArrayStart, offsetArrayEnd, offsetBookNo }),
		totalCount,
		totalPages: applyNaNVL(parseNatNum(summaryMonthlyDetails?.totalReadingPages), 0),
		totalReviews: applyNaNVL(parseNatNum(summaryMonthlyDetails?.totalReviews), 0),
		totalNice: applyNaNVL(parseNatNum(summaryMonthlyDetails?.totalNice), 0),
		pageInfo,
	};
};

type JsonSummaryYearlyParams = {
	perPage: PerPageYearly;
	reqPage: ReqPage;
	isAsc: IsAsc;
	isShort?: IsShort;
};

export const getJsonSummaryYearly = async (url: string, params: JsonSummaryYearlyParams) => {
	let { perPage } = params;
	const { reqPage, isAsc, isShort } = params;

	const html = await getHTML(url);

	const summaryYearlybooklists = getSummaryYearlyBooklists(html);
	const summaryYearlyDetails = getSummaryYearlyDetails(html);
	let listBooks: Array<string> = [];
	summaryYearlybooklists.map((booklist) => {
		listBooks = [...listBooks, ...getSummaryYearlyBooks(booklist)];
	});

	const totalCount = applyNaNVL(parseNatNum(summaryYearlyDetails?.totalCount), 0);
	const showTotalCount = isShort ? listBooks.length : totalCount;
	const pageInfo = getPageInfo(reqPage, perPage, showTotalCount);

	const { offsetStart, offsetEnd } = getOffsetsPerPage(reqPage, perPage, showTotalCount, isAsc);
	const offsetArrayStart = offsetStart;
	const offsetArrayEnd = offsetEnd;
	let offsetBookNo = showTotalCount - offsetStart;

	return {
		...getSummaryYearlyBooksDetails(listBooks, isAsc, {
			offsetArrayStart,
			offsetArrayEnd,
			offsetBookNo,
		}),
		showTotalCount,
		totalCount,
		totalPages: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalReadingPages), 0),
		totalReviews: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalReviews), 0),
		totalNice: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalNice), 0),
		countPerMonth: Number(summaryYearlyDetails?.countPerMonth) ?? 0,
		pagesPerMonth: Number(summaryYearlyDetails?.pagesPerMonth) ?? 0,
		pageInfo,
	};
};

const getSummaryMonthlyDetails = (html: string): groups => {
	return extractRegexGroup(
		html,
		/<dt>読んだ本<\/dt><dd><span class="list__data">(?<totalCount>.*?)<\/span><span class="list__unit">冊<\/span><\/dd><\/dl><dl class="stats__list"><dt>読んだページ<\/dt><dd><span class="list__data">(?<totalReadingPages>.*?)<\/span><span class="list__unit">ページ<\/span><\/dd><\/dl><dl class="stats__list"><dt>感想・レビュー<\/dt><dd><span class="list__data">(?<totalReviews>.*?)<\/span><span class="list__unit">件<\/span><\/dd><\/dl><dl class="stats__list"><dt>ナイス<\/dt><dd><span class="list__data">(?<totalNice>.*?)<\/span>/g
	)[0];
};

const getSummaryYearlyBooklists = (html: string): string[] => {
	return extractRegex(html, /class="monthly__title">(.*?)<h2/g);
};

const getSummaryYearlyBooks = (html: string): string[] => {
	return extractRegex(html, /<li class="list__item">(.*?)<\/a><\/li>/g);
};

const getSummaryYearlyDetails = (html: string): groups => {
	return extractRegexGroup(
		html,
		/<dt class="list__title">読んだ本<\/dt><dd class="list__item"><span class="item__number">(?<totalCount>.*?)<\/span><span class="item__unit">冊<\/span><\/dd><dt class="list__title">読んだページ<\/dt><dd class="list__item"><span class="item__number">(?<totalReadingPages>.*?)<\/span><span class="item__unit">ページ<\/span><\/dd><dt class="list__title">感想・レビュー<\/dt><dd class="list__item"><span class="item__number">(?<totalReviews>.*?)<\/span><span class="item__unit">件<\/span><\/dd><dt class="list__title">ナイス<\/dt><dd class="list__item"><span class="item__number">(?<totalNice>.*?)<\/span><span class="item__unit">ナイス<\/span><\/dd><dt class="list__title">月間平均冊数<\/dt><dd class="list__item"><span class="item__number">(?<countPerMonth>.*?)<\/span><span class="item__unit">冊<\/span><\/dd><dt class="list__title">月間平均ページ数<\/dt><dd class="list__item"><span class="item__number">(?<pagesPerMonth>.*?)<\/span>/g
	)[0];
};

const getSummaryYearlyBooksDetails = (
	listBooks: string[],
	isAsc: IsAsc,
	params: OffsetBookParams
) => {
	const { offsetArrayStart, offsetArrayEnd, offsetBookNo } = params;
	const targetBooks = listBooks.slice(offsetArrayStart, offsetArrayEnd);
	if (isAsc) targetBooks.reverse();
	return {
		books: targetBooks.map((book, i) => {
			return {
				no: isAsc ? offsetBookNo - (targetBooks.length - i - 1) : offsetBookNo - i,
				title: getSummaryYearlyBookTitle(book),
				url: joinBaseUrl(getSummaryYearlyBookUrl(book)),
				author: '',
				authorUrl: '',
				thumbnailUrl: getBookThumbnailUrl(book),
				date: '',
			};
		}),
		count: targetBooks.length,
	};
};

const getSummaryYearlyBookUrl = (htmlBook: string): string => {
	return extractRegex(htmlBook, /<a href="(.*?)">/g)[0];
};

const getSummaryYearlyBookTitle = (htmlBook: string): string => {
	return extractRegex(htmlBook, /<div class="item__title">(.*?)<\/div>/g)[0];
};
