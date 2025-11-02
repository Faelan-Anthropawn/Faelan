// Browser-compatible mirroring module
import { coordsXZY, indexXZY } from './schematic-reader.js';

function mirrorCoordinates(x, y, z, mirrorX, mirrorY, mirrorZ, width, height, length) {
  let newX = x;
  let newY = y;
  let newZ = z;

  if (mirrorX) {
    newX = width - 1 - x;
  }

  if (mirrorY) {
    newY = height - 1 - y;
  }

  if (mirrorZ) {
    newZ = length - 1 - z;
  }

  return [newX, newY, newZ];
}

function applyMirroring(schem, baseGetKeyAt, mirrorX, mirrorY, mirrorZ) {
  if (!mirrorX && !mirrorY && !mirrorZ) {
    return baseGetKeyAt;
  }

  const { width, height, length } = schem;

  const mirroredGetKeyAt = (mirroredIndex) => {
    const [mirroredX, mirroredY, mirroredZ] = coordsXZY(
      mirroredIndex,
      width, height, length
    );

    const [originalX, originalY, originalZ] = mirrorCoordinates(
      mirroredX, mirroredY, mirroredZ,
      mirrorX, mirrorY, mirrorZ,
      width, height, length
    );

    const originalIndex = indexXZY(
      originalX, originalY, originalZ,
      width, height, length
    );

    return baseGetKeyAt(originalIndex);
  };

  return mirroredGetKeyAt;
}

export {
  mirrorCoordinates,
  applyMirroring
};
