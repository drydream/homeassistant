// Castle-at-night backdrop: candlelit windows, drifting mist, twinkling stars, lake glints, the odd shooting star.
// TV-mode subset of ikevinadams/hogwarts-tv-home (MIT code; pictures are fan art, personal use, kept out of git):
// no blend modes, one mist layer, motion driven from one rAF loop instead of CSS animations.
// Needs castle/{castle.jpg,mist.png,windows_a_crop.png,layers.js,points.js}.
(function () {
    if (!window.POINTS || !window.WIN_CROP) return;
    var SW = 1935, SH = 1080;
    var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    var ease = function (x) { return x * x * (3 - 2 * x); };

    var root = document.createElement('div');
    root.id = 'castleBg';
    root.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;overflow:hidden;z-index:0;pointer-events:none;background:#000;';
    root.innerHTML =
        // static photo: the original's slow camera drift cost ~10 fps on this TV. The launcher's text and tiles sit on the
        // lower half, so a shade is painted into the photo's own layer (a separate full-screen shade layer cost another ~5 fps)
        '<div style="position:absolute;left:-7.5px;top:0;width:1935px;height:1080px;' +
        'background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 40%,rgba(0,0,0,.35) 62%,rgba(0,0,0,.6) 100%),url(castle/castle.jpg) 0 0 / 100% 100%;">' +
        '<div id="cbMoon" style="position:absolute;left:427px;top:52px;width:500px;height:500px;border-radius:50%;will-change:opacity;' +
        'background:radial-gradient(circle,rgba(200,225,255,.30) 0%,rgba(170,200,240,.12) 22%,rgba(150,180,230,0) 62%);"></div>' +
        '<img id="cbWin" src="castle/windows_a_crop.png" style="position:absolute;opacity:.4;will-change:opacity;">' +
        '<canvas id="cbSky" width="1935" height="250" style="position:absolute;left:0;top:0;"></canvas>' +
        '<canvas id="cbWater" width="1120" height="280" style="position:absolute;left:560px;top:800px;"></canvas>' +
        '<div style="position:absolute;left:0;top:612px;width:1935px;height:300px;opacity:.62;overflow:hidden;">' +
        '<div id="cbMist" style="position:absolute;left:0;top:0;width:5121px;height:100%;background:url(castle/mist.png) 0 0 / 1707px 100% repeat-x;will-change:transform;"></div></div>' +
        '</div>';
    document.body.insertBefore(root, document.body.firstChild);
    // type: Harry P (dafont, free, personal use; castle/harryp.ttf, gitignored) for the clock and the app name.
    // The owl stands ~110 px above the tiles, so the hero text sits higher and the "Favorite Apps" label (always under the owl) goes.
    var st = document.createElement('style');
    st.textContent =
        "@font-face{font-family:'HarryP';src:url(castle/harryp.ttf) format('truetype');}" +
        ".clock{font-family:'HarryP',serif;font-size:118px;font-weight:400;letter-spacing:2px;color:#f4ead6;text-shadow:0 2px 18px rgba(0,0,0,.6);}" +
        ".hero-shelf{padding-bottom:150px;}" +
        ".hero-tag{color:#d9b45f;}" +
        ".hero-title{font-family:'HarryP',serif;font-size:112px;font-weight:400;letter-spacing:1px;line-height:1;color:#f3dc9a;text-shadow:0 3px 20px rgba(0,0,0,.75);}" +
        ".hero-desc{color:rgba(244,234,214,.85);text-shadow:0 1px 8px rgba(0,0,0,.8);}" +
        ".shelf-top-bar .shelf-header{visibility:hidden;}";
    document.head.appendChild(st);

    // theme music, soft, looping, only while the launcher is in front (castle/theme.mp3, gitignored)
    var music = new Audio('castle/theme.mp3');
    music.loop = true; music.volume = 0.35; window.castleMusic = music;   // CDP: castleMusic.paused / .volume
    function playIfFront() {
        if (document.hidden) music.pause();
        else { var p = music.play(); if (p && p.catch) p.catch(function () {}); }   // autoplay refused: the keydown below retries
    }
    document.addEventListener('visibilitychange', playIfFront);
    document.addEventListener('keydown', function () { if (music.paused && !document.hidden) playIfFront(); }, true);
    playIfFront();
    document.body.style.background = '#000';
    var glow = document.getElementById('ambientGlow');
    if (glow) glow.style.display = 'none';                 // the per-app colour glow fights the photo

    var $ = function (id) { return document.getElementById(id); };
    var moon = $('cbMoon'), win = $('cbWin'), mist = $('cbMist');
    win.style.left = WIN_CROP[0] * SW + 'px'; win.style.top = WIN_CROP[1] * SH + 'px';
    win.style.width = WIN_CROP[2] * SW + 'px'; win.style.height = WIN_CROP[3] * SH + 'px';

    function sprite(w, h, stops) {                         // a soft round glow, squashed to w x h
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d'), rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); });
        g.scale(1, h / w); g.fillStyle = rg; g.fillRect(0, 0, w, w);
        return c;
    }
    var starSpr = sprite(32, 32, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(225,238,255,.9)'], [0.35, 'rgba(170,200,255,.25)'], [1, 'rgba(150,180,255,0)']]);
    var warmSpr = sprite(48, 8, [[0, 'rgba(255,226,170,1)'], [0.4, 'rgba(255,180,100,.5)'], [1, 'rgba(255,150,60,0)']]);
    var coolSpr = sprite(48, 8, [[0, 'rgba(230,240,255,.9)'], [0.4, 'rgba(180,205,240,.35)'], [1, 'rgba(150,180,230,0)']]);

    var STARS = POINTS.stars.slice(0, 64).map(function (p) {
        return { x: p[0] * SW, y: p[1] * SH, b: clamp(p[2] * 1.3, 0.3, 1), w: 0.6 + Math.random() * 2.2, p: Math.random() * 6.28, r: 2.5 + p[2] * 4 };
    });
    var GLINTS = POINTS.glints.map(function (p) { return { x: p[0] * SW, y: p[1] * SH }; });
    var sky = $('cbSky').getContext('2d'), water = $('cbWater').getContext('2d');
    water.setTransform(1, 0, 0, 1, -560, -800);            // draw in photo coordinates
    var glints = [], meteor = null, nextMeteor = 6 + Math.random() * 8;

    function drawSky(t, dt) {
        sky.clearRect(0, 0, SW, 250); sky.globalCompositeOperation = 'lighter';
        water.clearRect(560, 800, 1120, 280); water.globalCompositeOperation = 'lighter';
        STARS.forEach(function (s) {
            var tw = 0.5 + 0.5 * Math.sin(t * s.w + s.p);
            sky.globalAlpha = s.b * (0.15 + 0.85 * tw * tw * tw);
            sky.drawImage(starSpr, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        });
        // warm glints in the castle's reflection, a few cool ones where the moon would catch the water
        while (glints.length < 34) {
            var m = Math.random() < 0.22;
            var p = m ? { x: 600 + Math.random() * 170, y: 830 + Math.random() * 220 } : GLINTS[(Math.random() * GLINTS.length) | 0];
            glints.push({ x: p.x + (Math.random() - .5) * 6, y: p.y, w: 10 + Math.random() * (m ? 26 : 18), age: -Math.random() * 1.5, life: 0.7 + Math.random() * 1.2, moon: m });
        }
        glints = glints.filter(function (g) { return (g.age += dt) < g.life; });
        glints.forEach(function (g) {
            if (g.age < 0) return;
            water.globalAlpha = Math.sin(Math.PI * g.age / g.life) * (g.moon ? 0.35 : 0.6);
            water.drawImage(g.moon ? coolSpr : warmSpr, g.x - g.w / 2, g.y - 2, g.w, 4);
        });
        // now and then a shooting star over the hills on the left (never across the castle)
        if (!meteor && t > nextMeteor) meteor = { x: 300 + Math.random() * 420, y: 20 + Math.random() * 120, a: 0 };
        if (meteor) {
            meteor.a += dt / 0.9;
            var k = ease(Math.min(1, meteor.a)), hx = meteor.x - 260 * k, hy = meteor.y + 95 * k;
            var gr = sky.createLinearGradient(hx, hy, hx + 150, hy - 55), al = Math.sin(Math.PI * Math.min(1, meteor.a)) * 0.8;
            gr.addColorStop(0, 'rgba(235,242,255,' + al + ')'); gr.addColorStop(1, 'rgba(235,242,255,0)');
            sky.globalAlpha = 1; sky.strokeStyle = gr; sky.lineWidth = 1.6; sky.lineCap = 'round';
            sky.beginPath(); sky.moveTo(hx, hy); sky.lineTo(hx + 150, hy - 55); sky.stroke();
            if (meteor.a >= 1) { meteor = null; nextMeteor = t + 14 + Math.random() * 16; }
        }
        sky.globalAlpha = 1;
    }

    var flick = function (t, s) { return 0.5 + 0.30 * Math.sin(t * 1.9 + s) * Math.sin(t * 0.71 + s * 2.3) + 0.12 * Math.sin(t * 6.1 + s * 3.1) + 0.06 * Math.sin(t * 13.7 + s); };

    var last = 0, skyAcc = 0, odd = false;
    function frame(now) {
        var t = now / 1000, dt = last ? Math.min(0.1, t - last) : 0; last = t;
        {
            mist.style.transform = 'translateX(' + (-(t * 11.38) % 1707).toFixed(1) + 'px)';
            win.style.opacity = (0.22 + 0.42 * flick(t, 0)).toFixed(3);
            moon.style.opacity = (0.75 + 0.2 * Math.sin(t / 6.5)).toFixed(3);
            skyAcc += dt; odd = !odd;
            if (odd) { drawSky(t, skyAcc); skyAcc = 0; }   // stars/glints at half rate, as the original does on the TV
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
