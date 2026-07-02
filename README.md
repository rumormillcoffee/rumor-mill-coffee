# Rumor Mill Coffee — splash page

Static splash page with an email-capture form that writes straight into
this repo's `data/subscribers.json` via a small Cloudflare Worker — no
third-party form service involved.

## Structure

- `index.html`, `css/style.css`, `js/main.js` — the splash page (static,
  deployed via GitHub Pages)
- `worker/` — the Cloudflare Worker that handles `POST /subscribe` and
  commits new emails to `data/subscribers.json` using the GitHub API
- `data/subscribers.json` — the growing list of signups (email + timestamp)

## 1. Add the background image

Drop your grainy black-and-white stock photo at `assets/bg.jpg`, then in
`css/style.css` replace the `.bg` gradient with:

```css
.bg {
  background: url('../assets/bg.jpg') center/cover no-repeat;
}
```

(Keep or drop the grayscale/contrast filter and grain overlay to taste —
they're separate rules right below `.bg`.)

## 2. Deploy the splash page to GitHub Pages

```bash
cd ~/rumor-mill-coffee
git init
git add .
git commit -m "Initial splash page"
gh repo create rumor-mill-coffee --public --source=. --remote=origin --push
```

Then in the repo's Settings → Pages, set the source to the `main` branch,
root folder.

## 3. Deploy the Worker (email capture)

Requires a free Cloudflare account and the `wrangler` CLI (`npm i -g
wrangler`).

```bash
cd worker
wrangler login
wrangler secret put GITHUB_TOKEN     # fine-grained PAT, contents:write on this repo only
wrangler secret put GITHUB_REPO      # e.g. your-username/rumor-mill-coffee
wrangler secret put ALLOWED_ORIGIN   # e.g. https://your-username.github.io
wrangler deploy
```

Copy the deployed `*.workers.dev` URL and paste it into
`js/main.js` as `SUBSCRIBE_ENDPOINT`, then commit and push.

## Notes

- The form has a hidden honeypot field for basic bot filtering — no
  CAPTCHA needed for a low-traffic splash page.
- The Worker de-dupes by email before committing.
- If you outgrow "append to a JSON file," swapping the Worker's storage
  for Supabase/Airtable/etc. later is a small, isolated change — the
  front end doesn't need to know.
