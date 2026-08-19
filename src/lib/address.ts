// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO.

export type AddressParts = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
};

const trimOrNull = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.trim();
  return t ? t : null;
};

/** US formatting: line1, then line2, then the joined "city/state/postal" line with required comma. */
export function formatAddressLines(parts: AddressParts): string[] {
  const addressLine1 = trimOrNull(parts.addressLine1);
  const addressLine2 = trimOrNull(parts.addressLine2);
  const city = trimOrNull(parts.city);
  const stateProvince = trimOrNull(parts.stateProvince);
  const postalCode = trimOrNull(parts.postalCode);

  const out: string[] = [];
  if (addressLine1) out.push(addressLine1);
  if (addressLine2) out.push(addressLine2);

  const hasAny = Boolean(city || stateProvince || postalCode);
  if (!hasAny) return out;

  // Last line rules (US order):
  // - city only => "city"
  // - state + postal only (no city) => "state postal"
  // - city + postal only (no state) => "city postal"
  // - city + state [+ postal] => "city, state [postal]" (comma required after city)
  if (city && stateProvince) {
    const last = postalCode ? `${city}, ${stateProvince} ${postalCode}` : `${city}, ${stateProvince}`;
    out.push(last);
    return out;
  }

  const pieces: string[] = [];
  if (city) pieces.push(city);
  if (stateProvince) pieces.push(stateProvince);
  if (postalCode) pieces.push(postalCode);

  // When either city or stateProvince is missing, we join remaining pieces with spaces.
  // This matches:
  // - city + postal => "city postal"
  // - state + postal => "state postal"
  // - state only => "state"
  // - postal only => "postal"
  // - city only => "city"
  out.push(pieces.join(" "));
  return out;
}

/** Single-line formatting equivalent to formatAddressLines, joined with ', '. */
export function formatAddressOneLine(parts: AddressParts): string {
  return formatAddressLines(parts).join(", ");
}
