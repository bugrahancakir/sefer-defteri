"use strict";
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0'), r2=n=>Math.round((+n+Number.EPSILON)*100)/100;
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, td=()=>ymd(new Date());
const fD=s=>s?s.split('-').reverse().join('.'):'—';
const tl=(n,k=0)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:k,maximumFractionDigits:k}).format(n||0);
const num=(n)=>new Intl.NumberFormat('tr-TR').format(n||0);
const left=s=>Math.round((Date.parse(s+'T00:00:00Z')-Date.parse(td()+'T00:00:00Z'))/864e5);
const norm=s=>String(s??'').replace(/İ/g,'I').replace(/ı/g,'i').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const AYLAR=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const plaka=p=>p?`<span class="plaka"><i>TR</i><span>${esc(p)}</span></span>`:'<span class="mute">—</span>';

const COLS=['araclar','soforler','cariler','seferler','hareketler','bakimlar','konumlar','fiyatlar'];
const S=Object.fromEntries(COLS.map(c=>[c,[]]));
let firma={ad:'',esik:30}, me=null, ayar={}, sonSync=0, KUL=null;
const para=()=>!!me?.para, ekranVar=e=>!!me?.ekranlar.includes(e);
const UI={durum:'',q:'',ay:'',filo:'araclar',per:'yil',cariQ:'',belge:'hepsi'};

/* ---------- belge tanımları ---------- */
const ARAC_DOCS=[['muayene','Muayene',1],['trafik','Trafik sigortası',1],['kasko','Kasko'],['takograf','Takograf kalibrasyonu'],['kBelge','K belgesi'],['adr','ADR uygunluk']];
const SOFOR_DOCS=[['ehliyet','Ehliyet',1],['src','SRC',1],['psiko','Psikoteknik'],['adrS','ADR sürücü belgesi']];
const F=(k,l,t='text',o={})=>({k,l,t,...o});
const SCHEMA={
 araclar:{ad:'Araç',key:'plaka',f:[F('plaka','Plaka','text',{req:1,upper:1}),F('tip','Tip','select',{opts:['Çekici','Kamyon','Dorse','Kamyonet'],def:'Çekici',req:1}),F('marka','Marka'),F('model','Model'),F('yil','Model yılı','num'),F('durum','Durum','select',{opts:['Aktif','Arızalı','Bakımda','Pasif'],def:'Aktif'}),F('tuketimDolu','Yakıt tüketimi, dolu (L/100 km)','num',{al:['Tüketim','Tüketim dolu','Dolu tüketim']}),F('tuketimBos','Yakıt tüketimi, boş (L/100 km)','num',{al:['Tüketim boş','Boş tüketim']}),...ARAC_DOCS.map(([k,l])=>F(k,l+' bitiş','date',{al:[l]})),F('not','Not','area')]},
 soforler:{ad:'Şoför',key:'ad',f:[F('ad','Ad soyad','text',{req:1}),F('telefon','Telefon'),F('durum','Durum','select',{opts:['Aktif','İzinli','Pasif'],def:'Aktif'}),...SOFOR_DOCS.map(([k,l])=>F(k,l+' bitiş','date',{al:[l]})),F('not','Not','area')]},
 cariler:{ad:'Cari',key:'unvan',f:[F('unvan','Ünvan','text',{req:1,w:1,al:['Firma','Firma adı','Cari adı']}),F('tur','Tür','select',{opts:['Müşteri','Tedarikçi','Taşeron'],def:'Müşteri'}),F('vergiNo','Vergi no'),F('vergiDairesi','Vergi dairesi'),F('telefon','Telefon'),F('eposta','E-posta'),F('acilis','Açılış bakiyesi (₺)','num',{hint:'Bize borçluysa artı, biz borçluysak eksi girin.',al:['Açılış bakiyesi','Bakiye']}),F('not','Not','area')]},
 hareketler:{ad:'Finans hareketi',f:[F('tarih','Tarih','date',{req:1,def:td}),F('cariId','Cari','ref',{ref:'cariler',req:1}),F('tur','Tür','select',{opts:['Tahsilat','Ödeme','Alış faturası'],def:'Tahsilat'}),F('tutar','Tutar (₺)','num',{req:1}),F('yontem','Yöntem','select',{opts:['Havale/EFT','Nakit','Çek','Senet','Kredi kartı'],def:'Havale/EFT'}),F('belgeNo','Belge no'),F('not','Açıklama','area')]},
 fiyatlar:{ad:'Güzergâh fiyatı',ank:d=>d.cariId+'|'+norm(d.cikis)+'|'+norm(d.varis),f:[F('cariId','Müşteri','ref',{ref:'cariler',req:1,fil:c=>c.tur!=='Tedarikçi'}),F('cikis','Çıkış','text',{req:1}),F('varis','Varış','text',{req:1}),F('km','Gidiş km','num',{req:1}),F('donusKm','Dönüş km','num',{hint:'Boş bırakılırsa gidiş km kullanılır.'}),F('fiyat','Sefer fiyatı, KDV hariç (₺)','num',{req:1,al:['Fiyat','Navlun']})]},
 bakimlar:{ad:'Bakım kaydı',f:[F('tarih','Tarih','date',{req:1,def:td}),F('aracId','Araç','ref',{ref:'araclar',req:1}),F('islem','Yapılan işlem','text',{req:1}),F('km','Km','num'),F('tutar','Tutar, KDV hariç (₺)','num',{para:1}),F('sonrakiKm','Sonraki bakım km','num'),F('not','Not','area')]},
};
const GIDER=['HGS/Köprü','Harcırah','Taşeron','Liman/Antrepo','Ceza','Diğer'];

/* ---------- hesaplar ---------- */
const by=(c,id)=>S[c].find(x=>x.id===id);
const ad=(c,id,k)=>{const x=by(c,id);return x?x[k]:''};
function tutar(s){const n=+s.navlun||0,k=n*(+s.kdvOran||0)/100,t=s.tevkifat==='2/10'?k*.2:0;return{n,k,t,alacak:r2(n+k-t)}}
const gider=s=>r2((s.yakit?.tutar||0)+(s.giderler||[]).reduce((a,g)=>a+(+g.tutar||0),0));
const kar=s=>r2(tutar(s).n-gider(s));
const bitti=()=>S.seferler.filter(s=>s.durum==='Tamamlandı');
function ekstre(c){
  const rows=[];
  if(+c.acilis)rows.push({t:'',a:'Açılış bakiyesi',b:+c.acilis>0?+c.acilis:0,y:+c.acilis<0?-c.acilis:0});
  bitti().filter(s=>s.cariId===c.id).forEach(s=>rows.push({t:s.tarih,a:`Sefer ${s.no} · ${s.cikis} → ${s.varis}`,b:tutar(s).alacak,y:0,c:'seferler',id:s.id}));
  S.hareketler.filter(h=>h.cariId===c.id).forEach(h=>{const m=+h.tutar||0;rows.push({t:h.tarih,a:`${h.tur}${h.not?' · '+h.not:''}`,b:h.tur==='Ödeme'?m:0,y:h.tur==='Ödeme'?0:m,c:'hareketler',id:h.id})});
  rows.sort((x,y)=>x.t<y.t?-1:x.t>y.t?1:0);let b=0;rows.forEach(r=>{b=r2(b+r.b-r.y);r.s=b});return rows}
const bakiye=c=>{const e=ekstre(c);return e.length?e[e.length-1].s:0};
function aralik(from,to){const ic=x=>x.tarih>=from&&x.tarih<=to,sf=bitti().filter(ic);
  const gelir=r2(sf.reduce((a,s)=>a+tutar(s).n,0)),sg=r2(sf.reduce((a,s)=>a+gider(s),0)),bk=r2(S.bakimlar.filter(ic).reduce((a,b)=>a+(+b.tutar||0),0));
  return{sefer:sf.length,gelir,sg,bk,gider:r2(sg+bk),kar:r2(gelir-sg-bk)}}
function ayAralik(k){const[y,m]=k.split('-').map(Number);return[`${k}-01`,ymd(new Date(y,m,0))]}
function sonAylar(n){const a=[],d=new Date();d.setDate(1);for(let i=n-1;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);a.push(`${x.getFullYear()}-${pad(x.getMonth()+1)}`)}return a}
function belgeler(){
  const out=[],add=(o,c,tip,kim,defs)=>{defs.forEach(([k,l,zor])=>{if(!o[k]){if(zor)out.push({c,id:o.id,tip,kim,belge:l,bitis:'',gun:null,sev:'eksik'});return}
    const g=left(o[k]),sev=g<0?'gecti':g<=15?'yakin':g<=(+firma.esik||30)?'uyar':'tamam';out.push({c,id:o.id,tip,kim,belge:l,bitis:o[k],gun:g,sev})})};
  S.araclar.filter(a=>a.durum!=='Pasif').forEach(a=>add(a,'araclar','Araç',a.plaka,ARAC_DOCS));
  S.soforler.filter(a=>a.durum!=='Pasif').forEach(a=>add(a,'soforler','Şoför',a.ad,SOFOR_DOCS));
  return out.sort((x,y)=>(x.gun??1e6)-(y.gun??1e6))}
const belgeChip=b=>b.sev==='eksik'?'<span class="chip info">Tarih girilmemiş</span>':b.sev==='gecti'?`<span class="chip crit">${-b.gun} gün geçti</span>`:b.sev==='yakin'?`<span class="chip crit">${b.gun} gün kaldı</span>`:b.sev==='uyar'?`<span class="chip warn">${b.gun} gün kaldı</span>`:`<span class="chip good">${b.gun} gün</span>`;
const durumChip=d=>`<span class="chip ${({Yolda:'info',Tamamlandı:'good',Planlandı:'',İptal:'crit',Aktif:'good',Arızalı:'crit',Bakımda:'warn',İzinli:'warn',Pasif:''})[d]??''}">${esc(d)}</span>`;

/* ---------- görünümler ---------- */
const NAV=[['genel','Genel Bakış'],['seferler','Seferler'],['filo','Filo'],['soforler','Şoförler'],['belgeler','Belgeler'],['takip','Araç Takip'],['fiyatlar','Fiyat Listesi'],['cari','Cari ve Finans'],['raporlar','Raporlar'],['kullanicilar','Kullanıcılar'],['ayarlar','Ayarlar']];
const emptyB=(t,a,l)=>`<div class="empty"><span>${t}</span>${a?`<button class="btn pri" data-a="${a}">${l}</button>`:''}</div>`;
const V={};

function grafik(aylar){
  const d=aylar.map(k=>{const[a,b]=ayAralik(k);return{k,...aralik(a,b)}}),mx=Math.max(1,...d.map(x=>Math.max(x.gelir,x.gider)));
  const p=10**Math.floor(Math.log10(mx)),top=[1,2,5,10].map(m=>m*p).find(v=>v>=mx)||mx,kisa=n=>n>=1e6?`${num(r2(n/1e6))} Mn ₺`:n>=1e3?`${num(n/1e3)} Bin ₺`:`${num(n)} ₺`;
  return `<div class="leg"><span><i style="background:var(--accent)"></i>Gelir</span><span><i style="background:var(--amber)"></i>Gider</span></div>
  <div class="chart">${[1,.5,0].map(f=>`<div class="gl" style="top:${(1-f)*100}%"><span>${kisa(top*f)}</span></div>`).join('')}
  <div class="cols">${d.map(x=>`<div class="col" tabindex="0" aria-label="${x.k}: gelir ${tl(x.gelir)}, gider ${tl(x.gider)}"><div class="bar a" style="height:${x.gelir/top*100}%"></div><div class="bar b" style="height:${x.gider/top*100}%"></div><div class="tip">${AYLAR[+x.k.slice(5)-1]} ${x.k.slice(0,4)}<br>Gelir ${tl(x.gelir)}<br>Gider ${tl(x.gider)}<br>Kâr ${tl(x.kar)}</div></div>`).join('')}</div></div>
  <div class="xl">${d.map(x=>`<span>${AYLAR[+x.k.slice(5)-1]}</span>`).join('')}</div>`}

