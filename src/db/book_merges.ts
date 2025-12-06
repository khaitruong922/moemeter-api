import postgres from 'postgres';

export const syncBookMerges = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    DELETE FROM book_merges;
  `;

	await sql`
    WITH cleaned_books AS (
      SELECT
        id,
        REPLACE(author, ' ', '') AS author,
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

	await sql`
    UPDATE reads
    SET merged_book_id = book_id
  `;

	await sql`
    WITH all_merges AS (
      SELECT variant_id, base_id FROM book_merges
      UNION ALL
      SELECT variant_id, base_id FROM manual_book_merges
    ),
    filtered_merges AS (
      SELECT * FROM all_merges
      WHERE variant_id NOT IN (SELECT variant_id FROM book_merge_exceptions)
    )
    UPDATE reads
    SET merged_book_id = fm.base_id
    FROM filtered_merges fm
    WHERE reads.book_id = fm.variant_id;
  `;
};
