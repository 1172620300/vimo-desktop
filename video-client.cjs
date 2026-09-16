const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');

function apiRoot(raw){const u=new URL(raw);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('视频服务必须使用 HTTPS；本机地址可使用 HTTP');if(u.username||u.password||u.search||u.hash)throw Error('接口地址格式不正确');if(u.pathname.includes('vimo-admin'))throw Error('这是管理后台地址。视频接口请填写 https://imaideo.xyz/vimo-api/v1');return u.href.replace(/\/$/,'').replace(/\/v1$/,'')+'/v1'}
function comfyRoot(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw Error('ComfyUI 地址格式不正确');if(u.username||u.password||u.search||u.hash)throw Error('ComfyUI 地址不能包含账号、密码、查询参数或锚点');return u.href.replace(/\/$/,'')}
function taskId(id){if(!/^(?:video_[a-f0-9]{32}|comfy_[a-f0-9]{32})$/.test(id))throw Error('无效任务 ID');return id}
const WORKFLOW_FILE=path.join(__dirname,'workflows','H3_Unified_T2V_I2V_FirstLast_720p_TwoPass_API.json');
const comfyTasks=new Map();

function dataUrlBuffer(value){const match=String(value||'').match(/^data:([^;,]+)?;base64,(.+)$/);if(!match)return null;return {mimeType:match[1]||'application/octet-stream',buffer:Buffer.from(match[2],'base64')}}
async function uploadReference(baseUrl,reference,fetchImpl){
 const data=dataUrlBuffer(reference.url);if(!data)throw Error(`参考素材“${reference.title||'未命名'}”不是本地图片数据`);
 const ext=data.mimeType==='image/png'?'.png':data.mimeType==='image/webp'?'.webp':'.jpg';const form=new FormData();form.append('image',new Blob([data.buffer],{type:data.mimeType}),`vimo-${crypto.randomUUID()}${ext}`);form.append('overwrite','true');
 const r=await fetchImpl(baseUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`参考图片上传失败 (${r.status})`);const result=await r.json();if(!result.name)throw Error('ComfyUI 未返回参考图片名称');return result.name;
}
async function loadWorkflow(){return JSON.parse(await fs.readFile(WORKFLOW_FILE,'utf8'))}
function configureWorkflow(workflow,input,images){
 const p=structuredClone(workflow);const prompt=String(input.prompt||'').trim();const duration=Number(input.duration)||5;const first=images?.[0]||null;const last=images?.[1]||null;
 if(p['19']?.inputs)p['19'].inputs.value=prompt;if(p['17']?.inputs)p['17'].inputs.value=duration;
 for(const id of ['22','32']){if(!p[id]?.inputs)continue;delete p[id].inputs.first_frame;delete p[id].inputs.last_frame;if(first)p[id].inputs.first_frame=['20',0];if(last)p[id].inputs.last_frame=['21',0]}
 if(first&&p['20']?.inputs)p['20'].inputs.image=first;if(last&&p['21']?.inputs)p['21'].inputs.image=last;if(p['4']?.inputs)p['4'].inputs.filename_prefix='video/VimoDesktop_'+Date.now();return p;
}
function comfyStatus(promptId,history){const item=history?.[promptId];if(!item)return {id:promptId,status:'queued',progress:null,stage:'等待 ComfyUI'};const status=item.status||{};if(status.status_str==='error'||status.messages?.some(m=>JSON.stringify(m).includes('error')))return {id:promptId,status:'failed',progress:null,stage:'',error:'ComfyUI 工作流执行失败'};if(status.completed){const output=Object.values(item.outputs||{}).flatMap(v=>[...(v.videos||[]),...(v.images||[])]).find(v=>String(v.filename||'').toLowerCase().endsWith('.mp4'));return {id:promptId,status:'succeeded',progress:100,stage:'已完成',output:output||null}}return {id:promptId,status:'running',progress:null,stage:'ComfyUI 生成中'}}

