import { type groups, extractRegex, extractRegexGroup, urlWrapper, escapeNewline, parseNatNum } from "./util";

export const getJsonBooks = async (url: string, limit: number) => {
  const total = getBooksTotal(await getHTML(url));
  limit = limit > total ? total : limit;
  const lastPage = limit % 20 == 0 ? limit / 20 : (limit / 20 | 0) + 1;
  let listBooks: Array<string>  = [];

  await Promise.all(
    [...Array(lastPage)].map((_, i) =>
      getHTML(url.concat(`?page=${i + 1}`)))
  ).then(pages =>
    pages.map(page =>
      listBooks = [...listBooks, ...getBooks(page)]
    )
  );

  return {
    ...getBooksDetails(listBooks, limit),
    total: total,
  };
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
  return parseNatNum(extractRegex(html, /<div class="bm-pagination-notice">全(\d*?)件/g)[0]);
}

const getBooksDetails = (books: string[], limit: number) => {
  return {
		book: books.slice(0, limit).map(value => {
      const titleInfo = getBookTitleInfo(value);
      const authorInfo = getBookAuthorInfo(value);
        return ({
          title: titleInfo?.title,
          url: urlWrapper(titleInfo?.url),
          author: authorInfo?.author,
          authorUrl: urlWrapper(authorInfo?.url),
          thumb: getBookThumb(value),
          date: getBookDate(value),
        })
      }
    ),
    count: limit,
	};
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

export const getBooksValidatedLimit = (limit: number) => {
  return isNaN(limit) ? 20 : limit;
}