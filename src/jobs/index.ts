import postgres from 'postgres';
import { mapBookDataToBookModel } from '../scraping/book';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';
import { getAllUserUniqueBookData } from '../scraping/user-books';
import { createDbClientFromEnv } from '../db';
import { bulkUpsertBooks, deleteUnreadBooks } from '../db/books';
import { updateMetadata } from '../db/metadata';
import { Read, User } from '../db/models';
import { bulkUpsertReads, deleteReadsOfUser } from '../db/reads';
import { selectAllUsers, updateSyncStatusByUserIds, upsertUser } from '../db/users';
import { Env } from '../types/env';
import { importUser } from '../core/user';

export const syncAllUsers = async (env: Env): Promise<void> => {
	const sql = createDbClientFromEnv(env);
	const users = await selectAllUsers(sql);

	const successUserIds: number[] = [];
	const failedUserIds: number[] = [];
	const skipspedUserIds: number[] = [];

	for (const user of users) {
		try {
			const { skipped } = await syncUser(sql, user);
			if (skipped) {
				skipspedUserIds.push(user.id);
				console.log('Skipped:', user.id);
			} else {
				console.log('Success:', user.id);
				successUserIds.push(user.id);
			}
		} catch (error) {
			failedUserIds;
			console.error('Failed:', user.id, error);
		}
	}
	await deleteUnreadBooks(sql);

	await updateMetadata(sql, new Date());
	await updateSyncStatusByUserIds(sql, successUserIds, 'success');
	await updateSyncStatusByUserIds(sql, failedUserIds, 'failed');
	await updateSyncStatusByUserIds(sql, skipspedUserIds, 'skipped');
	console.log(
		`Total: ${users.length}, Success: ${successUserIds.length}, Failed: ${failedUserIds.length}, Skipped: ${skipspedUserIds.length}`
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
		currentUser.pages_read === newUser.pages_read &&
		(currentUser.sync_status === 'success' || currentUser.sync_status === 'skipped')
	) {
		return { skipped: true };
	}
	await importUser(sql, newUser);
};
