export const DIRS = ['North','East','South','West'];
export const COLORS = ['#b2ed83','#d6b5fc','#ffc979','#8edee4','#ffaab9','#b2c9ff'];
export const LABEL = i => `${'ABCD'[i%4]}${1+Math.floor(i/4)}`;
export const edges = t => t.kind === 'rock' ? [] : (t.kind === 'straight' ? [0,2] : [0,1]).map(d=>(d+t.rotation)%4);
const neighbor=(i,d)=> d===0 ? (i>=4?i-4:-1) : d===1 ? (i%4<3?i+1:-1) : d===2 ? (i<12?i+4:-1) : (i%4?i-1:-1);
const direction=(a,b)=>b===a-4?0:b===a+1?1:b===a+4?2:3;
export function trace(tiles) {
  const lit=[]; let cell=4, incoming=3; const seen=new Set();
  while(cell>=0&&!seen.has(cell)) {
    seen.add(cell); const e=edges(tiles[cell]); if(!e.includes(incoming))break;
    lit.push(cell); const out=e.find(d=>d!==incoming);
    if(cell===11&&out===1)return {lit,connected:true};
    cell=neighbor(cell,out); incoming=(out+2)%4;
  }
  return {lit,connected:false};
}
export function puzzle(round,random=Math.random){
  let path=null;
  const walk=(current,visited)=>{
    if(current===11){if(visited.length>=10){path=[...visited];return true;}return false;}
    const ns=[0,1,2,3].map(d=>neighbor(current,d)).filter(n=>n>=0&&!visited.includes(n));
    // Fisher-Yates rather than a biased sort.
    for(let i=ns.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[ns[i],ns[j]]=[ns[j],ns[i]];}
    for(const n of ns)if(walk(n,[...visited,n]))return true;
    return false;
  };walk(4,[4]);
  const tiles=Array.from({length:16},()=>({kind:'rock',rotation:0,target:0}));
  path.forEach((cell,i)=>{
    const a=i===0?3:direction(cell,path[i-1]), b=i===path.length-1?1:direction(cell,path[i+1]);
    const kind=(a+2)%4===b?'straight':'elbow';
    const target=[0,1,2,3].find(rotation=>{const e=edges({kind,rotation});return e.includes(a)&&e.includes(b);});
    tiles[cell]={kind,target,rotation:Math.floor(random()*4)};
  });
  const flowers=[path[Math.floor(path.length*.3)],path[Math.floor(path.length*.6)],11];
  if(trace(tiles).connected)tiles[4].rotation=(tiles[4].rotation+1)%4;
  return {tiles,path,flowers,round,moves:0,hints:0};
}
export function newRoom(code,name,token,practice=false,now=Date.now()){
  return {code,version:0,phase:'lobby',practice,created:now,expires:now+86400000,players:[{id:crypto.randomUUID(),name,token,joined:now,lastSeen:now}],round:0,garden:null,history:[],events:[],processed:[]};
}
export function leader(room,now=Date.now()){return room.players.find(p=>now-p.lastSeen<25000)?.id||room.players[0]?.id;}
export function owner(room,index){return room.players[index%room.players.length];}
export function canRotate(room,player,index,now=Date.now()){
  const p=owner(room,index);return room.practice||p.id===player.id||now-p.lastSeen>=25000;
}
export function startRound(room,now){room.round++;room.garden=puzzle(room.round);room.phase='playing';room.started=now;}
export function view(room,player,now=Date.now()){
  const g=room.garden; let clues=[];
  if(g)clues=g.path.filter(i=>(i+1)%room.players.length===room.players.indexOf(player)).map(i=>({cell:i,label:LABEL(i),owner:owner(room,i).name,exits:edges({...g.tiles[i],rotation:g.tiles[i].target}).map(d=>DIRS[d])}));
  return {code:room.code,version:room.version,phase:room.phase,practice:room.practice,round:room.round,me:player.id,leader:leader(room,now),serverTime:now,expires:room.expires,
    players:room.players.map((p,i)=>({id:p.id,name:p.name,color:COLORS[i],online:now-p.lastSeen<25000})),history:room.history,
    garden:g?{tiles:g.tiles.map((t,i)=>({kind:t.kind,rotation:t.rotation,owner:owner(room,i).id,available:canRotate(room,player,i,now)})),flowers:g.flowers,...trace(g.tiles),moves:g.moves,hints:g.hints}:null,
    clues,events:room.events.filter(e=>now-e.time<7000)};
}
export function mutate(room,player,action,now=Date.now()){
  const {type,id}=action;
  if(!id||typeof id!=='string'||id.length>80)throw new Error('Missing action ID.');
  if(room.processed.includes(id))return false;
  if(action.round!==undefined && action.round!==room.round)throw new Error('That move was from an earlier garden. Please try again.');
  const host=leader(room,now)===player.id;
  if(type==='start'){
    if(!host)throw new Error('Only the current room guide can start.');
    if(room.phase!=='lobby')throw new Error('The garden has already started.');
    if(!room.practice&&room.players.length<2)throw new Error('Invite one friend, or try solo practice.');
    startRound(room,now);
  }else if(type==='rotate'){
    if(room.phase!=='playing')throw new Error('This garden is not open for moves.');
    const i=action.cell;if(!Number.isInteger(i)||i<0||i>15)throw new Error('Choose a valid tile.');
    const t=room.garden.tiles[i];if(t.kind==='rock')throw new Error('Stones cannot rotate.');
    if(!canRotate(room,player,i,now))throw new Error('That tile belongs to a teammate. Try sending a ping.');
    t.rotation=(t.rotation+1)%4;room.garden.moves++;
    room.events.push({type:'move',cell:i,name:player.name,time:now});
    const result=trace(room.garden.tiles);
    if(result.connected&&room.garden.flowers.every(i=>result.lit.includes(i))){
      room.phase='bloom';const stars=room.garden.moves<=36&&room.garden.hints===0?3:room.garden.moves<=60?2:1;
      room.history.push({round:room.round,moves:room.garden.moves,hints:room.garden.hints,stars,seconds:Math.round((now-room.started)/1000)});
    }
  }else if(type==='next'){
    if(!host)throw new Error('Only the room guide can open the next garden.');
    if(room.phase!=='bloom')throw new Error('Finish this garden first.');
    if(room.round>=3)room.phase='finished';else startRound(room,now);
  }else if(type==='replay'){
    if(!host||room.phase!=='finished')throw new Error('The room guide can replay after the final garden.');
    room.phase='lobby';room.round=0;room.history=[];room.garden=null;
  }else if(type==='hint'){
    if(room.phase!=='playing')throw new Error('Hints are available while playing.');
    const i=room.garden.path.find(i=>canRotate(room,player,i,now)&&edges(room.garden.tiles[i]).sort().join()!==edges({...room.garden.tiles[i],rotation:room.garden.tiles[i].target}).sort().join());
    if(i===undefined)throw new Error('Your tiles are aligned. Help a teammate with your clues!');
    room.garden.hints++;room.events.push({type:'hint',cell:i,name:player.name,text:`${LABEL(i)} needs ${edges({...room.garden.tiles[i],rotation:room.garden.tiles[i].target}).map(d=>DIRS[d]).join(' + ')}.`,time:now});
  }else if(type==='ping'){
    if(!Number.isInteger(action.cell)||action.cell<0||action.cell>15)throw new Error('Choose a valid tile.');
    room.events.push({type:'ping',cell:action.cell,name:player.name,time:now});
  }else if(type==='cheer'){
    const options=['Let’s follow the light!','Check your clue cards','Looking good!','One more turn?'];
    if(!options.includes(action.text))throw new Error('Choose a garden message.');
    room.events.push({type:'cheer',text:action.text,name:player.name,time:now});
  }else throw new Error('Unknown action.');
  room.events=room.events.slice(-15);room.processed.push(id);room.processed=room.processed.slice(-100);player.lastSeen=now;return true;
}

