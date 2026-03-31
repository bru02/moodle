import { useMemo } from "react";
import { Text, View } from "react-native";
import type {
  LiteElement,
  LiteNode,
} from "react-native-mathjax-html-to-svg/mathjax/adaptors/lite/Element";
import { SvgFromXml } from "react-native-svg";
import { mathjax } from "react-native-mathjax-html-to-svg/mathjax/mathjax";
import { liteAdaptor } from "react-native-mathjax-html-to-svg/mathjax/adaptors/liteAdaptor";
import { RegisterHTMLHandler } from "react-native-mathjax-html-to-svg/mathjax/handlers/html";
import { AllPackages } from "react-native-mathjax-html-to-svg/mathjax/input/tex/AllPackages";
import { TeX } from "react-native-mathjax-html-to-svg/mathjax/input/tex";
import { SVG } from "react-native-mathjax-html-to-svg/mathjax/output/svg";

import "react-native-mathjax-html-to-svg/mathjax/util/entities/all.js";

const adaptor = liteAdaptor();
const packageList = AllPackages.sort().join(", ").split(/\s*,\s*/);

RegisterHTMLHandler(adaptor);

type MoodleMathProps = {
  latex: string;
  color: string;
  fontSize: number;
  display?: boolean;
};

export function MoodleMath({ latex, color, fontSize, display = false }: MoodleMathProps) {
  const svgXml = useMemo(() => {
    try {
      return renderMathSvgXml({ latex, color, fontSize });
    } catch {
      return null;
    }
  }, [color, fontSize, latex]);

  if (!latex) {
    return null;
  }

  if (!svgXml) {
    return display ? (
      <Text selectable style={{ color, fontSize, lineHeight: Math.round(fontSize * 1.4) }}>
        {latex}
      </Text>
    ) : (
      <Text style={{ color, fontSize }}>{latex}</Text>
    );
  }

  if (display) {
    return (
      <View style={{ marginVertical: 8 }}>
        <Text>
          <SvgFromXml xml={svgXml} />
        </Text>
      </View>
    );
  }

  return (
    <Text>
      <SvgFromXml xml={svgXml} />
    </Text>
  );
}

function renderMathSvgXml(input: { latex: string; color: string; fontSize: number }) {
  const tex = new TeX({
    packages: packageList,
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    processEscapes: true,
  });
  const svg = new SVG({
    fontCache: "local",
    mtextInheritFont: true,
    merrorInheritFont: true,
  });
  const html = mathjax.document(input.latex, {
    InputJax: tex,
    OutputJax: svg,
    renderActions: { assistiveMml: [] },
  });

  html.render();

  const body = adaptor.body(html.document);
  const mathNode = adaptor
    .childNodes(body)
    .find((node): node is LiteElement => isMathContainer(node));
  if (!mathNode) {
    return null;
  }

  let svgXml = adaptor.innerHTML(mathNode);
  const [width, height] = getSvgScale(svgXml);
  svgXml = svgXml.replace(/font-family="([^"]*)"/gim, "");
  svgXml = applySvgScale(svgXml, [width * (input.fontSize / 2), height * (input.fontSize / 2)]);
  svgXml = svgXml.replace(/currentColor/gim, input.color);

  return svgXml;
}

function isMathContainer(node: LiteNode) {
  return adaptor.kind(node) === "mjx-container";
}

function getSvgScale(svgXml: string) {
  const svgTag = svgXml.match(/<svg([^>]+)>/i)?.[0] ?? "";
  const [, width = "0", height = "0"] =
    svgTag.match(/width="([\d.]+)[ep]x".*height="([\d.]+)[ep]x"/i) ?? [];

  return [Number.parseFloat(width), Number.parseFloat(height)];
}

function applySvgScale(svgXml: string, [width, height]: [number, number]) {
  return svgXml
    .replace(/(<svg[^>]+height=")([\d.]+)([ep]x"[^>]*>)/i, `$1${height}$3`)
    .replace(/(<svg[^>]+width=")([\d.]+)([ep]x"[^>]*>)/i, `$1${width}$3`)
    .replace(/(<svg[^>]+width=")(0+[ep]?x?)("[^>]*>)/i, '$10$3')
    .replace(/(<svg[^>]+height=")(0+[ep]?x?)("[^>]*>)/i, '$10$3');
}
