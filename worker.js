/* Sefer Defteri sunucusu. Yalnızca Web standartlarını kullanır:
   Cloudflare Workers + D1 üzerinde de, dev/server.mjs ile düz Node üzerinde de çalışır.
   Para bilgisi yetkisi olmayan kullanıcıya bu dosyadan hiç çıkmaz. */

export const EKRANLAR = ['genel','seferler','filo','soforler','belgeler','cari','takip','fiyatlar','raporlar','kullanicilar','ayarlar'];
const PARA_EKRAN = ['cari','fiyatlar','raporlar'];
export const ROLLER = {
  yonetici:{ad:'Yönetici',ekranlar:EKRANLAR,para:true},
  sevkiyat:{ad:'Sevkiyat',ekranlar:['genel','seferler','filo','soforler','belgeler','takip'],para:false},
  muhasebe:{ad:'Muhasebe',ekranlar:['genel','seferler','cari','fiyatlar','raporlar'],para:true},
  filo:{ad:'Filo/Bakım',ekranlar:['genel','filo','soforler','belgeler','takip'],para:false},
};
const COLS = ['araclar','soforler','cariler','seferler','hareketler','bakimlar','konumlar','fiyatlar'];
const YAZMA = {araclar:'filo',soforler:'soforler',cariler:'cari',seferler:'seferler',hareketler:'cari',bakimlar:'filo',konumlar:'takip',fiyatlar:'fiyatlar'};
/* Para yetkisi olmayana gidebilecek alanlar: beyaz liste. Yeni alan eklenirse varsayılan olarak gizli kalır. */
const SEFER_ACIK = ['no','tarih','durum','cikis','varis','km','donus','donusKm','aracId','dorseId','soforId','cariId','yuk','not','bitisTarih','guncel'];
const SEFER_PARA = ['navlun','navlunElle','kdvOran','tevkifat','giderler','faturaNo'];
const CARI_ACIK = ['unvan','tur'];
const FIYAT_ACIK = ['cikis','varis','cariId','km','donusKm'];
const BAKIM_PARA = ['tutar'];
const ARAC_PARA = [];
const al = (o,ks)=>Object.fromEntries(ks.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
export const norm = s=>String(s??'').replace(/İ/g,'I').replace(/ı/g,'i').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const r2 = n=>Math.round((+n+Number.EPSILON)*100)/100;

class Hata extends Error{constructor(kod,m){super(m);this.kod=kod}}
const json = (o,kod=200,ek={})=>new Response(JSON.stringify(o),{status:kod,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...ek}});

