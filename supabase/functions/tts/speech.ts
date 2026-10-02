// Microsoft Edge read-aloud websocket client (same protocol as edge-tts).
// Voice and rate match the built-in clips: en-US-JennyNeural, -10%.

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const VOICE = "en-US-JennyNeural";
const RATE = "-10%";
const WSS_BASE =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

let clockSkewSeconds = 0;

async function sha256HexUpper(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Sec-MS-GEC token, matching edge-tts DRM.generate_sec_ms_gec for the same unix time. */
export async function secMsGecToken(unixSeconds = Date.now() / 1000): Promise<string> {
  let ticks = unixSeconds + clockSkewSeconds;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  return sha256HexUpper(`${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`);
}

function adjustSkewFromHttpDate(dateHeader: string | null): void {
  if (!dateHeader) return;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return;
  const client = Date.now() + clockSkewSeconds * 1000;
  clockSkewSeconds += (server - client) / 1000;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(text: string): string {
  return [...text].map((ch) => {
    const code = ch.codePointAt(0) || 0;
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) return " ";
    return ch;
  }).join("");
}

function dateToString(now = new Date()): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[now.getUTCDay()]} ${months[now.getUTCMonth()]} ${pad(now.getUTCDate())} ${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

function hexId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function muid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function ssml(text: string): string {
  const spoken = /[.!?]$/.test(text) ? text : `${text}.`;
  return (
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
    `<voice name='${VOICE}'>` +
    `<prosody pitch='+0Hz' rate='${RATE}' volume='+0%'>` +
    `${escapeXml(cleanText(spoken))}` +
    "</prosody></voice></speak>"
  );
}

function headerFields(head: string): { path: string; contentType: string } {
  let path = "";
  let contentType = "";
  for (const line of head.split("\r\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).replace(/[^\x20-\x7e]/g, "");
    const value = line.slice(i + 1).trim();
    if (key === "Path") path = value;
    if (key === "Content-Type") contentType = value;
  }
  return { path, contentType };
}

/** MP3 bytes from a binary frame: 2-byte header length, header text, then audio. */
function audioFromFrame(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 2) return null;
  const headerLength = (bytes[0] << 8) | bytes[1];
  if (headerLength <= 0 || 2 + headerLength > bytes.length) return null;
  const fields = headerFields(new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(2, 2 + headerLength)));
  if (fields.path !== "audio" || !fields.contentType.includes("audio/mpeg")) return null;
  const body = bytes.subarray(2 + headerLength);
  return body.length ? body : null;
}

type WsLike = WebSocket & {
  on(event: "open", cb: () => void): void;
  on(event: "message", cb: (data: Uint8Array | string, isBinary: boolean) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: () => void): void;
  on(event: "unexpected-response", cb: (req: unknown, res: { statusCode?: number; headers: Record<string, string | string[] | undefined>; resume: () => void }) => void): void;
  send(data: string): void;
  close(): void;
};

async function openSocket(token: string): Promise<WsLike> {
  const { default: WebSocket } = await import("npm:ws@8.18.3");
  const connectionId = hexId();
  const url = `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const major = CHROMIUM_FULL_VERSION.split(".")[0];
  const ws = new WebSocket(url, {
    perMessageDeflate: true,
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${muid()};`,
    },
  }) as unknown as WsLike;
  return ws;
}

function synthesizeOnce(text: string, token: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch { /* ignore */ }
      reject(err);
    };
    const succeed = (audio: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch { /* ignore */ }
      resolve(audio);
    };

    const chunks: Uint8Array[] = [];
    let ws: WsLike | undefined;
    const timer = setTimeout(() => fail(new Error("tts timeout")), 20000);

    openSocket(token).then((socket) => {
      ws = socket;
      ws.on("unexpected-response", (_req, res) => {
        const date = res.headers?.date;
        const header = Array.isArray(date) ? date[0] : date;
        adjustSkewFromHttpDate(header || null);
        try { res.resume(); } catch { /* ignore */ }
        const err = new Error(`edge tts HTTP ${res.statusCode || 0}`);
        (err as Error & { status?: number }).status = res.statusCode;
        fail(err);
      });
      ws.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
      ws.on("close", () => {
        if (!settled) fail(new Error("edge tts closed before audio"));
      });
      ws.on("open", () => {
        const now = dateToString();
        socket.send(
          `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
            `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`,
        );
        socket.send(
          `X-RequestId:${hexId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n${ssml(text)}`,
        );
      });
      ws.on("message", (data, isBinary) => {
        try {
          const bytes = typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array(data as Uint8Array);
          if (!isBinary) {
            const text = new TextDecoder().decode(bytes);
            const splitAt = text.indexOf("\r\n\r\n");
            const head = splitAt >= 0 ? text.slice(0, splitAt) : text;
            const pathLine = head.split("\r\n").find((line) => line.startsWith("Path:"));
            const path = pathLine ? pathLine.slice(5).trim() : "";
            if (path === "turn.end") {
              if (!chunks.length) fail(new Error("no audio"));
              else {
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let offset = 0;
                for (const c of chunks) { out.set(c, offset); offset += c.length; }
                succeed(out);
              }
            }
            return;
          }
          const audio = audioFromFrame(bytes);
          if (audio) chunks.push(audio);
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }).catch((err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

/** Speak text with en-US-JennyNeural at -10% and return MP3 bytes. */
export async function synthesizeJenny(text: string): Promise<Uint8Array> {
  const token = await secMsGecToken();
  try {
    return await synthesizeOnce(text, token);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 403) throw err;
    const retry = await secMsGecToken();
    return await synthesizeOnce(text, retry);
  }
}

if (import.meta.main) {
  const word = Deno.args[0] || "pineapple";
  const out = Deno.args[1] || "/tmp/tts/cloud-word.mp3";
  const audio = await synthesizeJenny(word);
  await Deno.writeFile(out, audio);
  console.log(`wrote ${audio.length} bytes to ${out}`);
}
