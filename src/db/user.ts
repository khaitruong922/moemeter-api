import { Context } from 'hono';
import { createDbClient } from './index';

export const addUser = async (c: Context): Promise<void> => {
	const db = createDbClient(c);
	try {
		await db`INSERT INTO users (id, name) VALUES (${userId}, ${userName}) ON CONFLICT (id) DO NOTHING`;
	} catch (error) {
		console.error('Error adding user:', error);
		throw error;
	} finally {
		await db.end();
	}
};
