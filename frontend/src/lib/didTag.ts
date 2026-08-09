export interface DidTag {
  code: string;
  bg: string;
  fg: string;
  border: string;
}

// Fixed rotation matching the brand palette's actual color choices (gold,
// steel, green, amber). Red is deliberately excluded — it's already
// reserved for "failed to send" elsewhere in the UI, and reusing it here
// would make a line tag look like an error state.
const PALETTE: Omit<DidTag, "code">[] = [
  { bg: "rgba(193,152,72,0.16)", fg: "#d4ad60", border: "rgba(193,152,72,0.4)" },
  { bg: "rgba(126,134,147,0.18)", fg: "#b9bec7", border: "rgba(126,134,147,0.4)" },
  { bg: "rgba(47,122,74,0.2)", fg: "#8fd3a4", border: "rgba(47,122,74,0.45)" },
  { bg: "rgba(176,121,20,0.18)", fg: "#e0b25a", border: "rgba(176,121,20,0.4)" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Derives a stable tag {code, colors} from a DID's own data — no hardcoded
// per-line lookup table, so renaming a line (via its VoIP.ms Note field) or
// adding a new one needs no code change. Color is keyed off the DID number
// itself (immutable, available on both Did and Thread API shapes) rather
// than the label, so the color stays the same even if the label changes.
export function didTag(did: { label: string; did: string }): DidTag {
  const color = PALETTE[hashString(did.did) % PALETTE.length];
  const code = did.label.trim().slice(0, 6).toUpperCase() || "LINE";
  return { code, ...color };
}
