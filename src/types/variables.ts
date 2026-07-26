import postgres from 'postgres';

export type Variables = {
	requestBody: any;
	db: postgres.Sql<{}>;
};
