// Live three.js visuals for the deck. Each <canvas class="viz3d" data-scene="..."> runs
// only while its slide is the current one (section.present), so hidden slides cost nothing.
// A scene is make(scene, camera, canvas) -> { update(t, dt), reset?() }. If it has reset(),
// it restarts from t = 0 every time its slide is re-entered, so a narrated story starts at the top.
(function () {
  var COL = { o: 0xf0a868, t: 0x63b3a6, b: 0x7aa0e0, g: 0x8b919a, d: 0x3a3f48, r: 0xe06c75, bg: 0x1c1c1c };

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function sphere(r, color, seg) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, seg || 14, seg || 14), new THREE.MeshBasicMaterial({ color: color }));
  }
  // Depth cue: things further from the camera fade towards the slide background.
  function fog(scene) { scene.fog = new THREE.Fog(COL.bg, 1, 100); }
  // Camera distance at which a sphere of radius R just fits, whatever the canvas aspect.
  function fit(camera, R) {
    var v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);
    return R / Math.sin(Math.min(v, h));
  }
  // Put the camera on a sphere around (0, ty, 0) that keeps radius R in frame, and pin the fog to it.
  function orbit(scene, camera, R, az, el, ty) {
    var d = fit(camera, R);
    camera.position.set(Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
    camera.lookAt(0, ty, 0);
    if (scene.fog) { scene.fog.near = d - R * 0.2; scene.fog.far = d + R * 2.6; }
  }
  // Small HTML overlay on top of a canvas (labels, readouts). Sizes are in slide pixels.
  function overlay(canvas) {
    var wrap = canvas.parentNode;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    return function el(tag, css, html, parent) {
      var e = document.createElement(tag); e.style.cssText = css;
      if (html) e.innerHTML = html;
      (parent || wrap).appendChild(e); return e;
    };
  }
  var CAPTION = 'position:absolute;left:10px;top:7px;font-size:13px;line-height:1.3;color:#e3e6ec;pointer-events:none;' +
    'background:rgba(20,22,26,0.72);padding:4px 8px;border-radius:5px;transition:opacity .25s;';

  var scenes = {};

  // 1. Connectionists: a real forward pass. Each pulse feeds a fresh input through fixed random
  //    weights (ReLU); edges glow by their contribution, orange excitatory and blue inhibitory,
  //    and the winning output unit flares.
  scenes.network = function (scene, camera) {
    fog(scene);
    var sizes = [4, 6, 6, 3], NL = sizes.length, r = rng(7), group = new THREE.Group(), L = [], W = [], E = [], i, j, li;
    scene.add(group);
    sizes.forEach(function (n, l) {
      var row = [];
      for (i = 0; i < n; i++) {
        var m = sphere(0.15, COL.d, 16);
        m.position.set((l - (NL - 1) / 2) * 2.05, (i - (n - 1) / 2) * 0.72, (r() - 0.5) * 1.2);
        group.add(m); row.push({ m: m, a: 0 });
      }
      L.push(row);
    });
    for (li = 0; li < NL - 1; li++) {
      W.push([]);
      for (i = 0; i < sizes[li]; i++) { W[li].push([]); for (j = 0; j < sizes[li + 1]; j++) W[li][i].push(gauss(r)); }
    }
    var pos = [];
    for (li = 0; li < NL - 1; li++) for (i = 0; i < sizes[li]; i++) for (j = 0; j < sizes[li + 1]; j++) {
      var a = L[li][i].m.position, b = L[li + 1][j].m.position;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z); E.push({ li: li, i: i, j: j, w: W[li][i][j], c: 0 });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })));
    var PASS = 3.4, pass = -1, win = 0;
    function forward() {
      L[0].forEach(function (n) { n.a = r() < 0.25 ? 0 : 0.25 + 0.75 * r(); });
      for (li = 0; li < NL - 1; li++) {
        var out = [], mx = 1e-6;
        for (j = 0; j < sizes[li + 1]; j++) {
          var s = 0; for (i = 0; i < sizes[li]; i++) s += L[li][i].a * W[li][i][j];
          out.push(Math.max(0, s)); mx = Math.max(mx, s);
        }
        for (j = 0; j < sizes[li + 1]; j++) L[li + 1][j].a = out[j] / mx;
      }
      var mc = sizes.slice(1).map(function () { return 1e-6; });
      E.forEach(function (e) { e.c = L[e.li][e.i].a * e.w; mc[e.li] = Math.max(mc[e.li], Math.abs(e.c)); });
      E.forEach(function (e) { e.c /= mc[e.li]; });
      win = 0; L[NL - 1].forEach(function (n, k) { if (n.a > L[NL - 1][win].a) win = k; });
    }
    var idle = new THREE.Color(0x4a5361), hot = new THREE.Color(COL.o), cold = new THREE.Color(COL.b), tmp = new THREE.Color();
    return {
      update: function (t) {
        var k = Math.floor(t / PASS);
        if (k !== pass) { pass = k; forward(); }
        var p = (t % PASS) / PASS * (NL + 1.2), fade = 1 - smooth((p - (NL + 0.3)) / 0.7);
        L.forEach(function (row, l) {
          row.forEach(function (n, q) {
            var s = n.a * smooth((p - l) / 0.35) * fade, champ = l === NL - 1 && q === win;
            n.m.material.color.copy(idle).lerp(hot, s);
            n.m.scale.setScalar(1 + 0.55 * s + (champ ? 0.6 * s * (1 + 0.25 * Math.sin(t * 14)) : 0));
          });
        });
        var c = g.attributes.color, v = 0;
        E.forEach(function (e) {
          var travel = p > e.li && p < e.li + 1 ? Math.sin(Math.PI * (p - e.li)) : 0;
          var after = p >= e.li + 1 ? 0.22 : 0, amt = Math.abs(e.c) * Math.min(1, travel + after) * fade;
          tmp.setRGB(0.15, 0.17, 0.21).multiplyScalar(0.8 + 0.25 * Math.abs(e.w)).lerp(e.c > 0 ? hot : cold, amt);
          c.setXYZ(v++, tmp.r, tmp.g, tmp.b); c.setXYZ(v++, tmp.r, tmp.g, tmp.b);
        });
        c.needsUpdate = true;
        orbit(scene, camera, 3.9, Math.sin(t * 0.3) * 0.5, 0.12, 0);
      }
    };
  };

  // 2. Evolutionaries: a population climbing a fitness landscape by selection + crossover + mutation.
  //    The four elites (carried over unchanged) are pale; a white ring marks the best point found so far.
  scenes.landscape = function (scene, camera) {
    fog(scene);
    var peaks = [[1.5, 1.0, 1.7, 0.8], [-1.6, -1.2, 1.1, 0.7], [-1.2, 1.7, 0.7, 0.55], [1.8, -1.8, 0.9, 0.5]];
    function height(x, z) {
      var h = 0.08 * Math.sin(3 * x) * Math.cos(3 * z);
      peaks.forEach(function (p) { h += p[2] * Math.exp(-((x - p[0]) * (x - p[0]) + (z - p[1]) * (z - p[1])) / (2 * p[3] * p[3])); });
      return h;
    }
    var N = 48, geo = new THREE.PlaneGeometry(6, 6, N, N), pa = geo.attributes.position, colors = [], i;
    geo.rotateX(-Math.PI / 2);
    var lo = new THREE.Color(COL.b), mid = new THREE.Color(COL.t), hi = new THREE.Color(COL.o), c = new THREE.Color();
    for (i = 0; i < pa.count; i++) {
      var h = height(pa.getX(i), pa.getZ(i));
      pa.setY(i, h);
      var u = clamp01(h / 1.8);
      c.copy(lo).lerp(mid, Math.min(1, u * 2)).lerp(hi, Math.max(0, u * 2 - 1));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 })));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.3 })));

    var P = 22, ELITE = 4, GEN = 1.25, MOVE = 0.9, r = rng(11), pop = [], meshes = [], gen = 0, gt = 0, best = null;
    for (i = 0; i < P; i++) { var m = sphere(0.085, COL.o, 10); scene.add(m); meshes.push(m); }
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    function reset() {
      pop = []; gen = 0; best = null;
      for (i = 0; i < P; i++) { var x = (r() - 0.5) * 5.6, z = (r() - 0.5) * 5.6; pop.push({ fx: x, fz: z, x: x, z: z, elite: false }); }
    }
    function nextGen(t) {
      var ranked = pop.slice().sort(function (a, b) { return height(b.x, b.z) - height(a.x, a.z); });
      var parents = ranked.slice(0, P / 2), next = [];
      for (i = 0; i < P; i++) {
        var el = i < ELITE, a = el ? ranked[i] : parents[Math.floor(r() * parents.length)], b = parents[Math.floor(r() * parents.length)];
        var x = el ? a.x : (a.x + b.x) / 2 + gauss(r) * 0.3, z = el ? a.z : (a.z + b.z) / 2 + gauss(r) * 0.3;
        next.push({ fx: a.x, fz: a.z, x: Math.max(-2.9, Math.min(2.9, x)), z: Math.max(-2.9, Math.min(2.9, z)), elite: el });
      }
      pop = next; gen++; gt = t;
    }
    reset();
    return {
      update: function (t) {
        if (t - gt > GEN) { if (gen >= 12) { reset(); } else { nextGen(t); } if (gen === 0) gt = t; }
        var e = smooth((t - gt) / MOVE);
        pop.forEach(function (p, k) {
          var x = p.fx + (p.x - p.fx) * e, z = p.fz + (p.z - p.fz) * e, y = height(x, z);
          meshes[k].position.set(x, y + 0.1, z);
          meshes[k].material.color.setHex(p.elite ? 0xffe2c4 : COL.o);
          if (e > 0.99 && (!best || y > best.y)) best = { x: x, y: y, z: z };
        });
        ring.visible = !!best;
        if (best) ring.position.set(best.x, best.y + 0.04, best.z);
        orbit(scene, camera, 4.1, 0.6 + t * 0.18, 0.62, 0.3);
      }
    };
  };

  // 3. Analogizers: the kernel trick. Lift tangled 2-D points into 3-D (height = r^2), where a flat
  //    plane separates them. Stems from the floor make the lift readable from any angle.
  scenes.kernel = function (scene, camera) {
    fog(scene);
    var r = rng(21), pts = [], i, K = 0.36, n = 150;
    for (i = 0; i < n; i++) {
      var inner = i < 55, ang = r() * Math.PI * 2, rad = inner ? Math.sqrt(r()) * 0.95 : 1.75 + r() * 0.8;
      var m = sphere(0.075, inner ? COL.t : COL.o, 10);
      m.userData = { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, r2: rad * rad, inner: inner };
      scene.add(m); pts.push(m);
    }
    var stemPos = new Float32Array(n * 6), stemCol = [], ct = new THREE.Color(COL.t), co = new THREE.Color(COL.o);
    pts.forEach(function (m) { var cc = m.userData.inner ? ct : co; stemCol.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); });
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(stemPos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(stemCol, 3));
    var stems = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 }));
    stems.frustumCulled = false; scene.add(stems);
    scene.add(new THREE.GridHelper(6, 12, 0x555a63, 0x33373e));
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ color: COL.b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = 0.68; scene.add(plane);
    var ring = new THREE.Mesh(new THREE.RingGeometry(1.34, 1.39, 64), new THREE.MeshBasicMaterial({ color: COL.b, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    return {
      update: function (t) {
        var T = t % 11, s = smooth((T - 2) / 2.4) * (1 - smooth((T - 8) / 2.4));
        pts.forEach(function (m, k) {
          var d = m.userData, y = K * d.r2 * s;
          m.position.set(d.x, y, d.z);
          var o = k * 6; stemPos[o] = stemPos[o + 3] = d.x; stemPos[o + 1] = 0; stemPos[o + 4] = y; stemPos[o + 2] = stemPos[o + 5] = d.z;
        });
        sg.attributes.position.needsUpdate = true;
        stems.material.opacity = 0.32 * s;
        plane.material.opacity = 0.28 * smooth((s - 0.85) / 0.15);
        ring.material.opacity = 0.9 * smooth((s - 0.85) / 0.15);
        orbit(scene, camera, 3.6, 0.7 + t * 0.14, 0.42 + 0.08 * s, 0.4 * s);
      },
      reset: function () {}   // pure function of t: restarting t (done by start) replays the lift
    };
  };

  // 4. Unsupervised learning: real k-means on a 3-D point cloud, one assign/update step at a time.
  //    Spokes show which centroid owns each point; trails show the centroids walking to the means.
  scenes.cluster = function (scene, camera) {
    fog(scene);
    var group = new THREE.Group(), r = rng(5), data = [], pts = [], cents = [], i, j;
    scene.add(group);
    var centres = [[-1.7, 0.6, 0.2], [1.6, 1.0, -0.8], [0.1, -1.5, 1.0]], palette = [COL.o, COL.t, COL.b];
    centres.forEach(function (c) {
      for (i = 0; i < 34; i++) {
        var p = [c[0] + gauss(r) * 0.5, c[1] + gauss(r) * 0.5, c[2] + gauss(r) * 0.5];
        data.push(p); var m = sphere(0.075, COL.g, 10); m.position.set(p[0], p[1], p[2]); group.add(m); pts.push(m);
      }
    });
    var spokePos = new Float32Array(data.length * 6), spokeCol = new Float32Array(data.length * 6);
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spokePos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(spokeCol, 3));
    var spokes = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32 }));
    spokes.frustumCulled = false; group.add(spokes);
    for (j = 0; j < 3; j++) {
      var o = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: palette[j] }));
      o.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.23), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })));
      var tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      var trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: palette[j], transparent: true, opacity: 0.75 }));
      trail.frustumCulled = false;
      group.add(o); group.add(trail);
      cents.push({ mesh: o, trail: trail, hist: [], pos: [0, 0, 0], tgt: [0, 0, 0], col: new THREE.Color(palette[j]) });
    }
    var assign = [], phase = 0, last = 0, STEP = 1.1;
    function init() {
      var used = [];
      for (j = 0; j < 3; j++) {
        var ix; do { ix = Math.floor(r() * data.length); } while (used.indexOf(ix) >= 0);
        used.push(ix); cents[j].pos = data[ix].slice(); cents[j].tgt = data[ix].slice(); cents[j].hist = [data[ix].slice()];
      }
      assign = data.map(function () { return -1; }); phase = 0;
      pts.forEach(function (m) { m.material.color.setHex(COL.g); });
    }
    function step() {
      if (phase % 2 === 0) {
        data.forEach(function (p, k) {
          var best = 0, bd = 1e9;
          cents.forEach(function (c, q) { var d = Math.pow(p[0] - c.tgt[0], 2) + Math.pow(p[1] - c.tgt[1], 2) + Math.pow(p[2] - c.tgt[2], 2); if (d < bd) { bd = d; best = q; } });
          assign[k] = best; pts[k].material.color.setHex(palette[best]);
        });
      } else {
        cents.forEach(function (c, q) {
          var s = [0, 0, 0], n = 0;
          data.forEach(function (p, k) { if (assign[k] === q) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } });
          if (n) { c.tgt = [s[0] / n, s[1] / n, s[2] / n]; c.hist.push(c.tgt.slice()); }
        });
      }
      phase++;
    }
    init();
    return {
      update: function (t, dt) {
        if (t - last > STEP) { last = t; if (phase >= 9) { init(); } else { step(); } }
        cents.forEach(function (c) {
          for (var k = 0; k < 3; k++) c.pos[k] += (c.tgt[k] - c.pos[k]) * Math.min(1, dt * 5);
          c.mesh.position.set(c.pos[0], c.pos[1], c.pos[2]); c.mesh.rotation.y += dt * 1.5;
          var a = c.trail.geometry.attributes.position, h0 = Math.max(0, c.hist.length - 15), q;
          for (q = h0; q < c.hist.length; q++) a.setXYZ(q - h0, c.hist[q][0], c.hist[q][1], c.hist[q][2]);
          a.setXYZ(c.hist.length - h0, c.pos[0], c.pos[1], c.pos[2]); a.needsUpdate = true;
          c.trail.geometry.setDrawRange(0, c.hist.length - h0 + 1);
        });
        data.forEach(function (p, k) {
          var q = assign[k], e = q < 0 ? p : cents[q].pos, cc = q < 0 ? null : cents[q].col, o = k * 6;
          spokePos[o] = p[0]; spokePos[o + 1] = p[1]; spokePos[o + 2] = p[2]; spokePos[o + 3] = e[0]; spokePos[o + 4] = e[1]; spokePos[o + 5] = e[2];
          if (cc) { spokeCol[o] = spokeCol[o + 3] = cc.r; spokeCol[o + 1] = spokeCol[o + 4] = cc.g; spokeCol[o + 2] = spokeCol[o + 5] = cc.b; }
        });
        sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
        group.rotation.y = t * 0.25;
        orbit(scene, camera, 3.3, 0, 0.2, 0);
      }
    };
  };

  // 5. Supervised learning: gradient descent, three models sliding down an error surface.
  //    A white ring marks the global minimum, so a ball stuck in a local valley is visibly stuck.
  scenes.descent = function (scene, camera) {
    fog(scene);
    function f(x, z) { return 0.07 * (x * x + z * z) + 0.5 * Math.sin(1.5 * x) * Math.cos(1.5 * z); }
    var N = 44, geo = new THREE.PlaneGeometry(6, 6, N, N), pa = geo.attributes.position, colors = [], i;
    geo.rotateX(-Math.PI / 2);
    var lo = new THREE.Color(COL.t), hi = new THREE.Color(COL.b), c = new THREE.Color();
    for (i = 0; i < pa.count; i++) {
      var h = f(pa.getX(i), pa.getZ(i)); pa.setY(i, h);
      c.copy(lo).lerp(hi, clamp01((h + 0.6) / 2.0)); colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4 })));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.3 })));
    var gm = [0, 0, 1e9], gx, gz;
    for (gx = -2.95; gx <= 2.95; gx += 0.025) for (gz = -2.95; gz <= 2.95; gz += 0.025) if (f(gx, gz) < gm[2]) gm = [gx, gz, f(gx, gz)];
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(gm[0], gm[2] + 0.03, gm[1]); scene.add(ring);
    var r = rng(33), balls = [], MAXP = 260, LR = 0.1;
    for (i = 0; i < 3; i++) {
      var m = sphere(0.12, COL.o, 12); scene.add(m);
      var tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3)); tg.setDrawRange(0, 0);
      var tl = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: COL.o, transparent: true, opacity: 0.8 })); tl.frustumCulled = false; scene.add(tl);
      balls.push({ m: m, tg: tg, n: 0, x: 0, z: 0 });
    }
    function reset() {
      balls.forEach(function (b) { b.x = (r() - 0.5) * 5; b.z = (r() - 0.5) * 5; b.n = 1; var a0 = b.tg.attributes.position; a0.setXYZ(0, b.x, f(b.x, b.z) + 0.1, b.z); a0.needsUpdate = true; b.tg.setDrawRange(0, 1); });
    }
    reset();
    var acc = 0, since = 0;
    return {
      update: function (t, dt) {
        acc += dt; since += dt;
        while (acc > 0.045) {
          acc -= 0.045;
          balls.forEach(function (b) {
            var e = 0.01, gx2 = (f(b.x + e, b.z) - f(b.x - e, b.z)) / (2 * e), gz2 = (f(b.x, b.z + e) - f(b.x, b.z - e)) / (2 * e);
            b.x = Math.max(-2.95, Math.min(2.95, b.x - LR * gx2 * 3)); b.z = Math.max(-2.95, Math.min(2.95, b.z - LR * gz2 * 3));
            if (b.n < MAXP) { var a = b.tg.attributes.position; a.setXYZ(b.n, b.x, f(b.x, b.z) + 0.1, b.z); a.needsUpdate = true; b.n++; b.tg.setDrawRange(0, b.n); }
          });
        }
        balls.forEach(function (b) { b.m.position.set(b.x, f(b.x, b.z) + 0.12, b.z); });
        if (since > 11) { since = 0; reset(); }
        orbit(scene, camera, 3.7, t * 0.16, 0.58, 0.1);
      }
    };
  };

  // 6. Reinforcement learning: real tabular Q-learning on a grid. Tiles rise as value spreads back
  //    from the reward, and arrows show the greedy policy forming, tile by tile.
  scenes.gridworld = function (scene, camera) {
    fog(scene);
    var G = 5, goal = [4, 4], pits = [[2, 1], [1, 3], [3, 2]], r = rng(17), i, j;
    var Q = [], tiles = [], arrows = [];
    for (i = 0; i < G * G; i++) Q.push([0, 0, 0, 0]);
    var moves = [[1, 0], [-1, 0], [0, 1], [0, -1]], yaw = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
    function isPit(x, y) { return pits.some(function (p) { return p[0] === x && p[1] === y; }); }
    function isGoal(x, y) { return x === goal[0] && y === goal[1]; }
    var base = new THREE.Color(0x2b2f36), good = new THREE.Color(COL.t), bad = new THREE.Color(COL.r), tmp = new THREE.Color();
    var coneGeo = new THREE.ConeGeometry(0.11, 0.34, 10); coneGeo.rotateZ(-Math.PI / 2);
    for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
      var geo = new THREE.BoxGeometry(0.88, 1, 0.88); geo.translate(0, 0.5, 0);
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: base }));
      m.position.set(i - (G - 1) / 2, 0, j - (G - 1) / 2); m.scale.y = 0.06;
      scene.add(m); tiles.push(m);
      var ar = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xeef1f5, transparent: true, opacity: 0 }));
      ar.position.copy(m.position); scene.add(ar); arrows.push(ar);
    }
    var agent = sphere(0.2, COL.o, 14); scene.add(agent);
    var TR = 14, trailPos = new Float32Array(TR * 3), hist = [];
    var tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    var trail = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ color: COL.o, transparent: true, opacity: 0.55 }));
    trail.frustumCulled = false; scene.add(trail);
    var st = [0, 0], steps = 0, acc = 0, eps = 0.3;
    function V(x, y) { return Math.max.apply(null, Q[x * G + y]); }
    function greedy(s) { var a = 0; for (var k = 1; k < 4; k++) if (Q[s][k] > Q[s][a]) a = k; return a; }
    function reset() { st = [0, 0]; steps = 0; hist = []; }
    function stepOnce() {
      var s = st[0] * G + st[1], a;
      if (r() < eps) a = Math.floor(r() * 4); else { a = 0; for (var k = 1; k < 4; k++) if (Q[s][k] > Q[s][a] + 1e-9 || (Math.abs(Q[s][k] - Q[s][a]) < 1e-9 && r() < 0.3)) a = k; }
      var nx = Math.max(0, Math.min(G - 1, st[0] + moves[a][0])), ny = Math.max(0, Math.min(G - 1, st[1] + moves[a][1]));
      var rew = -0.02, done = false;
      if (isGoal(nx, ny)) { rew = 1; done = true; } else if (isPit(nx, ny)) { rew = -1; done = true; }
      var target = rew + (done ? 0 : 0.95 * V(nx, ny));
      Q[s][a] += 0.5 * (target - Q[s][a]);
      st = [nx, ny]; steps++;
      hist.push([nx, ny]); if (hist.length > TR) hist.shift();
      if (done || steps > 60) { reset(); eps = Math.max(0.08, eps * 0.985); }
    }
    var epochT = 0;
    return {
      reset: function () { Q.forEach(function (q) { q[0] = q[1] = q[2] = q[3] = 0; }); eps = 0.3; epochT = 0; acc = 0; reset(); },
      update: function (t, dt) {
        acc += dt; epochT += dt;
        while (acc > 0.03) { acc -= 0.03; stepOnce(); }
        if (epochT > 40) { epochT = 0; Q.forEach(function (q) { q[0] = q[1] = q[2] = q[3] = 0; }); eps = 0.3; reset(); }
        tiles.forEach(function (m, k) {
          var x = Math.floor(k / G), y = k % G, v = Math.max(0, V(x, y)), target, ar = arrows[k];
          if (isGoal(x, y)) { target = 0.9; tmp.copy(good); }
          else if (isPit(x, y)) { target = 0.12; tmp.copy(bad); }
          else { target = 0.06 + Math.min(0.8, v * 0.9); tmp.copy(base).lerp(good, Math.min(1, v * 1.1)); }
          m.scale.y += (target - m.scale.y) * 0.2; m.material.color.copy(tmp);
          var terminal = isGoal(x, y) || isPit(x, y);
          ar.material.opacity = terminal ? 0 : 0.9 * smooth((v - 0.02) / 0.15);
          ar.rotation.y = yaw[greedy(k)];
          ar.position.y = m.scale.y + 0.12;
        });
        function top(p) { return tiles[p[0] * G + p[1]].scale.y; }
        hist.forEach(function (p, q) { trailPos[q * 3] = p[0] - (G - 1) / 2; trailPos[q * 3 + 1] = top(p) + 0.25; trailPos[q * 3 + 2] = p[1] - (G - 1) / 2; });
        tgeo.attributes.position.needsUpdate = true; tgeo.setDrawRange(0, hist.length);
        agent.position.set(st[0] - (G - 1) / 2, top(st) + 0.25, st[1] - (G - 1) / 2);
        orbit(scene, camera, 3.8, 0.5 + t * 0.12, 0.82, 0.2);
      }
    };
  };

  // 7. Knowledge as compression: a rolled-up sheet unrolls into the two numbers that actually matter.
  //    Points are the data; the faint sheet is the manifold they lie on. Colour = position along the roll.
  scenes.roll = function (scene, camera) {
    fog(scene);
    var r = rng(9), S = 0.2, NU = 48, NH = 6, HH = 1.3, WID = 5.2;
    // rolled: a spiral sheet (axis vertical); flat: the same sheet laid out as a strip facing the camera
    function at(u, h, k, out) {
      var tt = 1.5 * Math.PI + u * 3 * Math.PI, rx = S * tt * Math.cos(tt), rz = S * tt * Math.sin(tt);
      out[0] = rx + ((u - 0.5) * WID - rx) * k; out[1] = h; out[2] = rz * (1 - k); return out;
    }
    var ca = new THREE.Color(COL.o), cb = new THREE.Color(COL.t), cc = new THREE.Color(COL.b);
    function hue(u, out) { return u < 0.5 ? out.copy(ca).lerp(cb, u * 2) : out.copy(cb).lerp(cc, u * 2 - 1); }
    // sheet surface + grid lines
    var sheet = new THREE.PlaneGeometry(1, 1, NU, NH), sp = sheet.attributes.position, scol = [], tmp = new THREE.Color(), i, j;
    for (i = 0; i < sp.count; i++) { hue(i % (NU + 1) / NU, tmp); scol.push(tmp.r, tmp.g, tmp.b); }
    sheet.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3));
    scene.add(new THREE.Mesh(sheet, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
    var lines = [], lcol = [];
    for (j = 0; j <= NH; j += 2) for (i = 0; i < NU; i++) lines.push([i / NU, j, (i + 1) / NU, j]);
    for (i = 0; i <= NU; i += 6) for (j = 0; j < NH; j++) lines.push([i / NU, j, i / NU, j + 1]);
    var lp = new Float32Array(lines.length * 6);
    lines.forEach(function (l) { hue(l[0], tmp); lcol.push(tmp.r, tmp.g, tmp.b); hue(l[2], tmp); lcol.push(tmp.r, tmp.g, tmp.b); });
    var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    var grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35 }));
    grid.frustumCulled = false; scene.add(grid);
    // data points
    var pts = [];
    for (i = 0; i < 220; i++) {
      var u = r(), h = (r() - 0.5) * 2 * HH, m = sphere(0.06, 0xffffff, 8);
      hue(u, m.material.color); m.userData = { u: u, h: h }; scene.add(m); pts.push(m);
    }
    var v3 = [0, 0, 0];
    return {
      update: function (t) {
        var T = t % 13, k = smooth((T - 2.5) / 3) * (1 - smooth((T - 9.5) / 2.5));
        for (i = 0; i < sp.count; i++) {
          var col = i % (NU + 1), row = Math.floor(i / (NU + 1));
          at(col / NU, HH - 2 * HH * row / NH, k, v3); sp.setXYZ(i, v3[0], v3[1], v3[2]);
        }
        sp.needsUpdate = true;
        lines.forEach(function (l, q) {
          at(l[0], HH - 2 * HH * l[1] / NH, k, v3); lp[q * 6] = v3[0]; lp[q * 6 + 1] = v3[1]; lp[q * 6 + 2] = v3[2];
          at(l[2], HH - 2 * HH * l[3] / NH, k, v3); lp[q * 6 + 3] = v3[0]; lp[q * 6 + 4] = v3[1]; lp[q * 6 + 5] = v3[2];
        });
        lg.attributes.position.needsUpdate = true;
        pts.forEach(function (m) { at(m.userData.u, m.userData.h, k, v3); m.position.set(v3[0], v3[1], v3[2]); });
        // Rolled: look down on the spiral from above. Unrolled: swing round to face the flat sheet.
        orbit(scene, camera, 3.2, (1 - k) * (0.5 + 0.6 * Math.sin(t * 0.25)), 0.95 - 0.8 * k, 0);
      },
      reset: function () {}   // pure function of t: restarting t (done by start) replays the unroll
    };
  };

  // 8. Causal inference: Pearl's sprinkler network as a garden. Season drives rain and the hose;
  //    either wets the grass; wet grass makes people slip. First we only WATCH (the gardener waters
  //    in the dry season), then we DO (set the hose by hand, whatever the weather). The P(slip)
  //    numbers in the panel are computed from the tables in M, not typed in.
  scenes.garden = function (scene, camera, canvas) {
    var M = { pDry: 0.5, hose: { dry: 0.7, rainy: 0.05 }, rain: { dry: 0.05, rainy: 0.9 }, wetHose: 0.6, wetRain: 0.9, leak: 0.02, slipWet: 0.5, slipDry: 0.02 };
    function pWet(h, rn) { return 1 - (1 - M.wetHose * h) * (1 - M.wetRain * rn) * (1 - M.leak); }
    function pSlip(h, rn) { var w = pWet(h, rn); return w * M.slipWet + (1 - w) * M.slipDry; }
    function seeSlip(h) {   // P(slip | hose = h): seeing the hose tells you the season, and so the rain
      var num = 0, den = 0;
      [['dry', M.pDry], ['rainy', 1 - M.pDry]].forEach(function (s) {
        var ph = h ? M.hose[s[0]] : 1 - M.hose[s[0]], pr = M.rain[s[0]];
        num += s[1] * ph * (pr * pSlip(h, 1) + (1 - pr) * pSlip(h, 0)); den += s[1] * ph;
      });
      return num / den;
    }
    function doSlip(h) {    // P(slip | do(hose = h)): the season keeps its own odds of rain
      var pr = M.pDry * M.rain.dry + (1 - M.pDry) * M.rain.rainy;
      return pr * pSlip(h, 1) + (1 - pr) * pSlip(h, 0);
    }
    function pct(x) { return Math.round(x * 100); }
    var P = { seeOn: seeSlip(1), seeOff: seeSlip(0), doOn: doSlip(1), doOff: doSlip(0) };

    // ---- HTML overlay: caption (top-left) and P(slip) panel (right) ----
    var el = overlay(canvas), PANEL_W = 198;
    var cap = el('div', CAPTION + 'max-width:52%;top:auto;bottom:7px;');
    var panel = el('div', 'position:absolute;right:7px;top:7px;bottom:7px;width:' + PANEL_W + 'px;box-sizing:border-box;padding:6px 10px;' +
      'background:rgba(20,22,26,0.84);border-radius:6px;font-size:12.5px;line-height:1.22;color:#cfd4dc;pointer-events:none;');
    el('div', 'font-weight:700;color:#fff;font-size:13.5px;margin-bottom:2px;', 'P(slip) on the lawn', panel);
    function head(title, sub, col) {
      el('div', 'margin-top:5px;font-weight:700;color:' + col + ';', title, panel);
      el('div', 'opacity:.62;font-size:11.5px;margin-bottom:1px;', sub, panel);
    }
    function row(label, col) {
      var rw = el('div', 'display:flex;align-items:center;gap:6px;margin:2px 0;', null, panel);
      el('span', 'width:58px;opacity:.85;white-space:nowrap;', label, rw);
      var track = el('span', 'position:relative;flex:0 0 74px;height:9px;background:#2b3038;border-radius:2px;overflow:hidden;', null, rw);
      var fill = el('span', 'position:absolute;left:0;top:0;bottom:0;width:0;border-radius:2px;background:' + col + ';', null, track);
      var val = el('span', 'width:30px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#fff;', '', rw);
      return { fill: fill, val: val };
    }
    function verdict() { return el('div', 'font-size:12px;opacity:0;transition:opacity .4s;margin-top:1px;', '', panel); }
    head('Watching', 'the hose follows the season', '#9ab4dd');
    var bSeeOn = row('hose on', '#7aa0e0'), bSeeOff = row('hose off', '#7aa0e0'), vSee = verdict();
    head('Doing &middot; do(hose)', 'set by hand, any weather', '#f0a868');
    var bDoOn = row('do(on)', '#f0a868'), bDoOff = row('do(off)', '#f0a868'), vDo = verdict();
    var dSee = pct(P.seeOn) - pct(P.seeOff), dDo = pct(P.doOn) - pct(P.doOff);
    function pts(d) { return (d >= 0 ? '+' : '') + d + (Math.abs(d) === 1 ? ' pt' : ' pts'); }
    vSee.innerHTML = 'hose effect <b style="color:#fff">' + pts(dSee) + '</b>' + (Math.abs(dSee) <= 3 ? ' — looks harmless' : '');
    vDo.innerHTML = 'hose effect <b style="color:#f0a868">' + pts(dDo) + '</b>' + (dDo - dSee >= 5 ? ' — it isn\'t' : '');
    function setBar(b, p, value) {
      var wd = (100 * p * value / 0.5).toFixed(1) + '%', tx = p > 0.995 ? pct(value) + '%' : '';
      if (wd !== b.wd) { b.fill.style.width = wd; b.wd = wd; }
      if (tx !== b.tx) { b.val.textContent = tx; b.tx = tx; }
    }

    // ---- timeline: [start, end, mode, rainy?, hose on?] ----
    var L = 28, SEGS = [
      [0, 6, 'see', 0, 1], [6, 12, 'see', 1, 0], [12, 13.2, 'switch', 0, 0],
      [13.2, 16.2, 'do', 0, 1], [16.2, 19.2, 'do', 0, 0], [19.2, 22.2, 'do', 1, 1], [22.2, 25.2, 'do', 1, 0], [25.2, 28, 'hold', 1, 0]
    ];
    function seg(T) { for (var k = 0; k < SEGS.length; k++) if (T < SEGS[k][1]) return SEGS[k]; return SEGS[SEGS.length - 1]; }
    var DO = '<span style="color:#f0a868;font-weight:700;">', SEE = '<span style="color:#9ab4dd;font-weight:700;">';
    function caption(s) {
      var season = s[3] ? 'rainy season' : 'dry season';
      if (s[2] === 'see') return SEE + 'Watching</span> &middot; ' + season + '<br><span style="opacity:.75">' +
        (s[3] ? 'it rains; the hose stays off' : 'the gardener runs the hose') + '</span>';
      if (s[2] === 'switch') return DO + 'Now intervene</span><br><span style="opacity:.75">set the hose by hand, whatever the weather</span>';
      if (s[2] === 'do') return DO + 'Doing</span> &middot; ' + season + '<br>' + DO + 'do(hose = ' + (s[4] ? 'on' : 'off') + ')</span>';
      return 'Same garden, same weather &mdash;<br><span style="opacity:.75">only the question changed</span>';
    }

    // ---- 3-D garden ----
    var LX = 2.6, LZ = 1.2, SPR = [0.9, -0.15], PATCH = 1.25, r = rng(3), i;
    var bgDry = new THREE.Color(0x241f19), bgWet = new THREE.Color(0x161a21);
    scene.background = bgDry.clone();
    var soil = new THREE.Mesh(new THREE.BoxGeometry(LX * 2, 0.12, LZ * 2), new THREE.MeshBasicMaterial({ color: 0x3a4d2c }));
    soil.position.y = -0.06; scene.add(soil);
    function patch(x, z) { var d = Math.hypot(x - SPR[0], z - SPR[1]); return 1 - smooth((d - PATCH * 0.75) / (PATCH * 0.35)); }
    // grass blades
    var NB = 1500, bp = [], bc = new Float32Array(NB * 6), blades = [];
    for (i = 0; i < NB; i++) {
      var x = (r() * 2 - 1) * LX * 0.98, z = (r() * 2 - 1) * LZ * 0.96, hgt = 0.04 + 0.06 * r();
      bp.push(x, 0, z, x + (r() - 0.5) * 0.05, hgt, z + (r() - 0.5) * 0.05); blades.push({ x: x, z: z, p: patch(x, z), tone: 0.85 + 0.3 * r() });
    }
    var bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bgeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    scene.add(new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ vertexColors: true })));
    // wet sheen (additive, so it only ever brightens)
    var sheen = new THREE.PlaneGeometry(LX * 2, LZ * 2, 52, 24); sheen.rotateX(-Math.PI / 2);
    var shc = new Float32Array(sheen.attributes.position.count * 3), shp = [];
    for (i = 0; i < sheen.attributes.position.count; i++) shp.push(patch(sheen.attributes.position.getX(i), sheen.attributes.position.getZ(i)));
    sheen.setAttribute('color', new THREE.BufferAttribute(shc, 3));
    var sheenMesh = new THREE.Mesh(sheen, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sheenMesh.position.y = 0.012; scene.add(sheenMesh);
    // sun and cloud
    var sun = new THREE.Group(), sunCore = sphere(0.26, COL.o, 20), sunGlow = sphere(0.46, COL.o, 20);
    sunGlow.material.transparent = true; sunCore.material.transparent = true;
    sun.add(sunCore); sun.add(sunGlow); sun.position.set(-1.5, 1.5, -1.1); scene.add(sun);
    var cloud = new THREE.Group(), puffs = [];
    [[-2.0, 0, 0.32], [-1.45, 0.12, 0.42], [-0.85, 0.02, 0.36], [-0.25, 0.14, 0.46], [0.4, 0.03, 0.38], [1.0, 0.13, 0.44], [1.65, 0, 0.34], [2.15, 0.06, 0.28]].forEach(function (c) {
      var p = sphere(c[2], 0x8f97a3, 16); p.material.transparent = true; p.position.set(c[0], c[1], (r() - 0.5) * 0.3); cloud.add(p); puffs.push(p);
    });
    cloud.position.set(0, 1.62, -0.8); scene.add(cloud);
    // rain streaks
    var NR = 260, rp = new Float32Array(NR * 6), drops = [];
    for (i = 0; i < NR; i++) drops.push({ x: (r() * 2 - 1) * LX, z: (r() * 2 - 1) * LZ, y: r() * 1.55, v: 3.8 + r() * 1.2 });
    var rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    var rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0x9ab8ec, transparent: true, opacity: 0 }));
    rain.frustumCulled = false; scene.add(rain);
    // sprinkler, hose, tap
    var grey = 0x9aa0aa;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 10), new THREE.MeshBasicMaterial({ color: grey }));
    post.position.set(SPR[0], 0.09, SPR[1]); scene.add(post);
    var sprinklerHead = sphere(0.055, 0xc9ced6, 12); sprinklerHead.position.set(SPR[0], 0.19, SPR[1]); scene.add(sprinklerHead);
    var hoseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.7, 0.2, -1.12), new THREE.Vector3(-2.6, 0.03, -1.0), new THREE.Vector3(-1.5, 0.03, -0.98), new THREE.Vector3(-0.2, 0.03, -0.7), new THREE.Vector3(SPR[0] - 0.05, 0.03, SPR[1] - 0.05)]);
    var hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 60, 0.024, 6), new THREE.MeshBasicMaterial({ color: 0x5f8f5a }));
    scene.add(hose);
    var tap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), new THREE.MeshBasicMaterial({ color: grey }));
    tap.position.set(-2.78, 0.21, -1.15); scene.add(tap);
    var tapRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32), new THREE.MeshBasicMaterial({ color: COL.o, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    tapRing.rotation.x = -Math.PI / 2; tapRing.position.set(-2.78, 0.02, -1.15); scene.add(tapRing);
    // spray droplets: parabolic arcs landing inside the patch
    var NS = 170, spp = new Float32Array(NS * 3), spray = [], FLY = 0.75, G = 6;
    for (i = 0; i < NS; i++) spray.push({ born: -10, ang: 0, rad: 0 });
    var sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spp, 3));
    var sprayPts = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: COL.t, size: 0.05, transparent: true, opacity: 0.95 }));
    sprayPts.frustumCulled = false; scene.add(sprayPts);
    // walkers
    var WZ = 0.72, walkers = [];
    function makeWalker() {
      var g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xdfe3ea, transparent: true });
      var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), mat); body.position.y = 0.4; g.add(body);
      var hd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mat); hd.position.y = 0.63; g.add(hd);
      var legs = [0, 1].map(function (q) {
        var pv = new THREE.Group(); pv.position.set(0, 0.27, q ? 0.04 : -0.04);
        var lg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.27, 0.04), mat); lg.position.y = -0.135; pv.add(lg); g.add(pv); return pv;
      });
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 28), new THREE.MeshBasicMaterial({ color: COL.o, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      g.visible = false; scene.add(g);
      return { g: g, mat: mat, legs: legs, ring: ring, active: false };
    }
    for (i = 0; i < 3; i++) walkers.push(makeWalker());
    // Walkers start on fixed 2.3 s slots, so the same loop plays out the same way on any machine.
    // Every other walker is unsteady; an unsteady walker slips only where the grass under its feet is
    // wet at that moment, so a slip can never appear on dry grass or under the wrong caption.
    var SLOT = 2.3, WALK = 1.5, lastSlot = -1, state = { hoseWet: 0, rainWet: 0, rainAmt: 0, rainyS: 0 }, prevT = 0;
    // Hose water only counts while the hose is on, so the caption and the slips always agree.
    // One wetness model for grass colour, sheen and slips. p = how far inside the hose patch (0..1).
    // countHose=false is used for slips: hose water only counts while the hose is on, so caption and slips agree.
    function wet(p, countHose) { return 1 - (1 - (countHose ? state.hoseWet * p : 0)) * (1 - state.rainWet); }
    function spawn(T, n) {
      var w = walkers.filter(function (q) { return !q.active; })[0]; if (!w) return;
      w.active = true; w.x = -LX - 0.3; w.t0 = T; w.unsteady = n % 2 === 0; var g = rng(Math.imul(n + 1, 2654435761)); g(); w.slipFrom = -2.0 + 3.2 * g(); w.slipT = null; w.slipX = 0;
      w.g.visible = true; w.mat.opacity = 1; w.g.rotation.set(0, 0, 0); w.g.position.set(w.x, 0, WZ); w.ring.material.opacity = 0;
    }
    function clearAll() {
      walkers.forEach(function (w) { w.active = false; w.g.visible = false; w.ring.material.opacity = 0; });
      spray.forEach(function (d) { d.born = -10; });
      state.hoseWet = state.rainWet = state.rainAmt = state.rainyS = 0; lastSlot = -1;
    }
    function approach(v, target, up, down, dt) { return v + (target - v) * Math.min(1, (target > v ? up : down) * dt); }
    var dryG = new THREE.Color(0x88a64c), wetG = new THREE.Color(0x2c8a82), tmp = new THREE.Color(), sheenC = new THREE.Color(COL.b);
    var lastCap = '', lastHW = -1, lastRW = -1;
    return {
      reset: function () { clearAll(); lastHW = -1; },
      update: function (t, dt) {
        var T = t % L, s = seg(T);
        if (T < prevT) lastSlot = -1;
        prevT = T;
        var hoseOn = !!s[4], raining = s[3];
        state.rainyS = approach(state.rainyS, raining, 1.4, 1.4, dt);
        state.rainAmt = approach(state.rainAmt, raining, 2.0, 2.5, dt);
        state.rainWet = approach(state.rainWet, raining, 1.2, 0.9, dt);
        state.hoseWet = approach(state.hoseWet, hoseOn ? 1 : 0, 1.6, 2.2, dt);
        var html = caption(s); if (html !== lastCap) { cap.innerHTML = html; lastCap = html; }
        // panel bars fill as each condition is actually observed / run
        setBar(bSeeOn, smooth((T - 0.8) / 2.4), P.seeOn);
        setBar(bSeeOff, smooth((T - 6.8) / 2.4), P.seeOff);
        setBar(bDoOn, 0.5 * smooth((T - 13.7) / 2) + 0.5 * smooth((T - 19.7) / 2), P.doOn);
        setBar(bDoOff, 0.5 * smooth((T - 16.7) / 2) + 0.5 * smooth((T - 22.7) / 2), P.doOff);
        var os = T > 10 ? '1' : '0', od = T > 25.4 ? '1' : '0';
        if (vSee.style.opacity !== os) vSee.style.opacity = os;
        if (vDo.style.opacity !== od) vDo.style.opacity = od;
        // sky, sun, cloud
        scene.background.copy(bgDry).lerp(bgWet, state.rainyS);
        sunCore.material.opacity = 1 - state.rainyS; sunGlow.material.opacity = 0.16 * (1 - state.rainyS);
        sun.position.y = 1.5 + 0.25 * state.rainyS; sunGlow.scale.setScalar(1 + 0.06 * Math.sin(t * 3));
        puffs.forEach(function (p) { p.material.opacity = 0.92 * state.rainyS; });
        cloud.position.x = (1 - state.rainyS) * -0.8;
        // rain
        for (i = 0; i < NR; i++) {
          var d = drops[i]; d.y -= d.v * dt; if (d.y < 0) { d.y += 1.55; d.x = (r() * 2 - 1) * LX; d.z = (r() * 2 - 1) * LZ; }
          var o = i * 6; rp[o] = d.x; rp[o + 1] = d.y; rp[o + 2] = d.z; rp[o + 3] = d.x + 0.03; rp[o + 4] = d.y + 0.17; rp[o + 5] = d.z;
        }
        rgeo.attributes.position.needsUpdate = true; rain.material.opacity = 0.75 * state.rainAmt;
        // spray
        var spin = t * 1.7, emit = hoseOn ? 230 : 0, k = 0, sp;
        for (i = 0; i < NS && emit; i++) {
          sp = spray[i];
          if (t - sp.born > FLY && r() < emit * dt / NS * 4) { sp.born = t; sp.ang = spin + (r() - 0.5) * 1.4 + (r() < 0.5 ? 0 : Math.PI); sp.rad = PATCH * (0.25 + 0.75 * Math.sqrt(r())); }
        }
        var vy = (0.5 * G * FLY * FLY - 0.19) / FLY;
        for (i = 0; i < NS; i++) {
          sp = spray[i]; var tau = t - sp.born;
          if (tau >= 0 && tau < FLY) {
            var f = tau / FLY; spp[k * 3] = SPR[0] + Math.cos(sp.ang) * sp.rad * f; spp[k * 3 + 1] = 0.19 + vy * tau - 0.5 * G * tau * tau; spp[k * 3 + 2] = SPR[1] + Math.sin(sp.ang) * sp.rad * f; k++;
          }
        }
        sgeo.setDrawRange(0, k); sgeo.attributes.position.needsUpdate = true;
        // the intervention: tap and hose glow orange while the hose is being set by hand
        var forced = s[2] === 'do' ? 1 : 0;
        tap.material.color.setHex(forced ? COL.o : grey); hose.material.color.setHex(forced ? 0xc98b55 : 0x5f8f5a);
        tapRing.material.opacity = forced * (0.55 + 0.35 * Math.sin(t * 5)); tapRing.scale.setScalar(1 + 0.25 * Math.sin(t * 5));
        // grass colour and sheen follow wetness: rain everywhere, hose only inside its patch
        if (Math.abs(state.hoseWet - lastHW) + Math.abs(state.rainWet - lastRW) > 0.002 || lastHW < 0) {
          lastHW = state.hoseWet; lastRW = state.rainWet;
          var avgW = 0;
          for (i = 0; i < NB; i++) {
            var b = blades[i], w = wet(b.p, true), o6 = i * 6; avgW += w;
            tmp.copy(dryG).lerp(wetG, w).multiplyScalar(b.tone);
            bc[o6] = tmp.r * 0.55; bc[o6 + 1] = tmp.g * 0.55; bc[o6 + 2] = tmp.b * 0.55; bc[o6 + 3] = tmp.r; bc[o6 + 4] = tmp.g; bc[o6 + 5] = tmp.b;
          }
          bgeo.attributes.color.needsUpdate = true;
          soil.material.color.setHex(0x3a4d2c).lerp(tmp.setHex(0x1f3a3c), avgW / NB);
        }
        for (i = 0; i < shp.length; i++) {
          var ww = wet(shp[i], true), glint = ww * (0.22 + 0.06 * Math.sin(t * 2 + i * 0.37));
          shc[i * 3] = sheenC.r * glint; shc[i * 3 + 1] = sheenC.g * glint; shc[i * 3 + 2] = sheenC.b * glint;
        }
        sheen.attributes.color.needsUpdate = true;
        // walkers: wet grass means about half of them go down
        var slot = Math.floor(T / SLOT);
        if (slot !== lastSlot) { lastSlot = slot; if (s[2] !== 'hold') spawn(T, slot); }
        walkers.forEach(function (w) {
          if (!w.active) return;
          if (w.slipT === null) {
            w.x += WALK * dt;
            var ph = (T - w.t0) * 10;
            w.legs[0].rotation.z = Math.sin(ph) * 0.5; w.legs[1].rotation.z = -Math.sin(ph) * 0.5;
            w.g.position.set(w.x, 0, WZ);
            if (w.unsteady && w.x >= w.slipFrom && wet(patch(w.x, WZ), hoseOn) > 0.6) { w.slipT = T; w.slipX = w.x; w.ring.position.set(w.x, 0.02, WZ); }
            if (w.x > LX + 0.4) { w.active = false; w.g.visible = false; }
          } else {
            var e = smooth((T - w.slipT) / 0.4), fade = 1 - smooth((T - w.slipT - 1.3) / 0.5);
            w.g.rotation.z = e * Math.PI * 0.47;
            w.legs[0].rotation.z = w.legs[1].rotation.z = 0.9 * e;
            w.g.position.set(w.slipX + 0.35 * e, 0.07 * e, WZ);
            w.mat.opacity = fade;
            var rt = (T - w.slipT) / 0.9;
            w.ring.material.opacity = rt < 1 ? 0.9 * (1 - rt) : 0; w.ring.scale.setScalar(1 + 3 * Math.min(1, rt));
            if (fade <= 0) { w.active = false; w.g.visible = false; }
          }
        });
        // frame the garden in the part of the canvas the panel doesn't cover
        var cw = canvas.clientWidth || 1, frac = (PANEL_W + 10) / cw, el2 = 0.6, H = 1.7;
        var dist = H / Math.tan(camera.fov * Math.PI / 360), shift = frac * dist * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
        camera.position.set(shift, 0.7 + Math.sin(el2) * dist, 0.2 + Math.cos(el2) * dist);
        camera.lookAt(shift, 0.7, 0.2);
      }
    };
  };

  // 9. System 1 / System 2: a crystal of knowledge. Familiar questions flash straight through it
  //    (System 1: one fast pass of inference). A novel question has nowhere to go, so the crystal
  //    slowly grows towards it (System 2: learning). Once grown, that question flashes through too.
  scenes.crystal = function (scene, camera, canvas) {
    fog(scene);
    var el = overlay(canvas), cap = el('div', CAPTION + 'max-width:80%;'), lastCap = '';
    var SP = 0.36, group = new THREE.Group(), r = rng(13), DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    scene.add(group);
    var MAXE = 1200, epos = new Float32Array(MAXE * 6), ecol = new Float32Array(MAXE * 6);
    var eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(epos, 3)); eg.setAttribute('color', new THREE.BufferAttribute(ecol, 3));
    var elines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true }));
    elines.frustumCulled = false; group.add(elines);
    var nodeGeo = new THREE.SphereGeometry(0.06, 10, 10), nodes, index, adj, edges;
    var baseN = new THREE.Color(0x7396d0), baseE = new THREE.Color(0x44587c), fresh = new THREE.Color(COL.t), tmp = new THREE.Color();
    function key(c) { return c.join(','); }
    function addNode(c, born) {
      var m = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: baseN }));
      m.position.set(c[0] * SP, c[1] * SP, c[2] * SP); group.add(m);
      var n = { c: c, m: m, born: born, id: nodes.length };
      nodes.push(n); index[key(c)] = n; adj.push([]);
      DIRS.forEach(function (d) {
        var o = index[key([c[0] + d[0], c[1] + d[1], c[2] + d[2]])];
        if (o && edges.length < MAXE) { edges.push({ a: n, b: o, born: born }); adj[n.id].push(o.id); adj[o.id].push(n.id); }
      });
      return n;
    }
    function build() {
      if (nodes) nodes.forEach(function (n) { group.remove(n.m); n.m.material.dispose(); });
      nodes = []; index = {}; adj = []; edges = [];
      for (var x = -5; x <= 5; x++) for (var y = -3; y <= 3; y++) for (var z = -3; z <= 3; z++) {
        var q = (x / 4.4) * (x / 4.4) + (y / 3.0) * (y / 3.0) + (z / 2.4) * (z / 2.4);
        if (q <= 1 - 0.12 * r()) addNode([x, y, z], null);
      }
    }
    function surface(sign) {   // nodes on the left (-1) or right (+1) face of the original crystal
      var best = {};
      nodes.forEach(function (n) {
        if (n.born !== null) return;
        var k2 = n.c[1] + ',' + n.c[2], b = best[k2];
        if (!b || sign * n.c[0] > sign * b.c[0]) best[k2] = n;
      });
      return Object.keys(best).map(function (k2) { return best[k2]; }).filter(function (n) { return Math.abs(n.c[1]) <= 1 && Math.abs(n.c[2]) <= 1; });
    }
    function bfs(a, b) {
      var prev = {}, seen = {}, q = [a.id]; seen[a.id] = 1;
      while (q.length) {
        var u = q.shift(); if (u === b.id) break;
        var nb = adj[u].slice().sort(function () { return r() - 0.5; });
        nb.forEach(function (v) { if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); } });
      }
      if (!seen[b.id]) return null;
      var path = [], cur = b.id;
      while (cur !== undefined) { path.unshift(nodes[cur]); cur = prev[cur]; }
      return path;
    }
    // sparks: a query travelling a polyline, leaving a glowing wake
    var sparks = [], near = [];
    // Sparks come and go every second, so they share geometry and materials instead of leaking them.
    var sparkGeo = new THREE.SphereGeometry(0.085, 12, 12), sparkHaloGeo = new THREE.SphereGeometry(0.17, 12, 12);
    var sparkMat = new THREE.MeshBasicMaterial({ color: COL.o }), sparkHaloMat = new THREE.MeshBasicMaterial({ color: COL.o, transparent: true, opacity: 0.3 });
    var novelGeo = new THREE.SphereGeometry(0.09, 12, 12), novelHaloGeo = new THREE.SphereGeometry(0.2, 12, 12);
    var novelMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), novelHaloMat = new THREE.MeshBasicMaterial({ color: COL.t, transparent: true, opacity: 0.35 });
    function spark(points, dur, color) {
      var m = new THREE.Mesh(sparkGeo, sparkMat), halo = new THREE.Mesh(sparkHaloGeo, sparkHaloMat);
      m.add(halo); group.add(m);
      var lg = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0 }));
      line.frustumCulled = false; group.add(line);
      var lens = [0]; for (var k = 1; k < points.length; k++) lens.push(lens[k - 1] + points[k].distanceTo(points[k - 1]));
      sparks.push({ m: m, line: line, pts: points, lens: lens, t0: now, dur: dur });
    }
    function dropSpark(s) {
      group.remove(s.m); group.remove(s.line); s.line.geometry.dispose(); s.line.material.dispose();
    }
    function along(s, f, out) {
      var d = f * s.lens[s.lens.length - 1], k = 1;
      while (k < s.lens.length - 1 && s.lens[k] < d) k++;
      var a = s.pts[k - 1], b = s.pts[k], seg = s.lens[k] - s.lens[k - 1] || 1;
      return out.copy(a).lerp(b, (d - s.lens[k - 1]) / seg);
    }
    function pos(n) { return n.m.position.clone(); }
    function familiar(forceExit) {
      var ins = surface(-1), outs = surface(1), a = ins[Math.floor(r() * ins.length)], b = forceExit || outs[Math.floor(r() * outs.length)];
      var path = bfs(a, b); if (!path) return;
      var pts = [pos(a).add(new THREE.Vector3(-1.0, 0, 0))].concat(path.map(pos));
      var out = forceExit ? pos(b).normalize().multiplyScalar(1.0) : new THREE.Vector3(1.0, 0, 0);
      pts.push(pos(b).add(out));
      spark(pts, 0.75, COL.o);
    }
    // novel question: where it sits, and the lattice cells that learning will add to reach it
    var TARGETS = [[7, 2, 0], [-7, -2, 1], [2, 5, -1]], loop = -1, novel = null, plan = null, probes = [];
    for (var pi = 0; pi < 3; pi++) {
      var pl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: COL.t, transparent: true, opacity: 0 }));
      pl.frustumCulled = false; group.add(pl); probes.push(pl);
    }
    function planGrowth(T) {
      var best = null, bd = 1e9;
      nodes.forEach(function (n) { var d = Math.hypot(n.c[0] - T[0], n.c[1] - T[1], n.c[2] - T[2]); if (d < bd) { bd = d; best = n; } });
      var cur = best.c.slice(), cells = [], seen = {};
      while (cur[0] !== T[0] || cur[1] !== T[1] || cur[2] !== T[2]) {
        var ax = 0; for (var k = 1; k < 3; k++) if (Math.abs(T[k] - cur[k]) > Math.abs(T[ax] - cur[ax])) ax = k;
        cur[ax] += Math.sign(T[ax] - cur[ax]); cells.push(cur.slice()); seen[key(cur)] = 1;
        if (r() < 0.55) {
          var d = DIRS[Math.floor(r() * 6)], sc = [cur[0] + d[0], cur[1] + d[1], cur[2] + d[2]];
          if (!index[key(sc)] && !seen[key(sc)] && d[ax] === 0) { cells.push(sc); seen[key(sc)] = 1; }
        }
      }
      var tp = new THREE.Vector3(T[0] * SP, T[1] * SP, T[2] * SP);
      return { cells: cells, done: 0, target: T, tp: tp, outward: tp.clone().normalize() };
    }
    var now = 0, LOOP = 15, fired = {}, EARLY = [0.3, 1.2, 2.1, 3.0, 3.9], LATE = [11.7, 12.6, 13.5];
    function once(k, fn) { if (!fired[k]) { fired[k] = 1; fn(); } }
    function dropNovel() { if (novel) { group.remove(novel.m); novel = null; } }
    function start() { build(); sparks.forEach(dropSpark); sparks = []; loop = -1; dropNovel(); plan = null; fired = {}; }
    start();
    return {
      reset: start,
      update: function (t) {
        now = t;
        var L = Math.floor(t / LOOP), tau = t % LOOP, text;
        if (L !== loop || !plan) {
          loop = L; fired = {};
          if (L > 0 && L % 3 === 0) build();
          dropNovel(); plan = planGrowth(TARGETS[L % 3]);
        }
        for (var ka = 0; ka < EARLY.length; ka++) if (tau > EARLY[ka] && !fired['a' + ka]) { fired['a' + ka] = 1; familiar(); }
        var tgt = plan.target, tp = plan.tp, outward = plan.outward;
        if (tau > 4.6) once('novel', function () {
          var m = new THREE.Mesh(novelGeo, novelMat), halo = new THREE.Mesh(novelHaloGeo, novelHaloMat);
          m.add(halo); group.add(m); novel = { m: m, halo: halo, from: tp.clone().add(outward.clone().multiplyScalar(1.2)) };
        });
        if (novel) {
          var arrive = smooth((tau - 4.6) / 0.9), gone = tau > 10.7;
          novel.m.visible = !gone;
          novel.m.position.copy(novel.from).lerp(tp, arrive);
          novel.halo.scale.setScalar(1 + 0.35 * Math.sin(t * 6));
        }
        // System 2: grow the lattice towards the novel question, one cell at a time
        var growing = tau > 5.6 && tau < 10.6;
        if (growing) {
          var want = Math.min(plan.cells.length, Math.floor((tau - 5.6) / 4.6 * plan.cells.length) + 1);
          while (plan.done < want) { var c = plan.cells[plan.done++]; if (!index[key(c)]) addNode(c, t); }
        }
        near.length = 0;
        if (growing) nodes.forEach(function (n) {   // keep the three nearest, no sort
          var d = n.m.position.distanceToSquared(tp), k = near.length;
          if (k < 3 || d < near[k - 1].d) { if (k === 3) near.pop(); near.push({ n: n, d: d }); near.sort(function (a, b) { return a.d - b.d; }); }
        });
        probes.forEach(function (p, k) {
          var on = growing && near[k] && near[k].d > 1e-4, q = on && near[k].n.m.position;
          p.material.opacity = on ? 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * 37 + k * 2.1)) : 0;
          if (on) { var a = p.geometry.attributes.position; a.setXYZ(0, tp.x, tp.y, tp.z); a.setXYZ(1, q.x, q.y, q.z); a.needsUpdate = true; }
        });
        if (tau > 10.7) once('learned', function () {
          var tn = index[key(tgt)], ins = surface(-1), a = ins[Math.floor(r() * ins.length)], path = tn && bfs(a, tn);
          if (path) spark([pos(a).add(new THREE.Vector3(-1.0, 0, 0))].concat(path.map(pos)).concat([tp.clone().add(outward.clone().multiplyScalar(1.0))]), 0.75, COL.o);
        });
        for (var kb = 0; kb < LATE.length; kb++) if (tau > LATE[kb] && !fired['b' + kb]) { fired['b' + kb] = 1; familiar(kb === 1 ? index[key(tgt)] : null); }
        // captions
        if (tau < 4.6) text = '<b style="color:#f0a868">System 1</b> &middot; inference: one fast pass through what is known';
        else if (tau < 5.6) text = 'A new kind of question &mdash; nothing to recall';
        else if (tau < 10.7) text = '<b style="color:#63b3a6">System 2</b> &middot; learning: slow, effortful growth';
        else if (tau < 11.7) text = 'Learned &mdash; now it is <b style="color:#f0a868">System 1</b>';
        else text = '<b style="color:#f0a868">System 1</b> &middot; the crystal is bigger now';
        if (text !== lastCap) { cap.innerHTML = text; lastCap = text; }
        // sparks
        sparks = sparks.filter(function (s) {
          var f = (t - s.t0) / s.dur;
          if (f < 1) { along(s, f, s.m.position); s.line.material.opacity = 0.85; return true; }
          s.m.visible = false; s.line.material.opacity = 0.85 * (1 - smooth((f - 1) / 1.1));
          if (f > 2.1) { dropSpark(s); return false; }
          return true;
        });
        // colours: freshly grown cells glow teal, then cool into the crystal
        nodes.forEach(function (n) {
          var age = n.born === null ? 99 : t - n.born, g = 1 - smooth((age - 1.5) / 3);
          n.m.material.color.copy(baseN).lerp(fresh, g);
          n.m.scale.setScalar(Math.min(1, age / 0.35) * (1 + 0.5 * g));
        });
        edges.forEach(function (e, k) {
          var age = e.born === null ? 99 : t - e.born, g = 1 - smooth((age - 1.5) / 3), grow = Math.min(1, age / 0.35);
          var a = e.a.m.position, b = e.b.m.position;
          var o = k * 6;
          epos[o] = b.x + (a.x - b.x) * grow; epos[o + 1] = b.y + (a.y - b.y) * grow; epos[o + 2] = b.z + (a.z - b.z) * grow;
          epos[o + 3] = b.x; epos[o + 4] = b.y; epos[o + 5] = b.z;
          tmp.copy(baseE).lerp(fresh, g);
          ecol[o] = ecol[o + 3] = tmp.r; ecol[o + 1] = ecol[o + 4] = tmp.g; ecol[o + 2] = ecol[o + 5] = tmp.b;
        });
        eg.setDrawRange(0, edges.length * 2);
        eg.attributes.position.needsUpdate = true; eg.attributes.color.needsUpdate = true;
        group.rotation.y = Math.sin(t * 0.22) * 0.45;
        orbit(scene, camera, 1.95, 0, 0.36, 0.05);
      }
    };
  };

  function start(canvas) {
    var make = scenes[canvas.dataset.scene];
    if (!make || typeof THREE === 'undefined') return;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    var api = make(scene, camera, canvas), sec = canvas.closest('section'), last = performance.now(), t = 0, lw = 0, lh = 0, shown = false;
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.max(0, Math.min((now - last) / 1000, 0.1)); last = now;   // rAF time can precede boot time
      if (!sec || !sec.classList.contains('present')) { shown = false; return; }
      if (!shown) { shown = true; if (api.reset && t > 0) { api.reset(); t = 0; } }
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (w !== lw || h !== lh) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); lw = w; lh = h; }
      t += dt; api.update(t, dt); renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('canvas.viz3d'), start); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
