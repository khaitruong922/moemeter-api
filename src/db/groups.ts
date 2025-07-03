import postgres from 'postgres';
import { Group } from './models';

export const selectAllGroups = async (sql: postgres.Sql<{}>): Promise<Group[]> => {
	const rows = await sql<Group[]>`
    SELECT id, name 
    FROM groups
  `;
	return rows;
};

export const selectGroupByIdAndPassword = async (
	sql: postgres.Sql<{}>,
	id: number,
	password: string
): Promise<Group | null> => {
	const rows = await sql<Group[]>`
    SELECT id, name 
    FROM groups 
    WHERE id = ${id} AND password = ${password}
  `;
	return rows.length > 0 ? rows[0] : null;
};
