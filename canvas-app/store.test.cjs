require('fake-indexeddb/auto');
const {test}=require('node:test');const assert=require('node:assert/strict');
require('esbuild').buildSync({entryPoints:[__dirname+'/src/store.ts'],bundle:true,platform:'node',outfile:__dirname+'/store-test-build.cjs'});
const {initialize,localRequest}=require('./store-test-build.cjs');
global.FileReader=class{readAsDataURL(file){file.arrayBuffer().then(b=>{this.result='data:'+file.type+';base64,'+Buffer.from(b).toString('base64');this.onload()})}};
async function call(url,method='GET',body){const r=await localRequest(url,{method,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {ok:r.ok,...await r.json()}}
test('local canvas creates, saves, uploads, connects and restores without remote APIs',async()=>{
 const initial=await initialize(),id=initial.canvases[0].id;
 let r=await call(`/api/canvases/${id}/nodes`,'POST',{type:'video',title:'验证镜头',positionX:100,positionY:160});assert.equal(r.ok,true);const video=r.canvas.nodes[0].id;
 await call(`/api/canvas-nodes/${video}`,'PATCH',{prompt:'雨夜城市'});
 const form=new FormData();form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6gXkAAAAASUVORK5CYII=','base64')],'reference.png',{type:'image/png'}));form.set('title','参考图');
 r=await call(`/api/canvases/${id}/upload-image`,'POST',form);assert.equal(r.ok,true);const image=r.canvas.nodes[1].id;
 r=await call(`/api/canvases/${id}/edges`,'POST',{sourceNodeId:image,targetNodeId:video});assert.equal(r.canvas.edges.length,1);
 r=await call(`/api/canvases/${id}/edges`,'POST',{sourceNodeId:image,targetNodeId:video});assert.equal(r.ok,false);
 await call(`/api/canvases/${id}`,'PATCH',{viewport:{x:10,y:20,zoom:.8},nodes:[{id:video,positionX:300,positionY:400}]});
 const restored=(await initialize()).canvases[0];assert.equal(restored.nodes[0].prompt,'雨夜城市');assert.equal(restored.nodes[0].position.x,300);assert.equal(restored.viewport.zoom,.8);assert.match(restored.nodes[1].media.url,/^data:image\/png/);assert.equal(restored.edges.length,1);
 r=await call(`/api/canvas-nodes/${video}/generate-video`,'POST',{});assert.equal(r.ok,false);assert.match(r.error.message,/请使用桌面 App 连接视频服务/);
 await call(`/api/canvas-nodes/${image}`,'DELETE');r=await call(`/api/canvases/${id}`);assert.equal(r.canvas.edges.length,0);assert.equal(r.canvas.nodes.length,1);
});
