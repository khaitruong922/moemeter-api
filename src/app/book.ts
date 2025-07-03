import { Book } from '../db/models';
import { joinBaseUrl, getBookUrl } from '../utils/bookmeter-utils';
import { type groups, extractRegex, extractRegexGroup } from '../utils/string-utils';

export type OffsetBookParams = {
	offsetArrayStart: number;
	offsetArrayEnd: number;
	offsetBookNo: number;
};

export type BookData = {
	no: number;
	title: string;
	author: string;
	authorUrl: string;
	thumbnailUrl: string;
	date: string;
	id: number;
};

export type BooksDetails = {
	books: BookData[];
	count: number;
};

export const mapBookDataToBookModel = (book: BookData): Book => {
	return {
		id: book.id,
		title: book.title || null,
		author: book.author || null,
		author_url: book.authorUrl || null,
		thumbnail_url: book.thumbnailUrl || null,
	};
};

export const getBooksDetails = (
	listBooks: string[],
	isAsc: boolean,
	params: OffsetBookParams
): BooksDetails => {
	const { offsetArrayStart, offsetArrayEnd, offsetBookNo } = params;
	const targetBooks = listBooks.slice(offsetArrayStart, offsetArrayEnd);
	if (isAsc) targetBooks.reverse();
	return {
		books: targetBooks.map((book, i) => {
			const titleInfo = getBookTitleInfo(book);
			const authorInfo = getBookAuthorInfo(book);
			const id = getBookId(book);
			return {
				no: isAsc ? offsetBookNo - (targetBooks.length - i - 1) : offsetBookNo - i,
				title: titleInfo?.title ?? '',
				author: authorInfo?.author ?? '',
				authorUrl: joinBaseUrl(authorInfo?.url),
				thumbnailUrl: getBookThumbnailUrl(book),
				date: getBookDate(book),
				id,
			};
		}),
		count: targetBooks.length,
	};
};

export const getBooks = (html: string): string[] => {
	const books = extractRegex(html, /<li class="group__book">(.*?)<\/div><\/li>/g);
	console.log(`Found ${books.length} books`);
	return books;
};

export const getBookTitleInfo = (htmlBook: string): groups => {
	// img altの場合、タイトルが省略されていない
	// return extractRegexGroup(htmlBook, /<div class="detail__title"><a href="(?<url>.*?)">(?<title>.*?)<\/a><\/div>/g)[0];
	return extractRegexGroup(
		htmlBook,
		/<div class="thumbnail__cover"><a href="(?<url>.*?)"><img alt="(?<title>.*?)" class/g
	)[0];
};

export const getBookDate = (htmlBook: string): string => {
	return extractRegex(htmlBook, /<div class="detail__date">(.*?)<\/div>/g)[0];
};

export const getBookAuthorInfo = (htmlBook: string): groups => {
	return extractRegexGroup(
		htmlBook,
		/<ul class="detail__authors"><li><a href="(?<url>.*?)">(?<author>.*?)<\/a><\/li><\/ul>/g
	)[0];
};

export const getBookThumbnailUrl = (htmlBook: string): string => {
	return extractRegex(htmlBook, /class="cover__image" src="(.*?)" \/>/g)[0];
};

export const getBookId = (htmlBook: string): number => {
	const id = extractRegex(htmlBook, /<a href="\/books\/(.*?)">/g)[0];
	return parseInt(id, 10);
};
