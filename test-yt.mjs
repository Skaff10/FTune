async function testInnerTubeSearch(query) {
  const url = "https://music.youtube.com/youtubei/v1/search";
  const body = {
    query,
    params: "EgWKAQIIAWoKEAkQChAFEAMQBA==", // Filter: Songs
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20240401.01.00",
        hl: "en",
        gl: "US",
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("Status:", res.status);
  
  // Parse contents
  const sectionList = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
  console.log("Section list count:", sectionList?.length);
  
  const songs = [];
  if (sectionList) {
    for (const sec of sectionList) {
      const items = sec?.musicShelfRenderer?.contents;
      if (items) {
        for (const item of items) {
          const renderer = item?.musicResponsiveListItemRenderer;
          if (renderer) {
            const flexColumns = renderer?.flexColumns;
            const title = flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const artist = flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const videoId = renderer?.playlistItemData?.videoId || renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
            const thumb = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
            if (title && videoId) {
              songs.push({ id: videoId, title, artist: artist || "Unknown", thumb });
            }
          }
        }
      }
    }
  }

  console.log("Parsed songs:", songs.length);
  console.log("First song:", songs[0]);
}

testInnerTubeSearch("coldplay");

