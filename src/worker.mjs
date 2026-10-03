import {newRoom,view,mutate} from './game.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const secret=()=>crypto.randomUUID()+crypto.randomUUID();
const initialized=new WeakMap();
async function ready(db){
 if(!initialized.has(db))initialized.set(db,db.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);').catch(e=>{initialized.delete(db);throw e;}));
 await initialized.get(db);
}
async function limit(db,key,max,window=60000){
 const bucket=Math.floor(Date.now()/window),k=key+':'+bucket;
 const r=await db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(k,Date.now()+window*2,max).first();
 if(!r)throw Object.assign(new Error('A little too fast. Wait a moment and try again.'),{status:429});
}
async function body(request){
 const text=await request.text();if(text.length>4096)throw new Error('Request too large.');
 try{return JSON.parse(text);}catch{throw new Error('Please send valid game data.');}
}
function nameOf(value){
 if(typeof value!=='string')throw new Error('Enter a nickname.');
 const n=value.trim().replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'').slice(0,18);
 if(!n)throw new Error('Enter a nickname (up to 18 characters).');return n;
}
async function change(db,code,fn){
 for(let tries=0;tries<12;tries++){
  const row=await db.prepare('SELECT data,version FROM rooms WHERE code=? AND expires>?').bind(code,Date.now()).first();
  if(!row)throw Object.assign(new Error('Garden not found or expired. Check the six-letter code.'),{status:404});
  const room=JSON.parse(row.data);const outcome=await fn(room);
  if(!outcome.save)return outcome.value;
  room.version=row.version+1;
  const r=await db.prepare('UPDATE rooms SET data=?,version=? WHERE code=? AND version=?').bind(JSON.stringify(room),room.version,code,row.version).run();
  if(r.meta.changes===1)return typeof outcome.value==='function'?outcome.value(room):outcome.value;
 }
 throw Object.assign(new Error('The garden is busy. Please try that move again.'),{status:409});
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/')){
  const response=await env.ASSETS.fetch(request);
  return new Response(response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"}});
 }
 try{
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
  if(request.method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Use this garden’s own page.'},403);
  if(!env.DB)return json({error:'Garden storage is not connected yet.'},503);
  await ready(env.DB);const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  if(url.pathname==='/api/health')return json({ok:true,game:'Signal Garden'});
  if(url.pathname==='/api/create'&&request.method==='POST'){
   const data=await body(request),name=nameOf(data.name);
   const ip=await hash(request.headers.get('cf-connecting-ip')||'local');await limit(db,'create:'+ip,20);
   const token=secret(),digest=await hash(token);
   for(let tries=0;tries<8;tries++){
    const bytes=crypto.getRandomValues(new Uint8Array(6));const code=Array.from(bytes,b=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[b%23]).join('');
    const room=newRoom(code,name,digest,data.practice===true);
    const result=await db.prepare('INSERT OR IGNORE INTO rooms(code,version,data,expires) VALUES (?,0,?,?)').bind(code,JSON.stringify(room),room.expires).run();
    if(result.meta.changes){
     await db.prepare('DELETE FROM rooms WHERE expires<?').bind(Date.now()).run();
     await db.prepare('DELETE FROM limits WHERE expires<?').bind(Date.now()).run();
     return json({token,state:view(room,room.players[0])},201);
    }
   }throw new Error('Could not create a room. Please try again.');
  }
  const code=(url.searchParams.get('code')||'').toUpperCase();
  if(!/^[A-Z]{6}$/.test(code))throw new Error('Room codes contain six letters.');
  if(url.pathname==='/api/join'&&request.method==='POST'){
   const data=await body(request),name=nameOf(data.name),token=secret(),digest=await hash(token);
   const ip=await hash(request.headers.get('cf-connecting-ip')||'local');await limit(db,'join:'+ip,40);
   return json(await change(db,code,room=>{
    if(room.practice)throw new Error('This is a solo practice garden. Create a multiplayer room to play together.');
    if(room.phase!=='lobby')throw new Error('This garden is underway. Ask the guide to finish and choose Play again.');
    if(room.players.length>=6)throw new Error('This room is full (six gardeners).');
    if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new Error('That nickname is taken in this room. Pick another.');
    const player={id:crypto.randomUUID(),name,token:digest,joined:Date.now(),lastSeen:Date.now()};room.players.push(player);
    return {save:true,value:r=>({token,state:view(r,r.players.find(p=>p.id===player.id))})};
   }));
  }
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token||token.length>150)return json({error:'Rejoin the room to continue.'},401);
  const digest=await hash(token);
  const action=url.pathname==='/api/action'&&request.method==='POST'?await body(request):null;
  if(!action&&!(url.pathname==='/api/state'&&request.method==='GET'))return json({error:'Not found.'},404);
  if(action)await limit(db,'action:'+digest,12,1000);
  const state=await change(db,code,room=>{
   const player=room.players.find(p=>p.token===digest);
   if(!player)throw Object.assign(new Error('This session has ended. Join again with your nickname.'),{status:401});
   let save=false;
   if(action)save=mutate(room,player,action);
   else if(Date.now()-player.lastSeen>8000){player.lastSeen=Date.now();save=true;}
   return {save,value:save?r=>view(r,r.players.find(p=>p.id===player.id)):view(room,player)};
  });return json(state);
 }catch(error){
  if(error.message?.includes('D1_')||error.message?.includes('SQLITE')){console.error('Database request failed');return json({error:'The garden is reconnecting. Please try again.'},503);}
  return json({error:error.message||'Something went wrong. Please retry.'},error.status||400);
 }
}};
