async function findWorkingStream(videoId) {
  const instances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.tokhmi.xyz",
    "https://piped-api.lunar.icu",
    "https://api.piped.projectsegfau.lt",
    "https://pipedapi.leptons.xyz",
    "https://inv.nadeko.net/api/v1/videos/",
    "https://invidious.nerdvpn.de/api/v1/videos/",
    "https://vid.puffyan.us/api/v1/videos/",
    "https://invidious.jing.rocks/api/v1/videos/",
    "https://yewtu.be/api/v1/videos/",
  ];

  for (const url of instances) {
    try {
      console.log("Checking:", url);
      const endpoint = url.includes("videos") ? `${url}${videoId}` : `${url}/streams/${videoId}`;
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(4000),
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (res.ok) {
        const data = await res.json();
        // check piped
        if (data.audioStreams) {
          const audio = data.audioStreams.find((s) => s.url);
          if (audio?.url) {
            console.log("SUCCESS PIPED on", url, "URL:", audio.url.slice(0, 60));
            return audio.url;
          }
        }
        // check invidious
        if (data.adaptiveFormats) {
          const audio = data.adaptiveFormats.find((f) => f.type?.includes("audio") && f.url);
          if (audio?.url) {
            console.log("SUCCESS INVIDIOUS on", url, "URL:", audio.url.slice(0, 60));
            return audio.url;
          }
        }
      }
    } catch (e) {
      console.log("Failed:", url, e.message);
    }
  }
  return null;
}

findWorkingStream("H3Kzh6RrnMc");

