import postgres from 'postgres';
import { getDateRangeForPeriod, Period } from '../utils/period';
import { Book, Review } from './models';
import { selectReviewsByIds } from './reviews';

export type BookReview = Review & {
	book_id: number;
	user_id: number;
	// Rating of the reviewed read (review id = read id); null when unrated
	rating: number | null;
	user_name: string;
	user_avatar_url: string;
};

export type BookRating = {
	user_id: number;
	rating: number;
};

export type BookWithReaders = Book & {
	user_ids: number[];
	reviews: BookReview[];
	// From book_ratings; null when nobody rated the book
	rating_avg: number | null;
	rating_count: number | null;
	// Only with includeRatings: who rated the book, highest rating first
	ratings?: BookRating[];
	date?: Date | null;
};

export type RatedBook = Book & {
	rating: number;
	date: Date | null;
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

export type BookRater = ReaderSummary & BookRating & { book_id: number };

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
	dateOrder?: 'ASC' | 'DESC';
	includeRatings?: boolean;
};

type GetBookOrderAndGroupByResult = {
	orderBy: string;
	groupBy: string;
};

type GetBookOrderAndGroupByParams = {
	userId?: number;
	dateOrder?: 'ASC' | 'DESC';
};

const getBookOrderAndGroupBy = ({
	userId,
	dateOrder,
}: GetBookOrderAndGroupByParams): GetBookOrderAndGroupByResult => {
	if (!dateOrder) {
		return {
			orderBy: 'read_count DESC, books.id ASC',
			groupBy: 'books.id',
		};
	}

	if (userId) {
		return {
			orderBy: dateOrder === 'ASC' ? 'filtered_reads.index DESC' : 'filtered_reads.index ASC',
			groupBy: 'books.id, filtered_reads.id, filtered_reads.index',
		};
	}

	return {
		orderBy: `date ${dateOrder} NULLS LAST, books.id ASC`,
		groupBy: 'books.id, filtered_reads.id',
	};
};

export const selectBooksWithUsersAndReviews = async (
	sql: postgres.Sql<{}>,
	filters: SelectBooksFilters
): Promise<GetBooksResponse> => {
	const { offset, limit, searchQuery, field, period, userId, lonely, dateOrder, includeRatings } =
		filters;

	const includeDate = lonely || userId !== undefined;
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

	// Each query is a round trip to the database, which costs more than the queries themselves, so
	// the ones that don't depend on each other run at the same time: the count beside the page of
	// books, then readers (and their reviews) beside raters.
	const countQuery = sql<[{ total: number; total_reads_count: number }]>`
  WITH filtered_reads AS (
    SELECT reads.*
    FROM reads
    JOIN books ON books.id = reads.merged_book_id
    ${searchCondition}
    ${dateCondition}
    ${userCondition}
    ${lonelyCondition}
  )
  SELECT
    ${
			userId ? sql`COUNT(filtered_reads.id)` : sql`COUNT(DISTINCT filtered_reads.merged_book_id)`
		} AS total,
    COUNT(filtered_reads.id) AS total_reads_count
  FROM filtered_reads
  ${
		startDate && endDate
			? sql`
        WHERE filtered_reads.date IS NOT NULL
        AND filtered_reads.date >= ${startDate}
        AND filtered_reads.date <= ${endDate}
      `
			: sql``
	}
`;

	const { orderBy, groupBy } = getBookOrderAndGroupBy({ userId, dateOrder });

	const [[{ total, total_reads_count }], bookRows] = await Promise.all([
		countQuery,
		sql<BookWithReaders[]>`
  WITH filtered_reads AS (
    SELECT reads.*
    FROM reads
    JOIN books ON books.id = reads.merged_book_id
    ${searchCondition}
    ${dateCondition}
    ${userCondition}
    ${lonelyCondition}
  )

  SELECT
    books.*,
    MAX(book_series.series_id) as series_id,
    MAX(book_series.position)::float8 as series_number,
    MAX(series.name) as series_name,
    COUNT(DISTINCT filtered_reads.user_id) as read_count,
    MAX(book_ratings.rating_avg) as rating_avg,
    MAX(book_ratings.rating_count) as rating_count
    ${includeDate ? sql`, MAX(filtered_reads.date) as date` : sql``}
    ${userId ? sql`, filtered_reads.id as read_id` : sql``}
  FROM filtered_reads
  JOIN books ON books.id = filtered_reads.merged_book_id
  LEFT JOIN book_series ON book_series.book_id = books.id
  LEFT JOIN series ON series.id = book_series.series_id
  LEFT JOIN book_ratings ON book_ratings.book_id = books.id
  GROUP BY ${sql.unsafe(groupBy)}
  ORDER BY ${sql.unsafe(orderBy)}
  LIMIT ${limit}
  OFFSET ${offset}
`,
	]);

	const bookIds = bookRows.map((book) => book.id);

	const readersQuery = sql<BookReader[]>`
	WITH book_read_users AS (
		SELECT users.id, users.name, users.avatar_url, reads.id as read_id, reads.merged_book_id AS book_id, users.books_read, users.pages_read
		FROM users
		JOIN reads ON users.id = reads.user_id
		WHERE reads.merged_book_id IN ${sql(bookIds)}
		${startDate && endDate ? sql`AND reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate}` : sql``}
	)
	SELECT * 
	FROM book_read_users
	ORDER BY books_read DESC, pages_read DESC
  `.then(async (readers) => ({
		readers,
		reviews: await selectReviewsByIds(
			sql,
			readers.map((reader) => reader.read_id)
		),
	}));
	const [{ readers: bookReadUsers, reviews: bookReviews }, bookRaters] = await Promise.all([
		readersQuery,
		includeRatings ? selectBookRaters(sql, bookIds) : Promise.resolve([]),
	]);

	const users: Record<string, ReaderSummary> = {};
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

	bookReviews.forEach((review) => {
		if (!bookReviewsMap[review.book_id]) {
			bookReviewsMap[review.book_id] = [];
		}
		bookReviewsMap[review.book_id].push(review);
	});

	// Ratings ignore the period filter, like the book_ratings average they make up, so a rater
	// can be missing from the period's readers in users.
	const bookRatingsMap: Record<string, BookRating[]> = {};
	if (includeRatings) {
		for (const rater of bookRaters) {
			if (!bookRatingsMap[rater.book_id]) {
				bookRatingsMap[rater.book_id] = [];
			}
			bookRatingsMap[rater.book_id].push({ user_id: rater.id, rating: rater.rating });
			users[rater.id] = {
				id: rater.id,
				name: rater.name,
				avatar_url: rater.avatar_url,
			};
		}
	}

	const books: BookWithReaders[] = bookRows.map((row) => {
		return {
			...row,
			user_ids: [...new Set(bookUserIds[row.id] || [])],
			reviews: bookReviewsMap[row.id] || [],
			...(includeRatings && { ratings: bookRatingsMap[row.id] || [] }),
		};
	});

	return {
		books,
		users,
		total_count: Number(total),
		total_reads_count: Number(total_reads_count),
	};
};

