import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { deleteReadsOfUser, bulkUpsertReads } from '../db/reads';
import { upsertUser } from '../db/users';
import { getAllUserUniqueBookData, mapBookDataToBookModel } from './book';

export const importUser = async (sql: postgres.Sql<{}>, user: User) => {
	await upsertUser(sql, user);
	const booksData = await getAllUserUniqueBookData(user.id, user.books_read);
	const books = booksData.map(mapBookDataToBookModel);
	await bulkUpsertBooks(sql, books);
	const reads: Read[] = booksData.map((bookData) => ({
		user_id: user.id,
		book_id: bookData.id,
		merged_book_id: bookData.id,
		date: bookData.date,
	}));
	await deleteReadsOfUser(sql, user.id);
	await bulkUpsertReads(sql, reads);
	return {
		user,
		bookCount: books.length,
		readCount: reads.length,
	};
};
