const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const report = JSON.parse(fs.readFileSync('perf-reports/production/perf-audit-2026-09-08T10-12-16-196Z.json'));
const agent = new https.Agent({keepAlive:true});
const io = require(process.cwd() + '/node_modules/socket.io-client').io;
const startedAt = new Date().toISOString();
function measure(entry) {
  return new Promise((resolve,reject) => {
    const started = performance.now();
    const req = https.request(new URL(entry.path,report.config.baseUrl),{agent,method:entry.method,headers:{'content-type':'application/json','accept-encoding':'br, gzip, deflate'}},res=>{
      const firstByteMs = performance.now()-started;
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>{
        const totalMs=performance.now()-started;
        const wire=Buffer.concat(chunks);
        const encoding=res.headers['content-encoding'];
        const decoded=encoding==='br'?zlib.brotliDecompressSync(wire):encoding==='gzip'?zlib.gunzipSync(wire):encoding==='deflate'?zlib.inflateSync(wire):wire;
        let body; try { body=JSON.parse(decoded.toString()); } catch { body={}; }
        const docs=body.docs || (Array.isArray(body)?body.map(r=>r.doc).filter(Boolean):[]);
        const fieldBytes={};
        for(const doc of docs) for(const [key,value] of Object.entries(doc)) fieldBytes[key]=(fieldBytes[key]||0)+Buffer.byteLength(JSON.stringify(value));
        resolve({id:entry.id,status:res.statusCode,firstByteMs,totalMs,transferMs:totalMs-firstByteMs,encoding:encoding||'identity',wireBytes:wire.length,decodedBytes:decoded.length,docs:docs.length,fieldBytes,docIdsHash:require('crypto').createHash('sha256').update(JSON.stringify(docs.map(d=>d._id))).digest('hex'),updatedTimeRange:docs.length?[Math.min(...docs.map(d=>d.updatedTimeUtc||0)),Math.max(...docs.map(d=>d.updatedTimeUtc||0))]:undefined,warning:body.warning||body.warnings,executionStats:body.execution_stats});
      });
    });
    req.setTimeout(30000,()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
    if(entry.body) req.write(JSON.stringify(entry.body));
    req.end();
  });
}
(async()=>{
 const focused=JSON.parse(fs.readFileSync('perf-reports/query-sync/measurements.json'));
 const rows=[];
 const pairs=[];
 for(const id of ['sync-content-post-first','sync-content-tag-first','sync-content-post','sync-content-tag','sync-content-publishDate-window']) {
  const original=structuredClone(focused.entries.find(e=>e.id===id));
  const candidate=structuredClone(original);
  candidate.id+='-subtype-index';
  candidate.body.use_index='sync-'+candidate.body.selector.parentType+'-content-index';
  pairs.push({id,original,candidate});
 }
 const output={startedAt:new Date().toISOString(),baseUrl:report.config.baseUrl,samples:5,warmup:1,identity:'anonymous',pairs,rows};
 for(const {id,original,candidate} of pairs) {
  await measure(original); await measure(candidate);
  for(let sample=0;sample<5;sample++) {
   const order=sample%2===0?[original,candidate]:[candidate,original];
   for(const entry of order) rows.push({...await measure(entry),sample});
  }
  fs.writeFileSync('perf-reports/query-sync/index-comparison.json',JSON.stringify(output,null,2));
  console.log(id,rows[rows.length-1].status);
 }
 output.completedAt=new Date().toISOString();
 fs.writeFileSync('perf-reports/query-sync/index-comparison.json',JSON.stringify(output,null,2));
 agent.destroy();
})().catch(error=>{console.error(error);agent.destroy();process.exitCode=1;});
