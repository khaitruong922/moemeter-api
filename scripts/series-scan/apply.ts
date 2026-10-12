// Apply a reviewed decisions.json (exported from review.html) through the API:
//   approved new series   -> POST /manual_series            (batches of 200)
//   approved additions    -> POST /manual_series/books      (batches of 200)
//   every decision        -> POST /manual_series/scan_decisions, so the next scan skips it
// A batch is all-or-nothing on the server; an entry that fails (say, a position taken since the
// scan) is reported, dropped, and the rest of its batch retried. Failed entries are not recorded
// as decided, so the next scan proposes them again.
//
//   npm run series:apply -- <decisions.json> [--api http://localhost:8787] [--apply]
// Without --apply it only prints what it would do. --decisions-only records the decisions without
// creating anything — for when the writes succeeded but recording failed: approved entries are
// recorded only if the API's ledger shows them applied (series looked up by their books).

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Decision = 'approved' | 'rejected';
type Decisions = {
	generated_at: string;
	new_series: {
		fingerprint: string;
		decision: Decision;
		confidence: number;
		name: string;
		book_ids: number[];
		positions?: number[]; // volume-number positions (3, 4; 7.5); missing -> 1..n
	}[];
	additions: {
		fingerprint: string;
		decision: Decision;
		confidence: number;
		book_id: number;
		series_id: number;
		position: number;
	}[];
};
type ScanDecision = {
	fingerprint: string;
	kind: 'new_series' | 'add_to_series';
	decision: Decision;
	book_ids: number[];
	series_id: number | null;
	confidence: number;
};

const BATCH = 200;

const devVar = (name: string): string => {
	const line = readFileSync('.dev.vars', 'utf8')
		.split('\n')
		.find((l) => l.startsWith(`${name}=`));
	if (!line) throw new Error(`${name} missing from .dev.vars`);
	return line
		.slice(name.length + 1)
		.replace(/^"|"$/g, '')
		.trim();
};

// validateToken only checks the HS256 signature (and exp)
const mintToken = (): string => {
	const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const head = b64({ alg: 'HS256', typ: 'JWT' });
	const body = b64({ sub: 'series-scan', exp: Math.floor(Date.now() / 1000) + 3600 });
	const sig = createHmac('sha256', devVar('JWT_SECRET'))
		.update(`${head}.${body}`)
		.digest('base64url');
	return `${head}.${body}.${sig}`;
};

