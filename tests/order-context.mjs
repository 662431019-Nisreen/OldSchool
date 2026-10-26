import assert from 'node:assert/strict';
import { qrContext, contextQuery } from '../lib/order-context.ts';
const origin = 'https://coffee.example';
assert.deepEqual(qrContext(origin+'/?table=2',origin,12),{type:'dinein',table:2});
assert.deepEqual(qrContext(origin+'/?type=takeaway',origin,12),{type:'takeaway',table:0});
for (const url of ['https://other.example/?table=2', origin+'/?table=13', origin+'/?table=0', origin+'/?table=1.5',origin+'/admin?table=2',origin+'/#order=123','not a url']) assert.equal(qrContext(url,origin,12),null);
assert.equal(contextQuery({type:'dinein',table:3}),'table=3');
assert.equal(contextQuery({type:'takeaway',table:0}),'type=takeaway');
console.log('QR table context validation passed');
