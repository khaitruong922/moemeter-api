import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { selectAllGroups } from '../db/groups';

const app = new Hono();

app.get('/', async (c) => {
	const sql = createDbClientFromContext(c);
	const groups = await selectAllGroups(sql);
	return c.json(groups);
});

export default app;
