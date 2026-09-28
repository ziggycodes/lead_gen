// Free contact scraper. Given a business website, fetches the homepage and a
// couple of likely contact pages, then extracts emails and LinkedIn profile
// links from the HTML. No API key, no cost. Used by BOTH the CLI and the web
// server via runSearch.js. Never throws: returns empty arrays on any failure.

const REQUEST_TIMEOUT_MS = 6000;
const MAX_BYTES = 500 * 1024; // 500KB response cap
const MAX_EXTRA_PAGES = 2; // contact/about pages beyond the homepage
const USER_AGENT =
  "LeadScoutBot/1.0 (+https://leadscout.app; contact discovery for outreach)";

// Role inboxes worth surfacing, in rough priority order.
const ROLE_LOCALS = [
  "info",
  "contact",
  "hello",
  "office",
  "frontdesk",
  "front.desk",
  "reception",
  "admin",
  "sales",
  "enquiries",
  "inquiries",
  "support",
];

// Local-parts / domains that indicate a non-human, placeholder, or vendor
// address we never want to surface.
const JUNK_LOCALS = [/^no-?reply$/i, /^donotreply$/i, /^postmaster$/i, /^abuse$/i];
const JUNK_DOMAINS = [
  "sentry.io",
  "wixpress.com",
  "wix.com",
  "example.com",
  "example.org",
  "godaddy.com",
  "secureserver.net",
  "squarespace.com",
  "sentry-next.wixpress.com",
  "domain.com",
  "yourdomain.com",
  "email.com",
  "test.com",
];
// Image/asset extensions that a naive email regex picks up from filenames like
// "logo@2x.png" or "hero@2x.jpg".
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|mp4|pdf)$/i;

// Note: `/` is intentionally excluded from the local part. RFC 5321 permits it,
// but in scraped HTML it only ever appears when the regex bleeds into a URL
// path (e.g. ".../maplibre-gl@3.x"), producing garbage matches.
const EMAIL_RE = /[a-z0-9!#$%&'*+=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

// A real domain ends in an alphabetic TLD of at least two characters. Rejects
// version-string false positives like "3.x".
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function normalizeUrl(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).toString();
  } catch {
    return "";
  }
}

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Fetch a single URL with a timeout and size cap. Returns HTML text or "".
async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") || "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) return "";

    // Read with a byte cap so we never buffer a giant page.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.slice(0, MAX_BYTES * 2);
    }
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (received >= MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
    }
    return html;
  } catch {
    return "";
  }
}

// Pull all href values out of raw HTML (best-effort, no DOM).
function extractHrefs(html) {
  const hrefs = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

// Resolve a possibly-relative href against a base URL. Returns "" on failure.
function resolveHref(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

// Decide whether an extracted string is a usable business email.
function isUsableEmail(email) {
  const e = email.toLowerCase();
  if (ASSET_EXT.test(e)) return false;
  const at = e.indexOf("@");
  if (at <= 0) return false;
  const local = e.slice(0, at).replace(/^[.-]+/, "");
  const domain = e.slice(at + 1);
  if (!DOMAIN_RE.test(domain)) return false;
  if (!local) return false;
  if (JUNK_LOCALS.some((re) => re.test(local))) return false;
  if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  // Sentry / analytics keys often look like "<hash>@sentry.io" — already caught
  // above; also reject absurdly long local parts (tracking blobs).
  if (local.length > 64) return false;
  return true;
}

// Rank emails: same-domain as the site first, then role inboxes, then the rest.
function rankEmails(emails, siteHost) {
  const scored = emails.map((email) => {
    const domain = email.slice(email.indexOf("@") + 1).toLowerCase();
    const local = email.slice(0, email.indexOf("@")).toLowerCase();
    let score = 0;
    if (siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`))) score += 100;
    if (ROLE_LOCALS.includes(local)) score += 10;
    return { email, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.email);
}

// Extract emails from a chunk of HTML: mailto: hrefs first (highest signal),
// then a text regex over the whole document.
function extractEmails(html) {
  const found = new Set();

  const mailtoRe = /href\s*=\s*["']mailto:([^"'?]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html)) !== null) {
    const decoded = decodeURIComponent(m[1].trim());
    if (decoded) found.add(decoded.toLowerCase());
  }

  const bodyMatches = html.match(EMAIL_RE) || [];
  for (const raw of bodyMatches) {
    found.add(raw.toLowerCase());
  }

  return [...found].filter(isUsableEmail);
}

// Extract LinkedIn profile (/in/) and company (/company/) URLs from HTML.
function extractLinkedIn(html) {
  const profiles = new Set();
  const companies = new Set();
  for (const href of extractHrefs(html)) {
    if (!/linkedin\.com/i.test(href)) continue;
    let u;
    try {
      u = new URL(href, "https://www.linkedin.com");
    } catch {
      continue;
    }
    const path = u.pathname.toLowerCase();
    const clean = `https://www.linkedin.com${u.pathname.replace(/\/+$/, "")}`;
    if (/^\/in\/[^/]+\/?$/.test(path)) profiles.add(clean);
    else if (/^\/company\/[^/]+\/?$/.test(path)) companies.add(clean);
  }
  return { profiles: [...profiles], companies: [...companies] };
}

// Choose up to MAX_EXTRA_PAGES contact-ish pages from the homepage links,
// falling back to conventional paths when none are linked.
function pickContactPages(html, base) {
  const wanted = /contact|about|team|staff|our-people|meet/i;
  const picks = [];
  const seen = new Set();
  for (const href of extractHrefs(html)) {
    if (!wanted.test(href)) continue;
    const abs = resolveHref(href, base);
    if (!abs) continue;
    if (hostname(abs) !== hostname(base)) continue; // same site only
    const key = abs.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(key);
    if (picks.length >= MAX_EXTRA_PAGES) break;
  }
  if (picks.length === 0) {
    for (const path of ["/contact", "/contact-us", "/about"]) {
      const abs = resolveHref(path, base);
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        picks.push(abs);
      }
      if (picks.length >= MAX_EXTRA_PAGES) break;
    }
  }
  return picks;
}

// Scrape contact info for a single website. Returns:
//   { emails: string[], linkedInProfiles: string[], linkedInCompanies: string[], source }
// Emails are ranked (best first). Never throws.
export async function scrapeContacts(website) {
  const empty = { emails: [], linkedInProfiles: [], linkedInCompanies: [], source: "website" };
  const url = normalizeUrl(website);
  if (!url) return empty;
  const siteHost = hostname(url);

  const homepage = await fetchHtml(url);
  if (!homepage) return empty;

  const emails = new Set(extractEmails(homepage));
  const li = extractLinkedIn(homepage);
  const profiles = new Set(li.profiles);
  const companies = new Set(li.companies);

  const extraPages = pickContactPages(homepage, url);
  for (const page of extraPages) {
    const pageHtml = await fetchHtml(page);
    if (!pageHtml) continue;
    for (const e of extractEmails(pageHtml)) emails.add(e);
    const pli = extractLinkedIn(pageHtml);
    for (const p of pli.profiles) profiles.add(p);
    for (const c of pli.companies) companies.add(c);
  }

  return {
    emails: rankEmails([...emails], siteHost),
    linkedInProfiles: [...profiles],
    linkedInCompanies: [...companies],
    source: "website",
  };
}
