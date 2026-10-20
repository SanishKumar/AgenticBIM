"use client";
/* eslint-disable react-hooks/immutability -- Three.js owns mutable scene objects, separate from React state. */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelElement } from "@/lib/model";
import { modelFrame, viewerPositions } from "@/lib/render-geometry";

type Props = {
  elements: (ModelElement & { previewRole?: "baseline" | "current" })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  findingIds: string[];
  level: string;
  exploded: boolean;
  xray: boolean;
  colorMode: "material" | "review";
  resetKey: number;
  revisionMode?: "overlay" | "baseline" | "current";
};
type SceneApi = {
  meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  home: THREE.Vector3;
  target: THREE.Vector3;
  render: () => void;
};

export default function ModelViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const compass = useRef<SVGSVGElement>(null);
  const api = useRef<SceneApi | null>(null);
  const onSelect = useRef(props.onSelect);
  useEffect(() => {
    onSelect.current = props.onSelect;
  }, [props.onSelect]);

  useEffect(() => {
    const container = host.current;
    if (!container || !props.elements.some((element) => element.mesh)) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f2f1f0");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor("#f2f1f0");
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive IFC model. Drag to orbit, scroll to zoom. Use the element list for keyboard selection.",
    );
    renderer.domElement.setAttribute("role", "img");
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.03;
    const group = new THREE.Group();
    scene.add(group);
    const meshes: SceneApi["meshes"] = [];
    const { origin, size: dimensions } = modelFrame(props.elements);
    for (const element of props.elements) {
      if (!element.mesh) continue;
      const positions = viewerPositions(element.mesh.vertices, origin);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      geometry.setIndex(element.mesh.faces);
      geometry.computeVertexNormals();
      const glass =
        element.type === "IfcWindow" || element.type === "IfcCurtainWall";
      const wood = element.materials.some((m) =>
        m.toLowerCase().includes("timber"),
      );
      const role = element.previewRole;
      const color =
        role === "baseline"
          ? "#95969c"
          : role === "current"
            ? "#96ff1a"
            : glass
              ? "#8b8d93"
              : wood
                ? "#aaa6a0"
                : "#ecebe8";
      const opacity =
        role === "baseline"
          ? 0.25
          : role === "current"
            ? 0.8
            : glass
              ? 0.44
              : 1;
      const material = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.78,
        metalness: glass ? 0.25 : 0.02,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
        depthWrite: role !== "baseline" && !glass,
        polygonOffset: !!role,
        polygonOffsetFactor: role === "baseline" ? 1 : -1,
        polygonOffsetUnits: role === "baseline" ? 1 : -1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !glass;
      mesh.receiveShadow = true;
      mesh.userData = {
        id: element.id,
        level: element.storey,
        elevation: element.elevation,
        color,
        opacity,
        role,
        targetY: 0,
      };
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({
          color:
            role === "baseline"
              ? "#71737a"
              : role === "current"
                ? "#083300"
                : "#4d4d51",
          transparent: true,
          opacity: role ? 0.65 : glass ? 0.27 : 0.15,
        }),
      );
      mesh.add(edges);
      group.add(mesh);
      meshes.push(mesh);
    }
    const size = new THREE.Vector3(...dimensions);
    const span = Math.max(size.x, size.y, size.z, 5);
    camera.near = Math.max(span / 1000, 0.01);
    camera.far = span * 25;
    const target = new THREE.Vector3(0, size.y * 0.42, 0);
    const home = new THREE.Vector3(span * 1.18, span * 0.88, span * 1.35).add(
      target,
    );
    camera.position.copy(home);
    controls.target.copy(target);
    controls.minDistance = span * 0.3;
    controls.maxDistance = span * 5;
    const hemi = new THREE.HemisphereLight("#ffffff", "#97979a", 1.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2.1);
    sun.position.set(span, span * 1.8, span * 0.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.far = span * 6;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 15, span * 15),
      new THREE.MeshStandardMaterial({ color: "#f2f1f0", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.09;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(span * 5, 60, "#c6c6c9", "#dededf");
    grid.position.y = -0.07;
    scene.add(grid);
    scene.fog = new THREE.Fog("#f2f1f0", span * 3.2, span * 6);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5)
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        meshes.filter((m) => m.visible),
        false,
      )[0];
      if (hit) onSelect.current(hit.object.userData.id);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate();
    });
    resize.observe(container);
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = motionPreference.matches;
    controls.enableDamping = !reducedMotion;
    let frame = 0;
    let renderedFrames = 0;
    let disposed = false;
    const invalidate = () => {
      if (!frame && !disposed && !document.hidden)
        frame = requestAnimationFrame(render);
    };
    const render = () => {
      frame = 0;
      let moving = false;
      for (const mesh of meshes) {
        const gap = mesh.userData.targetY - mesh.position.y;
        moving ||= !reducedMotion && Math.abs(gap) > 0.001;
        mesh.position.y =
          reducedMotion || Math.abs(gap) <= 0.001
            ? mesh.userData.targetY
            : mesh.position.y + gap * 0.09;
      }
      const orbiting = controls.update();
      renderer.render(scene, camera);
      if (process.env.NODE_ENV === "development")
        renderer.domElement.dataset.renderedFrames = String(++renderedFrames);
      if (compass.current) {
        const origin = controls.target.clone().project(camera);
        const north = controls.target
          .clone()
          .add(new THREE.Vector3(0, 0, -1))
          .project(camera);
        const angle =
          (Math.atan2(north.x - origin.x, north.y - origin.y) * 180) / Math.PI;
        compass.current.style.transform = `rotate(${angle}deg)`;
      }
      if (moving || orbiting) invalidate();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else invalidate();
    };
    const motionChanged = () => {
      reducedMotion = motionPreference.matches;
      controls.enableDamping = !reducedMotion;
      invalidate();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      container.dataset.contextLost = "true";
    };
    const contextRestored = () => {
      delete container.dataset.contextLost;
      invalidate();
    };
    controls.addEventListener("change", invalidate);
    document.addEventListener("visibilitychange", visibility);
    motionPreference.addEventListener("change", motionChanged);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      contextRestored,
    );
    api.current = {
      meshes,
      camera,
      controls,
      home,
      target,
      render: invalidate,
    };
    invalidate();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.removeEventListener("change", invalidate);
      document.removeEventListener("visibilitychange", visibility);
      motionPreference.removeEventListener("change", motionChanged);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        contextRestored,
      );
      delete container.dataset.contextLost;
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [props.elements]);

  useEffect(() => {
    if (!api.current) return;
    const flagged = new Set(props.findingIds);
    for (const mesh of api.current.meshes) {
      const selected = mesh.userData.id === props.selectedId;
      mesh.visible =
        (props.level === "all" || mesh.userData.level === props.level) &&
        (!props.revisionMode ||
          props.revisionMode === "overlay" ||
          mesh.userData.role === props.revisionMode);
      mesh.material.color.set(
        selected
          ? "#96ff1a"
          : props.colorMode === "review" && flagged.has(mesh.userData.id)
            ? "#292a2e"
            : mesh.userData.color,
      );
      mesh.material.emissive.set(selected ? "#173000" : "#000000");
      mesh.material.opacity =
        props.xray && !selected
          ? 0.18
          : props.revisionMode === "baseline" &&
              mesh.userData.role === "baseline"
            ? 0.9
            : mesh.userData.opacity;
      mesh.material.transparent = mesh.material.opacity < 1;
      mesh.material.depthWrite = mesh.material.opacity >= 0.4;
      mesh.userData.targetY = props.exploded
        ? mesh.userData.elevation * 0.65
        : 0;
    }
    api.current.render();
  }, [
    props.elements,
    props.selectedId,
    props.findingIds,
    props.level,
    props.exploded,
    props.xray,
    props.colorMode,
    props.revisionMode,
  ]);

  useEffect(() => {
    if (!api.current) return;
    api.current.camera.position.copy(api.current.home);
    api.current.controls.target.copy(api.current.target);
    if (props.exploded) {
      api.current.camera.position.multiplyScalar(1.18);
      api.current.controls.target.y *= 1.65;
    }
    api.current.render();
  }, [props.resetKey, props.exploded, props.elements]);

  return (
    <div className="viewer-canvas" ref={host}>
      <div className="north-marker" aria-label="Model positive Y direction">
        <span>+Y</span>
        <svg ref={compass} viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 3L27 30L20 25L13 30Z" fill="#323232" />
          <path d="M20 3L20 25L13 30Z" fill="#a2a2a6" />
        </svg>
      </div>
      <div className="viewer-fallback">
        <strong>3D preview unavailable</strong>
        <p>
          {props.elements.some((element) => element.mesh)
            ? "The browser renderer is unavailable. Reload to try again."
            : "This export has no supported preview geometry."}{" "}
          All quantities and findings are still available in the element list.
        </p>
      </div>
    </div>
  );
}
