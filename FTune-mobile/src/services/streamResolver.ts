import { getDownloadedTrackUri } from "./downloadManager";
import { getServerUrl, isServerConnected } from "./api";

let cachedVisitorData: string | null = null;
let visitorDataTime = 0;

async function fetchVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedVisitorData && now - visitorDataTime < 1000 * 60 * 60) {
    return cachedVisitorData;
  }
  try {
    const res = await fetch("https://www.youtube.com/sw.js_data", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();
    const data = JSON.parse(text.replace(/^\)\]\}'/, ""));
    const vd = data[0][2][0][0][13];
    if (typeof vd === "string" && vd.length > 5) {
      cachedVisitorData = vd;
      visitorDataTime = now;
      return vd;
    }
  } catch {}
  return "CgttSmZZREZKLTlQbyiF";
}

async function resolveDirectYouTube(videoId: string): Promise<string | null> {
  try {
    const vd = await fetchVisitorData();
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1";

    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ua,
        "X-Goog-Visitor-Id": vd,
        "X-YouTube-Client-Name": "101",
        "X-YouTube-Client-Version": "0.1",
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "VISIONOS",
            clientVersion: "0.1",
            deviceMake: "Apple",
            deviceModel: "RealityDevice14,1",
            osName: "visionOS",
            osVersion: "1.3.21O771",
            hl: "en",
            gl: "US",
            visitorData: vd,
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const formats = (data?.streamingData?.adaptiveFormats || []).filter(
      (f: any) => f?.mimeType?.startsWith("audio/") && f?.url
    );

    // Prefer AAC/m4a (itag 140 or 139) because native iOS and Android audio decoders play it flawlessly
    const aacFormat =
      formats.find((f: any) => f.itag === 140) ||
      formats.find((f: any) => f.mimeType?.includes("mp4")) ||
      formats[0];

    if (aacFormat?.url) {
      return aacFormat.url;
    }
  } catch (err: any) {
    console.warn("[streamResolver] Direct YouTube resolve failed:", err?.message);
  }
  return null;
}

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];

async function resolveViaPiped(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const data = await res.json();
        const audio = (data?.audioStreams || []).filter((s: any) => s?.url);
        if (audio.length > 0) {
          audio.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          const pick = audio.find((s: any) => /mp4|aac/i.test(s.mimeType || "")) || audio[0];
          return pick.url;
        }
      }
    } catch {}
  }
  return null;
}

export async function resolveAudioStream(videoId: string): Promise<string | null> {
  // 1. Check offline local download first
  try {
    const local = await getDownloadedTrackUri(videoId);
    if (local) return local;
  } catch {}

  // 2. Direct standalone YouTube resolution on device
  const directUrl = await resolveDirectYouTube(videoId);
  if (directUrl) return directUrl;

  // 3. Fallback to PC stream if PC is connected
  if (isServerConnected()) {
    return `${getServerUrl()}/api/stream?id=${encodeURIComponent(videoId)}`;
  }

  // 4. Piped fallback
  const pipedUrl = await resolveViaPiped(videoId);
  if (pipedUrl) return pipedUrl;

  return null;
}

