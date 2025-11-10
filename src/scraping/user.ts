import { getHTML } from '../infra/html';
import { User } from '../db/models';
import { extractRegex, extractRegexGroup } from '../utils/string-utils';
import { getBookcase } from '../bookmeter-api/bookcase';

export const getBookmeterUrlFromUserId = (userId: number): string => {
	return `https://bookmeter.com/users/${userId}`;
};

export const getUserFromBookmeterUrl = async (
	bookmeterUrl: string,
	bookcase: string | null = null
): Promise<User> => {
	bookmeterUrl = bookmeterUrl.trim();
	const userId = getUserIdFromBookmeterUrl(bookmeterUrl);
	const html = await getHTML(bookmeterUrl);
	const userSectionHtml = getUserSectionHtml(html);
	const originalBooksRead = getUserBooksRead(userSectionHtml);
	let booksRead = originalBooksRead;
	if (bookcase) {
		const userBookcase = await getBookcase(userId, bookcase);
		booksRead = userBookcase.book_count;
	}
	const pagesRead = getUserPagesRead(userSectionHtml);
	return {
		id: userId,
		name: getUserName(userSectionHtml),
		avatar_url: getUserAvatarUrl(userSectionHtml),
		books_read: booksRead,
		pages_read: pagesRead,
		bookcase,
		original_books_read: originalBooksRead,
		original_pages_read: pagesRead,
	};
};

export const getUserSectionHtml = (html: string): string => {
	return extractRegex(
		html,
		/<section class="bm-block-side userdata">(.*?)<\/section><\/section>/g
	)[0];
};

export const getUserIdFromBookmeterUrl = (bookmeterUrl: string): number => {
	return parseInt(extractRegex(bookmeterUrl, /\/users\/(\d+)$/g)[0], 10);
};

export const getUserName = (html: string): string => {
	return extractRegex(html, /<div class="userdata-side__name">(.*?)<\/div>/g)[0];
};

export const getUserAvatarUrl = (html: string): string => {
	const groups = extractRegexGroup(
		html,
		/<figure class="userdata-side__avatar"><img alt="(?<name>.*?)" src="(?<url>.*?)"/g
	);
	return groups[0]?.url;
};

export const getUserDetailsHtml = (html: string): string => {
	return extractRegex(html, /<dl class="bm-details-side">(.*?)<\/dl>/g)[0];
};

export const getUserBooksRead = (html: string): number => {
	return parseInt(
		extractRegex(
			html,
			/<dt class="bm-details-side__title">読んだ本<\/dt><dd class="bm-details-side__item">(.*?)冊/g
		)[0],
		10
	);
};

export const getUserPagesRead = (html: string): number => {
	return parseInt(
		extractRegex(
			html,
			/<dt class="bm-details-side__title">読んだページ<\/dt><dd class="bm-details-side__item">(.*?)ページ/g
		)[0],
		10
	);
};
