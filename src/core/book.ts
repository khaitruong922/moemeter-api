import { BookData, fetchAllBooks, FetchAllBooksResult } from '../bookmeter-api/book';
import { Book } from '../db/models';

export const getUniqueBooksOfUsers = async (
	id: number,
	bookcase: string | null
): Promise<FetchAllBooksResult> => {
	const { books_read, pages_read, books } = await fetchAllBooks(id, bookcase);
	const ids = new Set<number>();
	const uniqueBooks = [];
	for (const book of books) {
		if (ids.has(book.id)) {
			continue;
		}
		ids.add(book.id);
		uniqueBooks.push(book);
	}
	return {
		books: uniqueBooks,
		books_read,
		pages_read,
	};
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
