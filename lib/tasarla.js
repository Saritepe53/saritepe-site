/**
 * Sarıtepe — Tasarla. Asansör kabini ve salon, gerçek panellerle.
 *
 * Nova'daki Sanal Oda'nın site sürümü. Sahne ölçüleri ve değişmez kural
 * oradan birebir alındı:
 *
 *   YER PANELİ SADECE ZEMİNE, DUVAR PANELİ SADECE DUVARA.
 *
 * Panel yüzeye gerçek ölçüsüyle döşeniyor: 122 x 244 cm'lik bir plaka
 * 1,1 metrelik asansör duvarında kaç kere tekrar ediyorsa o kadar. Dokuyu
 * yüzeye esnetmek kolay olurdu ama yanlış olurdu — müşteri desenin gerçekte
 * ne büyüklükte duracağını göremezdi.
 *
 * Plaka sayısı da buradan çıkıyor: yüzeyin alanı bölü plaka alanı, üstüne
 * %8 fire. Nova ile aynı hesap.
 */
(function () {
  "use strict";

  var FIRE = 1.08;
  var T = null;
  var renderer, scene, camera, kap, oda = null, dongu = null;
  var YUZEY = [], PANELLER = [], DOKULAR = new Map();
  var sahneAdi = "asansor", kodlar = {}, secili = null;
  var hedef = null;
  var yaricap = 4.2, hedefYaricap = 4.2, aci = 0.6, yukseklikAcisi = 0.08;
  var surukle = null, isaretler = new Map(), sonAralik = 0;
  var yurume = { on: false, x: 0, z: 2.2, yaw: 0, pitch: 0, goz: 1.6, tuslar: {} };
  // Iceriden bakista geri gidecek yer yok; yakinlastirma gorus acisiyla olur.
  var gorusAcisi = 72, hedefGorus = 72;
  var geriCagri = {};
  var tur = null;   // video icin otomatik donus: {bas, sure, baslangicAci}

  /* ---------- Yardımcılar ---------- */

  var boya = function (renk) {
    return new T.MeshStandardMaterial({ color: renk, roughness: 0.85, metalness: 0, envMapIntensity: 0.6, side: T.DoubleSide });
  };

  function panelBul(kod) { return PANELLER.find(function (p) { return p.code === kod; }); }

  /** Panelin gerçek plaka ölçüsü, metre. */
  function plakaOlcusu(p) {
    return { en: (p.size_mm[0] || 1220) / 1000, boy: (p.size_mm[1] || 2440) / 1000 };
  }

  /** Sahnede DUZLENMIS doku kullanilir (urun/doku). Urun sayfasindaki
   *  fotograf gercek haliyle duruyor; ama o fotograflarda cekim isigi var
   *  ve duvara dosenince o parlak leke her plakada tekrar edip duvari
   *  kirli gosteriyordu. Sahnedeki isik zaten odanin kendi isigi.
   *  Dokuyu yukler ve hazir olunca geri cagirir. Yuklenmeden kopyalanirsa
   *  kopyada resim bos kalir ve yuzey duz renk gorunur. */
  function dokuAl(kod, hazir) {
    var v = DOKULAR.get(kod);
    if (v && v.yuklendi) { hazir(v.doku); return; }
    if (v) { v.bekleyen.push(hazir); return; }
    v = { doku: null, yuklendi: false, bekleyen: [hazir] };
    DOKULAR.set(kod, v);
    new T.TextureLoader().load("urun/doku/" + kod + ".jpg", function (t) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      // r152+ colorSpace, r128 encoding — hangisi varsa o.
      if (T.SRGBColorSpace && t.colorSpace !== undefined) t.colorSpace = T.SRGBColorSpace;
      else if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
      if (renderer.capabilities.getMaxAnisotropy) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      v.doku = t; v.yuklendi = true;
      var l = v.bekleyen; v.bekleyen = [];
      l.forEach(function (f) { f(t); });
    });
  }

  /** Dokuyu yüzeye GERÇEK ölçüsüyle döşer: 122x244 cm'lik plaka, yüzeyin
   *  kaç katı ise o kadar tekrar eder. Esnetmek kolay olurdu ama müşteri
   *  desenin gerçekte ne büyüklükte duracağını göremezdi. */
  function panelMalzemesi(kaynakDoku, tip, genislik, yukseklik, plaka) {
    var d = kaynakDoku.clone();
    d.needsUpdate = true;
    d.wrapS = d.wrapT = T.RepeatWrapping;
    d.repeat.set(Math.max(0.25, genislik / plaka.en), Math.max(0.25, yukseklik / plaka.boy));
    return new T.MeshStandardMaterial({
      map: d,
      roughness: tip === "floor" ? 0.38 : 0.44,
      metalness: 0.3,
      envMapIntensity: 1.1,
      side: T.DoubleSide
    });
  }

  /* ---------- Sahne kurulumu ---------- */

  function duzlem(anahtar, ad, g, y, konum, donus, se) {
    var m = new T.Mesh(new T.PlaneGeometry(g, y), boya(se.boya || "#cfc9c0"));
    m.position.copy(konum); m.rotation.set(donus.x, donus.y, donus.z);
    m.userData.yuzey = anahtar;
    oda.add(m);
    var s = YUZEY.find(function (x) { return x.anahtar === anahtar; });
    if (!s) {
      s = { anahtar: anahtar, ad: ad, parcalar: [], zemin: !!se.zemin, tavan: !!se.tavan,
            varsayilan: se.varsayilan || null, boya: se.boya || "#cfc9c0", kod: null };
      YUZEY.push(s);
    }
    s.parcalar.push({ mesh: m, g: g, y: y });
    return m;
  }

  function kutu(g, y, d, renk, x, yy, z, metal) {
    var m = new T.Mesh(new T.BoxGeometry(g, y, d),
      new T.MeshStandardMaterial({ color: renk, roughness: metal ? 0.3 : 0.85, metalness: metal ? 0.7 : 0 }));
    m.position.set(x, yy, z); oda.add(m); return m;
  }

  function kurAsansor() {
    var V = T.Vector3, E = T.Euler;
    var g = 1.6, d = 1.4, h = 2.3;          // Nova ile aynı kabin ölçüsü
    duzlem("arka", "Arka duvar", g, h, new V(0, h / 2, -d / 2), new E(0, 0, 0), {});
    duzlem("sol", "Sol duvar", d, h, new V(-g / 2, h / 2, 0), new E(0, Math.PI / 2, 0), {});
    duzlem("sag", "Sağ duvar", d, h, new V(g / 2, h / 2, 0), new E(0, -Math.PI / 2, 0), {});
    duzlem("zemin", "Zemin", g, d, new V(0, 0.001, 0), new E(-Math.PI / 2, 0, 0), { zemin: true, boya: "#3a3a3e" });
    duzlem("tavan", "Tavan", g, d, new V(0, h, 0), new E(Math.PI / 2, 0, 0), { tavan: true, boya: "#e8e6e1" });

    var lamba = new T.Mesh(new T.PlaneGeometry(g * 0.6, d * 0.6), new T.MeshBasicMaterial({ color: 0xfff6e5 }));
    lamba.rotation.x = Math.PI / 2; lamba.position.set(0, h - 0.005, 0); oda.add(lamba);
    var isik = new T.PointLight(0xfff1dc, 0.9, 6); isik.position.set(0, h - 0.2, 0); oda.add(isik);

    var kupeste = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, g * 0.8, 16),
      new T.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.2 }));
    kupeste.rotation.z = Math.PI / 2; kupeste.position.set(0, 0.95, -d / 2 + 0.06); oda.add(kupeste);

    hedef = new T.Vector3(0, h * 0.46, 0);
    // Kabinin on yuzu acik; kamera tam karsisina konunca disaridan
    // bakarken kabinin ICI gorunuyor.
    yaricap = hedefYaricap = 2.3;
    aci = 0; yukseklikAcisi = 0.06;
    yurume.x = 0; yurume.z = 0.42; yurume.yaw = 0; yurume.pitch = -0.05; yurume.goz = 1.55;
    yurume.on = false;  // disaridan bakisla baslar
    gorusAcisi = hedefGorus = 72;
  }

  function kurSalon() {
    // Nova'dakinden GENİŞ: kullanıcı "salon daha büyük olsun ki görebilsin"
    // dedi. 5x4 yerine 6.4x5.2, tavan 3.0.
    var V = T.Vector3, E = T.Euler, G = 6.4, D2 = 5.2, H = 3.0;
    duzlem("zemin", "Zemin", G, D2, new V(0, 0.001, 0), new E(-Math.PI / 2, 0, 0), { zemin: true, boya: "#6f665d" });
    duzlem("tv", "TV duvarı", G, H, new V(0, H / 2, -D2 / 2), new E(0, 0, 0), { boya: "#d9d4cc" });
    duzlem("ana", "Yan duvar", D2, H, new V(-G / 2, H / 2, 0), new E(0, Math.PI / 2, 0), { boya: "#cfc9c0" });

    kutu(2.6, 0.45, 1.05, 0x2a2d38, 0.2, 0.22, 1.35); kutu(2.6, 0.55, 0.22, 0x2a2d38, 0.2, 0.68, 1.82);
    kutu(0.22, 0.38, 1.05, 0x2a2d38, -1.15, 0.6, 1.35); kutu(0.22, 0.38, 1.05, 0x2a2d38, 1.55, 0.6, 1.35);
    kutu(1.25, 0.4, 0.68, 0x14151a, 0.2, 0.2, 0.15, true);
    kutu(2.1, 0.45, 0.45, 0x14151a, 0, 0.22, -D2 / 2 + 0.28);

    var tv = new T.Mesh(new T.PlaneGeometry(2.0, 1.13),
      new T.MeshStandardMaterial({ color: 0x050507, roughness: 0.15, metalness: 0.2 }));
    tv.position.set(0, 1.55, -D2 / 2 + 0.03); oda.add(tv);

    kutu(0.04, 1.8, 0.04, 0x1b1c20, -2.5, 0.9, 1.9, true);
    var abajur = new T.Mesh(new T.CylinderGeometry(0.2, 0.3, 0.34, 24, 1, true),
      new T.MeshStandardMaterial({ color: 0xf3e6cf, side: T.DoubleSide, roughness: 0.9 }));
    abajur.position.set(-2.5, 1.9, 1.9); oda.add(abajur);
    var l1 = new T.PointLight(0xffe6c2, 0.9, 8); l1.position.set(-2.5, 1.8, 1.9); oda.add(l1);

    kutu(0.34, 0.4, 0.34, 0x1b1c20, 2.6, 0.2, -1.9);
    var bitki = new T.Mesh(new T.ConeGeometry(0.4, 1.25, 10), new T.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.9 }));
    bitki.position.set(2.6, 1.0, -1.9); oda.add(bitki);

    var l2 = new T.PointLight(0xfff1dc, 0.75, 12); l2.position.set(0, 2.8, 0.3); oda.add(l2);

    hedef = new T.Vector3(0, 1.25, -0.2);
    yaricap = hedefYaricap = 7.4;
    aci = 0.52; yukseklikAcisi = 0.14;
    yurume.x = 0; yurume.z = 1.9; yurume.yaw = 0; yurume.pitch = 0; yurume.goz = 1.6;
    yurume.on = false;  // salon acik, disaridan bakilir
    gorusAcisi = hedefGorus = 72;
  }

  function sahneKur() {
    if (oda) {
      oda.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      scene.remove(oda);
    }
    oda = new T.Group(); scene.add(oda); YUZEY = [];
    if (sahneAdi === "salon") kurSalon(); else kurAsansor();
    hepsiniUygula();
    secili = YUZEY.length ? YUZEY[0].anahtar : null;
    bildir();
  }

  function hepsiniUygula() {
    YUZEY.forEach(function (s) {
      var kod = kodlar[s.anahtar] !== undefined ? kodlar[s.anahtar] : s.varsayilan;
      s.kod = kod && panelBul(kod) ? kod : null;
      if (!s.kod) {
        s.parcalar.forEach(function (pt) {
          var eski = pt.mesh.material;
          pt.mesh.material = boya(s.boya);
          if (eski) { if (eski.map) eski.map.dispose(); eski.dispose(); }
        });
        return;
      }
      var p = panelBul(s.kod), plaka = plakaOlcusu(p), tip = p.type, bekleyenKod = s.kod;
      dokuAl(s.kod, function (doku) {
        // Doku gelene kadar kullanıcı başka panel seçmiş olabilir.
        if (s.kod !== bekleyenKod) return;
        s.parcalar.forEach(function (pt) {
          var eski = pt.mesh.material;
          pt.mesh.material = panelMalzemesi(doku, tip, pt.g, pt.y, plaka);
          if (eski) { if (eski.map) eski.map.dispose(); eski.dispose(); }
        });
      });
    });
  }

  /** DEĞİŞMEZ KURAL: yer paneli zemine, duvar paneli duvara. */
  function uygula(anahtar, kod) {
    var s = YUZEY.find(function (x) { return x.anahtar === anahtar; });
    var p = panelBul(kod);
    if (!s || !p) return { ok: false, mesaj: kod + " katalogda yok." };
    if (p.type === "floor" && !s.zemin) return { ok: false, mesaj: kod + " bir zemin panelidir; sadece zemine uygulanır." };
    if (p.type !== "floor" && s.zemin) return { ok: false, mesaj: kod + " bir duvar panelidir; zemine uygulanmaz." };
    kodlar[anahtar] = kod;
    hepsiniUygula();
    bildir();
    return { ok: true, mesaj: s.ad + ": " + kod + " uygulandı." };
  }

  function plakaSayisi(s) {
    if (!s.kod) return 0;
    var p = panelBul(s.kod); if (!p) return 0;
    var alan = s.parcalar.reduce(function (n, pt) { return n + pt.g * pt.y; }, 0);
    var plaka = plakaOlcusu(p);
    return Math.ceil(alan / (plaka.en * plaka.boy) * FIRE);
  }

  function durum() {
    return {
      sahne: sahneAdi,
      secili: secili,
      yurume: yurume.on,
      yuzeyler: YUZEY.filter(function (s) { return !s.tavan; }).map(function (s) {
        return { anahtar: s.anahtar, ad: s.ad, zemin: s.zemin, kod: s.kod, plaka: plakaSayisi(s) };
      })
    };
  }
  function bildir() { if (geriCagri.degisti) geriCagri.degisti(durum()); }

  /* ---------- Etkileşim ---------- */

  function olaylar() {
    var el = renderer.domElement;
    el.style.touchAction = "none";

    el.addEventListener("pointerdown", function (e) {
      isaretler.set(e.pointerId, e);
      surukle = { x: e.clientX, y: e.clientY, aci: aci, yuk: yukseklikAcisi, yaw: yurume.yaw, pitch: yurume.pitch, tasindi: false };
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", function (e) {
      if (isaretler.has(e.pointerId)) isaretler.set(e.pointerId, e);
      if (isaretler.size === 2) {
        surukle = null;
        var p = Array.from(isaretler.values());
        var a = Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY);
        if (sonAralik) {
          if (yurume.on) hedefGorus = Math.max(32, Math.min(88, hedefGorus * (sonAralik / a)));
          else hedefYaricap = Math.max(0.9, Math.min(sahneAdi === "salon" ? 14 : 3.4, hedefYaricap * (sonAralik / a)));
        }
        sonAralik = a;
        return;
      }
      if (!surukle) return;
      var dx = e.clientX - surukle.x, dy = e.clientY - surukle.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) surukle.tasindi = true;
      if (yurume.on) {
        yurume.yaw = surukle.yaw - dx * 0.004;
        yurume.pitch = Math.max(-0.9, Math.min(0.9, surukle.pitch - dy * 0.003));
      } else {
        aci = surukle.aci - dx * 0.006;
        // Asansorde kabinin arkasina dolanmak anlamsiz: orada duvarlarin
        // sirti var ve ekran kararir. Aci on yuzle sinirli.
        if (sahneAdi !== "salon") aci = Math.max(-0.85, Math.min(0.85, aci));
        yukseklikAcisi = Math.max(sahneAdi === "salon" ? -0.5 : -0.25, Math.min(1.1, surukle.yuk + dy * 0.004));
      }
    });

    function birak(e) {
      isaretler.delete(e.pointerId);
      if (isaretler.size < 2) sonAralik = 0;
      if (surukle && !surukle.tasindi) yuzeySec(e);
      surukle = null;
    }
    el.addEventListener("pointerup", birak);
    el.addEventListener("pointercancel", function (e) { isaretler.delete(e.pointerId); surukle = null; sonAralik = 0; });

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (yurume.on) { hedefGorus = Math.max(32, Math.min(88, hedefGorus + Math.sign(e.deltaY) * 4)); return; }
      var ustSinir = sahneAdi === "salon" ? 14 : 3.4;
      hedefYaricap = Math.max(0.9, Math.min(ustSinir, hedefYaricap * (1 + Math.sign(e.deltaY) * 0.09)));
    }, { passive: false });

    window.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      yurume.tuslar[e.key.toLowerCase()] = true;
    });
    window.addEventListener("keyup", function (e) { yurume.tuslar[e.key.toLowerCase()] = false; });
    window.addEventListener("resize", boyut);
  }

  var isinlayici = null, fare = null;
  function yuzeySec(e) {
    if (!isinlayici) { isinlayici = new T.Raycaster(); fare = new T.Vector2(); }
    var k = renderer.domElement.getBoundingClientRect();
    fare.x = ((e.clientX - k.left) / k.width) * 2 - 1;
    fare.y = -((e.clientY - k.top) / k.height) * 2 + 1;
    isinlayici.setFromCamera(fare, camera);
    var hedefler = [];
    YUZEY.forEach(function (s) { s.parcalar.forEach(function (p) { hedefler.push(p.mesh); }); });
    var v = isinlayici.intersectObjects(hedefler, false)[0];
    if (!v) return;
    var a = v.object.userData.yuzey;
    var s = YUZEY.find(function (x) { return x.anahtar === a; });
    if (!s || s.tavan) return;
    secili = a;
    bildir();
  }

  /** Paslanmaz yuzeyin yansitacagi basit bir ortam: metal karanlikta olu
   *  gorunur. Nova'daki kurulumun aynisi. */
  function ortamKur() {
    try {
      var ortam = new T.Scene();
      ortam.background = new T.Color(0x2a2c33);
      var kt = function (x, y, z, g2, y2, d2, c) {
        var m = new T.Mesh(new T.BoxGeometry(g2, y2, d2), new T.MeshBasicMaterial({ color: c }));
        m.position.set(x, y, z); ortam.add(m);
      };
      kt(0, 6, 0, 6, 0.2, 6, 0xffffff);      // tavan aydinligi
      kt(-6, 2, 0, 0.2, 3, 5, 0xf2e2c0);     // sicak yan duvar
      kt(6, 2, 1, 0.2, 2, 3, 0xd8e0ff);      // soguk yan duvar
      kt(0, 1, -6, 5, 2, 0.2, 0x8a8f99);
      kt(0, -3, 0, 20, 0.2, 20, 0x1c1d22);   // zemin
      var pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(ortam, 0.04).texture;
    } catch (e) {}
  }

  function boyut() {
    if (!renderer || !kap) return;
    var g = kap.clientWidth, y = kap.clientHeight;
    if (!g || !y) return;
    renderer.setSize(g, y, false);
    camera.aspect = g / y; camera.updateProjectionMatrix();
  }

  function cerceve() {
    dongu = requestAnimationFrame(cerceve);

    if (yurume.on) {
      var hiz = 0.045, ileri = 0, yan = 0;
      if (yurume.tuslar.w || yurume.tuslar.arrowup) ileri += 1;
      if (yurume.tuslar.s || yurume.tuslar.arrowdown) ileri -= 1;
      if (yurume.tuslar.a || yurume.tuslar.arrowleft) yan -= 1;
      if (yurume.tuslar.d || yurume.tuslar.arrowright) yan += 1;
      if (ileri || yan) {
        yurume.x += (Math.sin(yurume.yaw) * -ileri + Math.cos(yurume.yaw) * yan) * hiz;
        yurume.z += (Math.cos(yurume.yaw) * -ileri - Math.sin(yurume.yaw) * yan) * hiz;
        var sinir = sahneAdi === "salon" ? { x: 2.9, z: 2.3 } : { x: 0.62, z: 0.55 };
        yurume.x = Math.max(-sinir.x, Math.min(sinir.x, yurume.x));
        yurume.z = Math.max(-sinir.z, Math.min(sinir.z, yurume.z));
      }
      gorusAcisi += (hedefGorus - gorusAcisi) * 0.14;
      camera.fov = gorusAcisi;
      camera.position.set(yurume.x, yurume.goz, yurume.z);
      var cp = Math.cos(yurume.pitch);
      camera.lookAt(yurume.x - Math.sin(yurume.yaw) * cp, yurume.goz + Math.sin(yurume.pitch), yurume.z - Math.cos(yurume.yaw) * cp);
    } else {
      if (tur) {
        var tk = (performance.now() - tur.bas) / tur.sure;
        if (tk >= 1) { tur = null; }
        else { aci = tur.baslangicAci + tk * Math.PI * 2; }
      }
      yaricap += (hedefYaricap - yaricap) * 0.1;
      camera.fov = 48;
      camera.position.set(
        hedef.x + Math.sin(aci) * Math.cos(yukseklikAcisi) * yaricap,
        hedef.y + Math.sin(yukseklikAcisi) * yaricap,
        hedef.z + Math.cos(aci) * Math.cos(yukseklikAcisi) * yaricap
      );
      camera.lookAt(hedef);
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  /* ---------- Dışarıya açılan ---------- */

  window.Tasarla = {
    destekli: function () {
      try { return !!(window.THREE && document.createElement("canvas").getContext("webgl")); } catch (e) { return false; }
    },

    baslat: function (kutu, paneller, se) {
      if (!this.destekli()) return false;
      T = window.THREE;
      kap = kutu;
      PANELLER = paneller;
      geriCagri = se || {};

      // preserveDrawingBuffer: "Görseli İndir" ve "Video Oluştur" bunsuz
      // bos kare veriyor. Nova'da da acik.
      renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(kutu.clientWidth, kutu.clientHeight, false);
      // Bu satir olmadan sahne DOGRUSAL cikiyor ve kapkara gorunuyor.
      if (T.SRGBColorSpace && renderer.outputColorSpace !== undefined) renderer.outputColorSpace = T.SRGBColorSpace;
      else if (T.sRGBEncoding) renderer.outputEncoding = T.sRGBEncoding;
      if (renderer.physicallyCorrectLights !== undefined) renderer.physicallyCorrectLights = false;
      // Film tonlamasi: parlak yuzeyler patlamiyor, golgeler kapanmiyor.
      if (T.ACESFilmicToneMapping) { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; }
      kutu.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%";

      scene = new T.Scene();
      scene.background = new T.Color(0x0a0b12);
      camera = new T.PerspectiveCamera(50, kutu.clientWidth / Math.max(1, kutu.clientHeight), 0.05, 100);
      // Gokyuzu sicak, yer soguk: Nova ile ayni.
      scene.add(new T.HemisphereLight(0xfff4e0, 0x1a1c24, 0.55));
      var gunes = new T.DirectionalLight(0xffffff, 0.7);
      gunes.position.set(3, 6, 5); scene.add(gunes);
      ortamKur();

      olaylar();
      sahneKur();
      boyut();
      if (!dongu) cerceve();
      return true;
    },

    sahne: function (ad) { sahneAdi = (ad === "salon" ? "salon" : "asansor"); kodlar = {}; sahneKur(); },
    sec: function (anahtar) { secili = anahtar; bildir(); },
    uygula: function (kod) { return secili ? uygula(secili, kod) : { ok: false, mesaj: "Önce bir yüzey seç." }; },
    temizle: function () { kodlar = {}; hepsiniUygula(); bildir(); },
    yurumeAc: function (ac) { yurume.on = !!ac; if (yurume.on) { gorusAcisi = hedefGorus = 72; } bildir(); },
    durum: durum,
    boyutlandir: boyut,
    /** Dugmeyle yakinlastirma: + icin -1, - icin +1. */
    yakinlastir: function (yon) {
      if (yurume.on) hedefGorus = Math.max(32, Math.min(88, hedefGorus + yon * 7));
      else hedefYaricap = Math.max(0.9, Math.min(sahneAdi === "salon" ? 14 : 3.4, hedefYaricap * (1 + yon * 0.16)));
    },
    /** Video icin: sahne verilen surede kendi etrafinda bir tam tur doner. */
    tur: function (sure) { yurume.on = false; tur = { bas: performance.now(), sure: sure || 8000, baslangicAci: aci }; }
  };
})();
