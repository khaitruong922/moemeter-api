import { Hono } from 'hono';
import { getUserFromBookmeterUrl, getUserIdFromBookmeterUrl } from '../app/user';
import { joinView } from '../views/join';

const app = new Hono();

app.get('/join', (c) => {
	return c.html(joinView());
});

app.post('/api/join', async (c) => {
	try {
		const { bookmeter_url } = await c.req.json();
		console.log(bookmeter_url);
		if (!bookmeter_url || typeof bookmeter_url !== 'string') {
			return c.json({ error: 'bookmeter_url is required' }, 400);
		}
		const user = await getUserFromBookmeterUrl(bookmeter_url.trim());
		return c.json({ user });
	} catch (error) {
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