const chunks = <T>(xs: T[], n: number): T[][] =>
	Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const main = async () => {
	const args = process.argv.slice(2);
	const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--api');
	const api = args.includes('--api') ? args[args.indexOf('--api') + 1] : 'http://localhost:8787';
	const apply = args.includes('--apply');
	const decisionsOnly = args.includes('--decisions-only');
	if (!file) {
		console.error('usage: series:apply <decisions.json> [--api URL] [--apply]');
		process.exit(1);
	}
	const d = JSON.parse(readFileSync(file, 'utf8')) as Decisions;
	const approvedSeries = d.new_series.filter((x) => x.decision === 'approved');
	const approvedAdds = d.additions.filter((x) => x.decision === 'approved');
	const count = (xs: { decision: Decision }[]) =>
		`${xs.filter((x) => x.decision === 'approved').length} approved / ${xs.filter((x) => x.decision === 'rejected').length} rejected`;
	console.log(`scan ${d.generated_at} -> ${api}`);
	console.log(`  new series: ${count(d.new_series)}`);
	console.log(`  additions:  ${count(d.additions)}`);
	if (!apply && !decisionsOnly) {
		console.log('dry run — pass --apply to write');
		return;
	}

	const token = mintToken();
	const post = async (path: string, body: unknown) => {
		const res = await fetch(`${api}${path}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		return { status: res.status, json: (await res.json()) as any };
	};

	// Posts entries in batches; on a failing entry (detail.index) drops it and retries the rest
	const postBatches = async <T>(path: string, entries: T[], label: (e: T) => string) => {
		const ok: { entry: T; result: any }[] = [];
		const failed: { entry: T; error: string }[] = [];
		for (let batch of chunks(entries, BATCH)) {
			while (batch.length > 0) {
				const { status, json } = await post(path, batch);
				if (status === 201) {
					batch.forEach((entry, i) => ok.push({ entry, result: json[i] }));
					break;
				}
				const index = json?.detail?.index;
				if (typeof index !== 'number')
					throw new Error(`${path} ${status}: ${JSON.stringify(json)}`);
				failed.push({ entry: batch[index], error: `${status} ${json.error}` });
				console.log(`  ✗ ${label(batch[index])}: ${json.error}`);
				batch = batch.filter((_, i) => i !== index);
			}
		}
		return { ok, failed };
	};

	const decisions: ScanDecision[] = [];
	let series: {
		ok: { entry: { _fp: string }; result: { series_id: number } }[];
		failed: unknown[];
	};
	let adds: { ok: { entry: { book_id: number; series_id: number } }[]; failed: unknown[] };

	if (decisionsOnly) {
		// Rebuild what apply did from the ledger: manual rows by book -> series
		const res = await fetch(`${api}/manual_series`);
		const ledger = (await res.json()) as { books: { book_id: number; series_id: number }[] };
		const seriesOf = new Map(ledger.books.map((b) => [b.book_id, b.series_id]));
		series = { ok: [], failed: [] };
		for (const x of approvedSeries) {
			const ids = x.book_ids.map((id) => seriesOf.get(id));
			const sid = ids[0];
			if (sid !== undefined && ids.every((v) => v === sid))
				series.ok.push({ entry: { _fp: x.fingerprint }, result: { series_id: sid } });
			else series.failed.push(x);
		}
		adds = { ok: [], failed: [] };
		for (const x of approvedAdds) {
			if (seriesOf.get(x.book_id) === x.series_id)
				adds.ok.push({ entry: { book_id: x.book_id, series_id: x.series_id } });
			else adds.failed.push(x);
		}
		console.log(
			`ledger: ${series.ok.length} series and ${adds.ok.length} additions found applied; ${series.failed.length + adds.failed.length} approved entries not applied (left undecided)`
		);
	} else {
		series = await postBatches(
			'/manual_series',
			// _fp rides along for bookkeeping; the API ignores unknown fields
			approvedSeries.map((x) => ({
				name: x.name,
				book_ids: x.book_ids,
				...(x.positions ? { positions: x.positions } : {}),
				_fp: x.fingerprint,
			})),
			(e) => e.name
		);
		console.log(`new series: ${series.ok.length} created, ${series.failed.length} failed`);
		adds = await postBatches(
			'/manual_series/books',
			approvedAdds.map((x) => ({
				book_id: x.book_id,
				series_id: x.series_id,
				position: x.position,
			})),
			(e) => `${e.book_id} -> ${e.series_id} @ ${e.position}`
		);
		console.log(`additions: ${adds.ok.length} added, ${adds.failed.length} failed`);
	}

	for (const { entry, result } of series.ok) {
		const src = approvedSeries.find((x) => x.fingerprint === entry._fp)!;
		decisions.push({
			fingerprint: src.fingerprint,
			kind: 'new_series',
			decision: 'approved',
			book_ids: src.book_ids,
			series_id: result.series_id,
			confidence: src.confidence,
		});
	}
	for (const { entry } of adds.ok) {
		const src = approvedAdds.find(
			(x) => x.book_id === entry.book_id && x.series_id === entry.series_id
		)!;
		decisions.push({
			fingerprint: src.fingerprint,
			kind: 'add_to_series',
			decision: 'approved',
			book_ids: [src.book_id],
			series_id: src.series_id,
			confidence: src.confidence,
		});
	}

	for (const x of d.new_series.filter((x) => x.decision === 'rejected'))
		decisions.push({
			fingerprint: x.fingerprint,
			kind: 'new_series',
			decision: 'rejected',
			book_ids: x.book_ids,
			series_id: null,
			confidence: x.confidence,
		});
	for (const x of d.additions.filter((x) => x.decision === 'rejected'))
		decisions.push({
			fingerprint: x.fingerprint,
			kind: 'add_to_series',
			decision: 'rejected',
			book_ids: [x.book_id],
			series_id: x.series_id,
			confidence: x.confidence,
		});

	let saved = 0;
	for (const batch of chunks(decisions, 2000)) {
		const { status, json } = await post('/manual_series/scan_decisions', batch);
		if (status !== 201) throw new Error(`scan_decisions ${status}: ${JSON.stringify(json)}`);
		saved += json.saved;
	}
	console.log(`decisions recorded: ${saved}`);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
