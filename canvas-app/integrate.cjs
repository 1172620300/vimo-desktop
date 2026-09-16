const fs=require('fs'),path=require('path');
const p=path.resolve(__dirname,'../index.html');
let html=fs.readFileSync(p,'utf8');
html=html.replace(/<section id="canvas" class="page">[\s\S]*?(?=\s*<section id="tasks")/,'<section id="canvas" class="page"><iframe id="live-canvas" src="canvas-app/index.html" title="创作画布"></iframe></section>');
html=html.replace("img-src 'self' data:","img-src 'self' data:; frame-src 'self'");
fs.writeFileSync(p,html);
const store=path.join(__dirname,'src/store.ts');
let s=fs.readFileSync(store,'utf8').replace('canvas.nodes.push(newNode(body))',"const n=newNode(body);n.model='unconfigured';canvas.nodes.push(n)");fs.writeFileSync(store,s);
