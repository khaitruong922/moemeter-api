import { Hono } from 'hono';
import { createDbClient } from '../db';
import { leaderboardView } from '../views/leaderboard';
import { getAllUsers } from '../db/user';

const app = new Hono();

app.get('/leaderboard', async (c) => {
	const sql = createDbClient(c);
	const users = await getAllUsers(sql);
	await sql.end();
	return c.html(leaderboardView(users));
});

export default app;
