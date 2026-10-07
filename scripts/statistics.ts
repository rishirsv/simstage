export const summary = (values: number[]) => {
 const sorted = [...values].sort((a,b)=>a-b);
 const q=(p:number)=>sorted[Math.ceil(sorted.length*p)-1];
 return { samples:values.length,p50Ms:q(.5),p75Ms:q(.75),p95Ms:q(.95) };
};
