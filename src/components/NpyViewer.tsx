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

  return (
    <div className="flex flex-col items-center">
      {/* File Input - Fixed position */}
      <div className="w-full max-w-xl mb-8">
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

        {/* Controls Info */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg w-full max-w-md">
          <h3 className="font-semibold mb-2 text-center">Controls:</h3>
          <ul className="space-y-1 text-sm text-gray-600 text-center">
            <li>Shift + Click: Add point</li>
            <li>Alt + Click: Remove point</li>
            <li>Hover over points to see coordinates</li>
          </ul>
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
