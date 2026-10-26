import assert from 'node:assert/strict';
import { qrContext, contextQuery } from '../lib/order-context.ts';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const origin = 'https://coffee.example';
assert.deepEqual(qrContext(origin+'/?table=2',origin,12),{type:'dinein',table:2});
assert.deepEqual(qrContext(origin+'/?type=takeaway',origin,12),{type:'takeaway',table:0});
for (const url of ['https://other.example/?table=2', origin+'/?table=13', origin+'/?table=0', origin+'/?table=1.5',origin+'/admin?table=2',origin+'/#order=123','not a url']) assert.equal(qrContext(url,origin,12),null);
assert.equal(contextQuery({type:'dinein',table:3}),'table=3');
assert.equal(contextQuery({type:'takeaway',table:0}),'type=takeaway');
// Decode a real QR bitmap using the same decoder as the phone image input.
const url=origin+'/?table=7';
const qr=QRCode.create(url,{errorCorrectionLevel:'M'});const margin=4,scale=8,w=(qr.modules.size+margin*2)*scale;
const data=new Uint8ClampedArray(w*w*4);
for(let y=0;y<w;y++)for(let x=0;x<w;x++){const mx=Math.floor(x/scale)-margin,my=Math.floor(y/scale)-margin;const black=mx>=0&&my>=0&&mx<qr.modules.size&&my<qr.modules.size&&qr.modules.get(my,mx);const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=black?0:255;data[i+3]=255;}
const decoded=jsQR(data,w,w);assert.equal(decoded.data,url);assert.equal(qrContext(decoded.data,origin,12).table,7);
console.log('QR table context validation and image decoding passed');
