import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/client',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await cp('public','dist/client',{recursive:true});
const game=await readFile('src/game.mjs','utf8');const worker=(await readFile('src/worker.mjs','utf8')).replace(/^import .*?;\r?\n/,'');
await writeFile('dist/server/index.js',game+'\n'+worker);
await cp('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built client, Worker, and Sites manifest.');
