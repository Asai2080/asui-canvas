"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PauseIcon,
  PlayIcon,
  Refresh01Icon,
  ThreeDViewIcon,
} from "@hugeicons/core-free-icons"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import { buildProcedural3dModel } from "@/lib/canvas-3d/build-model"
import type { Procedural3dModelSpec } from "@/lib/canvas-3d/model-schema"

type Canvas3dModelProps = {
  spec: Procedural3dModelSpec
  onActivate?: () => void
}

export function Canvas3dModel({ spec, onActivate }: Canvas3dModelProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const initialViewRef = useRef<{
    position: THREE.Vector3
    target: THREE.Vector3
  } | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#0c0c0e")
    const camera = new THREE.PerspectiveCamera(spec.camera.fov, 1, 0.01, 200)
    camera.position.set(...spec.camera.position)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)

    const model = buildProcedural3dModel(spec)
    modelRef.current = model
    scene.add(model)

    const bounds = new THREE.Box3().setFromObject(model)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.62
    const configuredPosition = new THREE.Vector3(...spec.camera.position)
    const configuredTarget = new THREE.Vector3(...spec.camera.target)
    if (configuredPosition.distanceTo(center) < radius * 1.5) {
      camera.position.set(center.x + radius * 2.6, center.y + radius * 1.7, center.z + radius * 3.2)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = Math.max(0.4, radius * 0.65)
    controls.maxDistance = radius * 12
    controls.target.copy(
      configuredTarget.distanceTo(center) <= radius * 3
        ? configuredTarget
        : center
    )
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.2
    controls.update()
    controlsRef.current = controls
    initialViewRef.current = {
      position: camera.position.clone(),
      target: controls.target.clone(),
    }

    scene.add(new THREE.HemisphereLight(0xffffff, 0x202025, spec.lighting.ambientIntensity))
    const key = new THREE.DirectionalLight(0xffffff, spec.lighting.keyIntensity)
    key.position.set(...spec.lighting.keyPosition)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xa3fe44, 0.85)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 3.6, 64),
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.94 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = bounds.min.y - 0.025
    ground.receiveShadow = true
    scene.add(ground)

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of materials) material.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      controlsRef.current = null
      modelRef.current = null
    }
  }, [spec])

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate
  }, [autoRotate])

  const resetView = () => {
    const controls = controlsRef.current
    const initial = initialViewRef.current
    if (!controls || !initial) return
    controls.object.position.copy(initial.position)
    controls.target.copy(initial.target)
    controls.update()
  }

  return (
    <div className="canvas-3d-model" onPointerDown={onActivate}>
      <div className="canvas-3d-model__header">
        <div className="canvas-3d-model__title">
          <HugeiconsIcon icon={ThreeDViewIcon} size={17} strokeWidth={1.7} />
          <span>{spec.title}</span>
        </div>
        <span className="canvas-3d-model__badge">程序化 3D · {spec.components.length} 个部件</span>
      </div>
      <div
        ref={hostRef}
        className="canvas-3d-model__stage"
        onPointerDown={(event) => {
          event.stopPropagation()
          onActivate?.()
        }}
        onWheel={(event) => event.stopPropagation()}
        aria-label={`${spec.title}，拖动旋转，滚轮缩放`}
      />
      <div className="canvas-3d-model__footer">
        <span>{spec.suitability === "pass" ? "适合程序化重建" : "部分结构为单图推断"}</span>
        <div className="canvas-3d-model__actions">
          <button
            type="button"
            aria-label={autoRotate ? "暂停自动环绕" : "开始自动环绕"}
            title={autoRotate ? "暂停自动环绕" : "开始自动环绕"}
            onClick={(event) => {
              event.stopPropagation()
              setAutoRotate((current) => !current)
            }}
          >
            <HugeiconsIcon icon={autoRotate ? PauseIcon : PlayIcon} size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="重置视角"
            title="重置视角"
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
