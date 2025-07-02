import { Hono } from 'hono';
import { getAllUsers } from '../app/users';
import { createDbClient } from '../db';
import { leaderboardView } from '../views/leaderboard';

const app = new Hono();

// GET /users - Get all users
app.get('/', async (c) => {
	try {
		const sql = createDbClient(c);
		const users = await getAllUsers(sql);
		await sql.end();

		return c.json({
			users,
			count: users.length,
		});
	} catch (error) {
		console.error('Error fetching users:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

app.get('/leaderboard', async (c) => {
	const sql = createDbClient(c);
	const users = await getAllUsers(sql);
	await sql.end();
	return c.html(leaderboardView(users));
});

export default app;
