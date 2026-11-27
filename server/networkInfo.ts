import os from 'node:os';
import type { NetworkAdapterInfo, NetworkInfoResponse } from '../src/shared/protocol';

const VIRTUAL_NAME_REGEX =
  /(vethernet|wsl|hyper-v|docker|virtualbox|vmware|vbox|loopback|tailscale|zerotier|hamachi|nordlynx)/i;

function scoreCandidate(c: NetworkAdapterInfo): number {
  let score = 0;
  if (!c.isVirtual) score += 100;
  if (c.address.startsWith('192.168.')) score += 50;
  else if (c.address.startsWith('10.')) score += 40;
  else if (c.address.startsWith('172.')) score += 10;

  if (/(wi-fi|wifi|wlan|wireless|en0)/i.test(c.name)) score += 30;
  else if (/(ethernet|eth0|lan)/i.test(c.name)) score += 20;

  return score;
}

export function detectLanNetworkInfo(clientPort = 5173): NetworkInfoResponse {
  const ifaces = os.networkInterfaces();
  const candidates: NetworkAdapterInfo[] = [];

  for (const [name, entries] of Object.entries(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue; // Link-local APIPA
      const isVirtual =
        VIRTUAL_NAME_REGEX.test(name) ||
        (entry.address.startsWith('172.') && !/(wi-fi|wifi|ethernet)/i.test(name));
      candidates.push({
        name,
        address: entry.address,
        isVirtual,
      });
    }
  }

  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const preferredIp = candidates[0]?.address ?? 'localhost';
  return {
    preferredIp,
    clientPort,
    candidates,
  };
}
