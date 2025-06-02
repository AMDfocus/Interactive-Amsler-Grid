// In-browser React code (no exports/imports)
const { useRef, useState, useEffect, forwardRef, useImperativeHandle } = React;

// AmslerGrid: draws a 20×20 grid, supports freehand strokes, and can apply an inverse warp per line
const AmslerGrid = forwardRef(({ width = "400px", height = "400px", onDistortionChange, inverse = false }, ref) => {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [lines, setLines] = useState([]);           // stored raw strokes
  const [currentLine, setCurrentLine] = useState([]);
  const [integratedLines, setIntegratedLines] = useState([]); // one entry per grid line index

  useImperativeHandle(ref, () => ({ integrateStroke, resetGrid }));

  const getPoint = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    // Fill background white
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, parseInt(width), parseInt(height));

    const divisions = 20;
    const stepX = parseInt(width) / divisions;
    const stepY = parseInt(height) / divisions;

    // Draw all gridlines or warped lines
    for (let i = 0; i <= divisions; i++) {
      // Vertical line at x = i*stepX
      ctx.beginPath();
      const vLine = integratedLines.find(l => l.type === "v" && l.index === i);
      if (vLine) {
        // If inverse, compute inverse-warp points about baseX = i*stepX
        const baseX = i * stepX;
        const curvePts = inverse
          ? vLine.points.map(p => ({ x: 2 * baseX - p.x, y: p.y }))
          : vLine.points;
        ctx.moveTo(curvePts[0].x, 0);
        ctx.lineTo(curvePts[0].x, curvePts[0].y);
        curvePts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(curvePts[curvePts.length - 1].x, parseInt(height));
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
      } else {
        // draw straight
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, parseInt(height));
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Horizontal line at y = i*stepY
      ctx.beginPath();
      const hLine = integratedLines.find(l => l.type === "h" && l.index === i);
      if (hLine) {
        const baseY = i * stepY;
        const curvePts = inverse
          ? hLine.points.map(p => ({ x: p.x, y: 2 * baseY - p.y }))
          : hLine.points;
        ctx.moveTo(0, curvePts[0].y);
        ctx.lineTo(curvePts[0].x, curvePts[0].y);
        curvePts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(parseInt(width), curvePts[curvePts.length - 1].y);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
      } else {
        ctx.moveTo(0, i * stepY);
        ctx.lineTo(parseInt(width), i * stepY);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }

    // Draw central red dot
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(parseInt(width) / 2, parseInt(height) / 2, Math.min(parseInt(width), parseInt(height)) / 40, 0, 2 * Math.PI);
    ctx.fill();

    // Draw current freehand stroke in red
    if (drawing && currentLine.length > 1) {
      ctx.beginPath();
      ctx.moveTo(currentLine[0].x, currentLine[0].y);
      currentLine.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [integratedLines, currentLine, drawing, width, height, inverse]);

  useEffect(() => {
    if (onDistortionChange) onDistortionChange(integratedLines);
  }, [integratedLines, onDistortionChange]);

  const handleMouseDown = e => { setCurrentLine([getPoint(e)]); setDrawing(true); };
  const handleMouseMove = e => { if (drawing) setCurrentLine(l => [...l, getPoint(e)]); };
  const handleMouseUp = () => { if (drawing) setLines(l => [...l, currentLine]); setDrawing(false); };

  function integrateStroke() {
    const stroke = drawing ? currentLine : (lines[lines.length - 1] || []);
    if (!stroke.length) return;

    // Determine if stroke is more vertical or horizontal
    const xs = stroke.map(p => p.x), ys = stroke.map(p => p.y);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    const divisions = 20;
    const stepX = parseInt(width) / divisions;
    const stepY = parseInt(height) / divisions;

    let type, index, pts;
    if (dx < dy) {
      // vertical stroke -> warp a vertical grid line
      type = "v";
      index = Math.round(
        xs.reduce((sum, x) => sum + x, 0) / xs.length / stepX
      );
      // sort by y, then interpolate x for each row position
      const sorted = stroke.slice().sort((a, b) => a.y - b.y);
      const interpX = y => {
        if (y <= sorted[0].y) return sorted[0].x;
        if (y >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].x;
        for (let i = 0; i < sorted.length - 1; i++) {
          const p1 = sorted[i], p2 = sorted[i + 1];
          if (y >= p1.y && y <= p2.y) {
            const t = (y - p1.y) / (p2.y - p1.y);
            return p1.x + t * (p2.x - p1.x);
          }
        }
      };
      pts = Array.from({ length: divisions + 1 }, (_, i) => ({ x: interpX(i * stepY), y: i * stepY }));
    } else {
      // horizontal stroke -> warp a horizontal grid line
      type = "h";
      index = Math.round(
        ys.reduce((sum, y) => sum + y, 0) / ys.length / stepY
      );
      const sorted = stroke.slice().sort((a, b) => a.x - b.x);
      const interpY = x => {
        if (x <= sorted[0].x) return sorted[0].y;
        if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
        for (let i = 0; i < sorted.length - 1; i++) {
          const p1 = sorted[i], p2 = sorted[i + 1];
          if (x >= p1.x && x <= p2.x) {
            const t = (x - p1.x) / (p2.x - p1.x);
            return p1.y + t * (p2.y - p1.y);
          }
        }
      };
      pts = Array.from({ length: divisions + 1 }, (_, i) => ({ x: i * stepX, y: interpY(i * stepX) }));
    }

    setIntegratedLines(prev => [...prev, { type, index, points: pts }]);
    setCurrentLine([]);
  }

  function resetGrid() {
    setLines([]);
    setCurrentLine([]);
    setIntegratedLines([]);
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="border border-black"
    />
  );
});

// App: renders the grid plus controls
function FinalAmslerGridApp() {
  const gridRef = useRef();
  const [inverseView, setInverseView] = useState(false);
  const handleDistortions = lines => console.log("Distortions:", lines);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1E40AF', marginBottom: '16px' }}>
        Interactive 20×20 Amsler Grid
      </h2>
      {/* How-to-use instructions */}
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <p style={{ marginBottom: '4px' }}><strong>How to Use:</strong> Draw wavy lines on the grid where you see distortion.</p>
        <p style={{ marginBottom: '4px' }}>Click <em>Next</em> to integrate the stroke into the nearest grid line.</p>
        <p>Use <em>Reset</em> to clear the grid, or toggle between Distorted/Undistorted views.</p>
      </div>
      <AmslerGrid
        ref={gridRef}
        width="400"
        height="400"
        inverse={inverseView}
        onDistortionChange={handleDistortions}
      />
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => gridRef.current.integrateStroke()}
          style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >Next</button>
        <button
          onClick={() => gridRef.current.resetGrid()}
          style={{ backgroundColor: '#6B7280', color: '#FFFFFF', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >Reset</button>
        <button
          onClick={() => setInverseView(v => !v)}
          style={{ backgroundColor: '#10B981', color: '#FFFFFF', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >{inverseView ? "Distorted View" : "Undistorted View"}</button>
      </div>
      {/* Powered by footer */}
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <span style={{ color: '#1E40AF', fontSize: '14px' }}>Powered by University of South Australia</span>
      </div>
    </div>
  );
}

// Mount React app
ReactDOM.render(<FinalAmslerGridApp />, document.getElementById('root'));
