import { withDbFromEnv } from '../db';
import { fullImportUser } from '../core/user';
import { updateMetadataLastUpdated } from '../db/metadata';
import { User } from '../db/models';
import {
	refreshAll,
	selectAllUsersForSync,
	SelectAllUsersParams,
	updateSyncStatusByUserIds,
	updateUserNameAndAvatarUrl,
} from '../db/users';
import { AppEnv } from '../types/app_env';
import { BookmeterApiService } from '../types/bookmeter_api_service';

export const syncAllUsers = async (
	env: AppEnv,
	bookmeterApiService: BookmeterApiService,
	params: SelectAllUsersParams
): Promise<User[]> => {
	const users = await withDbFromEnv(env, (sql) => selectAllUsersForSync(sql, params));
	const { syncStatus } = params;
	if (users.length === 0) {
		if (syncStatus === 'failed') {
			console.log('失敗したユーザーはいません。スキップします。');
		}
		return [];
	}

	const successUsers: User[] = [];
	const failedUserIds: number[] = [];
	const skippedUserIds: number[] = [];

	for (let i = 0; i < users.length; i++) {
		const user = users[i];
		try {
			const { skipped, user: syncedUser } = await syncUser(env, bookmeterApiService, user);
			if (skipped) {
				skippedUserIds.push(syncedUser.id);
				console.log('スキップ:', syncedUser.id);
			} else {
				console.log('成功:', syncedUser.id);
				successUsers.push(syncedUser);
			}
		} catch (error) {
			failedUserIds.push(user.id);
			console.error('失敗:', user.id, error);
			if (error instanceof Error && error.message.includes('Too many subrequests')) {
				for (let j = i + 1; j < users.length; j++) {
					failedUserIds.push(users[j].id);
				}
				console.error(
					'サブリクエスト上限に達しました。残りのユーザーを失敗としてマークし終了します。'
				);
				break;
			}
		}
	}

	await withDbFromEnv(env, async (sql) => {
		await refreshAll(sql);
		await updateMetadataLastUpdated(sql, new Date());

		await updateSyncStatusByUserIds(
			sql,
			successUsers.map((u) => u.id),
			'success'
		);
		await updateSyncStatusByUserIds(sql, failedUserIds, 'failed');
		await updateSyncStatusByUserIds(sql, skippedUserIds, 'skipped');
	});
	console.log(
		`Total: ${users.length}, Success: ${successUsers.length}, Failed: ${failedUserIds.length}, Skipped: ${skippedUserIds.length}`
	);
	return successUsers;
};

type SyncResult = {
	skipped: boolean;
	user: User;
};

const syncUser = async (
	env: AppEnv,
	bookmeterApiService: BookmeterApiService,
	currentUser: User
): Promise<SyncResult> => {
	const newUser = await bookmeterApiService.fetchUserProfile(currentUser.id, currentUser.bookcase);

	const skip = newUser.bookcase
		? shouldSkipBookcaseUser(currentUser, newUser)
		: shouldSkipUser(currentUser, newUser);

	if (skip) {
		if (shouldUpdateNameAndAvatarUrl(currentUser, newUser)) {
			await withDbFromEnv(env, (sql) =>
				updateUserNameAndAvatarUrl(sql, currentUser.id, newUser.name, newUser.avatar_url)
			);
		}
		return { skipped: true, user: currentUser };
	}
	const { user } = await fullImportUser(env, bookmeterApiService, newUser);
	return { skipped: false, user };
};

const shouldSkipUser = (currentUser: User, newUser: User): boolean => {
	return (
		currentUser.original_books_read === newUser.original_books_read &&
		currentUser.original_pages_read === newUser.original_pages_read
	);
};

// Bookcase users: compare Bookmeter's raw shelf book_count against the value stored from
// the last full sync. Comparing raw-vs-raw (instead of raw vs. our internally filtered/deduped
// count) avoids false mismatches from rereads, blacklisted books, or unread books sitting on
// the shelf - none of which change the shelf's own book_count unless membership actually changes.
const shouldSkipBookcaseUser = (currentUser: User, newUser: User): boolean => {
	const skip =
		shouldSkipUser(currentUser, newUser) && currentUser.bookcase_book_count === newUser.books_read;

	console.log(
		`本棚比較 ユーザーID: ${currentUser.id}, 本棚: ${currentUser.bookcase},`,
		`original_books_read: ${currentUser.original_books_read} -> ${newUser.original_books_read},`,
		`original_pages_read: ${currentUser.original_pages_read} -> ${newUser.original_pages_read},`,
		`bookcase_book_count: ${currentUser.bookcase_book_count} -> ${newUser.books_read},`,
		`スキップ: ${skip}`
	);

	return skip;
};

const shouldUpdateNameAndAvatarUrl = (currentUser: User, newUser: User): boolean => {
	return currentUser.name !== newUser.name || currentUser.avatar_url !== newUser.avatar_url;
};
