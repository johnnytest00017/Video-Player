/* STRETCH FILL (live, no AI).
   Idea from Niek/superview (GoPro "SuperView"): a non-linear stretch that grows toward the edges. It runs live on the GPU.
   Inside the picture's rectangle nothing changes; outside it, the picture is mirrored back out of its own edge and stretched
   more and more the further it goes ("Stretch reach" = how much of the picture is used, "Stretch curve" = how fast the stretch
   grows), then softly blurred. The real picture stays on top, untouched. */
import { video, stretchCv } from './dom.js';
import { S, amb, saveAmb, emit } from './state.js';

let gl = null, U = {}, tex = null, failed = false;
const VS = 'attribute vec2 a;varying vec2 vP;void main(){vP=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
const FS = 'precision mediump float;varying vec2 vP;uniform sampler2D T;uniform vec2 uSz;uniform vec4 uR;uniform vec4 uS;uniform vec2 uK;' +
  'float m(float X,float a,float b,float L){float s=uK.x,p=uK.y;' +
  'if(X<a){float d=clamp((a-X)/max(a,1.),0.,1.);return s*pow(d,p);}' +
  'if(X>b){float d=clamp((X-b)/max(L-b,1.),0.,1.);return 1.-s*pow(d,p);}' +
  'return (X-a)/max(b-a,1.);}' +
  'void main(){float u=m(vP.x*uSz.x,uR.x,uR.x+uR.z,uSz.x);float v=m(vP.y*uSz.y,uR.y,uR.y+uR.w,uSz.y);' +
  'gl_FragColor=vec4(texture2D(T,uS.xy+vec2(u,v)*uS.zw).rgb,1.);}';

function init() {
  try {
    const g = stretchCv.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!g) throw new Error('no webgl');
    const sh = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
    const pg = g.createProgram();
    g.attachShader(pg, sh(g.VERTEX_SHADER, VS)); g.attachShader(pg, sh(g.FRAGMENT_SHADER, FS));
    g.linkProgram(pg); if (!g.getProgramParameter(pg, g.LINK_STATUS)) throw new Error('link');
    g.useProgram(pg);
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(pg, 'a'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    tex = g.createTexture(); g.bindTexture(g.TEXTURE_2D, tex);
    [[g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE], [g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR]]
      .forEach(([k, v]) => g.texParameteri(g.TEXTURE_2D, k, v));
    ['T', 'uSz', 'uR', 'uS', 'uK'].forEach(n => { U[n] = g.getUniformLocation(pg, n); });
    g.uniform1i(U.T, 0);
    gl = g;
  } catch (e) {
    // no WebGL: fall back to the ambilight
    failed = true; amb.bg = 1; saveAmb(); emit('amb-sync'); emit('bg-changed');
  }
}

export function draw() {
  if (failed || !S.geo || video.readyState < 2 || !video.videoWidth) return;
  if (!gl) { init(); if (!gl) return; }
  const g = S.geo, r = g.r;
  const w = Math.max(16, Math.round(r.W * .5)), h = Math.max(16, Math.round(r.H * .5));
  if (stretchCv.width !== w || stretchCv.height !== h) { stretchCv.width = w; stretchCv.height = h; }
  gl.viewport(0, 0, w, h);
  const blurPx = amb.blur ? Math.max(4, Math.round(r.dh * .0025 * amb.blur)) : 0;
  const flt = [blurPx ? `blur(${blurPx}px)` : '', amb.contrast !== 100 ? `contrast(${amb.contrast}%)` : '',
    amb.brightness !== 100 ? `brightness(${amb.brightness}%)` : '', amb.saturation !== 100 ? `saturate(${amb.saturation}%)` : ''].filter(Boolean).join(' ');
  if (stretchCv.style.filter !== flt) stretchCv.style.filter = flt;
  const vw = video.videoWidth, vh = video.videoHeight;
  gl.uniform2f(U.uSz, r.W, r.H);
  gl.uniform4f(U.uR, r.dx, r.dy, r.dw, r.dh);
  gl.uniform4f(U.uS, g.sx / vw, g.sy / vh, g.sw / vw, g.sh / vh);
  gl.uniform2f(U.uK, amb.stReach / 100, amb.stCurve / 100);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); } catch (e) { return; }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
