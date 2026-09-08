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
        resolve({id:entry.id,status:res.statusCode,firstByteMs,totalMs,transferMs:totalMs-firstByteMs,encoding:encoding||'identity',wireBytes:wire.length,decodedBytes:decoded.length,docs:docs.length,fieldBytes,updatedTimeRange:docs.length?[Math.min(...docs.map(d=>d.updatedTimeUtc||0)),Math.max(...docs.map(d=>d.updatedTimeUtc||0))]:undefined,warning:body.warning||body.warnings,executionStats:body.execution_stats});
      });
    });
    req.setTimeout(30000,()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
    if(entry.body) req.write(JSON.stringify(entry.body));
    req.end();
  });
}
function accessMap() {
 return new Promise((resolve,reject)=>{
  const socket=io(report.config.baseUrl,{transports:['websocket'],forceNew:true,reconnection:false});
  const timer=setTimeout(()=>{socket.close();reject(new Error('access-map timeout'));},10000);
  socket.on('connect_error',error=>{clearTimeout(timer);socket.close();reject(error);});
  socket.on('connect',()=>socket.emit('clientConfigReq',{cms:false,version:0,accessMap:{}}));
  socket.once('clientConfig',config=>{clearTimeout(timer);socket.close();resolve(config.accessMap);});
 });
}
(async()=>{
 const permissions=await accessMap();
 const entries=report.latency.filter(r=>r.entry.path==='/query'&&r.status===200&&!r.entry.body.cms).map(r=>structuredClone(r.entry));
 const adjustments=[];
 for(const entry of entries) {
   if(entry.group!=='sync (app)') continue;
   const selector=entry.body.selector;
   const type=selector.type==='content'?selector.parentType:selector.type==='deleteCmd'?selector.docType:selector.type;
   const groups=Object.entries(permissions).filter(([group,types])=>types[type]?.view===true).map(([group])=>group);
   if(groups.length===0) throw new Error('No accessible groups for '+entry.id+'; check access-map format');
   const previous=selector.memberOf;
   selector.memberOf={$elemMatch:{$in:groups}};
   if(JSON.stringify(previous)!==JSON.stringify(selector.memberOf)) adjustments.push({id:entry.id,previousMemberOf:previous,memberOf:selector.memberOf});
   if(selector.type==='content'&&selector.updatedTimeUtc?.$gte>0) entry.body.includeExpired=true;
 }
 for(const id of ['sync-content-post-first','sync-content-tag-first']) {
  const original=entries.find(e=>e.id===id);
  for(const limit of [25,50]) {
   const entry=structuredClone(original);entry.id+='-limit-'+limit;entry.body.limit=limit;entries.push(entry);
  }
 }
 const rows=[];
 const control=report.latency.find(r=>r.entry.id==='protected').entry;
 const output={startedAt,baseUrl:report.config.baseUrl,identity:'anonymous',samples:5,discardedWarmup:1,requestAdjustments:adjustments,entries,rows};
 fs.mkdirSync('perf-reports/query-sync',{recursive:true});
 for(const entry of entries) {
   rows.push({...await measure(control),forRequest:entry.id,sample:0});
   await measure(entry);
   for(let i=0;i<5;i++) rows.push({...await measure(entry),sample:i});
   fs.writeFileSync('perf-reports/query-sync/measurements.json',JSON.stringify(output,null,2));
   console.log(entry.id,rows[rows.length-1].docs,'docs',rows[rows.length-1].warning||'');
 }
 output.completedAt=new Date().toISOString();
 fs.writeFileSync('perf-reports/query-sync/measurements.json',JSON.stringify(output,null,2));
 agent.destroy();
})().catch(error=>{console.error(error);agent.destroy();process.exitCode=1;});
