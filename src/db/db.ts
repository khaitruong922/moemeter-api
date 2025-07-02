import postgres from 'postgres';
import { Context } from 'hono';
import { env, getRuntimeKey } from 'hono/adapter';

export function createDbClient(c: Context): postgres.Sql<{}> {
	const { DATABASE_URL } = env(c);
	if (!DATABASE_URL) {
		throw new Error('DATABASE_URL is not defined in the environment variables.');
	}
	console.log('Connecting to database with URL:', DATABASE_URL);
	return postgres(DATABASE_URL, {
		prepare: false,
		max: 5,
		ssl: false,
	});
}
