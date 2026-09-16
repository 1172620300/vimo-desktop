const { app, BrowserWindow, session, ipcMain, safeStorage, dialog } = require('electron');
const path = require('node:path');
// Preserve the original profile, including encrypted credentials and IndexedDB.
app.setPath('userData', path.join(app.getPath('appData'), 'scene-studio-ui'));
if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(() => {
  const mainUrl=require('node:url').pathToFileURL(path.join(__dirname,'index.html')).href;
  const account=require('./account.cjs').register({app,ipcMain,safeStorage},'desktop',mainUrl);
  const settings=require('./video-settings.cjs').register({ipcMain,app,safeStorage},event=>event.senderFrame?.url===mainUrl && event.senderFrame===event.sender.mainFrame);
  const client=require('./video-router.cjs').createRouter({settings,account,mediaDir:path.join(app.getPath('userData'),'generated-videos')});
  for(const action of ['verify','submit','status','download'])ipcMain.handle('video-api:'+action,async(event,input)=>{
    if(event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==mainUrl)throw Error('来源无效');
    if(action==='submit'&&input?.mode){
      if(!['text','frames','references'].includes(input.mode))throw Error('生成模式无效');
      const refs=input.references||[];
      if(input.mode==='references'&&(!Array.isArray(refs)||refs.length<1||refs.length>9||refs.some(r=>r?.kind!=='image'||!/^data:image\/(png|jpeg|webp);base64,/.test(r.url)||r.url.length>14*1024*1024)))throw Error('请提供 1–9 张参考图片，每张不超过 10 MB');
      if(input.mode==='text'&&refs.length)throw Error('文生视频不接受参考图片');
      if(input.mode==='frames'&&(refs.length!==2||refs.some(r=>r?.kind!=='image'||!/^data:image\/(png|jpeg|webp);base64,/.test(r.url)||r.url.length>14*1024*1024)))throw Error('请提供两张有效的首尾帧图片（每张不超过 10 MB）');
    }
    return client[action](input);
  });
  ipcMain.handle('video-api:export',async(event,id)=>{
    if(event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==mainUrl)throw Error('来源无效');
    const result=await client.download(id);
    const choice=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender),{title:'保存生成视频',defaultPath:path.join(app.getPath('downloads'),id+'.mp4'),filters:[{name:'MP4 视频',extensions:['mp4']}]});
    if(choice.canceled)return {canceled:true};
    await require('node:fs/promises').copyFile(require('node:url').fileURLToPath(result.url),choice.filePath);
    return {saved:true};
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: /^https?:/.test(details.url)}));
  const win = new BrowserWindow({width:1400,height:900,minWidth:900,minHeight:640,title:'Vimo Desktop',backgroundColor:'#f4f5f7',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  require('./updater.cjs').register({app,ipcMain,win,mainUrl});
  app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.show();win.focus();});
  win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed', () => app.quit());
