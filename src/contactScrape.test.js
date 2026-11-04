import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractEmails, pickContactPages } from "./contactScrape.js";

// info@shop.com XOR-encoded with key 0x42, the same scheme Cloudflare uses.
const CF_INFO = "422b2c242d02312a2d326c212d2f";

describe("extractEmails", () => {
  it("reads a mailto link", () => {
    const found = extractEmails('<a href="mailto:info@shop.com">Email</a>');
    assert.deepEqual(found, ["info@shop.com"]);
  });

  it("reads a form action mailto", () => {
    const found = extractEmails('<form action="mailto:office@shop.com">');
    assert.deepEqual(found, ["office@shop.com"]);
  });

  it("decodes a Cloudflare data-cfemail address", () => {
    const found = extractEmails(`<a data-cfemail="${CF_INFO}">[email protected]</a>`);
    assert.deepEqual(found, ["info@shop.com"]);
  });

  it("decodes a Cloudflare email-protection link", () => {
    const found = extractEmails(`<a href="/cdn-cgi/l/email-protection#${CF_INFO}">email</a>`);
    assert.deepEqual(found, ["info@shop.com"]);
  });

  it("reads an address hidden with [at] and [dot]", () => {
    const found = extractEmails("<p>info [at] shop [dot] com</p>");
    assert.deepEqual(found, ["info@shop.com"]);
  });

  it("reads an address hidden with (at) and (dot)", () => {
    const found = extractEmails("<p>hello (at) shop (dot) com</p>");
    assert.deepEqual(found, ["hello@shop.com"]);
  });

  it("decodes numeric HTML entities", () => {
    const decimal = extractEmails("<p>info&#64;shop.com</p>");
    const hex = extractEmails("<p>info&#x40;shop.com</p>");
    assert.deepEqual(decimal, ["info@shop.com"]);
    assert.deepEqual(hex, ["info@shop.com"]);
  });

  it("drops a noreply address and an asset filename", () => {
    const found = extractEmails(
      '<a href="mailto:noreply@shop.com">x</a> logo@2x.png info@shop.com'
    );
    assert.deepEqual(found, ["info@shop.com"]);
  });

  it("returns nothing for empty html", () => {
    assert.deepEqual(extractEmails(""), []);
    assert.deepEqual(extractEmails(null), []);
  });
});

describe("pickContactPages", () => {
  it("fills a contact URL when the homepage only links about", () => {
    const pages = pickContactPages('<a href="/about">About</a>', "https://shop.example/");
    assert.equal(pages.length, 2);
    assert.ok(pages.some((url) => url.endsWith("/about")));
    assert.ok(pages.some((url) => url.endsWith("/contact")));
  });

  it("does not fetch more than two extra pages", () => {
    const html = '<a href="/contact"></a><a href="/contact-us"></a><a href="/about"></a>';
    const pages = pickContactPages(html, "https://shop.example/");
    assert.equal(pages.length, 2);
  });
});

it("htmlToText keeps title, description, and body text without scripts", async () => {
  const { htmlToText } = await import("./contactScrape.js");
  const html = `<html><head><title>Bright Smile</title><meta name="description" content="Family dentist in Austin"><style>.a{}</style></head>
    <body><script>track()</script><h1>Invisalign &amp; implants</h1><p>Open Saturdays</p></body></html>`;
  assert.equal(htmlToText(html), "Bright Smile\nFamily dentist in Austin\nInvisalign & implants\nOpen Saturdays");
});

it("pickInsightPages prefers service pages on the same host", async () => {
  const { pickInsightPages } = await import("./contactScrape.js");
  const html = `<a href="/services">S</a><a href="https://other.com/about">X</a><a href="/blog">B</a><a href="/about-us">A</a><a href="/pricing">P</a>`;
  assert.deepEqual(pickInsightPages(html, "https://smile.com/"), ["https://smile.com/services", "https://smile.com/about-us"]);
});
