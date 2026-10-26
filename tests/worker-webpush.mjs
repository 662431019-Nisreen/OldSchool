import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
const compiled = await build({
  stdin: {
    contents: `import {sendPushRequest,encode64} from './lib/webpush';
const transport=fetch;
export default {async fetch(){let stage='keys';try{
const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',vapid.privateKey);
const publicKey=encode64(new Uint8Array(await crypto.subtle.exportKey('raw',vapid.publicKey)));
const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',receiver.publicKey))),auth:encode64(crypto.getRandomValues(new Uint8Array(16)))}};
stage='send';const response=await sendPushRequest(subscription,{title:'Test',body:'เครื่องดื่มพร้อมรับ'},{publicKey,privateKey:jwk.d,subject:'https://cafe.test'},transport);
return Response.json({ok:response.ok,status:response.status});
}catch(e){return Response.json({ok:false,stage,error:e.name,message:e.message});}}};`,
    resolveDir: process.cwd(),
    sourcefile: "worker-push-test.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  logLevel: "silent",
});
let outbound = 0;
let redirectResponse = false;
const mf = new Miniflare({
  modules: true,
  script: compiled.outputFiles[0].text,
  compatibilityDate: "2026-01-01",
  outboundService: async (req) => {
    outbound++;
    assert.equal(req.headers.get("content-encoding"), "aes128gcm");
    return redirectResponse
      ? new Response(null, {
          status: 302,
          headers: { location: "https://should-not-follow.test" },
        })
      : new Response(null, { status: 201 });
  },
});
try {
  const result = await (await mf.dispatchFetch("http://localhost/test")).json();
  console.log(result);
  assert.equal(result.ok, true);
  assert.equal(outbound, 1);
  redirectResponse = true;
  const blocked = await (
    await mf.dispatchFetch("http://localhost/test")
  ).json();
  assert.equal(blocked.status, 302);
  assert.equal(outbound, 2);
  console.log(
    "PASS: native Workers WebCrypto encryption and outbound Push transport (mock service, no real notification).",
  );
} finally {
  await mf.dispose();
}
