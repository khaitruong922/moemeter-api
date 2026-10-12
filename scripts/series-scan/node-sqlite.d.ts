// The installed @types/node (20.x) predates node:sqlite (Node 22.5+); just what the scan uses
declare module 'node:sqlite' {
	type Value = null | number | bigint | string | Uint8Array;
	export class StatementSync {
		all(...params: Value[]): Record<string, Value>[];
		get(...params: Value[]): Record<string, Value> | undefined;
		run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
	}
	export class DatabaseSync {
		constructor(path: string, options?: { readOnly?: boolean });
		exec(sql: string): void;
		prepare(sql: string): StatementSync;
		close(): void;
	}
}
