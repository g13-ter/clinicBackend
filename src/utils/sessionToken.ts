import type { Request } from "express";

export const SESSION_COOKIE_NAME = "clinic_session";

const cookieValue = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(pair.slice(separator + 1).trim());
  }

  return null;
};

export const getRequestToken = (req: Request): string | null => {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? cookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
};
