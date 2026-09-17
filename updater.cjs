const fs=require('node:fs');
const path=require('node:path');
const semver=require('semver');
function evaluatePolicy(current,policy={}) {
 const minimum=policy.minimum_client_version||policy.minimum_version;
 return {minimumClientVersion:semver.valid(minimum)?minimum:null,unsupported:!!(semver.valid(current)&&semver.valid(minimum)&&semver.lt(current,minimum)),forceUpdate:policy.force_update===true,latestVersion:semver.valid(policy.latest_version)?policy.latest_version:null};
}
function register({app,ipcMain,win,mainUrl,verifyDownload=require('./update-integrity.cjs').verifyDownload},injected) {
 const updater=injected||require('electron-updater').autoUpdater;
 const enabled=app.isPackaged&&process.platform==='win32';
 let state={status:enabled?'idle':'disabled',currentVersion:app.getVersion(),enabled,progress:null},busy=false;
 const logFile=path.join(app.getPath('userData'),'updater.log');
 function log(message){try{if(fs.existsSync(logFile)&&fs.statSync(logFile).size>1024*1024)fs.renameSync(logFile,logFile+'.1');fs.appendFileSync(logFile,`${new Date().toISOString()} [Updater] ${message}\n`);}catch{}}
 // Never log raw transport errors, headers, URLs or release bodies.
 updater.logger={info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
 function emit(patch){state={...state,...patch};if(!win.isDestroyed())win.webContents.send('updater:state',state);}
 function fail(error){log(`Update operation failed${error?.message?`: ${error.message}`:''}`);emit({status:'error',message:'暂时无法检查或下载更新，请检查网络连接后重试。'});}
 updater.on('error',fail);
 updater.on('checking-for-update',()=>{log('Checking for update...');emit({status:'checking',message:''});});
 updater.on('update-not-available',info=>emit({status:'current',latestVersion:semver.valid(info?.version)||app.getVersion(),notes:'',message:'当前已是最新版本。'}));
 updater.on('update-available',info=>{
  log(`Latest version: ${semver.valid(info.version)||'invalid'}`);log('Update available');
  const notes=Array.isArray(info.releaseNotes)?info.releaseNotes.map(n=>n.note||'').join('\n'):String(info.releaseNotes||'暂无更新说明');
  emit({status:'available',latestVersion:info.version,notes:notes.slice(0,50000),message:''});
 });
 let lastPercent=-1,downloadToken;
 updater.on('download-progress',p=>{const percent=Math.floor(p.percent);if(percent!==lastPercent){lastPercent=percent;log(`Download progress: ${percent}%`);}emit({status:'downloading',progress:{percent:p.percent,transferred:p.transferred,total:p.total,bytesPerSecond:p.bytesPerSecond}});});
 updater.on('update-downloaded',()=>{log('Download complete; verifying SHA256');emit({status:'verifying',message:'正在验证安装包…',progress:null});});
 updater.on('update-cancelled',()=>emit({status:'available',progress:null,message:'已取消下载，可以稍后重试。'}));
 async function check(){if(!enabled||busy||['downloaded','downloading','verifying'].includes(state.status))return state;busy=true;try{await updater.checkForUpdates();}catch(error){fail(error);}finally{busy=false;}return state;}
 async function download(){if(!enabled||busy||!state.latestVersion||!['available','error'].includes(state.status))return state;busy=true;lastPercent=-1;emit({status:'downloading',message:'',progress:null});log('Downloading update');try{downloadToken=new (require('builder-util-runtime').CancellationToken)();const files=await updater.downloadUpdate(downloadToken);await verifyDownload(files,state.latestVersion);if(downloadToken.cancelled)throw Error('Cancelled');emit({status:'downloaded',message:'SHA256 校验通过（旧版 Release 使用 SHA512），可以重启安装。',progress:null});}catch(e){if(downloadToken?.cancelled)emit({status:'available',message:'已取消下载，可以稍后重试。'});else fail(e);}finally{busy=false;}return state;}
 const actions={details:()=>{const source=require('./release.config.json');return require('electron').shell.openExternal('https://github.com/'+source.owner+'/'+source.repo+'/releases'+(semver.valid(state.latestVersion)?'/tag/v'+state.latestVersion:''))},state:()=>state,check,download,cancel:()=>{downloadToken?.cancel();return state;},install:()=>{if(enabled&&state.status==='downloaded'){log('Installing update');setImmediate(()=>updater.quitAndInstall(false,true));}return state;}};
 for(const [action,handler]of Object.entries(actions))ipcMain.handle('updater:'+action,event=>{if(event.sender!==win.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==mainUrl)throw Error('来源无效');return handler();});
 log(`Current version: ${app.getVersion()}`);
 let timer;win.webContents.once('did-finish-load',()=>{if(enabled)timer=setTimeout(check,5000);});win.on('closed',()=>clearTimeout(timer));
 return {getState:()=>state};
}
module.exports={register,evaluatePolicy};
