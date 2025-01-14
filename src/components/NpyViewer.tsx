import { Container, Sprite, Texture, Graphics, Text, FederatedPointerEvent } from "pixi.js";
import { useCallback, useState, useRef, useEffect } from "react";
import NpyJs from "npyjs";
import { Application, extend } from "@pixi/react";

extend({ Container, Sprite, Graphics, Text });

interface Point {
  x: number;
  y: number;
  axisX: number;
  axisY: number;
  value: number;
  color: number;
}

// Add color map types and helper functions
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Parse RGB string to RGB object
const parseRGB = (rgbStr: string): RGB => {
  const matches = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!matches) throw new Error('Invalid RGB string');
  return {
    r: parseInt(matches[1]),
    g: parseInt(matches[2]),
    b: parseInt(matches[3])
  };
};

// Linear interpolation between two RGB colors
const interpolateRGB = (color1: RGB, color2: RGB, ratio: number): RGB => {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * ratio),
    g: Math.round(color1.g + (color2.g - color1.g) * ratio),
    b: Math.round(color1.b + (color2.b - color1.b) * ratio)
  };
};

// Get color for a normalized value using the color map
const getColorFromMap = (normalizedValue: number, colorMap: string[]): RGB => {
  const rgbColors = colorMap.map(parseRGB);
  const segments = rgbColors.length - 1;
  const segment = Math.min(Math.floor(normalizedValue * segments), segments - 1);
  const segmentRatio = (normalizedValue * segments) - segment;

  return interpolateRGB(rgbColors[segment], rgbColors[segment + 1], segmentRatio);
};

// Update COLOR_MAPS with ColorBrewer schemes
const COLOR_MAPS = {
  'RdYlBu': [
    'rgb(165,0,38)',
    'rgb(215,48,39)',
    'rgb(244,109,67)',
    'rgb(253,174,97)',
    'rgb(254,224,144)',
    'rgb(255,255,191)',
    'rgb(224,243,248)',
    'rgb(171,217,233)',
    'rgb(116,173,209)',
    'rgb(69,117,180)',
    'rgb(49,54,149)'
  ],
  'Spectral': [
    'rgb(158,1,66)',
    'rgb(213,62,79)',
    'rgb(244,109,67)',
    'rgb(253,174,97)',
    'rgb(254,224,139)',
    'rgb(255,255,191)',
    'rgb(230,245,152)',
    'rgb(171,221,164)',
    'rgb(102,194,165)',
    'rgb(50,136,189)',
    'rgb(94,79,162)'
  ],
  'PuOr': [
    'rgb(127,59,8)',
    'rgb(179,88,6)',
    'rgb(224,130,20)',
    'rgb(253,184,99)',
    'rgb(254,224,182)',
    'rgb(247,247,247)',
    'rgb(216,218,235)',
    'rgb(178,171,210)',
    'rgb(128,115,172)',
    'rgb(84,39,136)',
    'rgb(45,0,75)'
  ],
  'RdGy': [
    'rgb(103,0,31)',
    'rgb(178,24,43)',
    'rgb(214,96,77)',
    'rgb(244,165,130)',
    'rgb(253,219,199)',
    'rgb(255,255,255)',
    'rgb(224,224,224)',
    'rgb(186,186,186)',
    'rgb(135,135,135)',
    'rgb(77,77,77)',
    'rgb(26,26,26)'
  ]
};

// Add type for color maps
type ColorMapKey = keyof typeof COLOR_MAPS;

// Add type for original data
interface NpyData {
  data: Float32Array | Float64Array | Uint8Array | Uint16Array | Int8Array | Int16Array | Int32Array | BigUint64Array | BigInt64Array;
  shape: number[];
  min: number;
  max: number;
}

