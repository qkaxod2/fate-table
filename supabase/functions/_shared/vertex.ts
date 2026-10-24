// Vertex AI Gemini 호출. 인증은 둘 중 하나:
//   VERTEX_API_KEY                  API 키 (Vertex AI 익스프레스 모드 또는 서비스 계정에 묶인 키)
//   GOOGLE_SERVICE_ACCOUNT_JSON     서비스 계정 키 JSON 전체 (roles/aiplatform.user)
// 선택: GOOGLE_CLOUD_PROJECT(키 JSON에 있으면 생략), VERTEX_LOCATION(기본 global), VERTEX_MODEL(기본 gemini-4-argon)

export const VERTEX_MODEL = Deno.env.get('VERTEX_MODEL')?.trim() || 'gemini-4-argon';
const LOCATION = Deno.env.get('VERTEX_LOCATION')?.trim() || 'global';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
  if (!raw) return null;
  try {
    // 시크릿에 base64로 넣어도 받아 준다
    return JSON.parse(raw.startsWith('{') ? raw : atob(raw)) as ServiceAccount;
  } catch {
    console.error('vertex: GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }
}

export function vertexConfigured(): boolean {
  return !!(Deno.env.get('VERTEX_API_KEY')?.trim() || serviceAccount());
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

let cached: { token: string; until: number } | null = null;

/** 서비스 계정 JWT → OAuth 액세스 토큰 (함수 인스턴스가 살아 있는 동안 재사용) */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

function endpoint(project: string | undefined): string {
  const host = LOCATION === 'global' ? 'aiplatform.googleapis.com' : `${LOCATION}-aiplatform.googleapis.com`;
  const model = `publishers/google/models/${VERTEX_MODEL}:generateContent`;
  return project
    ? `https://${host}/v1/projects/${project}/locations/${LOCATION}/${model}`
    : `https://${host}/v1/${model}`;
}

export class VertexError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface JsonRequest {
  system: string;
  user: string;
  schema: unknown;
  temperature?: number;
}

/** 지침 + 사용자 메시지 → 스키마에 맞춘 JSON */
export async function generateJson<T>(req: JsonRequest): Promise<T> {
  const apiKey = Deno.env.get('VERTEX_API_KEY')?.trim();
  const sa = apiKey ? null : serviceAccount();
  if (!apiKey && !sa) throw new VertexError(503, 'not configured');
  const project = Deno.env.get('GOOGLE_CLOUD_PROJECT')?.trim() || sa?.project_id;

  const url = endpoint(project) + (apiKey ? `?key=${encodeURIComponent(apiKey)}` : '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sa) headers.Authorization = `Bearer ${await accessToken(sa)}`;

  // 판타지 전투·흉터·피 같은 묘사가 걸러지지 않도록 콘텐츠 필터는 끈다
  const safetySettings = [
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
  ].map((category) => ({ category, threshold: 'OFF' }));

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.8,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: req.schema,
      },
      safetySettings,
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    console.error('vertex', res.status, text);
    throw new VertexError(res.status, text);
  }
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text) throw new VertexError(502, 'empty response');
  try {
    return JSON.parse(text) as T;
  } catch {
    // 코드 펜스로 감싸 오는 경우
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new VertexError(502, 'not json');
  }
}
