import { Context } from 'hono';
import postgres from 'postgres';
import { mapBookDataToBookModel } from '../app/book';
import { getAllUserBookData } from '../app/user-books';
import { createDbClient } from '../db';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { bulkUpsertReads } from '../db/reads';
import { selectAllUsers, upsertUser } from '../db/users';

export const syncAll = async (c: Context): Promise<void> => {
	const sql = createDbClient(c);
	const users = await selectAllUsers(sql);
	for (const user of users) {
		try {
			await syncUser(sql, user);
		} catch (error) {
			console.error(`Failed to sync user ${user.id}:`, error);
		}
	}
};

export const syncUser = async (sql: postgres.Sql<{}>, user: User): Promise<void> => {
	await upsertUser(sql, user);
	const booksData = await getAllUserBookData(`https://bookmeter.com/users/${user.id}/books/read`);
	const books = booksData.map(mapBookDataToBookModel);
	await bulkUpsertBooks(sql, books);
	const reads: Read[] = booksData.map((bookData) => ({
		user_id: user.id,
		book_id: bookData.id,
		date: bookData.date,
	}));
	await bulkUpsertReads(sql, reads);
};
