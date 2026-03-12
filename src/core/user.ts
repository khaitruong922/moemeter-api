import postgres from 'postgres';
import { fetchAllUserReadsV2 } from '../bookmeter-api/book';
import { fetchAllUserReviews } from '../bookmeter-api/review';
import { selectBlacklistedBookIds } from '../db/blacklisted_books';
import { bulkUpsertBooks } from '../db/books';
import { Read, Review, User } from '../db/models';
import { bulkInsertReads, deleteReadsOfUser } from '../db/reads';
import { deleteReviewsOfUser, upsertReviews } from '../db/reviews';
import { upsertUser } from '../db/users';
import { BookmeterApiService } from '../types/bookmeter_api_service';
import { getUniqueBooks, mapReadDataToBookModel } from './book';

export const fullImportUser = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService,
	user: User
) => {
	const blacklistedBookIds = await selectBlacklistedBookIds(sql);

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

	const shouldUpsertReviews = user.reviews_count !== null && user.reviews_count > 0;
	const reviews: Review[] = shouldUpsertReviews ? await fetchAllUserReviews(user.id) : [];
	delete user.reviews_count;

	// Update user's books_read and pages_read based on the final results from the API,
	// which may differ from the initial values if a bookcase is specified or if there are blacklisted books.
	user.books_read = books_read;
	user.pages_read = pages_read;

	const uniqueBookModels = getUniqueBooks(userReads).map(mapReadDataToBookModel);
	await upsertUser(sql, user);
	await bulkUpsertBooks(sql, uniqueBookModels);
	const reads: Read[] = userReads.map((reads) => ({
		id: reads.id,
		user_id: user.id,
		book_id: reads.book_id,
		merged_book_id: reads.book_id,
		date: reads.date,
		index: reads.index,
	}));
	await deleteReadsOfUser(sql, user.id);
	await bulkInsertReads(sql, reads);
	await deleteReviewsOfUser(sql, user.id);
	if (shouldUpsertReviews) {
		await upsertReviews(sql, reviews);
	}
	return {
		user,
		bookCount: books_read,
		pagesCount: pages_read,
	};
};
