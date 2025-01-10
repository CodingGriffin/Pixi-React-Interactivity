import { Container, Sprite, Texture, Graphics, Text } from 'pixi.js';
import { useCallback, useState, useRef, useEffect } from 'react';
import NpyJs from 'npyjs';
import { Application, extend } from '@pixi/react';

extend({ Container, Sprite, Graphics, Text });

interface Point {
  x: number;
  y: number;
  value: number;
}

export function NpyViewer() {
  const [texture, setTexture] = useState<Texture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);
  // const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const npyDataRef = useRef<{ min: number; max: number; data: Float32Array | Float64Array }>();
  const [scale, setScale] = useState(1);
  
  // Update container size effect
  useEffect(() => {
    if (!texture) return;
    
    // Use exact dimensions from NPY data
    // setContainerSize({
    //   width: texture.width + 50,  // Add 50px for axis
    //   height: texture.height + 50
    // });
    
    // Scale is 1 since we're using exact dimensions
    setScale(1);
  }, [texture]);

  // Update pointer handlers to use scale
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (!texture) return;
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    // Convert screen coordinates to image coordinates
    const x = (event.clientX - rect.left - 50) / scale;
    const y = (event.clientY - rect.top) / scale;
    
    if (x < 0 || x > texture.width || y < 0 || y > texture.height) return;
    
    if (event.shiftKey) {
      const value = npyDataRef.current?.data[Math.floor(y) * texture.width + Math.floor(x)] || 0;
      setPoints(prev => [...prev, { x, y, value }]);
    } else if (event.altKey) {
      const nearestPoint = points.reduce((nearest, point) => {
        const distance = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
        return distance < nearest.distance ? { point, distance } : nearest;
      }, { point: null as Point | null, distance: Infinity });
      
      if (nearestPoint.point && nearestPoint.distance < 10 / scale) {
        setPoints(prev => prev.filter(p => p !== nearestPoint.point));
      }
    }
  }, [texture, points, scale]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!texture) return;
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left - 50) / scale;
    const y = (event.clientY - rect.top) / scale;
    
    if (x < 0 || x > texture.width || y < 0 || y > texture.height) {
      setHoveredPoint(null);
      return;
    }
    
    const nearestPoint = points.reduce((nearest, point) => {
      const distance = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
      return distance < nearest.distance ? { point, distance } : nearest;
    }, { point: null as Point | null, distance: Infinity });
    
    setHoveredPoint(nearestPoint.distance < 10 / scale ? nearestPoint.point : null);
  }, [texture, points, scale]);

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

      console.log(npyData);
      // First get min/max from original data
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
        // Normalize to 0-255 range
        data[i] = Math.floor(((Number(npyData.data[i]) - min) / (max - min)) * 255);
      }
      
      npyDataRef.current = { min, max, data };
      
      // Get dimensions from shape
      const width = npyData.shape[1];
      const height = npyData.shape[0];
      
      // Create canvas and context
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      
      // Create ImageData directly from Uint8ClampedArray
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
      console.log(imgData);
      ctx.putImageData(imgData, 0, 0);
      
      // Create texture directly from canvas
      const newTexture = Texture.from(canvas);
      setTexture(newTexture);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NPY file');
      setTexture(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        <div 
          ref={containerRef}
          className="relative overflow-x-auto border border-gray-200 rounded-lg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          <Application 
            width={texture.width + 50}
            height={texture.height + 50}
          >
            <pixiContainer x={50} y={0}>
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
                    g.beginFill(0xFF0000);
                    g.drawCircle(point.x, point.y, 5);
                    g.endFill();
                  });
                }}
              />
              
              {/* Axes */}
              <pixiGraphics
                draw={g => {
                  g.clear();
                  g.lineStyle(1, 0x000000);
                  
                  g.moveTo(-50, 0);
                  g.lineTo(-50, texture.height);
                  
                  g.moveTo(0, texture.height);
                  g.lineTo(texture.width, texture.height);
                  
                  if (npyDataRef.current) {
                    const { min, max } = npyDataRef.current;
                    new Text(`${max.toFixed(2)}`, {
                      fontSize: 12,
                      fill: 0x000000,
                    }).position.set(-45, 0);
                    
                    new Text(`${min.toFixed(2)}`, {
                      fontSize: 12,
                      fill: 0x000000,
                    }).position.set(-45, texture.height - 15);
                  }
                }}
              />
            </pixiContainer>
          </Application>
          
          {/* Tooltip */}
          {hoveredPoint && (
            <div className="absolute bg-white border border-gray-200 rounded px-2 py-1 text-sm pointer-events-none"
                 style={{
                   left: hoveredPoint.x + 60,
                   top: hoveredPoint.y + 10,
                 }}>
              ({Math.round(hoveredPoint.x)}, {Math.round(hoveredPoint.y)})
            </div>
          )}
        </div>
      )}
      
      {isLoading && (
        <div className="text-center py-4 text-gray-600">Loading...</div>
      )}
      
      {error && (
        <div className="text-center py-4 text-red-600">{error}</div>
      )}
      
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