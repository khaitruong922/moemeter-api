import postgres from 'postgres';
import { User } from '../types/models';

export const getAllUsers = async (sql: postgres.Sql<{}>) => {
	const users = await sql<User[]>`
    SELECT 
      id,
      name,
      avatar_url,
      books_read,
      pages_read
    FROM users
    ORDER BY books_read DESC NULLS LAST
  `;

	return users.map((user) => ({
		...user,
		id: Number(user.id),
	}));
};
