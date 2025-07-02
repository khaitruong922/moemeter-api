import { getHTML } from '../infra/html';
import { User } from '../types/models';
import { extractRegex, extractRegexGroup } from '../utils/string-utils';

export const getUserFromBookmeterUrl = async (bookmeterUrl: string): Promise<User> => {
	const userId = getUserIdFromBookmeterUrl(bookmeterUrl);
	const html = await getHTML(bookmeterUrl);
	const userSectionHtml = getUserSectionHtml(html);
	return {
		id: userId,
		bookmeter_url: bookmeterUrl,
		name: getUserName(userSectionHtml),
		avatar_url: getUserAvatarUrl(userSectionHtml),
		books_read: getUserBooksRead(userSectionHtml),
		pages_read: getUserPagesRead(userSectionHtml),
	};
};

export const getUserSectionHtml = (html: string): string => {
	return extractRegex(html, /<section class="bm-block-side userdata">(.*?)<\/section><\/section>/g)[0];
};

export const getUserIdFromBookmeterUrl = (bookmeterUrl: string): number => {
	return parseInt(extractRegex(bookmeterUrl, /\/users\/(\d+)$/g)[0], 10);
};

export const getUserName = (html: string): string => {
	return extractRegex(html, /<div class="userdata-side__name">(.*?)<\/div>/g)[0];
};

export const getUserAvatarUrl = (html: string): string => {
	const groups = extractRegexGroup(html, /<figure class="userdata-side__avatar"><img alt="(?<name>.*?)" src="(?<url>.*?)"/g);
	return groups[0]?.url;
};

export const getUserDetailsHtml = (html: string): string => {
	console.log(html);
	return extractRegex(html, /<dl class="bm-details-side">(.*?)<\/dl>/g)[0];
};

export const getUserBooksRead = (html: string): number => {
	return parseInt(extractRegex(html, /<dt class="bm-details-side__title">読んだ本<\/dt><dd class="bm-details-side__item">(.*?)冊/g)[0], 10);
};

export const getUserPagesRead = (html: string): number => {
	return parseInt(
		extractRegex(html, /<dt class="bm-details-side__title">読んだページ<\/dt><dd class="bm-details-side__item">(.*?)ページ/g)[0],
		10,
	);
};
