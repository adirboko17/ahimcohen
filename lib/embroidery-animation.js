// <emb-stitch>: canvas close-up of sample logos being embroidered stitch by stitch on dark woven fabric.
export function registerEmbroidery(){
if(customElements.get('emb-stitch'))return;
const Y=[48,100,50],WT=[45,10,86];
const LOGOS=[
  {name:'גלבוע',tag:'בנייה ותשתיות',mark:'tri',c:Y,mc:Y},
  {name:'אורן',tag:'חשמל ובקרה',mark:'ring',c:WT,mc:Y},
  {name:'צוק',tag:'מיגון ובטיחות',mark:'diamond',c:WT,mc:Y},
  {name:'נמל',tag:'לוגיסטיקה',mark:'bars',c:Y,mc:WT}
];
const STITCH_MS=5200,HOLD_MS=2800,FADE_MS=1000;
class EmbStitch extends HTMLElement{
  static observedAttributes = ['data-paused'];
  attributeChangedCallback(){this._syncPlayback();}
  connectedCallback(){
    if(!this._wrap){
      const w=this._wrap=document.createElement('div');w.style.cssText='position:relative;width:100%;height:100%;overflow:hidden;background:#111';
      const z=this._zoom=document.createElement('div');z.style.cssText='position:absolute;inset:0';
      this._fab=document.createElement('canvas');this._top=document.createElement('canvas');
      for(const c of [this._fab,this._top]){c.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';z.appendChild(c);}
      w.appendChild(z);this.appendChild(w);
    }
    const style=getComputedStyle(this);
    this._displayFont=style.getPropertyValue('--font-display').trim()||'sans-serif';
    this._bodyFont=style.getPropertyValue('--font-assistant').trim()||'sans-serif';
    this._media=matchMedia('(prefers-reduced-motion: reduce)');
    this._reduce=this._media.matches;
    this._vis=false;this._i=0;this._W=0;this._H=0;this._ready=false;
    this._onMotion=()=>{this._reduce=this._media.matches;this._setupDrift();if(this._ready)this._start();};
    this._media.addEventListener('change',this._onMotion);
    this._onVisibility=()=>this._syncPlayback();
    document.addEventListener('visibilitychange',this._onVisibility);
    this._ro=new ResizeObserver(()=>{clearTimeout(this._rt);this._rt=setTimeout(()=>{if(this.isConnected&&this._ready)this._build();},150);});this._ro.observe(this);
    this._io=new IntersectionObserver(e=>{this._vis=e[0].isIntersecting;this._syncPlayback();});this._io.observe(this);
    this._setupDrift();
    const connection=this._connection=Symbol();
    const go=()=>{if(this.isConnected&&this._connection===connection){this._ready=true;this._build();}};
    Promise.all([document.fonts.load('700 100px '+this._displayFont,'גלבוע'),document.fonts.load('800 20px '+this._bodyFont,'בנייה')]).then(go,go);
  }
  disconnectedCallback(){
    this._connection=null;cancelAnimationFrame(this._raf);this._raf=0;clearTimeout(this._rt);
    this._ro?.disconnect();this._io?.disconnect();this._drift?.cancel();
    this._media?.removeEventListener('change',this._onMotion);
    document.removeEventListener('visibilitychange',this._onVisibility);
  }
  _setupDrift(){
    this._drift?.cancel();this._drift=null;
    if(!this._reduce)this._drift=this._zoom.animate([{transform:'scale(1)'},{transform:'scale(1.05)'}],{duration:24000,direction:'alternate',iterations:Infinity,easing:'ease-in-out'});
    this._syncPlayback();
  }
  _running(){return this.isConnected&&this._ready&&this._vis&&!document.hidden&&!this._reduce&&this.getAttribute('data-paused')!=='true';}
  _syncPlayback(){
    const running=this._running();
    if(this._drift){if(running)this._drift.play();else this._drift.pause();}
    if(!running){cancelAnimationFrame(this._raf);this._raf=0;}
    else if(!this._raf&&this._tick){this._last=performance.now();this._raf=requestAnimationFrame(this._tick);}
  }
  _build(){
    const W=this.clientWidth,H=this.clientHeight;if(!W||!H)return;
    if(W===this._W&&H===this._H)return;
    const resizing=!!this._W;this._W=W;this._H=H;
    const dpr=this._dpr=Math.min(window.devicePixelRatio||1,2),cw=this._cw=Math.round(W*dpr),ch=this._ch=Math.round(H*dpr);
    for(const c of [this._fab,this._top]){c.width=cw;c.height=ch;}
    this._fabric();this._start(resizing);
  }
  _fabric(){
    const c=this._fab.getContext('2d'),cw=this._cw,ch=this._ch,s=Math.max(2,Math.round(2.4*this._dpr));
    const t=document.createElement('canvas');t.width=t.height=s*2;const x=t.getContext('2d');
    x.fillStyle='#090909';x.fillRect(0,0,s*2,s*2);
    const cell=(px,py,hz)=>{const g=hz?x.createLinearGradient(0,py,0,py+s):x.createLinearGradient(px,0,px+s,0);
      g.addColorStop(0,'#121212');g.addColorStop(.5,hz?'#2c2c2c':'#232323');g.addColorStop(1,'#121212');x.fillStyle=g;
      hz?x.fillRect(px,py+.5,s,s-1):x.fillRect(px+.5,py,s-1,s);};
    cell(0,0,true);cell(s,s,true);cell(s,0,false);cell(0,s,false);
    c.fillStyle=c.createPattern(t,'repeat');c.fillRect(0,0,cw,ch);
    const n=document.createElement('canvas');n.width=n.height=128;const nx=n.getContext('2d'),id=nx.createImageData(128,128);
    for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255|0;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=16;}
    nx.putImageData(id,0,0);c.fillStyle=c.createPattern(n,'repeat');c.fillRect(0,0,cw,ch);
    const R=Math.max(cw,ch);
    let g=c.createRadialGradient(cw*.42,ch*.36,0,cw*.42,ch*.36,R*.75);g.addColorStop(0,'rgba(255,255,255,.09)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,cw,ch);
    g=c.createRadialGradient(cw/2,ch/2,R*.28,cw/2,ch/2,R*.72);g.addColorStop(0,'rgba(17,17,17,0)');g.addColorStop(1,'rgba(17,17,17,.9)');c.fillStyle=g;c.fillRect(0,0,cw,ch);
  }
  _parts(L){
    const cw=this._cw,ch=this._ch,m=document.createElement('canvas').getContext('2d');
    let fs=Math.min(cw*.3,ch*.36);
    const meas=()=>{m.font='700 '+fs+'px '+this._displayFont;return [...L.name].map(c=>m.measureText(c).width);};
    let ws=meas(),nw=ws.reduce((a,b)=>a+b,0);
    if(nw>cw*.72){fs*=cw*.72/nw;ws=meas();nw=ws.reduce((a,b)=>a+b,0);}
    m.font='700 '+fs+'px '+this._displayFont;const asc=m.measureText(L.name).actualBoundingBoxAscent||fs*.62;
    const mh=fs*.3,gap=fs*.17,tfs=fs*.17,th=tfs*.66,total=mh+gap+asc+gap+th;
    let y=ch/2-total/2;const cx=cw/2,parts=[];this._fs=fs;
    const my=y+mh/2;
    parts.push({cx,cy:my,r:fs*.42,col:L.mc,ang:.95,sp:1,draw:c=>{c.beginPath();
      if(L.mark==='tri'){c.moveTo(cx,my-mh/2);c.lineTo(cx+mh*.62,my+mh/2);c.lineTo(cx-mh*.62,my+mh/2);c.closePath();c.fill();}
      else if(L.mark==='ring'){c.arc(cx,my,mh/2,0,7);c.arc(cx,my,mh*.26,0,7,true);c.fill('evenodd');}
      else if(L.mark==='diamond'){c.moveTo(cx,my-mh/2);c.lineTo(cx+mh/2,my);c.lineTo(cx,my+mh/2);c.lineTo(cx-mh/2,my);c.closePath();c.fill();}
      else{for(let k=0;k<3;k++)c.rect(cx-mh*.75,my-mh/2+k*mh*.4,mh*1.5,mh*.2);c.fill();}}});
    y+=mh+gap;const base=y+asc;let x0=cx+nw/2;
    [...L.name].forEach((chr,k)=>{const w=ws[k],xr=x0;x0-=w;
      parts.push({cx:xr-w/2,cy:base-asc/2,r:Math.hypot(w,asc)/2+fs*.2,col:L.c,ang:k%2?-.34:-.2,sp:1,draw:c=>{c.font='700 '+fs+'px '+this._displayFont;c.direction='ltr';c.textAlign='right';c.textBaseline='alphabetic';c.fillText(chr,xr,base);}});});
    y=base+gap;m.font='800 '+tfs+'px '+this._bodyFont;const ls=tfs*.12;if('letterSpacing' in m)m.letterSpacing=ls+'px';const tw=m.measureText(L.tag).width;
    parts.push({cx,cy:y+th/2,r:tw/2+tfs,col:L.c,ang:1.15,sp:.62,draw:c=>{c.font='800 '+tfs+'px '+this._bodyFont;if('letterSpacing' in c)c.letterSpacing=ls+'px';c.direction='rtl';c.textAlign='center';c.textBaseline='alphabetic';c.fillText(L.tag,cx,y+th);}});
    return parts;
  }
  _scan(p,out){
    const fs=this._fs,sp=Math.max(1.6,fs*.0135)*p.sp,maxLen=fs*.12*(p.sp<1?.6:1),r=Math.ceil(p.r),D=r*2;
    const mc=document.createElement('canvas');mc.width=mc.height=D;const c=mc.getContext('2d',{willReadFrequently:true});
    c.translate(r,r);c.rotate(-p.ang);c.translate(-p.cx,-p.cy);c.fillStyle='#000';p.draw(c);
    const d=c.getImageData(0,0,D,D).data,cos=Math.cos(p.ang),sin=Math.sin(p.ang);
    const pt=(mx,my)=>{const dx=mx-r,dy=my-r;return [dx*cos-dy*sin+p.cx,dx*sin+dy*cos+p.cy];};
    const tw=sp*1.18;let row=0;
    for(let yy=sp/2;yy<D;yy+=sp,row++){
      const o=(yy|0)*D*4+3;let x=0;const runs=[];
      while(x<D){while(x<D&&d[o+x*4]<128)x++;if(x>=D)break;const a=x;while(x<D&&d[o+x*4]>=128)x++;if(x-a>=1.5)runs.push([a,x]);}
      for(let q=runs.length-1;q>=0;q--){
        const [a,b]=runs[q],len=b-a,n=len<=maxLen*1.5?1:Math.ceil(len/maxLen),seg=len/n,off=n>1?((row%3)/3-.33)*seg*.7:0;
        const cuts=[a];for(let k=1;k<n;k++)cuts.push(Math.min(b-2,Math.max(a+2,a+k*seg+off)));cuts.push(b);
        for(let k=cuts.length-2;k>=0;k--){
          const j=()=>(Math.random()-.5)*sp*.35,A=pt(cuts[k]+j(),yy+j()),B=pt(cuts[k+1]+j(),yy+j());
          out.push({ax:A[0],ay:A[1],bx:B[0],by:B[1],w:tw,col:p.col,dl:(Math.random()-.5)*9});
        }
      }
    }
  }
  _stitch(c,s){
    const [h,sa,l]=s.col,w=s.w,L=l+s.dl;c.lineCap='round';
    c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=w;c.beginPath();c.moveTo(s.ax,s.ay+w*.55);c.lineTo(s.bx,s.by+w*.55);c.stroke();
    const g=c.createLinearGradient(s.ax,s.ay,s.bx,s.by),e='hsl('+h+','+sa+'%,'+(L-22)+'%)';
    g.addColorStop(0,e);g.addColorStop(.5,'hsl('+h+','+sa+'%,'+(L+4)+'%)');g.addColorStop(1,e);
    c.strokeStyle=g;c.lineWidth=w*.94;c.beginPath();c.moveTo(s.ax,s.ay);c.lineTo(s.bx,s.by);c.stroke();
    const dx=s.bx-s.ax,dy=s.by-s.ay;
    c.strokeStyle='hsla('+h+','+sa+'%,'+Math.min(97,L+30)+'%,.38)';c.lineWidth=w*.28;c.beginPath();
    c.moveTo(s.ax+dx*.3,s.ay+dy*.3-w*.2);c.lineTo(s.ax+dx*.7,s.ay+dy*.7-w*.2);c.stroke();
  }
  _start(complete=false){
    cancelAnimationFrame(this._raf);this._raf=0;this._tick=null;
    const c=this._top.getContext('2d');c.clearRect(0,0,this._cw,this._ch);
    this._top.style.transition='none';this._top.style.opacity='1';
    const st=[];for(const p of this._parts(LOGOS[this._i%LOGOS.length]))this._scan(p,st);
    if(this._reduce){for(const s of st)this._stitch(c,s);return;}
    let drawn=0,clock=0,phase=0;
    // Resizing clears canvas pixels. Restore a complete logo immediately,
    // including while paused, then continue the normal hold/fade cycle.
    if(complete||this.getAttribute('data-paused')==='true'){
      for(const s of st)this._stitch(c,s);drawn=st.length;phase=1;
    }
    this._tick=now=>{
      this._raf=0;if(!this._running())return;
      const dt=Math.min(64,now-this._last);this._last=now;
      {
        clock+=dt;
        if(phase===0){const n=Math.floor(Math.min(1,clock/STITCH_MS)*st.length);for(;drawn<n;drawn++)this._stitch(c,st[drawn]);if(drawn>=st.length){phase=1;clock=0;}}
        else if(phase===1){if(clock>HOLD_MS){phase=2;clock=0;}}
        else {this._top.style.opacity=String(Math.max(0,1-clock/FADE_MS));if(clock>FADE_MS){this._i++;this._start();return;}}
      }
      this._raf=requestAnimationFrame(this._tick);
    };
    this._syncPlayback();
  }
}
customElements.define('emb-stitch',EmbStitch);
}
