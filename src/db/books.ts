import postgres from 'postgres';
import { Book } from './models';

type BookWithReadCount = Book & {
	read_count: string | number;
};
export const selectAllBooks = async (sql: postgres.Sql<{}>): Promise<BookWithReadCount[]> => {
	const rows = await sql<BookWithReadCount[]>`
    SELECT 
      books.id,
      books.title,
      books.url,
      books.author,
      books.author_url,
      books.thumbnail_url,
      (
        SELECT COUNT(*) 
        FROM reads 
        WHERE reads.book_id = books.id
      ) AS read_count
    FROM books
    ORDER BY read_count DESC
  `;

	const books = rows;
	return books.map((book) => ({
		...book,
		read_count: Number(book.read_count) || 0,
	}));
};

export const selectBookByIds = async (sql: postgres.Sql<{}>, ids: number[]): Promise<Book[]> => {
	if (ids.length === 0) return [];
	const rows = await sql<Book[]>`
    SELECT id, title, url, author, author_url, thumbnail_url
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
      url = EXCLUDED.url,
      author = EXCLUDED.author,
      author_url = EXCLUDED.author_url,
      thumbnail_url = EXCLUDED.thumbnail_url
  `;
};
