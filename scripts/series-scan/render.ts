// Rebuild review.html from an existing candidates.json without re-scanning. The scan's
// generated_at is kept, so choices already saved in the browser for that scan carry over.
//
//   npm run series:render -- <candidates.json> <review.html>

import { readFileSync, writeFileSync } from 'node:fs';
import { renderReview } from './review';
import type { ScanResult } from './scan';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
	console.error('usage: series:render <candidates.json> <review.html>');
	process.exit(1);
}
const result = JSON.parse(readFileSync(inPath, 'utf8')) as ScanResult;
writeFileSync(outPath, renderReview(result));
console.log(`-> ${outPath} (scan ${result.generated_at})`);
