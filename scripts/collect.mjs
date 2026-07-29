import { readFile, writeFile } from "node:fs/promises";

const accountsPath = new URL("../data/accounts.json", import.meta.url);
const snapshotsPath = new URL("../data/snapshots.json", import.meta.url);
const accounts = JSON.parse(await readFile(accountsPath, "utf8"));

let snapshotData = { lastRunAt: null, profiles: [] };
try {
  snapshotData = JSON.parse(await readFile(snapshotsPath, "utf8"));
} catch {
  // The first run starts a new snapshot file.
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const previousById = new Map((snapshotData.profiles || []).map(profile => [profile.id, profile]));

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseCount(value) {
  const normalized = value.replace(/,/g, "").trim().toUpperCase();
  const suffix = normalized.at(-1);
  const multiplier = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  const number = Number.parseFloat(multiplier === 1 ? normalized : normalized.slice(0, -1));
  if (!Number.isFinite(number)) throw new Error(`Could not parse public count: ${value}`);
  return Math.round(number * multiplier);
}

function findDescription(html) {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return null;
}

async function collectInstagram(account) {
  const handle = account.handle.replace(/^@/, "");
  const response = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
    }
  });
  if (!response.ok) throw new Error(`Instagram returned HTTP ${response.status}`);
  const description = findDescription(await response.text());
  if (!description) throw new Error("Instagram did not expose a public description");
  const counts = description.match(/([\d,.]+(?:[KMB])?)\s+Followers,\s*([\d,.]+(?:[KMB])?)\s+Following,\s*([\d,.]+(?:[KMB])?)\s+Posts/i);
  if (!counts) throw new Error("Public counts were not readable");
  return {
    followers: parseCount(counts[1]),
    following: parseCount(counts[2]),
    postCount: parseCount(counts[3])
  };
}

async function collect(account) {
  if (account.platform === "Instagram") return collectInstagram(account);
  throw new Error(`${account.platform} collection is not configured yet`);
}

const profiles = [];
for (const account of accounts) {
  const previous = previousById.get(account.id) || {};
  try {
    const counts = await collect(account);
    const history = [...(previous.history || [])];
    const entry = { date: today, ...counts };
    const sameDayIndex = history.findIndex(item => item.date === today);
    if (sameDayIndex >= 0) history[sameDayIndex] = entry;
    else history.push(entry);
    profiles.push({
      id: account.id,
      platform: account.platform,
      handle: account.handle,
      status: "ok",
      lastCheckedAt: now.toISOString(),
      ...counts,
      history: history.slice(-180)
    });
    console.log(`${account.handle}: ${counts.followers} followers, ${counts.postCount} posts`);
  } catch (error) {
    profiles.push({
      ...previous,
      id: account.id,
      platform: account.platform,
      handle: account.handle,
      status: "delayed",
      lastAttemptAt: now.toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    console.warn(`${account.handle}: ${error instanceof Error ? error.message : error}`);
  }
}

await writeFile(snapshotsPath, `${JSON.stringify({ lastRunAt: now.toISOString(), profiles }, null, 2)}\n`);
