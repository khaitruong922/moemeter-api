import { Book } from '../db/models';
import { UserReadData } from '../types/bookmeter_api_service';

export const getUniqueBooks = (userReads: UserReadData[]): UserReadData[] => {
	const ids = new Set<number>();
	const uniqueBooks = [];
	for (const read of userReads) {
		if (ids.has(read.book_id)) {
			continue;
		}
		ids.add(read.book_id);
		uniqueBooks.push(read);
	}
	return uniqueBooks;
};

export const mapReadDataToBookModel = (readData: UserReadData): Book => {
	return {
		id: readData.book_id,
		title: readData.title || '',
		author: readData.author || '',
		author_url: readData.author_url || '',
		thumbnail_url: readData.thumbnail_url || '',
		page: readData.page || 0,
	};
};
