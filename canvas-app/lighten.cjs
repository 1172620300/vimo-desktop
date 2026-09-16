const fs=require('fs');const p=__dirname+'/source.css';let s=fs.readFileSync(p,'utf8');
const colors={'#d4d4d8':'#536176','#e4e4e7':'#465469','#c4b5fd':'#7c61b5','#fca5a5':'#bb434d','#fecaca':'#b9454e','#ddd6fe':'#7253ac','#a7f3d0':'#28806a','#3a2427':'#fff0f1','#2e2744':'#f2edfc','#18372d':'#edf8f4','#18181b':'#ffffff','#202024':'#f8fafc','#fafafa':'#29364b','#2b2325':'#fff1f2','#09090b':'#f8fafc','#27272a':'#f1f4f9'};
s=s.replace(/#[0-9a-f]{6}\b/gi,c=>colors[c.toLowerCase()]||c);fs.writeFileSync(p,s);
