import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';

interface SliderPuzzleCaptchaProps {
  onVerified: () => void;
}

const PUZZLE_WIDTH = 280;
const PUZZLE_HEIGHT = 160;
const PIECE_SIZE = 40;
const TOLERANCE = 5;

export function SliderPuzzleCaptcha({ onVerified }: SliderPuzzleCaptchaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pieceCanvasRef = useRef<HTMLCanvasElement>(null);
  const [targetX, setTargetX] = useState(0);
  const [sliderX, setSliderX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [seed, setSeed] = useState(0);
  const dragStartRef = useRef(0);
  const sliderStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetY = 40 + Math.floor((seed * 7 + 3) % 80);

  const generatePuzzle = useCallback(() => {
    const newTarget = 120 + Math.floor(Math.random() * (PUZZLE_WIDTH - PIECE_SIZE - 140));
    setTargetX(newTarget);
    setSliderX(0);
    setVerified(false);
    setFailed(false);
    setImageLoaded(false);
    setSeed(Math.floor(Math.random() * 1000));
  }, []);

  useEffect(() => {
    generatePuzzle();
  }, []);

  // Draw puzzle
  useEffect(() => {
    const canvas = canvasRef.current;
    const pieceCanvas = pieceCanvasRef.current;
    if (!canvas || !pieceCanvas) return;

    const ctx = canvas.getContext('2d');
    const pieceCtx = pieceCanvas.getContext('2d');
    if (!ctx || !pieceCtx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    // Use a deterministic gradient pattern instead of external image
    img.onload = () => {
      setImageLoaded(true);
      drawPuzzle(ctx, pieceCtx, img);
    };

    // Create a small data URL pattern image
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = PUZZLE_WIDTH;
    patternCanvas.height = PUZZLE_HEIGHT;
    const pCtx = patternCanvas.getContext('2d')!;

    // Generate a unique gradient pattern based on seed
    const hue1 = (seed * 37) % 360;
    const hue2 = (hue1 + 120) % 360;
    const hue3 = (hue1 + 240) % 360;

    const grad = pCtx.createLinearGradient(0, 0, PUZZLE_WIDTH, PUZZLE_HEIGHT);
    grad.addColorStop(0, `hsl(${hue1}, 60%, 50%)`);
    grad.addColorStop(0.5, `hsl(${hue2}, 70%, 45%)`);
    grad.addColorStop(1, `hsl(${hue3}, 65%, 55%)`);
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, PUZZLE_WIDTH, PUZZLE_HEIGHT);

    // Add some geometric shapes for visual complexity
    for (let i = 0; i < 12; i++) {
      const sx = ((seed * (i + 1) * 43) % PUZZLE_WIDTH);
      const sy = ((seed * (i + 1) * 67) % PUZZLE_HEIGHT);
      const size = 15 + ((seed * (i + 2)) % 30);
      const shapeHue = (hue1 + i * 30) % 360;
      pCtx.fillStyle = `hsla(${shapeHue}, 50%, 60%, 0.4)`;
      pCtx.beginPath();
      if (i % 3 === 0) {
        pCtx.arc(sx, sy, size / 2, 0, Math.PI * 2);
      } else if (i % 3 === 1) {
        pCtx.rect(sx - size / 2, sy - size / 2, size, size);
      } else {
        pCtx.moveTo(sx, sy - size / 2);
        pCtx.lineTo(sx + size / 2, sy + size / 2);
        pCtx.lineTo(sx - size / 2, sy + size / 2);
        pCtx.closePath();
      }
      pCtx.fill();
    }

    // Grid lines
    pCtx.strokeStyle = 'rgba(255,255,255,0.1)';
    pCtx.lineWidth = 1;
    for (let x = 0; x < PUZZLE_WIDTH; x += 20) {
      pCtx.beginPath();
      pCtx.moveTo(x, 0);
      pCtx.lineTo(x, PUZZLE_HEIGHT);
      pCtx.stroke();
    }
    for (let y = 0; y < PUZZLE_HEIGHT; y += 20) {
      pCtx.beginPath();
      pCtx.moveTo(0, y);
      pCtx.lineTo(PUZZLE_WIDTH, y);
      pCtx.stroke();
    }

    img.src = patternCanvas.toDataURL();
  }, [targetX, seed]);

  const drawPuzzle = (ctx: CanvasRenderingContext2D, pieceCtx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    const py = targetY;

    // Draw main image with cutout
    ctx.clearRect(0, 0, PUZZLE_WIDTH, PUZZLE_HEIGHT);
    ctx.drawImage(img, 0, 0, PUZZLE_WIDTH, PUZZLE_HEIGHT);

    // Draw cutout shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(targetX, py, PIECE_SIZE, PIECE_SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(targetX, py, PIECE_SIZE, PIECE_SIZE);

    // Draw puzzle piece
    pieceCtx.canvas.width = PIECE_SIZE + 4;
    pieceCtx.canvas.height = PUZZLE_HEIGHT;
    pieceCtx.clearRect(0, 0, PIECE_SIZE + 4, PUZZLE_HEIGHT);

    // Piece shadow
    pieceCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    pieceCtx.shadowBlur = 4;
    pieceCtx.shadowOffsetX = 2;
    pieceCtx.shadowOffsetY = 2;

    // Clip and draw the piece from the source image
    pieceCtx.save();
    pieceCtx.beginPath();
    pieceCtx.rect(2, py, PIECE_SIZE, PIECE_SIZE);
    pieceCtx.clip();
    pieceCtx.drawImage(img, -targetX + 2, 0, PUZZLE_WIDTH, PUZZLE_HEIGHT);
    pieceCtx.restore();

    // Border around piece
    pieceCtx.shadowColor = 'transparent';
    pieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    pieceCtx.lineWidth = 2;
    pieceCtx.strokeRect(2, py, PIECE_SIZE, PIECE_SIZE);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (verified) return;
    setIsDragging(true);
    setFailed(false);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartRef.current = clientX;
    sliderStartRef.current = sliderX;
  };

  const handleMove = useCallback((clientX: number) => {
    if (!isDragging || verified) return;
    const diff = clientX - dragStartRef.current;
    const newX = Math.max(0, Math.min(PUZZLE_WIDTH - PIECE_SIZE, sliderStartRef.current + diff));
    setSliderX(newX);
  }, [isDragging, verified]);

  const handleEnd = useCallback(() => {
    if (!isDragging || verified) return;
    setIsDragging(false);

    if (Math.abs(sliderX - targetX) <= TOLERANCE) {
      setVerified(true);
      setTimeout(() => onVerified(), 600);
    } else {
      setFailed(true);
      setTimeout(() => {
        setSliderX(0);
        setFailed(false);
      }, 500);
    }
  }, [isDragging, sliderX, targetX, verified, onVerified]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchend', onEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const sliderProgress = (sliderX / (PUZZLE_WIDTH - PIECE_SIZE)) * 100;

  return (
    <div ref={containerRef} className="w-full max-w-[320px] mx-auto select-none">
      <div className="border border-border rounded-sm overflow-hidden bg-muted/30">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Security Verification
            </span>
          </div>
          <button
            type="button"
            onClick={generatePuzzle}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Refresh puzzle"
          >
            <RefreshCw size={12} className="text-muted-foreground" />
          </button>
        </div>

        {/* Puzzle area */}
        <div className="relative" style={{ width: PUZZLE_WIDTH + 40, height: PUZZLE_HEIGHT, margin: '0 auto' }}>
          <canvas
            ref={canvasRef}
            width={PUZZLE_WIDTH}
            height={PUZZLE_HEIGHT}
            className="block mx-auto"
            style={{ width: PUZZLE_WIDTH, height: PUZZLE_HEIGHT }}
          />
          {/* Sliding piece */}
          <canvas
            ref={pieceCanvasRef}
            className="absolute top-0 pointer-events-none"
            style={{
              left: `${sliderX + ((containerRef.current?.offsetWidth || PUZZLE_WIDTH + 40) - PUZZLE_WIDTH) / 2}px`,
              width: PIECE_SIZE + 4,
              height: PUZZLE_HEIGHT,
              transition: isDragging ? 'none' : 'left 0.3s ease-out',
            }}
          />
          {/* Success overlay */}
          {verified && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center transition-opacity duration-300">
              <div className="bg-green-500 text-white rounded-full p-2">
                <Check size={20} strokeWidth={3} />
              </div>
            </div>
          )}
        </div>

        {/* Slider track */}
        <div className="px-3 py-3">
          <div className="relative h-9 bg-muted rounded-sm overflow-hidden border border-border">
            {/* Progress fill */}
            <div
              className={`absolute inset-y-0 left-0 transition-colors duration-200 ${
                verified ? 'bg-green-500/20' : failed ? 'bg-destructive/20' : 'bg-foreground/5'
              }`}
              style={{ width: `${sliderProgress}%` }}
            />

            {/* Instruction text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`text-xs text-muted-foreground transition-opacity duration-200 ${sliderX > 10 ? 'opacity-0' : 'opacity-100'}`}>
                {verified ? 'Verified!' : 'Slide to complete the puzzle →'}
              </span>
            </div>

            {/* Slider thumb */}
            <div
              className={`absolute top-0 bottom-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing border-r border-border transition-colors ${
                verified ? 'bg-green-500 text-white' : failed ? 'bg-destructive text-white' : 'bg-background hover:bg-muted'
              }`}
              style={{
                left: `${sliderProgress}%`,
                transform: 'translateX(0)',
                transition: isDragging ? 'none' : 'left 0.3s ease-out',
              }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown}
            >
              {verified ? (
                <Check size={16} strokeWidth={3} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground">
                  <path d="M9 3L13 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 3L1 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
