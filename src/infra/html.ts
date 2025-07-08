import { HTTPException } from 'hono/http-exception';
import { escapeNewline } from '../utils/string-utils';

export const getHTML = async (url: string): Promise<string> => {
	console.log(`Fetching URL: ${url}`);
	const escapedUrl = escapeNewline(url);
	let response: Response;
	try {
		response = await fetch(escapedUrl);
	} catch (e) {
		throw new HTTPException(500, { message: e });
	}
	switch (response.status) {
		case 500:
			throw new HTTPException(500, { message: 'Bookmeter: Internal Server Error' });
		case 404:
			throw new HTTPException(404, { message: 'Bookmeter: Not found' });
		case 400:
			throw new HTTPException(400, { message: 'Bookmeter: Bad Request' });
	}
	return response.text();
};
