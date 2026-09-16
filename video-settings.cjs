const fs=require('node:fs');const path=require('node:path');
function validate(input){
 const baseUrl=String(input.baseUrl||'').trim();let url;try{url=new URL(baseUrl)}catch{throw Error('请输入完整的 HTTP 或 HTTPS 地址')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('地址不能包含账号、密码、查询参数或锚点');
 if(input.protocol==='custom'){require('./video-client.cjs').apiRoot(baseUrl);if(String(input.model||'').trim()!=='H3')throw Error('当前第三方接口仅支持 H3 模型，请填写 H3');}
 if(!['custom','comfyui'].includes(input.protocol))throw Error('请选择接口类型');
 return {name:String(input.name||'视频服务').trim().slice(0,80),protocol:input.protocol,baseUrl:baseUrl.replace(/\/$/,''),model:input.protocol==='comfyui'?'H3':String(input.model||'').trim().slice(0,160)};
}
function maskKey(value){return value?'已保存密钥 ·••••':'';}
function register({ipcMain,app,safeStorage},isTrusted){
 const file=path.join(app.getPath('userData'),'video-api.json');
 const read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const source=s=>s.source||(s.baseUrl?'custom':'account');
 const pub=s=>({source:source(s),name:s.name||'',protocol:s.protocol||'custom',baseUrl:s.baseUrl||'',model:s.model||'H3',keyConfigured:!!s.encryptedKey,maskedKey:maskKey(s.encryptedKey)});
 function write(next){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(file+'.tmp',file);return pub(next);}
 ipcMain.handle('video-api:read',e=>{if(!isTrusted(e))throw Error('来源无效');return pub(read())});
 ipcMain.handle('video-api:save',(e,input)=>{
  if(!isTrusted(e))throw Error('来源无效');if(!input||!['account','custom'].includes(input.source))throw Error('请选择视频服务来源');const old=read();
  // Switching to account authorization never overwrites the saved custom key.
  if(input.source==='account')return write({...old,source:'account'});
  const next={...validate(input),source:'custom'};
  const key=String(input.apiKey||'').trim();
  if(key.includes('•'))throw Error('请输入真实 API Key，不能保存显示掩码');
  if(old.encryptedKey&&old.baseUrl&&new URL(old.baseUrl).origin!==new URL(next.baseUrl).origin&&!key&&!input.clearKey)throw Error('更换服务器时请重新输入密钥，避免将旧密钥发送到其他服务器');
  next.encryptedKey=input.clearKey?undefined:old.encryptedKey;
  if(key){if(!safeStorage.isEncryptionAvailable())throw Error('系统安全存储不可用，未保存密钥');next.encryptedKey=safeStorage.encryptString(key).toString('base64');}
  return write(next);
 });
 return {readPrivate:()=>{const s=read();let apiKey='';if(source(s)==='custom'&&s.encryptedKey){try{apiKey=safeStorage.decryptString(Buffer.from(s.encryptedKey,'base64'))}catch{throw Error('当前系统无法解密已保存密钥，请重新输入 API Key 保存一次')}}return {...pub(s),apiKey}}};
}
module.exports={register,validate};
