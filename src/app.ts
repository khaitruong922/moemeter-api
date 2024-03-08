import { type groups, extractRegex, extractRegexGroup, escapeNewline } from "./utils/string-utils";
import { BOOKS_PER_PAGE, joinBaseUrl } from "./utils/bookmeter-utils";
import { applyNaNVL, parseNatNum } from "./utils/number-utils";

export const getJsonBooks = async (url: string, limit: number, reqPage: number) => {
  const totalCount = getBooksTotal(await getHTML(url));
  if (limit > totalCount) limit = totalCount;
  const lastPage = totalCount % limit == 0
    ? totalCount / limit
    : (totalCount / limit | 0) + 1;
  const prevPage = reqPage > 1 ? reqPage - 1 : null;
  const nextPage = lastPage > reqPage ? reqPage + 1 : null;

  const offsetStart = (reqPage - 1) * limit;
  const offsetEnd = offsetStart + limit;
  const firstPageFetch = (offsetStart / BOOKS_PER_PAGE | 0) + 1;
  const lastPageFetch = offsetEnd % BOOKS_PER_PAGE == 0
    ? offsetEnd / BOOKS_PER_PAGE
    : (offsetEnd / BOOKS_PER_PAGE | 0) + 1;
  let listBooks: Array<string> = [];
  const offsetArrayStart = offsetStart - (firstPageFetch - 1) * BOOKS_PER_PAGE;
  const offsetArrayEnd = offsetEnd - (firstPageFetch - 1) * BOOKS_PER_PAGE;

  await Promise.all(
    [...Array(1 + lastPageFetch - firstPageFetch)].map((_, i) =>
      getHTML(url.concat(`?page=${i + firstPageFetch}`)))
  ).then(pages =>
    pages.map(page =>
      listBooks = [...listBooks, ...getBooks(page)]
    )
  );

  return {
    ...getBooksDetails(listBooks, offsetArrayStart, offsetArrayEnd),
    totalCount,
    pageInfo: {
      currentPage: reqPage,
      prevPage,
      nextPage,
      lastPage,
    }
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

const getBooksDetails = (listBooks: string[], offsetArrayStart: number, offsetArrayEnd: number) => {
  const targetBooks = listBooks.slice(offsetArrayStart, offsetArrayEnd);
  return {
    books: targetBooks.map(book => {
      const titleInfo = getBookTitleInfo(book);
      const authorInfo = getBookAuthorInfo(book);
      return ({
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