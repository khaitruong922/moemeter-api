import postgres from 'postgres';
import { fullImportUser } from '../core/user';
import { syncBookMerges, syncReadsMergedBookId } from '../db/book_merges';
import { deleteUnreadBooks } from '../db/books';
import { updateMetadataLastUpdated } from '../db/metadata';
import { SyncStatus, User } from '../db/models';
import {
	selectAllUsersForSync,
	SelectAllUsersParams,
	updateSyncStatusByUserIds,
} from '../db/users';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';

export const syncAllUsers = async (
	sql: postgres.Sql<{}>,
	params: SelectAllUsersParams
): Promise<User[]> => {
	const users = await selectAllUsersForSync(sql, params);
	const { syncStatus } = params;
	if (users.length === 0) {
		if (syncStatus === 'failed') {
			console.log('No failed users, skipping.');
		}
		return [];
	}

	const successUsers: User[] = [];
	const failedUserIds: number[] = [];
	const skippedUserIds: number[] = [];

	for (const user of users) {
		try {
			const { skipped, user: syncedUser } = await syncUser(sql, user);
			if (skipped) {
				skippedUserIds.push(syncedUser.id);
				console.log('Skipped:', syncedUser.id);
			} else {
				console.log('Success:', syncedUser.id);
				successUsers.push(syncedUser);
			}
		} catch (error) {
			failedUserIds.push(user.id);
			console.error('Failed:', user.id, error);
		}
	}
	await deleteUnreadBooks(sql);
	await syncBookMerges(sql);
	await syncReadsMergedBookId(sql);

	if (syncStatus !== 'failed') {
		await updateMetadataLastUpdated(sql, new Date());
	}

	await updateSyncStatusByUserIds(
		sql,
		successUsers.map((u) => u.id),
		'success'
	);
	await updateSyncStatusByUserIds(sql, failedUserIds, 'failed');
	await updateSyncStatusByUserIds(sql, skippedUserIds, 'skipped');
	console.log(
		`Total: ${users.length}, Success: ${successUsers.length}, Failed: ${failedUserIds.length}, Skipped: ${skippedUserIds.length}`
	);
	return successUsers;
};

type SyncResult = {
	skipped: boolean;
	user: User;
};

const syncUser = async (sql: postgres.Sql<{}>, currentUser: User): Promise<SyncResult> => {
	const bookmeterUrl = getBookmeterUrlFromUserId(currentUser.id);
	const newUser = await getUserFromBookmeterUrl(bookmeterUrl, currentUser.bookcase);

	if (shouldSkipUser(currentUser, newUser)) {
		return { skipped: true, user: currentUser };
	}
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const { user } = await fullImportUser(sql, newUser);
	return { skipped: false, user };
};

const shouldSkipUser = (currentUser: User, newUser: User): boolean => {
	if (currentUser.bookcase !== newUser.bookcase) return false;
	if (newUser.bookcase) {
		return (
			currentUser.original_books_read === newUser.original_books_read &&
			currentUser.original_pages_read === newUser.original_pages_read
		);
	}

	return (
		currentUser.books_read === newUser.books_read && currentUser.pages_read === newUser.pages_read
	);
};
