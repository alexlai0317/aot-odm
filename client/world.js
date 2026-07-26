import * as THREE from 'three';
import { CITY_RADIUS, WALL_HEIGHT, BLOCK_SIZE, STREET_WIDTH } from './constants.js';

// 城區的生成與碰撞查詢。整座城是「圓形城牆 + 棋盤街廓」，
// 房子高矮不一是刻意的：立體機動裝置需要密集且高度落差大的錨點才有的盪。

// 固定亂數種子，讓每次開局的城市長得一樣（玩家才記得住地形）
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ROOF_COLORS = [0x9c4a35, 0xa85a3c, 0x8c4230, 0xb06848, 0x7d3a2b];
const WALL_COLORS = [0xd8cdb8, 0xcfc2a9, 0xe0d6c2, 0xc4b69c];

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9dc4e0);
  scene.fog = new THREE.Fog(0x9dc4e0, 120, 620);

  scene.add(new THREE.HemisphereLight(0xcfe4f5, 0x5a4a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
  sun.position.set(120, 200, 80);
  scene.add(sun);

  // 建築的碰撞盒（AABB），玩家碰撞與落地判定都查這份資料而不是查 mesh
  const buildings = [];
  // 鉤索可以射中的靜態物件（地面、城牆、房子）
  const hookables = [];

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6b6f5c });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(CITY_RADIUS + 40, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  hookables.push(ground);

  buildCityWall(scene, hookables);
  buildDistrict(scene, hookables, buildings);

  return {
    scene,
    buildings,
    hookables,
    // 玩家腳下的地面高度：站在屋頂上就是屋頂高度，不然是 0
    groundHeightAt(x, z) {
      let top = 0;
      for (const b of buildings) {
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (b.height > top) top = b.height;
      }
      return top;
    },
    // 球體 vs 建築的碰撞解算：沿最小穿透軸推開，並吃掉朝內的速度分量
    resolveCollision(position, velocity, radius) {
      let hit = false;
      for (const b of buildings) {
        if (position.y - radius >= b.height) continue; // 高過屋頂 → 從上面飛過
        const closestX = Math.max(b.minX, Math.min(position.x, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(position.z, b.maxZ));
        const dx = position.x - closestX;
        const dz = position.z - closestZ;
        if (dx * dx + dz * dz >= radius * radius) continue;

        // 已經在方塊內側（例如高速穿進去）時，往最近的側面推出去
        if (dx === 0 && dz === 0) {
          const toMinX = position.x - b.minX;
          const toMaxX = b.maxX - position.x;
          const toMinZ = position.z - b.minZ;
          const toMaxZ = b.maxZ - position.z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) position.x = b.minX - radius;
          else if (m === toMaxX) position.x = b.maxX + radius;
          else if (m === toMinZ) position.z = b.minZ - radius;
          else position.z = b.maxZ + radius;
          velocity.x *= 0.2;
          velocity.z *= 0.2;
          hit = true;
          continue;
        }

        const dist = Math.hypot(dx, dz) || 1;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = radius - dist;
        position.x += nx * push;
        position.z += nz * push;

        // 撞牆後留一點沿牆滑動的速度，撞上去不會整個人死在原地
        const into = velocity.x * nx + velocity.z * nz;
        if (into < 0) {
          velocity.x -= nx * into;
          velocity.z -= nz * into;
          velocity.x *= 0.86;
          velocity.z *= 0.86;
        }
        hit = true;
      }
      return hit;
    },
  };
}

function buildCityWall(scene, hookables) {
  // 城牆用雙面材質，這樣從城內看得到內側，鉤索的 raycast 也打得中
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8f8a7d, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(CITY_RADIUS + 8, CITY_RADIUS + 8, WALL_HEIGHT, 72, 1, true),
    wallMat
  );
  wall.position.y = WALL_HEIGHT / 2;
  scene.add(wall);
  hookables.push(wall);

  // 牆頂的一圈壓簷，讓天際線看起來有厚度
  const cap = new THREE.Mesh(
    new THREE.TorusGeometry(CITY_RADIUS + 8, 1.6, 6, 72),
    new THREE.MeshLambertMaterial({ color: 0x6f6a5f })
  );
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = WALL_HEIGHT;
  scene.add(cap);
  hookables.push(cap);
}

function buildDistrict(scene, hookables, buildings) {
  const rand = makeRandom(20090909); // 諫山創開始連載的年份，當個彩蛋
  const pitch = BLOCK_SIZE + STREET_WIDTH;
  const cells = Math.floor(CITY_RADIUS / pitch);

  for (let gx = -cells; gx <= cells; gx++) {
    for (let gz = -cells; gz <= cells; gz++) {
      const cx = gx * pitch;
      const cz = gz * pitch;
      const distFromCenter = Math.hypot(cx, cz);

      if (distFromCenter < pitch * 0.9) continue; // 中央廣場留空，當出生點
      if (distFromCenter > CITY_RADIUS - BLOCK_SIZE) continue; // 太靠近城牆就不蓋

      // 一個街廓切成 2x2 棟，高度各自不同，才有可以連續換錨點的落差
      const sub = BLOCK_SIZE / 2;
      for (let sx = 0; sx < 2; sx++) {
        for (let sz = 0; sz < 2; sz++) {
          if (rand() < 0.12) continue; // 偶爾留一塊空地

          const w = sub * (0.68 + rand() * 0.24);
          const d = sub * (0.68 + rand() * 0.24);
          const x = cx + (sx - 0.5) * sub;
          const z = cz + (sz - 0.5) * sub;

          // 越靠近市中心蓋得越高（也就越好盪）
          const centerBias = 1 - Math.min(1, distFromCenter / CITY_RADIUS);
          const height = 10 + rand() * 16 + centerBias * 22;

          addBuilding(scene, hookables, buildings, x, z, w, d, height, rand);
        }
      }
    }
  }

  // 幾座地標高塔，當作長距離移動的中繼錨點
  const towers = [
    [0, -pitch * 2.2, 68],
    [pitch * 2.6, pitch * 1.4, 60],
    [-pitch * 2.8, pitch * 2.0, 74],
    [-pitch * 1.2, -pitch * 3.4, 58],
  ];
  for (const [x, z, h] of towers) {
    addBuilding(scene, hookables, buildings, x, z, 16, 16, h, rand, 0x6d7a86);
  }
}

function addBuilding(scene, hookables, buildings, x, z, w, d, height, rand, forcedColor) {
  const color = forcedColor ?? WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, height, d),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.set(x, height / 2, z);
  scene.add(body);
  hookables.push(body);

  // 屋頂做成薄薄一片深色板子、比本體大一圈，飛在空中時比較看得出哪裡可以站。
  // 碰撞的可站立範圍必須跟這片視覺屋頂完全對齊——曾經只用本體的 w×d 判斷落地，
  // 屋頂視覺上凸出去的那一圈看起來像實地，踩上去卻直接落空，邊界感覺很模糊。
  const overhang = 1.2;
  const roofW = w + overhang;
  const roofD = d + overhang;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roofW, 0.8, roofD),
    new THREE.MeshLambertMaterial({ color: ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)] })
  );
  roof.position.set(x, height + 0.4, z);
  scene.add(roof);
  hookables.push(roof);

  buildings.push({
    minX: x - roofW / 2,
    maxX: x + roofW / 2,
    minZ: z - roofD / 2,
    maxZ: z + roofD / 2,
    height: height + 0.8, // 含屋頂板的厚度，站上去才不會腳陷進去
  });
}
