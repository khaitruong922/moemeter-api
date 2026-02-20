import postgres from 'postgres';
import { Book, Review } from './models';
import { selectReviewsByIds } from './reviews';
import { getDateRangeForPeriod, Period } from '../utils/period';

export type BookReview = Review & {
	book_id: number;
	user_id: number;
	user_name: string;
	user_avatar_url: string;
};

export type BookWithReaders = Book & {
	user_ids: number[];
	reviews: BookReview[];
};

type ReaderSummary = {
	id: number;
	name: string;
	avatar_url: string;
};

type BookReader = ReaderSummary & {
	read_id: number;
	book_id: number;
	books_read: number;
	pages_read: number;
};

type GetBooksResponse = {
	books: BookWithReaders[];
	users: Record<string, ReaderSummary>;
	total_count: number;
	total_reads_count: number;
};

export type SelectBooksFilters = {
	offset: number;
	limit: number;
	searchQuery?: string;
	field?: string;
	period?: Period;
	userId?: number;
	lonely?: boolean;
};

export const selectBooksWithUsersAndReviews = async (
	sql: postgres.Sql<{}>,
	filters: SelectBooksFilters
): Promise<GetBooksResponse> => {
	const { offset, limit, searchQuery, field, period, userId, lonely } = filters;
	let searchCondition = sql``;
	let dateCondition = sql``;
	let userCondition = sql``;
	let lonelyCondition = sql``;
	let startDate: Date | undefined;
	let endDate: Date | undefined;
	let hasWhereClause = false;

	if (searchQuery) {
		hasWhereClause = true;
		if (field === 'title') {
			searchCondition = sql`WHERE (title_cleaned &@ clean_title(${searchQuery}))`;
		} else if (field === 'author') {
			searchCondition = sql`WHERE (remove_spaces(author) &@ ${searchQuery})`;
		} else {
			searchCondition = sql`WHERE (title_cleaned &@ clean_title(${searchQuery}) OR remove_spaces(author) &@ ${searchQuery})`;
		}
	}

	if (period) {
		[startDate, endDate] = getDateRangeForPeriod(period);
		dateCondition = hasWhereClause
			? sql` AND (reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate})`
			: sql`WHERE (reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate})`;
		hasWhereClause = true;
	}

	if (userId) {
		userCondition = hasWhereClause
			? sql` AND reads.user_id = ${userId}`
			: sql`WHERE reads.user_id = ${userId}`;
	}

	if (lonely) {
		if (userId) {
			// Lonely books of specific user: books read by only that user
			lonelyCondition = sql`
				AND (
					SELECT COUNT(DISTINCT r2.user_id)
					FROM reads r2
					WHERE r2.merged_book_id = books.id
				) = 1
				AND EXISTS (
					SELECT 1 FROM reads r3
					WHERE r3.merged_book_id = books.id
					AND r3.user_id = ${userId}
				)
			`;
		} else {
			// All lonely books: books with exactly 1 unique reader
			lonelyCondition = sql`
				AND (
					SELECT COUNT(DISTINCT r2.user_id)
					FROM reads r2
					WHERE r2.merged_book_id = books.id
				) = 1
			`;
		}
	}

	const [{ total, total_reads_count }] = await sql<[{ total: number; total_reads_count: number }]>`
    WITH filtered_books AS (
      SELECT DISTINCT reads.merged_book_id
      FROM books 
      JOIN reads ON books.id = reads.merged_book_id
      ${searchCondition}
      ${dateCondition}
      ${userCondition}
      ${lonelyCondition}
    )
    SELECT 
      COUNT(DISTINCT filtered_books.merged_book_id) AS total,
      COUNT(all_reads.id) AS total_reads_count
    FROM filtered_books
    LEFT JOIN reads all_reads ON filtered_books.merged_book_id = all_reads.merged_book_id
    ${period ? sql`AND all_reads.date IS NOT NULL AND all_reads.date >= ${startDate} AND all_reads.date <= ${endDate}` : sql``}
  `;

	const bookRows = await sql<BookWithReaders[]>`
    WITH filtered_books AS (
      SELECT DISTINCT books.id
      FROM books
      JOIN reads ON books.id = reads.merged_book_id
      ${searchCondition}
      ${dateCondition}
      ${userCondition}
      ${lonelyCondition}
    )
    SELECT 
      books.*,
      COUNT(DISTINCT all_reads.user_id) as read_count
      ${lonely ? sql`, MAX(all_reads.date) as latest_read_date` : sql``}
    FROM books
    JOIN filtered_books ON books.id = filtered_books.id
    LEFT JOIN reads all_reads ON books.id = all_reads.merged_book_id
    ${period ? sql`AND all_reads.date IS NOT NULL AND all_reads.date >= ${startDate} AND all_reads.date <= ${endDate}` : sql``}
    GROUP BY books.id
    ORDER BY ${lonely ? sql`latest_read_date DESC NULLS LAST` : sql`read_count DESC, books.id ASC`}
    LIMIT ${limit}
    OFFSET ${offset}
  `;

	const bookIds = bookRows.map((book) => book.id);

	const bookReadUsers = await sql<BookReader[]>`
	WITH book_read_users AS (
		SELECT users.id, users.name, users.avatar_url, reads.id as read_id, reads.merged_book_id AS book_id, users.books_read, users.pages_read
		FROM users
		JOIN reads ON users.id = reads.user_id
		WHERE reads.merged_book_id IN ${sql(bookIds)}
		${period ? sql`AND reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate}` : sql``}
	)
	SELECT * 
	FROM book_read_users
	ORDER BY books_read DESC, pages_read DESC
  `;

	const users: Record<string, ReaderSummary> = {};
	const reviewIds = bookReadUsers.map((user) => user.read_id);
	const bookUserIds: Record<string, number[]> = {};
	const bookReviewsMap: Record<string, BookReview[]> = {};

	bookReadUsers.forEach((user) => {
		if (!bookUserIds[user.book_id]) {
			bookUserIds[user.book_id] = [];
		}
		bookUserIds[user.book_id].push(user.id);
		users[user.id] = {
			id: user.id,
			name: user.name,
			avatar_url: user.avatar_url,
		};
	});

	const bookReviews = await selectReviewsByIds(sql, reviewIds);
	bookReviews.forEach((review) => {
		if (!bookReviewsMap[review.book_id]) {
			bookReviewsMap[review.book_id] = [];
		}
		bookReviewsMap[review.book_id].push(review);
	});

	const books: BookWithReaders[] = bookRows.map((row) => {
		return {
			...row,
			user_ids: [...new Set(bookUserIds[row.id] || [])],
			reviews: bookReviewsMap[row.id] || [],
		};
	});

	return {
		books,
		users,
		total_count: Number(total),
		total_reads_count: Number(total_reads_count),
	};
};