export function NpyViewer() {
  const [texture, setTexture] = useState<Texture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedPoint, setDraggedPoint] = useState<Point | null>(null);
  // const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const npyDataRef = useRef<{
    min: number;
    max: number;
    data: Float32Array | Float64Array | Uint8Array | Uint16Array | Int8Array | Int16Array | Int32Array | BigUint64Array | BigInt64Array;
  }>();
  // const [scale, setScale] = useState(1);
  // Add state for axis limits
  const [axisLimits, setAxisLimits] = useState({
    xmin: 0,     // bottom-right
    xmax: 0.015, // bottom-left
    ymin: 0,     // bottom-left
    ymax: 20     // top-left
  });

  // Add state for selected color map
  const [selectedColorMap, setSelectedColorMap] = useState<ColorMapKey>('RdYlBu');

  // Add lastFileRef
  const lastFileRef = useRef<File | null>(null);

  // Update state and refs
  const [imageTransform, setImageTransform] = useState({
    flipHorizontal: false,
    flipVertical: false,
    rotationCounterClockwise: false,
    rotationClockwise: false
  });

  // Add ref for original data
  const originalDataRef = useRef<NpyData | null>(null);

  // Add transform function that works with stored data
  const applyTransformations = useCallback(() => {
    if (!originalDataRef.current) return;

    const { data, shape } = originalDataRef.current;
    const [height, width] = shape;
    const transformed = new Float32Array(data.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let dstX = x;
        let dstY = y;

        // Apply counter-clockwise rotation (90° CCW)
        if (imageTransform.rotationCounterClockwise) {
          [dstX, dstY] = [dstY, width - 1 - dstX];
        }

        // Apply clockwise rotation (90° CW)
        if (imageTransform.rotationClockwise) {
          [dstX, dstY] = [height - 1 - dstY, dstX];
        }

        // Apply flips after rotations
        const isRotated = imageTransform.rotationCounterClockwise || imageTransform.rotationClockwise;
        const currentWidth = isRotated ? height : width;
        const currentHeight = isRotated ? width : height;

        if (imageTransform.flipHorizontal) {
          dstX = currentWidth - 1 - dstX;
        }
        if (imageTransform.flipVertical) {
          dstY = currentHeight - 1 - dstY;
        }

        const srcIndex = y * width + x;
        const dstIndex = dstY * (isRotated ? height : width) + dstX;
        transformed[dstIndex] = Number(data[srcIndex]);
      }
    }

    // Create canvas with appropriate dimensions
    const canvas = document.createElement("canvas");
    const isRotated = imageTransform.rotationCounterClockwise || imageTransform.rotationClockwise;
    canvas.width = isRotated ? height : width;
    canvas.height = isRotated ? width : height;
    const ctx = canvas.getContext("2d")!;

    // Create ImageData with color mapping
    const rgba = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    const { min, max } = originalDataRef.current;
    const colorMap = COLOR_MAPS[selectedColorMap];

    for (let i = 0; i < transformed.length; i++) {
      const normalizedValue = (transformed[i] - min) / (max - min);
      const color = getColorFromMap(normalizedValue, colorMap);
      const idx = i * 4;
      rgba[idx] = color.r;
      rgba[idx + 1] = color.g;
      rgba[idx + 2] = color.b;
      rgba[idx + 3] = 255;
    }

    const imgData = new ImageData(rgba, canvas.width, canvas.height);
    ctx.putImageData(imgData, 0, 0);

    // Create texture
    const newTexture = Texture.from(canvas);
    setTexture(newTexture);
  }, [imageTransform, selectedColorMap]);

  // Update container size effect
  useEffect(() => {
    if (!texture) return;

    // Use exact dimensions from NPY data
    // setContainerSize({
    //   width: texture.width + 50,  // Add 50px for axis
    //   height: texture.height + 50
    // });

    // Scale is 1 since we're using exact dimensions
    // setScale(1);
  }, [texture]);

  // Add function to convert screen coordinates to axis coordinates
  // const screenToAxisCoords = (screenX: number, screenY: number) => {
  //   const xRange = axisLimits.xmax - axisLimits.xmin;
  //   const yRange = axisLimits.ymax - axisLimits.ymin;

  //   // Convert screen coordinates to axis values
  //   const x = axisLimits.xmin + (screenX / texture!.width) * xRange;
  //   const y = axisLimits.ymax - (screenY / texture!.height) * yRange; // Invert Y axis

  //   return { x, y };
  // };

  // Move this function before handlePointerDown
  const calculateDisplayValues = (screenX: number, screenY: number) => {
    if (!texture) return { axisX: 0, axisY: 0 };

    // For x: right to left (screenX = 0 maps to xmax, screenX = 800 maps to xmin)
    const xRatio = (800 - screenX) / 800;  // Invert X direction
    const axisX = axisLimits.xmin + xRatio * (axisLimits.xmax - axisLimits.xmin);

    // For y: bottom to top (screenY = 400 maps to ymin, screenY = 0 maps to ymax)
    const yRatio = (400 - screenY) / 400;  // Invert Y direction
    const axisY = axisLimits.ymin + yRatio * (axisLimits.ymax - axisLimits.ymin);

    return { axisX, axisY };
  };

  // Add helper function to clamp coordinates
  const clampCoordinates = (x: number, y: number) => {
    return {
      x: Math.max(0, Math.min(800, x)),  // Clamp x between 0 and 800
      y: Math.max(0, Math.min(400, y))   // Clamp y between 0 and 400
    };
  };

  // Update handlePointerDown to correctly map coordinates
  const handlePointerDown = useCallback((event: FederatedPointerEvent) => {
    if (!texture) return;

    const x = event.global.x;
    const y = event.global.y;

    // Check for existing point first
    const clickedPoint = points.find(point => {
      const dx = point.x - x;
      const dy = point.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 10;
    });

    if (clickedPoint) {
      if (event.altKey) {
        // Remove point
        setPoints(prev => prev.filter(p => p !== clickedPoint));
        setHoveredPoint(null);
      } else {
        // Start dragging
        setIsDragging(true);
        setDraggedPoint(clickedPoint);
      }
      return;
    }

    // Add new point with Shift
    if (event.shiftKey) {
      const { axisX, axisY } = calculateDisplayValues(x, y);
      const newPoint = { x, y, value: 0, axisX, axisY, color: 0xFF0000 };
      setPoints(prev => [...prev, newPoint]);
    }
  }, [texture, points]);

  const handlePointerMove = useCallback((event: FederatedPointerEvent) => {
    if (!texture) return;

    const x = event.global.x;
    const y = event.global.y;

    if (isDragging && draggedPoint) {
      // Clamp coordinates to image bounds
      const { x: clampedX, y: clampedY } = clampCoordinates(x, y);

      const { axisX, axisY } = calculateDisplayValues(clampedX, clampedY);
      const updatedPoint = {
        ...draggedPoint,
        x: clampedX,
        y: clampedY,
        axisX,
        axisY
      };

      setPoints(prev => prev.map(p => p === draggedPoint ? updatedPoint : p));
      setDraggedPoint(updatedPoint);
    } else {
      // Handle hover with clamped coordinates
      const { x: clampedX, y: clampedY } = clampCoordinates(x, y);
      const hoveredPoint = points.find(point => {
        const dx = point.x - clampedX;
        const dy = point.y - clampedY;
        return Math.sqrt(dx * dx + dy * dy) < 10;
      });
      setHoveredPoint(hoveredPoint || null);
    }
  }, [texture, isDragging, draggedPoint, points]);

  const handlePointerUp = useCallback((event: FederatedPointerEvent) => {
    if (draggedPoint) {
      // Update hover state with the final position
      const x = event.global.x;
      const y = event.global.y;

      // Find point at the current mouse position
      const pointAtPosition = points.find(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        return Math.sqrt(dx * dx + dy * dy) < 10;
      });

      setHoveredPoint(pointAtPosition || null);
    }

    setIsDragging(false);
    setDraggedPoint(null);
  }, [points, draggedPoint]);

  // Update handleFileSelect to store original data
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    lastFileRef.current = file;

    try {
      setError(null);
      setIsLoading(true);
      setPoints([]);

      const npyjs = new NpyJs();
      const arrayBuffer = await file.arrayBuffer();
      const npyData = await npyjs.load(arrayBuffer);

      // Find min/max values
      let min = Number(npyData.data[0]);
      let max = min;
      for (let i = 1; i < npyData.data.length; i++) {
        const val = Number(npyData.data[i]);
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Store original data
      originalDataRef.current = {
        data: npyData.data,
        shape: npyData.shape,
        min,
        max
      };

      // Apply initial transformations
      applyTransformations();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NPY file");
      setTexture(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyTransformations]);

  // Update handleAxisLimitChange to handle immediate updates
  const handleAxisLimitChange = (
    axis: "xmin" | "xmax" | "ymin" | "ymax",
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setAxisLimits(prev => {
        const newLimits = { ...prev, [axis]: numValue };
        // Validate limits
        if (newLimits.xmin >= newLimits.xmax || newLimits.ymin >= newLimits.ymax) {
          return prev; // Don't update if invalid
        }
        return newLimits;
      });
    }
  };

  // Add tick marks for better visualization
  // const drawAxes = (g: Graphics) => {
  //   g.clear();
  //   g.lineStyle(1, 0x000000);

  //   // Draw border
  //   g.drawRect(0, 0, texture!.width, texture!.height);

  //   // Y-axis ticks (0 to 20, step by 5)
  //   for (let y = 0; y <= 20; y += 5) {
  //     const yPos = texture!.height - (y / 20) * texture!.height;
  //     g.moveTo(-5, yPos);
  //     g.lineTo(0, yPos);
  //     new Text(`${y}`, {
  //       fontSize: 10,
  //       fill: 0x000000,
  //     }).position.set(-25, yPos - 5);
  //   }

  //   // X-axis ticks (0.015 to 0.030, step by 0.005)
  //   for (let x = 0.015; x <= 0.030; x += 0.005) {
  //     const xPos = ((x - 0.015) / 0.015) * texture!.width;
  //     g.moveTo(xPos, texture!.height);
  //     g.lineTo(xPos, texture!.height + 5);
  //     new Text(`${x.toFixed(3)}`, {
  //       fontSize: 10,
  //       fill: 0x000000,
  //     }).position.set(xPos - 15, texture!.height + 10);
  //   }
  // };

  // Add window-level pointer up handler using useEffect
  useEffect(() => {
    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (draggedPoint) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Find point at the final position
          const pointAtPosition = points.find(point => {
            const dx = point.x - x;
            const dy = point.y - y;
            return Math.sqrt(dx * dx + dy * dy) < 10;
          });

          setHoveredPoint(pointAtPosition || null);
        }
      }

      setIsDragging(false);
      setDraggedPoint(null);
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [points, draggedPoint]);

  // Add download function
  const handleDownloadPoints = useCallback(() => {
    // Sort points by x-axis value and format with display values
    const pointsData = points
      .map(point => {
        const { axisX, axisY } = calculateDisplayValues(point.x, point.y);
        return { axisX, axisY };
      })
      .sort((a, b) => a.axisX - b.axisX)  // Sort in descending order (right to left)
      .map(point => `${point.axisX.toFixed(3)}, ${point.axisY.toFixed(3)}`)
      .join('\n');

    // Create blob and download link
    const blob = new Blob([pointsData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plotted_points.txt';

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [points, calculateDisplayValues]);

  // Update reprocessImage to accept colorMapKey parameter
  const reprocessImage = async (file: File, colorMapKey: ColorMapKey) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const npyjs = new NpyJs();
      const npyData = await npyjs.load(arrayBuffer);

      // Get dimensions from shape
      const width = npyData.shape[1];
      const height = npyData.shape[0];

      // Find min/max values
      let min = Number(npyData.data[0]);
      let max = min;
      for (let i = 1; i < npyData.data.length; i++) {
        const val = Number(npyData.data[i]);
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Use passed color map key
      const colorMap = COLOR_MAPS[colorMapKey];

      // Create canvas and context
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // Create ImageData with color mapping
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < npyData.data.length; i++) {
        const normalizedValue = (Number(npyData.data[i]) - min) / (max - min);
        const color = getColorFromMap(normalizedValue, colorMap);
        const idx = i * 4;
        rgba[idx] = color.r;
        rgba[idx + 1] = color.g;
        rgba[idx + 2] = color.b;
        rgba[idx + 3] = 255;
      }

      const imgData = new ImageData(rgba, width, height);
      ctx.putImageData(imgData, 0, 0);

      // Create texture
      const newTexture = Texture.from(canvas);
      setTexture(newTexture);
      npyDataRef.current = { min, max, data: npyData.data };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reprocess image");
    }
  };

  // Add effect to apply transformations when state changes
  useEffect(() => {
    if (originalDataRef.current) {
      applyTransformations();
    }
  }, [imageTransform, selectedColorMap, applyTransformations]);

  return (
    <div className="flex flex-col items-center">
      {/* Add transformation controls */}


      {/* File Input - Fixed position */}
      <div className="w-full max-w-xl mb-8">
        <input
          type="file"
          accept=".npy"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 mb-4
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
        <div className="flex flex-wrap gap-2 justify-center">
          {(Object.keys(COLOR_MAPS) as ColorMapKey[]).map(mapName => (
            <button
              key={mapName}
              onClick={() => {
                setSelectedColorMap(mapName);
                if (lastFileRef.current && npyDataRef.current) {
                  reprocessImage(lastFileRef.current, mapName);  // Pass the new color map key
                }
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${selectedColorMap === mapName
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
            >
              {mapName}
            </button>
          ))}
        </div>
      </div>

      {/* Fixed height container for the rest of the content */}
      <div className="h-[600px] flex flex-col items-center">
        {/* Axis Inputs */}
        <div className="h-[52px] mb-8">
          {texture && (
            <div className="flex gap-4 flex-wrap justify-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Y Max (Top Left):</label>
                <input
                  type="number"
                  value={axisLimits.ymax}
                  onChange={(e) => handleAxisLimitChange("ymax", e.target.value)}
                  className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                  step="1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Y Min (Bottom Left):</label>
                <input
                  type="number"
                  value={axisLimits.ymin}
                  onChange={(e) => handleAxisLimitChange("ymin", e.target.value)}
                  className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                  step="1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">X Max (Bottom Left):</label>
                <input
                  type="number"
                  value={axisLimits.xmax}
                  onChange={(e) => handleAxisLimitChange("xmax", e.target.value)}
                  className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                  step="1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">X Min (Bottom Right):</label>
                <input
                  type="number"
                  value={axisLimits.xmin}
                  onChange={(e) => handleAxisLimitChange("xmin", e.target.value)}
                  className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                  step="1"
                />
              </div>
            </div>
          )}
        </div>

        {/* Viewer Container */}
        <div>
          {texture ? (
            <div className="relative bg-white p-4 rounded-lg shadow-md">
              {/* Y-axis labels (left side) */}
              <div className="absolute -left-12 top-0 h-full flex flex-col justify-between">
                <div className="text-xs">{axisLimits.ymax.toFixed(3)}</div>
                <div className="text-xs">{axisLimits.ymin.toFixed(3)}</div>
              </div>

              {/* X-axis labels (bottom) */}
              <div className="absolute -bottom-6 left-0 w-full flex justify-between">
                <div className="text-xs">{axisLimits.xmax.toFixed(3)}</div>
                <div className="text-xs">{axisLimits.xmin.toFixed(3)}</div>
              </div>

              {/* Add axis labels */}
              {/* <div className="absolute -left-16 top-1/2 -rotate-90 text-sm font-medium text-gray-600">
                Frequency
              </div> */}
              {/* <div className="absolute bottom-[-2rem] w-full text-center text-sm font-medium text-gray-600">
                Slowness
              </div> */}

              {/* PixiJS Component */}
              <div
                ref={containerRef}
                className="relative border border-gray-200 rounded-lg bg-white shadow-sm"
              >
                <Application
                  width={800}
                  height={400}
                  background="#ffffff"
                >
                  <pixiContainer x={0} y={0}>
                    <pixiSprite
                      texture={texture || undefined}
                      x={0}
                      y={0}
                      width={800}
                      height={400}
                    />

                    {/* Points and Interactive Area */}
                    <pixiGraphics
                      draw={g => {
                        g.clear();
                        // Draw interactive area
                        g.beginFill(0xFFFFFF, 0);
                        g.drawRect(0, 0, 800, 400);
                        g.endFill();

                        // Draw points
                        points.forEach(point => {
                          const isActive = point === draggedPoint || point === hoveredPoint;
                          g.beginFill(0xFF0000);
                          g.drawCircle(point.x, point.y, isActive ? 7 : 5);
                          if (isActive) {
                            g.beginFill(0xFFFFFF, 0.8);
                            g.drawCircle(point.x, point.y, 3);
                          }
                          g.endFill();
                        });
                      }}
                      eventMode="static"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerUpOutside={handlePointerUp}
                    />
                  </pixiContainer>
                </Application>

                {/* Tooltip */}
                {(hoveredPoint || draggedPoint) && (
                  <div
                    className="absolute bg-white border border-black rounded px-1.5 py-0.5 text-xs shadow-sm pointer-events-none"
                    style={{
                      left: (draggedPoint || hoveredPoint)!.x + 15,
                      top: (draggedPoint || hoveredPoint)!.y - 15,
                      zIndex: 1000
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <div
                        className="w-3 h-3 border border-black"
                        style={{
                          background: "rgb(255, 0, 0)"
                        }}
                      />
                      {(() => {
                        const point = draggedPoint || hoveredPoint;
                        const { axisX, axisY } = calculateDisplayValues(point!.x, point!.y);
                        return `(${axisX.toFixed(3)}, ${axisY.toFixed(3)})`;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-[800px] h-[400px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">Load an NPY file to view</p>
            </div>
          )}
        </div>
        {texture && (
          <div className="mb-4 flex gap-4 mt-5">
            <button
              onClick={() => {
                setImageTransform(prev => ({
                  ...prev,
                  rotationCounterClockwise: !prev.rotationCounterClockwise,
                  rotationClockwise: false // Disable clockwise when counter-clockwise is enabled
                }));
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${imageTransform.rotationCounterClockwise
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
            >
              Rotate Counter-clockwise
            </button>
            <button
              onClick={() => {
                setImageTransform(prev => ({
                  ...prev,
                  rotationClockwise: !prev.rotationClockwise,
                  rotationCounterClockwise: false // Disable counter-clockwise when clockwise is enabled
                }));
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${imageTransform.rotationClockwise
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
            >
              Rotate Clockwise
            </button>
            <button
              onClick={() => {
                setImageTransform(prev => ({
                  ...prev,
                  flipHorizontal: !prev.flipHorizontal
                }));
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${imageTransform.flipHorizontal
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
            >
              Flip Horizontal
            </button>
            <button
              onClick={() => {
                setImageTransform(prev => ({
                  ...prev,
                  flipVertical: !prev.flipVertical
                }));
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${imageTransform.flipVertical
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
            >
              Flip Vertical
            </button>
          </div>
        )}
        {/* Controls Info */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg w-full max-w-md">
          <h3 className="font-semibold mb-2 text-center">Controls:</h3>
          <ul className="space-y-1 text-sm text-gray-600 text-center">
            <li>Shift + Click: Add point</li>
            <li>Alt + Click: Remove point</li>
            <li>Hover over points to see coordinates</li>
          </ul>
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleDownloadPoints}
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
              disabled={points.length === 0}
            >
              Download Points
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      )}

      {error && (
        <div className="mt-4 text-center text-red-600">{error}</div>
      )}
    </div>
  );
}
