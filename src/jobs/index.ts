import postgres from 'postgres';
import { mapBookDataToBookModel } from '../app/book';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../app/user';
import { getAllUserUniqueBookData } from '../app/user-books';
import { createDbClientFromEnv } from '../db';
import { bulkUpsertBooks, deleteUnreadBooks } from '../db/books';
import { updateMetadata } from '../db/metadata';
import { Read, User } from '../db/models';
import { bulkUpsertReads, deleteReadsOfUser } from '../db/reads';
import { selectAllUsers, upsertUser } from '../db/users';
import { Env } from '../types/env';

export const syncAllUsers = async (env: Env): Promise<void> => {
	const sql = createDbClientFromEnv(env);
	const users = await selectAllUsers(sql);
	let successCount = 0;
	let failedCount = 0;
	let skippedCount = 0;

	for (const user of users) {
		try {
			const { skipped } = await syncUser(sql, user);
			if (skipped) {
				console.log('Skipped:', user.id);
				skippedCount++;
			} else {
				console.log('Success:', user.id);
				successCount++;
			}
		} catch (error) {
			console.log('Failed:', user.id, error);
			failedCount;
		}
	}
	await deleteUnreadBooks(sql);
	await updateMetadata(sql, new Date());
	console.log(
		`Total: ${users.length}, Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`
	);
};

type SyncResult = {
	skipped: boolean;
};

const syncUser = async (sql: postgres.Sql<{}>, currentUser: User): Promise<SyncResult> => {
	const bookmeterUrl = getBookmeterUrlFromUserId(currentUser.id);
	const newUser = await getUserFromBookmeterUrl(bookmeterUrl);

	if (
		currentUser.books_read === newUser.books_read &&
		currentUser.pages_read === newUser.pages_read
	) {
		return { skipped: true };
	}

	await upsertUser(sql, newUser);
	const booksData = await getAllUserUniqueBookData(
		`https://bookmeter.com/users/${newUser.id}/books/read`
	);
	const books = booksData.map(mapBookDataToBookModel);
	await bulkUpsertBooks(sql, books);
	const reads: Read[] = booksData.map((bookData) => ({
		user_id: newUser.id,
		book_id: bookData.id,
	}));
	await deleteReadsOfUser(sql, newUser.id);
	await bulkUpsertReads(sql, reads);
	return { skipped: false };
};
