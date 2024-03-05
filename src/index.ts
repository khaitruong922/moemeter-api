import { Hono } from "hono";
import { prettyJSON } from 'hono/pretty-json'
import { createErrorMessage } from "./error";
import userBooks from "./route/user-books";

const app = new Hono();
app.use('*', prettyJSON());

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

app.route('/', userBooks);

app.notFound((c) => {
	return c.json(createErrorMessage('Not Found'), 404);
});

app.onError((e, c) => {
	console.log(`${e}`);
	return c.json(createErrorMessage('Internal Server Error'), 500);
});

app.fire();