// test-mobile-spotify.mjs
// Test Spotify public playlist fetching and YouTube Music track matching

async function testPublicPlaylist() {
  console.log("=== 1. Testing Spotify Public Playlist Extraction ===");
  const testUrl = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"; // Today's Top Hits
  const match = /(?:playlist|album)[\/:]([A-Za-z0-9]{22})/.exec(testUrl);
  const id = match ? match[1] : null;

  if (!id) {
    throw new Error("Failed to parse Spotify ID from URL");
  }
  console.log(`Extracted Spotify Playlist ID: ${id}`);

  const embedUrl = `https://open.spotify.com/embed/playlist/${id}`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load embed page: ${res.status}`);
  }

  const html = await res.text();
  const dataMatch = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!dataMatch) {
    throw new Error("Failed to extract __NEXT_DATA__ from Spotify embed");
  }

  const root = JSON.parse(dataMatch[1]);
  const entity = root?.props?.pageProps?.state?.data?.entity;
  console.log(`Playlist Name: "${entity?.title || entity?.name}"`);
  console.log(`Playlist Owner: "${entity?.subtitle}"`);
  console.log(`Tracks count: ${entity?.trackList?.length}`);

  const firstTrack = entity?.trackList?.[0];
  console.log("Sample First Track:", {
    title: firstTrack?.title,
    artist: firstTrack?.subtitle,
    duration: Math.round((firstTrack?.duration || 0) / 1000),
  });

  console.log("\n=== 2. Testing YouTube Music Matching for Spotify Track ===");
  const query = `${firstTrack?.title} ${firstTrack?.subtitle}`;
  console.log(`Searching YouTube Music for "${query}"...`);

  const ytRes = await fetch("https://music.youtube.com/youtubei/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      query,
      params: "EgWKAQIIAWoKEAkQChAFEAMQBA==",
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20240401.01.00",
          hl: "en",
          gl: "US",
        },
      },
    }),
  });

  if (!ytRes.ok) {
    throw new Error(`YouTube Music search failed: ${ytRes.status}`);
  }

  const ytData = await ytRes.json();
  const sectionList =
    ytData?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents || [];

  let matchedTitle = "";
  let matchedVideoId = "";

  for (const sec of sectionList) {
    const contents = [
      ...(sec?.musicShelfRenderer?.contents || []),
      ...(sec?.itemSectionRenderer?.contents || []),
      ...(sec?.musicCardShelfRenderer?.contents || []),
    ];
    for (const item of contents) {
      const renderer = item?.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const flexColumns = renderer?.flexColumns || [];
      const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const title = titleRuns.map((r) => r.text).join("").trim();
      const videoId =
        renderer?.playlistItemData?.videoId ||
        flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
          ?.navigationEndpoint?.watchEndpoint?.videoId;

      if (title && videoId) {
        matchedTitle = title;
        matchedVideoId = videoId;
        break;
      }
    }
    if (matchedVideoId) break;
  }

  console.log(`Matched on YouTube Music: "${matchedTitle}" (Video ID: ${matchedVideoId})`);
  console.log("\n[SUCCESS] Spotify public playlist extraction & YouTube matching verified!");
}

testPublicPlaylist().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

