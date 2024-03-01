import { Hono } from "hono";
import { createErrorMessage } from "./error";
import { getHTML, getBooks, getListBooks } from "./app";
const app = new Hono();

const getReadingBooks = async () => {
	return {
		test: 'test',
		testInfo: {
			test1: 'test1',
			test2: 'test2',
		},
	};
}

app.get("/", async (c) => {
	const listResult = await getReadingBooks();
	return c.json(listResult);
});

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
	const html = await getHTML(`https://bookmeter.com/users/${id}/books/read`);
	return c.text(html);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
	const html = await getHTML(`https://bookmeter.com/users/${id}/books/reading`);
	const books = getBooks(html);
	return c.json(getListBooks(books));
});

app.notFound((c) => {
	return c.json(createErrorMessage('Not Found'), 404);
});

app.onError((e, c) => {
	console.log(`${e}`);
	return c.json(createErrorMessage('Internal Server Error'), 500);
});

app.fire();