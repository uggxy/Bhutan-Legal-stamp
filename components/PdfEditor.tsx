import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import type { Stamp } from '../types';
import { STAMP_IMAGE_BASE64 } from '../constants';

interface PdfEditorProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  stamp: Stamp | undefined;
  onStampChange: (stamp: Stamp | null) => void;
  isActive: boolean;
  onSelectPage: () => void;
}

const PdfEditor: React.FC<PdfEditorProps> = ({ pdfDoc, pageNumber, stamp, onStampChange, isActive, onSelectPage }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
      const containerWidth = containerRef.current.clientWidth;
      
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;
    };

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    if (isActive && wrapperRef.current) {
        wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const getRelativeCoords = (e: React.MouseEvent): { x: number; y: number } => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const p2 = (wrapperRef.current?.getClientRects()[0].x || 0) + 8;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleStampMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!stamp) return;

    const coords = getRelativeCoords(e);
    setDragOffset({
      x: coords.x - stamp.x,
      y: coords.y - stamp.y,
    });
    setIsDragging(true);
  };
  
  const handleResizeHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!stamp || (!isDragging && !isResizing)) return;
    
    const coords = getRelativeCoords(e as unknown as React.MouseEvent);
    
    if (isDragging) {
      onStampChange({
        ...stamp,
        x: coords.x - dragOffset.x,
        y: coords.y - dragOffset.y,
      });
    }

    if (isResizing) {
       const newWidth = Math.max(50, coords.x - stamp.x);
       const newHeight = Math.max(50, coords.y - stamp.y);
       const aspectRatio = stamp.width / stamp.height;
       onStampChange({
        ...stamp,
        width: Math.max(newWidth, newHeight * aspectRatio),
        height: Math.max(newWidth, newHeight * aspectRatio) / aspectRatio,
      });
    }

  }, [isDragging, isResizing, stamp, dragOffset, onStampChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);


  return (
    <div
      ref={wrapperRef}
      onClick={onSelectPage}
      className={`p-2 rounded-lg shadow-lg cursor-pointer transition-all duration-300 bg-white ${isActive ? 'ring-4 ring-orange-500' : 'ring-gray-300 ring-1'}`}
    >
        <div ref={containerRef} className="w-full relative flex items-center justify-center">
            <canvas ref={canvasRef} />
            {stamp?.isPlaced && (
                <div
                className="absolute cursor-move select-none border-2 border-dashed border-blue-500"
                style={{
                    left: `${stamp.x}px`,
                    top: `${stamp.y}px`,
                    width: `${stamp.width}px`,
                    height: `${stamp.height}px`,
                }}
                onMouseDown={handleStampMouseDown}
                >
                <img
                    src={`data:image/png;base64,${STAMP_IMAGE_BASE64}`}
                    alt="Stamp"
                    className="w-full h-full opacity-80"
                    draggable="false"
                />
                <div
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize border-2 border-white"
                    onMouseDown={handleResizeHandleMouseDown}
                />
                </div>
            )}
        </div>
    </div>
  );
};

export default PdfEditor;