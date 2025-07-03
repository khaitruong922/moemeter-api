import { Context } from 'hono';
import { env } from 'hono/adapter';
import postgres from 'postgres';
import { Env } from '../types/env';

export const createDbClientFromContext = (c: Context): postgres.Sql<{}> => {
	const { DATABASE_URL } = env(c);
	if (!DATABASE_URL) {
		throw new Error('DATABASE_URL is not defined in the environment variables.');
	}
	console.log('Connecting to database with URL:', DATABASE_URL);
	return createPostgres(DATABASE_URL);
};

export const createDbClientFromEnv = (env: Env): postgres.Sql<{}> => {
	const databaseUrl = env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not defined in the environment variables.');
	}
	console.log('Connecting to database with URL:', databaseUrl);
	return createPostgres(databaseUrl);
};

const createPostgres = (url: string) => {
	return postgres(url, {
		prepare: false,
		max: 5,
		ssl: false,
	});
};
