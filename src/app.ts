import { type groups, extractRegex, extractRegexGroup, urlWrapper, escapeNewline } from "./util";

export const getHTML = async (url: string): Promise<string> => {
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

export const getBooks = (html: string): string[] => {
  return extractRegex(html, /<li class="group__book">(.*?)<\/div><\/li>/g);
}

export const getListBooks = (books: string[]) => {
  return {
		book: books.map(value => {
      const titleInfo = getBookTitleInfo(value);
      const authorInfo = getBookAuthorInfo(value);
        return ({
          title: titleInfo?.title,
          url: urlWrapper(titleInfo?.url),
          author: authorInfo?.author,
          authorUrl: urlWrapper(authorInfo?.url),
          thumb: getBookThumb(value),
        })
      }
    ),
    count: books.length,
	};
}

const getBookTitleInfo = (html: string): groups => {
  // img altの場合、タイトルが省略されていない
  // return extractRegexGroup(html, /<div class="detail__title"><a href="(?<url>.*?)">(?<title>.*?)<\/a><\/div>/g)[0];
  return extractRegexGroup(html, /<div class="thumbnail__cover"><a href="(?<url>.*?)"><img alt="(?<title>.*?)" class/g)[0];
}

const getBookAuthorInfo = (html: string): groups => {
  return extractRegexGroup(html, /<ul class="detail__authors"><li><a href="(?<url>.*?)">(?<author>.*?)<\/a><\/li><\/ul>/g)[0];
}

const getBookThumb = (html: string): string => {
  return extractRegex(html, /class="cover__image" src="(.*?)" \/>/g)[0];
}