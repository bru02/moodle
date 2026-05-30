const tokenPairPattern = /^([a-f0-9]{32}):([A-Za-z0-9]{64})$/;

export function parsePasswordTokenPair(password: string): {
  token: string;
  privateToken: string;
} | null {
  const match = tokenPairPattern.exec(password);
  if (!match?.[1] || !match[2]) return null;

  return {
    token: match[1],
    privateToken: match[2],
  };
}
