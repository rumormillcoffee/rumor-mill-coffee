// Cloudflare Worker: receives email signups and commits them to a JSON
// file in this GitHub repo via the Contents API. No third-party form
// service — the data lives in your own repo.
//
// Required Worker secrets/vars (set with `wrangler secret put ...` or in
// the Cloudflare dashboard):
//   GITHUB_TOKEN   - a GitHub Personal Access Token with `contents:write`
//                    (fine-grained, scoped to this one repo)
//   GITHUB_REPO    - "your-username/rumor-mill-coffee"
//   ALLOWED_ORIGIN - "https://your-username.github.io"
//
// Optional vars (defaults shown):
//   GITHUB_BRANCH  - "main"
//   DATA_PATH      - "data/subscribers.json"

const DATA_PATH_DEFAULT = "data/subscribers.json";
const BRANCH_DEFAULT = "main";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidReferralCode(code) {
  return typeof code === "string" && /^[a-z0-9]{6,12}$/.test(code);
}

function generateReferralCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => (b % 36).toString(36))
    .join("");
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function githubRequest(env, path, options = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "rumor-mill-coffee-worker",
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function readSubscribers(env, dataPath, branch) {
  const getRes = await githubRequest(env, `${dataPath}?ref=${branch}`);

  if (getRes.status === 200) {
    const fileData = await getRes.json();
    return { subscribers: JSON.parse(base64Decode(fileData.content)), sha: fileData.sha };
  }
  if (getRes.status === 404) {
    return { subscribers: [], sha: undefined };
  }
  throw new Error(`GitHub read failed: ${getRes.status}`);
}

async function writeSubscribers(env, dataPath, branch, subscribers, sha, message) {
  const putRes = await githubRequest(env, dataPath, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: base64Encode(JSON.stringify(subscribers, null, 2)),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errBody = await putRes.text();
    throw new Error(`GitHub write failed: ${putRes.status} ${errBody}`);
  }
}

async function handleSubscribe(body, env, dataPath, branch, headers) {
  const email = (body.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "Invalid email address" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const referredBy = isValidReferralCode(body.referredBy) ? body.referredBy : null;
  const { subscribers, sha } = await readSubscribers(env, dataPath, branch);

  const existing = subscribers.find((s) => s.email === email);
  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true, referralCode: existing.referralCode }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const referralCode = generateReferralCode();
  subscribers.push({
    email,
    subscribedAt: new Date().toISOString(),
    referralCode,
    referredBy,
    referralClicks: 0,
  });
  await writeSubscribers(env, dataPath, branch, subscribers, sha, "Add subscriber");

  return new Response(JSON.stringify({ ok: true, referralCode }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleRefClick(body, env, dataPath, branch, headers) {
  const code = body.code;
  if (!isValidReferralCode(code)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { subscribers, sha } = await readSubscribers(env, dataPath, branch);
  const referrer = subscribers.find((s) => s.referralCode === code);

  if (referrer) {
    referrer.referralClicks = (referrer.referralClicks || 0) + 1;
    await writeSubscribers(env, dataPath, branch, subscribers, sha, "Record referral click");
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handlePreferences(body, env, dataPath, branch, headers) {
  const email = (body.email || "").trim().toLowerCase();
  const flavors = Array.isArray(body.flavors) ? body.flavors.filter((f) => typeof f === "string") : [];

  if (!isValidEmail(email) || flavors.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { subscribers, sha } = await readSubscribers(env, dataPath, branch);
  const subscriber = subscribers.find((s) => s.email === email);

  if (!subscriber) {
    return new Response(JSON.stringify({ error: "Subscriber not found" }), {
      status: 404,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  subscriber.flavorProfile = flavors;
  await writeSubscribers(env, dataPath, branch, subscribers, sha, "Update flavor preferences");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const dataPath = env.DATA_PATH || DATA_PATH_DEFAULT;
    const branch = env.GITHUB_BRANCH || BRANCH_DEFAULT;
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/preferences") {
        return await handlePreferences(body, env, dataPath, branch, headers);
      }
      if (pathname === "/ref-click") {
        return await handleRefClick(body, env, dataPath, branch, headers);
      }
      return await handleSubscribe(body, env, dataPath, branch, headers);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Could not save data" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  },
};
