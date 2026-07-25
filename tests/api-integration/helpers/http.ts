import type { createApp } from "../../../apps/api/src/index";

const origin = "http://localhost:5173";

export type App = ReturnType<typeof createApp>["app"];

export type CookieJar = Map<string, string>;

export function newJar(): CookieJar {
  return new Map([["csrf", "1"]]);
}

export function updateJar(jar: CookieJar, res: Response) {
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!value) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

export function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function request(
  app: App,
  jar: CookieJar,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const res = await app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      Cookie: cookieHeader(jar),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  updateJar(jar, res);
  return res;
}
