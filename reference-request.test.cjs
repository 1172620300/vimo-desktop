const {test}=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('./video-client.cjs');
test('reference API keeps all images and never sends first/last fields',async()=>{
 let body;const client=createClient({mediaDir:'.',readPrivate:()=>({apiKey:'test',model:'H3',baseUrl:'https://example.com/v1'}),fetchImpl:async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'H3'}],worker_online:true});if(url.endsWith('/video-capabilities'))return Response.json({modes:['references']});body=JSON.parse(options.body);return Response.json({id:'video_'+'a'.repeat(32)})}});
 const input={mode:'references',prompt:'让 @参考图1 遇到 @参考图2',duration:5,resolution:'480p',aspectRatio:'16:9',references:Array.from({length:3},(_,i)=>({kind:'image',url:'data:image/png;base64,'+Buffer.from('image'+i).toString('base64')}))};
 await client.submit(input);assert.equal(body.mode,'references');assert.equal(body.reference_images.length,3);assert.equal(body.first_frame,undefined);assert.equal(body.last_frame,undefined);assert.equal(body.prompt,'让 <Picture 1> 遇到 <Picture 2>');assert.equal(input.prompt,'让 @参考图1 遇到 @参考图2');
 await assert.rejects(client.submit({...input,prompt:'@参考图4'}),/不存在/);
 await assert.rejects(client.submit({...input,references:[]}),/1–9/);
 await assert.rejects(client.submit({...input,references:Array(10).fill(input.references[0])}),/1–9/);
});
