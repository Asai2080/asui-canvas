"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CubeIcon,
  PauseIcon,
  PlayIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

export type Canvas3dPreviewSource = {
  shapeId: string
  src: string
}

type Canvas3dPreviewProps = {
  title: string
  sources: Canvas3dPreviewSource[]
  onActivate?: () => void
}

const CAMERA_HOME = new THREE.Vector3(3.2, 2.35, 4.4)

function makeFallbackMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x202224,
    roughness: 0.72,
    metalness: 0.08,
  })
}

export function Canvas3dPreview({
  title,
  sources,
  onActivate,
}: Canvas3dPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const autoRotateRef = useRef(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    setLoadedCount(0)
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.copy(CAMERA_HOME)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x101214, 2.1))
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5)
    keyLight.position.set(3, 4, 5)
    scene.add(keyLight)

    const model = new THREE.Group()
    model.rotation.y = -0.34
    scene.add(model)

    const proxyGeometry = new THREE.BoxGeometry(1.6, 1.28, 1.6)
    const proxyMaterial = new THREE.MeshStandardMaterial({
      color: 0x151719,
      roughness: 0.58,
      metalness: 0.12,
      transparent: true,
      opacity: 0.52,
      wireframe: true,
    })
    model.add(new THREE.Mesh(proxyGeometry, proxyMaterial))

    const planeGeometry = new THREE.PlaneGeometry(1.58, 1.22)
    const materials = sources.slice(0, 4).map(() => makeFallbackMaterial())
    const placements = [
      { position: [0, 0, 0.815], rotation: [0, 0, 0] },
      { position: [0.815, 0, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [0, 0, -0.815], rotation: [0, Math.PI, 0] },
      {
        position: [0, 0.655, 0],
        rotation: [-Math.PI / 2, 0, 0],
      },
    ] as const

    materials.forEach((material, index) => {
      const placement = placements[index]
      const panel = new THREE.Mesh(planeGeometry, material)
      panel.position.set(
        placement.position[0],
        placement.position[1],
        placement.position[2]
      )
      panel.rotation.set(
        placement.rotation[0],
        placement.rotation[1],
        placement.rotation[2]
      )
      model.add(panel)
    })

    const edgeGeometry = new THREE.EdgesGeometry(proxyGeometry)
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xa3fe44,
      transparent: true,
      opacity: 0.42,
    })
    model.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

    const textureLoader = new THREE.TextureLoader()
    const textures: THREE.Texture[] = []
    let disposed = false
    sources.slice(0, 4).forEach((source, index) => {
      textureLoader.load(
        source.src,
        (texture) => {
          if (disposed) {
            texture.dispose()
            return
          }
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy()
          )
          textures.push(texture)
          const material = materials[index]
          material.map = texture
          material.color.set(0xffffff)
          material.needsUpdate = true
          setLoadedCount((current) => current + 1)
        },
        undefined,
        () => {
          // The safe proxy remains usable when a persisted source is unavailable.
        }
      )
    })

    const controls = new OrbitControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 2.6
    controls.maxDistance = 8
    controls.autoRotateSpeed = 0.75
    controls.target.set(0, 0, 0)

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
    const syncMotion = () => {
      controls.autoRotate = autoRotateRef.current && !reduceMotion.matches
    }
    syncMotion()
    reduceMotion.addEventListener("change", syncMotion)

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const nextWidth = Math.max(1, Math.floor(entry.contentRect.width))
      const nextHeight = Math.max(1, Math.floor(entry.contentRect.height))
      renderer.setSize(nextWidth, nextHeight)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(host)

    let frame = 0
    const render = () => {
      frame = window.requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      reduceMotion.removeEventListener("change", syncMotion)
      controls.dispose()
      controlsRef.current = null
      cameraRef.current = null
      textures.forEach((texture) => texture.dispose())
      materials.forEach((material) => material.dispose())
      planeGeometry.dispose()
      proxyGeometry.dispose()
      proxyMaterial.dispose()
      edgeGeometry.dispose()
      edgeMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [sources])

  useEffect(() => {
    autoRotateRef.current = autoRotate
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate =
      autoRotate &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [autoRotate])

  const resetView = () => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    camera.position.copy(CAMERA_HOME)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  return (
    <div className="canvas-3d-preview" onPointerDown={onActivate}>
      <div className="canvas-3d-preview__chrome">
        <div className="canvas-3d-preview__title">
          <HugeiconsIcon icon={CubeIcon} size={17} strokeWidth={1.7} />
          <span>{title}</span>
        </div>
        <span className="canvas-3d-preview__badge">
          多视角代理 · 非最终网格
        </span>
      </div>
      <div
        className="canvas-3d-preview__stage"
        ref={hostRef}
        aria-label={`${title}，可拖动旋转并滚轮缩放`}
      >
        {sources.length < 2 && (
          <div className="canvas-3d-preview__empty">
            至少需要 2 张仍在画布中的参考图
          </div>
        )}
      </div>
      <div className="canvas-3d-preview__footer">
        <span>{loadedCount}/{sources.length} 张参考已加载</span>
        <div className="canvas-3d-preview__actions">
          <button
            type="button"
            title={autoRotate ? "暂停环绕" : "自动环绕"}
            aria-label={autoRotate ? "暂停环绕" : "自动环绕"}
            aria-pressed={autoRotate}
            onClick={(event) => {
              event.stopPropagation()
              setAutoRotate((current) => !current)
            }}
          >
            <HugeiconsIcon
              icon={autoRotate ? PauseIcon : PlayIcon}
              size={16}
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            title="重置视角"
            aria-label="重置视角"
            onClick={(event) => {
              event.stopPropagation()
              resetView()
            }}
          >
            <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
