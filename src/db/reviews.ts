import postgres from 'postgres';
import { BookReview } from './books';
import { Review } from './models';

export const selectReviewsByBookIds = async (
	sql: postgres.Sql<{}>,
	bookIds: number[]
): Promise<BookReview[]> => {
	if (bookIds.length === 0) return [];

	const rows = await sql<BookReview[]>`
    SELECT
      reviews.id,
      reviews.content,
      reviews.is_spoiler,
      reviews.nice_count,
      reviews.created_at,
      reads.user_id,
      reads.merged_book_id AS book_id,
      users.id AS user_id,
      users.name AS user_name,
      users.avatar_url AS user_avatar_url
    FROM reviews
    JOIN reads ON reads.id = reviews.id
    JOIN users ON users.id = reads.user_id
    WHERE reads.merged_book_id IN ${sql(bookIds)}
    ORDER BY reviews.created_at DESC NULLS LAST
  `;

	return rows;
};

export const upsertReviews = async (sql: postgres.Sql<{}>, reviews: Review[]): Promise<void> => {
	if (reviews.length === 0) return;

	await sql`
    INSERT INTO reviews ${sql(reviews)} 
    ON CONFLICT (id) DO NOTHING
  `;
};

export const deleteReviewsOfUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`
    DELETE FROM reviews
    WHERE id IN (
      SELECT id FROM reads WHERE user_id = ${userId}
    )
  `;
};

export const deleteOrphanReviews = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    DELETE FROM reviews
    WHERE id NOT IN (
      SELECT id FROM reads
    )
  `;
};
