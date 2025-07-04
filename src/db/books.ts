import postgres from 'postgres';
import { Book, User } from './models';

type BookWithReaderCount = Book & {
	read_count: string | number;
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
	books: BookWithReaderCount[];
	users: Record<string, ReaderSummary>;
	total_count: number;
};

export const selectBooks = async (
	sql: postgres.Sql<{}>,
	offset: number,
	limit: number
): Promise<GetBooksResponse> => {
	const [{ total }] = await sql<[{ total: number }]>`
    SELECT COUNT(*) as total
    FROM books
  `;

	const bookRows = await sql<BookWithReaderCount[]>`
    SELECT books.*, COUNT(reads.book_id) as read_count
    FROM books
    JOIN reads ON books.id = reads.book_id
    GROUP BY books.id
    ORDER BY read_count DESC, books.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

	const bookIds = bookRows.map((book) => book.id);
	const bookReadUsers = await sql<BookReader[]>`
    SELECT id, name, avatar_url, reads.book_id
    FROM users
    JOIN reads ON users.id = reads.user_id
    WHERE reads.book_id IN ${sql(bookIds)}
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

	const books: BookWithReaderCount[] = bookRows.map((row) => {
		return {
			...row,
			user_ids: bookUserIds[row.id] || [],
			read_count: Number(row.read_count),
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
      thumbnail_url = EXCLUDED.thumbnail_url
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
