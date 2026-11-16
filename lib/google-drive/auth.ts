import { exec } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getServerEnv } from "@/shared/lib/serverEnv";

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const OAUTH_PORT = 53682;
const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/oauth2callback`;

export const DRIVE_CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
export const DRIVE_TOKEN_PATH = path.join(process.cwd(), "token.json");

type InstalledCredentials = {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
};

type CredentialsFile = {
  installed?: InstalledCredentials;
  web?: InstalledCredentials;
};

type StoredToken = {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
};

function readEnv(names: string[]): string | null {
  for (const name of names) {
    const value = getServerEnv(name);
    if (value) {
      return value;
    }
  }
  return null;
}

function driveAuthFromEnv(): { client_id: string; client_secret: string; refresh_token: string } | null {
  const client_id = readEnv(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID"]);
  const client_secret = readEnv(["GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"]);
  const refresh_token = readEnv(["GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN"]);

  if (client_id && client_secret && refresh_token) {
    return { client_id, client_secret, refresh_token };
  }

  if (client_id || client_secret || refresh_token) {
    throw new Error(
      "Google Drive 환경변수가 일부만 설정되어 있습니다. GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN을 모두 넣거나 모두 비우고 credentials.json/token.json을 사용하세요.",
    );
  }

  return null;
}

function openBrowser(url: string) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.log("브라우저를 자동으로 열지 못했습니다. 아래 주소를 복사해서 열어주세요:");
      console.log(url);
    }
  });
}

async function loadInstalledCredentials(): Promise<InstalledCredentials> {
  let raw: string;
  try {
    raw = await readFile(DRIVE_CREDENTIALS_PATH, "utf8");
  } catch {
    throw new Error(
      "Google Drive 인증 정보가 없습니다. 환경변수 GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN을 설정하거나 프로젝트 루트에 credentials.json을 두세요.",
    );
  }

  const parsed = JSON.parse(raw) as CredentialsFile;
  const installed = parsed.installed ?? parsed.web;
  if (!installed?.client_id || !installed.client_secret) {
    throw new Error("credentials.json 형식이 올바르지 않습니다. Desktop App(installed) OAuth 파일이어야 합니다.");
  }
  return installed;
}

function createOAuthClient(installed: InstalledCredentials): OAuth2Client {
  return new google.auth.OAuth2(installed.client_id, installed.client_secret, OAUTH_REDIRECT);
}

async function authorizeFromTokenFile(): Promise<OAuth2Client> {
  const installed = await loadInstalledCredentials();
  const client = createOAuthClient(installed);
  const saved = await loadSavedToken();

  if (!saved?.refresh_token && !saved?.access_token) {
    throw new Error("token.json이 없습니다. 프로젝트 루트에서 npm run drive:test로 Google 인증을 먼저 완료하세요.");
  }

  client.setCredentials(saved);
  return client;
}

async function loadSavedToken(): Promise<StoredToken | null> {
  try {
    const raw = await readFile(DRIVE_TOKEN_PATH, "utf8");
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

async function saveToken(tokens: StoredToken) {
  await writeFile(DRIVE_TOKEN_PATH, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://localhost:${OAUTH_PORT}`);
        if (requestUrl.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end();
          return;
        }

        const error = requestUrl.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<p>인증이 취소되었습니다. 터미널을 확인하세요.</p>");
          server.close();
          reject(new Error(`Google 인증이 거부되었습니다: ${error}`));
          return;
        }

        const code = requestUrl.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<p>인증 코드가 없습니다.</p>");
          server.close();
          reject(new Error("OAuth 응답에 code가 없습니다."));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<p>인증이 완료되었습니다. 이 창을 닫고 터미널로 돌아가세요.</p>");
        server.close();
        resolve(code);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.on("error", reject);
    server.listen(OAUTH_PORT);
  });
}

async function authorizeWithBrowser(client: OAuth2Client): Promise<void> {
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("");
  console.log("Google 계정 인증이 필요합니다.");
  console.log("1. 브라우저가 열리면 Google 계정으로 로그인하세요.");
  console.log("2. 'Google hasn't verified this app'이 보이면 Advanced → Go to ideave (unsafe)를 누르세요.");
  console.log("3. Drive 파일 보기 권한을 확인하고 Allow / 허용을 누르세요.");
  console.log("4. 완료 문구가 나오면 브라우저를 닫고 터미널을 보면 됩니다.");
  console.log("");
  console.log("브라우저가 열리지 않으면 이 주소를 붙여넣으세요:");
  console.log(authUrl);
  console.log("");

  openBrowser(authUrl);
  const code = await waitForAuthCode();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveToken({
    refresh_token: tokens.refresh_token ?? undefined,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
  });
  console.log("token.json에 인증 정보를 저장했습니다. 다음부터는 로그인 없이 실행됩니다.");
}

async function ensureAccessToken(client: OAuth2Client, label: string): Promise<OAuth2Client> {
  const result = await client.getAccessToken();
  const token = typeof result === "string" ? result : result?.token;
  if (!token) {
    throw new Error(`Drive ${label} did not return an access token`);
  }
  return client;
}

let cachedServerClient: Promise<OAuth2Client> | null = null;

/**
 * Next.js API 등 서버에서만 사용. 브라우저 로그인 창을 열지 않는다.
 * 인증된 클라이언트는 프로세스 안에서 재사용한다(이미지 요청마다 토큰을 새로 받지 않도록).
 * OAuth2Client 는 refresh_token 으로 만료된 access token 을 자동 갱신한다. 실패하면 캐시를 비워 다음 요청에서 다시 인증한다.
 */
export async function authorizeDriveServer(): Promise<OAuth2Client> {
  if (!cachedServerClient) {
    cachedServerClient = authorizeDriveServerUncached();
  }
  try {
    return await cachedServerClient;
  } catch (error) {
    cachedServerClient = null;
    throw error;
  }
}

async function authorizeDriveServerUncached(): Promise<OAuth2Client> {
  const attempts: Array<{ label: string; run: () => Promise<OAuth2Client> }> = [
    { label: "token.json", run: authorizeFromTokenFile },
  ];

  const fromEnv = driveAuthFromEnv();
  if (fromEnv) {
    attempts.push({
      label: "env",
      run: async () => {
        const client = new google.auth.OAuth2(fromEnv.client_id, fromEnv.client_secret);
        client.setCredentials({ refresh_token: fromEnv.refresh_token });
        return client;
      },
    });
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const client = await attempt.run();
      return await ensureAccessToken(client, attempt.label);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[IDEAVE] Drive auth via ${attempt.label} failed: ${message}`);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Google Drive 인증에 실패했습니다.");
}

export async function authorizeDrive(): Promise<OAuth2Client> {
  try {
    return await authorizeDriveServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("환경변수가 일부만")) {
      throw error;
    }
    const installed = await loadInstalledCredentials();
    const client = createOAuthClient(installed);
    await authorizeWithBrowser(client);
    return client;
  }
}
