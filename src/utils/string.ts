export type groups =
	| {
			[key: string]: string;
	  }
	| undefined;

export const extractRegex = (str: string, regex: RegExp): Array<string> => {
	const matchesIterator = str.matchAll(regex);
	let matchedStrings: Array<string> = [];
	for (const match of matchesIterator) {
		matchedStrings = [...matchedStrings, match[1]];
	}
	return matchedStrings;
};

export const extractRegexGroup = (str: string, regex: RegExp): Array<groups> => {
	const matchesIterator = str.matchAll(regex);
	let matchedStrings: Array<groups> = [];
	for (const match of matchesIterator) {
		matchedStrings = [...matchedStrings, match.groups];
	}
	return matchedStrings;
};

export const escapeNewline = (str: string | undefined): string => {
	return str ? str.replace(/\r|\n/g, '') : '';
};

/**
 * Validates if a string is in YYYY/MM/DD format and returns Date object if valid, null if invalid
 */
export const safeParseUTCDate = (dateString: string): Date | null => {
	const dateRegex = /^\d{4}\/\d{2}\/\d{2}$/;

	if (!dateRegex.test(dateString)) {
		return null;
	}

	const [year, month, day] = dateString.split('/').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));

	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}

	return date;
};
