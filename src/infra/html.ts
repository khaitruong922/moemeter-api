import { HTTPException } from 'hono/http-exception';
import { escapeNewline } from '../utils/string';

export const getHTML = async (url: string): Promise<string> => {
	console.log(`URL取得中: ${url}`);
	const escapedUrl = escapeNewline(url);
	let response: Response;
	try {
		response = await fetch(escapedUrl);
	} catch (e) {
		throw new HTTPException(500, { message: e });
	}
	switch (response.status) {
		case 500:
			throw new HTTPException(500, { message: 'ブックメーター: 内部サーバーエラー' });
		case 404:
			throw new HTTPException(404, { message: 'ブックメーター: 見つかりません' });
		case 400:
			throw new HTTPException(400, { message: 'ブックメーター: 不正なリクエスト' });
	}
	return response.text();
};
