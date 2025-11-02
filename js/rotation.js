import { coordsXZY, indexXZY } from './schematic-reader.js';

function normalizeRotation(angle) {
  const numAngle = Number(angle);
  if (numAngle === 360) return 0;
  if (![0, 90, 180, 270].includes(numAngle)) {
    throw new Error(`Invalid rotation angle: ${angle}. Must be 0, 90, 180, 270, or 360.`);
  }
  return numAngle;
}

function rotateCoordinates(x, z, angle, originalWidth, originalLength) {
  switch (angle) {
    case 0:
      return [x, z];
    case 90:
      return [z, originalWidth - 1 - x];
    case 180:
      return [originalWidth - 1 - x, originalLength - 1 - z];
    case 270:
      return [originalLength - 1 - z, x];
    default:
      throw new Error(`Unsupported rotation angle: ${angle}`);
  }
}

function getRotatedDimensions(width, height, length, angle) {
  switch (angle) {
    case 0:
    case 180:
      return { width, height, length };
    case 90:
    case 270:
      return { width: length, height, length: width };
    default:
      throw new Error(`Unsupported rotation angle: ${angle}`);
  }
}

function applyRotation(schem, baseGetKeyAt, rotationAngle) {
  const angle = normalizeRotation(rotationAngle);

  if (angle === 0) {
    return {
      getKeyAt: baseGetKeyAt,
      rotatedSchem: schem
    };
  }

  const { width: originalWidth, height, length: originalLength } = schem;
  const rotatedDimensions = getRotatedDimensions(originalWidth, height, originalLength, angle);

  const rotatedSchem = {
    ...schem,
    width: rotatedDimensions.width,
    length: rotatedDimensions.length,
    height: rotatedDimensions.height
  };

  const rotatedGetKeyAt = (rotatedIndex) => {
    const [rotatedX, rotatedY, rotatedZ] = coordsXZY(
      rotatedIndex,
      rotatedDimensions.width,
      rotatedDimensions.height,
      rotatedDimensions.length
    );

    const [originalX, originalZ] = rotateCoordinates(
      rotatedX, rotatedZ,
      (360 - angle) % 360,
      rotatedDimensions.width, rotatedDimensions.length
    );

    const originalY = rotatedY;

    const originalIndex = indexXZY(
      originalX, originalY, originalZ,
      originalWidth, height, originalLength
    );

    return baseGetKeyAt(originalIndex);
  };

  return {
    getKeyAt: rotatedGetKeyAt,
    rotatedSchem: rotatedSchem
  };
}

export {
  normalizeRotation,
  rotateCoordinates,
  getRotatedDimensions,
  applyRotation
};
