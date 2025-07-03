import postgres from 'postgres';
import { mapBookDataToBookModel } from '../app/book';
import { getAllUserBookData } from '../app/user-books';
import { createDbClientFromEnv } from '../db';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { bulkUpsertReads, deleteReadsOfUser } from '../db/reads';
import { selectAllUsers, upsertUser } from '../db/users';
import { Env } from '../types/env';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../app/user';

export const syncAllUsers = async (env: Env): Promise<void> => {
	const sql = createDbClientFromEnv(env);
	const users = await selectAllUsers(sql);
	for (const user of users) {
		try {
			await syncUser(sql, user.id);
		} catch (error) {
			console.error(`Failed to sync user ${user.id}:`, error);
		}
	}
};

const syncUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	const bookmeterUrl = getBookmeterUrlFromUserId(userId);
	const user = await getUserFromBookmeterUrl(bookmeterUrl);
	await upsertUser(sql, user);
	const booksData = await getAllUserBookData(`https://bookmeter.com/users/${user.id}/books/read`);
	const books = booksData.map(mapBookDataToBookModel);
	await bulkUpsertBooks(sql, books);
	const reads: Read[] = booksData.map((bookData) => ({
		user_id: user.id,
		book_id: bookData.id,
		date: bookData.date,
	}));
	await deleteReadsOfUser(sql, user.id);
	await bulkUpsertReads(sql, reads);
};
