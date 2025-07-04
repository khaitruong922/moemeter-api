import postgres from 'postgres';
import { Metadata } from './models';

export const selectMetadata = async (sql: postgres.Sql<{}>): Promise<Metadata> => {
	const row = await sql<Metadata[]>`
    SELECT last_updated
    FROM metadata
    LIMIT 1
  `;
	return { last_updated: row.length > 0 ? row[0].last_updated : null };
};

export const updateMetadata = async (sql: postgres.Sql<{}>, lastUpdated: Date): Promise<void> => {
	await sql`
    UPDATE metadata SET last_updated = ${lastUpdated}
  `;
};
