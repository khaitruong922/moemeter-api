import postgres from 'postgres';
import { Book } from './models';

export const updateReadsMergedBookIds = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    UPDATE reads
    SET merged_book_id = book_id
  `;

	await sql`
    UPDATE reads
    SET merged_book_id = fm.base_id
    FROM final_book_merges fm
    WHERE reads.book_id = fm.variant_id;
  `;
};

export const syncBookMerges = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    DELETE FROM book_merges;
  `;

	await sql`
    WITH cleaned_books AS (
      SELECT
        id,
        remove_spaces(author) AS author,
        normalize_title(title) AS title,
        LENGTH(title) - LENGTH(REPLACE(title, '(', '')) AS open_paren_count,
        remove_parentheses(normalize_title(title)) AS title_no_paren
      FROM books
    ),
    base_books AS (
      SELECT DISTINCT ON (author, title)
        id, author, title, open_paren_count, title_no_paren
      FROM cleaned_books
      ORDER BY author, title, id
    ),
    variants AS (
      SELECT
        b_base.id AS base_id,
        b_var.id AS variant_id
      FROM base_books b_base
      JOIN cleaned_books b_var
        ON b_base.author = b_var.author
        AND b_base.id != b_var.id
        AND (
          (
            b_var.title &^ b_base.title
            AND LENGTH(b_var.title) - LENGTH(b_base.title) > 4
            AND b_var.open_paren_count - b_base.open_paren_count = 1
            AND b_var.title_no_paren = b_base.title_no_paren
          )
          OR (
            b_base.title = b_var.title
            AND b_base.id < b_var.id
          )
        )
    )
    INSERT INTO book_merges (variant_id, base_id)
    SELECT
      v.variant_id,
      v.base_id
    FROM variants v
    ON CONFLICT (variant_id) DO NOTHING;
  `;

	await updateReadsMergedBookIds(sql);
};

export const addManualBookMerge = async (
	sql: postgres.Sql<{}>,
	baseId: number,
	variantId: number
): Promise<void> => {
	await sql`
    INSERT INTO manual_book_merges (variant_id, base_id)
    VALUES (${variantId}, ${baseId})
  `;

	await updateReadsMergedBookIds(sql);
};

export const addBookMergeException = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    INSERT INTO book_merge_exceptions (variant_id)
    VALUES (${variantId})
  `;

	await updateReadsMergedBookIds(sql);
};

export const deleteManualBookMerge = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    DELETE FROM manual_book_merges
    WHERE variant_id = ${variantId}
  `;

	await updateReadsMergedBookIds(sql);
};

export const deleteBookMergeException = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    DELETE FROM book_merge_exceptions
    WHERE variant_id = ${variantId}
  `;

	await updateReadsMergedBookIds(sql);
};

type BookMergeItem = Omit<Book, 'page' | 'author_url'>;
type FinalBookMerge = {
	base: BookMergeItem;
	variants: BookMergeItem[];
};
export const getFinalBookMerges = async (sql: postgres.Sql<{}>): Promise<FinalBookMerge[]> => {
	const rows = await sql`
    SELECT
        fm.base_id,
        base_book.title AS base_title,
        base_book.author AS base_author,
        base_book.thumbnail_url AS base_thumbnail,

        fm.variant_id,
        variant_book.title AS variant_title,
        variant_book.author AS variant_author,
        variant_book.thumbnail_url AS variant_thumbnail
    FROM final_book_merges fm
    JOIN books AS base_book
        ON base_book.id = fm.base_id
    JOIN books AS variant_book
        ON variant_book.id = fm.variant_id
    ORDER BY fm.base_id, fm.variant_id;
  `;

	// Group variants by base book
	const mergeMap = new Map<number, FinalBookMerge>();

	for (const row of rows) {
		if (!mergeMap.has(row.base_id)) {
			mergeMap.set(row.base_id, {
				base: {
					id: row.base_id,
					title: row.base_title,
					author: row.base_author,
					thumbnail_url: row.base_thumbnail,
				},
				variants: [],
			});
		}

		mergeMap.get(row.base_id)!.variants.push({
			id: row.variant_id,
			title: row.variant_title,
			author: row.variant_author,
			thumbnail_url: row.variant_thumbnail,
		});
	}

	return Array.from(mergeMap.values());
};
