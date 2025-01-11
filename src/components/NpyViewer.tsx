import { Container, Sprite, Texture, Graphics, Text } from "pixi.js";
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

export function NpyViewer() {
  const [texture, setTexture] = useState<Texture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);
  // const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const npyDataRef = useRef<{
    min: number;
    max: number;
    data: Float32Array | Float64Array;
  }>();
  // const [scale, setScale] = useState(1);
  // Add state for axis limits
  const [axisLimits, setAxisLimits] = useState({
    xmin: 0,     // bottom-right
    xmax: 0.015, // bottom-left
    ymin: 0,     // bottom-left
    ymax: 20     // top-left
  });

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

  // Update handlePointerDown to correctly map coordinates
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (!texture) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (screenX < 0 || screenX > texture.width || screenY < 0 || screenY > texture.height) return;

    if (event.shiftKey) {
      // Map screen coordinates to axis values
      // X axis: right to left
      const xRatio = 1 - (screenX / texture.width);  // Invert X ratio
      // Y axis: bottom to top
      const yRatio = 1 - (screenY / texture.height); // Invert Y ratio
      
      // Calculate actual axis values
      const axisX = axisLimits.xmin + (axisLimits.xmax - axisLimits.xmin) * xRatio;
      const axisY = axisLimits.ymin + (axisLimits.ymax - axisLimits.ymin) * yRatio;

      // Get color from the image data
      const index = Math.floor(screenY) * texture.width + Math.floor(screenX);
      const value = npyDataRef.current?.data[index] || 0;
      
      setPoints(prev => [...prev, { 
        x: screenX,      // Screen coordinates for display
        y: screenY,
        axisX,          // Actual axis values
        axisY,
        value,
        color: 255      // Red color for points
      }]);
    } else if (event.altKey) {
      const nearestPoint = points.reduce((nearest, point) => {
        const distance = Math.sqrt(Math.pow(point.x - screenX, 2) + Math.pow(point.y - screenY, 2));
        return distance < nearest.distance ? { point, distance } : nearest;
      }, { point: null as Point | null, distance: Infinity });

      if (nearestPoint.point && nearestPoint.distance < 10) {
        setPoints(prev => prev.filter(p => p !== nearestPoint.point));
      }
    }
  }, [texture, points, axisLimits]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!texture) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (x < 0 || x > texture.width || y < 0 || y > texture.height) {
        setHoveredPoint(null);
        return;
      }

      const nearestPoint = points.reduce(
        (nearest, point) => {
          const distance = Math.sqrt(
            Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)
          );
          return distance < nearest.distance ? { point, distance } : nearest;
        },
        { point: null as Point | null, distance: Infinity }
      );

      setHoveredPoint(nearestPoint.distance < 10 ? nearestPoint.point : null);
    },
    [texture, points]
  );

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null);
      setIsLoading(true);
      setPoints([]);

      const file = event.target.files?.[0];
      if (!file) return;

      const npyjs = new NpyJs();
      const arrayBuffer = await file.arrayBuffer();
      const npyData = await npyjs.load(arrayBuffer);

      // Get dimensions from shape
      const width = npyData.shape[1];
      const height = npyData.shape[0];

      // Set initial axis limits based on image dimensions
      setAxisLimits({
        xmin: 0,
        xmax: width,
        ymin: 0,
        ymax: height
      });

      // Process image data
      let min = Number(npyData.data[0]);
      let max = min;
      for (let i = 1; i < npyData.data.length; i++) {
        const val = Number(npyData.data[i]);
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Create normalized data array
      const data = new Float32Array(npyData.data.length);
      for (let i = 0; i < npyData.data.length; i++) {
        data[i] = Math.floor(((Number(npyData.data[i]) - min) / (max - min)) * 255);
      }

      npyDataRef.current = { min, max, data };

      // Create canvas and context
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // Create ImageData
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i++) {
        const value = Math.floor(data[i]);
        const idx = i * 4;
        rgba[idx] = value;     // R
        rgba[idx + 1] = value; // G
        rgba[idx + 2] = value; // B
        rgba[idx + 3] = 255;   // A
      }

      const imgData = new ImageData(rgba, width, height);
      ctx.putImageData(imgData, 0, 0);

      // Create texture
      const newTexture = Texture.from(canvas);
      setTexture(newTexture);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NPY file");
      setTexture(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Update calculateDisplayValues to convert from screen to axis coordinates
  const calculateDisplayValues = (screenX: number, screenY: number) => {
    if (!texture) return { axisX: 0, axisY: 0 };

    // Calculate ratios based on screen position (fixed)
    const xRatio = 1 - (screenX / texture.width);  // Right to left
    const yRatio = 1 - (screenY / texture.height); // Bottom to top
    
    // Map to current axis limits (dynamic)
    const axisX = axisLimits.xmin + (axisLimits.xmax - axisLimits.xmin) * xRatio;
    const axisY = axisLimits.ymin + (axisLimits.ymax - axisLimits.ymin) * yRatio;
    
    return { axisX, axisY };
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <div className="mb-4">
        <input
          type="file"
          accept=".npy"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>

      {texture && (
        <div className="flex flex-col items-center">
          {/* Input fields in a single line */}
          <div className="flex gap-4 mb-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Y Max (Top Left):</label>
              <input
                type="number"
                value={axisLimits.ymax}
                onChange={(e) => handleAxisLimitChange("ymax", e.target.value)}
                className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                step="any"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Y Min (Bottom Left):</label>
              <input
                type="number"
                value={axisLimits.ymin}
                onChange={(e) => handleAxisLimitChange("ymin", e.target.value)}
                className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                step="any"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">X Max (Bottom Left):</label>
              <input
                type="number"
                value={axisLimits.xmax}
                onChange={(e) => handleAxisLimitChange("xmax", e.target.value)}
                className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                step="any"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">X Min (Bottom Right):</label>
              <input
                type="number"
                value={axisLimits.xmin}
                onChange={(e) => handleAxisLimitChange("xmin", e.target.value)}
                className="w-24 px-2 py-1 text-sm border rounded shadow-sm"
                step="any"
              />
            </div>
          </div>

          {/* PixiJS Component with outer container for labels */}
          <div className="relative">
            {/* Y-axis labels (left side) */}
            <div className="absolute -left-12 top-0 h-full flex flex-col justify-between">
              <div className="text-xs">{axisLimits.ymax.toFixed(1)}</div>
              <div className="text-xs">{axisLimits.ymin.toFixed(1)}</div>
            </div>

            {/* X-axis labels (bottom) */}
            <div className="absolute -bottom-6 left-0 w-full flex justify-between">
              <div className="text-xs">{axisLimits.xmax.toFixed(3)}</div>
              <div className="text-xs">{axisLimits.xmin.toFixed(3)}</div>
            </div>

            {/* PixiJS Component */}
            <div
              ref={containerRef}
              className="relative border border-gray-200 rounded-lg bg-white shadow-sm"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            >
              <Application
                width={texture.width}
                height={texture.height}
                background="#ffffff"
              >
                <pixiContainer x={0} y={0}>
                  <pixiSprite
                    texture={texture}
                    x={0}
                    y={0}
                    width={texture.width}
                    height={texture.height}
                  />
                  
                  {/* Points */}
                  <pixiGraphics
                    draw={g => {
                      g.clear();
                      points.forEach(point => {
                        const isHovered = hoveredPoint === point;
                        g.beginFill(0xFF0000);
                        g.drawCircle(point.x, point.y, isHovered ? 7 : 5);
                        if (isHovered) {
                          g.beginFill(0xFFFFFF, 0.8);
                          g.drawCircle(point.x, point.y, 3);
                        }
                        g.endFill();
                      });
                    }}
                  />
                </pixiContainer>
              </Application>

              {/* Tooltip */}
              {hoveredPoint && (
                <div className="absolute bg-white border border-black rounded px-1.5 py-0.5 text-xs shadow-sm pointer-events-none"
                    style={{
                      left: hoveredPoint.x + 15,
                      top: hoveredPoint.y - 15,
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
                      // Calculate current axis values based on screen position
                      const { axisX, axisY } = calculateDisplayValues(hoveredPoint.x, hoveredPoint.y);
                      return `(${axisX.toFixed(3)}, ${axisY.toFixed(3)})`;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-4 text-gray-600">Loading...</div>
      )}

      {error && <div className="text-center py-4 text-red-600">{error}</div>}

      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Controls:</h3>
        <ul className="space-y-1 text-sm text-gray-600">
          <li>Shift + Click: Add point</li>
          <li>Alt + Click: Remove point</li>
          <li>Hover over points to see coordinates</li>
        </ul>
      </div>
    </div>
  );
}
