// Live three.js visuals for the deck. Each <canvas class="viz3d" data-scene="..."> runs
// only while its slide is the current one (section.present), so hidden slides cost nothing.
(function () {
  var COL = { o: 0xf0a868, t: 0x63b3a6, b: 0x7aa0e0, g: 0x8b919a, d: 0x3a3f48 };

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function sphere(r, color, seg) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, seg || 14, seg || 14), new THREE.MeshBasicMaterial({ color: color }));
  }

  var scenes = {};

  // 1. Connectionists: signals pulsing forward through a small layered network.
  scenes.network = function (scene, camera) {
    camera.position.set(0, 0.5, 7.6); camera.lookAt(0, 0, 0);
    var layers = [4, 6, 6, 3], r = rng(7), group = new THREE.Group(), nodes = [], i, l;
    scene.add(group);
    layers.forEach(function (n, li) {
      for (i = 0; i < n; i++) {
        var m = sphere(0.15, COL.d);
        m.position.set((li - 1.5) * 2.3, (i - (n - 1) / 2) * 0.72, (r() - 0.5) * 1.6);
        m.userData = { layer: li, w: 0.5 + 0.5 * r() };
        group.add(m); nodes.push(m);
      }
    });
    var pos = [], col = [], edges = [];
    nodes.forEach(function (a) {
      nodes.forEach(function (b) {
        if (b.userData.layer === a.userData.layer + 1) {
          pos.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
          col.push(0, 0, 0, 0, 0, 0); edges.push([a, b]);
        }
      });
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })));
    var dim = new THREE.Color(COL.d), hot = new THREE.Color(COL.o), tmp = new THREE.Color();
    function act(node, p) { return Math.max(0, 1 - Math.abs(p - node.userData.layer) * 0.9) * node.userData.w; }
    return {
      update: function (t) {
        var p = (t * 0.9) % (layers.length + 1.5), c = g.attributes.color, k = 0;
        group.rotation.y = Math.sin(t * 0.35) * 0.55;
        nodes.forEach(function (n) { n.material.color.copy(dim).lerp(hot, act(n, p)); n.scale.setScalar(1 + 0.5 * act(n, p)); });
        edges.forEach(function (e) {
          tmp.setRGB(0.18, 0.2, 0.24).lerp(hot, Math.min(1, act(e[0], p) * 0.6 + act(e[1], p) * 0.6));
          c.setXYZ(k++, tmp.r, tmp.g, tmp.b); c.setXYZ(k++, tmp.r, tmp.g, tmp.b);
        });
        c.needsUpdate = true;
      }
    };
  };

  // 2. Evolutionaries: a population climbing a fitness landscape by selection + crossover + mutation.
  scenes.landscape = function (scene, camera) {
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
      var u = Math.max(0, Math.min(1, h / 1.8));
      c.copy(lo).lerp(mid, Math.min(1, u * 2)).lerp(hi, Math.max(0, u * 2 - 1));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 })));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.35 })));

    var P = 22, GEN = 1.25, MOVE = 0.9, r = rng(11), pop = [], meshes = [], gen = 0, gt = 0;
    for (i = 0; i < P; i++) { var m = sphere(0.085, 0xffffff, 10); m.material.color.setHex(COL.o); scene.add(m); meshes.push(m); }
    function reset() {
      pop = []; gen = 0;
      for (i = 0; i < P; i++) { var x = (r() - 0.5) * 5.6, z = (r() - 0.5) * 5.6; pop.push({ fx: x, fz: z, x: x, z: z }); }
    }
    function nextGen(t) {
      var ranked = pop.slice().sort(function (a, b) { return height(b.x, b.z) - height(a.x, a.z); });
      var parents = ranked.slice(0, P / 2), next = [];
      for (i = 0; i < P; i++) {
        var a = i < 4 ? ranked[i] : parents[Math.floor(r() * parents.length)], b = parents[Math.floor(r() * parents.length)];
        var x = i < 4 ? a.x : (a.x + b.x) / 2 + gauss(r) * 0.3, z = i < 4 ? a.z : (a.z + b.z) / 2 + gauss(r) * 0.3;
        next.push({ fx: a.x, fz: a.z, x: Math.max(-2.9, Math.min(2.9, x)), z: Math.max(-2.9, Math.min(2.9, z)) });
      }
      pop = next; gen++; gt = t;
    }
    reset();
    return {
      update: function (t) {
        if (t - gt > GEN) { if (gen >= 12) { reset(); } else { nextGen(t); } if (gen === 0) gt = t; }
        var e = smooth((t - gt) / MOVE);
        pop.forEach(function (p, k) {
          var x = p.fx + (p.x - p.fx) * e, z = p.fz + (p.z - p.fz) * e;
          meshes[k].position.set(x, height(x, z) + 0.1, z);
        });
        var a = t * 0.18;
        camera.position.set(Math.sin(a) * 7.2, 4.6, Math.cos(a) * 7.2); camera.lookAt(0, 0.2, 0);
      }
    };
  };

  // 3. Analogizers: the kernel trick. Lift tangled 2-D points into 3-D, where a plane separates them.
  scenes.kernel = function (scene, camera) {
    var r = rng(21), pts = [], i, K = 0.36;
    for (i = 0; i < 150; i++) {
      var inner = i < 55, ang = r() * Math.PI * 2, rad = inner ? Math.sqrt(r()) * 0.95 : 1.75 + r() * 0.8;
      var m = sphere(0.075, inner ? COL.t : COL.o, 10);
      m.userData = { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, r2: rad * rad };
      scene.add(m); pts.push(m);
    }
    var grid = new THREE.GridHelper(6, 12, 0x555a63, 0x33373e); scene.add(grid);
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ color: COL.b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = 0.68; scene.add(plane);
    var ring = new THREE.Mesh(new THREE.RingGeometry(1.34, 1.38, 64), new THREE.MeshBasicMaterial({ color: COL.b, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    return {
      update: function (t) {
        var T = t % 11, s = smooth((T - 2) / 2.4) * (1 - smooth((T - 8) / 2.4));
        pts.forEach(function (m) { m.position.set(m.userData.x, K * m.userData.r2 * s, m.userData.z); });
        plane.material.opacity = 0.28 * smooth((s - 0.85) / 0.15);
        ring.material.opacity = 0.9 * smooth((s - 0.85) / 0.15);
        var a = 0.7 + t * 0.14;
        camera.position.set(Math.sin(a) * 7.4, 3.8 + s * 0.8, Math.cos(a) * 7.4); camera.lookAt(0, 0.5 * s, 0);
      }
    };
  };

  // 4. Unsupervised learning: real k-means on a 3-D point cloud, one assign/update step at a time.
  scenes.cluster = function (scene, camera) {
    camera.position.set(0, 1.5, 7); camera.lookAt(0, 0, 0);
    var group = new THREE.Group(), r = rng(5), data = [], pts = [], cents = [], i, j;
    scene.add(group);
    var centres = [[-1.7, 0.6, 0.2], [1.6, 1.0, -0.8], [0.1, -1.5, 1.0]], palette = [COL.o, COL.t, COL.b];
    centres.forEach(function (c) {
      for (i = 0; i < 34; i++) {
        var p = [c[0] + gauss(r) * 0.5, c[1] + gauss(r) * 0.5, c[2] + gauss(r) * 0.5];
        data.push(p); var m = sphere(0.075, COL.g, 10); m.position.set(p[0], p[1], p[2]); group.add(m); pts.push(m);
      }
    });
    for (j = 0; j < 3; j++) {
      var o = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: palette[j] }));
      var w = new THREE.Mesh(new THREE.OctahedronGeometry(0.23), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
      o.add(w); group.add(o); cents.push({ mesh: o, pos: [0, 0, 0], tgt: [0, 0, 0] });
    }
    var assign = data.map(function () { return -1; }), phase = 0, last = 0, STEP = 1.1;
    function init() {
      var used = [];
      for (j = 0; j < 3; j++) {
        var ix; do { ix = Math.floor(r() * data.length); } while (used.indexOf(ix) >= 0);
        used.push(ix); cents[j].pos = data[ix].slice(); cents[j].tgt = data[ix].slice();
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
          if (n) c.tgt = [s[0] / n, s[1] / n, s[2] / n];
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
        });
        group.rotation.y = t * 0.25;
      }
    };
  };

  // 5. Supervised learning: gradient descent, three models sliding down an error surface.
  scenes.descent = function (scene, camera) {
    function f(x, z) { return 0.07 * (x * x + z * z) + 0.5 * Math.sin(1.5 * x) * Math.cos(1.5 * z); }
    var N = 44, geo = new THREE.PlaneGeometry(6, 6, N, N), pa = geo.attributes.position, colors = [], i;
    geo.rotateX(-Math.PI / 2);
    var lo = new THREE.Color(COL.t), hi = new THREE.Color(COL.b), c = new THREE.Color();
    for (i = 0; i < pa.count; i++) {
      var h = f(pa.getX(i), pa.getZ(i)); pa.setY(i, h);
      c.copy(lo).lerp(hi, Math.max(0, Math.min(1, (h + 0.6) / 2.0))); colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4 })));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.3 })));
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
            var e = 0.01, gx = (f(b.x + e, b.z) - f(b.x - e, b.z)) / (2 * e), gz = (f(b.x, b.z + e) - f(b.x, b.z - e)) / (2 * e);
            b.x = Math.max(-2.95, Math.min(2.95, b.x - LR * gx * 3)); b.z = Math.max(-2.95, Math.min(2.95, b.z - LR * gz * 3));
            if (b.n < MAXP) { var a = b.tg.attributes.position; a.setXYZ(b.n, b.x, f(b.x, b.z) + 0.1, b.z); a.needsUpdate = true; b.n++; b.tg.setDrawRange(0, b.n); }
          });
        }
        balls.forEach(function (b) { b.m.position.set(b.x, f(b.x, b.z) + 0.12, b.z); });
        if (since > 11) { since = 0; reset(); }
        var a2 = t * 0.16;
        camera.position.set(Math.sin(a2) * 7.4, 4.8, Math.cos(a2) * 7.4); camera.lookAt(0, 0.2, 0);
      }
    };
  };

  // 6. Reinforcement learning: real tabular Q-learning on a grid. Tiles rise as the value spreads back from the reward.
  scenes.gridworld = function (scene, camera) {
    var G = 5, goal = [4, 4], pits = [[2, 1], [1, 3], [3, 2]], r = rng(17), i, j;
    var Q = [], tiles = [];
    for (i = 0; i < G * G; i++) Q.push([0, 0, 0, 0]);
    var moves = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function isPit(x, y) { return pits.some(function (p) { return p[0] === x && p[1] === y; }); }
    var base = new THREE.Color(0x2b2f36), good = new THREE.Color(COL.t), bad = new THREE.Color(0xe06c75), tmp = new THREE.Color();
    for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
      var geo = new THREE.BoxGeometry(0.88, 1, 0.88); geo.translate(0, 0.5, 0);
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: base }));
      m.position.set((i - (G - 1) / 2) * 1, 0, (j - (G - 1) / 2) * 1); m.scale.y = 0.06;
      scene.add(m); tiles.push(m);
    }
    var agent = sphere(0.2, COL.o, 14); scene.add(agent);
    var st = [0, 0], steps = 0, acc = 0, eps = 0.3;
    function V(x, y) { return Math.max.apply(null, Q[x * G + y]); }
    function reset() { st = [0, 0]; steps = 0; }
    function stepOnce() {
      var s = st[0] * G + st[1], a;
      if (r() < eps) a = Math.floor(r() * 4); else { a = 0; for (var k = 1; k < 4; k++) if (Q[s][k] > Q[s][a] + 1e-9 || (Math.abs(Q[s][k] - Q[s][a]) < 1e-9 && r() < 0.3)) a = k; }
      var nx = Math.max(0, Math.min(G - 1, st[0] + moves[a][0])), ny = Math.max(0, Math.min(G - 1, st[1] + moves[a][1]));
      var rew = -0.02, done = false;
      if (nx === goal[0] && ny === goal[1]) { rew = 1; done = true; } else if (isPit(nx, ny)) { rew = -1; done = true; }
      var target = rew + (done ? 0 : 0.95 * V(nx, ny));
      Q[s][a] += 0.5 * (target - Q[s][a]);
      st = [nx, ny]; steps++;
      if (done || steps > 60) { reset(); eps = Math.max(0.08, eps * 0.985); }
    }
    var epochT = 0;
    return {
      update: function (t, dt) {
        acc += dt; epochT += dt;
        while (acc > 0.03) { acc -= 0.03; stepOnce(); }
        if (epochT > 40) { epochT = 0; Q.forEach(function (q) { q[0] = q[1] = q[2] = q[3] = 0; }); eps = 0.3; reset(); }
        tiles.forEach(function (m, k) {
          var x = Math.floor(k / G), y = k % G, v = Math.max(0, V(x, y)), target;
          if (x === goal[0] && y === goal[1]) { target = 0.9; tmp.copy(good); }
          else if (isPit(x, y)) { target = 0.12; tmp.copy(bad); }
          else { target = 0.06 + Math.min(0.8, v * 0.9); tmp.copy(base).lerp(good, Math.min(1, v * 1.1)); }
          m.scale.y += (target - m.scale.y) * 0.2; m.material.color.copy(tmp);
        });
        agent.position.set((st[0] - (G - 1) / 2), tiles[st[0] * G + st[1]].scale.y + 0.25, (st[1] - (G - 1) / 2));
        var a = 0.5 + t * 0.12;
        camera.position.set(Math.sin(a) * 8.6, 7, Math.cos(a) * 8.6); camera.lookAt(0, 0.2, 0);
      }
    };
  };

  // 7. Knowledge as compression: a rolled-up manifold unrolls into the two numbers that actually matter.
  scenes.roll = function (scene, camera) {
    var r = rng(9), pts = [], i, S = 0.2, col = new THREE.Color(), a = new THREE.Color(COL.o), b = new THREE.Color(COL.b);
    for (i = 0; i < 260; i++) {
      var u = r(), h = (r() - 0.5) * 3.2, tt = 1.4 * Math.PI + u * 3 * Math.PI;
      var m = sphere(0.07, 0xffffff, 8); m.material.color.copy(col.copy(a).lerp(b, u));
      m.userData = { rx: S * tt * Math.cos(tt), ry: h * 0.9, rz: S * tt * Math.sin(tt), fx: (u - 0.5) * 4.6, fy: h * 0.9, fz: 0 };
      scene.add(m); pts.push(m);
    }
    var grid = new THREE.GridHelper(7, 14, 0x555a63, 0x33373e); grid.position.y = -1.9; scene.add(grid);
    return {
      update: function (t) {
        var T = t % 12, k = smooth((T - 2) / 3) * (1 - smooth((T - 8) / 3));
        pts.forEach(function (m) {
          var d = m.userData;
          m.position.set(d.rx + (d.fx - d.rx) * k, d.ry + (d.fy - d.ry) * k, d.rz + (d.fz - d.rz) * k);
        });
        var an = 0.4 + t * 0.12 * (1 - k * 0.8);
        camera.position.set(Math.sin(an) * 8.2 * (1 - k * 0.9) + k * 0.5, 2.2, Math.cos(an) * 8.2 * (1 - k * 0.9) + k * 8.2 * 0.9 + 0.001); camera.lookAt(0, 0, 0);
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
    var api = make(scene, camera), sec = canvas.closest('section'), last = performance.now(), t = 0, lw = 0, lh = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 0.1); last = now;
      if (!sec || !sec.classList.contains('present')) return;
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
