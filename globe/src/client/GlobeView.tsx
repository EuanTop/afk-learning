import { Html, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import type { RegionData } from "../shared/types";

function latLngToPosition(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

function Globe({
  regions,
  activeRegionIds,
  selectedRegionId,
  onSelectRegion
}: {
  regions: RegionData[];
  activeRegionIds: string[];
  selectedRegionId: string | null;
  onSelectRegion(regionId: string): void;
}) {
  const groupRef = useRef<Group>(null);
  const sphereRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={sphereRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial color="#11395f" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.045, 64, 64]} />
        <meshStandardMaterial color="#6ee7ff" transparent opacity={0.08} />
      </mesh>
      {regions.map((region) => {
        const position = latLngToPosition(region.lat, region.lng, 1.03);
        const selected = region.id === selectedRegionId;
        const active = activeRegionIds.includes(region.id);
        const size = 0.035 + region.densityScore * 0.05;

        return (
          <group key={region.id} position={position}>
            <mesh onClick={() => onSelectRegion(region.id)}>
              <sphereGeometry args={[size, 18, 18]} />
              <meshStandardMaterial
                color={active ? region.color : "#94a3b8"}
                emissive={active ? region.color : "#000000"}
                emissiveIntensity={selected ? 1.8 : 0.5}
              />
            </mesh>
            {selected ? (
              <Html distanceFactor={8}>
                <div className="rounded-full border border-white/20 bg-slate-950/85 px-3 py-1 text-xs text-white shadow-xl">
                  {region.name}
                </div>
              </Html>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export function GlobeView({
  regions,
  activeRegionIds,
  selectedRegionId,
  onSelectRegion
}: {
  regions: RegionData[];
  activeRegionIds: string[];
  selectedRegionId: string | null;
  onSelectRegion(regionId: string): void;
}) {
  const sorted = useMemo(
    () => [...regions].toSorted((a, b) => b.densityScore - a.densityScore),
    [regions]
  );

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(94,234,212,0.16),_transparent_35%),linear-gradient(180deg,#061325_0%,#081a33_55%,#050d18_100%)] shadow-2xl">
      <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 2, 3]} intensity={2.5} color="#c6f6ff" />
        <Stars radius={30} depth={50} count={1500} factor={3} saturation={0} fade />
        <Globe
          regions={regions}
          activeRegionIds={activeRegionIds}
          selectedRegionId={selectedRegionId}
          onSelectRegion={onSelectRegion}
        />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
        <div className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-4 py-2 text-xs font-medium text-emerald-100 backdrop-blur">
          地球植物分布探索
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-200 backdrop-blur">
          <div className="mb-2 font-semibold text-white">高亮区域</div>
          <div className="space-y-1">
            {sorted.map((region) => (
              <div key={region.id} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: region.color }}
                />
                <span>{region.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
