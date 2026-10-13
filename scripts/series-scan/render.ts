// Rebuild review.html from an existing candidates.json without re-scanning. The scan's
// generated_at is kept, so choices already saved in the browser for that scan carry over.
//
//   npm run series:render -- <candidates.json> <review.html>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderReview } from './review';
import type { ScanResult } from './scan';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
	console.error('usage: series:render <candidates.json> <review.html>');
	process.exit(1);
}
const result = JSON.parse(readFileSync(inPath, 'utf8')) as ScanResult;
// series:sequels output in the same directory becomes the 続刊 tab
const sequelsPath = join(dirname(inPath), 'sequels.json');
if (existsSync(sequelsPath)) {
	const sequels = JSON.parse(readFileSync(sequelsPath, 'utf8')) as {
		stats: Record<string, number>;
		sequels: NonNullable<ScanResult['sequels']>;
	};
	result.sequels = sequels.sequels;
	result.stats = { ...result.stats, sequels: sequels.stats.sequels ?? sequels.sequels.length };
}
writeFileSync(outPath, renderReview(result));
console.log(`-> ${outPath} (scan ${result.generated_at})`);
