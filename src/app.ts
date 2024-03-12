import { type groups, extractRegex, extractRegexGroup, escapeNewline, replaceAmpCode } from "./utils/string-utils";
import { BOOKS_PER_PAGE, joinBaseUrl } from "./utils/bookmeter-utils";
import { isWithinLimits, applyNaNVL, parseNatNum } from "./utils/number-utils";
import { getOffsetsPerPage, getPageInfo } from "./utils/paging-utils";

type reqParams = {
  perPage: number,
  reqPage: number,
  isAsc: boolean,
  isShort?: boolean,
}

type offsetBookParams = {
  offsetArrayStart: number,
  offsetArrayEnd: number,
  offsetBookNo: number
}

export const getJsonBooks = async (url: string, params: reqParams) => {
  let { perPage } = params;
  const { reqPage, isAsc } = params;
  const totalCount = getBooksTotal(await getHTML(url));
  const pageInfo = getPageInfo(reqPage, perPage, totalCount);

  const { offsetStart, offsetEnd } = getOffsetsPerPage(reqPage, perPage, totalCount, isAsc);
  const firstPageFetch = (offsetStart / BOOKS_PER_PAGE | 0) + 1;
  const lastPageFetch = offsetEnd % BOOKS_PER_PAGE == 0
    ? offsetEnd / BOOKS_PER_PAGE
    : (offsetEnd / BOOKS_PER_PAGE | 0) + 1;
  const offsetArrayStart = offsetStart - (firstPageFetch - 1) * BOOKS_PER_PAGE;
  const offsetArrayEnd = offsetEnd - (firstPageFetch - 1) * BOOKS_PER_PAGE;
  const offsetBookNo = totalCount - offsetStart;

  let listBooks: Array<string> = [];
  if (isWithinLimits(reqPage, 0, pageInfo.lastPage)) {
    await Promise.all(
      [...Array(1 + lastPageFetch - firstPageFetch)].map((_, i) =>
        getHTML(url.concat(`?page=${i + firstPageFetch}`)))
    ).then(pages =>
      pages.map(page =>
        listBooks = [...listBooks, ...getBooks(page)]
      )
    );
  }

  return {
    ...getBooksDetails(listBooks, isAsc, { offsetArrayStart, offsetArrayEnd, offsetBookNo }),
    totalCount,
    pageInfo,
  }
}

export const getJsonSummaryMonthly = async (url: string, params: reqParams) => {
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
  }
}

export const getJsonSummaryYearly = async (url: string, params: reqParams) => {
  let { perPage } = params;
  const { reqPage, isAsc, isShort } = params;
  
  const html = await getHTML(url);
  
  const summaryYearlybooklists = getSummaryYearlyBooklists(html);
  const summaryYearlyDetails = getSummaryYearlyDetails(html);
  let listBooks: Array<string> = [];
  summaryYearlybooklists.map(booklist => {
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
    ...getSummaryYearlyBooksDetails(listBooks, isAsc, { offsetArrayStart, offsetArrayEnd, offsetBookNo }),
    showTotalCount,
    totalCount,
    totalPages: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalReadingPages), 0),
    totalReviews: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalReviews), 0),
    totalNice: applyNaNVL(parseNatNum(summaryYearlyDetails?.totalNice), 0),
    countPerMonth: Number(summaryYearlyDetails?.countPerMonth) ?? 0,
    pagesPerMonth: Number(summaryYearlyDetails?.pagesPerMonth) ?? 0,
    pageInfo,
  }
}

const getHTML = async (url: string): Promise<string> => {
  const escapedUrl = escapeNewline(url);
  let response: Response;
  try {
    response = await fetch(escapedUrl);
  } catch (e) {
    throw new Error(`"${escapedUrl}" is not found: ${e}`);
  }
  switch (response.status) {
    case 404:
      throw new Error(`Not found: "${escapedUrl}"`);
    case 400:
      throw new Error(`Bad Request: "${escapedUrl}"`);
  }
  return response.text();
}

const getBooks = (html: string): string[] => {
  return extractRegex(html, /<li class="group__book">(.*?)<\/div><\/li>/g);
}

const getBooksTotal = (html: string): number => {
  const totalCount = parseNatNum(extractRegex(html, /<div class="bm-pagination-notice">全(\d*?)件/g)[0]);
  return applyNaNVL(totalCount, 0);
}

