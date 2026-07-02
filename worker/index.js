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

    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const dataPath = env.DATA_PATH || DATA_PATH_DEFAULT;
    const branch = env.GITHUB_BRANCH || BRANCH_DEFAULT;

    try {
      // 1. Fetch current file (to get its sha + contents)
      const getRes = await githubRequest(env, `${dataPath}?ref=${branch}`);

      let subscribers = [];
      let sha;

      if (getRes.status === 200) {
        const fileData = await getRes.json();
        sha = fileData.sha;
        subscribers = JSON.parse(base64Decode(fileData.content));
      } else if (getRes.status !== 404) {
        throw new Error(`GitHub read failed: ${getRes.status}`);
      }

      if (subscribers.some((s) => s.email === email)) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      subscribers.push({ email, subscribedAt: new Date().toISOString() });

      // 2. Write the updated file back
      const putRes = await githubRequest(env, dataPath, {
        method: "PUT",
        body: JSON.stringify({
          message: `Add subscriber`,
          content: base64Encode(JSON.stringify(subscribers, null, 2)),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const errBody = await putRes.text();
        throw new Error(`GitHub write failed: ${putRes.status} ${errBody}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Could not save signup" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  },
};
