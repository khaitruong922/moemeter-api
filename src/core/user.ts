import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Read, User } from '../db/models';
import { deleteReadsOfUser, bulkInsertReads } from '../db/reads';
import { upsertUser } from '../db/users';
import { getUniqueBooks, mapBookDataToBookModel } from './book';
import { fetchAllUserReads } from '../bookmeter-api/book';
import { fetchAllUserReviews } from '../bookmeter-api/review';
import { deleteReviewsOfUser, upsertReviews } from '../db/reviews';

export const fullImportUser = async (sql: postgres.Sql<{}>, user: User) => {
	const {
		reads: userReads,
		books_read,
		pages_read,
	} = await fetchAllUserReads(user.id, user.bookcase);
	const reviews = await fetchAllUserReviews(user.id);

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
	await upsertReviews(sql, reviews);
	return {
		user,
		bookCount: books_read,
		pagesCount: pages_read,
	};
};
