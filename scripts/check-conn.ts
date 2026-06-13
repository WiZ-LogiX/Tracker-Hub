// Tiny diagnostic helper. Not part of the migration runner.
// Run with: npx tsx scripts/check-conn.ts
import dns from "node:dns/promises";
import net from "node:net";

const HOST = "db.zgumsjwukevptbwbglrk.supabase.co";
const PORTS = [5432, 6543] as const;

async function resolveFamily(family: 4 | 6) {
  try {
    return await dns.lookup(HOST, { family, all: true });
  } catch (e: any) {
    return { err: e?.code ?? e?.message ?? "unknown" };
  }
}

async function probeOne(family: 4 | 6, port: number) {
  const records = await dns.lookup(HOST, { family, all: true });
  if (!Array.isArray(records) || records.length === 0) {
    return `no address family=${family}`;
  }
  const addr = records[0].address;
  return new Promise<string>((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (msg: string) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(msg);
    };
    sock.setTimeout(5000);
    sock.once("connect", () => finish(`OK ${addr}:${port}`));
    sock.once("timeout", () => finish(`TIMEOUT ${addr}:${port}`));
    sock.once("error", (e: any) => finish(`ERR ${addr}:${port} ${e.code || e.message}`));
    sock.connect(port, addr);
  });
}

async function main() {
  console.log(`Host: ${HOST}`);
  for (const fam of [6, 4] as const) {
    const r = await resolveFamily(fam);
    if ("err" in r) {
      console.log(`family=${fam}: ${r.err}`);
    } else {
      console.log(`family=${fam}:`, r.map(x => x.address).join(", "));
    }
  }
  for (const port of PORTS) {
    for (const fam of [6, 4] as const) {
      const r = await probeOne(fam, port).catch((e: any) => `throw ${e.message}`);
      console.log(`connect family=${fam} port=${port}: ${r}`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});