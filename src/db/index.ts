import postgres from 'postgres';
import { AppEnv } from '../types/app_env';

export const createDbClientFromEnv = (env: AppEnv): postgres.Sql<{}> => {
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
