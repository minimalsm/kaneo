import { randomUUID } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

const origin = "http://localhost:5173";

type App = ReturnType<typeof createApp>["app"];

type CookieJar = Map<string, string>;

function newJar(): CookieJar {
  return new Map([["csrf", "1"]]);
}

function updateJar(jar: CookieJar, res: Response) {
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

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(
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

async function signUpUser(
  app: App,
  email: string,
  password: string,
): Promise<{ jar: CookieJar; userId: string }> {
  const jar = newJar();
  const res = await request(app, jar, "/api/auth/sign-up/email", {
    name: "Two Factor User",
    email,
    password,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { jar, userId: body.user.id };
}

async function seedWorkspaceFor(
  userId: string,
  name = "2FA Workspace",
): Promise<string> {
  const workspaceId = `ws-${randomUUID()}`;
  await db.insert(schema.workspaceTable).values({
    id: workspaceId,
    name,
    slug: `slug-${randomUUID()}`,
    createdAt: new Date(),
  });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId,
    role: "owner",
    joinedAt: new Date(),
  });
  return workspaceId;
}

async function getSessionUser(
  app: App,
  jar: CookieJar,
): Promise<{
  user?: { id: string };
  session?: Record<string, unknown>;
} | null> {
  const res = await request(app, jar, "/api/auth/get-session");
  expect(res.status).toBe(200);
  return (await res.json()) as {
    user?: { id: string };
    session?: Record<string, unknown>;
  } | null;
}

function secretFromTotpUri(totpURI: string): string {
  const encoded = new URL(totpURI).searchParams.get("secret");
  if (!encoded) {
    throw new Error("expected secret in totpURI");
  }
  // The otpauth URI carries the secret base32-encoded; the server signs
  // TOTP codes with the raw secret string.
  return new TextDecoder().decode(base32.decode(encoded));
}

async function totpCode(secret: string): Promise<string> {
  return await createOTP(secret, { digits: 6 }).totp();
}

async function wrongTotpCode(secret: string): Promise<string> {
  const valid = await totpCode(secret);
  return valid === "000000" ? "111111" : "000000";
}

/**
 * Enable 2FA on an authenticated session and verify the TOTP setup so the
 * enrollment is complete (twoFactor.verified = true, user.twoFactorEnabled).
 */
async function enrollTwoFactor(
  app: App,
  jar: CookieJar,
  password: string,
): Promise<{ secret: string; totpURI: string; backupCodes: string[] }> {
  const enableRes = await request(app, jar, "/api/auth/two-factor/enable", {
    password,
  });
  expect(enableRes.status).toBe(200);
  const enableBody = (await enableRes.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  const secret = secretFromTotpUri(enableBody.totpURI);

  const verifyRes = await request(
    app,
    jar,
    "/api/auth/two-factor/verify-totp",
    {
      code: await totpCode(secret),
    },
  );
  expect(verifyRes.status).toBe(200);

  return {
    secret,
    totpURI: enableBody.totpURI,
    backupCodes: enableBody.backupCodes,
  };
}

/**
 * Start a password sign-in for an enrolled user and assert the challenge
 * shape: twoFactorRedirect body and no authenticated session.
 */
async function startSignInChallenge(
  app: App,
  email: string,
  password: string,
): Promise<CookieJar> {
  const jar = newJar();
  const res = await request(app, jar, "/api/auth/sign-in/email", {
    email,
    password,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { twoFactorRedirect?: boolean };
  expect(body.twoFactorRedirect).toBe(true);
  return jar;
}

describe("API integration: two-factor authentication (TOTP)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("enables 2FA with password confirmation and flips verified/twoFactorEnabled after TOTP verification", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);

    const wrongPasswordRes = await request(
      app,
      jar,
      "/api/auth/two-factor/enable",
      { password: "not-the-password" },
    );
    expect(wrongPasswordRes.status).toBe(400);

    const enableRes = await request(app, jar, "/api/auth/two-factor/enable", {
      password,
    });
    expect(enableRes.status).toBe(200);
    const enableBody = (await enableRes.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    // KTD3: issuer must be branded via appName.
    expect(enableBody.totpURI).toContain("Kaneo");
    expect(enableBody.backupCodes.length).toBeGreaterThan(0);

    const [pendingRow] = await db
      .select()
      .from(schema.twoFactorTable)
      .where(eq(schema.twoFactorTable.userId, userId));
    expect(pendingRow).toBeDefined();
    expect(pendingRow.verified).toBe(false);

    const [pendingUser] = await db
      .select({ twoFactorEnabled: schema.userTable.twoFactorEnabled })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId));
    expect(pendingUser.twoFactorEnabled).not.toBe(true);

    const secret = secretFromTotpUri(enableBody.totpURI);
    const verifyRes = await request(
      app,
      jar,
      "/api/auth/two-factor/verify-totp",
      { code: await totpCode(secret) },
    );
    expect(verifyRes.status).toBe(200);

    const [verifiedRow] = await db
      .select()
      .from(schema.twoFactorTable)
      .where(eq(schema.twoFactorTable.userId, userId));
    expect(verifiedRow.verified).toBe(true);

    const [enrolledUser] = await db
      .select({ twoFactorEnabled: schema.userTable.twoFactorEnabled })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId));
    expect(enrolledUser.twoFactorEnabled).toBe(true);
  });

  it("challenges password sign-in without creating a session, then verify-totp creates a stamped session", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    const { secret } = await enrollTwoFactor(app, jar, password);
    const workspaceId = await seedWorkspaceFor(userId);

    const challengeJar = await startSignInChallenge(app, email, password);
    expect(await getSessionUser(app, challengeJar)).toBeFalsy();

    const verifyRes = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/verify-totp",
      { code: await totpCode(secret) },
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as { token: string };
    expect(verifyBody.token).toEqual(expect.any(String));

    const session = await getSessionUser(app, challengeJar);
    expect(session?.user?.id).toBe(userId);

    // R6: the after-hook stamps activeOrganizationId on 2FA completion,
    // exactly like a direct sign-in.
    const [sessionRow] = await db
      .select({
        activeOrganizationId: schema.sessionTable.activeOrganizationId,
      })
      .from(schema.sessionTable)
      .where(eq(schema.sessionTable.token, verifyBody.token));
    expect(sessionRow.activeOrganizationId).toBe(workspaceId);
  });

  it("does not switch the active workspace when enrolling while a non-first workspace is active", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    const firstWorkspaceId = await seedWorkspaceFor(userId, "First workspace");
    const secondWorkspaceId = await seedWorkspaceFor(
      userId,
      "Second workspace",
    );

    const setActiveRes = await request(
      app,
      jar,
      "/api/auth/organization/set-active",
      { organizationId: secondWorkspaceId },
    );
    expect(setActiveRes.status).toBe(200);

    await enrollTwoFactor(app, jar, password);

    // KTD4 null-guard regression: enrollment replaces the session; the
    // widened after-hook must not restamp it to the first workspace.
    const session = await getSessionUser(app, jar);
    expect(session?.user?.id).toBe(userId);
    expect(session?.session?.activeOrganizationId).toBe(secondWorkspaceId);
    expect(session?.session?.activeOrganizationId).not.toBe(firstWorkspaceId);
  });

  it("accepts a backup code once and rejects its reuse", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    const { backupCodes } = await enrollTwoFactor(app, jar, password);

    const firstJar = await startSignInChallenge(app, email, password);
    const firstUse = await request(
      app,
      firstJar,
      "/api/auth/two-factor/verify-backup-code",
      { code: backupCodes[0] },
    );
    expect(firstUse.status).toBe(200);
    const session = await getSessionUser(app, firstJar);
    expect(session?.user?.id).toBe(userId);

    const secondJar = await startSignInChallenge(app, email, password);
    const secondUse = await request(
      app,
      secondJar,
      "/api/auth/two-factor/verify-backup-code",
      { code: backupCodes[0] },
    );
    expect(secondUse.status).toBe(401);
    expect(await getSessionUser(app, secondJar)).toBeFalsy();
  });

  it("invalidates the previous backup-code set after regeneration", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    const { backupCodes: oldCodes } = await enrollTwoFactor(app, jar, password);

    const regenerateRes = await request(
      app,
      jar,
      "/api/auth/two-factor/generate-backup-codes",
      { password },
    );
    expect(regenerateRes.status).toBe(200);
    const { backupCodes: newCodes } = (await regenerateRes.json()) as {
      backupCodes: string[];
    };
    expect(newCodes.length).toBeGreaterThan(0);
    expect(newCodes).not.toContain(oldCodes[0]);

    const challengeJar = await startSignInChallenge(app, email, password);
    const oldCodeRes = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/verify-backup-code",
      { code: oldCodes[0] },
    );
    expect(oldCodeRes.status).toBe(401);

    const newCodeRes = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/verify-backup-code",
      { code: newCodes[0] },
    );
    expect(newCodeRes.status).toBe(200);
    const session = await getSessionUser(app, challengeJar);
    expect(session?.user?.id).toBe(userId);
  });

  it("rejects a wrong TOTP code without creating a session", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar } = await signUpUser(app, email, password);
    const { secret } = await enrollTwoFactor(app, jar, password);

    const challengeJar = await startSignInChallenge(app, email, password);
    const res = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/verify-totp",
      { code: await wrongTotpCode(secret) },
    );
    expect(res.status).toBe(401);
    expect(await getSessionUser(app, challengeJar)).toBeFalsy();
  });

  it("restores direct password sign-in after disable", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    const { secret } = await enrollTwoFactor(app, jar, password);

    // Complete a full challenged sign-in to get a fresh session for the
    // sensitive disable endpoint.
    const challengeJar = await startSignInChallenge(app, email, password);
    const verifyRes = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/verify-totp",
      { code: await totpCode(secret) },
    );
    expect(verifyRes.status).toBe(200);

    const disableRes = await request(
      app,
      challengeJar,
      "/api/auth/two-factor/disable",
      { password },
    );
    expect(disableRes.status).toBe(200);

    const [userRow] = await db
      .select({ twoFactorEnabled: schema.userTable.twoFactorEnabled })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId));
    expect(userRow.twoFactorEnabled).toBe(false);

    const directJar = newJar();
    const signInRes = await request(app, directJar, "/api/auth/sign-in/email", {
      email,
      password,
    });
    expect(signInRes.status).toBe(200);
    const signInBody = (await signInRes.json()) as {
      token?: string;
      twoFactorRedirect?: boolean;
    };
    expect(signInBody.twoFactorRedirect).toBeUndefined();
    expect(signInBody.token).toEqual(expect.any(String));
    const session = await getSessionUser(app, directJar);
    expect(session?.user?.id).toBe(userId);
  });

  it("lets email-OTP sign-in bypass the TOTP challenge (accepted 2FA boundary)", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar, userId } = await signUpUser(app, email, password);
    await enrollTwoFactor(app, jar, password);

    const otpJar = newJar();
    const sendRes = await request(
      app,
      otpJar,
      "/api/auth/email-otp/send-verification-otp",
      { email, type: "sign-in" },
    );
    expect(sendRes.status).toBe(200);

    const [verification] = await db
      .select({ value: schema.verificationTable.value })
      .from(schema.verificationTable)
      .where(eq(schema.verificationTable.identifier, `sign-in-otp-${email}`));
    const otp = verification.value.split(":")[0];

    const signInRes = await request(
      app,
      otpJar,
      "/api/auth/sign-in/email-otp",
      {
        email,
        otp,
      },
    );
    expect(signInRes.status).toBe(200);
    const body = (await signInRes.json()) as {
      token?: string;
      twoFactorRedirect?: boolean;
    };
    // Pins the accepted boundary: the twoFactor plugin only challenges
    // /sign-in/email|username|phone-number, so email-OTP creates a session
    // directly. A better-auth upgrade changing this must surface here.
    expect(body.twoFactorRedirect).toBeUndefined();
    expect(body.token).toEqual(expect.any(String));
    const session = await getSessionUser(app, otpJar);
    expect(session?.user?.id).toBe(userId);
  });

  it("rejects verify-totp without a two_factor cookie and creates no session", async () => {
    const { app } = createApp();
    const email = `totp-${randomUUID()}@example.com`;
    const password = "two-factor-password-12345";
    const { jar } = await signUpUser(app, email, password);
    const { secret } = await enrollTwoFactor(app, jar, password);

    const bareJar = newJar();
    const res = await request(
      app,
      bareJar,
      "/api/auth/two-factor/verify-totp",
      {
        code: await totpCode(secret),
      },
    );
    expect(res.status).toBe(401);
    expect(await getSessionUser(app, bareJar)).toBeFalsy();
  });
});
