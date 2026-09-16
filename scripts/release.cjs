const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const config=require('../release.config.json');
if(!/^[\w.-]+$/.test(config.owner)||!/^[\w.-]+$/.test(config.repo))throw Error('请先在 release.config.json 配置 GitHub owner 和 repo');
const publish=process.argv.includes('--publish');
if(publish&&!process.env.GH_TOKEN)throw Error('发布需要本地环境变量 GH_TOKEN 或 CI Secret');
const version=require('../package.json').version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('正式发布必须使用 x.y.z 版本');
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`v${version}`)throw Error('Tag 和 package.json 版本不一致');
const out=path.resolve(root,'dist');if(path.dirname(out)!==root)throw Error('输出路径错误');
fs.rmSync(out,{recursive:true,force:true});
function run(file,args){const r=spawnSync(process.execPath,[file,...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
run('canvas-app/build.cjs',[]);
run('node_modules/electron-builder/out/cli/cli.js',['--win','nsis','--x64','--config','electron-builder.cjs','--publish',publish?'always':'never']);
