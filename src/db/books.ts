import postgres from 'postgres';
import { Book } from './models';

type BookWithReaders = Book & {
	user_ids: number[];
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

export const selectBooks = async (
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
			searchCondition = sql`WHERE (replace(title, ' ', '') &@ ${searchQuery})`;
		} else if (field === 'author') {
			searchCondition = sql`WHERE (replace(author, ' ', '') &@ ${searchQuery})`;
		} else {
			searchCondition = sql`WHERE (replace(title, ' ', '') &@ ${searchQuery} OR replace(author, ' ', '') &@ ${searchQuery})`;
		}
	}

	if (period) {
		const now = new Date();
		if (period === 'this_month') {
			startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		} else {
			startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			endDate = new Date(now.getFullYear(), now.getMonth(), 0);
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

	const books: BookWithReaders[] = bookRows.map((row) => {
		return {
			...row,
			user_ids: bookUserIds[row.id] || [],
		};
	});

	return {
		books,
		users,
		total_count: Number(total),
	};
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
    )
  `;
};