/* Boş araç önerisi: arıza/bakımda değil, işi yok, belgesi geçmemiş */
function musaitlik(){
  const t=td(),islerde=new Map();
  S.seferler.filter(s=>s.durum==='Yolda'||s.durum==='Planlandı').forEach(s=>{const o=islerde.get(s.aracId);if(!o||s.durum==='Yolda')islerde.set(s.aracId,s)});
  return S.araclar.filter(a=>a.tip!=='Dorse'&&a.durum!=='Pasif').map(a=>{
    const sert=[],yumusak=[],is=islerde.get(a.id);
    if(a.durum==='Arızalı'||a.durum==='Bakımda')sert.push(a.durum);
    [['muayene','Muayene'],['trafik','Trafik sigortası']].forEach(([k,l])=>{if(a[k]&&a[k]<t)sert.push(l+' geçmiş')});
    if(is)yumusak.push(is.durum==='Yolda'?`Yolda: ${is.cikis} → ${is.varis}`:`Planlı: ${is.varis} (${fD(is.tarih)})`);
    const biten=S.seferler.filter(s=>s.aracId===a.id&&s.durum==='Tamamlandı').sort((x,y)=>String(y.bitisTarih||y.tarih).localeCompare(x.bitisTarih||x.tarih))[0];
    const gun=biten?Math.max(0,-left(biten.bitisTarih||biten.tarih)):null;
    return{a,sert,yumusak,son:biten?.varis||'',gun,konum:S.konumlar.find(k=>norm(k.plaka)===norm(a.plaka))};
  });
}
const bosYazi=x=>x.gun==null?'Henüz sefere çıkmadı':x.gun===0?'Bugün boşa çıktı':`${x.gun} gündür boşta`;
function oneriPanel(){
  const m=musaitlik(),uy=m.filter(x=>!x.sert.length&&!x.yumusak.length).sort((a,b)=>(b.gun??1e4)-(a.gun??1e4)),eng=m.filter(x=>x.sert.length),bosSof=S.soforler.filter(s=>s.durum==='Aktif'&&!S.seferler.some(z=>z.soforId===s.id&&z.durum==='Yolda')).length;
  return `<section class="panel"><header><h2>İşe gönderilebilir araçlar (${uy.length})</h2><span class="mute">${bosSof} boş şoför</span></header>
  ${uy.length?`<ul class="alist">${uy.slice(0,8).map(x=>`<li><div>${plaka(x.a.plaka)}<small>${bosYazi(x)}${x.son?` · Son iş: ${esc(x.son)}`:''}${x.konum?.adres?` · ${esc(x.konum.adres)}`:''}</small></div><button class="btn sm pri" data-a="gonder:${x.a.id}">İşe gönder</button></li>`).join('')}</ul>`:'<div class="empty">Şu an boşta araç yok.</div>'}
  ${eng.length?`<div class="pad mute" style="padding-top:8px">Gönderilemeyen: ${eng.map(x=>`${esc(x.a.plaka)} (${esc(x.sert.join(', '))})`).join(' · ')}</div>`:''}</section>`}
function kurulumEksik(){
  if(!ekranVar('ayarlar'))return'';const l=[];
  if(para()&&!ayar.motorin)l.push(['Motorin litre fiyatını girin','ayarlar']);
  const t=S.araclar.filter(a=>a.tip!=='Dorse'&&a.durum!=='Pasif'&&!a.tuketimDolu).length;if(t)l.push([`${t} aracın yakıt tüketimini girin`,'filo']);
  if(para()&&!S.fiyatlar.length)l.push(['Güzergâh fiyatlarını ekleyin','fiyatlar']);
  if(!ayar.mobilizAnahtarVar)l.push(['Mobiliz anahtarını girin','ayarlar']);
  return l.length?`<div class="note"><span><b>Kurulum:</b> ${l.map(([y,h])=>`<a href="#${h}">${esc(y)}</a>`).join(' · ')}</span></div>`:''}
