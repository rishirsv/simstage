import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await build({ entryPoints:[`${root}/src/viewer-controller.ts`], bundle:true, write:false, format:'iife', globalName:'ReviewViewer', platform:'browser', plugins:[{
  name:'expose-private-measurement-for-fixture', setup(builder) {
    builder.onLoad({filter:/viewer-controller\.ts$/}, async ({path}) => ({contents: `${await readFile(path,'utf8')}\nexport { videoMaxDimension };`, loader:'ts'}));
  }
}] });
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page = await browser.newPage({deviceScaleFactor:1});
 await page.setContent(`<style>${await readFile(`${root}/src/app.css`,'utf8')}</style><div id="root"><div class="stage" style="width:700px;height:1000px"><div id="frame" class="screen-frame"><img id="screen" width="440" height="956"><canvas id="canvas" width="256" height="576"></canvas><div id="gesture"></div></div></div></div>`);
 await page.evaluate(()=>{
   window.__SIM_STAGE_PREVIEW__ = true;
   window.fetch = async()=>({ok:true,json:async()=>({content:[],structuredContent:{devices:[],sessions:[],warnings:[]}})});
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result = await page.evaluate(async()=>{
   const nodes=Object.fromEntries(['root','screen','canvas','frame','gesture'].map(name=>[name,document.getElementById(name)]));
   const mounted=ReviewViewer.initializeViewer(nodes);
   await mounted.ready;
   nodes.frame.hidden=false; nodes.canvas.hidden=false;
   const stage=nodes.frame.parentElement, dims={width:440,height:956};
   const measure=()=>({needed:ReviewViewer.videoMaxDimension(true,dims), intrinsic:[nodes.canvas.width,nodes.canvas.height],maxHeight:getComputedStyle(nodes.canvas).maxHeight});
   const initial=measure();
   stage.style.height='620px'; const shrunk=measure();
   stage.style.height='1000px'; const regrown=measure();
   const landscape=ReviewViewer.videoMaxDimension(true,{width:956,height:440});
   mounted.dispose();
   return {initial,shrunk,regrown,landscape};
 });
 assert.equal(result.initial.needed,960);
 assert.equal(result.shrunk.needed,576);
 assert.equal(result.regrown.needed,960);
 assert.deepEqual(result.regrown.intrinsic,[256,576]);
 assert.equal(result.landscape,640);
 console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
