import { AppleHub, NativeAppleBoundary } from '../src/apple.ts';
import { writeFile } from 'node:fs/promises';
import { summary } from './statistics.ts';
const native=new NativeAppleBoundary();let observations=0;
const starts:any[]=[];
const hub=new AppleHub({boundary:{command:(...args)=>native.command(...args),tool:async(...args)=>{if(args[0]==='DeviceInteractionSynthesize'){observations++;starts.push({at:performance.now(),command:args[1].interactionCommand});}return native.tool(...args);},close:()=>native.close()}});
const rows:any[]=[];
try {
 const deviceId=process.argv[2];
 if(!deviceId)throw new Error('Usage: bun scripts/background-benchmark.ts <dedicated Sim Stage benchmark UDID>');
 const inventory=await hub.status();
 if(!inventory.devices.some(device=>device.id===deviceId&&device.kind==='simulator'&&device.name==='Sim Stage benchmark'))throw new Error('Use a dedicated simulator named Sim Stage benchmark; this benchmark taps its foreground app.');
 const session=await hub.connect(deviceId);
 // Use a fixed quiet outcome in both variants to isolate refresh queue attribution;
 // native settling's timing is independent of the capture reuse policy.
 (hub as any).video.waitForIdle=()=>Promise.resolve(true);
 for(let pair=0;pair<30;pair++)for(const variant of pair%2?['candidate','baseline']:['baseline','candidate']){
  await hub.action(session.id,{type:'tap',x:200,y:300},{screenshot:'never'});
  const count=observations,start=performance.now();
  const refresh=hub.capture(session.id,{background:variant==='candidate',resolution:'full',screenshot:'always'});
  const at=performance.now(),before=starts.length;
  const action=hub.action(session.id,{type:'tap',x:200,y:300},{screenshot:'never'});
  const [,result]=await Promise.all([refresh,action]);
  rows.push({pair,variant,ms:performance.now()-start,actionMs:performance.now()-at,queuePlusRefreshMs:starts[before].at-at,observations:observations-count,snapshot:result.snapshot});
 }
 const report={scope:'30 alternating pairs, actual bridge captures and actions; background refresh requested immediately ahead of action after a quiet action observation. Settling fixed identically to isolate queue wait; no reduction claimed without this collision.',rows,summary:Object.fromEntries(['baseline','candidate'].map(variant=>[variant,{...summary(rows.filter(r=>r.variant===variant).map(r=>r.actionMs)),observations:rows.filter(r=>r.variant===variant).reduce((sum,r)=>sum+r.observations,0)/30}]))};
 await writeFile(new URL('../artifacts/background-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));
} finally{await hub.close();}