export const selectLonelyBooksOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<Book[]> => {
	const rows = await sql<Book[]>`
    SELECT b.*
    FROM books b
    JOIN (
      SELECT r.merged_book_id, MAX(r.date) AS completion_date
      FROM reads r
      WHERE r.user_id = ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM reads r2
          WHERE r2.merged_book_id = r.merged_book_id
            AND r2.user_id != ${userId}
        )
      GROUP BY r.merged_book_id
    ) latest_reads ON latest_reads.merged_book_id = b.id
    ORDER BY latest_reads.completion_date DESC NULLS LAST
  `;
	return rows;
};

export const selectBookByIds = async (sql: postgres.Sql<{}>, ids: number[]): Promise<Book[]> => {
	if (ids.length === 0) return [];
	const rows = await sql<Book[]>`
    SELECT id, title, author, author_url, thumbnail_url
    FROM books
    WHERE id IN ${sql(ids)}
  `;
	return rows;
};

export const bulkUpsertBooks = async (sql: postgres.Sql<{}>, books: Book[]): Promise<void> => {
	if (books.length === 0) return;
	await sql`
    INSERT INTO books ${sql(books)}
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      author_url = EXCLUDED.author_url,
      thumbnail_url = EXCLUDED.thumbnail_url,
	  page = EXCLUDED.page
  `;
};

export const deleteUnreadBooks = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    DELETE FROM books
    WHERE books.id NOT IN (
      SELECT book_id FROM reads
    ) AND books.id NOT IN (
      SELECT merged_book_id FROM reads
    )
  `;
};

type BookWithMergeData = Book & {
	total_count: number;
};
type SelectBooksWithMergeDataResponse = {
	books: Book[];
	total_count: number;
};
export const selectBooksWithMergeData = async (
	sql: postgres.Sql<{}>,
	offset: number,
	limit: number
): Promise<SelectBooksWithMergeDataResponse> => {
	const rows = await sql<BookWithMergeData[]>`
	SELECT b.*, COUNT(*) OVER() AS total_count
	FROM books b
	LEFT JOIN final_book_merges fbm ON b.id = fbm.variant_id
	WHERE fbm.base_id IS NULL
	ORDER BY b.title ASC, b.id ASC
	LIMIT ${limit}
	OFFSET ${offset}
	`;
	return {
		books: rows,
		total_count: rows.length > 0 ? Number(rows[0].total_count) : 0,
	};
};
