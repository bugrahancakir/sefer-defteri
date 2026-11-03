# Sefer Defteri

Nakliye firması için web uygulaması: seferler, sabit fiyat listesi, otomatik yakıt gideri, boş araç önerisi, filo ve belge takibi, cari, raporlar, Mobiliz konumları ve role göre ekranlar.

Sunucu `src/worker.js`, arayüz `public/` klasöründedir. Cloudflare Workers + D1 üzerinde çalışır.

## Cloudflare'e kurulum

1. Bu dosyaları kendi GitHub deponuza yükleyin.
2. `https://deploy.workers.cloudflare.com/?url=https://github.com/KULLANICI/DEPO` adresini açın. `KULLANICI/DEPO` kısmını kendi deponuzla değiştirin.
3. Cloudflare'in sorduğu adımları onaylayın. Veritabanı otomatik oluşturulur.
4. Workers Paid planını açın. Giriş şifreleri ücretsiz plandaki işlem süresi sınırını aşabilir.
5. Size verilen adresi hemen açıp yönetici hesabını oluşturun. İlk açan kişi yönetici olur.

## Kendi sunucunuzda çalıştırma

Node 22 veya üstü gerekir, ek paket gerekmez:

    PORT=8787 VERI_DOSYASI=/veri/sefer.db node dev/server.mjs

Önüne HTTPS sağlayan bir ters vekil koyun.

## Test

    node dev/test.mjs
