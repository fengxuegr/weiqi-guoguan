const SFX = (function(){
  let ac = null;
  const bank = {};          // kind -> [AudioBuffer ×3]
  const bells = {};         // 频率 -> AudioBuffer
  let TONE = "A";

  /* 三档音色：只调 体感/亮度/接触噪声 三个系数，音高骨架共用 */
  const STYLES = {
    A: { body: 1.00, bright: 1.00, hit: 1.00 },   // 天然：云子落榧木盘，有"笃"的实体
    B: { body: 0.40, bright: 1.30, hit: 1.45 },   // 清脆：101 围棋网那种"啪"，颗粒感强
    C: { body: 1.75, bright: 0.76, hit: 0.78 }    // 厚重：实木大棋盘，低频更饱
  };

  /* 骨架：body = 盘体低频模态，bright = 棋子高频模态，hit = [高通Hz, 时长s, 幅度]
     模态格式 [频率Hz, 衰减时间常数s, 相对幅度] */
  const SPEC = {
    stone: {   // 黑子：主共振 1930Hz，配 298Hz 的盘体感
      dur: 0.32, level: 0.52,
      body:   [[298, 0.085, 0.34], [705, 0.048, 0.15]],
      bright: [[1930, 0.048, 1.00], [3120, 0.030, 0.36], [4520, 0.018, 0.13]],
      hit: [3400, 0.0038, 0.60]
    },
    white: {   // 白子：整体高半个档、轻一点，孩子能听出"对方下了一手"
      dur: 0.32, level: 0.44,
      body:   [[322, 0.078, 0.29], [762, 0.044, 0.13]],
      bright: [[2300, 0.044, 1.00], [3460, 0.026, 0.31], [5040, 0.016, 0.10]],
      hit: [4200, 0.0034, 0.54]
    },
    capture: { // 提子：低一档、更闷，像棋子被拿起来在盘面上磕了一下
      dur: 0.38, level: 0.36,
      body:   [[176, 0.110, 0.44], [420, 0.072, 0.30]],
      bright: [[1060, 0.055, 0.86], [2380, 0.022, 0.16]],
      hit: [2300, 0.0045, 0.34]
    },
    wrong: {   // 答错：一声很轻的闷木响。中低频为主、短、不带下行音阶，
               // 只用来确认"这一手没走对"，不做惩罚性的挫败音
      dur: 0.20, level: 0.26,
      body:   [[262, 0.050, 0.50], [393, 0.035, 0.28]],
      bright: [[620, 0.025, 0.14], [980, 0.014, 0.05]],
      hit: [1500, 0.0030, 0.26]
    }
  };

  function ctx(){
    if(!ac){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      try{ ac = new AC(); }catch(e){ return null; }
    }
    if(ac.state === "suspended"){ try{ ac.resume(); }catch(e){} }
    return ac;
  }
  function on(){ return !S.sfx || S.sfx.on !== false; }
  function vol(){ return S.sfx && typeof S.sfx.vol === "number" ? S.sfx.vol : 0.45; }
  function ready(){ return on() && vol() > 0.001; }
  function rnd(a, b){ return a + Math.random() * (b - a); }

  /* 延时音效（提子的第二声、答对的两声…）必须能被统一取消：
     孩子答对后立刻点返回，否则 240ms 后还会冒出一声"叮"，听着像没退出去 */
  const timers = [];
  function later(fn, ms){
    const id = setTimeout(function(){
      const i = timers.indexOf(id);
      if(i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function cancelAll(){
    for(let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  }

  /** 叠加一个阻尼模态 A·e^(-t/τ)·sin(2πft+φ)。相位用递推算，比每次 sin 快一个量级 */
  function addMode(out, sr, f, tau, amp, phase){
    if(!(amp > 0) || !(f > 0) || !(f < sr * 0.45)) return;
    const w = 2 * Math.PI * f / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const k = Math.exp(-1 / (tau * sr));
    let s = Math.sin(phase), c = Math.cos(phase);
    let env = amp;
    const lim = amp * 0.0008;
    for(let i = 0; i < out.length; i++){
      out[i] += env * s;
      const ns = s * cw + c * sw;
      c = c * cw - s * sw;
      s = ns;
      env *= k;
      if(env < lim) break;
    }
  }

  /** 接触噪声：白噪声过一阶高通后按指数衰减，负责"锐"的那一下 */
  function addNoise(out, sr, cutoff, tau, amp){
    if(!(amp > 0)) return;
    const a = 1 / (1 + 2 * Math.PI * cutoff / sr);
    const k = Math.exp(-1 / (tau * sr));
    let env = amp, xp = 0, yp = 0;
    for(let i = 0; i < out.length; i++){
      const x = Math.random() * 2 - 1;
      yp = a * (yp + x - xp);
      xp = x;
      out[i] += env * yp * 2.2;
      env *= k;
      if(env < amp * 1e-4) break;
    }
  }

  /** 几个早期反射，做出"棋盘在桌上、人在房间里"的空间感。纯直达声听着贴耳又发干 */
  function room(out, sr, wet){
    if(wet == null) wet = 1;
    const taps = [[1.7, 0.20], [3.4, 0.13], [6.1, 0.085], [9.8, 0.050], [14.5, 0.028]];
    const src = out.slice();
    for(let t = 0; t < taps.length; t++){
      const d = Math.round(taps[t][0] * sr / 1000);
      const a = taps[t][1] * wet;
      if(d <= 0) continue;
      for(let i = 0; i + d < out.length; i++) out[i + d] += src[i] * a;
    }
  }

  /** 收尾：起音渐变（否则首采样即峰，会"咔"）+ 尾巴淡出 + 峰值归一 */
  function finish(out, sr){
    const n = out.length;
    const atk = Math.max(1, Math.round(sr * 0.0008));
    for(let i = 0; i < atk && i < n; i++) out[i] *= i / atk;
    const fade = Math.round(sr * 0.03);
    for(let j = 0; j < fade && j < n; j++){
      out[n - 1 - j] *= 0.5 - 0.5 * Math.cos(Math.PI * j / fade);
    }
    let peak = 0;
    for(let q = 0; q < n; q++){
      const v = out[q];
      if(v > peak) peak = v; else if(-v > peak) peak = -v;
    }
    const g = peak > 1e-6 ? 0.88 / peak : 0;
    for(let m = 0; m < n; m++) out[m] *= g;
  }

  function toBuffer(out, sr){
    const c = ctx(); if(!c) return null;
    const b = c.createBuffer(1, out.length, sr);
    if(b.copyToChannel) b.copyToChannel(out, 0);
    else b.getChannelData(0).set(out);
    return b;
  }

  /** 合成一次敲击 */
  function buildHit(kind){
    const c = ctx(); if(!c) return null;
    const sr = c.sampleRate, spec = SPEC[kind], st = STYLES[TONE] || STYLES.A;
    const n = Math.round(sr * spec.dur);
    const out = new Float32Array(n);
    spec.body.forEach(function(m){
      addMode(out, sr, m[0] * rnd(0.985, 1.015), m[1], m[2] * st.body, rnd(0, 6.283));
    });
    spec.bright.forEach(function(m){
      addMode(out, sr, m[0] * rnd(0.985, 1.015), m[1], m[2] * st.bright, rnd(0, 6.283));
    });
    addNoise(out, sr, spec.hit[0], spec.hit[1], spec.hit[2] * st.hit);
    room(out, sr);
    finish(out, sr);
    return toBuffer(out, sr);
  }

  /** 提示音：钢片琴音色（基频 + 2 次 + 近 3 次泛音）。正弦太"电子表"，所以要有泛音和槌击瞬态 */
  function buildBell(f){
    const c = ctx(); if(!c) return null;
    const sr = c.sampleRate;
    const n = Math.round(sr * 0.62);
    const out = new Float32Array(n);
    addMode(out, sr, f,        0.150, 1.00, rnd(0, 6.283));
    addMode(out, sr, f * 2.00, 0.075, 0.22, rnd(0, 6.283));
    addMode(out, sr, f * 3.01, 0.042, 0.08, rnd(0, 6.283));
    addNoise(out, sr, 5200, 0.0022, 0.09);
    room(out, sr, 0.45);
    finish(out, sr);
    return toBuffer(out, sr);
  }

  function playBuf(buf, gain, pan, rate, when){
    const c = ctx(); if(!c || !buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    if(rate && src.playbackRate) src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = Math.max(0, gain) * vol();
    src.connect(g);
    if(pan && c.createStereoPanner){
      const p = c.createStereoPanner();
      if(p.pan) p.pan.value = pan;
      g.connect(p); p.connect(c.destination);
    } else {
      g.connect(c.destination);
    }
    src.start(when || 0);        // 传绝对时间就用音频时钟排期，比 setTimeout 准，也不怕后台节流
  }

  /** 播放一组敲击：随机变体 + 随机音量/速率，消掉机械感 */
  function hit(kind, pan, when){
    if(!ready()) return;
    let arr = bank[kind];
    if(!arr){
      arr = bank[kind] = [];
      for(let i = 0; i < 3; i++) arr.push(buildHit(kind));
      arr = arr.filter(Boolean);
    }
    if(!arr.length) return;
    const buf = arr[(Math.random() * arr.length) | 0];
    playBuf(buf, SPEC[kind].level * rnd(0.93, 1.07), pan || 0, rnd(0.985, 1.015), when);
  }

  function bell(f, gain, pan){
    if(!ready()) return;
    const key = f + "";
    if(!bells[key]) bells[key] = buildBell(f);
    playBuf(bells[key], gain, pan || 0, rnd(0.997, 1.003));
  }

  /* ---- 真实录音（优先）。解码成功就用 Sabaki 的原始落子/提子声，
     解码失败或还没解完，退回上面的模态合成，保证任何情况下都有声。 ---- */
  let recBank = null;                 // {stone:[AudioBuffer], capture:[AudioBuffer]}
  let recState = 0;                   // 0 未开始 / 1 解码中 / 2 可用 / 3 全部失败
  let lastStone = -1, lastCap = -1, lastWrong = 0;

  function b64Buf(s){
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  /** 裁掉 mp3 编码器延迟造成的静音头，峰值统一到 0.88（各段录音原始响度不一致） */
  function prep(src, c){
    const chs = src.numberOfChannels, n = src.length, sr = src.sampleRate;
    const d = new Float32Array(n);
    for(let ch = 0; ch < chs; ch++){
      const s = src.getChannelData(ch);
      for(let i = 0; i < n; i++) d[i] += s[i] / chs;
    }
    let peak = 0;
    for(let i = 0; i < n; i++){ const v = d[i] < 0 ? -d[i] : d[i]; if(v > peak) peak = v; }
    if(peak < 1e-4) return null;
    const lim = peak * 0.02;
    let start = 0;
    for(let i = 0; i < n; i++){ const v = d[i] < 0 ? -d[i] : d[i]; if(v > lim){ start = i; break; } }
    start = Math.max(0, start - Math.round(sr * 0.002));
    const len = n - start;
    const out = c.createBuffer(1, len, sr);
    const dst = out.getChannelData(0);
    const g = 0.88 / peak;
    for(let i = 0; i < len; i++) dst[i] = d[i + start] * g;
    return out;
  }

  function decodeAll(){
    if(recState) return;
    const c = ctx(); if(!c) return;
    // sounds.js 万一没加载（有人手工删了），整体退回合成声，不能连累做题
    if(typeof SFX_REC === "undefined" || !SFX_REC){ recState = 3; return; }
    recState = 1;
    recBank = { stone: [], capture: [] };
    const jobs = [];
    for(const kind in SFX_REC){
      SFX_REC[kind].forEach(function(s, i){
        jobs.push(new Promise(function(res){
          let done = false;
          const fin = function(b){
            if(done) return;
            done = true;
            recBank[kind][i] = b ? prep(b, c) : null;
            res();
          };
          try{
            // Chrome 返回 Promise 且同时调回调，老 Safari 只有回调，两种都兜住
            const p = c.decodeAudioData(b64Buf(s), fin, function(){ fin(null); });
            if(p && p.then) p.then(fin).catch(function(){ fin(null); });
          }catch(e){ fin(null); }
        }));
      });
    }
    return Promise.all(jobs).then(function(){
      let n = 0;
      for(const k in recBank) n += recBank[k].filter(Boolean).length;
      recState = n ? 2 : 3;
    });
  }

  /** 随机取一个变体，且不连续复用同一个（Sabaki 也是这么做的，否则能听出重复） */
  function playRec(kind, gain, pan, rate, when){
    if(recState !== 2 || !recBank) return false;
    const arr = recBank[kind];
    if(!arr || !arr.length) return false;
    let idx = 0;
    if(arr.length > 1){
      const last = kind === "stone" ? lastStone : lastCap;
      idx = (Math.random() * arr.length) | 0;
      let guard = 0;
      while(idx === last && guard++ < 8) idx = (Math.random() * arr.length) | 0;
      if(kind === "stone") lastStone = idx; else lastCap = idx;
    }
    if(!arr[idx]) return false;
    playBuf(arr[idx], gain, pan, rate, when);
    return true;
  }

  return {
    unlock(){ ctx(); decodeAll(); },       // 用户手势里调一次：iOS 才允许发声，同时开始解码录音
    tone(t){ TONE = STYLES[t] ? t : "A"; for(const k in bank) delete bank[k]; },
    // 黑子落下：Sabaki 真实录音（131~261ms 五个变体随机），没解好就用合成
    stone(){
      if(!ready()) return;
      if(!playRec("stone", 0.52, 0, rnd(0.985, 1.015))) hit("stone", 0);
    },
    // 白棋应手：同一副棋，速率抬 3~6% 听着略高略轻，再偏右一点，区分"对方下的"
    white(){
      if(!ready()) return;
      if(!playRec("stone", 0.38, 0.12, rnd(1.03, 1.06))) hit("white", 0.12);
    },
    // 提子：用音频时钟排在落子后 70ms（不用 setTimeout：后台标签页的定时器会被节流，
    // 声音会拖着不出来；音频时钟是准的，而且这个延迟太短，不值得为它做取消）
    capture(){
      if(!ready()) return;
      const c = ctx(); if(!c) return;
      const when = c.currentTime + 0.07;
      if(!playRec("capture", 0.42, -0.06, rnd(0.985, 1.015), when)) hit("capture", -0.06, when);
    },
    // 答错：一声轻闷的木质提示，告诉孩子"这一手没走对"，但不刺耳、不掉音阶
    wrong(){
      if(!ready()) return;
      const t = Date.now();
      if(t - lastWrong < 240) return;   // 乱点了不要连成一片噪音
      lastWrong = t;
      hit("wrong", 0);
    },
    ok(){                                  // 答对：纯四度上行，很轻
      later(function(){ bell(988, 0.13); }, 130);
      later(function(){ bell(1318, 0.10); }, 240);
    },
    done(){                                // 本次做完：G-B-D 大三和弦琶音
      [784, 988, 1174].forEach(function(f, i){
        later(function(){ bell(f, 0.15 - i * 0.02); }, i * 110);
      });
    },
    timeup(){                              // 时间到：纯五度下行
      bell(700, 0.16);
      later(function(){ bell(466, 0.14); }, 190);
    },
    cancel(){ cancelAll(); }               // 离开做题页时掐掉还没响的延时音效
  };
})();
