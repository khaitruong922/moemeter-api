import postgres from 'postgres';
import { Book } from './models';

type BookWithReadCount = Book & {
	read_count: string | number;
};

export const selectAllBooks = async (
	sql: postgres.Sql<{}>,
	offset: number,
	limit: number
): Promise<{ books: BookWithReadCount[]; totalCount: number }> => {
	const [{ total }] = await sql<[{ total: number }]>`
    SELECT COUNT(*) as total
    FROM books
    JOIN reads ON books.id = reads.book_id
  `;

	const books = await sql<BookWithReadCount[]>`
    SELECT books.*, COUNT(reads.book_id) as read_count
    FROM books
    JOIN reads ON books.id = reads.book_id
    GROUP BY books.id
    ORDER BY read_count DESC, books.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

	return {
		books: books.map((row) => ({
			...row,
			read_count: Number(row.read_count),
		})),
		totalCount: Number(total),
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
