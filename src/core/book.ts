import { UserReadData } from '../bookmeter-api/book';
import { Book } from '../db/models';

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

export const mapBookDataToBookModel = (book: UserReadData): Book => {
	return {
		id: book.book_id,
		title: book.title || '',
		author: book.author || '',
		author_url: book.author_url || '',
		thumbnail_url: book.thumbnail_url || '',
		page: book.page || 0,
	};
};
