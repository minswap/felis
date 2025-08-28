const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const generator: number[] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: Uint8Array): number {
  let chk = 1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const top = chk >> 25;
    chk = (chk & 0x1ffffff) << 5;
    chk = chk ^ v;
    for (let j = 0; j < 5; j++) {
      const bit = (top >> j) & 1;
      if (bit === 1) {
        chk ^= generator[j];
      }
    }
  }
  return chk;
}

function hrpExpand(hrp: string): Uint8Array {
  const h = hrp.toLowerCase();
  const ret: number[] = [];
  for (let i = 0; i < h.length; i++) {
    const c = h.charCodeAt(i);
    ret.push(c >> 5);
  }
  ret.push(0);
  for (let i = 0; i < h.length; i++) {
    const c = h.charCodeAt(i);
    ret.push(c & 31);
  }
  return new Uint8Array(ret);
}

function verifyChecksum(hrp: string, data: Uint8Array): boolean {
  return polymod(new Uint8Array([...hrpExpand(hrp), ...data])) === 1;
}

function createChecksum(hrp: string, data: Uint8Array): Uint8Array {
  const values: number[] = [];
  values.push(...hrpExpand(hrp));
  values.push(...data);
  values.push(0, 0, 0, 0, 0, 0);
  const mod = polymod(new Uint8Array(values)) ^ 1;
  const ret = new Uint8Array(6);
  for (let p = 0; p < ret.length; p++) {
    const shift = 5 * (5 - p);
    ret[p] = (mod >> shift) & 31;
  }
  return ret;
}

function convertBits(data: Uint8Array, frombits: number, tobits: number, pad: boolean): Uint8Array {
  const ret: number[] = [];
  let acc = 0;
  let bits = 0;
  const maxv = (1 << tobits) - 1;
  for (let idx = 0; idx < data.length; idx++) {
    const value = data[idx];
    if (value >> frombits !== 0) {
      throw new Error(`invalid data range: data[${idx}]=${value} (frombits=${frombits})`);
    }
    acc = (acc << frombits) | value;
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) {
      ret.push((acc << (tobits - bits)) & maxv);
    }
  } else if (bits >= frombits) {
    throw new Error("illegal zero padding");
  } else if (((acc << (tobits - bits)) & maxv) !== 0) {
    throw new Error("non-zero padding");
  }
  return new Uint8Array(ret);
}

export function decodeBech32(s: string): { hrp: string; data: Uint8Array } {
  if (s.toLowerCase() !== s && s.toUpperCase() !== s) {
    throw new Error("mixed case");
  }
  const pos = s.lastIndexOf("1");
  if (pos < 1 || pos + 7 > s.length) {
    throw new Error(`separator '1' at invalid position: pos=${pos}, len=${s.length}`);
  }
  const hrp = s.slice(0, pos);
  for (let p = 0; p < hrp.length; p++) {
    const c = hrp.charCodeAt(p);
    if (c < 33 || c > 126) {
      throw new Error(`invalid character human-readable part: s[${p}]=${c}`);
    }
  }
  const lowerS = s.toLowerCase();
  const data: number[] = [];
  for (let p = 0; p < s.length - (pos + 1); p++) {
    const c = lowerS.charAt(pos + 1 + p);
    const d = charset.indexOf(c);
    if (d === -1) {
      throw new Error(`invalid character data part: s[${p}]=${c}`);
    }
    data.push(d);
  }
  if (!verifyChecksum(hrp, new Uint8Array(data))) {
    throw new Error("invalid checksum");
  }
  const decodedData = convertBits(new Uint8Array(data.slice(0, data.length - 6)), 5, 8, false);
  return {
    hrp: hrp,
    data: decodedData,
  };
}

export function encodeBech32(hrp: string, data: Uint8Array): string {
  const decodedData = convertBits(data, 8, 5, true);
  if (hrp.length < 1) {
    throw new Error(`invalid HRP: ${hrp}`);
  }
  for (let p = 0; p < hrp.length; p++) {
    const c = hrp.charCodeAt(p);
    if (c < 33 || c > 126) {
      throw new Error(`invalid HRP character: hrp[${p}]=${c}`);
    }
  }
  if (hrp.toUpperCase() !== hrp && hrp.toLowerCase() !== hrp) {
    throw new Error(`mixed case HRP: ${hrp}`);
  }
  const lower = hrp.toLowerCase() === hrp;
  hrp = hrp.toLowerCase();
  const ret: string[] = [];
  ret.push(hrp);
  ret.push("1");
  for (const p of decodedData) {
    ret.push(charset[p]);
  }
  for (const p of createChecksum(hrp, decodedData)) {
    ret.push(charset[p]);
  }
  if (lower) {
    return ret.join("");
  }
  return ret.join("").toUpperCase();
}
