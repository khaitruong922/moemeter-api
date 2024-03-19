import { Hono } from "hono";
import { prettyJSON } from 'hono/pretty-json'
import { cors } from 'hono/cors'
import { createErrorMessage } from "./error";
import userBooks from "./routes/user-books";
import summary from "./routes/summary";

const app = new Hono();
app.use('*', prettyJSON());
app.use('*', cors());

app.get("/", async (c) => {
	return c.json({
    message: 'Bookmeter API is running.',
  })
});

app.route('/', userBooks);
app.route('/', summary);

app.notFound((c) => {
	return c.json(createErrorMessage('Not Found'), 404);
});

app.onError((e, c) => {
	console.log(`${e}`);
	return c.json(createErrorMessage('Internal Server Error'), 500);
});

export default app;