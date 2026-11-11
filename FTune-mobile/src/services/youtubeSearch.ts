import type { SearchFilter, SearchResults, Track } from "../types";

const SEARCH_FILTER_PARAMS: Record<string, string | null> = {
  all: null,
  songs: "EgWKAQIIAWoKEAkQChAFEAMQBA==",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgWKAQIoAWoKEAkQChAFEAMQBA==",
};

export async function directYouTubeMusicSearch(
  query: string,
  filter: SearchFilter = "all"
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { songs: [] };

  const url = "https://music.youtube.com/youtubei/v1/search";
  const params = SEARCH_FILTER_PARAMS[filter] ?? null;

  const body = {
    query: q,
    ...(params ? { params } : {}),
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20240401.01.00",
        hl: "en",
        gl: "US",
      },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`YouTube Music search failed with status ${res.status}`);
    }

    const data = await res.json();
    const songs: Track[] = [];
    const seenIds = new Set<string>();

    // Parse tabs -> sectionListRenderer
    const sectionList =
      data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
        ?.sectionListRenderer?.contents || [];

    for (const sec of sectionList) {
      const parentCardArtist = sec?.musicCardShelfRenderer?.title?.runs?.[0]?.text || "";

      // Support musicShelfRenderer, itemSectionRenderer, and musicCardShelfRenderer
      const shelfContents = [
        ...(sec?.musicShelfRenderer?.contents || []),
        ...(sec?.itemSectionRenderer?.contents || []),
        ...(sec?.musicCardShelfRenderer?.contents || []),
      ];

      for (const item of shelfContents) {
        const renderer = item?.musicResponsiveListItemRenderer;
        if (!renderer) continue;

        const flexColumns = renderer?.flexColumns || [];
        // Col 0: Title
        const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const title = titleRuns.map((r: any) => r.text).join("").trim() || "Unknown Title";

        // Col 1: Artist, Album, Duration
        const metaRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const metaTexts = metaRuns.map((r: any) => r.text);

        // Find true artist: check for browseEndpoint with artist/channel type
        let artist = "";
        for (const run of metaRuns) {
          const pageType =
            run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
              ?.browseEndpointContextMusicConfig?.pageType;
          if (pageType === "MUSIC_PAGE_TYPE_ARTIST" || pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL") {
            artist = run.text;
            break;
          }
        }
        if (!artist) {
          const filtered = metaTexts.filter(
            (t: string) => t !== "Song" && t !== "Video" && t !== " • " && !/^\d+:\d+$/.test(t.trim())
          );
          artist = filtered[0] || parentCardArtist || "YouTube Music";
        }

        // Duration parsing (find first MM:SS match)
        let duration = 0;
        for (const t of metaTexts) {
          if (/^\d+:\d+$/.test(t.trim())) {
            const parts = t.trim().split(":");
            duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            break;
          }
        }

        // Video ID
        const videoId =
          renderer?.playlistItemData?.videoId ||
          renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
            ?.playNavigationEndpoint?.watchEndpoint?.videoId ||
          renderer?.navigationEndpoint?.watchEndpoint?.videoId;

        // Thumbnail
        const thumbs = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const bestThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : "";

        // Explicit badge
        const explicit =
          Array.isArray(renderer?.badges) &&
          renderer.badges.some((b: any) =>
            b?.musicInlineBadgeRenderer?.accessibilityData?.label?.includes("Explicit")
          );

        if (videoId && title && !seenIds.has(videoId)) {
          seenIds.add(videoId);
          songs.push({
            id: videoId,
            title,
            artist,
            duration,
            thumb: bestThumb,
            explicit,
          });
        }
      }
    }

    return { songs };
  } catch (err) {
    console.warn("[directYouTubeMusicSearch] error:", err);
    return { songs: [] };
  }
}
