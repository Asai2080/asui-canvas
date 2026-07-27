"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import * as THREE from "three"

const SIMPLEX_NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);
    const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(
              i.z+vec4(0.,i1.z,i2.z,1.))
            + i.y+vec4(0.,i1.y,i2.y,1.))
            + i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=1./7.;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;
    vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform vec2 uLook;
  uniform float uReduce;

  varying vec3 vLocalPos;
  varying vec3 vViewPos;

  ${SIMPLEX_NOISE}

  void main(){
    vLocalPos = position;
    vec3 pos = position;
    float t = uTime * uReduce;

    float ax = sin(t * .27) * .16;
    float ay = sin(t * .19 + 1.7) * .20;
    float az = sin(t * .23 + 3.1) * .12;
    pos *= vec3(1. + ax, 1. + ay, 1. + az);

    float nLow = snoise(pos * .55 + vec3(t * .18, t * .13, -t * .15));
    float nMid = snoise(pos * 1.45 + vec3(-t * .22, t * .20, t * .18));
    vec3 lookDir = vec3(uLook, .55);
    float facing = clamp(dot(normalize(pos), normalize(lookDir)), 0., 1.);
    float bulge = pow(facing, 2.5) * (.08 + uActive * .10);
    float breath = sin(t * .55) * .022;
    float amp = mix(.20, .34, uActive);
    float displacement = (nLow * .66 + nMid * .34) * amp + bulge + breath;

    pos += normal * displacement;
    vec4 mv = modelViewMatrix * vec4(pos, 1.);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBase;
  uniform vec3 uRimA;
  uniform vec3 uRimB;
  uniform vec3 uSpeckA;
  uniform vec3 uSpeckB;
  uniform float uActive;

  varying vec3 vLocalPos;
  varying vec3 vViewPos;

  ${SIMPLEX_NOISE}

  void main(){
    vec3 dx = dFdx(vViewPos);
    vec3 dy = dFdy(vViewPos);
    vec3 n = normalize(cross(dx, dy));
    vec3 v = normalize(-vViewPos);
    float fres = 1. - clamp(dot(n, v), 0., 1.);

    vec3 keyDir = normalize(vec3(-.45, .70, .85));
    vec3 fillDir = normalize(vec3(.65, -.35, .55));
    float diffKey = max(0., dot(n, keyDir));
    float diffFill = max(0., dot(n, fillDir));
    vec3 lit = uBase * (.30 + diffKey * .95 + diffFill * .45);

    vec3 dirCyan = normalize(vec3(-.70, .55, .50));
    vec3 dirMagenta = normalize(vec3(.75, -.30, .50));
    float rimPower = mix(2.2, 1.7, uActive);
    float rimCyan = pow(max(0., dot(n, dirCyan)), 1.3) * pow(fres, rimPower);
    float rimMagenta = pow(max(0., dot(n, dirMagenta)), 1.3) * pow(fres, rimPower);

    vec3 halfKey = normalize(keyDir + v);
    float specKey = pow(max(0., dot(n, halfKey)), 32.) * .55;
    vec3 col = lit
      + uRimA * rimCyan * mix(1.10, 1.55, uActive)
      + uRimB * rimMagenta * mix(1., 1.45, uActive)
      + specKey * vec3(.80, .95, 1.);

    float speckBig = snoise(vLocalPos * 10.);
    float speckSmall = snoise(vLocalPos * 24. + 1.7);
    float speckMask = max(
      smoothstep(.66, .74, speckBig),
      smoothstep(.72, .78, speckSmall) * .40
    );
    float colorPick = snoise(vLocalPos * 4. + 5.3);
    vec3 speckColor = mix(uSpeckA, uSpeckB, smoothstep(.55, .75, colorPick));
    float speckBody = 1. - smoothstep(.55, .95, fres);
    col += speckColor * speckMask * speckBody * .85;

    gl_FragColor = vec4(col, 1.);
  }
`

const LOOK_SEQUENCE = [
  { x: -0.65, y: 0, duration: 2400 },
  { x: 0.32, y: 0, duration: 2800 },
  { x: -0.24, y: 0, duration: 2200 },
  { x: 0, y: -0.55, duration: 2800 },
  { x: 0, y: 0, duration: 2600 },
] as const

const PALETTE = {
  base: [0.05, 0.075, 0.085] as const,
  rimA: [0.38, 0.86, 0.94] as const,
  rimB: [0.64, 0.996, 0.267] as const,
  speckA: [0.64, 0.996, 0.267] as const,
  speckB: [0.4, 0.91, 1] as const,
  eye: "rgba(163, 254, 68, 0.90)",
  eyeGlow: "rgba(163, 254, 68, 0.70)",
}

export function CuriousAiOrb() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ width: 150, height: 150 })
  const lookTargetRef = useRef({ x: 0, y: 0 })
  const lookCurrentRef = useRef({ x: 0, y: 0 })
  const pointerActiveRef = useRef(false)
  const activityRef = useRef(0)
  const activityTargetRef = useRef(0)
  const eyeX = useMotionValue(0)
  const eyeY = useMotionValue(0)
  const springX = useSpring(eyeX, { stiffness: 200, damping: 22, mass: 0.4 })
  const springY = useSpring(eyeY, { stiffness: 200, damping: 22, mass: 0.4 })
  const [blinkKey, setBlinkKey] = useState(0)
  const [eyeOpen, setEyeOpen] = useState(0.85)

  useEffect(() => {
    const host = canvasRef.current
    if (!host) return

    const width = host.clientWidth || 150
    const height = host.clientHeight || 150
    sizeRef.current = { width, height }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.z = 4.4

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      host.dataset.webglUnavailable = "true"
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute("aria-hidden", "true")
    host.appendChild(renderer.domElement)

    // Detail 5 keeps the displaced surface smooth without overwhelming a sidebar.
    const geometry = new THREE.IcosahedronGeometry(1, 5)
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uActive: { value: 0 },
      uLook: { value: new THREE.Vector2(0, 0) },
      uReduce: { value: 1 },
      uBase: { value: new THREE.Color(...PALETTE.base) },
      uRimA: { value: new THREE.Color(...PALETTE.rimA) },
      uRimB: { value: new THREE.Color(...PALETTE.rimB) },
      uSpeckA: { value: new THREE.Color(...PALETTE.speckA) },
      uSpeckB: { value: new THREE.Color(...PALETTE.speckB) },
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const applyMotionPreference = () => {
      uniforms.uReduce.value = motionQuery.matches ? 0 : 1
    }
    applyMotionPreference()
    motionQuery.addEventListener("change", applyMotionPreference)

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const nextWidth = Math.max(1, Math.floor(entry.contentRect.width))
      const nextHeight = Math.max(1, Math.floor(entry.contentRect.height))
      sizeRef.current = { width: nextWidth, height: nextHeight }
      renderer.setSize(nextWidth, nextHeight)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(host)

    let animationFrame = 0
    let previousTime = window.performance.now()
    const tick = () => {
      animationFrame = window.requestAnimationFrame(tick)
      const now = window.performance.now()
      const delta = Math.min((now - previousTime) / 1000, 0.05)
      previousTime = now
      uniforms.uTime.value += delta

      const activityEase = 1 - Math.exp(-delta * 6)
      activityRef.current +=
        (activityTargetRef.current - activityRef.current) * activityEase
      uniforms.uActive.value = activityRef.current

      const lookSpeed = pointerActiveRef.current ? 7 : 2.2
      const lookEase = 1 - Math.exp(-delta * lookSpeed)
      const current = lookCurrentRef.current
      const target = lookTargetRef.current
      current.x += (target.x - current.x) * lookEase
      current.y += (target.y - current.y) * lookEase
      uniforms.uLook.value.set(current.x, -current.y)

      const lean = 0.12 + activityRef.current * 0.06
      mesh.position.x += (current.x * lean - mesh.position.x) * lookEase
      mesh.position.y += (-current.y * lean - mesh.position.y) * lookEase

      const eyeRange = sizeRef.current.width * 0.18
      eyeX.set(current.x * eyeRange)
      eyeY.set(current.y * eyeRange)
      mesh.rotation.y += delta * 0.04 * uniforms.uReduce.value
      mesh.rotation.x += delta * 0.015 * uniforms.uReduce.value
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      motionQuery.removeEventListener("change", applyMotionPreference)
      resizeObserver.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [eyeX, eyeY])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const updateLook = (clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect()
      const radius = rect.width / 2
      const x = Math.max(-1, Math.min(1, (clientX - rect.left - radius) / radius))
      const y = Math.max(-1, Math.min(1, (clientY - rect.top - radius) / radius))
      const onOrb = Math.hypot(x, y) < 0.62

      pointerActiveRef.current = true
      activityTargetRef.current = onOrb ? 1 : 0.35
      lookTargetRef.current = onOrb ? { x, y } : { x: x * 0.4, y: y * 0.4 }
      setEyeOpen(onOrb ? 0.32 : 0.7)
    }
    const handleMove = (event: PointerEvent) => updateLook(event.clientX, event.clientY)
    const handleEnter = (event: PointerEvent) => {
      updateLook(event.clientX, event.clientY)
      setBlinkKey((value) => value + 1)
    }
    const handleLeave = () => {
      pointerActiveRef.current = false
      activityTargetRef.current = 0
      setEyeOpen(0.85)
      setBlinkKey((value) => value + 1)
    }

    stage.addEventListener("pointermove", handleMove)
    stage.addEventListener("pointerenter", handleEnter)
    stage.addEventListener("pointerleave", handleLeave)
    stage.addEventListener("pointerdown", handleMove)
    stage.addEventListener("pointercancel", handleLeave)
    return () => {
      stage.removeEventListener("pointermove", handleMove)
      stage.removeEventListener("pointerenter", handleEnter)
      stage.removeEventListener("pointerleave", handleLeave)
      stage.removeEventListener("pointerdown", handleMove)
      stage.removeEventListener("pointercancel", handleLeave)
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let index = 0
    let timeout = 0
    const step = () => {
      const next = LOOK_SEQUENCE[index]
      if (!pointerActiveRef.current) {
        lookTargetRef.current = { x: next.x, y: next.y }
      }
      index = (index + 1) % LOOK_SEQUENCE.length
      timeout = window.setTimeout(step, next.duration)
    }
    step()
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let timeout = 0
    const scheduleBlink = () => {
      timeout = window.setTimeout(() => {
        setBlinkKey((value) => value + 1)
        scheduleBlink()
      }, 3800 + Math.random() * 3200)
    }
    scheduleBlink()
    return () => window.clearTimeout(timeout)
  }, [])

  return (
    <div ref={stageRef} className="curious-ai-orb" aria-hidden="true">
      <div ref={canvasRef} className="curious-ai-orb__canvas" />
      <motion.div
        className="curious-ai-orb__eyes"
        style={{ x: springX, y: springY }}
      >
        <Eye open={eyeOpen} blinkKey={blinkKey} />
        <Eye open={eyeOpen} blinkKey={blinkKey} />
      </motion.div>
    </div>
  )
}

function Eye({ open, blinkKey }: { open: number; blinkKey: number }) {
  return (
    <motion.div
      className="curious-ai-orb__eye"
      style={{
        background: PALETTE.eye,
        boxShadow: `0 0 4px ${PALETTE.eye}, 0 0 14px 1px ${PALETTE.eyeGlow}, 0 0 28px 4px ${PALETTE.eyeGlow}`,
      }}
      animate={{ scaleY: open }}
      transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.4 }}
    >
      <motion.span
        key={blinkKey}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: [1, 0.05, 1] }}
        transition={{ duration: 0.18, times: [0, 0.45, 1], ease: "easeInOut" }}
      />
    </motion.div>
  )
}
