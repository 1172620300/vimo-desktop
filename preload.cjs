const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('vimoAccount',{login:input=>ipcRenderer.invoke('account:login',input),logout:()=>ipcRenderer.invoke('account:logout'),status:()=>ipcRenderer.invoke('account:status')});
contextBridge.exposeInMainWorld('videoApiSettings',{read:()=>ipcRenderer.invoke('video-api:read'),save:input=>ipcRenderer.invoke('video-api:save',input)});

contextBridge.exposeInMainWorld('videoGeneration',{verify:input=>ipcRenderer.invoke('video-api:verify',input),submit:input=>ipcRenderer.invoke('video-api:submit',input),status:id=>ipcRenderer.invoke('video-api:status',id),download:id=>ipcRenderer.invoke('video-api:download',id),export:id=>ipcRenderer.invoke('video-api:export',id)});

contextBridge.exposeInMainWorld('vimoUpdater',{state:()=>ipcRenderer.invoke('updater:state'),check:()=>ipcRenderer.invoke('updater:check'),download:()=>ipcRenderer.invoke('updater:download'),cancel:()=>ipcRenderer.invoke('updater:cancel'),install:()=>ipcRenderer.invoke('updater:install'),subscribe:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('updater:state',handler);return ()=>ipcRenderer.removeListener('updater:state',handler);}});
