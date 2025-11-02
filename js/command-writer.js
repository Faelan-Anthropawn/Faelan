import { coordsXZY, indexXZY } from './schematic-reader.js';

function findOrigin(schem, getKeyAt) {
  const { width: w, height: h, length: l } = schem;
  let minX = w, minY = h, minZ = l;

  const volume = w * h * l;
  for (let i = 0; i < volume; i++) {
    const k = getKeyAt(i);
    if (!k) continue;

    const [x, y, z] = coordsXZY(i, w, h, l);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
  }

  return { x: minX, y: minY, z: minZ };
}

function generateCommands(schem, getKeyAt, options = {}) {
  const { width: w, height: h, length: l } = schem;
  const { origin = null, useRelativeCoords = true } = options;

  const actualOrigin = origin || findOrigin(schem, getKeyAt);
  const visited = new Uint8Array(w * h * l);
  const commands = [];

  if (getKeyAt.belowBoundsBarriers && getKeyAt.belowBoundsBarriers.length > 0) {
    const prefix = useRelativeCoords ? '~' : '';
    const barriers = getKeyAt.belowBoundsBarriers.slice().sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.z !== b.z) return a.z - b.z;
      return a.x - b.x;
    });

    const barrierVisited = new Set();

    for (const barrier of barriers) {
      const key = `${barrier.x},${barrier.y},${barrier.z}`;
      if (barrierVisited.has(key)) continue;

      let x0 = barrier.x, y0 = barrier.y, z0 = barrier.z;
      let x1 = x0, z1 = z0;

      while (barriers.some(b => b.x === x1 + 1 && b.y === y0 && b.z === z0 && !barrierVisited.has(`${x1 + 1},${y0},${z0}`))) {
        x1++;
      }

      outerZ: while (true) {
        for (let xi = x0; xi <= x1; xi++) {
          const checkKey = `${xi},${y0},${z1 + 1}`;
          if (!barriers.some(b => b.x === xi && b.y === y0 && b.z === z1 + 1) || barrierVisited.has(checkKey)) {
            break outerZ;
          }
        }
        z1++;
      }

      for (let zi = z0; zi <= z1; zi++) {
        for (let xi = x0; xi <= x1; xi++) {
          barrierVisited.add(`${xi},${y0},${zi}`);
        }
      }

      const rx1 = useRelativeCoords ? x0 - actualOrigin.x + 1 : x0;
      const ry1 = useRelativeCoords ? y0 - actualOrigin.y + 1 : y0;
      const rz1 = useRelativeCoords ? z0 - actualOrigin.z + 1 : z0;
      const rx2 = useRelativeCoords ? x1 - actualOrigin.x + 1 : x1;
      const rz2 = useRelativeCoords ? z1 - actualOrigin.z + 1 : z1;

      if (rx1 === rx2 && rz1 === rz2) {
        commands.push(`setblock ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} barrier`);
      } else {
        commands.push(`fill ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} ${prefix}${rx2} ${prefix}${ry1} ${prefix}${rz2} barrier`);
      }
    }
  }

  const sameKey = (i0, i1) => {
    const k0 = getKeyAt(i0);
    if (!k0) return false;
    return k0 === getKeyAt(i1);
  };

  for (let i = 0; i < visited.length; i++) {
    if (visited[i]) continue;
    const k0 = getKeyAt(i);

    if (!k0) {
      visited[i] = 1;
      continue;
    }

    const [x0, y0, z0] = coordsXZY(i, w, h, l);
    let x1 = x0, y1 = y0, z1 = z0;

    while (x1 + 1 < w) {
      const j = indexXZY(x1 + 1, y0, z0, w, h, l);
      if (visited[j] || !sameKey(i, j)) break;
      x1++;
    }

    outerZ: while (z1 + 1 < l) {
      for (let xi = x0; xi <= x1; xi++) {
        const j = indexXZY(xi, y0, z1 + 1, w, h, l);
        if (visited[j] || !sameKey(i, j)) break outerZ;
      }
      z1++;
    }

    outerY: while (y1 + 1 < h) {
      for (let zi = z0; zi <= z1; zi++) {
        for (let xi = x0; xi <= x1; xi++) {
          const j = indexXZY(xi, y1 + 1, zi, w, h, l);
          if (visited[j] || !sameKey(i, j)) break outerY;
        }
      }
      y1++;
    }

    for (let zi = z0; zi <= z1; zi++) {
      for (let yi = y0; yi <= y1; yi++) {
        for (let xi = x0; xi <= x1; xi++) {
          const j = indexXZY(xi, yi, zi, w, h, l);
          visited[j] = 1;
        }
      }
    }

    let rx1, ry1, rz1, rx2, ry2, rz2;

    if (useRelativeCoords) {
      rx1 = x0 - actualOrigin.x + 1;
      ry1 = y0 - actualOrigin.y + 1;
      rz1 = z0 - actualOrigin.z + 1;
      rx2 = x1 - actualOrigin.x + 1;
      ry2 = y1 - actualOrigin.y + 1;
      rz2 = z1 - actualOrigin.z + 1;
    } else {
      rx1 = x0; ry1 = y0; rz1 = z0;
      rx2 = x1; ry2 = y1; rz2 = z1;
    }

    if (rx1 === rx2 && ry1 === ry2 && rz1 === rz2) {
      const prefix = useRelativeCoords ? '~' : '';
      commands.push(`setblock ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} ${k0}`);
    } else {
      const prefix = useRelativeCoords ? '~' : '';
      commands.push(`fill ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} ${prefix}${rx2} ${prefix}${ry2} ${prefix}${rz2} ${k0}`);
    }
  }

  return commands;
}

