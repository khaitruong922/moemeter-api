import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { deleteReadsOfUser, bulkInsertReads } from '../db/reads';
import { upsertUser } from '../db/users';
import { getUniqueBooks, mapBookDataToBookModel } from './book';
import { fetchAllBooks } from '../bookmeter-api/book';

export const fullImportUser = async (sql: postgres.Sql<{}>, user: User) => {
	const { books, books_read, pages_read } = await fetchAllBooks(user.id, user.bookcase);
	if (user.bookcase) {
		user.books_read = books_read;
		user.pages_read = pages_read;
	} else {
		// Set to null if bookcase is not set
		user.original_books_read = null;
		user.original_pages_read = null;
	}

	const uniqueBookModels = getUniqueBooks(books).map(mapBookDataToBookModel);
	await upsertUser(sql, user);
	await bulkUpsertBooks(sql, uniqueBookModels);
	const reads: Read[] = books.map((bookData) => ({
		user_id: user.id,
		book_id: bookData.id,
		merged_book_id: bookData.id,
		date: bookData.date,
	}));
	await deleteReadsOfUser(sql, user.id);
	await bulkInsertReads(sql, reads);
	return {
		user,
		bookCount: books_read,
		pagesCount: pages_read,
	};
};
