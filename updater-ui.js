(()=>{
 const api=window.vimoUpdater;if(!api)return;
 const about=document.createElement('div');about.className='settings-card';about.innerHTML='<h3>关于 Vimo</h3><p>Vimo · 当前版本：<b data-app-version></b></p><p id="update-auto"></p><p id="update-status" role="status"></p><button id="update-check">检查更新</button><button id="update-action" hidden></button>';
 document.querySelector('#settings').append(about);
 const panel=document.createElement('section');panel.className='vimo-update-panel';panel.hidden=true;panel.setAttribute('aria-label','Vimo 更新');panel.innerHTML='<h3 id="update-title"></h3><p id="update-versions"></p><pre id="update-notes"></pre><progress id="update-progress" max="100" hidden></progress><p id="update-detail" role="status"></p><button id="update-later">稍后更新</button><button id="update-cancel" hidden>取消下载</button><button id="update-now">立即更新</button>';
 document.body.append(panel);const el=id=>document.getElementById(id);let current,previous;
 const size=n=>((n||0)/1024/1024).toFixed(1)+' MB';
 function render(s){current=s;document.querySelectorAll('[data-app-version]').forEach(e=>e.textContent=s.currentVersion);el('update-auto').textContent='自动检查更新：'+(s.enabled?'开启':'开发环境已禁用');el('update-check').disabled=!s.enabled||['checking','downloading','downloaded'].includes(s.status);
 el('update-status').textContent=s.message||(s.latestVersion?'最新版本：'+s.latestVersion:'');
 const ready=s.status==='downloaded',available=s.status==='available'||(s.status==='error'&&s.latestVersion),downloading=s.status==='downloading';
 el('update-action').hidden=!(ready||available);el('update-action').textContent=ready?'立即重启并更新':'立即更新';
 if(['available','downloaded'].includes(s.status)&&previous!==s.status)panel.hidden=false;
 el('update-title').textContent=ready?`Vimo ${s.latestVersion} 已准备就绪`:downloading?`正在下载 Vimo ${s.latestVersion}`:'发现新版本';
 el('update-versions').textContent=`当前版本：${s.currentVersion}　新版本：${s.latestVersion||'—'}`;
 el('update-notes').textContent=s.notes||'';
 el('update-progress').hidden=!downloading;el('update-progress').value=s.progress?.percent||0;
 el('update-detail').textContent=downloading&&s.progress?`${s.progress.percent.toFixed(1)}% · ${size(s.progress.transferred)} / ${size(s.progress.total)} · ${size(s.progress.bytesPerSecond)}/s`:s.message||'';
 el('update-now').hidden=!(available||ready);el('update-now').textContent=ready?'立即重启并更新':s.status==='error'?'重试下载':'立即更新';el('update-cancel').hidden=!downloading;el('update-later').textContent=ready?'稍后重启':'稍后更新';previous=s.status;
 }
 const act=()=>{panel.hidden=false;return current.status==='downloaded'?api.install():api.download();};
 const safe=fn=>()=>Promise.resolve().then(fn).catch(()=>{el('update-status').textContent='更新操作失败，请稍后重试。';});
 el('update-check').onclick=safe(async()=>{const s=await api.check();render(s);if(s.latestVersion)panel.hidden=false;});el('update-action').onclick=safe(act);el('update-now').onclick=safe(act);el('update-cancel').onclick=safe(()=>api.cancel());el('update-later').onclick=()=>{panel.hidden=true;};api.subscribe(render);api.state().then(render).catch(()=>{});
})();