function generateChunkCommands(schem, getKeyAt, chunkBounds, options = {}) {
  const { width: w, height: h, length: l } = schem;
  const { minX, minY, minZ, maxX, maxY, maxZ } = chunkBounds;
  const { useRelativeCoords = true } = options;

  const chunkWidth = maxX - minX + 1;
  const chunkHeight = maxY - minY + 1;
  const chunkLength = maxZ - minZ + 1;
  const chunkVolume = chunkWidth * chunkHeight * chunkLength;

  const visited = new Uint8Array(chunkVolume);
  const commands = [];

  if (getKeyAt.belowBoundsBarriers && getKeyAt.belowBoundsBarriers.length > 0) {
    const chunkBarriers = getKeyAt.belowBoundsBarriers
      .filter(b => b.x >= minX && b.x <= maxX && b.z >= minZ && b.z <= maxZ)
      .sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        if (a.z !== b.z) return a.z - b.z;
        return a.x - b.x;
      });

    const barrierVisited = new Set();

    for (const barrier of chunkBarriers) {
      const key = `${barrier.x},${barrier.y},${barrier.z}`;
      if (barrierVisited.has(key)) continue;

      let x0 = barrier.x, y0 = barrier.y, z0 = barrier.z;
      let x1 = x0, z1 = z0;

      while (x1 + 1 <= maxX && chunkBarriers.some(b => b.x === x1 + 1 && b.y === y0 && b.z === z0 && !barrierVisited.has(`${x1 + 1},${y0},${z0}`))) {
        x1++;
      }

      outerZ: while (z1 + 1 <= maxZ) {
        for (let xi = x0; xi <= x1; xi++) {
          const checkKey = `${xi},${y0},${z1 + 1}`;
          if (!chunkBarriers.some(b => b.x === xi && b.y === y0 && b.z === z1 + 1) || barrierVisited.has(checkKey)) {
            break outerZ;
          }
        }
        z1++;
      }

      for (let zi = z0; zi <= z1; zi++) {
        for (let xi = x0; xi <= x1; xi++) {
          barrierVisited.add(`${xi},${y0},${zi}`);
        }
      }

      let rx1, ry1, rz1, rx2, rz2;
      if (useRelativeCoords) {
        rx1 = x0 - minX;
        ry1 = y0 - minY;
        rz1 = z0 - minZ;
        rx2 = x1 - minX;
        rz2 = z1 - minZ;
        const prefix = '~';
        if (rx1 === rx2 && rz1 === rz2) {
          commands.push(`setblock ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} barrier`);
        } else {
          commands.push(`fill ${prefix}${rx1} ${prefix}${ry1} ${prefix}${rz1} ${prefix}${rx2} ${prefix}${ry1} ${prefix}${rz2} barrier`);
        }
      } else {
        rx1 = x0;
        ry1 = y0;
        rz1 = z0;
        rx2 = x1;
        rz2 = z1;
        if (rx1 === rx2 && rz1 === rz2) {
          commands.push(`setblock ${rx1} ${ry1} ${rz1} barrier`);
        } else {
          commands.push(`fill ${rx1} ${ry1} ${rz1} ${rx2} ${ry1} ${rz2} barrier`);
        }
      }
    }
  }

  const chunkToGlobalIndex = (cx, cy, cz) => {
    const globalX = minX + cx;
    const globalY = minY + cy;
    const globalZ = minZ + cz;
    return indexXZY(globalX, globalY, globalZ, w, h, l);
  };

  const chunkIndexToCoords = (i) => {
    const x = i % chunkWidth;
    const z = Math.floor(i / chunkWidth) % chunkLength;
    const y = Math.floor(i / (chunkWidth * chunkLength));
    return [x, y, z];
  };

  const sameKey = (i0, i1) => {
    const k0 = getKeyAt(i0);
    if (!k0) return false;
    return k0 === getKeyAt(i1);
  };

  for (let i = 0; i < chunkVolume; i++) {
    if (visited[i]) continue;

    const [cx0, cy0, cz0] = chunkIndexToCoords(i);
    const globalIndex = chunkToGlobalIndex(cx0, cy0, cz0);
    const k0 = getKeyAt(globalIndex);

    if (!k0) {
      visited[i] = 1;
      continue;
    }

    let cx1 = cx0, cy1 = cy0, cz1 = cz0;

    while (cx1 + 1 < chunkWidth && minX + cx1 + 1 <= maxX) {
      const nextGlobalIndex = chunkToGlobalIndex(cx1 + 1, cy0, cz0);
      const nextChunkIndex = (cx1 + 1) + cz0 * chunkWidth + cy0 * chunkWidth * chunkLength;
      if (visited[nextChunkIndex] || !sameKey(globalIndex, nextGlobalIndex)) break;
      cx1++;
    }

    outerZ: while (cz1 + 1 < chunkLength && minZ + cz1 + 1 <= maxZ) {
      for (let cxi = cx0; cxi <= cx1; cxi++) {
        const nextGlobalIndex = chunkToGlobalIndex(cxi, cy0, cz1 + 1);
        const nextChunkIndex = cxi + (cz1 + 1) * chunkWidth + cy0 * chunkWidth * chunkLength;
        if (visited[nextChunkIndex] || !sameKey(globalIndex, nextGlobalIndex)) break outerZ;
      }
      cz1++;
    }

    outerY: while (cy1 + 1 < chunkHeight && minY + cy1 + 1 <= maxY) {
      for (let czi = cz0; czi <= cz1; czi++) {
        for (let cxi = cx0; cxi <= cx1; cxi++) {
          const nextGlobalIndex = chunkToGlobalIndex(cxi, cy1 + 1, czi);
          const nextChunkIndex = cxi + czi * chunkWidth + (cy1 + 1) * chunkWidth * chunkLength;
          if (visited[nextChunkIndex] || !sameKey(globalIndex, nextGlobalIndex)) break outerY;
        }
      }
      cy1++;
    }

    for (let czz = cz0; czz <= cz1; czz++) {
      for (let cyy = cy0; cyy <= cy1; cyy++) {
        for (let cxx = cx0; cxx <= cx1; cxx++) {
          const chunkIndex = cxx + czz * chunkWidth + cyy * chunkWidth * chunkLength;
          visited[chunkIndex] = 1;
        }
      }
    }

    if (cx0 === cx1 && cy0 === cy1 && cz0 === cz1) {
      const prefix = useRelativeCoords ? '~' : '';
      commands.push(`setblock ${prefix}${cx0} ${prefix}${cy0} ${prefix}${cz0} ${k0}`);
    } else {
      const prefix = useRelativeCoords ? '~' : '';
      commands.push(`fill ${prefix}${cx0} ${prefix}${cy0} ${prefix}${cz0} ${prefix}${cx1} ${prefix}${cy1} ${prefix}${cz1} ${k0}`);
    }
  }

  return commands;
}

export {
  findOrigin,
  generateCommands,
  generateChunkCommands
};
