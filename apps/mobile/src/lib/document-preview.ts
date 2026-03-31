import { Alert, Platform } from "react-native";

import { viewDocument } from "@react-native-documents/viewer";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { openExternalUrl } from "@/lib/browser";

type PreviewRemoteDocumentInput = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

export async function previewRemoteDocument(input: PreviewRemoteDocumentInput) {
  if (Platform.OS === "web") {
    await openExternalUrl(input.url);
    return;
  }

  const localFile = await ensureCachedDocument(input);

  try {
    await viewDocument({
      uri: localFile.uri,
      mimeType: input.mimeType,
      headerTitle: input.fileName,
      presentationStyle: "fullScreen",
    });
  } catch {
    Alert.alert("Unable to preview file", "This file could not be opened in the document viewer.");
  }
}

async function ensureCachedDocument(input: PreviewRemoteDocumentInput) {
  const extension = getFileExtension(input.fileName, input.url);
  const fileKey = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input.url);
  const cacheDirectory = new Directory(Paths.cache, "document-previews");
  const localFile = new File(cacheDirectory, `${fileKey}${extension}`);

  if (localFile.exists) {
    return localFile;
  }

  cacheDirectory.create({ idempotent: true, intermediates: true });

  return await File.downloadFileAsync(input.url, localFile, {
    idempotent: true,
  });
}

function getFileExtension(fileName: string | undefined, url: string) {
  const fileNameExtension = extractExtension(fileName);
  if (fileNameExtension) {
    return fileNameExtension;
  }

  try {
    const parsedUrl = new URL(url);
    return extractExtension(parsedUrl.pathname) ?? "";
  } catch {
    return "";
  }
}

function extractExtension(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.split("?")[0]?.split("#")[0] ?? value;
  const match = normalizedValue.match(/(\.[A-Za-z0-9_-]+)$/);
  return match?.[1]?.toLowerCase();
}
