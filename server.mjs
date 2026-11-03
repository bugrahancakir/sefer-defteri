/* Cloudflare dışında (kendi sunucunuzda) veya test için çalıştırma: node dev/server.mjs
   Ek paket gerekmez, Node 22+ ve yerleşik SQLite kullanır. Veri VERI_DOSYASI yolunda durur. */
import {DatabaseSync} from 'node:sqlite';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../src/worker.js';

const kok=fileURLToPath(new URL('../public',import.meta.url));
const ham=new DatabaseSync(process.env.VERI_DOSYASI||'sefer.db');
function hazirla(sql){let p=[];const st=()=>ham.prepare(sql);const o={
  bind(...a){const n=hazirla(sql);n._p=a;return n},_p:p,
  async first(){const r=st().get(...o._p);return r?{...r}:null},
  async all(){return{results:st().all(...o._p).map(x=>({...x}))}},
  async run(){st().run(...o._p);return{success:true}},
  _calis(){st().run(...o._p)}};return o}
const DB={prepare:hazirla,async batch(l){ham.exec('BEGIN');try{l.forEach(x=>x._calis());ham.exec('COMMIT')}catch(e){ham.exec('ROLLBACK');throw e}}};
const env={DB,MOBILIZ_BASE:process.env.MOBILIZ_BASE};
const TUR={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port=+process.env.PORT||8787;
http.createServer(async(q,s)=>{
  const url=`http://${q.headers.host}${q.url}`,yol=new URL(url).pathname;
  if(!yol.startsWith('/api/')){
    const d=normalize(yol==='/'?'/index.html':yol);
    try{const b=await readFile(join(kok,d));s.writeHead(200,{'content-type':TUR[extname(d)]||'application/octet-stream'});s.end(b)}catch{s.writeHead(404);s.end('Bulunamadı')}
    return}
  const p=[];for await(const c of q)p.push(c);
  const r=await worker.fetch(new Request(url,{method:q.method,headers:q.headers,body:['GET','HEAD'].includes(q.method)?undefined:Buffer.concat(p)}),env);
  s.writeHead(r.status,Object.fromEntries(r.headers));s.end(Buffer.from(await r.arrayBuffer()));
}).listen(port,()=>console.log('Sefer Defteri: http://localhost:'+port));
setInterval(()=>worker.scheduled({},env,{}).catch(e=>console.error(e)),3e5).unref?.();
