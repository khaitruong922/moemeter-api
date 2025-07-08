import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { deleteReadsOfUser, bulkUpsertReads } from '../db/reads';
import { upsertUser } from '../db/users';
import { getUniqueBooksOfUsers, mapBookDataToBookModel } from './book';

export const importUser = async (sql: postgres.Sql<{}>, user: User) => {
	const { books, books_read, pages_read } = await getUniqueBooksOfUsers(user.id, user.books_read);
	const booksModel = books.map(mapBookDataToBookModel);
	await upsertUser(sql, user);
	await bulkUpsertBooks(sql, booksModel);
	const reads: Read[] = books.map((bookData) => ({
		user_id: user.id,
		book_id: bookData.id,
		merged_book_id: bookData.id,
		date: bookData.date,
	}));
	await deleteReadsOfUser(sql, user.id);
	await bulkUpsertReads(sql, reads);
	return {
		user,
		bookCount: books_read,
		readCount: pages_read,
	};
};
