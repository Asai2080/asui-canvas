import * as THREE from "three"

import type { Procedural3dModelSpec } from "./model-schema"

type ModelComponent = Procedural3dModelSpec["components"][number]

export function geometryForModelComponent(component: ModelComponent) {
  const options = component.primitiveOptions
  switch (component.primitive) {
    case "sphere":
    case "ellipsoid":
      return new THREE.SphereGeometry(0.5, 40, 28)
    case "cylinder":
      return new THREE.CylinderGeometry(
        options?.radiusTop ?? 0.5,
        options?.radiusBottom ?? 0.5,
        options?.length ?? 1,
        40,
        8
      )
    case "cone":
      return new THREE.ConeGeometry(
        options?.radius ?? 0.5,
        options?.length ?? 1,
        40,
        8
      )
    case "capsule":
      return new THREE.CapsuleGeometry(
        options?.radius ?? 0.35,
        options?.length ?? 0.3,
        12,
        24
      )
    case "torus":
      return new THREE.TorusGeometry(
        options?.radius ?? 0.38,
        options?.tubeRadius ?? 0.12,
        24,
        72
      )
    case "tube": {
      const points = (options?.path ?? []).map(
        ([x, y, z]) => new THREE.Vector3(x, y, z)
      )
      return new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, options?.closed ?? false),
        Math.max(24, points.length * 10),
        options?.tubeRadius ?? 0.08,
        12,
        options?.closed ?? false
      )
    }
    case "lathe":
      return new THREE.LatheGeometry(
        (options?.profile ?? []).map(([x, y]) => new THREE.Vector2(x, y)),
        48
      )
    case "extrude": {
      const points = options?.profile ?? []
      const shape = new THREE.Shape()
      shape.moveTo(points[0][0], points[0][1])
      for (let index = 1; index < points.length; index += 1) {
        shape.lineTo(points[index][0], points[index][1])
      }
      shape.closePath()
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: options?.depth ?? 0.12,
        bevelEnabled: false,
        steps: 1,
      })
      geometry.center()
      return geometry
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)
  }
}

export function buildProcedural3dModel(spec: Procedural3dModelSpec) {
  const root = new THREE.Group()
  root.name = spec.title
  const groups = new Map<string, THREE.Group>()

  for (const component of spec.components) {
    const group = new THREE.Group()
    group.name = component.name
    group.position.set(...component.position)
    group.rotation.set(...component.rotation)
    group.scale.set(...component.scale)

    const material = new THREE.MeshStandardMaterial({
      color: component.color,
      roughness: component.roughness,
      metalness: component.metalness,
    })
    const mesh = new THREE.Mesh(geometryForModelComponent(component), material)
    mesh.name = `${component.id}-mesh`
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    groups.set(component.id, group)
  }

  for (const component of spec.components) {
    const group = groups.get(component.id)!
    const parent = component.parentId ? groups.get(component.parentId) : root
    ;(parent ?? root).add(group)
  }
  return root
}
