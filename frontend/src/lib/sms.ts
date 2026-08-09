// GSM 03.38 default alphabet (single-septet chars) plus the extension table
// (two septets each, escaped via 0x1B). Any character outside both forces
// the whole message to UCS-2/Unicode encoding, which drops the per-segment
// limit from 160 to 70.
const GSM_7BIT_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_7BIT_EXTENDED = "^{}\\[~]|€";

export interface SmsSegmentInfo {
  encoding: "GSM-7" | "Unicode";
  length: number;
  segments: number;
  perSegmentLimit: number;
}

export function computeSmsSegments(text: string): SmsSegmentInfo {
  let isUnicode = false;
  let gsmLength = 0;

  for (const char of text) {
    if (GSM_7BIT_BASIC.includes(char)) {
      gsmLength += 1;
    } else if (GSM_7BIT_EXTENDED.includes(char)) {
      gsmLength += 2;
    } else {
      isUnicode = true;
      break;
    }
  }

  if (isUnicode) {
    const length = Array.from(text).length; // count code points, not UTF-16 units
    const singleLimit = 70;
    const multiLimit = 67;
    const segments = length === 0 ? 1 : length <= singleLimit ? 1 : Math.ceil(length / multiLimit);
    return { encoding: "Unicode", length, segments, perSegmentLimit: segments === 1 ? singleLimit : multiLimit };
  }

  const singleLimit = 160;
  const multiLimit = 153;
  const segments = gsmLength === 0 ? 1 : gsmLength <= singleLimit ? 1 : Math.ceil(gsmLength / multiLimit);
  return { encoding: "GSM-7", length: gsmLength, segments, perSegmentLimit: segments === 1 ? singleLimit : multiLimit };
}
