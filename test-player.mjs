async function testYouTubePlayer(videoId) {
  const url = "https://www.youtube.com/youtubei/v1/player";
  // Test with Android client
  const body = {
    videoId,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.09.37",
        androidSdkVersion: 30,
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
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log("Player status:", res.status);
    console.log("Playability status:", data?.playabilityStatus?.status);
    
    const formats = data?.streamingData?.adaptiveFormats || [];
    console.log("Adaptive formats count:", formats.length);
    
    // Find audio format with direct url
    const audioWithUrl = formats.find((f) => f.mimeType?.includes("audio") && f.url);
    if (audioWithUrl) {
      console.log("FOUND DIRECT AUDIO URL!");
      console.log("Mime:", audioWithUrl.mimeType);
      console.log("URL:", audioWithUrl.url.slice(0, 100) + "...");
      return audioWithUrl.url;
    }

    const anyAudio = formats.find((f) => f.mimeType?.includes("audio"));
    if (anyAudio) {
      console.log("Audio found but has signatureCipher / cipher?", !!anyAudio.signatureCipher || !!anyAudio.cipher);
    }
  } catch (e) {
    console.error("Player error:", e.message);
  }

  // Test iOS client
  try {
    console.log("Testing iOS client...");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 17_4 like Mac OS X)",
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "IOS",
            clientVersion: "19.09.3",
            deviceModel: "iPhone14,3",
            hl: "en",
            gl: "US",
          },
        },
      }),
    });
    const data = await res.json();
    const formats = data?.streamingData?.adaptiveFormats || [];
    const audioWithUrl = formats.find((f) => f.mimeType?.includes("audio") && f.url);
    if (audioWithUrl) {
      console.log("FOUND DIRECT AUDIO URL ON IOS!");
      console.log("Mime:", audioWithUrl.mimeType);
      console.log("URL:", audioWithUrl.url.slice(0, 100) + "...");
      return audioWithUrl.url;
    }
  } catch (e) {
    console.error("iOS error:", e.message);
  }

  return null;
}

testYouTubePlayer("H3Kzh6RrnMc");