/* ---------- şema ---------- */
let hazir = false;
async function kur(db){
  if(hazir) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS kayit(col TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,ts INTEGER NOT NULL,silindi INTEGER NOT NULL DEFAULT 0,kim TEXT,PRIMARY KEY(col,id))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS kayit_ts ON kayit(ts)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS kullanici(id TEXT PRIMARY KEY,ad TEXT NOT NULL,kadi TEXT NOT NULL UNIQUE,tuz TEXT NOT NULL,ozet TEXT NOT NULL,rol TEXT NOT NULL,ekranlar TEXT NOT NULL,para INTEGER NOT NULL,aktif INTEGER NOT NULL DEFAULT 1,degistir INTEGER NOT NULL DEFAULT 0,hata INTEGER NOT NULL DEFAULT 0,kilit INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS oturum(ozet TEXT PRIMARY KEY,kid TEXT NOT NULL,bitis INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ayar(k TEXT PRIMARY KEY,v TEXT NOT NULL)`),
  ]);
  hazir = true;
}
const ayarOku = async(db,k,d=null)=>{const r=await db.prepare('SELECT v FROM ayar WHERE k=?').bind(k).first();return r?JSON.parse(r.v):d};
const ayarYaz = (db,k,v)=>db.prepare('INSERT INTO ayar(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k,JSON.stringify(v)).run();

/* ---------- şifre ve oturum ---------- */
const hex = b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex = h=>Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));
const rastgele = n=>hex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(sifre,tuz){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(sifre),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(tuz),iterations:100000},k,256))}
const sha = async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
function esit(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
const OTURUM_GUN = 14;
async function oturumAc(db,kid,req){
  const t=rastgele(32),bitis=Date.now()+OTURUM_GUN*864e5;
  await db.prepare('DELETE FROM oturum WHERE bitis<?').bind(Date.now()).run();
  await db.prepare('INSERT INTO oturum(ozet,kid,bitis) VALUES(?,?,?)').bind(await sha(t),kid,bitis).run();
  const guv=new URL(req.url).protocol==='https:'?'; Secure':'';
  return `sd=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${OTURUM_GUN*86400}${guv}`;
}
function cerez(req){const m=(req.headers.get('cookie')||'').match(/(?:^|;\s*)sd=([0-9a-f]{64})/);return m?m[1]:null}
function kullaniciCoz(r){if(!r)return null;const para=!!r.para,ek=JSON.parse(r.ekranlar).filter(e=>para||!PARA_EKRAN.includes(e));return{id:r.id,ad:r.ad,kadi:r.kadi,rol:r.rol,ekranlar:ek,para,aktif:!!r.aktif,degistir:!!r.degistir}}
async function ben(db,req){
  const t=cerez(req);if(!t)return null;
  const r=await db.prepare('SELECT u.* FROM oturum o JOIN kullanici u ON u.id=o.kid WHERE o.ozet=? AND o.bitis>? AND u.aktif=1').bind(await sha(t),Date.now()).first();
  return kullaniciCoz(r);
}
const ekran = (u,e)=>u.ekranlar.includes(e);
const gerek = (u,e)=>{if(!ekran(u,e))throw new Hata(403,'Bu işlem için yetkiniz yok.')};

/* ---------- görünürlük: sunucudan çıkan her kayıt buradan geçer ---------- */
export function maskele(u,col,d){
  switch(col){
    case 'seferler': return u.para?d:al(d,SEFER_ACIK);
    case 'cariler':  return (u.para&&ekran(u,'cari'))?d:al(d,CARI_ACIK);
    case 'fiyatlar': return (u.para&&ekran(u,'fiyatlar'))?d:(ekran(u,'seferler')?al(d,FIYAT_ACIK):null);
    case 'hareketler': return (u.para&&ekran(u,'cari'))?d:null;
    case 'bakimlar': {if(!ekran(u,'filo'))return null;if(u.para)return d;const c={...d};BAKIM_PARA.forEach(k=>delete c[k]);return c}
    case 'araclar': case 'soforler': case 'konumlar': return d;
    default: return null;
  }
}

/* ---------- kayıt yardımcıları ---------- */
const docOku = async(db,col,id)=>{const r=await db.prepare('SELECT data FROM kayit WHERE col=? AND id=? AND silindi=0').bind(col,id).first();return r?JSON.parse(r.data):null};
const liste = async(db,col)=>{const r=await db.prepare('SELECT id,data FROM kayit WHERE col=? AND silindi=0').bind(col).all();return r.results.map(x=>({id:x.id,...JSON.parse(x.data)}))};
const docYaz = (db,col,id,d,kim)=>db.prepare('INSERT INTO kayit(col,id,data,ts,silindi,kim) VALUES(?,?,?,?,0,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,ts=excluded.ts,silindi=0,kim=excluded.kim').bind(col,id,JSON.stringify(d),Date.now(),kim);
async function sayac(db,yil){
  const k='sayac:'+yil;
  const r=await db.prepare(`INSERT INTO ayar(k,v) VALUES(?, '1') ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT) RETURNING v`).bind(k).first();
  return `S-${yil}-${String(r.v).padStart(4,'0')}`;
}
const bugun = ()=>new Date(Date.now()+3*36e5).toISOString().slice(0,10); /* Türkiye saati */

/* ---------- fiyat ve yakıt ---------- */
export function fiyatBul(fiyatlar,cariId,cikis,varis){
  const c=norm(cikis),v=norm(varis);
  return fiyatlar.find(f=>f.cariId===cariId&&norm(f.cikis)===c&&norm(f.varis)===v)||null;
}
/* Yakıt: gidiş km × dolu tüketim; boş dönüşte dönüş km × boş tüketim eklenir. Yüklü dönüş kendi seferidir, burada sayılmaz. */
export function yakitHesapla(sefer,arac,motorin){
  const km=+sefer.km||0,dk=sefer.donus==='Boş'?(+sefer.donusKm||km):0,dolu=+arac?.tuketimDolu||0,bos=+arac?.tuketimBos||dolu,f=+motorin||0;
  if(!km||!dolu||!f||!arac)return null;
  const litre=r2(km*dolu/100+dk*bos/100);
  return{litre,fiyat:f,tutar:r2(litre*f),gidisKm:km,donusKm:dk,tuketimDolu:dolu,tuketimBos:bos};
}
function fiyatVeYakit(s,fiyatlar,arac,motorin){
  const f=s.cariId?fiyatBul(fiyatlar,s.cariId,s.cikis,s.varis):null;
  if(f){if(!s.km)s.km=+f.km||null;if(!s.donusKm)s.donusKm=+f.donusKm||+f.km||null}
  if(s.navlunElle!=null&&s.navlunElle!==''){s.navlun=+s.navlunElle;s.fiyatYok=false}
  else if(f){s.navlun=+f.fiyat;s.fiyatYok=false}
  else{s.navlun=null;s.fiyatYok=true}
  s.yakit=yakitHesapla(s,arac,motorin);
  s.yakitEksik=!s.yakit;
  return s;
}
const belgeGecti = (a,t)=>[['muayene','Muayene'],['trafik','Trafik sigortası']].filter(([k])=>a[k]&&a[k]<t).map(x=>x[1]);

async function seferIsle(db,u,id,b,eski){
  const para=u.para;
  if(eski?.durum==='Tamamlandı'&&!para)throw new Hata(403,'Tamamlanan sefer yalnızca muhasebe veya yönetici tarafından değiştirilebilir.');
  const s={...(eski||{})};
  for(const k of SEFER_ACIK)if(k!=='no'&&k!=='guncel'&&k!=='bitisTarih'&&b[k]!==undefined)s[k]=b[k];
  if(para)for(const k of SEFER_PARA)if(b[k]!==undefined&&k!=='navlun')s[k]=b[k];
  if(!s.tarih)s.tarih=bugun();
  s.durum=['Planlandı','Yolda','Tamamlandı','İptal'].includes(s.durum)?s.durum:'Planlandı';
  if(!String(s.cikis||'').trim()||!String(s.varis||'').trim())throw new Hata(400,'Çıkış ve varış zorunlu.');
  if(!['Boş','Yüklü','Yok'].includes(s.donus))throw new Hata(400,'Dönüş durumunu seçin: boş, yüklü veya dönüş yok.');
  if(s.durum==='Tamamlandı'&&!s.cariId)throw new Hata(400,'Tamamlanan seferde müşteri seçili olmalı.');
  if(s.durum==='Tamamlandı'&&!s.aracId)throw new Hata(400,'Tamamlanan seferde araç seçili olmalı.');
  const arac=s.aracId?await docOku(db,'araclar',s.aracId):null;
  if(s.aracId&&!arac)throw new Hata(400,'Seçilen araç bulunamadı.');
  if(arac&&(s.aracId!==eski?.aracId||!eski)){
    if(['Arızalı','Bakımda','Pasif'].includes(arac.durum))throw new Hata(409,`${arac.plaka} şu an ${arac.durum.toLocaleLowerCase('tr')}, işe yazılamaz.`);
    const g=belgeGecti(arac,bugun());if(g.length)throw new Hata(409,`${arac.plaka}: ${g.join(', ')} süresi geçmiş, işe yazılamaz. Tarih yenilendiyse Filo ekranından güncelleyin.`);
  }
  if(s.durum==='Yolda'){
    const yol=(await liste(db,'seferler')).filter(x=>x.durum==='Yolda'&&x.id!==id);
    const a=yol.find(x=>s.aracId&&x.aracId===s.aracId);if(a)throw new Hata(409,`Bu araç zaten ${a.no} seferinde yolda.`);
    const o=yol.find(x=>s.soforId&&x.soforId===s.soforId);if(o)throw new Hata(409,`Bu şoför zaten ${o.no} seferinde yolda.`);
  }
  const degisti=!eski||['cariId','cikis','varis','km','donus','donusKm','aracId'].some(k=>String(s[k]??'')!==String(eski[k]??''))||String(s.navlunElle??'')!==String(eski.navlunElle??'');
  if(degisti){
    if(eski&&(s.cikis!==eski.cikis||s.varis!==eski.varis||s.cariId!==eski.cariId)&&b.km==null){s.km=null;s.donusKm=null}
    fiyatVeYakit(s,await liste(db,'fiyatlar'),arac,await ayarOku(db,'motorin'));
  }
  if(s.durum==='Tamamlandı'&&eski?.durum!=='Tamamlandı')s.bitisTarih=bugun();
  if(!s.no)s.no=await sayac(db,s.tarih.slice(0,4));
  return s;
}
async function eksikleriHesapla(db,kim){
  const[se,fi,ar,mo]=await Promise.all([liste(db,'seferler'),liste(db,'fiyatlar'),liste(db,'araclar'),ayarOku(db,'motorin')]);
  let n=0;const y=[];
  for(const x of se){if(!x.fiyatYok&&!x.yakitEksik)continue;const{id,...s}=x;fiyatVeYakit(s,fi,ar.find(a=>a.id===s.aracId),mo);y.push(docYaz(db,'seferler',id,s,kim));n++}
  for(let i=0;i<y.length;i+=50)await db.batch(y.slice(i,i+50));
  return n;
}

/* ---------- Mobiliz ---------- */
const KALIP={pl:['PLATE','PLAKA','LICENSEPLATE','VEHICLEPLATE','PLATENUMBER','PLATENO','ARACPLAKA','ARACPLAKASI','MUNAME','VEHICLENAME','NAME'],la:['LAT','LATITUDE','ENLEM','GPSLAT','GPSLATITUDE'],lo:['LNG','LON','LONG','LONGITUDE','BOYLAM','GPSLNG','GPSLON','GPSLONGITUDE'],hz:['SPEED','HIZ','VELOCITY','GPSSPEED'],zm:['TIME','EVENTTIME','MESSAGETIME','MESSAGEDATE','EVENTDATE','LASTACTIVITYTIME','ACTIVITYTIME','LASTSEEN','GPSTIME','DATE','DATETIME'],ad:['ADDRESS','ADRES','OPENADDRESS','FORMATTEDADDRESS','LOCATIONNAME']};
const duz=(o,r={})=>{for(const[k,v]of Object.entries(o||{})){if(v&&typeof v==='object'&&!Array.isArray(v))duz(v,r);else{const n=norm(k);if(!(n in r))r[n]=v}}return r};
const bul=(r,l)=>{for(const k of l){const v=r[k];if(v!==undefined&&v!==''&&v!==null)return v}};
const sayi=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n};
const zaman=v=>{if(typeof v==='number')return v>1e11?v:v>1e9?v*1e3:null;const t=Date.parse(String(v??''));return isNaN(t)?null:t};
const satirlar=j=>{if(Array.isArray(j))return j;if(j&&typeof j==='object'){for(const k of ['result','data','items','content','vehicles','list'])if(j[k])return satirlar(j[k]);}return[]};
export function konumCoz(j){const m=new Map();for(const h of satirlar(j)){const r=duz(h),pl=bul(r,KALIP.pl),la=sayi(bul(r,KALIP.la)),lo=sayi(bul(r,KALIP.lo));if(!pl||!norm(pl)||la==null||lo==null||(la===0&&lo===0))continue;const k={plaka:String(pl).trim().toLocaleUpperCase('tr'),lat:la,lng:lo,hiz:sayi(bul(r,KALIP.hz)),adres:String(bul(r,KALIP.ad)||'').trim(),zaman:zaman(bul(r,KALIP.zm))},n=norm(pl),o=m.get(n);if(!o||(k.zaman||0)>=(o.zaman||0))m.set(n,k)}return m}
async function mobilizCek(db,env){
  const tok=await ayarOku(db,'mobilizToken');if(!tok)return{ok:false,mesaj:'Mobiliz anahtarı girilmemiş.'};
  const su=(await ayarOku(db,'mobilizSunucu'))||'su0',taban=env.MOBILIZ_BASE||'https://ng.mobiliz.com.tr';
  const r=await fetch(`${taban}/${encodeURIComponent(su)}/api/integrations/activity/last`,{headers:{'content-type':'application/json','Mobiliz-Token':tok}});
  if(!r.ok)return{ok:false,mesaj:`Mobiliz ${r.status} döndürdü. Anahtarı ve sunucu adını kontrol edin.`};
  return{ok:true,json:await r.json()};
}
async function mobilizYenile(db,env){
  let d;try{
    const c=await mobilizCek(db,env);
    if(!c.ok)d={ok:false,mesaj:c.mesaj,zaman:Date.now()};
    else{
      const m=konumCoz(c.json),a=new Date().toISOString(),y=[...m.entries()].map(([n,k])=>docYaz(db,'konumlar',n.slice(0,60),{...k,aktarim:a,kaynak:'mobiliz'},'mobiliz'));
      for(let i=0;i<y.length;i+=50)await db.batch(y.slice(i,i+50));
      d={ok:true,mesaj:m.size?`${m.size} aracın konumu alındı.`:'Bağlantı kuruldu ama yanıtta plaka ve konum bulunamadı. Bağlantıyı test edin.',arac:m.size,zaman:Date.now()};
    }
  }catch(e){d={ok:false,mesaj:'Mobiliz\'e ulaşılamadı.',zaman:Date.now()}}
  await ayarYaz(db,'mobilizDurum',d);return d;
}

/* ---------- API ---------- */
async function govde(req){if(!(req.headers.get('content-type')||'').includes('application/json'))throw new Hata(415,'Geçersiz istek.');try{return await req.json()}catch{throw new Hata(400,'Geçersiz veri.')}}
const yeniId = ()=>rastgele(10);
function kullaniciGovde(b){
  const rol=ROLLER[b.rol]?b.rol:null;if(!rol)throw new Hata(400,'Rol seçin.');
  const para=b.para===undefined?ROLLER[rol].para:!!b.para;
  const ekranlar=(Array.isArray(b.ekranlar)?b.ekranlar:ROLLER[rol].ekranlar).filter(e=>EKRANLAR.includes(e)&&(para||!PARA_EKRAN.includes(e)));
  return{rol,para:para?1:0,ekranlar:JSON.stringify(ekranlar)};
}
const kullaniciDis = r=>({id:r.id,ad:r.ad,kadi:r.kadi,rol:r.rol,ekranlar:JSON.parse(r.ekranlar),para:!!r.para,aktif:!!r.aktif});
const sifreKontrol = s=>{if(typeof s!=='string'||s.length<8)throw new Hata(400,'Şifre en az 8 karakter olmalı.')};
async function ayarDis(db,u){
  const o={firma:await ayarOku(db,'firma',''),esik:await ayarOku(db,'esik',30)};
  if(u.para)o.motorin=await ayarOku(db,'motorin');
  if(ekran(u,'takip')||ekran(u,'ayarlar'))o.mobiliz=await ayarOku(db,'mobilizDurum');
  if(ekran(u,'ayarlar')){o.mobilizSunucu=await ayarOku(db,'mobilizSunucu','su0');o.mobilizAnahtarVar=!!(await ayarOku(db,'mobilizToken'))}
  return o;
}

async function api(req,env,yol){
  const db=env.DB,m=req.method;await kur(db);
  if(yol==='/api/durum'&&m==='GET'){const r=await db.prepare('SELECT COUNT(*) n FROM kullanici').first();return json({ilk:!r.n})}
  if(yol==='/api/kurulum'&&m==='POST'){
    const r=await db.prepare('SELECT COUNT(*) n FROM kullanici').first();if(r.n)throw new Hata(403,'Kurulum daha önce yapılmış.');
    const b=await govde(req);sifreKontrol(b.sifre);if(!b.ad||!b.kadi)throw new Hata(400,'Ad ve kullanıcı adı zorunlu.');
    const id=yeniId(),tuz=rastgele(16),g=kullaniciGovde({rol:'yonetici'});
    await db.prepare('INSERT INTO kullanici(id,ad,kadi,tuz,ozet,rol,ekranlar,para) VALUES(?,?,?,?,?,?,?,?)').bind(id,b.ad,String(b.kadi).toLowerCase().trim(),tuz,await pbkdf2(b.sifre,tuz),g.rol,g.ekranlar,g.para).run();
    return json({ok:true},200,{'set-cookie':await oturumAc(db,id,req)});
  }
  if(yol==='/api/giris'&&m==='POST'){
    const b=await govde(req),kadi=String(b.kadi||'').toLowerCase().trim(),r=await db.prepare('SELECT * FROM kullanici WHERE kadi=?').bind(kadi).first();
    const red=new Hata(401,'Kullanıcı adı veya şifre yanlış.');
    if(!r||!r.aktif)throw red;
    if(r.kilit>Date.now())throw new Hata(429,'Çok fazla yanlış deneme. 15 dakika sonra tekrar deneyin.');
    if(!esit(await pbkdf2(String(b.sifre||''),r.tuz),r.ozet)){const h=r.hata+1;await db.prepare('UPDATE kullanici SET hata=?,kilit=? WHERE id=?').bind(h>=5?0:h,h>=5?Date.now()+9e5:0,r.id).run();throw red}
    await db.prepare('UPDATE kullanici SET hata=0,kilit=0 WHERE id=?').bind(r.id).run();
    return json({ok:true},200,{'set-cookie':await oturumAc(db,r.id,req)});
  }
  const u=await ben(db,req);if(!u)throw new Hata(401,'Oturum kapalı.');
  if(yol==='/api/cikis'&&m==='POST'){await db.prepare('DELETE FROM oturum WHERE ozet=?').bind(await sha(cerez(req))).run();return json({ok:true},200,{'set-cookie':'sd=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})}
  if(yol==='/api/sifre'&&m==='POST'){
    const b=await govde(req);sifreKontrol(b.yeni);const r=await db.prepare('SELECT * FROM kullanici WHERE id=?').bind(u.id).first();
    if(!esit(await pbkdf2(String(b.eski||''),r.tuz),r.ozet))throw new Hata(400,'Mevcut şifre yanlış.');
    const tuz=rastgele(16);await db.prepare('UPDATE kullanici SET tuz=?,ozet=?,degistir=0 WHERE id=?').bind(tuz,await pbkdf2(b.yeni,tuz),u.id).run();return json({ok:true});
  }
  if(yol==='/api/sync'&&m==='GET'){
    const since=+new URL(req.url).searchParams.get('since')||0,now=Date.now();
    const rows=(await db.prepare('SELECT col,id,data,silindi,ts FROM kayit WHERE ts>=?').bind(since?since-6e4:0).all()).results,deg=[];
    for(const r of rows){if(!COLS.includes(r.col))continue;if(r.silindi){if(since)deg.push({col:r.col,id:r.id,silindi:1});continue}const d=maskele(u,r.col,JSON.parse(r.data));if(d)deg.push({col:r.col,id:r.id,data:d})}
    return json({now,me:u,ayar:await ayarDis(db,u),deg});
  }
  let x=yol.match(/^\/api\/k\/([a-z]+)\/([A-Za-z0-9_-]{1,80})$/);
  if(x){
    const[,col,id]=x;if(!COLS.includes(col))throw new Hata(404,'Bulunamadı.');
    if(m==='PUT'){
      gerek(u,YAZMA[col]);const b=await govde(req),eski=await docOku(db,col,id);delete b.id;let d;
      if(col==='seferler')d=await seferIsle(db,u,id,b,eski);
      else{
        d={...b};
        if(col==='bakimlar'&&!u.para){BAKIM_PARA.forEach(k=>{delete d[k];if(eski?.[k]!==undefined)d[k]=eski[k]})}
        if(col==='hareketler'&&!(+d.tutar>0))throw new Hata(400,'Tutar sıfırdan büyük olmalı.');
      }
      d.guncel=new Date().toISOString();await docYaz(db,col,id,d,u.id).run();
      return json({ok:true,id,data:maskele(u,col,d)});
    }
    if(m==='DELETE'){
      gerek(u,YAZMA[col]);const e=await docOku(db,col,id);if(!e)return json({ok:true});
      if(col==='seferler'&&e.durum==='Tamamlandı'&&!u.para)throw new Hata(403,'Tamamlanan sefer silinemez.');
      if(['araclar','soforler','cariler'].includes(col)){
        const alan={araclar:['aracId','dorseId'],soforler:['soforId'],cariler:['cariId']}[col],se=await liste(db,'seferler'),n=se.filter(s=>alan.some(k=>s[k]===id)).length;
        if(n)throw new Hata(409,`Bu kayda bağlı ${n} sefer var, silinemez. Durumunu Pasif yapın.`);
      }
      await db.prepare('UPDATE kayit SET silindi=1,ts=?,data=?,kim=? WHERE col=? AND id=?').bind(Date.now(),'{}',u.id,col,id).run();return json({ok:true});
    }
  }
  if(yol==='/api/ayar'&&m==='PUT'){
    gerek(u,'ayarlar');const b=await govde(req);
    if(b.firma!==undefined)await ayarYaz(db,'firma',String(b.firma).trim());
    if(b.esik!==undefined)await ayarYaz(db,'esik',Math.max(1,+b.esik||30));
    if(b.motorin!==undefined&&u.para)await ayarYaz(db,'motorin',+b.motorin||null);
    if(b.mobilizSunucu!==undefined)await ayarYaz(db,'mobilizSunucu',String(b.mobilizSunucu).trim()||'su0');
    if(b.mobilizToken)await ayarYaz(db,'mobilizToken',String(b.mobilizToken).trim());
    return json({ok:true,ayar:await ayarDis(db,u)});
  }
  if(yol==='/api/eksikleri-hesapla'&&m==='POST'){if(!u.para)throw new Hata(403,'Bu işlem için yetkiniz yok.');return json({ok:true,n:await eksikleriHesapla(db,u.id)})}
  if(yol==='/api/mobiliz/yenile'&&m==='POST'){if(!ekran(u,'takip')&&!ekran(u,'ayarlar'))throw new Hata(403,'Bu işlem için yetkiniz yok.');return json(await mobilizYenile(db,env))}
  if(yol==='/api/mobiliz/test'&&m==='POST'){
    gerek(u,'ayarlar');let c;try{c=await mobilizCek(db,env)}catch{return json({ok:false,mesaj:'Mobiliz\'e ulaşılamadı.'})}
    if(!c.ok)return json(c);const s=satirlar(c.json);
    return json({ok:true,satir:s.length,alanlar:s[0]?Object.keys(duz(s[0])):[],eslesen:konumCoz(c.json).size});
  }
  if(yol==='/api/kullanicilar'){
    gerek(u,'kullanicilar');
    if(m==='GET')return json({liste:(await db.prepare('SELECT * FROM kullanici').all()).results.map(kullaniciDis),roller:ROLLER,ekranlar:EKRANLAR});
    if(m==='POST'){
      const b=await govde(req);sifreKontrol(b.sifre);if(!b.ad||!b.kadi)throw new Hata(400,'Ad ve kullanıcı adı zorunlu.');
      const kadi=String(b.kadi).toLowerCase().trim();if(await db.prepare('SELECT 1 x FROM kullanici WHERE kadi=?').bind(kadi).first())throw new Hata(409,'Bu kullanıcı adı alınmış.');
      const g=kullaniciGovde(b),tuz=rastgele(16),id=yeniId();
      await db.prepare('INSERT INTO kullanici(id,ad,kadi,tuz,ozet,rol,ekranlar,para,degistir) VALUES(?,?,?,?,?,?,?,?,1)').bind(id,b.ad,kadi,tuz,await pbkdf2(b.sifre,tuz),g.rol,g.ekranlar,g.para).run();
      return json({ok:true,id});
    }
  }
  x=yol.match(/^\/api\/kullanicilar\/([0-9a-f]+)$/);
  if(x&&m==='PUT'){
    gerek(u,'kullanicilar');const b=await govde(req),id=x[1],ken=id===u.id,g=kullaniciGovde(b),akt=b.aktif===false?0:1;
    if(ken&&(!akt||g.rol!=='yonetici'||!g.ekranlar.includes('kullanicilar')))throw new Hata(400,'Kendi yönetici yetkinizi kapatamazsınız.');
    await db.prepare('UPDATE kullanici SET ad=?,rol=?,ekranlar=?,para=?,aktif=? WHERE id=?').bind(b.ad,g.rol,g.ekranlar,g.para,akt,id).run();
    if(!akt)await db.prepare('DELETE FROM oturum WHERE kid=?').bind(id).run();
    if(b.sifre){sifreKontrol(b.sifre);const tuz=rastgele(16);await db.prepare('UPDATE kullanici SET tuz=?,ozet=?,degistir=1,hata=0,kilit=0 WHERE id=?').bind(tuz,await pbkdf2(b.sifre,tuz),id).run();await db.prepare('DELETE FROM oturum WHERE kid=?').bind(id).run()}
    return json({ok:true});
  }
  if(yol==='/api/yedek'){
    gerek(u,'ayarlar');
    if(m==='GET'){const r=(await db.prepare('SELECT col,id,data FROM kayit WHERE silindi=0').all()).results;return json({surum:2,tarih:new Date().toISOString(),kayit:r.map(x=>({col:x.col,id:x.id,data:JSON.parse(x.data)})),firma:await ayarOku(db,'firma',''),esik:await ayarOku(db,'esik',30),motorin:await ayarOku(db,'motorin')})}
    if(m==='POST'){const b=await govde(req);if(b.surum!==2||!Array.isArray(b.kayit))throw new Hata(400,'Bu dosya geçerli bir yedek değil.');const y=b.kayit.filter(k=>COLS.includes(k.col)).map(k=>docYaz(db,k.col,String(k.id),k.data,u.id));for(let i=0;i<y.length;i+=50)await db.batch(y.slice(i,i+50));return json({ok:true,n:y.length})}
  }
  throw new Hata(404,'Bulunamadı.');
}

export default {
  async fetch(req,env){
    const yol=new URL(req.url).pathname;
    if(!yol.startsWith('/api/'))return env.ASSETS?env.ASSETS.fetch(req):new Response('Bulunamadı',{status:404});
    try{return await api(req,env,yol)}
    catch(e){if(e instanceof Hata)return json({hata:e.message},e.kod);console.error(e);return json({hata:'Sunucu hatası. Tekrar deneyin.'},500)}
  },
  async scheduled(_e,env,ctx){const p=(async()=>{await kur(env.DB);await mobilizYenile(env.DB,env)})();ctx?.waitUntil?.(p);await p},
};
