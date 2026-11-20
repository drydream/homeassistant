// Owl that perches on the focused app tile and hops to the next one.
// Ported from ikevinadams/hogwarts-tv-home (MIT code; sprites are fan art, personal use, kept out of git).
// Needs owl/owl.js (OWL_SHEETS) + owl/{idle,hop}.webp, the TV-packed sheets from hogwarts-tv/app/src/main/assets/www/owl.
(function () {
    var wrap = document.querySelector('.shelf-wrapper');
    if (!wrap || !window.OWL_SHEETS) return;
    wrap.style.position = 'relative';

    var OWL_H = 110;                                       // icon is 156 px, the original 128 px owl looked oversized here
    var CELL = 190;                                        // tile 156 + margin 34
    var HOP = { up: 0.65, down: 2.22, end: 3.0, rate: 1.7 }; // take-off, touch-down, settled (s) in the hop clip, played 1.7x
    var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    var ease = function (x) { return x * x * (3 - 2 * x); };

    function canvas(cls) {
        var c = document.createElement('canvas');
        c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:30;' + cls;
        wrap.appendChild(c);
        return c;
    }

    var SHEET = {};
    Object.keys(OWL_SHEETS).forEach(function (k) {
        var sh = SHEET[k] = Object.assign({ img: new Image() }, OWL_SHEETS[k]);
        sh.img.onload = function () { sh.ctx.drawImage(sh.img, 0, 0, 1, 1, 0, 0, 1, 1); };   // decode + upload now, else the first hop drops to ~18 fps
        sh.img.src = sh.src;
        sh.cv = canvas('visibility:hidden;will-change:transform;');
        sh.cv.width = sh.cw; sh.cv.height = sh.ch;
        sh.cv.style.transformOrigin = sh.footX + 'px ' + sh.footY + 'px';
        sh.ctx = sh.cv.getContext('2d');
    });

    // landing sparkles: one soft dot sprite, drawn on a canvas that covers the shelf
    var dust = canvas('visibility:hidden;'), dctx = dust.getContext('2d'), dsp = [];
    var spr = document.createElement('canvas'); spr.width = spr.height = 32;
    (function () {
        var g = spr.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grd.addColorStop(0, 'rgba(255,240,210,1)'); grd.addColorStop(0.3, 'rgba(255,214,150,.6)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    })();

    // perch = top-centre of a tile, from layout offsets (ignores the focus scale transition, so the target never wobbles)
    var tile = null, lastId = null;
    function focusedTile() {
        var f = wrap.querySelector('.app-tile.focused');
        if (f) { tile = f; lastId = f.dataset.id; }
        else if (!tile || !tile.isConnected) tile = wrap.querySelector('.app-tile[data-id="' + lastId + '"]') || wrap.querySelector('.app-tile');
        return tile;                                       // focus on another row: stay on the last app
    }
    var tx = function (t) { return t.offsetLeft + t.offsetWidth / 2; };
    var ty = function (t) { return t.offsetTop - 18; };    // icon top after the 1.1 focus scale + 4 px lift, above the 8 px gilded rim

    var owl = { at: null, to: null, face: 1, hopping: false, hopT: 0, idleT: 0, idleWait: 1, sx: 0, sy: 0, x: 0, y: 0, landed: true };
    function hop(to, from) {
        owl.to = to; owl.sx = owl.x; owl.sy = owl.y; owl.landed = false;
        owl.face = Math.sign(tx(to) - owl.x) || owl.face;
        owl.hopping = true; owl.hopT = from;
    }

    var cur;
    function draw(sh, t) {
        if (cur !== sh) { if (cur) cur.cv.style.visibility = 'hidden'; cur = sh; sh.cv.style.visibility = 'visible'; }
        var f = Math.min(sh.n - 1, Math.floor(t * sh.fps));
        if (!sh.img.complete || sh.last === f) return;
        sh.last = f;
        sh.ctx.clearRect(0, 0, sh.cw, sh.ch);
        if (sh.frames) { var a = sh.frames[f]; sh.ctx.drawImage(sh.img, a[0], a[1], a[2], a[3], a[4], a[5], a[2], a[3]); }
        else sh.ctx.drawImage(sh.img, (f % sh.cols) * sh.cw, Math.floor(f / sh.cols) * sh.ch, sh.cw, sh.ch, 0, 0, sh.cw, sh.ch);
    }

    function update(dt, t) {
        var app = focusedTile();
        if (!app) return;
        if (!owl.at || !owl.at.isConnected) { owl.at = owl.to = app; owl.x = tx(app); owl.y = ty(app); }   // first frame / shelf re-rendered
        if (!owl.hopping) {
            if (owl.at !== app) hop(app, 0);
            else {
                owl.x = tx(app); owl.y = ty(app);
                if (owl.idleWait > 0) owl.idleWait -= dt;   // sits breathing, then one slow look around
                else if ((owl.idleT += dt) >= SHEET.idle.n / SHEET.idle.fps) { owl.idleT = 0; owl.idleWait = 1.5 + Math.random() * 3; }
            }
        }
        if (owl.hopping) {
            owl.hopT += dt * HOP.rate;
            var ht = owl.hopT, u;
            if (app !== owl.to && ht < HOP.down) {          // changed its mind mid-air: steer to the new perch without a jump
                u = ease(clamp((ht - HOP.up) / (HOP.down - HOP.up), 0, 1));
                owl.to = app; owl.face = Math.sign(tx(app) - owl.x) || owl.face;
                if (u < 0.95) { owl.sx = (owl.x - tx(app) * u) / (1 - u); owl.sy = (owl.y - ty(app) * u) / (1 - u); }
            }
            u = ease(clamp((ht - HOP.up) / (HOP.down - HOP.up), 0, 1));
            var far = Math.abs(tx(owl.to) - owl.sx) / CELL;   // a longer trip gets a higher arc
            owl.x = owl.sx + (tx(owl.to) - owl.sx) * u;
            owl.y = owl.sy + (ty(owl.to) - owl.sy) * u - Math.max(0, far - 1) * 46 * Math.sin(Math.PI * u);
            if (!owl.landed && ht >= HOP.down) {
                owl.landed = true; owl.at = owl.to;
                if (app === owl.at) strikeAt(owl.at);           // not when it's about to spring on to the next tile
                for (var k = 0; k < 10; k++) dsp.push({ x: owl.x + (Math.random() - .5) * 70, y: owl.y + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 90,
                    vy: -10 - Math.random() * 40, life: 0.5 + Math.random() * 0.5, r: 0.7 + Math.random() * 1.4 });
            }
            if (owl.landed && app !== owl.at) hop(app, HOP.up - 0.22);   // already asked to go on: spring straight off again
            else if (ht >= HOP.end) { owl.hopping = false; owl.idleT = 0; owl.idleWait = 0.8 + Math.random() * 1.5; }
        }
        if (owl.hopping) draw(SHEET.hop, owl.hopT); else draw(SHEET.idle, owl.idleWait > 0 ? 0 : owl.idleT);
        var b = OWL_H / (cur.owlH || 150) * (owl.hopping ? 1 : 1 + 0.006 * Math.sin(t * 2.4));
        cur.cv.style.transform = 'translate3d(' + (owl.x - cur.footX).toFixed(1) + 'px,' + (owl.y - cur.footY).toFixed(1) + 'px,0) scale(' + (owl.face * b) + ',' + b + ')';

        if (dsp.length || dust._on) {
            if (dust.width !== wrap.offsetWidth || dust.height !== wrap.offsetHeight + 200) {
                dust.width = wrap.offsetWidth; dust.height = wrap.offsetHeight + 200; dust.style.top = '-200px';
            }
            dust._on = dsp.length > 0; dust.style.visibility = dust._on ? 'visible' : 'hidden';
            dctx.clearRect(0, 0, dust.width, dust.height);
            dctx.globalCompositeOperation = 'lighter';
            dsp = dsp.filter(function (p) { return (p.life -= dt) > 0; });
            dsp.forEach(function (p) {
                p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 10 * dt;
                dctx.globalAlpha = Math.min(1, p.life * 1.4) * 0.8;
                dctx.drawImage(spr, p.x - p.r * 3, p.y + 200 - p.r * 3, p.r * 6, p.r * 6);
            });
            dctx.globalAlpha = 1;
        }
        if (strike) drawStrike(dt);
    }

    // lightning when the owl lands: a jagged bolt from the sky onto the icon, a flash, the gilded frame lights up, thunder.
    // The full-screen canvas stays hidden between strikes, so it costs nothing while idle.
    var bolt = document.createElement('canvas');
    bolt.width = 1920; bolt.height = 1080;
    bolt.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;pointer-events:none;z-index:9000;visibility:hidden;';
    document.body.appendChild(bolt);
    var bctx = bolt.getContext('2d'), strike = null;
    var thunder = new Audio('castle/thunder.mp3');
    thunder.volume = 0.5;
    var bst = document.createElement('style');
    bst.textContent = '.shelf-wrapper .app-tile .app-icon.struck,.shelf-wrapper .app-tile.focused .app-icon.struck{box-shadow:inset 0 0 0 3px #fff,0 0 0 3px #e8f0ff,0 0 0 7px #fff4c8,0 0 0 9px #8fb0ff,0 0 60px 16px rgba(170,200,255,.8);}';
    document.head.appendChild(bst);

    function jag(x0, y0, x1, y1, d) {                     // midpoint displacement: halve each segment, nudge the middle sideways
        var pts = [[x0, y0], [x1, y1]];
        while (d > 4) {
            var n = [pts[0]];
            for (var i = 1; i < pts.length; i++) {
                var a = pts[i - 1], b = pts[i];
                n.push([(a[0] + b[0]) / 2 + (Math.random() - .5) * d, (a[1] + b[1]) / 2 + (Math.random() - .5) * d * 0.3]);
                n.push(b);
            }
            pts = n; d /= 2;
        }
        return pts;
    }
    function strikeAt(tile) {
        var icon = tile.querySelector('.app-icon');
        if (!icon) return;
        var r = icon.getBoundingClientRect(), x1 = r.left + r.width / 2, y1 = r.top + 6;
        var main = jag(x1 + (Math.random() - .5) * 500, -20, x1, y1, 160), branches = [];
        for (var k = 0; k < 3; k++) {
            var p = main[2 + ((Math.random() * main.length * 0.6) | 0)];
            branches.push(jag(p[0], p[1], p[0] + (Math.random() - .5) * 280, p[1] + 80 + Math.random() * 180, 60));
        }
        if (strike) strike.icon.classList.remove('struck');
        strike = { t: 0, main: main, branches: branches, icon: icon };
        icon.classList.add('struck');
        try { thunder.currentTime = 0; var pr = thunder.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    }
    function line(pts, w, col) {
        bctx.lineWidth = w; bctx.strokeStyle = col; bctx.beginPath(); bctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) bctx.lineTo(pts[i][0], pts[i][1]);
        bctx.stroke();
    }
    function drawStrike(dt) {
        var t = (strike.t += dt);
        // on, a blink off, on again, then fade: how a real strike flickers
        var a = t < .07 ? 1 : t < .11 ? 0 : t < .2 ? 0.9 : Math.max(0, 0.9 * (1 - (t - .2) / .25));
        var flash = t < .05 ? .3 : t < .11 ? 0 : t < .16 ? .15 : 0;
        bctx.clearRect(0, 0, 1920, 1080);
        if (flash) { bctx.globalAlpha = flash; bctx.fillStyle = '#dfe8ff'; bctx.fillRect(0, 0, 1920, 1080); }
        if (a > 0) {
            bctx.lineJoin = 'round'; bctx.lineCap = 'round';
            [[0.25, 14, 7, '#9fb8ff'], [0.6, 5, 2.5, '#cfe0ff'], [1, 2, 1, '#ffffff']].forEach(function (L) {
                bctx.globalAlpha = a * L[0];
                line(strike.main, L[1], L[3]);
                strike.branches.forEach(function (b) { line(b, L[2], L[3]); });
            });
        }
        bctx.globalAlpha = 1;
        if (t > .45) { strike.icon.classList.remove('struck'); strike = null; bctx.clearRect(0, 0, 1920, 1080); bolt.style.visibility = 'hidden'; }
        else bolt.style.visibility = 'visible';
    }

    // fps over the last second, read over CDP: window.owlFps
    var last = 0, frames = 0, fpsT = 0;
    function frame(now) {
        var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
        frames++; if (now - fpsT >= 1000) { window.owlFps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
        update(dt, now / 1000);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
