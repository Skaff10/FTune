async function testStream(videoId) {
  // Try Piped instances
  const instances = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
    "https://piped-api.lunar.icu",
    "https://cf.pipedapi.kavin.rocks",
  ];

  for (const inst of instances) {
    try {
      console.log("Trying instance:", inst);
      const res = await fetch(`${inst}/streams/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const audio = data?.audioStreams?.find((s) => s.mimeType?.includes("mp4") || s.mimeType?.includes("audio"));
        if (audio?.url) {
          console.log("SUCCESS! Found stream URL from", inst);
          console.log("Audio URL:", audio.url.slice(0, 80) + "...");
          console.log("Bitrate:", audio.bitrate);
          return audio.url;
        }
      }
    } catch (e) {
      console.log("Failed instance:", inst, e.message);
    }
  }

  // Also test Invidious
  try {
    console.log("Trying Invidious...");
    const res = await fetch(`https://inv.tux.pizza/api/v1/videos/${videoId}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const format = data?.adaptiveFormats?.find((f) => f.type?.includes("audio/mp4"));
      if (format?.url) {
        console.log("SUCCESS! Invidious audio URL found!");
        return format.url;
      }
    }
  } catch (e) {
    console.log("Invidious failed:", e.message);
  }

  return null;
}

testStream("H3Kzh6RrnMc");

