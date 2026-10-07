import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const assets=`${root}plugins/sim-stage/assets/`;
const svg=(dark=false,composer=false)=>{
 const ink=dark?'#F3F6FC':'#3478F6',focus=composer?ink:dark?'#8CB4FF':'#132441',accent=composer?ink:'#16C8ED';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Sim Stage</title><desc>A phone enclosing a focus marker for inspecting a simulator screen.</desc>${composer?'':`<rect width="512" height="512" rx="112" fill="${dark?'#132441':'#F3F6FC'}"/>`}<g fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="${composer?112:136}" y="${composer?48:72}" width="${composer?288:240}" height="${composer?416:368}" rx="52" stroke="${ink}" stroke-width="${composer?32:24}"/><path d="${composer?'M232 82h48M232 430h48':'M232 102h48M232 408h48'}" stroke="${ink}" stroke-width="${composer?16:12}"/><path d="M220 206h-24v24m96-24h24v24m0 72v24h-24m-72 0h-24v-24" stroke="${focus}" stroke-width="${composer?20:16}"/></g><rect x="234" y="244" width="44" height="44" rx="10" fill="${accent}"/></svg>\n`;
};
const items=[['icon.svg','logo.png',false,false,1024],['icon-dark.svg','logo-dark.png',true,false,1024],['composer.svg','composer.png',false,true,128],['composer-dark.svg','composer-dark.png',true,true,128]];
await mkdir(assets,{recursive:true});
await mkdir(`${root}artifacts/submission/`,{recursive:true});
for(const [source,,dark,composer] of items)await writeFile(assets+source,svg(dark,composer));
// The desktop recolors tool icons through a mask; black stays opaque with either
// alpha or inverted-luminance masks, including hosts that ignore the SVG mask type.
await writeFile(assets+'sidebar.svg',svg(false,true).replaceAll('#3478F6','#000000').replace('stroke-width="32"','stroke-width="40"').replace('stroke-width="20"','stroke-width="24"'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({deviceScaleFactor:1});
 for(const [source,out,,,size] of items){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${await readFile(assets+source,'utf8')}`);
  await page.screenshot({path:assets+out,omitBackground:true});
 }
 await page.close();
 const review=await browser.newPage({viewport:{width:1440,height:1040},deviceScaleFactor:1});
 const preview=async(name,alt)=>`<img alt="${alt}" src="data:image/png;base64,${(await readFile(assets+name)).toString('base64')}">`;
 const logo=await preview('logo.png','Light listing logo'),dark=await preview('logo-dark.png','Dark listing logo');
 const composer=await preview('composer.png','Light composer icon'),composerDark=await preview('composer-dark.png','Dark composer icon');
 const sizes=[16,24,32,48,128];
 const html=`<!doctype html><meta charset="utf-8"><title>Sim Stage asset review</title><style>*{box-sizing:border-box}body{margin:0;background:#F3F6FC;color:#132441;font:16px -apple-system,BlinkMacSystemFont,sans-serif;padding:64px}h1{font-size:56px;letter-spacing:-2.5px;margin:0 0 12px}p{margin:0;color:#52647A}section{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:24px}.tile{padding:32px;border-radius:24px;background:white}.tile.dark{background:#132441;color:#F3F6FC}.large{display:flex;gap:48px;align-items:center;height:280px}.large img{width:224px;height:224px}.large .mark img{width:128px;height:128px}.samples{display:flex;gap:36px;align-items:end;margin-top:24px;height:160px}.sample{text-align:center;min-width:40px}.sample img{display:block;margin:0 auto 12px}.sample span{font-size:12px;opacity:.65}.swatch{display:flex;gap:10px;margin-top:40px}.swatch div{padding:18px 24px;border-radius:16px;font-size:13px}footer{margin-top:28px;color:#52647A;font-size:13px}</style><h1>Sim Stage</h1><p>A phone. A focus marker. The same identity from a listing tile to a composer icon.</p><section>${[[logo,composer,false],[dark,composerDark,true]].map(([a,b,d])=>`<div class="tile ${d?'dark':''}"><div class="large">${a}<div class="mark">${b}</div></div><div class="samples">${sizes.map(size=>`<div class="sample"><div style="width:${size}px;height:${size}px">${b.replace('<img ','<img style="width:100%;height:100%" ')}</div><span>${size}px</span></div>`).join('')}</div></div>`).join('')}</section><div class="swatch"><div style="background:#3478F6;color:white">Cobalt · #3478F6</div><div style="background:#132441;color:white">Midnight · #132441</div><div style="background:#16C8ED">Focus · #16C8ED</div></div><footer>Vector masters · 1024px listing PNGs · 128px transparent composer PNGs · Light and dark appearances</footer>`;
 await writeFile(`${root}artifacts/submission/asset-review.html`,html);
 await review.setContent(html);await review.screenshot({path:`${root}artifacts/submission/asset-review.png`,clip:{x:0,y:0,width:1440,height:920}});
}finally{await browser.close();}
console.log('Rendered listing and composer assets, with a light/dark review sheet.');