const getBooksDetails = (listBooks: string[], isAsc: boolean, params: offsetBookParams) => {
  const { offsetArrayStart, offsetArrayEnd, offsetBookNo } = params;
  const targetBooks = listBooks.slice(offsetArrayStart, offsetArrayEnd);
  if (isAsc) targetBooks.reverse();
  return {
    books: targetBooks.map((book, i) => {
      const titleInfo = getBookTitleInfo(book);
      const authorInfo = getBookAuthorInfo(book);
      return ({
        no: isAsc ? offsetBookNo - (targetBooks.length - i - 1) : offsetBookNo - i,
        title: titleInfo?.title,
        url: joinBaseUrl(titleInfo?.url),
        author: authorInfo?.author,
        authorUrl: joinBaseUrl(authorInfo?.url),
        thumb: getBookThumb(book),
        date: getBookDate(book),
      });
    }
    ),
    count: targetBooks.length,
  }
}

const getBookTitleInfo = (htmlBook: string): groups => {
  // img altの場合、タイトルが省略されていない
  // return extractRegexGroup(htmlBook, /<div class="detail__title"><a href="(?<url>.*?)">(?<title>.*?)<\/a><\/div>/g)[0];
  return extractRegexGroup(htmlBook, /<div class="thumbnail__cover"><a href="(?<url>.*?)"><img alt="(?<title>.*?)" class/g)[0];
}

const getBookDate = (htmlBook: string): string => {
  return extractRegex(htmlBook, /<div class="detail__date">(.*?)<\/div>/g)[0];
}

const getBookAuthorInfo = (htmlBook: string): groups => {
  return extractRegexGroup(htmlBook, /<ul class="detail__authors"><li><a href="(?<url>.*?)">(?<author>.*?)<\/a><\/li><\/ul>/g)[0];
}

const getBookThumb = (htmlBook: string): string => {
  return extractRegex(htmlBook, /class="cover__image" src="(.*?)" \/>/g)[0];
}

const getSummaryMonthlyDetails = (html: string): groups => {
  return extractRegexGroup(html, /<dt>読んだ本<\/dt><dd><span class="list__data">(?<totalCount>.*?)<\/span><span class="list__unit">冊<\/span><\/dd><\/dl><dl class="stats__list"><dt>読んだページ<\/dt><dd><span class="list__data">(?<totalReadingPages>.*?)<\/span><span class="list__unit">ページ<\/span><\/dd><\/dl><dl class="stats__list"><dt>感想・レビュー<\/dt><dd><span class="list__data">(?<totalReviews>.*?)<\/span><span class="list__unit">件<\/span><\/dd><\/dl><dl class="stats__list"><dt>ナイス<\/dt><dd><span class="list__data">(?<totalNice>.*?)<\/span>/g)[0];
}

const getSummaryYearlyBooklists = (html: string): string[] => {
  return extractRegex(html, /class="monthly__title">(.*?)<h2/g);
}

const getSummaryYearlyBooks = (html: string): string[] => {
  return extractRegex(html, /<li class="list__item">(.*?)<\/a><\/li>/g);
}

const getSummaryYearlyDetails = (html: string): groups => {
  return extractRegexGroup(html, /<dt class="list__title">読んだ本<\/dt><dd class="list__item"><span class="item__number">(?<totalCount>.*?)<\/span><span class="item__unit">冊<\/span><\/dd><dt class="list__title">読んだページ<\/dt><dd class="list__item"><span class="item__number">(?<totalReadingPages>.*?)<\/span><span class="item__unit">ページ<\/span><\/dd><dt class="list__title">感想・レビュー<\/dt><dd class="list__item"><span class="item__number">(?<totalReviews>.*?)<\/span><span class="item__unit">件<\/span><\/dd><dt class="list__title">ナイス<\/dt><dd class="list__item"><span class="item__number">(?<totalNice>.*?)<\/span><span class="item__unit">ナイス<\/span><\/dd><dt class="list__title">月間平均冊数<\/dt><dd class="list__item"><span class="item__number">(?<countPerMonth>.*?)<\/span><span class="item__unit">冊<\/span><\/dd><dt class="list__title">月間平均ページ数<\/dt><dd class="list__item"><span class="item__number">(?<pagesPerMonth>.*?)<\/span>/g)[0];
}

const getSummaryYearlyBooksDetails = (listBooks: string[], isAsc: boolean, params: offsetBookParams) => {
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
        thumb: getBookThumb(book),
        date: '',
      }
    }
    ),
    count: targetBooks.length,
  }
}

const getSummaryYearlyBookUrl = (htmlBook: string): string => {
  return extractRegex(htmlBook, /<a href="(.*?)">/g)[0];
}

const getSummaryYearlyBookTitle = (htmlBook: string): string => {
  return extractRegex(htmlBook, /<div class="item__title">(.*?)<\/div>/g)[0];
}