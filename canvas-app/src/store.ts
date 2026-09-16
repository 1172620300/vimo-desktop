// Local IndexedDB adapter for the original website canvas API contract.
let state:any;
let db:IDBDatabase;
let chain=Promise.resolve();
const bridge=()=> typeof window==='undefined'?undefined:(window.parent as any).videoGeneration;
const settingsBridge=()=> typeof window==='undefined'?undefined:(window.parent as any).videoApiSettings;
const h3Model={id:'H3',label:'H3',priceLabel:'',available:true,minimumDuration:1,maximumDuration:15,supportedDurations:Array.from({length:15},(_,i)=>i+1),maximumReferenceImages:2,maximumReferenceVideos:0,maximumReferenceAudios:0,supportsAudio:false,supportsReferenceImage:true,supportsFirstLastFrame:true,resolutions:['480p','576p','768p'],defaultResolution:'480p',aspectRatios:['16:9','9:16','4:3','1:1']};
function viewTask(t:any){return {id:t.id,status:t.status==='running'?'processing':t.status==='succeeded'?'completed':t.status==='cancelled'?'failed':t.status,progress:t.progress?.percent??null,stage:t.progress?.stage||'',error:t.error||'',model:'H3',createdAt:new Date(t.created_at*1000).toISOString(),completedAt:t.finished_at?new Date(t.finished_at*1000).toISOString():null}}
export async function initialize(){
 const account=typeof location==='undefined'?'':new URLSearchParams(location.search).get('account');
 const database=account?'vimo-desktop-canvases-'+account:'scene-studio-canvases';
 db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 state=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('canvases');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 if(!state){state={canvases:[newCanvas('我的画布')]};await persist(state)}
 return structuredClone(state);
}
function newCanvas(name:string){return {id:crypto.randomUUID(),name,viewport:{x:0,y:0,zoom:1},nodes:[],edges:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function persist(next:any){return new Promise<void>((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(next,'canvases');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本地保存失败'))})}
function newNode(body:any){return {id:crypto.randomUUID(),type:body.type,title:body.title||'新节点',position:{x:Number(body.positionX)||0,y:Number(body.positionY)||0},size:{width:360,height:240},prompt:'',model:'',duration:5,aspectRatio:'16:9',resolution:'480p',generateAudio:false,media:null,latestTask:null}}
export function localRequest(url:string,init:RequestInit={}){
 const result=chain.then(()=>run(url,init));chain=result.then(()=>{},()=>{});return result;
}
async function run(url:string,init:RequestInit){
 try{
 const method=init.method||'GET', parts=url.split('?')[0].split('/').filter(Boolean);
 if(parts[1]?.endsWith('-models')){const s=parts[1]==='video-models'?await settingsBridge()?.read():null;return Response.json({models:s?.source==='account'||s?.protocol==='comfyui'||s?.protocol==='custom'&&s?.keyConfigured&&s?.model==='H3'?[h3Model]:[]})}
 if(parts[3]?.startsWith('generate-')&&parts[3]!=='generate-video')throw Error('当前只接入 H3 文生视频，图片与音频生成尚未接入。');
 const next=structuredClone(state);
 const body=typeof init.body==='string'?JSON.parse(init.body):{};
 let canvas=next.canvases.find((c:any)=>c.id===parts[2]||c.nodes.some((n:any)=>n.id===parts[2])||c.edges.some((e:any)=>e.id===parts[2]));
 if(parts[3]==='generate-video'){
  if(!canvas)throw Error('画布不存在');
  let node=canvas.nodes.find((n:any)=>n.id===parts[2]);
  if(!node||node.type!=='video')throw Error('请选择视频节点');
  if(['queued','processing'].includes(node.latestTask?.status))throw Error('此节点已有运行任务');
  if(!bridge())throw Error('请使用桌面 App 连接视频服务');
  const refs=canvas.edges.filter((e:any)=>e.target===node.id).map((e:any)=>canvas.nodes.find((n:any)=>n.id===e.source)).filter((n:any)=>n?.media).map((n:any)=>({id:n.id,kind:n.type,url:n.media.directUrl||n.media.url,title:n.title}));
  const task=await bridge().submit({...body,references:refs});
  let createdNode=false;
  if(node.media){const old=node;node=newNode({type:'video',title:old.title+' · 新生成',positionX:old.position.x+400,positionY:old.position.y});canvas.nodes.push(node);createdNode=true}
  Object.assign(node,body,{latestTask:viewTask(task),model:'H3'});
  canvas.updatedAt=new Date().toISOString();await persist(next);state=next;
  return Response.json({canvas,nodeId:node.id,createdNode,task:node.latestTask});
 }
 if(method==='GET'&&parts[1]==='canvases'&&canvas&&bridge()){
  let changed=false;
  for(const node of canvas.nodes){
   if(!['queued','processing'].includes(node.latestTask?.status))continue;
   try{const t=await bridge().status(node.latestTask.id);const task=viewTask(t);
    if(t.status==='succeeded'){const result=await bridge().download(t.id);node.media={id:t.id,kind:'video',mimeType:'video/mp4',url:result.url,directUrl:result.url,downloadUrl:result.url,thumbnailUrl:null};}
    node.latestTask=task;changed=true;
   }catch(e){node.latestTask.error=e instanceof Error?e.message:'查询或下载失败，稍后重试';changed=true}
  }
  if(changed){await persist(next);state=next}
 }
 if(parts[1]==='canvases'&&parts.length===2){
  if(method==='POST'){if(!body.name?.trim())throw Error('请输入画布名称');canvas=newCanvas(body.name.trim());next.canvases.push(canvas)}
  else return Response.json({canvases:next.canvases});
 }else{
 if(!canvas)throw Error('画布不存在');
 if(parts[1]==='canvases'){
  if(parts.length===3&&method==='PATCH'){
   if(body.name!==undefined){if(!body.name.trim())throw Error('画布名称不能为空');canvas.name=body.name.trim()}
   if(body.viewport)canvas.viewport=body.viewport;
   for(const p of body.nodes||[]){const n=canvas.nodes.find((n:any)=>n.id===p.id);if(n)n.position={x:p.positionX,y:p.positionY}}
  }else if(parts[3]==='nodes'&&method==='POST'){const n=newNode(body);n.model='unconfigured';canvas.nodes.push(n)}
  else if(parts[3]==='edges'&&method==='POST'){
   const source=canvas.nodes.find((n:any)=>n.id===body.sourceNodeId),target=canvas.nodes.find((n:any)=>n.id===body.targetNodeId);
   if(!source||!target||source===target)throw Error('请选择不同的有效节点');
   if(!source.media)throw Error('请先添加有效参考素材');
   if(target.type==='audio'||(target.type==='image'&&source.type!=='image')||target.media&&!target.model&&target.type!=='video')throw Error('这两个节点的素材类型不兼容');
   if(canvas.edges.some((e:any)=>e.source===source.id&&e.target===target.id))throw Error('这条连线已经存在');
   const visit=(id:string,seen=new Set<string>()):boolean=>{if(id===source.id)return true;if(seen.has(id))return false;seen.add(id);return canvas.edges.filter((e:any)=>e.source===id).some((e:any)=>visit(e.target,seen))};
   if(visit(target.id))throw Error('不能形成循环连线');
   canvas.edges.push({id:crypto.randomUUID(),source:source.id,target:target.id,referenceOrder:canvas.edges.filter((e:any)=>e.target===target.id).length+1});
  }else if(parts[3]?.startsWith('upload-')){
   const form=init.body as FormData,file=form.get('file') as File,kind=parts[3]==='upload-image'?'image':'audio';
   if(!file||file.size>(kind==='image'?30:50)*1024*1024)throw Error('文件过大或无效');
   if(kind==='image'&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片');
   const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
   const n=newNode({type:kind,title:form.get('title'),positionX:form.get('positionX'),positionY:form.get('positionY')});
   n.media={id:crypto.randomUUID(),kind,mimeType:file.type,width:Number(form.get('width')),height:Number(form.get('height')),url:data,thumbnailUrl:data,directUrl:data,downloadUrl:data} as any;canvas.nodes.push(n);
  }
 }else if(parts[1]==='canvas-nodes'){
  const node=canvas.nodes.find((n:any)=>n.id===parts[2]);
  if(method==='DELETE'){canvas.nodes=canvas.nodes.filter((n:any)=>n.id!==parts[2]);canvas.edges=canvas.edges.filter((e:any)=>e.source!==parts[2]&&e.target!==parts[2])}
  else if(method==='PATCH'){for(const k of ['title','prompt','model','duration','aspectRatio','resolution','generateAudio'])if(body[k]!==undefined)node[k]=body[k]}
 }else if(parts[1]==='canvas-edges'&&method==='DELETE'){canvas.edges=canvas.edges.filter((e:any)=>e.id!==parts[2])}
 else throw Error('暂不支持该操作');
 }
 if(method!=='GET'){canvas.updatedAt=new Date().toISOString();await persist(next);state=next}
 return Response.json({canvas});
 }catch(e){return Response.json({error:{message:e instanceof Error?e.message:'本地保存失败'}},{status:400})}
}

