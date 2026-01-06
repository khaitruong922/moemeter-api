import postgres from 'postgres';
import { fetchAllUserReadsV2 } from '../bookmeter-api/book';
import { fetchAllUserReviews } from '../bookmeter-api/review';
import { bulkUpsertBooks } from '../db/books';
import { Read, Review, User } from '../db/models';
import { bulkInsertReads, deleteReadsOfUser } from '../db/reads';
import { deleteReviewsOfUser, upsertReviews } from '../db/reviews';
import { upsertUser } from '../db/users';
import { BookmeterApiService } from '../types/bookmeter_api_service';
import { getUniqueBooks, mapBookDataToBookModel } from './book';

export const fullImportUser = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService,
	user: User
) => {
	const {
		reads: userReads,
		books_read,
		pages_read,
	} = await fetchAllUserReadsV2(
		bookmeterApiService,
		user.id,
		user.bookcase,
		user.original_books_read
	);
	const shouldUpsertReviews = user.reviews_count !== null && user.reviews_count > 0;
	const reviews: Review[] = shouldUpsertReviews ? await fetchAllUserReviews(user.id) : [];
	delete user.reviews_count;

	if (user.bookcase) {
		user.books_read = books_read;
		user.pages_read = pages_read;
	} else {
		// Set to null if bookcase is not set
		user.original_books_read = null;
		user.original_pages_read = null;
	}

	const uniqueBookModels = getUniqueBooks(userReads).map(mapBookDataToBookModel);
	await upsertUser(sql, user);
	await bulkUpsertBooks(sql, uniqueBookModels);
	const reads: Read[] = userReads.map((reads) => ({
		id: reads.id,
		user_id: user.id,
		book_id: reads.book_id,
		merged_book_id: reads.book_id,
		date: reads.date,
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
