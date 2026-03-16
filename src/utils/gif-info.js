/**
 * Parse GIF binary to extract metadata without FFmpeg.
 * Reads the GIF89a/GIF87a header, logical screen descriptor, and
 * walks extension blocks to count frames and gather delays.
 */
export function parseGifInfo(data) {
  if (data.byteLength < 13) {
    return { width: 0, height: 0, frames: 0, duration: 0, delays: [], size: data.byteLength };
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);

  let frames = 0;
  let totalDelay = 0;
  const delays = [];

  // Skip header (13 bytes) + global color table
  const packed = data[10];
  const hasGCT = (packed >> 7) & 1;
  const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  let offset = 13 + gctSize;

  try {
    while (offset < data.length - 1) {
      const block = data[offset];

      if (block === 0x3b) break; // trailer

      if (block === 0x21) {
        // extension
        const label = data[offset + 1];
        if (label === 0xf9 && offset + 7 < data.length) {
          // graphic control extension
          const delay = view.getUint16(offset + 4, true) * 10; // centiseconds -> ms
          delays.push(delay || 100); // default 100ms if 0
          totalDelay += delay || 100;
          offset += 8; // fixed size block
        } else {
          // skip other extensions
          offset += 2;
          while (offset < data.length) {
            const sz = data[offset];
            if (sz === 0) { offset++; break; }
            offset += sz + 1;
          }
        }
      } else if (block === 0x2c) {
        // image descriptor
        frames++;
        if (offset + 10 >= data.length) break;
        const imgPacked = data[offset + 9];
        const hasLCT = (imgPacked >> 7) & 1;
        const lctSize = hasLCT ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0;
        offset += 10 + lctSize;
        if (offset >= data.length) break;
        offset++; // LZW minimum code size
        // skip sub-blocks
        while (offset < data.length) {
          const sz = data[offset];
          if (sz === 0) { offset++; break; }
          offset += sz + 1;
        }
      } else {
        offset++;
      }
    }
  } catch {
    // If parsing fails partway, return what we have so far
  }

  return {
    width,
    height,
    frames: Math.max(frames, 1),
    duration: totalDelay,
    delays,
    size: data.byteLength,
  };
}
