const fs=require('fs'),sharp=require('sharp');
const baseline=new Set(require('../../assets/brand-followup-baseline.json').map(x=>x.handle));
const products=require('../../assets/brand-catalog-audit.json').products.filter(x=>baseline.has(x.handle));
const legacy=require('../../assets/brand-legacy-supplier.json').products;
const extra=new Set(['155','3996','3469','3540','839','4044-2','3302','375','MB26']);
const selected=products.filter(p=>{const sku=p.variants.nodes[0].sku;const item=legacy.find(x=>x.sku===sku.replace(/-\d+$/,''));return !item?.brands.length||item.brands[0].name==='יוניסקס'||extra.has(sku)});
fs.writeFileSync('tmp/brand-research/image-index.json',JSON.stringify(selected.map((p,i)=>({i,sku:p.variants.nodes[0].sku,title:p.title,handle:p.handle,url:p.featuredImage?.url})),null,2));
(async()=>{
 let index=0; const rendered=[];
 await Promise.all(Array.from({length:6},async()=>{while(index<selected.length){const i=index++,p=selected[i],sku=p.variants.nodes[0].sku;try{const path=`tmp/brand-research/product-${i}.jpg`;let bytes;if(fs.existsSync(path))bytes=fs.readFileSync(path);else{const r=await fetch(p.featuredImage.url+'&width=800');if(!r.ok)throw new Error(r.status);bytes=Buffer.from(await r.arrayBuffer());fs.writeFileSync(path,bytes)}const thumb=await sharp(bytes).resize(220,190,{fit:'contain',background:'white'}).jpeg().toBuffer();const label=Buffer.from(`<svg width="220" height="30"><rect width="220" height="30" fill="#eee"/><text x="8" y="21" font-size="17">${i}: ${sku}</text></svg>`);rendered[i]=await sharp({create:{width:220,height:220,channels:3,background:'white'}}).composite([{input:thumb,left:0,top:30},{input:label,left:0,top:0}]).jpeg().toBuffer()}catch(e){console.log(i,sku,e.message)}}}));
 for(let start=0;start<selected.length;start+=30){const n=Math.min(30,selected.length-start);await sharp({create:{width:1320,height:Math.ceil(n/6)*220,channels:3,background:'white'}}).composite(rendered.slice(start,start+30).flatMap((input,i)=>input?[{input,left:(i%6)*220,top:Math.floor(i/6)*220}]:[])).jpeg({quality:90}).toFile(`tmp/brand-research/sheet-${start/30}.jpg`)}
 console.log('Image review sheets:',Math.ceil(selected.length/30),'Products:',selected.length);
})();
