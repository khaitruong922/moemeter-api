// The DB client runs with fetch_types: false (src/db/index.ts), so postgres.js cannot serialize a
// JS array as a Postgres array — it sends "1,2" and Postgres rejects it as a malformed array
// literal. Pass the array literal itself and cast it in SQL: ${pgIntArray(ids)}::int[]. As an
// insert value it needs no cast (text -> integer[] is an assignment cast).
export const pgIntArray = (ids: number[]): string =>
	`{${ids.map((id) => Math.trunc(id)).join(',')}}`;
