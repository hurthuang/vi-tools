// 輸入、輸出兩區對照（文字轉點字、點字轉文字共用；docs/notes/bt-sync.md）
//   游標移動或點一下：另一區捲到對應處，用橘色底標出來
//   Ctrl+J：焦點跳到另一區的對應處並選取（報讀軟體會念出選到的內容）
//
// const sync = vitoolsIoSync({ inId, outId, getMap })
//   getMap() 回傳 [{ o0, o1, s0, s1 }]（輸出第 o0～o1 字 ↔ 輸入第 s0～s1 字），或 null（一字對一字）
//   sync.refresh()：輸出重排後呼叫，照目前游標重新對一次
//   sync.find(fromIn, a, b)、sync.mark(ta, from, to, scroll)、sync.clear(ta)、sync.select(ta, from, to)
(function () {
    'use strict';

    const css = document.createElement('style');
    css.textContent =
        '.io-sync-ov { position: absolute; overflow: hidden; pointer-events: none; color: transparent; white-space: pre-wrap; overflow-wrap: break-word; box-sizing: border-box; margin: 0; border: 0; z-index: 1; }' +
        '.io-sync-ov mark { background: rgba(255, 152, 0, 0.4); color: transparent; border-radius: 2px; }';
    document.head.appendChild(css);

    const COPY = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
                  'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'textIndent'];

    window.vitoolsIoSync = function (opts) {
        const inp = document.getElementById(opts.inId), out = document.getElementById(opts.outId);
        let last = '', raf = 0;

        // 從一邊的選取範圍 [a, b) 找另一邊的範圍；fromIn：從輸入找輸出
        function find(fromIn, a, b) {
            const map = opts.getMap();
            const src = fromIn ? inp : out, dst = fromIn ? out : inp;
            if (!map) {   // 一字對一字
                const n = dst.value.length;
                return { from: Math.min(a, n), to: Math.min(Math.max(b, a + 1), n) };
            }
            const k0 = fromIn ? 's0' : 'o0', k1 = fromIn ? 's1' : 'o1';
            const r0 = fromIn ? 'o0' : 's0', r1 = fromIn ? 'o1' : 's1';
            const e = Math.max(b, a + 1);
            let from = Infinity, to = -1, prev = null, next = null;
            for (const m of map) {
                if (m[k0] < e && m[k1] > a) { from = Math.min(from, m[r0]); to = Math.max(to, m[r1]); }
                else if (m[k1] <= a) { if (!prev || m[k1] >= prev[k1]) prev = m; }
                else if (!next || m[k0] < next[k0]) next = m;
            }
            if (to < 0) {   // 游標在換行、空格這類沒有對應的地方：取同一行前一段（行首取後一段）
                const lineStart = src.value.lastIndexOf('\n', a - 1) + 1;
                const m = prev && prev[k1] > lineStart ? prev : (next || prev);
                if (!m) return null;
                from = m[r0]; to = m[r1];
            }
            return { from, to };
        }

        // 文字框上面疊一層同字型的透明文字，只把對應處畫底色（文字框沒有焦點時看不到選取範圍）
        function overlay(ta) {
            if (ta._ioSyncOv) return ta._ioSyncOv;
            const ov = document.createElement('div');
            ov.className = 'io-sync-ov';
            ov.setAttribute('aria-hidden', 'true');
            ov.hidden = true;
            if (getComputedStyle(ta.parentNode).position === 'static') ta.parentNode.style.position = 'relative';
            ta.parentNode.insertBefore(ov, ta.nextSibling);
            ta.addEventListener('scroll', () => { ov.scrollTop = ta.scrollTop; });
            ta._ioSyncOv = ov;
            return ov;
        }
        function clear(ta) { if (ta && ta._ioSyncOv) ta._ioSyncOv.hidden = true; }
        function mark(ta, from, to, scroll) {
            const ov = overlay(ta);
            const cs = getComputedStyle(ta), st = ov.style;
            st.left = (ta.offsetLeft + ta.clientLeft) + 'px';
            st.top = (ta.offsetTop + ta.clientTop) + 'px';
            st.width = ta.clientWidth + 'px';
            st.height = ta.clientHeight + 'px';
            for (const p of COPY) st[p] = cs[p];
            const v = ta.value;
            const m = document.createElement('mark');
            m.textContent = v.slice(from, to) || '​';
            ov.textContent = '';
            ov.append(v.slice(0, from), m, v.slice(to) + '​');
            ov.hidden = false;
            if (scroll) {
                const top = m.offsetTop, h = m.offsetHeight;
                if (top < ta.scrollTop || top + h > ta.scrollTop + ta.clientHeight)
                    ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
            }
            ov.scrollTop = ta.scrollTop;
        }
        // 焦點移到 ta 並選取 [from, to)，捲到看得到
        function select(ta, from, to) {
            ta.focus({ preventScroll: true });
            ta.setSelectionRange(from, to);
            mark(ta, from, to, true);   // 借底色層算捲動位置
            clear(ta);
            last = (ta === inp ? 'i' : 'o') + from + ',' + to + ',' + ta.value.length;
        }

        // 有焦點的那一區游標動了 → 另一區跟著
        function follow(force) {
            const act = document.activeElement;
            if (act !== inp && act !== out) return;
            const fromIn = act === inp;
            const key = (fromIn ? 'i' : 'o') + act.selectionStart + ',' + act.selectionEnd + ',' + act.value.length;
            if (!force && key === last) return;
            last = key;
            clear(act);
            const other = fromIn ? out : inp;
            if (!act.value || !other.value) { clear(other); return; }
            const r = find(fromIn, act.selectionStart, act.selectionEnd);
            if (r) mark(other, r.from, r.to, true); else clear(other);
        }
        function soon() {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; follow(false); });
        }
        function jump(fromTa) {
            const fromIn = fromTa === inp, other = fromIn ? out : inp;
            if (!other.value) return;
            const r = find(fromIn, fromTa.selectionStart, fromTa.selectionEnd);
            if (!r) return;
            mark(fromTa, fromTa.selectionStart, Math.max(fromTa.selectionEnd, fromTa.selectionStart + 1), false);
            select(other, r.from, r.to);
        }
        function refresh() {
            const act = document.activeElement;
            if (act === inp || act === out) follow(true);
            else { clear(inp); clear(out); }
        }

        [inp, out].forEach(ta => {
            for (const ev of ['keyup', 'mouseup', 'select', 'focus', 'selectionchange']) ta.addEventListener(ev, soon);
            ta.addEventListener('keydown', e => {
                if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'j' || e.key === 'J')) {
                    e.preventDefault();
                    jump(ta);
                }
            });
        });
        document.addEventListener('selectionchange', soon);
        let rt = 0;
        window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(refresh, 150); });

        return { find, mark, clear, select, refresh };
    };
})();
