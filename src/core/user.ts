import { withDbFromEnv } from '../db';
import { fetchAllUserReadsV2 } from '../bookmeter-api/book';
import { fetchAllUserReviews } from '../bookmeter-api/review';
import { selectBlacklistedBookIds } from '../db/blacklisted_books';
import { bulkUpsertBooks } from '../db/books';
import { Read, Review, User } from '../db/models';
import { bulkInsertReads, deleteReadsOfUser } from '../db/reads';
import { deleteReviewsOfUser, upsertReviews } from '../db/reviews';
import { upsertUser } from '../db/users';
import { AppEnv } from '../types/app_env';
import { BookmeterApiService } from '../types/bookmeter_api_service';
import { getUniqueBooks, mapReadDataToBookModel } from './book';

// Reads/writes are done on fresh, short-lived connections rather than one held for the
// whole call, since fetchAllUserReadsV2/fetchAllUserReviews can take a long time (paginated
// scraping) and Supabase's pooler closes connections left idle across that wait.
export const fullImportUser = async (
	env: AppEnv,
	bookmeterApiService: BookmeterApiService,
	user: User
) => {
	const blacklistedBookIds = await withDbFromEnv(env, (sql) => selectBlacklistedBookIds(sql));

	const {
		reads: userReads,
		books_read,
		pages_read,
	} = await fetchAllUserReadsV2(
		bookmeterApiService,
		user.id,
		user.bookcase,
		user.original_books_read,
		blacklistedBookIds
	);

	const shouldUpsertReviews = user.reviews_count !== null && (user.reviews_count ?? 0) > 0;
	const reviews: Review[] = shouldUpsertReviews ? await fetchAllUserReviews(user.id) : [];
	delete user.reviews_count;

	// user.books_read is still the raw scrape here (shelf book_count for bookcase users) -
	// keep it as the baseline for the next sync's skip check, before it gets overwritten below.
	user.bookcase_book_count = user.bookcase ? user.books_read : null;

	// Update user's books_read and pages_read based on the final results from the API,
	// which may differ from the initial values if a bookcase is specified or if there are blacklisted books.
	user.books_read = books_read;
	user.pages_read = pages_read;

	const uniqueBookModels = getUniqueBooks(userReads).map(mapReadDataToBookModel);
	const reads: Read[] = userReads.map((reads) => ({
		id: reads.id,
		user_id: user.id,
		book_id: reads.book_id,
		merged_book_id: reads.book_id,
		date: reads.date,
		index: reads.index,
	}));

	await withDbFromEnv(env, async (sql) => {
		await upsertUser(sql, user);
		await bulkUpsertBooks(sql, uniqueBookModels);
		await deleteReadsOfUser(sql, user.id);
		await bulkInsertReads(sql, reads);
		await deleteReviewsOfUser(sql, user.id);
		if (shouldUpsertReviews) {
			await upsertReviews(sql, reviews);
		}
	});

	return {
		user,
		bookCount: books_read,
		pagesCount: pages_read,
	};
};
