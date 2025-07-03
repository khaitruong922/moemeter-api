import postgres from 'postgres';

export const upsertUserGroup = async (
	sql: postgres.Sql<{}>,
	userId: number,
	groupId: number
): Promise<void> => {
	await sql`
    INSERT INTO users_groups (user_id, group_id)
    VALUES (${userId}, ${groupId})
    ON CONFLICT (user_id, group_id) DO NOTHING
  `;
};
