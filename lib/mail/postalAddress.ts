// The sender's physical address for the foot of bulk emails. Pure so the settings
// card can show the same errors the server applies.
const MIN_LENGTH = 10;
const MAX_LENGTH = 300;

export function normalizePostalAddress(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " ").replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
}

export function postalAddressError(address: string): string | null {
  if (!address) return "Enter your mailing address.";
  if (/\S+@\S+\.\S+/.test(address) || /https?:\/\/|www\./i.test(address)) {
    return "An email address or website can't be used here. Enter a physical mailing address.";
  }
  if (address.length < MIN_LENGTH || address.split(/[\s,]+/).length < 3) {
    return "Enter the full address, including the street or PO box, city, and postcode or ZIP.";
  }
  if (address.length > MAX_LENGTH) return `Keep the address under ${MAX_LENGTH} characters.`;
  return null;
}
