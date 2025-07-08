import postgres from 'postgres';
import { importUser } from '../core/user';
import { createDbClientFromEnv } from '../db';
import { syncBookMerges, syncReadsMergedBookId } from '../db/book_merges';
import { updateMetadata } from '../db/metadata';
import { SyncStatus, User } from '../db/models';
import { selectAllUsers, selectAllUsersWithRank, updateSyncStatusByUserIds } from '../db/users';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';
import { Env } from '../types/env';
import { deleteUnreadBooks } from '../db/books';

export const syncAllUsers = async (env: Env, syncStatus?: SyncStatus): Promise<void> => {
	const sql = createDbClientFromEnv(env);
	const users = await selectAllUsers(sql, syncStatus);

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
			failedUserIds.push(user.id);
			console.error('Failed:', user.id, error);
		}
	}
	await deleteUnreadBooks(sql);
	await syncBookMerges(sql);
	await syncReadsMergedBookId(sql);

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
	await new Promise((resolve) => setTimeout(resolve, 1000));
	await importUser(sql, newUser);
	return { skipped: false };
};
