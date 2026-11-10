import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";
import { tk } from "@/i18n/t";

/** process() normalizes IPv4-mapped IPv6 before classification, including the hexadecimal spelling. */
function isPublicAddress(address: string): boolean {
  return ipaddr.isValid(address) && ipaddr.process(address).range() === "unicast";
}

// Resolve at connection time and give the socket only a checked address: a separate pre-fetch DNS lookup is raceable.
const publicAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      void lookup(hostname, { all: true }).then((addresses) => {
        if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
          callback(new Error("Private network address blocked"), "", 4);
          return;
        }
        const family = typeof options.family === "number" ? options.family : 0;
        const selected = addresses.filter((item) => !family || item.family === family);
        if (!selected.length) { callback(new Error("No usable public address"), "", 4); return; }
        if (options.all) callback(null, selected);
        else callback(null, selected[0].address, selected[0].family);
      }).catch((error: Error) => callback(error, "", 4));
    },
  },
});

/** Shared by remote import and export proxy; validate literals and every redirect before issuing a request. */
export async function publicFetch(url: string, timeoutMs: number): Promise<Response> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= 3; hop++) {
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (!["https:", "http:"].includes(current.protocol) || current.username || current.password ||
        (isIP(host) && !isPublicAddress(host))) {
      throw new Error(tk("禁止访问内网 / 保留地址"));
    }
    const options: RequestInit & { dispatcher: Agent } = {
      redirect: "manual", signal, dispatcher: publicAgent, cache: "no-store",
    };
    const response = await fetch(current, options);
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error(tk("重定向缺少 Location"));
    current = new URL(location, current);
  }
  throw new Error(tk("重定向次数过多"));
}
