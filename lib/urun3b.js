/**
 * Sarıtepe — ürün yüzeyi, üç boyutlu.
 *
 * NEDEN: Panel fotoğrafı büyütmek yetmiyor. Müşterinin görmek istediği şey
 * yüzeyin KABARTMASI — mozaik tanesi ne kadar yükseliyor, ışık üstünde nasıl
 * kırılıyor. Düz fotoğrafta bu görünmez; ışık sabit kaldığı için yüzey ölü
 * durur. Burada panel bir yüzey olarak kuruluyor ve ışık üstünde geziniyor.
 *
 * NASIL: Panelin kendi fotoğrafı hem renk hem kabartma olarak kullanılıyor.
 * Fotoğrafın açık yerleri yüksek, koyu yerleri alçak sayılıyor. Bu bir tarama
 * değil, yaklaşıklık — ama mozaik, faset ve çizgi dokularda gerçeğe çok yakın
 * duruyor, çünkü o dokularda açıklık zaten yükseklikle birlikte gidiyor.
 *
 * Sosyal medya için: sahne hangi kutuya konursa onun oranını alır. Dikey bir
 * kutuya konunca story oranında çalışır, ayrı bir sürüm gerekmiyor.
 */
(function () {
  "use strict";

  var T = null;              // THREE
  var renderer, scene, camera, panel, isik, kap, dongu = null;
  var hedefMesafe = 2.0, mesafe = 3.4;
  var egimX = 0, egimY = 0, hedefEgimX = -0.18, hedefEgimY = 0.26;
  var t0 = 0, acilis = 0;
  var surukle = null;
  var azHareket = false;

  function hazirMi() { return !!(window.THREE && document.createElement("canvas").getContext("webgl")); }

  /** Panelin gerçek oranı: duvar 1220x2440, zemin 1220x1520. */
  function olcuOrani(b) {
    var e = (b && b.e) || 1220, y = (b && b.b) || 2440;
    return { g: 1, y: y / e };
  }

  function kur(kutu) {
    T = window.THREE;
    kap = kutu;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(kutu.clientWidth, kutu.clientHeight, false);
    if (renderer.outputColorSpace !== undefined && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    kutu.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(34, kutu.clientWidth / Math.max(1, kutu.clientHeight), 0.1, 100);

    scene.add(new T.AmbientLight(0xffffff, 0.34));

    // Yüzeyi "konuşturan" ışık: panelin önünde gezinen tek sıcak kaynak.
    isik = new T.DirectionalLight(0xfff3d8, 2.1);
    isik.position.set(2.4, 2.0, 2.6);
    scene.add(isik);

    // Karşı taraftan soğuk ve zayıf dolgu: kabartmanın gölge tarafı
    // kömür gibi kapanmasın diye.
    var dolgu = new T.DirectionalLight(0xbcd6ff, 0.5);
    dolgu.position.set(-2.6, -1.0, 1.8);
    scene.add(dolgu);

    window.addEventListener("resize", boyut);
    olaylar();
  }

  function boyut() {
    if (!renderer || !kap) return;
    var g = kap.clientWidth, y = kap.clientHeight;
    if (!g || !y) return;
    renderer.setSize(g, y, false);
    camera.aspect = g / y;
    camera.updateProjectionMatrix();
  }

  function olaylar() {
    var el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", function (e) {
      surukle = { x: e.clientX, y: e.clientY, ex: hedefEgimY, ey: hedefEgimX };
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      if (!surukle) return;
      hedefEgimY = surukle.ex + (e.clientX - surukle.x) * 0.005;
      hedefEgimX = surukle.ey + (e.clientY - surukle.y) * 0.004;
      hedefEgimX = Math.max(-0.75, Math.min(0.75, hedefEgimX));
    });
    el.addEventListener("pointerup", function () { surukle = null; });
    el.addEventListener("pointercancel", function () { surukle = null; });
    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      hedefMesafe = Math.max(0.62, Math.min(3.6, hedefMesafe * (1 + Math.sign(e.deltaY) * 0.1)));
    }, { passive: false });

    // Telefonda iki parmakla yakınlaştırma
    var isaret = new Map(), sonAralik = 0;
    el.addEventListener("pointerdown", function (e) { isaret.set(e.pointerId, e); });
    el.addEventListener("pointermove", function (e) {
      if (!isaret.has(e.pointerId)) return;
      isaret.set(e.pointerId, e);
      if (isaret.size !== 2) return;
      surukle = null;
      var p = [...isaret.values()];
      var a = Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY);
      if (sonAralik) hedefMesafe = Math.max(0.62, Math.min(3.6, hedefMesafe * (sonAralik / a)));
      sonAralik = a;
    });
    function birak(e) { isaret.delete(e.pointerId); if (isaret.size < 2) sonAralik = 0; }
    el.addEventListener("pointerup", birak);
    el.addEventListener("pointercancel", birak);
  }

  function dokuYukle(kod, b, bitti) {
    var yukleyici = new T.TextureLoader();
    yukleyici.load("urun/buyuk/" + kod + ".jpg", function (doku) {
      if (doku.colorSpace !== undefined && T.SRGBColorSpace) doku.colorSpace = T.SRGBColorSpace;
      doku.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

      var o = olcuOrani(b);
      var g = new T.PlaneGeometry(o.g, o.y, 1, 1);
      var m = new T.MeshStandardMaterial({
        map: doku,
        bumpMap: doku,          // fotoğrafın açıklığı = yükseklik
        bumpScale: 0.055,
        roughness: 0.42,
        metalness: 0.52
      });
      if (panel) { scene.remove(panel); panel.geometry.dispose(); panel.material.dispose(); }
      panel = new T.Mesh(g, m);
      scene.add(panel);

      // Panelin tamamı sığsın diye kameranın uzaklığı orana göre ayarlanır.
      hedefMesafe = Math.max(1.5, o.y * 1.18);
      mesafe = hedefMesafe * 1.75;
      acilis = 0; t0 = performance.now();
      bitti && bitti();
    }, null, function () { bitti && bitti(new Error("doku yüklenemedi")); });
  }

  function cerceve() {
    dongu = requestAnimationFrame(cerceve);
    var t = (performance.now() - t0) / 1000;

    // Açılış: kamera uzaktan süzülerek iner (ilk 1.6 saniye).
    if (acilis < 1) {
      acilis = azHareket ? 1 : Math.min(1, t / 1.6);
      var k = 1 - Math.pow(1 - acilis, 3);   // yumuşak yavaşlama
      mesafe = hedefMesafe * (1.75 - 0.75 * k);
    } else {
      mesafe += (hedefMesafe - mesafe) * 0.09;
    }

    egimX += (hedefEgimX - egimX) * 0.08;
    egimY += (hedefEgimY - egimY) * 0.08;
    if (panel) { panel.rotation.x = egimX; panel.rotation.y = egimY; }

    // Işık yüzeyin üstünde geziniyor: kabartma ancak ışık hareket edince
    // görünür hale geliyor.
    if (!azHareket && isik) {
      var a = t * 0.42;
      isik.position.set(Math.sin(a) * 2.6, 1.3 + Math.cos(a * 0.7) * 1.1, 2.4);
    }

    camera.position.set(0, 0, mesafe);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  var API = {
    destekli: hazirMi,

    /** kutu: canvas'ın konacağı eleman. kod: SS-xxx. b: {e,b,k} ölçü bilgisi. */
    ac: function (kutu, kod, b, bitti) {
      if (!hazirMi()) { bitti && bitti(new Error("3B desteklenmiyor")); return false; }
      try { azHareket = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { azHareket = false; }
      if (!renderer) kur(kutu);
      else if (renderer.domElement.parentNode !== kutu) kutu.appendChild(renderer.domElement);
      boyut();
      hedefEgimX = -0.18; hedefEgimY = 0.26; egimX = 0; egimY = 0;
      dokuYukle(kod, b, function (hata) {
        if (hata) { bitti && bitti(hata); return; }
        boyut();
        if (!dongu) cerceve();
        bitti && bitti(null);
      });
      return true;
    },

    kapat: function () {
      if (dongu) { cancelAnimationFrame(dongu); dongu = null; }
    },

    /** Sadece dokuyu değiştirir; sahne kurulu kalır. */
    degistir: function (kod, b, bitti) { dokuYukle(kod, b, bitti); if (!dongu) cerceve(); }
  };

  window.Urun3B = API;
})();
