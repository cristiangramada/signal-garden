import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import worker from '../src/worker.mjs';
const sqlite=new DatabaseSync(':memory:');
const DB = { exec: async sql => sqlite.exec(sql), prepare(sql) { return { bind(...args) { const stmt=sqlite.prepare(sql); return { async first() { return stmt.get(...args)||null; }, async run() { return {meta:{changes:stmt.run(...args).changes}}; } }; } }; } };
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const ASSETS={async fetch(request){let pathname=new URL(request.url).pathname;if(pathname==='/')pathname='/index.html';const file=path.resolve('public','.'+pathname);if(!file.startsWith(path.resolve('public')+path.sep))return new Response('',{status:403});try{return new Response(await readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};
http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request('http://localhost:4317'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});const r=await worker.fetch(request,{DB,ASSETS});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Error');}}).listen(4317,'127.0.0.1',()=>console.log('Signal Garden http://localhost:4317'));

