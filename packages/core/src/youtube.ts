const youtubeVideoIdPattern = /^[\w-]{11}$/;

export function getYouTubeThumbnail(src: string): string | null {
  const videoId = getYouTubeVideoId(src);
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeVideoId(src: string): string | null {
  try {
    const url = new URL(src, "https://example.invalid");
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return normalizeYouTubeVideoId(url.pathname.slice(1));
    }

    if (
      !["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(
        hostname,
      )
    ) {
      return null;
    }

    if (url.pathname.startsWith("/embed/")) {
      return normalizeYouTubeVideoId(url.pathname.split("/")[2]);
    }

    if (url.pathname === "/watch") {
      return normalizeYouTubeVideoId(url.searchParams.get("v"));
    }

    if (
      url.pathname.startsWith("/shorts/") ||
      url.pathname.startsWith("/live/")
    ) {
      return normalizeYouTubeVideoId(url.pathname.split("/")[2]);
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeYouTubeVideoId(value: string | null | undefined) {
  if (!value) return null;
  return youtubeVideoIdPattern.test(value) ? value : null;
}
