import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { selectMetadata } from '../db/metadata';

const app = new Hono();

app.get('/', async (c) => {
	const sql = createDbClientFromContext(c);
	const metadata = await selectMetadata(sql);
	return c.json(metadata);
});

export default app;
