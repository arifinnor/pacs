const ORTHANC_URL = process.env.ORTHANC_INTERNAL_URL || "http://orthanc:8042";
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || "admin";
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || "";

function getOrthancHeaders(): HeadersInit {
  const credentials = Buffer.from(
    `${ORTHANC_USERNAME}:${ORTHANC_PASSWORD}`
  ).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json",
  };
}

export async function orthancFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${ORTHANC_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...getOrthancHeaders(),
      ...options?.headers,
    },
    cache: "no-store",
  });
}

export async function orthancFetchRaw(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${ORTHANC_URL}${path}`;
  const credentials = Buffer.from(
    `${ORTHANC_USERNAME}:${ORTHANC_PASSWORD}`
  ).toString("base64");
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      ...options?.headers,
    },
    cache: "no-store",
  });
}
