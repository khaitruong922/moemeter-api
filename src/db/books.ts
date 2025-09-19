import postgres from 'postgres';
import { Book, Review } from './models';
import { selectReviewsByBookIds } from './reviews';

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
	book_id: number;
};

type GetBooksResponse = {
	books: BookWithReaders[];
	users: Record<string, ReaderSummary>;
	total_count: number;
};

export const selectBooksWithUsersAndReviews = async (
	sql: postgres.Sql<{}>,
	offset: number,
	limit: number,
	searchQuery?: string,
	field?: string,
	period?: string
): Promise<GetBooksResponse> => {
	let searchCondition = sql``;
	let dateCondition = sql``;
	let startDate: Date | undefined;
	let endDate: Date | undefined;

	if (searchQuery) {
		if (field === 'title') {
			searchCondition = sql`WHERE (title_cleaned &@ clean_title(${searchQuery}))`;
		} else if (field === 'author') {
			searchCondition = sql`WHERE (replace(author, ' ', '') &@ ${searchQuery})`;
		} else {
			searchCondition = sql`WHERE (title_cleaned &@ clean_title(${searchQuery}) OR replace(author, ' ', '') &@ ${searchQuery})`;
		}
	}

	if (period) {
		const now = new Date();
		if (period === 'this_month') {
			startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
			endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
		} else if (period === 'last_month') {
			startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
			endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
		}

		dateCondition = searchCondition
			? sql` AND (reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate})`
			: sql`WHERE (reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate})`;
	}

	const [{ total }] = await sql<[{ total: number }]>`
    SELECT COUNT(DISTINCT reads.merged_book_id) AS total
    FROM books 
    JOIN reads ON books.id = reads.merged_book_id
    ${searchCondition}
    ${dateCondition}
  `;

	const bookRows = await sql<BookWithReaders[]>`
    SELECT 
      books.*,
      COUNT(DISTINCT reads.user_id) as read_count
    FROM books
    JOIN reads ON books.id = reads.merged_book_id
    ${searchCondition}
    ${dateCondition}
    GROUP BY books.id
    ORDER BY read_count DESC, books.id ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

	const bookIds = bookRows.map((book) => book.id);

	const bookReadUsers = await sql<BookReader[]>`
	WITH book_read_users AS (
		SELECT DISTINCT ON (reads.user_id, reads.merged_book_id)
			users.id, users.name, users.avatar_url, reads.merged_book_id AS book_id, users.books_read, users.pages_read
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

	const bookReviews = await selectReviewsByBookIds(sql, bookIds);
	bookReviews.forEach((review) => {
		if (!bookReviewsMap[review.book_id]) {
			bookReviewsMap[review.book_id] = [];
		}
		bookReviewsMap[review.book_id].push(review);
	});

	const books: BookWithReaders[] = bookRows.map((row) => {
		return {
			...row,
			user_ids: bookUserIds[row.id] || [],
			reviews: bookReviewsMap[row.id] || [],
		};
	});

	return {
		books,
		users,
		total_count: Number(total),
	};
};

export const selectLonelyBooksOfUser = async (
  sql: postgres.Sql<{}>,
  userId: number
): Promise<Book[]> => {
  const rows = await sql<Book[]>`
    SELECT DISTINCT ON (r.merged_book_id) b.*
    FROM reads r
    JOIN books b ON r.merged_book_id = b.id
    WHERE r.user_id = ${userId} AND NOT EXISTS (
      SELECT 1 FROM reads r2 WHERE r2.merged_book_id = r.merged_book_id AND r2.user_id != ${userId}
    )
	ORDER BY r.merged_book_id ASC
  `;
  return rows;
}

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
    )
  `;
};
