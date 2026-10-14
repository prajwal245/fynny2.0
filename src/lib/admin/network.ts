/** IP allowlist matching for the admin panel: single IPs or CIDR ranges, IPv4 and IPv6. */
export function ipToBig(ip: string): { v: bigint; bits: number } | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    return { v: p.reduce((a, n) => (a << 8n) + BigInt(n), 0n), bits: 32 };
  }
  if (!ip.includes(":")) return null;
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { v: groups.reduce((a, g) => (a << 16n) + BigInt(parseInt(g, 16)), 0n), bits: 128 };
}

export function ipInList(ip: string, list: string): boolean {
  const me = ipToBig(ip);
  if (!me) return false;
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((entry) => {
      const [addr, lenRaw] = entry.split("/");
      const net = ipToBig(addr.trim().replace(/^::ffff:/, ""));
      if (!net || net.bits !== me.bits) return false;
      const len = lenRaw === undefined ? net.bits : Number(lenRaw);
      if (!Number.isInteger(len) || len < 0 || len > net.bits) return false;
      const shift = BigInt(net.bits - len);
      return me.v >> shift === net.v >> shift;
    });
}

