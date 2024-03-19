import { escapeNewline } from "../utils/string-utils";

export const getHTML = async (url: string): Promise<string> => {
  const escapedUrl = escapeNewline(url);
  let response: Response;
  try {
    response = await fetch(escapedUrl);
  } catch (e) {
    throw new Error(`"${escapedUrl}" is not found: ${e}`);
  }
  switch (response.status) {
    case 404:
      throw new Error(`Not found: "${escapedUrl}"`);
    case 400:
      throw new Error(`Bad Request: "${escapedUrl}"`);
  }
  return response.text();
}