import { register, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';

const systemVariables = new Set(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'NODE_TEST_CONTEXT']);
for (const name of Object.keys(process.env)) {
  if (!systemVariables.has(name)) delete process.env[name];
}
process.env.TZ = 'UTC';

function rejectNetwork() {
  throw new Error('Network access is disabled in isolated tests; inject a fake transport.');
}

net.Socket.prototype.connect = rejectNetwork;
tls.connect = rejectNetwork;
http.request = http.get = rejectNetwork;
https.request = https.get = rejectNetwork;
globalThis.fetch = rejectNetwork;
syncBuiltinESMExports();

register('./loader.mjs', import.meta.url);
