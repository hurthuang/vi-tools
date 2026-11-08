// 中繼檔內嵌的原卷（規格 3.9）：畫頁面、在上面畫框。版面整理用（nc 整份算式校對之後可以改用這個）。
//   const sv = vitoolsVtdocView.create({ scroll, host, overlay, fit, label, onPage })
//     scroll  捲動的外框；host 放頁面的框（裡面放 overlay）；fit 顯示方式的 <select>（page 整頁／width 合寬／zoom 放大）
//   await sv.open(v)          → 有原卷 true，沒有 false
//   sv.show(p)、sv.page、sv.pages、sv.zoom(+1/-1)、sv.focus(box)、sv.redraw()
//   sv.draw = function (ov, page) { … }   換頁、重畫時呼叫，自己往 ov 加框（用 sv.boxDiv）
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  // shared.js 的 loadScript；沒載 shared.js 的頁面用這個
  const load = window.loadScript || (src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('無法載入：' + src));
    document.head.appendChild(s);
  }));

  function boxDiv(b, cls, title) {
    const d = document.createElement('div');
    d.className = 'vtv-bx ' + (cls || '');
    if (Array.isArray(b)) b = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    d.style.left = (b.x0 * 100) + '%';
    d.style.top = (b.y0 * 100) + '%';
    d.style.width = ((b.x1 - b.x0) * 100) + '%';
    d.style.height = ((b.y1 - b.y0) * 100) + '%';
    if (title) d.title = title;
    return d;
  }

  function create(o) {
    let SRC = null, pdf = null, tok = 0, zoom = 2;
    const aspect = {};
    const sv = { page: 0, pages: 0, draw: null, boxDiv };

    sv.open = function (v) {
      SRC = vitoolsVtdoc.source(v);
      pdf = null; sv.page = 0; sv.pages = 0;
      for (const k in aspect) delete aspect[k];
      o.host.querySelectorAll('.vtv-sheet').forEach(e => e.remove());
      o.host.dataset.key = '';
      if (!SRC) return Promise.resolve(false);
      if (SRC.kind === 'pages') {
        sv.pages = Math.max.apply(null, Object.keys(SRC.pages).map(Number));
        return Promise.resolve(true);
      }
      const ready = window.pdfjsLib ? Promise.resolve() : load(PDFJS + 'pdf.min.js').then(() => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      });
      return ready.then(() => pdfjsLib.getDocument({ data: SRC.data.slice() }).promise).then(d => {
        pdf = d;
        sv.pages = SRC.pageMap ? SRC.pageMap.length : d.numPages;
        return true;
      }).catch(e => { SRC = null; console.warn('原卷打不開', e); return false; });
    };
    sv.has = () => !!SRC;

    function width(asp) {
      const sc = o.scroll, mode = o.fit ? o.fit.value : 'page';
      const W = sc.clientWidth - 2, H = sc.clientHeight - 2;
      if (mode === 'page') return Math.min(W, H / (asp || 1.414));
      if (mode === 'zoom') return W * zoom;
      return W;
    }

    function pageAspect(p) {
      if (aspect[p]) return Promise.resolve(aspect[p]);
      if (SRC.kind === 'pages') {
        const im = new Image();
        im.src = SRC.pages[p] || '';
        return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() =>
          (aspect[p] = im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1.414));
      }
      return pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(pg => {
        const vp = pg.getViewport({ scale: 1 });
        return (aspect[p] = vp.height / vp.width);
      });
    }

    sv.show = function (p, force) {
      if (!SRC || p < 1 || p > sv.pages) return Promise.resolve();
      const host = o.host;
      return pageAspect(p).then(asp => {
        const w = Math.round(width(asp));
        const key = p + '/' + w;
        sv.page = p;
        if (o.label) o.label.textContent = '第 ' + p + ' 頁／共 ' + sv.pages + ' 頁';
        if (o.onPage) o.onPage(p);
        if (!force && host.dataset.key === key) { sv.redraw(); return; }
        host.dataset.key = key;
        host.style.width = w + 'px';
        const t = ++tok;
        let made;
        if (SRC.kind === 'pages') {
          const img = document.createElement('img');
          img.alt = '原卷第 ' + p + ' 頁';
          img.src = SRC.pages[p] || '';
          made = Promise.resolve(img);
        } else {
          made = pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(pg => {
            const vp1 = pg.getViewport({ scale: 1 });
            const vp = pg.getViewport({ scale: Math.max(0.5, w * (window.devicePixelRatio || 1) / vp1.width) });
            const cv = document.createElement('canvas');
            cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
            cv.setAttribute('role', 'img');
            cv.setAttribute('aria-label', '原卷第 ' + p + ' 頁');
            return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(() => cv);
          });
        }
        return made.then(el => {
          if (t !== tok) return;
          el.className = 'vtv-sheet';
          const old = host.querySelector('.vtv-sheet');
          if (old) host.replaceChild(el, old); else host.insertBefore(el, host.firstChild);
          sv.redraw();
        });
      });
    };

    // PDF 文字層在框裡的字 → [{ text, box:[x0,y0,x1,y1] }]（一行一筆，座標是頁面比例）；不是 PDF 或沒有文字層 → []
    sv.textIn = function (p, box) {
      if (!SRC || SRC.kind !== 'pdf') return Promise.resolve([]);
      return pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(pg => {
        const vp = pg.getViewport({ scale: 1 });
        return pg.getTextContent().then(tc => {
          const its = [];
          tc.items.forEach(it => {
            if (!it.str || !it.str.trim()) return;
            const e = it.transform[4], f = it.transform[5];
            const h = it.height || Math.hypot(it.transform[2], it.transform[3]);
            const r = vp.convertToViewportRectangle([e, f, e + (it.width || 0), f + h]);
            const b = [Math.min(r[0], r[2]) / vp.width, Math.min(r[1], r[3]) / vp.height, Math.max(r[0], r[2]) / vp.width, Math.max(r[1], r[3]) / vp.height];
            const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
            if (cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]) its.push({ s: it.str, b });
          });
          if (!its.length) return [];
          // 直書（旋轉過的頁面）：字框高比寬大的多 → 一欄一行，由右到左、由上到下
          const vert = its.filter(x => x.s.length > 1 && (x.b[3] - x.b[1]) > 1.5 * (x.b[2] - x.b[0])).length > its.length / 2;
          const A = vert ? [0, 2, 1] : [1, 3, 0];   // 分行用的軸（起、迄）、行內排序用的軸
          const lines = [];
          its.sort((x, y) => (x.b[A[0]] + x.b[A[1]]) - (y.b[A[0]] + y.b[A[1]])).forEach(x => {
            const ln = lines.find(l => Math.min(l.hi, x.b[A[1]]) - Math.max(l.lo, x.b[A[0]]) > 0.5 * Math.min(l.hi - l.lo, x.b[A[1]] - x.b[A[0]]));
            if (ln) { ln.its.push(x); ln.lo = Math.min(ln.lo, x.b[A[0]]); ln.hi = Math.max(ln.hi, x.b[A[1]]); }
            else lines.push({ its: [x], lo: x.b[A[0]], hi: x.b[A[1]] });
          });
          lines.sort((a, b) => vert ? b.lo - a.lo : a.lo - b.lo);
          return lines.map(l => {
            l.its.sort((x, y) => x.b[A[2]] - y.b[A[2]]);
            let t = '';
            l.its.forEach(x => {
              if (t && /[A-Za-z0-9]$/.test(t) && /^[A-Za-z0-9]/.test(x.s)) t += ' ';
              t += x.s;
            });
            const bx = [Math.min(...l.its.map(x => x.b[0])), Math.min(...l.its.map(x => x.b[1])), Math.max(...l.its.map(x => x.b[2])), Math.max(...l.its.map(x => x.b[3]))];
            return { text: t.replace(/\s+/g, ' ').trim(), box: bx.map(v => Math.max(0, Math.min(1, v))) };
          }).filter(l => l.text);
        });
      }).catch(() => []);
    };

    // 給外部辨識用：原卷是 PDF → { kind:'pdf', data, page（原始檔頁碼） }；頁面圖 → { kind:'image', image（框裡的 PNG dataURL） }
    sv.regionSource = function (p, box) {
      if (!SRC) return Promise.resolve(null);
      if (SRC.kind === 'pdf') return Promise.resolve({ kind: 'pdf', data: SRC.data, page: SRC.pageMap ? SRC.pageMap[p - 1] : p });
      const im = new Image();
      im.src = SRC.pages[p] || '';
      return (im.decode ? im.decode() : Promise.resolve()).then(() => {
        const W = im.naturalWidth, H = im.naturalHeight, pad = 6;
        const x0 = Math.max(0, Math.floor(box[0] * W) - pad), y0 = Math.max(0, Math.floor(box[1] * H) - pad);
        const x1 = Math.min(W, Math.ceil(box[2] * W) + pad), y1 = Math.min(H, Math.ceil(box[3] * H) + pad);
        const cv = document.createElement('canvas');
        cv.width = x1 - x0; cv.height = y1 - y0;
        cv.getContext('2d').drawImage(im, x0, y0, cv.width, cv.height, 0, 0, cv.width, cv.height);
        return { kind: 'image', image: cv.toDataURL('image/png') };
      });
    };

    // 給網頁版算式辨識（mfr-web.js）：框裡的圖，PDF 用 200 DPI 算圖（跟辨識套件一樣），框外加 pad 像素；
    // 有 vitoolsMfr 就順便 clean（灰階、淺色變白）
    sv.cropCanvas = function (p, box, pad) {
      if (!SRC) return Promise.reject(new Error('沒有原卷'));
      pad = pad == null ? 2 : pad;
      const cut = (W, H) => {
        const x0 = Math.max(0, Math.floor(box[0] * W) - pad), y0 = Math.max(0, Math.floor(box[1] * H) - pad);
        const x1 = Math.min(W, Math.floor(box[2] * W) + pad), y1 = Math.min(H, Math.floor(box[3] * H) + pad);
        if (x1 - x0 < 4 || y1 - y0 < 4) throw new Error('框太小');
        const cv = document.createElement('canvas');
        cv.width = x1 - x0; cv.height = y1 - y0;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, cv.width, cv.height);
        return { cv, cx, x0, y0 };
      };
      const done = cv => (window.vitoolsMfr ? vitoolsMfr.clean(cv) : cv);
      if (SRC.kind === 'pdf') {
        return pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(pg => {
          const vp = pg.getViewport({ scale: 200 / 72 });
          const c = cut(Math.round(vp.width), Math.round(vp.height));
          return pg.render({ canvasContext: c.cx, viewport: vp, transform: [1, 0, 0, 1, -c.x0, -c.y0] }).promise.then(() => done(c.cv));
        });
      }
      const im = new Image();
      im.src = SRC.pages[p] || '';
      return (im.decode ? im.decode() : Promise.resolve()).then(() => {
        const c = cut(im.naturalWidth, im.naturalHeight);
        c.cx.drawImage(im, -c.x0, -c.y0);
        return done(c.cv);
      });
    };

    sv.redraw = function () {
      o.overlay.innerHTML = '';
      if (sv.draw && sv.page) sv.draw(o.overlay, sv.page);
    };

    sv.zoom = function (d) {
      if (o.fit) o.fit.value = 'zoom';
      zoom = Math.max(1, Math.min(5, zoom + d * 0.5));
      return sv.show(sv.page || 1);
    };

    sv.scrollTo = function (b) {
      const sc = o.scroll, H = o.host.clientHeight, W = o.host.clientWidth;
      const cy = (b.y0 + b.y1) / 2 * H, cx = (b.x0 + b.x1) / 2 * W;
      sc.scrollTo({ top: Math.max(0, cy - sc.clientHeight / 2), left: Math.max(0, cx - sc.clientWidth / 2), behavior: 'smooth' });
    };

    sv.focus = function (b) {
      if (!SRC || !b) return Promise.resolve();
      return sv.show(b.page).then(() => sv.scrollTo(b));
    };

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (SRC && sv.page) sv.show(sv.page); }, 200);
    });
    if (o.fit) o.fit.addEventListener('change', () => { if (SRC) sv.show(sv.page || 1); });
    return sv;
  }

  window.vitoolsVtdocView = { create, boxDiv };
})();
