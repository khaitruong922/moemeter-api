import { BookData, fetchAllBooks } from '../bookmeter-api/book';
import { Book } from '../db/models';

export const getAllUserUniqueBookData = async (
	id: number,
	expectedCount: number
): Promise<BookData[]> => {
	const books = await fetchAllBooks(id);
	if (books.length !== expectedCount) {
		throw new Error(`Expected ${expectedCount} books, but got ${books.length}`);
	}
	const ids = new Set<number>();
	const uniqueBooks = [];
	for (const book of books) {
		if (ids.has(book.id)) continue;
		ids.add(book.id);
		uniqueBooks.push(book);
	}
	return uniqueBooks;
};

export const mapBookDataToBookModel = (book: BookData): Book => {
	return {
		id: book.id,
		title: book.title || '',
		author: book.author || '',
		author_url: book.author_url || '',
		thumbnail_url: book.thumbnail_url || '',
		page: book.page || 0,
	};
};
