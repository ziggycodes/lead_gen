import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostalAddress, postalAddressError } from "./postalAddress.ts";
import { unsubscribeFooter } from "./unsubscribeToken.ts";

test("normalizePostalAddress folds lines and spacing into one line", () => {
  assert.equal(normalizePostalAddress("  12 Example  Street,\r\nAustin, TX 78701\n\n"), "12 Example Street, Austin, TX 78701");
  assert.equal(normalizePostalAddress(42), "");
});

test("postalAddressError accepts street addresses and PO boxes", () => {
  for (const address of ["12 Example Street, Austin, TX 78701", "PO Box 1234, Lagos 100001", "Rose Cottage, High Street, Bath BA1 1AA"]) {
    assert.equal(postalAddressError(address), null);
  }
});

test("postalAddressError rejects email addresses and websites", () => {
  for (const address of ["you@yourcompany.com", "Contact you@yourcompany.com in Austin", "www.yourcompany.com", "https://yourcompany.com/contact"]) {
    assert.match(postalAddressError(address)!, /physical mailing address/);
  }
});

test("postalAddressError rejects blank, partial, and oversized values", () => {
  assert.match(postalAddressError("")!, /Enter your mailing address/);
  assert.match(postalAddressError("Austin")!, /full address/);
  assert.match(postalAddressError("Lagos, Nigeria")!, /full address/);
  assert.match(postalAddressError(`12 Example Street ${"x".repeat(300)}`)!, /under 300/);
});

test("the footer prints the address above the unsubscribe link", () => {
  assert.equal(
    unsubscribeFooter("https://x.test/unsubscribe/abc", "12 Example Street, Austin, TX 78701"),
    "\n\n--\n12 Example Street, Austin, TX 78701\nDon't want these emails? Unsubscribe: https://x.test/unsubscribe/abc"
  );
});
