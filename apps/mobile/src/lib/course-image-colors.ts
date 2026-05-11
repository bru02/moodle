import Color from "color";
import { getColors, type ImageColorsResult } from "react-native-image-colors";

const FALLBACK_HUE = 211;
const FALLBACK_COLOR = "#2F80ED";
const BASE_LIGHTNESS = 48;
const LIGHTER_LIGHTNESS = 64;
const SATURATION = 72;
const colorCache = new Map<string, Promise<number>>();

export function getCourseIconTint(input: {
  hue: number;
  seminarGroup: string | undefined;
}) {
  const lightness = startsWithSeminarGroupG(input.seminarGroup) ? LIGHTER_LIGHTNESS : BASE_LIGHTNESS;

  return Color.hsl(input.hue, SATURATION, lightness).hex();
}

export async function getCourseImageHue(imageUrl: string | undefined) {
  if (!imageUrl) return FALLBACK_HUE;

  let promise = colorCache.get(imageUrl);
  if (!promise) {
    promise = resolveCourseImageHue(imageUrl).catch(() => FALLBACK_HUE);
    colorCache.set(imageUrl, promise);
  }

  return promise;
}

async function resolveCourseImageHue(imageUrl: string) {
  if (/\.svg(?:[?#]|$)/i.test(imageUrl)) {
    const svgHue = await extractSvgHue(imageUrl);
    return svgHue ?? FALLBACK_HUE;
  }

  const colors = await getColors(imageUrl, {
    fallback: FALLBACK_COLOR,
    cache: true,
    key: imageUrl,
    pixelSpacing: 8,
    quality: "low",
  });
  return Color(pickImageColor(colors)).hsl().hue();
}

async function extractSvgHue(imageUrl: string) {
  const response = await fetch(imageUrl);
  const text = await response.text();
  if (!/<svg[\s>]/i.test(text)) return undefined;

  return pickMainHueFromSvg(text);
}

function pickMainHueFromSvg(svg: string) {
  const backgroundFill = svg.match(/<rect\b(?=[^>]*\bwidth=["']100%["'])(?=[^>]*\bheight=["']100%["'])[^>]*\bfill=["']([^"']+)["']/i)?.[1];
  return backgroundFill ? parseCssColorHue(backgroundFill) : undefined;
}

function parseCssColorHue(value: string) {
  if (!value) return undefined;
  const color = value.trim();
  if (!color || color === "none" || color === "currentColor") return undefined;

  try {
    return Color(color).hsl().hue();
  } catch {
    return undefined;
  }
}

function pickImageColor(colors: ImageColorsResult) {
  switch (colors.platform) {
    case "ios":
      return colors.primary || colors.background || colors.detail || FALLBACK_COLOR;
    case "android":
      return colors.dominant || colors.vibrant || colors.average || FALLBACK_COLOR;
    case "web":
      return colors.dominant || colors.vibrant || FALLBACK_COLOR;
  }
}

function startsWithSeminarGroupG(seminarGroup: string | undefined) {
  return seminarGroup?.trim().toLocaleUpperCase("hu-HU").startsWith("G") ?? false;
}