// Who rated the books, for the rating section under each book card. One row per user and book,
// with the user's highest rating across the book's variants and rereads - the same rule
// book_ratings averages over.
export const selectBookRaters = async (
	sql: postgres.Sql<{}>,
	bookIds: number[]
): Promise<BookRater[]> => {
	if (bookIds.length === 0) return [];
	return await sql<BookRater[]>`
    SELECT reads.merged_book_id AS book_id, users.id, users.name, users.avatar_url,
      MAX(reads.rating)::integer AS rating
    FROM reads
    JOIN users ON users.id = reads.user_id
    WHERE reads.merged_book_id IN ${sql(bookIds)}
    AND reads.rating IS NOT NULL
    GROUP BY reads.merged_book_id, users.id
    ORDER BY rating DESC, users.books_read DESC, users.id ASC
  `;
};

export const refreshBookRatings = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    REFRESH MATERIALIZED VIEW book_ratings;
  `;
};

export const selectRatedBooksOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<RatedBook[]> => {
	return await sql<RatedBook[]>`
    SELECT books.id, books.title, books.author, books.author_url, books.thumbnail_url, books.page,
      MAX(reads.rating)::integer AS rating, MAX(reads.date) AS date
    FROM reads
    JOIN books ON books.id = reads.merged_book_id
    WHERE reads.user_id = ${userId}
    AND reads.rating IS NOT NULL
    GROUP BY books.id
    ORDER BY rating DESC, date DESC NULLS LAST, books.id ASC
  `;
};

export const selectBookByIds = async (sql: postgres.Sql<{}>, ids: number[]): Promise<Book[]> => {
	if (ids.length === 0) return [];
	const rows = await sql<Book[]>`
    SELECT id, title, author, author_url, thumbnail_url, page
    FROM books
    WHERE id IN ${sql(ids)}
  `;
	return rows;
};

export const bulkUpsertBooks = async (sql: postgres.Sql<{}>, books: Book[]): Promise<void> => {
	if (books.length === 0) return;
	await sql`
    INSERT INTO books ${sql(books, 'id', 'title', 'author', 'author_url', 'thumbnail_url', 'page')}
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
    ) AND books.id NOT IN (
      SELECT book_id FROM series_books
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
