import postgres from 'postgres';
import { AppEnv } from '../types/app_env';

export const createDbClientFromEnv = (env: AppEnv): postgres.Sql<{}> => {
	const databaseUrl = env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('環境変数にDATABASE_URLが定義されていません。');
	}
	console.log('データベースに接続中');
	return createPostgres(databaseUrl, env.DEBUG === 'true');
};

export const withDbFromEnv = async <T>(
	env: AppEnv,
	fn: (sql: postgres.Sql<{}>) => Promise<T>
): Promise<T> => {
	const sql = createDbClientFromEnv(env);
	try {
		return await fn(sql);
	} finally {
		await sql.end();
	}
};

const createPostgres = (url: string, debug: boolean) => {
	return postgres(url, {
		prepare: false,
		max: 20,
		ssl: false,
		fetch_types: false,
		debug: debug ? logQuery : undefined,
	});
};

const logQuery = (
	connection: number,
	query: string,
	parameters: any[],
	paramTypes: any[]
): void => {
	const queryColor = '\x1b[34m';
	const paramsColor = '\x1b[32m';
	const reset = '\x1b[0m';
	console.log(
		`${queryColor}${query}${reset}`,
		parameters ? `${paramsColor}${JSON.stringify(parameters)}${reset}` : ''
	);
};