function createClient({readPrivate,mediaDir,fetchImpl=fetch}){
 async function remoteRequest(suffix,method='GET',body,timeout=30000){const c=readPrivate();if(!c.apiKey)throw Error('请先保存 API Key');if(c.model!=='H3')throw Error('模型名称请填写 H3');const r=await fetchImpl(apiRoot(c.baseUrl)+suffix,{method,redirect:'error',signal:AbortSignal.timeout(timeout),headers:{Authorization:'Bearer '+c.apiKey,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(typeof d.detail==='string'?d.detail:`视频 API 请求失败 (${r.status})`)}return r}
 async function comfyRequest(suffix,method='GET',body,timeout=30000){const c=readPrivate();const r=await fetchImpl(comfyRoot(c.baseUrl)+suffix,{method,signal:AbortSignal.timeout(timeout),headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error(`ComfyUI 请求失败 (${r.status})`);return r}
 async function verifyComfy(){await comfyRequest('/system_stats','GET',undefined,10000);return {ok:true,workerOnline:true,paused:false}}
 async function submitComfy(input){await verifyComfy();const refs=Array.isArray(input.references)?input.references.filter(r=>r.kind==='image').slice(0,2):[];const images=[];for(const ref of refs)images.push(await uploadReference(comfyRoot(readPrivate().baseUrl),ref,fetchImpl));const workflow=configureWorkflow(await loadWorkflow(),input,images);const clientId='vimo-desktop-'+crypto.randomUUID();const r=await comfyRequest('/prompt','POST',{prompt:workflow,client_id:clientId,extra_data:{extra_pnginfo:{source:'Vimo Desktop'}}},60000);const result=await r.json();if(!result.prompt_id)throw Error(JSON.stringify(result.node_errors||result.error||'ComfyUI 未接受工作流'));const id='comfy_'+crypto.randomUUID().replace(/-/g,'');comfyTasks.set(id,{promptId:result.prompt_id});return {id,status:'queued',created_at:Date.now()/1000,progress:{percent:0,stage:'已提交 ComfyUI'}}}
 async function statusComfy(id){const task=comfyTasks.get(id);if(!task)throw Error('ComfyUI 任务只在当前客户端会话内可查询');const history=await (await comfyRequest('/history/'+encodeURIComponent(task.promptId))).json();const s=comfyStatus(task.promptId,history);return {id,status:s.status,progress:s.progress,stage:s.stage,error:s.error||'',output:s.output||null,created_at:Date.now()/1000,finished_at:s.status==='succeeded'?Date.now()/1000:null}}
 async function downloadComfy(id){taskId(id);const state=await statusComfy(id);if(state.status!=='succeeded'||!state.output?.filename)throw Error('ComfyUI 视频尚未完成');await fs.mkdir(mediaDir,{recursive:true});const file=path.join(mediaDir,id+'.mp4');try{if((await fs.stat(file)).size>0)return {url:pathToFileURL(file).href}}catch{}const query=new URLSearchParams({filename:state.output.filename,subfolder:state.output.subfolder||'',type:state.output.type||'output'});const r=await comfyRequest('/view?'+query.toString(),'GET',undefined,180000);const data=Buffer.from(await r.arrayBuffer());if(!data.length||data.length>512*1024*1024)throw Error('视频结果为空或超过 512 MB 下载上限');const tmp=file+'.partial';await fs.writeFile(tmp,data);await fs.rename(tmp,file);return {url:pathToFileURL(file).href}}
 return {
  async verify(){const c=readPrivate();if(c.protocol==='comfyui')return verifyComfy();const r=await (await remoteRequest('/models')).json();if(!r.data?.some(x=>x.id==='H3'))throw Error('服务未提供 H3 模型');return {ok:true,workerOnline:!!r.worker_online,paused:!!r.paused}},
  async submit(input){
   if(!input||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>10000)throw Error('请输入有效提示词');
   if(!Number.isFinite(input.duration)||input.duration<1||input.duration>15)throw Error('视频时长必须为 1–15 秒');
   if(!['16:9','9:16','4:3','1:1'].includes(input.aspectRatio))throw Error('画面比例不支持');
   const resolution=Number(String(input.resolution).replace('p',''));if(![480,576,768].includes(resolution))throw Error('分辨率不支持');
   const c=readPrivate();
   const reference=input.mode==='references'?require('./reference-request.cjs').referenceBody(input):null;
   if(c.protocol==='comfyui'){if(reference)throw Error('多图参考请通过 Vimo API 提交');return submitComfy({...input,resolution})}
   const health=await this.verify();if(!health.workerOnline)throw Error('生成节点离线，尚未提交任务。请先启动 ComfyUI');if(health.paused)throw Error('管理员已暂停接单，尚未提交任务');
   if(reference){const capabilities=await (await remoteRequest('/video-capabilities')).json();if(!capabilities.modes?.includes('references'))throw Error('服务器尚未启用多图参考工作流');return (await remoteRequest('/videos','POST',reference,120000)).json()}
   const refs=Array.isArray(input.references)?input.references.slice(0,2):[];const images=refs.filter(r=>r.kind==='image').map(r=>r.url);
   return (await remoteRequest('/videos','POST',{model:'H3',...(input.mode?{mode:input.mode}:{}),prompt:input.prompt,duration:input.duration,resolution,aspect_ratio:input.aspectRatio,reference_images:images,first_frame:images[0]||null,last_frame:images[1]||null})).json()
  },
  async status(id){const c=readPrivate();if(c.protocol==='comfyui')return statusComfy(taskId(id));return (await remoteRequest('/videos/'+taskId(id),'GET',undefined,12000)).json()},
  async download(id){const c=readPrivate();if(c.protocol==='comfyui')return downloadComfy(id);taskId(id);await fs.mkdir(mediaDir,{recursive:true});const file=path.join(mediaDir,id+'.mp4');try{if((await fs.stat(file)).size>0)return {url:pathToFileURL(file).href}}catch{}const r=await remoteRequest('/videos/'+id+'/content','GET',undefined,180000);const tmp=file+'.partial';const handle=await fs.open(tmp,'w');let size=0;try{for await(const chunk of r.body){size+=chunk.length;if(size>512*1024*1024)throw Error('结果超过 512 MB 下载上限');await handle.write(chunk)}if(!size)throw Error('视频结果为空')}catch(e){await handle.close();await fs.rm(tmp,{force:true});throw e}await handle.close();await fs.rename(tmp,file);return {url:pathToFileURL(file).href}}
 }
}
module.exports={createClient,apiRoot,taskId,comfyRoot,configureWorkflow};