V.genel=()=>{
  const p=para(),yol=S.seferler.filter(s=>s.durum==='Yolda'),bel=belgeler().filter(x=>['gecti','yakin','uyar'].includes(x.sev)),o=[];
  let kpi='',grf='',alc='',eks='';
  if(p){
    const k=td().slice(0,7),[a,b]=ayAralik(k),m=aralik(a,b),al=S.cariler.map(c=>({c,b:bakiye(c)})),acik=r2(al.filter(x=>x.b>0).reduce((t,x)=>t+x.b,0));
    kpi=`<section class="kpi" aria-label="Bu ay özet"><div><span class="lab">Bu ay gelir</span><b>${tl(m.gelir)}</b><small>${m.sefer} sefer, KDV hariç</small></div><div><span class="lab">Bu ay gider</span><b>${tl(m.gider)}</b><small>Yakıt, sefer, bakım</small></div><div><span class="lab">Bu ay kâr</span><b class="${m.kar<0?'neg':''}">${tl(m.kar)}</b><small>${m.gelir?`%${num(Math.round(m.kar/m.gelir*100))} marj`:'Henüz gelir yok'}</small></div><div><span class="lab">Açık alacak</span><b>${tl(acik)}</b><small>${al.filter(x=>x.b>0).length} cari</small></div></section>`;
    grf=`<section class="panel"><header><h2>Son 6 ay</h2>${ekranVar('raporlar')?'<a href="#raporlar">Raporlar</a>':''}</header><div class="pad">${grafik(sonAylar(6))}</div></section>`;
    alc=`<section class="panel"><header><h2>En yüksek alacaklar</h2></header>${al.some(x=>x.b>0)?`<ul class="alist">${al.filter(x=>x.b>0).sort((x,y)=>y.b-x.b).slice(0,5).map(x=>`<li><div>${esc(x.c.unvan)}</div><b class="nw">${tl(x.b)}</b></li>`).join('')}</ul>`:'<div class="empty">Açık alacak yok.</div>'}</section>`;
    const fy=S.seferler.filter(s=>s.fiyatYok&&s.durum!=='İptal').length,yk=S.seferler.filter(s=>s.yakitEksik&&s.durum!=='İptal').length;
    if(fy||yk)eks=`<div class="note"><span>${fy?`${fy} seferin fiyatı listede yok. `:''}${yk?`${yk} seferin yakıtı hesaplanamadı. `:''}Listeyi ve tüketimleri tamamlayıp yeniden hesaplatın.</span><button class="btn sm" data-a="eksikHesapla">Yeniden hesapla</button></div>`;
  }
  const belP=ekranVar('belgeler')?`<section class="panel"><header><h2>Yaklaşan belgeler</h2><a href="#belgeler">Tümü</a></header>${bel.length?`<ul class="alist">${bel.slice(0,6).map(x=>`<li><div>${x.tip==='Araç'?plaka(x.kim):esc(x.kim)}<small>${esc(x.belge)} · ${fD(x.bitis)}</small></div>${belgeChip(x)}</li>`).join('')}</ul>`:`<div class="empty">Önümüzdeki ${+firma.esik||30} günde biten belge yok.</div>`}</section>`:'';
  const yolP=`<section class="panel"><header><h2>Yoldaki seferler (${yol.length})</h2>${ekranVar('seferler')?'<a href="#seferler">Tüm seferler</a>':''}</header>${yol.length?`<div class="tw"><table><thead><tr><th>Plaka</th><th>Güzergâh</th><th>Şoför</th><th>Müşteri</th><th></th></tr></thead><tbody>${yol.slice(0,8).map(s=>`<tr ${ekranVar('seferler')?`class="row" data-a="sefer:${s.id}"`:''}><td>${plaka(ad('araclar',s.aracId,'plaka'))}</td><td class="nw">${esc(s.cikis)} → ${esc(s.varis)}</td><td class="nw">${esc(ad('soforler',s.soforId,'ad'))||'—'}</td><td>${esc(ad('cariler',s.cariId,'unvan'))||'—'}</td><td class="r">${ekranVar('seferler')?`<button class="btn sm" data-a="tamam:${s.id}">Tamamla</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Şu an yolda sefer yok.</div>'}</section>`;
  const one=ekranVar('seferler')?oneriPanel():'';
  return `<div class="head"><div><h1>Genel Bakış</h1><p>${fD(td())}${p?' · Gelir ve gider yalnızca tamamlanan seferlerden hesaplanır.':''}</p></div>${ekranVar('seferler')?'<div class="btns"><button class="btn pri" data-a="seferYeni">Yeni sefer</button></div>':''}</div>
  ${kurulumEksik()}${eks}${kpi}
  ${p?`<div class="two">${grf}${one||belP}</div><div class="two">${yolP}${one?belP:''}</div>${alc}`:`<div class="two">${yolP}${one||belP}</div>${one?belP:''}`}`};

function seferRows(){
  const q=norm(UI.q);
  return S.seferler.filter(s=>(!UI.durum||s.durum===UI.durum)&&(!UI.ay||String(s.tarih).startsWith(UI.ay))&&(!q||norm([s.no,s.cikis,s.varis,s.yuk,ad('araclar',s.aracId,'plaka'),ad('soforler',s.soforId,'ad'),ad('cariler',s.cariId,'unvan')].join(' ')).includes(q)))
   .sort((a,b)=>String(b.tarih).localeCompare(a.tarih)||String(b.no).localeCompare(a.no))}
function seferTablo(){
  const r=seferRows(),p=para(),done=r.filter(s=>s.durum==='Tamamlandı');
  if(!r.length)return S.seferler.length?'<div class="empty">Bu filtreye uyan sefer yok.</div>':emptyB('Henüz sefer yok.','seferYeni','Yeni sefer');
  return `<div class="tw"><table><thead><tr><th>No</th><th>Tarih</th><th>Güzergâh</th><th>Dönüş</th><th>Plaka</th><th>Şoför</th><th>Müşteri</th><th>Durum</th>${p?'<th class="r">Navlun</th><th class="r">Yakıt</th><th class="r">Gider</th><th class="r">Kâr</th>':''}<th></th></tr></thead><tbody>
  ${r.slice(0,300).map(s=>{const k=kar(s);return `<tr class="row" data-a="sefer:${s.id}"><td><button class="lnk" data-a="sefer:${s.id}">${esc(s.no)}</button></td><td class="nw">${fD(s.tarih)}</td><td class="nw">${esc(s.cikis)} → ${esc(s.varis)}</td><td class="nw">${esc(({Boş:'Boş dönüş',Yüklü:'Yüklü',Yok:'Tek yön'})[s.donus]||'—')}</td><td>${plaka(ad('araclar',s.aracId,'plaka'))}</td><td class="nw">${esc(ad('soforler',s.soforId,'ad'))||'—'}</td><td>${esc(ad('cariler',s.cariId,'unvan'))||'—'}</td><td>${durumChip(s.durum)}</td>${p?`<td class="r">${s.fiyatYok?'<span class="chip warn">Fiyat yok</span>':tl(tutar(s).n)}</td><td class="r">${s.yakitEksik?'<span class="chip warn">Eksik</span>':tl(s.yakit?.tutar)}</td><td class="r">${tl(gider(s))}</td><td class="r ${k<0?'neg':''}"><b>${tl(k)}</b></td>`:''}<td class="r">${s.durum==='Planlandı'?`<button class="btn sm" data-a="yola:${s.id}">Yola çıkar</button>`:s.durum==='Yolda'?`<button class="btn sm" data-a="tamam:${s.id}">Tamamla</button>`:''}</td></tr>`}).join('')}
  </tbody></table></div>
  <div class="pad mute" style="padding-top:10px">${r.length} sefer${r.length>300?', ilk 300 gösteriliyor':''}${p?` · Tamamlanan ${done.length} seferin kârı: <b>${tl(done.reduce((a,s)=>a+kar(s),0))}</b>`:''}</div>`}
V.seferler=()=>`<div class="head"><div><h1>Seferler</h1><p>${para()?'Fiyat listeden, yakıt km ve araç tüketiminden otomatik gelir.':'Aracı ve şoförü sefere yazın.'}</p></div><div class="btns">${para()?'<button class="btn" data-a="csvSefer">Excel için indir</button>':''}<button class="btn pri" data-a="seferYeni">Yeni sefer</button></div></div>
 <div class="tools"><input id="q" type="search" placeholder="Plaka, şehir, müşteri, sefer no ara" aria-label="Seferlerde ara" value="${esc(UI.q)}"><select id="fDurum" aria-label="Durum">${['','Planlandı','Yolda','Tamamlandı','İptal'].map(d=>`<option value="${d}" ${UI.durum===d?'selected':''}>${d||'Tüm durumlar'}</option>`).join('')}</select><input id="fAy" type="month" aria-label="Ay" value="${esc(UI.ay)}"></div>
 <section class="panel" id="list">${seferTablo()}</section>`;

V.filo=()=>{const t=UI.filo;
 const sc=id=>S.seferler.filter(s=>s.aracId===id||s.dorseId===id).length;
 const araclar=[...S.araclar].sort((a,b)=>String(a.plaka).localeCompare(b.plaka,'tr'));
 const en=a=>belgeler().filter(b=>b.id===a.id&&b.gun!=null)[0];
 return `<div class="head"><div><h1>Filo</h1><p>${S.araclar.filter(a=>a.durum==='Aktif'&&a.tip!=='Dorse').length} aktif araç, ${S.araclar.filter(a=>a.tip==='Dorse').length} dorse</p></div><div class="btns">${t==='araclar'?`<button class="btn" data-a="aktar:araclar">Excel'den aktar</button><button class="btn pri" data-a="yeni:araclar">Araç ekle</button>`:`<button class="btn pri" data-a="yeni:bakimlar">Bakım ekle</button>`}</div></div>
 <div class="tabs"><button class="tab" aria-pressed="${t==='araclar'}" data-a="filo:araclar">Araçlar</button><button class="tab" aria-pressed="${t==='bakim'}" data-a="filo:bakim">Bakım kayıtları</button></div>
 <section class="panel">${t==='araclar'?(araclar.length?`<div class="tw"><table><thead><tr><th>Plaka</th><th>Tip</th><th>Marka / model</th><th>Durum</th><th>En yakın belge</th><th class="r">Sefer</th></tr></thead><tbody>${araclar.map(a=>{const b=en(a);return `<tr class="row" data-a="ac:araclar:${a.id}"><td>${plaka(a.plaka)}</td><td>${esc(a.tip)}</td><td>${esc([a.marka,a.model,a.yil].filter(Boolean).join(' '))||'—'}</td><td>${durumChip(a.durum||'Aktif')}</td><td class="nw">${b?`${esc(b.belge)} ${belgeChip(b)}`:'<span class="mute">—</span>'}</td><td class="r">${sc(a.id)}</td></tr>`}).join('')}</tbody></table></div>`:emptyB('Henüz araç yok.','yeni:araclar','Araç ekle')):
 (S.bakimlar.length?`<div class="tw"><table><thead><tr><th>Tarih</th><th>Plaka</th><th>İşlem</th><th class="r">Km</th><th class="r">Sonraki km</th>${para()?'<th class="r">Tutar</th>':''}</tr></thead><tbody>${[...S.bakimlar].sort((a,b)=>String(b.tarih).localeCompare(a.tarih)).map(b=>`<tr class="row" data-a="ac:bakimlar:${b.id}"><td class="nw">${fD(b.tarih)}</td><td>${plaka(ad('araclar',b.aracId,'plaka'))}</td><td>${esc(b.islem)}</td><td class="r">${b.km?num(b.km):'—'}</td><td class="r">${b.sonrakiKm?num(b.sonrakiKm):'—'}</td>${para()?`<td class="r">${tl(b.tutar)}</td>`:''}</tr>`).join('')}</tbody></table></div>`:emptyB('Henüz bakım kaydı yok.','yeni:bakimlar','Bakım ekle'))}</section>`};

V.soforler=()=>{const list=[...S.soforler].sort((a,b)=>String(a.ad).localeCompare(b.ad,'tr'));
 return `<div class="head"><div><h1>Şoförler</h1><p>${list.filter(s=>s.durum==='Aktif').length} aktif şoför</p></div><div class="btns"><button class="btn" data-a="aktar:soforler">Excel'den aktar</button><button class="btn pri" data-a="yeni:soforler">Şoför ekle</button></div></div>
 <section class="panel">${list.length?`<div class="tw"><table><thead><tr><th>Ad soyad</th><th>Telefon</th><th>Durum</th><th>Ehliyet</th><th>SRC</th><th>Psikoteknik</th><th class="r">Sefer</th></tr></thead><tbody>${list.map(s=>`<tr class="row" data-a="ac:soforler:${s.id}"><td class="nw"><b>${esc(s.ad)}</b></td><td class="nw">${esc(s.telefon)||'—'}</td><td>${durumChip(s.durum||'Aktif')}</td><td class="nw">${fD(s.ehliyet)}</td><td class="nw">${fD(s.src)}</td><td class="nw">${fD(s.psiko)}</td><td class="r">${S.seferler.filter(x=>x.soforId===s.id).length}</td></tr>`).join('')}</tbody></table></div>`:emptyB('Henüz şoför yok.','yeni:soforler','Şoför ekle')}</section>`};

V.belgeler=()=>{const all=belgeler(),c={gecti:0,yakin:0,uyar:0,eksik:0};all.forEach(b=>{if(b.sev in c)c[b.sev]++});
 const fil={hepsi:x=>x.sev!=='tamam',gecti:x=>x.sev==='gecti',yakin:x=>x.sev==='yakin'||x.sev==='uyar',eksik:x=>x.sev==='eksik',tum:()=>true}[UI.belge],r=all.filter(fil);
 return `<div class="head"><div><h1>Belgeler</h1><p>Araç ve şoför belgeleri. Uyarı eşiği ${+firma.esik||30} gün, Ayarlar'dan değişir.</p></div></div>
 <section class="kpi"><div><span class="lab">Süresi geçen</span><b class="${c.gecti?'neg':''}">${c.gecti}</b><small>Hemen yenilenmeli</small></div><div><span class="lab">15 gün içinde</span><b>${c.yakin}</b><small>Randevu alınmalı</small></div><div><span class="lab">${+firma.esik||30} gün içinde</span><b>${c.uyar}</b><small>Takipte</small></div><div><span class="lab">Tarihi eksik</span><b>${c.eksik}</b><small>Zorunlu belgeler</small></div></section>
 <div class="tabs">${[['hepsi','Dikkat isteyenler'],['gecti','Süresi geçen'],['yakin','Yaklaşan'],['eksik','Eksik'],['tum','Tümü']].map(([k,l])=>`<button class="tab" aria-pressed="${UI.belge===k}" data-a="belge:${k}">${l}</button>`).join('')}</div>
 <section class="panel">${r.length?`<div class="tw"><table><thead><tr><th>Araç / şoför</th><th>Belge</th><th>Bitiş</th><th>Durum</th></tr></thead><tbody>${r.map(b=>`<tr class="row" data-a="ac:${b.c}:${b.id}"><td class="nw">${b.tip==='Araç'?plaka(b.kim):esc(b.kim)}</td><td>${esc(b.belge)}</td><td class="nw">${fD(b.bitis)}</td><td>${belgeChip(b)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Bu listede belge yok.</div>'}</section>`};

function cariTablo(){const q=norm(UI.cariQ),l=S.cariler.filter(c=>!q||norm(c.unvan+' '+c.vergiNo).includes(q)).map(c=>({c,b:bakiye(c)})).sort((a,b)=>b.b-a.b);
 if(!l.length)return S.cariler.length?'<div class="empty">Aramaya uyan cari yok.</div>':emptyB('Henüz cari yok.','yeni:cariler','Cari ekle');
 return `<div class="tw"><table><thead><tr><th>Ünvan</th><th>Tür</th><th>Telefon</th><th class="r">Sefer</th><th class="r">Bakiye</th><th></th></tr></thead><tbody>${l.map(({c,b})=>`<tr class="row" data-a="ekstre:${c.id}"><td><b>${esc(c.unvan)}</b></td><td>${esc(c.tur)}</td><td class="nw">${esc(c.telefon)||'—'}</td><td class="r">${S.seferler.filter(s=>s.cariId===c.id).length}</td><td class="r ${b<0?'neg':''}"><b>${tl(Math.abs(b),2)}</b> <span class="mute">${b>0?'alacaklıyız':b<0?'borçluyuz':''}</span></td><td class="r"><button class="btn sm" data-a="tahsil:${c.id}">Tahsilat</button></td></tr>`).join('')}</tbody></table></div>`}
V.cari=()=>{const b=S.cariler.map(bakiye),al=r2(b.filter(x=>x>0).reduce((a,x)=>a+x,0)),bo=r2(b.filter(x=>x<0).reduce((a,x)=>a-x,0)),[f,t]=ayAralik(td().slice(0,7)),th=r2(S.hareketler.filter(h=>h.tur==='Tahsilat'&&h.tarih>=f&&h.tarih<=t).reduce((a,h)=>a+(+h.tutar||0),0));
 const son=[...S.hareketler].sort((x,y)=>String(y.tarih).localeCompare(x.tarih)).slice(0,10);
 return `<div class="head"><div><h1>Cari ve Finans</h1><p>Bakiye: tamamlanan seferlerin KDV dahil tutarı eksi tahsilatlar.</p></div><div class="btns"><button class="btn" data-a="aktar:cariler">Excel'den aktar</button><button class="btn" data-a="yeni:hareketler">Hareket ekle</button><button class="btn pri" data-a="yeni:cariler">Cari ekle</button></div></div>
 <section class="kpi"><div><span class="lab">Toplam alacak</span><b>${tl(al)}</b><small>Bize borçlu cariler</small></div><div><span class="lab">Toplam borç</span><b>${tl(bo)}</b><small>Bizim borçlu olduklarımız</small></div><div><span class="lab">Net</span><b class="${al-bo<0?'neg':''}">${tl(al-bo)}</b><small>Alacak eksi borç</small></div><div><span class="lab">Bu ay tahsilat</span><b>${tl(th)}</b><small>${AYLAR[new Date().getMonth()]} ayı</small></div></section>
 <div class="tools"><input id="cq" type="search" placeholder="Ünvan veya vergi no ara" aria-label="Carilerde ara" value="${esc(UI.cariQ)}"></div>
 <section class="panel" id="list">${cariTablo()}</section>
 <section class="panel"><header><h2>Son hareketler</h2></header>${son.length?`<div class="tw"><table><thead><tr><th>Tarih</th><th>Cari</th><th>Tür</th><th>Yöntem</th><th>Açıklama</th><th class="r">Tutar</th></tr></thead><tbody>${son.map(h=>`<tr class="row" data-a="ac:hareketler:${h.id}"><td class="nw">${fD(h.tarih)}</td><td>${esc(ad('cariler',h.cariId,'unvan'))||'—'}</td><td>${esc(h.tur)}</td><td>${esc(h.yontem)}</td><td>${esc(h.not)||'—'}</td><td class="r">${tl(h.tutar,2)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Henüz tahsilat veya ödeme girilmedi.</div>'}</section>`};

/* Türkiye haritası: eşdikdörtgen izdüşüm, tr.geo.json'dan üretildi */
const TR_PATH="M585 64L659 89L719 79L763 85L823 50L878 47L927 80L936 103L931 135L969 151L989 171L954 190L970 265L960 286L988 338L964 350L946 333L886 324L864 335L806 345L778 344L719 368L677 369L650 356L593 375L576 362L574 399L560 413L546 427L527 398L547 373L515 378L473 363L437 401L359 409L318 373L263 371L251 398L215 406L166 371L110 372L79 307L42 270L67 219L34 187L91 124L170 121L192 71L290 80L351 37L411 19L496 17L585 64ZM87 106L44 142L28 111L29 97L41 90L57 49L32 31L84 10L128 19L134 45L179 66L170 82L109 86L87 106Z",MW=1000,MH=436,LON0=25.5,LAT1=42.3,KX=MW/19.5,KY=KX/Math.cos(39*Math.PI/180);
const px=(lat,lng)=>[(lng-LON0)*KX,(LAT1-lat)*KY];
const yasDk=k=>k.zaman?Math.round((Date.now()-k.zaman)/6e4):null;
function yasYazi(d){if(d==null)return 'Zaman yok';if(d<1)return 'Az önce';if(d<60)return d+' dk önce';if(d<1440)return Math.round(d/60)+' sa önce';return Math.round(d/1440)+' gün önce'}
V.takip=()=>{const list=[...S.konumlar].sort((a,b)=>String(a.plaka).localeCompare(b.plaka,'tr'));
 const akt=list.reduce((m,k)=>k.aktarim>m?k.aktarim:m,''),mz=ayar.mobiliz;
 const noktalar=list.filter(k=>k.lat!=null&&k.lng!=null).map(k=>{const[x,y]=px(k.lat,k.lng),h=+k.hiz>0;return (x<0||x>MW||y<0||y>MH)?'':`<g><title>${esc(k.plaka)} · ${h?k.hiz+' km/s':'Duruyor'}</title><circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="var(--${h?'accent':'amber'})"/><text x="${(x+13).toFixed(1)}" y="${(y+5).toFixed(1)}">${esc(k.plaka)}</text></g>`}).join('');
 return `<div class="head"><div><h1>Araç Takip</h1><p>${akt?`Son aktarım: ${new Date(akt).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}`:'Henüz konum aktarılmadı.'}</p></div><div class="btns"><button class="btn" data-a="konumAktar">Dosyadan aktar</button><button class="btn pri" data-a="mzYenile">Şimdi yenile</button></div></div>
 ${mz?.ok?`<div class="note info"><span>Mobiliz bağlı. ${esc(mz.mesaj)} Konumlar 5 dakikada bir yenilenir.</span></div>`:`<div class="note"><span>${esc(mz?.mesaj||'Mobiliz bağlantısı henüz kurulmadı. Anahtar Ayarlar ekranından girilir.')}</span></div>`}
 <div class="two"><section class="panel map"><header><h2>Harita</h2><div class="leg"><span><i style="background:var(--accent)"></i>Hareket</span><span><i style="background:var(--amber)"></i>Duruyor</span></div></header><div class="pad"><svg viewBox="-10 -10 1020 456" role="img" aria-label="Türkiye haritasında araç konumları"><path class="land" d="${TR_PATH}"/>${noktalar}</svg></div></section>
 <section class="panel"><header><h2>Özet</h2></header><ul class="alist"><li><div>Konumu bilinen araç</div><b>${list.length}</b></li><li><div>Hareket halinde</div><b>${list.filter(k=>+k.hiz>0).length}</b></li><li><div>1 saatten eski veri</div><b>${list.filter(k=>(yasDk(k)??1e9)>60).length}</b></li><li><div>Filoda olup konumu olmayan</div><b>${S.araclar.filter(a=>a.tip!=='Dorse'&&a.durum!=='Pasif'&&!S.konumlar.some(k=>norm(k.plaka)===norm(a.plaka))).length}</b></li></ul></section></div>
 <section class="panel">${list.length?`<div class="tw"><table><thead><tr><th>Plaka</th><th>Durum</th><th class="r">Hız</th><th>Konum</th><th>Veri yaşı</th><th>Aktif sefer</th></tr></thead><tbody>${list.map(k=>{const a=S.araclar.find(x=>norm(x.plaka)===norm(k.plaka)),s=a&&S.seferler.find(x=>x.aracId===a.id&&x.durum==='Yolda'),d=yasDk(k);return `<tr><td>${plaka(k.plaka)}</td><td>${+k.hiz>0?'<span class="chip good">Hareket</span>':'<span class="chip warn">Duruyor</span>'}</td><td class="r">${k.hiz!=null&&k.hiz!==''?num(k.hiz)+' km/s':'—'}</td><td>${k.lat!=null?`<a href="https://www.google.com/maps?q=${k.lat},${k.lng}" target="_blank" rel="noopener">${esc(k.adres)||`${(+k.lat).toFixed(4)}, ${(+k.lng).toFixed(4)}`}</a>`:esc(k.adres)||'—'}</td><td class="nw">${d!=null&&d>60?`<span class="chip warn">${yasYazi(d)}</span>`:yasYazi(d)}</td><td class="nw">${s?`${esc(s.cikis)} → ${esc(s.varis)}`:'—'}</td></tr>`}).join('')}</tbody></table></div>`:emptyB('Mobiliz\'den aldığınız konum listesini aktarın.','konumAktar','Konumları aktar')}</section>`};

V.raporlar=()=>{const n=td(),per={ay:[n.slice(0,7)+'-01',n],yil:[n.slice(0,4)+'-01-01',n],'12':[(()=>{const d=new Date();d.setFullYear(d.getFullYear()-1);return ymd(d)})(),n]}[UI.per],[f,t]=per,ic=x=>x.tarih>=f&&x.tarih<=t,sf=bitti().filter(ic);
 const ar=new Map(),mu=new Map();
 sf.forEach(s=>{const a=ar.get(s.aracId)||{ad:ad('araclar',s.aracId,'plaka'),c:0,km:0,g:0,d:0,b:0};a.c++;a.km+=+s.km||0;a.g+=tutar(s).n;a.d+=gider(s);ar.set(s.aracId,a);const m=mu.get(s.cariId)||{ad:ad('cariler',s.cariId,'unvan'),c:0,g:0,k:0};m.c++;m.g+=tutar(s).n;m.k+=kar(s);mu.set(s.cariId,m)});
 S.bakimlar.filter(ic).forEach(b=>{const a=ar.get(b.aracId)||{ad:ad('araclar',b.aracId,'plaka'),c:0,km:0,g:0,d:0,b:0};a.b+=+b.tutar||0;ar.set(b.aracId,a)});
 const aylar=sonAylar(12);
 return `<div class="head"><div><h1>Raporlar</h1><p>Yalnızca tamamlanan seferler. Tutarlar KDV hariç.</p></div><div class="tabs">${[['ay','Bu ay'],['yil','Bu yıl'],['12','Son 12 ay']].map(([k,l])=>`<button class="tab" aria-pressed="${UI.per===k}" data-a="per:${k}">${l}</button>`).join('')}</div></div>
 <section class="panel"><header><h2>Son 12 ay</h2></header><div class="pad">${grafik(aylar)}</div></section>
 <section class="panel"><header><h2>Araç kârlılığı</h2></header>${ar.size?`<div class="tw"><table><thead><tr><th>Plaka</th><th class="r">Sefer</th><th class="r">Km</th><th class="r">Gelir</th><th class="r">Sefer gideri</th><th class="r">Bakım</th><th class="r">Kâr</th><th class="r">Km başı kâr</th></tr></thead><tbody>${[...ar.values()].map(a=>({...a,k:a.g-a.d-a.b})).sort((x,y)=>y.k-x.k).map(a=>`<tr><td>${plaka(a.ad)}</td><td class="r">${a.c}</td><td class="r">${num(a.km)}</td><td class="r">${tl(a.g)}</td><td class="r">${tl(a.d)}</td><td class="r">${tl(a.b)}</td><td class="r ${a.k<0?'neg':''}"><b>${tl(a.k)}</b></td><td class="r">${a.km?tl(a.k/a.km,2):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Bu dönemde tamamlanan sefer yok.</div>'}</section>
 <section class="panel"><header><h2>Müşteri kârlılığı</h2></header>${mu.size?`<div class="tw"><table><thead><tr><th>Müşteri</th><th class="r">Sefer</th><th class="r">Gelir</th><th class="r">Kâr</th><th class="r">Marj</th></tr></thead><tbody>${[...mu.values()].sort((x,y)=>y.k-x.k).map(m=>`<tr><td>${esc(m.ad)||'Müşteri seçilmemiş'}</td><td class="r">${m.c}</td><td class="r">${tl(m.g)}</td><td class="r ${m.k<0?'neg':''}"><b>${tl(m.k)}</b></td><td class="r">${m.g?'%'+Math.round(m.k/m.g*100):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Bu dönemde tamamlanan sefer yok.</div>'}</section>
 <section class="panel"><header><h2>Aylık tablo</h2></header><div class="tw"><table><thead><tr><th>Ay</th><th class="r">Sefer</th><th class="r">Gelir</th><th class="r">Sefer gideri</th><th class="r">Bakım</th><th class="r">Kâr</th></tr></thead><tbody>${[...aylar].reverse().map(k=>{const[a,b]=ayAralik(k),m=aralik(a,b);return `<tr><td class="nw">${AYLAR[+k.slice(5)-1]} ${k.slice(0,4)}</td><td class="r">${m.sefer}</td><td class="r">${tl(m.gelir)}</td><td class="r">${tl(m.sg)}</td><td class="r">${tl(m.bk)}</td><td class="r ${m.kar<0?'neg':''}"><b>${tl(m.kar)}</b></td></tr>`}).join('')}</tbody></table></div></section>`};

V.fiyatlar=()=>{const l=[...S.fiyatlar].sort((a,b)=>String(ad('cariler',a.cariId,'unvan')).localeCompare(ad('cariler',b.cariId,'unvan'),'tr')||String(a.cikis).localeCompare(b.cikis,'tr'));
 return `<div class="head"><div><h1>Fiyat Listesi</h1><p>Müşteri ve güzergâha göre sabit sefer fiyatı. Sevkiyat bu fiyatları görmez, yalnızca güzergâhı seçer.</p></div><div class="btns"><button class="btn" data-a="aktar:fiyatlar">Excel'den aktar</button><button class="btn pri" data-a="yeni:fiyatlar">Fiyat ekle</button></div></div>
 <section class="panel">${l.length?`<div class="tw"><table><thead><tr><th>Müşteri</th><th>Çıkış</th><th>Varış</th><th class="r">Gidiş km</th><th class="r">Dönüş km</th><th class="r">Fiyat</th><th class="r">Km başı</th></tr></thead><tbody>${l.map(f=>`<tr class="row" data-a="ac:fiyatlar:${f.id}"><td>${esc(ad('cariler',f.cariId,'unvan'))||'—'}</td><td>${esc(f.cikis)}</td><td>${esc(f.varis)}</td><td class="r">${num(f.km)}</td><td class="r">${num(f.donusKm||f.km)}</td><td class="r"><b>${tl(f.fiyat)}</b></td><td class="r">${f.km?tl(f.fiyat/f.km,2):'—'}</td></tr>`).join('')}</tbody></table></div>`:emptyB('Henüz fiyat yok. Önce Cari ekranında müşteri ekleyin.','yeni:fiyatlar','Fiyat ekle')}</section>`};

const ekranAd=k=>(NAV.find(n=>n[0]===k)||[k,k])[1];
const PARA_EKRAN=['cari','fiyatlar','raporlar'];
async function kulYukle(){try{KUL=await api('/kullanicilar');schedule()}catch(e){hata(e)}}
V.kullanicilar=()=>{if(!KUL)return'<div class="empty">Yükleniyor…</div>';
 return `<div class="head"><div><h1>Kullanıcılar</h1><p>Herkes yalnızca kendisine açılan ekranları görür.</p></div><div class="btns"><button class="btn pri" data-a="kulYeni">Kullanıcı ekle</button></div></div>
 <section class="panel"><div class="tw"><table><thead><tr><th>Ad</th><th>Kullanıcı adı</th><th>Rol</th><th>Para bilgisi</th><th>Ekranlar</th><th>Durum</th></tr></thead><tbody>${KUL.liste.map(u=>`<tr class="row" data-a="kulAc:${u.id}"><td class="nw"><b>${esc(u.ad)}</b></td><td class="nw">${esc(u.kadi)}</td><td class="nw">${esc(KUL.roller[u.rol]?.ad||u.rol)}</td><td>${u.para?'<span class="chip warn">Görür</span>':'<span class="chip">Görmez</span>'}</td><td>${esc(u.ekranlar.map(ekranAd).join(', '))}</td><td>${u.aktif?'<span class="chip good">Aktif</span>':'<span class="chip">Kapalı</span>'}</td></tr>`).join('')}</tbody></table></div></section>`};
function kulForm(u){formCtx={c:'kullanici',rec:u};const r=u?.rol||'sevkiyat',R=KUL.roller,e=u?.ekranlar||R[r].ekranlar,p=u?u.para:R[r].para;
 modal(`<form id="kulF" novalidate>${MH_(u?u.ad:'Kullanıcı ekle')}<div class="mb"><div class="grid">
 <div class="fld"><label for="kAd">Ad soyad *</label><input id="kAd" value="${esc(u?.ad)}"></div>
 <div class="fld"><label for="kKadi">Kullanıcı adı *</label><input id="kKadi" value="${esc(u?.kadi)}" ${u?'readonly':''} autocomplete="off"></div>
 <div class="fld"><label for="kSifre">${u?'Yeni şifre (değişmeyecekse boş)':'Geçici şifre *'}</label><input id="kSifre" type="text" autocomplete="off" minlength="8"></div>
 <div class="fld"><label for="kRol">Rol</label><select id="kRol">${Object.entries(R).map(([k,v])=>`<option value="${k}" ${k===r?'selected':''}>${esc(v.ad)}</option>`).join('')}</select></div></div>
 <div class="fld"><label><input id="kPara" type="checkbox" ${p?'checked':''}> Fiyat, gider, kâr ve cari bilgilerini görebilir</label></div>
 <fieldset style="border:1px solid var(--line);border-radius:5px;padding:10px 12px"><legend class="lab">Açık ekranlar</legend><div class="grid" id="kEkr">${KUL.ekranlar.map(k=>`<label><input type="checkbox" value="${k}" ${e.includes(k)?'checked':''}> ${esc(ekranAd(k))}${PARA_EKRAN.includes(k)?' (para yetkisi ister)':''}</label>`).join('')}</div></fieldset>
 ${u?`<div class="fld"><label><input id="kAktif" type="checkbox" ${u.aktif?'checked':''}> Hesap aktif</label></div>`:''}</div>
 <div class="mf"><span></span><div class="btns"><button class="btn pri" type="submit">Kaydet</button></div></div></form>`)}
function rolUygula(){const R=KUL.roller[$('#kRol').value];$('#kPara').checked=R.para;document.querySelectorAll('#kEkr input').forEach(c=>c.checked=R.ekranlar.includes(c.value))}
async function kulKaydet(){const u=formCtx.rec,b={ad:$('#kAd').value.trim(),rol:$('#kRol').value,para:$('#kPara').checked,ekranlar:[...document.querySelectorAll('#kEkr input:checked')].map(c=>c.value)};const sf=$('#kSifre').value;
 try{if(u){if(sf)b.sifre=sf;b.aktif=$('#kAktif').checked;await api('/kullanicilar/'+u.id,{m:'PUT',b})}else{b.kadi=$('#kKadi').value.trim();b.sifre=sf;await api('/kullanicilar',{m:'POST',b})}kapat();toast('Kaydedildi');kulYukle();sync()}catch(e){hata(e)}}
function sifreForm(zorunlu){formCtx=null;modal(`<form id="sifreF" novalidate>${MH_(zorunlu?'Şifrenizi değiştirin':'Şifre değiştir')}<div class="mb">${zorunlu?'<p style="margin:0">Yönetici size geçici şifre verdi. Devam etmeden kendi şifrenizi belirleyin.</p>':''}<div class="grid"><div class="fld"><label for="sEski">Mevcut şifre</label><input id="sEski" type="password" autocomplete="current-password"></div><div class="fld"><label for="sYeni">Yeni şifre (en az 8 karakter)</label><input id="sYeni" type="password" autocomplete="new-password"></div></div></div><div class="mf"><span></span><button class="btn pri" type="submit">Kaydet</button></div></form>`)}
async function sifreKaydet(){try{await api('/sifre',{m:'POST',b:{eski:$('#sEski').value,yeni:$('#sYeni').value}});kapat();toast('Şifre değişti');sync()}catch(e){hata(e)}}

V.ayarlar=()=>{const mz=ayar.mobiliz;
 return `<div class="head"><div><h1>Ayarlar</h1><p>Firma, motorin fiyatı, Mobiliz bağlantısı ve yedek.</p></div></div>
 <div class="two"><section class="panel"><header><h2>Firma ve hesap</h2></header><div class="pad"><div class="grid"><div class="fld"><label for="sFirma">Firma adı</label><input id="sFirma" value="${esc(firma.ad)}"></div><div class="fld"><label for="sEsik">Belge uyarısı (gün önce)</label><input id="sEsik" type="number" min="1" max="365" value="${+firma.esik||30}"></div>${para()?`<div class="fld"><label for="sMotorin">Motorin litre fiyatı, KDV hariç (₺)</label><input id="sMotorin" type="number" step="0.01" value="${esc(ayar.motorin??'')}"><small class="mute">Yeni seferlerde kullanılır, eski seferler değişmez.</small></div>`:''}</div><div class="btns" style="margin-top:12px"><button class="btn pri" data-a="firmaKaydet">Kaydet</button></div></div></section>
 <section class="panel"><header><h2>Yedek</h2></header><div class="pad"><p class="mute" style="margin:0 0 10px">Ayda en az bir kez yedek alıp bilgisayarınızda saklayın.</p><div class="btns"><button class="btn pri" data-a="yedekAl">Yedeği indir</button><label class="btn">Yedekten geri yükle<input id="yedekDosya" type="file" accept=".json" hidden></label></div></div></section></div>
 <section class="panel"><header><h2>Mobiliz bağlantısı</h2></header><div class="pad"><div class="grid"><div class="fld"><label for="sMzTok">Entegrasyon anahtarı</label><input id="sMzTok" type="password" autocomplete="off" placeholder="${ayar.mobilizAnahtarVar?'Kayıtlı, değiştirmek için yazın':'Mobiliz\'den alınır'}"></div><div class="fld"><label for="sMzSu">Sunucu adı</label><input id="sMzSu" value="${esc(ayar.mobilizSunucu||'su0')}"></div></div><div class="btns" style="margin-top:12px"><button class="btn pri" data-a="mzKaydet">Kaydet</button><button class="btn" data-a="mzTest">Bağlantıyı test et</button></div><p id="mzSonuc" class="mute" style="margin:10px 0 0;overflow-wrap:anywhere">${esc(mz?.mesaj||'')}</p></div></section>
 <section class="panel"><header><h2>Hesaplar nasıl yapılıyor</h2></header><ul class="alist"><li><div>Sefer fiyatı<small>Müşteri ve güzergâh Fiyat Listesi'nden bulunur. Sefer açılınca fiyat kayda sabitlenir, liste sonradan değişse de eski sefer değişmez.</small></div></li><li><div>Yakıt gideri<small>Gidiş km × dolu tüketim ÷ 100 × motorin fiyatı. Boş dönüşte dönüş km × boş tüketim ÷ 100 × motorin fiyatı eklenir. Yüklü dönüş ayrı sefer açıldığı için eklenmez.</small></div></li><li><div>Sefer kârı<small>Navlun eksi yakıt eksi diğer giderler, hepsi KDV hariç.</small></div></li><li><div>Cari alacak<small>Tamamlanan seferin navlunu + KDV − tevkifat. Planlanan ve yoldaki seferler bakiyeye girmez.</small></div></li><li><div>Tevkifat<small>Seferde 2/10 seçilirse KDV'nin %20'si alacaktan düşülür. Oran ve kapsamı muhasebecinizle doğrulayın.</small></div></li></ul></section>`};

/* ---------- çizim ---------- */
let rq=0;const schedule=()=>{if(rq)return;rq=requestAnimationFrame(()=>{rq=0;render()})};
function route(){const r=location.hash.slice(1);return V[r]&&ekranVar(r)?r:(me?.ekranlar[0]||'genel')}
function render(){
  if(!me)return;
  const r=route(),uy=ekranVar('belgeler')?belgeler().filter(b=>b.sev==='gecti'||b.sev==='yakin').length:0,bos=ekranVar('seferler')?musaitlik().filter(x=>!x.sert.length&&!x.yumusak.length).length:0;
  $('#nav').innerHTML=NAV.filter(([k])=>ekranVar(k)).map(([k,l])=>`<a href="#${k}" ${k===r?'aria-current="page"':''}><span>${l}</span>${k==='belgeler'&&uy?`<span class="n">${uy}</span>`:k==='seferler'&&bos?`<span class="n" title="İşe gönderilebilir araç">${bos}</span>`:''}</a>`).join('');
  $('#firma').textContent=firma.ad||'Filo, sefer ve cari kayıtları';
  $('#kim').textContent=me.ad;
  const v=$('#view'),act=document.activeElement,id=act&&act.id,pos=act&&act.selectionStart;
  v.innerHTML=V[r]();
  if(id&&document.getElementById(id)&&!$('#dlg').open){const e=document.getElementById(id);e.focus();try{e.setSelectionRange(pos,pos)}catch(_){}}
}
addEventListener('hashchange',()=>{if(route()==='kullanicilar')kulYukle();render();scrollTo(0,0)});

/* ---------- yardımcılar ---------- */
function toast(m,err){const t=document.createElement('div');t.className='toast'+(err?' err':'');t.textContent=m;$('#toasts').replaceChildren(t);setTimeout(()=>t.remove(),err?6000:2600)}
function hata(e){toast(e?.mesaj||'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',true)}
async function api(yol,o={}){
  const r=await fetch('/api'+yol,{method:o.m||'GET',credentials:'same-origin',headers:o.b!==undefined?{'content-type':'application/json'}:{},body:o.b!==undefined?JSON.stringify(o.b):undefined});
  const j=await r.json().catch(()=>({}));
  if(r.status===401&&yol!=='/giris'){girisGoster();throw{mesaj:'Oturumunuz kapandı. Tekrar giriş yapın.'}}
  if(!r.ok)throw{mesaj:j.hata||'İşlem yapılamadı.'};
  return j}
function yerlestir(c,id,d){const i=S[c].findIndex(x=>x.id===id);if(d==null){if(i>=0)S[c].splice(i,1)}else if(i>=0)S[c][i]={id,...d};else S[c].push({id,...d})}
const put=async(c,id,d)=>{const j=await api(`/k/${c}/${id}`,{m:'PUT',b:d});yerlestir(c,id,j.data);schedule();return j};
const sil=async(c,id)=>{await api(`/k/${c}/${id}`,{m:'DELETE'});yerlestir(c,id,null);schedule()};
const yeniId=()=>[...crypto.getRandomValues(new Uint8Array(10))].map(x=>x.toString(16).padStart(2,'0')).join('');
function modal(html){const d=$('#dlg');d.innerHTML=html;if(!d.open)d.showModal();return d}
const kapat=()=>$('#dlg').close();
const MH_=(t)=>`<div class="mh"><h2>${esc(t)}</h2><button class="btn sm" data-a="kapat" type="button">Kapat</button></div>`;
function fieldHtml(f,v){
  const id='f_'+f.k,val=v??(typeof f.def==='function'?f.def():f.def)??'',w=f.w||f.t==='area'?' w':'';let c;
  if(f.t==='select')c=`<select id="${id}">${f.opts.map(o=>{const[a,b]=Array.isArray(o)?o:[o,o];return `<option value="${esc(a)}" ${String(val)===String(a)?'selected':''}>${esc(b)}</option>`}).join('')}</select>`;
  else if(f.t==='ref'){const l=S[f.ref].filter(x=>!f.fil||f.fil(x)).map(x=>[x.id,x[SCHEMA[f.ref].key]]).sort((a,b)=>String(a[1]).localeCompare(b[1],'tr'));c=`<select id="${id}"><option value="">Seçin</option>${l.map(([a,b])=>`<option value="${esc(a)}" ${val===a?'selected':''}>${esc(b)}</option>`).join('')}</select>`}
  else if(f.t==='ham')c=`<select id="${id}">${f.html(val)}</select>`;
  else if(f.t==='area')c=`<textarea id="${id}" rows="2">${esc(val)}</textarea>`;
  else c=`<input id="${id}" type="${f.t==='num'?'number':f.t==='date'?'date':'text'}" ${f.t==='num'?'step="any"':''} value="${esc(val)}" ${f.ro?'readonly':''}>`;
  return `<div class="fld${w}"><label for="${id}">${esc(f.l)}${f.req?' *':''}</label>${c}${f.hint?`<small class="mute">${esc(f.hint)}</small>`:''}</div>`}
function oku(fs){const o={};for(const f of fs){let v=$('#f_'+f.k).value;v=typeof v==='string'?v.trim():v;if(f.upper)v=v.toLocaleUpperCase('tr').replace(/\s+/g,' ');if(f.t==='num')v=v===''?null:+v;if(f.req&&(v===''||v==null)){toast(`${f.l} alanı zorunlu.`,true);$('#f_'+f.k).focus();return null}o[f.k]=v}return o}

let formCtx=null;
function acForm(c,rec,preset){
  const s=SCHEMA[c],v={...(preset||{}),...(rec||{})};formCtx={c,rec};const alan=gorAlan(c);
  modal(`<form id="frm" novalidate>${MH_(`${s.ad} ${rec?'düzenle':'ekle'}`)}<div class="mb"><div class="grid">${alan.map(f=>fieldHtml(f,v[f.k])).join('')}</div></div><div class="mf"><div>${rec?'<button class="btn dan" type="button" data-a="sil">Sil</button>':''}</div><div class="btns"><button class="btn pri" type="submit">Kaydet</button></div></div></form>`)}
async function kaydet(){
  const{c,rec}=formCtx,s=SCHEMA[c],o=oku(gorAlan(c));if(!o)return;
  if(S[c].some(x=>ank(c,x)&&ank(c,x)===ank(c,o)&&x.id!==rec?.id)){toast('Bu kayıt zaten var.',true);return}
  if(c==='hareketler'&&!(o.tutar>0)){toast('Tutar sıfırdan büyük olmalı.',true);return}
  try{await put(c,rec?.id||yeniId(c),{...(rec?strip(rec):{}),...o,guncel:new Date().toISOString()});kapat();toast('Kaydedildi')}catch(e){hata(e)}}
const strip=r=>{const{id,...x}=r;return x};
const gorAlan=c=>SCHEMA[c].f.filter(f=>!f.para||para());
const ank=(c,d)=>{const s=SCHEMA[c];return s.ank?s.ank(d):s.key?norm(d[s.key]):''};
function silOnay(c,rec){
  const engel={araclar:()=>S.seferler.filter(s=>s.aracId===rec.id||s.dorseId===rec.id).length,soforler:()=>S.seferler.filter(s=>s.soforId===rec.id).length,cariler:()=>S.seferler.filter(s=>s.cariId===rec.id).length}[c];
  const n=engel?engel():0;
  if(n){toast(`Bu kayda bağlı ${n} sefer veya hareket var, silinemez. Durumunu Pasif yapın.`,true);return}
  modal(`${MH_('Silme onayı')}<div class="mb"><p style="margin:0">Bu kayıt kalıcı olarak silinecek. Geri alınamaz.</p></div><div class="mf"><span></span><div class="btns"><button class="btn" data-a="kapat">Vazgeç</button><button class="btn dan" data-a="silEt:${c}:${rec.id}">Evet, sil</button></div></div>`)}

/* ---------- sefer formu ---------- */
function aracOpts(cikis,sec){const m=musaitlik(),c=norm(cikis),o=(x,dis)=>`<option value="${x.a.id}" ${x.a.id===sec?'selected':''} ${dis&&x.a.id!==sec?'disabled':''}>${esc(x.a.plaka)} · ${esc(x.sert[0]||x.yumusak[0]||(c&&norm(x.son)===c?'Çıkış şehrinde':bosYazi(x)))}</option>`;
 const uy=m.filter(x=>!x.sert.length&&!x.yumusak.length).sort((a,b)=>(!!c&&norm(b.son)===c)-(!!c&&norm(a.son)===c)||(b.gun??1e4)-(a.gun??1e4)),is=m.filter(x=>!x.sert.length&&x.yumusak.length),ha=m.filter(x=>x.sert.length);
 return `<option value="">Seçin</option><optgroup label="Önerilen: boşta">${uy.map(x=>o(x)).join('')}</optgroup>${is.length?`<optgroup label="İşi var">${is.map(x=>o(x)).join('')}</optgroup>`:''}${ha.length?`<optgroup label="Gönderilemez">${ha.map(x=>o(x,1)).join('')}</optgroup>`:''}`}
function sofOpts(sec){const yol=new Set(S.seferler.filter(s=>s.durum==='Yolda').map(s=>s.soforId));return `<option value="">Seçin</option>${S.soforler.filter(s=>s.durum!=='Pasif').sort((a,b)=>yol.has(a.id)-yol.has(b.id)||String(a.ad).localeCompare(b.ad,'tr')).map(s=>`<option value="${s.id}" ${s.id===sec?'selected':''}>${esc(s.ad)}${yol.has(s.id)?' · yolda':s.durum==='İzinli'?' · izinli':''}</option>`).join('')}`}
function guzOpts(cariId,sec){const l=S.fiyatlar.filter(f=>f.cariId===cariId);return `<option value="">${cariId?'Güzergâh seçin':'Önce müşteri seçin'}</option>${l.map(f=>`<option value="${f.id}" ${f.id===sec?'selected':''}>${esc(f.cikis)} → ${esc(f.varis)} · ${num(f.km)} km</option>`).join('')}<option value="__d" ${sec==='__d'?'selected':''}>Listede yok, elle gir</option>`}
const SF=()=>[F('tarih','Tarih','date',{req:1,def:td}),F('durum','Durum','select',{opts:['Planlandı','Yolda','Tamamlandı','İptal'],def:'Planlandı'}),F('cariId','Müşteri','ref',{ref:'cariler',fil:c=>c.tur!=='Tedarikçi'}),
 F('cikis','Çıkış','text',{req:1}),F('varis','Varış','text',{req:1}),F('km','Gidiş km','num'),F('donusKm','Dönüş km','num'),
 F('donus','Dönüş','select',{opts:[['','Seçin'],['Boş','Boş dönüş'],['Yüklü','Yüklü dönüş (ayrı sefer)'],['Yok','Dönüş yok, tek yön']],req:1}),
 F('aracId','Araç','ham',{html:v=>aracOpts($('#f_cikis')?.value,v)}),F('dorseId','Dorse','ref',{ref:'araclar',fil:a=>a.tip==='Dorse'&&a.durum!=='Pasif'}),F('soforId','Şoför','ham',{html:v=>sofOpts(v)}),F('yuk','Yük'),
 ...(para()?[F('navlunElle','Elle fiyat, KDV hariç (₺)','num',{hint:'Boşsa fiyat listesi kullanılır.'}),F('kdvOran','KDV','select',{opts:[['20','%20'],['10','%10'],['1','%1'],['0','%0']],def:'20'}),F('tevkifat','Tevkifat','select',{opts:[['','Yok'],['2/10','2/10']],def:''}),F('faturaNo','Fatura no')]:[]),
 F('not','Not','area')];
const gRow=(g={})=>`<div class="gr"><select aria-label="Gider türü" class="gt">${GIDER.map(o=>`<option ${g.tur===o?'selected':''}>${o}</option>`).join('')}</select><input aria-label="Tutar" class="gu" type="number" step="any" placeholder="Tutar ₺" value="${esc(g.tutar??'')}"><input aria-label="Not" class="gn" placeholder="Not" value="${esc(g.not)}"><button class="btn sm" type="button" data-a="gSil" aria-label="Gideri kaldır">Kaldır</button></div>`;
function guzKilit(k){['cikis','varis','km','donusKm'].forEach(n=>{const e=$('#f_'+n);if(e)e.readOnly=k})}
function guzSec(){const v=$('#f_guz').value,f=S.fiyatlar.find(x=>x.id===v);
 if(f){$('#f_cikis').value=f.cikis;$('#f_varis').value=f.varis;$('#f_km').value=f.km??'';$('#f_donusKm').value=f.donusKm??f.km??'';guzKilit(true)}
 else{guzKilit(false);if(v!=='__d'){$('#f_cikis').value='';$('#f_varis').value='';$('#f_km').value='';$('#f_donusKm').value=''}}
 const a=$('#f_aracId'),s=a.value;a.innerHTML=aracOpts($('#f_cikis').value,s);ozet()}
function seferForm(rec,preset){
  const v={...(preset||{}),...(rec||{})};formCtx={c:'seferler',rec};const p=para();
  const es=v.cariId&&S.fiyatlar.find(f=>f.cariId===v.cariId&&norm(f.cikis)===norm(v.cikis)&&norm(f.varis)===norm(v.varis)),gid=es?es.id:(rec?'__d':'');
  const fs=SF(),fh=k=>fieldHtml(fs.find(f=>f.k===k),v[k]);
  modal(`<form id="frm" novalidate>${MH_(rec?`Sefer ${rec.no}`:'Yeni sefer')}<div class="mb"><div class="grid">
  ${fh('tarih')}${fh('durum')}${fh('cariId')}
  <div class="fld"><label for="f_guz">Güzergâh</label><select id="f_guz">${guzOpts(v.cariId,gid)}</select></div>
  ${fh('cikis')}${fh('varis')}${fh('km')}${fh('donusKm')}${fh('donus')}${fh('aracId')}${fh('dorseId')}${fh('soforId')}${fh('yuk')}
  ${p?fh('navlunElle')+fh('kdvOran')+fh('tevkifat')+fh('faturaNo'):''}${fh('not')}</div>
  ${p?`<div><div class="head" style="margin-bottom:6px"><h2>Diğer giderler (KDV hariç)</h2><button class="btn sm" type="button" data-a="gEkle">Gider ekle</button></div><div id="gl" style="display:flex;flex-direction:column;gap:6px">${(v.giderler||[]).map(gRow).join('')}</div></div><div class="sum" id="sum"></div><div id="uyari" class="mute"></div>`:''}</div>
  <div class="mf"><div class="btns">${rec?`<button class="btn dan" type="button" data-a="sil">Sil</button><button class="btn" type="button" data-a="kopya:${rec.id}">Kopyala</button>`:''}</div><div class="btns"><button class="btn pri" type="submit">Kaydet</button></div></div></form>`);
  if(es)guzKilit(true);ozet()}
const gOku=()=>[...document.querySelectorAll('#gl .gr')].map(r=>({tur:r.querySelector('.gt').value,tutar:+r.querySelector('.gu').value||0,not:r.querySelector('.gn').value.trim()})).filter(g=>g.tutar||g.not);
function yakitTahmin(d){const a=by('araclar',d.aracId),km=+d.km||0,dk=d.donus==='Boş'?(+d.donusKm||km):0,dolu=+a?.tuketimDolu||0,bos=+a?.tuketimBos||dolu,f=+ayar.motorin||0;if(!km||!dolu||!f)return null;const l=r2(km*dolu/100+dk*bos/100);return{litre:l,tutar:r2(l*f)}}
function ozet(){if(!$('#sum'))return;
 const c=$('#f_cariId').value,ci=$('#f_cikis').value,va=$('#f_varis').value,el=$('#f_navlunElle').value,f=S.fiyatlar.find(x=>x.cariId===c&&norm(x.cikis)===norm(ci)&&norm(x.varis)===norm(va)),nav=el!==''?+el:f?+f.fiyat:0;
 const s={navlun:nav,kdvOran:$('#f_kdvOran').value,tevkifat:$('#f_tevkifat').value,giderler:gOku()},d={km:$('#f_km').value,donusKm:$('#f_donusKm').value,donus:$('#f_donus').value,aracId:$('#f_aracId').value},y=yakitTahmin(d);s.yakit=y;
 const t=tutar(s),g=gider(s),k=r2(t.n-g),uy=[];
 if(el===''&&!f&&c&&ci&&va)uy.push('Bu güzergâh müşterinin fiyat listesinde yok.');if(!ayar.motorin)uy.push('Motorin fiyatı girilmemiş.');if(d.aracId&&!by('araclar',d.aracId)?.tuketimDolu)uy.push('Araçta yakıt tüketimi girilmemiş.');
 $('#sum').innerHTML=`<div><span class="lab">Navlun</span><b>${tl(nav)}</b></div><div><span class="lab">Yakıt${y?` (${num(y.litre)} L)`:''}</span><b>${y?tl(y.tutar):'—'}</b></div><div><span class="lab">Toplam gider</span><b>${tl(g)}</b></div><div><span class="lab">Kâr</span><b class="${k<0?'neg':''}">${tl(k)}</b></div><div><span class="lab">Cari alacak</span><b>${tl(t.alacak)}</b></div>`;
 $('#uyari').textContent=uy.join(' ')}
async function seferKaydet(){
  const{rec}=formCtx,o=oku(SF());if(!o)return;if(para())o.giderler=gOku();
  try{await put('seferler',rec?.id||yeniId(),o);kapat();toast('Sefer kaydedildi')}catch(e){hata(e)}}

/* ---------- cari ekstre ---------- */
function ekstreAc(id){const c=by('cariler',id),r=ekstre(c),b=r.length?r[r.length-1].s:0;
 modal(`${MH_(c.unvan)}<div class="mb"><div class="sum"><div><span class="lab">Bakiye</span><b class="${b<0?'neg':''}">${tl(Math.abs(b),2)}</b><small class="mute">${b>0?'Bize borçlu':b<0?'Biz borçluyuz':'Hesap kapalı'}</small></div><div><span class="lab">Vergi no</span><b>${esc(c.vergiNo)||'—'}</b></div><div><span class="lab">Telefon</span><b>${esc(c.telefon)||'—'}</b></div></div>
 ${r.length?`<div class="tw"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr></thead><tbody>${r.map(x=>`<tr><td class="nw">${fD(x.t)}</td><td>${esc(x.a)}</td><td class="r">${x.b?tl(x.b,2):''}</td><td class="r">${x.y?tl(x.y,2):''}</td><td class="r"><b>${tl(x.s,2)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Bu cariye ait hareket yok.</div>'}</div>
 <div class="mf"><button class="btn" data-a="ac:cariler:${c.id}">Cariyi düzenle</button><div class="btns"><button class="btn pri" data-a="tahsil:${c.id}">Tahsilat gir</button></div></div>`)}

/* ---------- dışa/içe aktarım ---------- */
function kaydetDosya(ad,veri){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([veri]));a.download=ad;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Dosya indirildi')}
function csvSefer(){const q=v=>`"${String(v??'').replace(/"/g,'""')}"`,n=v=>String(r2(v)).replace('.',',');
 const b=['Sefer no','Tarih','Durum','Çıkış','Varış','Km','Plaka','Dorse','Şoför','Müşteri','Yük','Navlun','KDV %','Tevkifat','Gider','Kâr','Fatura no'];
 const r=seferRows().map(s=>[q(s.no),fD(s.tarih),q(s.durum),q(s.cikis),q(s.varis),s.km??'',q(ad('araclar',s.aracId,'plaka')),q(ad('araclar',s.dorseId,'plaka')),q(ad('soforler',s.soforId,'ad')),q(ad('cariler',s.cariId,'unvan')),q(s.yuk),n(tutar(s).n),s.kdvOran??'',q(s.tevkifat),n(gider(s)),n(kar(s)),q(s.faturaNo)].join(';'));
 kaydetDosya(`seferler-${td()}.csv`,'﻿'+[b.join(';'),...r].join('\r\n'))}
let xlsxYuk=null;
function xlsx(){return xlsxYuk||=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>ok(window.XLSX);s.onerror=()=>{xlsxYuk=null;no(new Error('xlsx'))};document.head.appendChild(s)})}
async function dosyaSatir(file,baslikVar){
  if(/\.json$/i.test(file.name))return jsonSatir(await file.text());
  const X=await xlsx(),wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true}),ws=wb.Sheets[wb.SheetNames[0]],a=X.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  let h=a.findIndex((r,i)=>i<20&&r.some(c=>baslikVar(norm(c))));if(h<0)h=0;
  const k=a[h].map(c=>String(c).trim());
  return a.slice(h+1).filter(r=>r.some(c=>c!=='')).map(r=>Object.fromEntries(k.map((x,i)=>[x,r[i]])))}
function jsonSatir(t){const j=JSON.parse(t),rows=o=>{if(Array.isArray(o))return o;if(o&&typeof o==='object'){for(const k of ['result','data','items','content','vehicles','list'])if(o[k])return rows(o[k]);const v=Object.values(o).find(Array.isArray);if(v)return v}return[o]};return rows(j)}
function tarihOku(v){if(v instanceof Date&&!isNaN(v))return ymd(v);const s=String(v??'').trim();let m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);if(m)return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''}
function aktarAc(c){const s=SCHEMA[c],ad_=s.f.map(f=>f.l).join(', ');
 modal(`${MH_(`${s.ad} listesini aktar`)}<div class="mb"><p style="margin:0">Excel (.xlsx) veya CSV dosyanızın ilk satırı sütun başlıkları olsun. Zorunlu sütunlar: <b>${esc(s.f.filter(f=>f.req).map(f=>f.l).join(', '))}</b>.</p><p class="mute" style="margin:0">Tanınan sütunlar: ${esc(ad_)}</p><div class="fld"><label for="aktarDosya">Dosya</label><input id="aktarDosya" type="file" accept=".xlsx,.xls,.csv" data-c="${c}"></div><div id="aktarOz"></div></div>`)}
let aktarim=null;
async function aktarOku(file,c){const s=SCHEMA[c],o=$('#aktarOz'),zor=s.f.filter(f=>f.req);o.textContent='Dosya okunuyor…';
 try{const map=new Map();s.f.forEach(f=>[f.k,f.l,...(f.al||[])].forEach(n=>map.set(norm(n),f)));
  const satir=await dosyaSatir(file,n=>map.has(n)),yeni=[];let bos=0,var_=0;const gor=new Set(S[c].map(x=>ank(c,x)));
  for(const r of satir){const d={};for(const[k,v]of Object.entries(r)){const f=map.get(norm(k));if(!f||v===''||v==null)continue;if(f.t==='date')d[f.k]=tarihOku(v);else if(f.t==='num'){const n=typeof v==='number'?v:+String(v).replace(/\./g,'').replace(',','.');if(!isNaN(n))d[f.k]=n}else if(f.t==='select'){const m=f.opts.find(o=>norm(o)===norm(v));if(m)d[f.k]=m}else if(f.t==='ref'){const m=S[f.ref].find(x=>norm(x[SCHEMA[f.ref].key])===norm(v));if(m)d[f.k]=m.id}else d[f.k]=f.upper?String(v).trim().toLocaleUpperCase('tr').replace(/\s+/g,' '):String(v).trim()}
   if(zor.some(f=>d[f.k]==null||d[f.k]==='')){bos++;continue}const n=ank(c,d);if(gor.has(n)){var_++;continue}gor.add(n);
   s.f.forEach(f=>{if(d[f.k]===undefined&&f.def)d[f.k]=typeof f.def==='function'?f.def():f.def});yeni.push(d)}
  aktarim={c,yeni};
  o.innerHTML=`<div class="sum"><div><span class="lab">Eklenecek</span><b>${yeni.length}</b></div><div><span class="lab">Zaten kayıtlı</span><b>${var_}</b></div><div><span class="lab">Eksik bilgili</span><b>${bos}</b></div></div>${yeni.length?`<div class="btns" style="margin-top:10px"><button class="btn pri" data-a="aktarEt">${yeni.length} kaydı ekle</button></div>`:''}`
 }catch(e){o.textContent=e.message==='xlsx'?'Excel okuyucu yüklenemedi. CSV olarak deneyin.':'Dosya okunamadı. Biçimini kontrol edin.'}}
async function aktarEt(){const{c,yeni}=aktarim;let i=0;try{for(const d of yeni){await put(c,yeniId(c),{...d,guncel:new Date().toISOString()});i++;if($('#aktarOz'))$('#aktarOz').textContent=`${i} / ${yeni.length} eklendi…`}kapat();toast(`${i} kayıt eklendi`)}catch(e){hata(e);toast(`${i} kayıt eklendi, sonrası durdu.`,true)}}

/* Mobiliz: panel dışa aktarımı ya da API yanıtı. Alan adları farklı olabileceği için geniş eşleşme. */
const K={pl:['PLATE','PLAKA','LICENSEPLATE','VEHICLEPLATE','PLATENUMBER','PLATENO','ARACPLAKA','ARACPLAKASI','ARACPLAKANO','ARAC','ARACADI','VEHICLE','VEHICLENAME','MUNAME','NAME'],la:['LAT','LATITUDE','ENLEM','GPSLAT','GPSLATITUDE'],lo:['LNG','LON','LONG','LONGITUDE','BOYLAM','GPSLNG','GPSLON','GPSLONGITUDE'],hz:['SPEED','HIZ','HIZKMS','HIZKMSA','HIZKMSAAT','VELOCITY','GPSSPEED'],zm:['TIME','EVENTTIME','MESSAGETIME','MESSAGEDATE','EVENTDATE','LASTACTIVITYTIME','ACTIVITYTIME','LASTSEEN','GPSTIME','DATE','DATETIME','TARIH','ZAMAN','SONSINYAL','SONVERI','SONSINYALZAMANI'],ad:['ADDRESS','ADRES','OPENADDRESS','ACIKADRES','FORMATTEDADDRESS','LOCATIONNAME','KONUM','SONKONUM']};
const duz=(o,r={})=>{for(const[k,v]of Object.entries(o||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date))duz(v,r);else{const n=norm(k);if(!(n in r))r[n]=v}}return r};
const bul=(r,l)=>{for(const k of l){const v=r[k];if(v!==undefined&&v!==''&&v!==null)return v}};
const say=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n};
function zamanOku(v){if(v instanceof Date)return v.getTime();if(typeof v==='number')return v>1e11?v:v>1e9?v*1e3:null;const s=String(v??'').trim(),m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(m)return new Date(+m[3],m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();const t=Date.parse(s);return isNaN(t)?null:t}
function konumCoz(satirlar){const en=new Map();let atla=0;
 for(const ham of satirlar){const r=duz(ham),pl=bul(r,K.pl),la=say(bul(r,K.la)),lo=say(bul(r,K.lo)),adr=bul(r,K.ad);
  const kord=la!=null&&lo!=null&&Math.abs(la)<=90&&Math.abs(lo)<=180&&!(la===0&&lo===0);
  if(!pl||!norm(pl)||(!kord&&!adr)){atla++;continue}
  const k={plaka:String(pl).trim().toLocaleUpperCase('tr'),lat:kord?la:null,lng:kord?lo:null,hiz:say(bul(r,K.hz)),adres:adr?String(adr).trim():'',zaman:zamanOku(bul(r,K.zm))},n=norm(pl),o=en.get(n);
  if(!o||(k.zaman||0)>=(o.zaman||0))en.set(n,k)}
 return{liste:[...en.entries()],atla}}
function konumAc(){modal(`${MH_('Mobiliz konumlarını aktar')}<div class="mb"><p style="margin:0">Mobiliz'den aldığınız araç konum listesini yükleyin (Excel, CSV) ya da API yanıtını yapıştırın. Plaka ve konum sütunları otomatik bulunur.</p><div class="fld"><label for="konumDosya">Excel, CSV veya JSON dosyası</label><input id="konumDosya" type="file" accept=".xlsx,.xls,.csv,.json"></div><div class="fld"><label for="konumYaz">Ya da JSON yapıştırın</label><textarea id="konumYaz" class="big" rows="4" placeholder='[{"plate":"34 ABC 101","latitude":41.0,"longitude":29.0,"speed":82}]'></textarea></div><div class="btns"><button class="btn" data-a="konumCoz">Yapıştırılanı oku</button></div><div id="aktarOz"></div></div>`)}
let konumHazir=null;
function konumOzet(s){const{liste,atla}=konumCoz(s),o=$('#aktarOz'),pl=new Set(S.araclar.map(a=>norm(a.plaka))),yok=liste.filter(([n])=>!pl.has(n)).length;konumHazir=liste;
 if(!liste.length){o.innerHTML=`<div class="note"><span>Plaka ve konum bulunamadı. ${s.length} satır okundu. Sütun başlıklarında Plaka ile Enlem/Boylam veya Adres olmalı.</span></div>`;return}
 o.innerHTML=`<div class="sum"><div><span class="lab">Araç</span><b>${liste.length}</b></div><div><span class="lab">Filoda olmayan</span><b>${yok}</b></div><div><span class="lab">Atlanan satır</span><b>${atla}</b></div></div><div class="btns" style="margin-top:10px"><button class="btn pri" data-a="konumEt">Konumları güncelle</button></div>`}
async function konumEt(){const a=new Date().toISOString();try{for(const[n,k]of konumHazir)await put('konumlar',n.slice(0,60),{...k,aktarim:a});kapat();toast(`${konumHazir.length} aracın konumu güncellendi`)}catch(e){hata(e)}}
async function yedekAl(){try{kaydetDosya(`sefer-defteri-yedek-${td()}.json`,JSON.stringify(await api('/yedek')))}catch(e){hata(e)}}
let yedek=null;
async function yedekOku(f){try{const j=JSON.parse(await f.text());if(j.surum!==2||!Array.isArray(j.kayit))throw 0;yedek=j;
 modal(`${MH_('Yedekten geri yükle')}<div class="mb"><p style="margin:0">${esc(fD((j.tarih||'').slice(0,10)))} tarihli yedekte ${num(j.kayit.length)} kayıt var. Aynı kayıtlar yedekteki haliyle değiştirilir, sonradan eklenenler silinmez.</p></div><div class="mf"><span></span><div class="btns"><button class="btn" data-a="kapat">Vazgeç</button><button class="btn pri" data-a="yedekEt">Geri yükle</button></div></div>`)}catch(_){toast('Bu dosya geçerli bir yedek değil.',true)}}
async function yedekEt(){try{await api('/yedek',{m:'POST',b:yedek});kapat();toast('Yedek geri yüklendi');sonSync=0;await sync()}catch(e){hata(e)}}

/* ---------- olaylar ---------- */
async function durumYap(id,d){const s=by('seferler',id);if(d==='Tamamlandı'&&!s.cariId){seferForm(s);toast('Tamamlamak için müşteri seçin.',true);return}try{await put('seferler',id,{...strip(s),durum:d});toast(`Sefer: ${d}`)}catch(e){hata(e)}}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  const[a,b,c]=el.dataset.a.split(':');
  if(el.tagName==='BUTTON'&&el.closest('tr.row'))e.stopPropagation();
  ({kapat,
   seferYeni:()=>seferForm(null,{tarih:td()}),
   gonder:()=>seferForm(null,{tarih:td(),aracId:b}),
   sefer:()=>seferForm(by('seferler',b)),
   kopya:()=>{const s=by('seferler',b),{id,no,giderler,faturaNo,guncel,yakit,bitisTarih,navlun,...r}=s;seferForm(null,{...r,tarih:td(),durum:'Planlandı',aracId:''})},
   yola:()=>durumYap(b,'Yolda'),tamam:()=>durumYap(b,'Tamamlandı'),
   gEkle:()=>{$('#gl').insertAdjacentHTML('beforeend',gRow());$('#gl').lastElementChild.querySelector('.gu').focus()},
   gSil:()=>{el.closest('.gr').remove();ozet()},
   yeni:()=>acForm(b,null),ac:()=>acForm(b,by(b,c)),
   sil:()=>silOnay(formCtx.c,formCtx.rec),
   silEt:async()=>{try{await sil(b,c);kapat();toast('Silindi')}catch(x){hata(x)}},
   tahsil:()=>acForm('hareketler',null,{cariId:b,tur:'Tahsilat'}),
   ekstre:()=>ekstreAc(b),
   filo:()=>{UI.filo=b;render()},belge:()=>{UI.belge=b;render()},per:()=>{UI.per=b;render()},
   aktar:()=>aktarAc(b),aktarEt,csvSefer,yedekAl,yedekEt,
   konumAktar:konumAc,konumEt,
   konumCoz:()=>{try{konumOzet(jsonSatir($('#konumYaz').value))}catch(_){$('#aktarOz').textContent='Yapıştırılan metin geçerli JSON değil.'}},
   firmaKaydet:async()=>{try{const b={firma:$('#sFirma').value,esik:+$('#sEsik').value||30};if($('#sMotorin'))b.motorin=+$('#sMotorin').value||null;const j=await api('/ayar',{m:'PUT',b});ayarUygula(j.ayar);schedule();toast('Kaydedildi')}catch(x){hata(x)}},
   mzKaydet:async()=>{try{const b={mobilizSunucu:$('#sMzSu').value};if($('#sMzTok').value)b.mobilizToken=$('#sMzTok').value;const j=await api('/ayar',{m:'PUT',b});ayarUygula(j.ayar);schedule();toast('Kaydedildi')}catch(x){hata(x)}},
   mzTest:async()=>{const o=$('#mzSonuc');o.textContent='Deneniyor…';try{const j=await api('/mobiliz/test',{m:'POST',b:{}});o.textContent=j.ok?`Bağlantı tamam. ${j.satir} satır geldi, ${j.eslesen} araç eşleşti. İlk satırdaki alanlar: ${j.alanlar.join(', ')}`:j.mesaj}catch(x){o.textContent=x.mesaj||'Bağlantı kurulamadı.'}},
   mzYenile:async()=>{try{const j=await api('/mobiliz/yenile',{m:'POST',b:{}});toast(j.mesaj,!j.ok);sync()}catch(x){hata(x)}},
   eksikHesapla:async()=>{try{const j=await api('/eksikleri-hesapla',{m:'POST',b:{}});toast(`${j.n} sefer yeniden hesaplandı`);sync()}catch(x){hata(x)}},
   kulYeni:()=>kulForm(null),kulAc:()=>kulForm(KUL.liste.find(u=>u.id===b)),
   sifre:()=>sifreForm(false),cikis:async()=>{try{await api('/cikis',{m:'POST',b:{}})}catch(_){}location.reload()},
  }[a]||(()=>{}))();
});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target.id;if(f==='girisF')girisYap();else if(f==='kurF')kurulumYap();else if(f==='kulF')kulKaydet();else if(f==='sifreF')sifreKaydet();else formCtx?.c==='seferler'?seferKaydet():kaydet()});
document.addEventListener('input',e=>{const t=e.target;
  if(t.id==='q'){UI.q=t.value;$('#list').innerHTML=seferTablo()}
  else if(t.id==='cq'){UI.cariQ=t.value;$('#list').innerHTML=cariTablo()}
  else if(t.closest('#frm')&&$('#sum'))ozet()});
document.addEventListener('change',e=>{const t=e.target;
  if(t.id==='fDurum'){UI.durum=t.value;$('#list').innerHTML=seferTablo()}
  else if(t.id==='fAy'){UI.ay=t.value;$('#list').innerHTML=seferTablo()}
  else if(t.id==='aktarDosya'&&t.files[0])aktarOku(t.files[0],t.dataset.c);
  else if(t.id==='konumDosya'&&t.files[0]){$('#aktarOz').textContent='Dosya okunuyor…';dosyaSatir(t.files[0],n=>K.pl.includes(n)).then(konumOzet).catch(()=>{$('#aktarOz').textContent='Dosya okunamadı. Biçimini kontrol edin.'})}
  else if(t.id==='yedekDosya'&&t.files[0]){yedekOku(t.files[0]);t.value=''}
  else if(t.id==='f_cariId'&&$('#f_guz')){$('#f_guz').innerHTML=guzOpts(t.value,'');guzSec()}
  else if(t.id==='f_guz')guzSec();
  else if(t.id==='kRol')rolUygula();
  else if(t.closest('#frm')&&$('#sum'))ozet()});

/* ---------- oturum ve eşitleme ---------- */
function ayarUygula(a){ayar=a||{};firma={ad:ayar.firma||'',esik:ayar.esik||30}}
function verileriSifirla(){COLS.forEach(c=>S[c]=[]);sonSync=0}
let sayacId=0;
async function sync(){
  const eskiYetki=JSON.stringify([me?.para,me?.ekranlar]);
  const j=await api('/sync?since='+sonSync);
  const yeniYetki=JSON.stringify([j.me.para,j.me.ekranlar]);
  if(me&&eskiYetki!==yeniYetki){me=j.me;verileriSifirla();return sync()}
  const ilk=!me;me=j.me;ayarUygula(j.ayar);
  j.deg.forEach(d=>yerlestir(d.col,d.id,d.silindi?null:d.data));sonSync=j.now;
  $('#giris').hidden=true;$('#app').hidden=false;
  if(route()==='kullanicilar'&&!KUL)kulYukle();
  schedule();
  if(ilk){if(me.degistir)sifreForm(true);clearInterval(sayacId);sayacId=setInterval(()=>{if(!document.hidden)sync().catch(()=>{})},3e4)}
}
function girisGoster(ilk){clearInterval(sayacId);me=null;verileriSifirla();$('#app').hidden=true;const g=$('#giris');g.hidden=false;
 g.innerHTML=ilk?`<form id="kurF" class="kart" novalidate><div class="brand">Sefer Defteri</div><h1>İlk kurulum</h1><p class="mute">Yönetici hesabınızı oluşturun. Bu ekran yalnızca bir kez görünür.</p><div class="fld"><label for="gAd">Ad soyad</label><input id="gAd" autocomplete="name"></div><div class="fld"><label for="gKadi">Kullanıcı adı</label><input id="gKadi" autocomplete="username"></div><div class="fld"><label for="gSifre">Şifre (en az 8 karakter)</label><input id="gSifre" type="password" autocomplete="new-password"></div><button class="btn pri" type="submit">Hesabı oluştur</button><p id="gHata" class="neg" role="alert"></p></form>`:`<form id="girisF" class="kart" novalidate><div class="brand">Sefer Defteri</div><h1>Giriş</h1><div class="fld"><label for="gKadi">Kullanıcı adı</label><input id="gKadi" autocomplete="username" autofocus></div><div class="fld"><label for="gSifre">Şifre</label><input id="gSifre" type="password" autocomplete="current-password"></div><button class="btn pri" type="submit">Giriş yap</button><p id="gHata" class="neg" role="alert"></p></form>`}
async function girisYap(){try{await api('/giris',{m:'POST',b:{kadi:$('#gKadi').value,sifre:$('#gSifre').value}});await sync()}catch(e){$('#gHata').textContent=e.mesaj||'Bağlantı kurulamadı.'}}
async function kurulumYap(){try{await api('/kurulum',{m:'POST',b:{ad:$('#gAd').value.trim(),kadi:$('#gKadi').value.trim(),sifre:$('#gSifre').value}});await sync()}catch(e){$('#gHata').textContent=e.mesaj||'Bağlantı kurulamadı.'}}
(async function(){
  try{const d=await fetch('/api/durum').then(r=>r.json());if(d.ilk){girisGoster(true);return}
   const r=await fetch('/api/sync?since=0');if(r.status===401){girisGoster(false);return}await sync()}
  catch(_){$('#giris').hidden=false;$('#giris').textContent='Sunucuya ulaşılamıyor. Sayfayı yenileyin.'}
})();
