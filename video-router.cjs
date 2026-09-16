const {createClient}=require('./video-client.cjs');
// Freeze each operation's selected endpoint and credential across async requests.
function createRouter({settings,account,mediaDir,fetchImpl}){
 async function run(action,input){
  const selected=settings.readPrivate();let credentials;
  if(selected.source==='account'){await account.requireUser();credentials=account.credentials();}
  else credentials=selected;
  const client=createClient({readPrivate:()=>credentials,mediaDir,fetchImpl});
  return client[action](input);
 }
 return Object.fromEntries(['verify','submit','status','download'].map(action=>[action,input=>run(action,input)]));
}
module.exports={createRouter};
