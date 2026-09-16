function referenceBody(input){
 const refs=input.references;
 if(!Array.isArray(refs)||refs.length<1||refs.length>9)throw Error('多图参考需要 1–9 张图片');
 let total=0;
 const images=refs.map(r=>{if(r?.kind!=='image'||typeof r.url!=='string')throw Error('参考素材必须是图片');const match=r.url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw Error('参考图片格式无效');const bytes=Buffer.from(match[2],'base64').length;if(!bytes||bytes>10*1024*1024)throw Error('每张参考图片不得超过 10 MB');total+=bytes;return r.url});
 if(total>30*1024*1024)throw Error('参考图片总大小不得超过 30 MB');
 const prompt=String(input.prompt).replace(/@参考图\s*(\d{1,2})/g,(token,number)=>{
  const index=Number(number);if(index<1||index>images.length)throw Error(`${token} 不存在，请检查参考图序号`);return `<Picture ${index}>`;
 });
 return {model:'H3',mode:'references',prompt,duration:input.duration,resolution:Number(String(input.resolution).replace('p','')),aspect_ratio:input.aspectRatio,reference_images:images};
}
module.exports={referenceBody};
