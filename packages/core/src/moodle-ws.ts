type Primitive = string | number | boolean;

export async function callMoodleWS<T>(params: {
  origin: string;
  token: string;
  wsfunction: string;
  requestParams?: Record<string, Primitive>;
}): Promise<T> {
  const { origin, token, wsfunction, requestParams = {} } = params;
  const query = new URLSearchParams({
    wsfunction,
    wstoken: token,
    moodlewssettinglang: "en",
    moodlewsrestformat: "json",
  });

  for (const [key, value] of Object.entries(requestParams)) {
    query.set(key, String(value));
  }

  const url = `${origin.replace(/\/$/, "")}/webservice/rest/server.php?${query.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${wsfunction}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as T & {
    exception?: string;
    message?: string;
  };
  if (payload && typeof payload === "object" && (payload.exception || payload.message)) {
    throw new Error(`Moodle WS error for ${wsfunction}: ${payload.message || payload.exception}`);
  }

  return payload;
}
