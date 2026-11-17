import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:5198';
const server=spawn('bun',['run','dev:react','--host','127.0.0.1','--port','5198','--strictPort'],{detached:true,stdio:['ignore','pipe','pipe']});
let output='',browser;server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x);
try{
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(output.slice(-1000));try{const r=await fetch(origin+'/test/prompt-controls.fixture.html');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],outside=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():(outside.push(route.request().url()),route.abort()));
 await page.goto(origin+'/test/prompt-controls.fixture.html');
 const model=page.getByRole('button',{name:'Select model',exact:true}),reasoning=page.getByRole('button',{name:'Reasoning',exact:true});
 const permission=page.locator('select[title="Choose how Vera handles tool approvals"]');
 await model.waitFor();await page.waitForFunction(()=>window.promptFixture.snapshot().model==='fixture/model-a');
 const permissionBox=await permission.boundingBox(),reasoningBox=await reasoning.boundingBox(),modelBox=await model.boundingBox();
 assert(permissionBox.x+permissionBox.width<=reasoningBox.x);assert(reasoningBox.x+reasoningBox.width<=modelBox.x);
 assert(Math.abs(modelBox.y-reasoningBox.y)<12);
 assert.equal(await model.evaluate(el=>Boolean(el.closest('.promptControls'))),true);
 assert.equal(await page.locator('textarea').evaluate(el=>Boolean(el.closest('.promptControls'))),false);
 const prompt=page.getByPlaceholder('Ask Vera anything…');await prompt.fill('Keep this draft while controls change');
 await reasoning.click();assert.equal(await reasoning.getAttribute('aria-pressed'),'false');await reasoning.click();
 await permission.selectOption('standard');assert.equal((await page.evaluate(()=>window.promptFixture.snapshot())).permission,'standard');await permission.selectOption('unrestricted');
 await model.click();await page.getByRole('tab',{name:/BYOK/}).click();
 await page.getByRole('option').filter({hasText:'Fixture model B'}).click();
 assert.equal((await page.evaluate(()=>window.promptFixture.snapshot())).model,'fixture/model-b');
 assert.equal(await model.getAttribute('aria-expanded'),'false');assert.equal(await prompt.inputValue(),'Keep this draft while controls change');
 await model.click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox',{name:'Available models'}).count(),0);
 await mkdir('test-results/prompt-controls',{recursive:true});await page.screenshot({path:'test-results/prompt-controls/wide.png',fullPage:true});
 for(const width of [600,380,320]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await model.click();const box=await page.getByRole('listbox',{name:'Available models'}).boundingBox();assert(box.x>=-1);assert(box.x+box.width<=width+1);await page.keyboard.press('Escape');
 }
 await page.screenshot({path:'test-results/prompt-controls/narrow.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/test/prompt-controls.fixture.html?panel');await model.waitFor();await model.click();
 const menu=await page.getByRole('listbox',{name:'Available models'}).boundingBox();assert(menu.x>=-1);assert(menu.x+menu.width<=1441);
 await page.keyboard.press('Escape');
 assert.deepEqual(await page.evaluate(()=>window.promptFixture.snapshot().calls),[]);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 console.log(JSON.stringify({fixtureOnly:true,verified:['Full access left; Reasoning then model right','real PromptInput controls below input','reasoning and model state unchanged','permission selection retained','draft preserved','upward menu in viewport at wide/narrow/fullWidth sizes','Escape closes menu','no model/provider/IPC sends']}));
}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{server.kill('SIGTERM');}}
