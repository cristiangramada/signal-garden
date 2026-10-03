const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const a=await browser.newContext({viewport:{width:1440,height:1050}}),b=await browser.newContext({viewport:{width:390,height:844}});
const p=await a.newPage(),q=await b.newPage();const errors=[];for(const page of [p,q])page.on('pageerror',e=>errors.push(e.message));
const base=process.env.GAME_URL||'http://localhost:4317';
await p.goto(base);await p.locator('#nickname').fill('Fern');await p.locator('#enter').click();await p.waitForSelector('#start');
const code=await p.evaluate(()=>state.code);assert(await p.locator('#start').isDisabled());
await q.goto(base+'/?room='+code);await q.locator('#nickname').fill('Moss');await q.locator('#enter').click();await q.waitForSelector('#start');await p.waitForFunction(()=>state.players.length===2);
await p.screenshot({path:'artifacts/lobby.png',fullPage:true});await p.locator('#start').click();await p.waitForSelector('#tile-4');await q.waitForSelector('#tile-4');
await p.screenshot({path:'artifacts/game-desktop.png',fullPage:true});await q.screenshot({path:'artifacts/game-mobile.png',fullPage:true});
assert(!await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
assert.notDeepEqual(await p.evaluate(()=>state.clues),await q.evaluate(()=>state.clues));console.log('PASS: independent desktop and mobile sessions join, receive private clues, and share a garden.');
const parity=s=>s.garden.tiles.map(t=>[t.kind,t.rotation]);
for(let round=1;round<=3;round++){
 await p.waitForFunction(r=>state.round===r&&state.phase==='playing',round);await q.waitForFunction(r=>state.round===r&&state.phase==='playing',round);
 const ps=await p.evaluate(()=>state),qs=await q.evaluate(()=>state),clues=[...ps.clues,...qs.clues];
 for(const clue of clues){const target=clue.exits.map(d=>['North','East','South','West'].indexOf(d)).sort().join();const page=ps.garden.tiles[clue.cell].owner===ps.me?p:q;
  for(let turns=0;turns<4;turns++){
   const s=await page.evaluate(()=>state);const t=s.garden.tiles[clue.cell];const current=(t.kind==='straight'?[0,2]:[0,1]).map(d=>(d+t.rotation)%4).sort().join();if(current===target)break;
   await page.locator('#tile-'+clue.cell).click();await page.waitForFunction(()=>!busy);await page.waitForTimeout(180);
  }
 }
 await p.waitForFunction(()=>state.phase==='bloom');await q.waitForFunction(()=>state.phase==='bloom');
 assert.deepEqual(parity(await p.evaluate(()=>state)),parity(await q.evaluate(()=>state)));console.log('PASS: garden '+round+' solved through real UI; both players agree.');
 if(round===1){await p.screenshot({path:'artifacts/bloom.png',fullPage:true});await q.reload();await q.locator('#resume').click();await q.waitForSelector('#next');assert.equal(await q.evaluate(()=>state.players.length),2);console.log('PASS: refresh restores the same player without a duplicate join.');}
 await p.locator('#next').click();await p.waitForFunction(()=>!busy);
}
await p.waitForFunction(()=>state.phase==='finished');await q.waitForFunction(()=>state.phase==='finished');await p.screenshot({path:'artifacts/finished.png',fullPage:true});assert.equal(await p.evaluate(()=>state.history.length),3);
await p.locator('#replay').click();await p.waitForSelector('#start');await q.waitForSelector('#start');assert.equal(await p.evaluate(()=>state.history.length),0);
console.log('PASS: three-round finish, shared score, and replay.');assert.deepEqual(errors,[]);console.log('PASS: zero browser runtime errors.');await browser.close();

