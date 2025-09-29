import React, { useState, useCallback, useEffect } from 'react';
import type { Stamp, StampState } from './types';
import { STAMP_IMAGE_BASE64 } from './constants';
import PdfEditor from './components/PdfEditor';
import Spinner from './components/Spinner';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

// Type declarations for libraries loaded from CDN
declare global {
  interface Window {
    pdfjsLib: any;
    PDFLib: any;
  }
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [stamps, setStamps] = useState<StampState>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'processing'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setError(null);
      setStatus('loading');
      setFile(selectedFile);
      setPdfDoc(null);
      setStamps({});
      setCurrentPage(1);

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setStatus('ready');
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError('Failed to load the PDF. Please try a different file.');
        setStatus('idle');
        setFile(null);
      }
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const updateStamp = useCallback((page: number, newStamp: Stamp | null) => {
    setStamps(prev => {
      const newStamps = { ...prev };
      if (newStamp) {
        newStamps[page] = newStamp;
      } else {
        delete newStamps[page];
      }
      return newStamps;
    });
  }, []);

  const handleAddOrRemoveStamp = () => {
    if (stamps[currentPage]) {
      updateStamp(currentPage, null);
    } else {
      updateStamp(currentPage, {
        x: 100,
        y: 100,
        width: 120,
        height: 120,
        isPlaced: true
      });
    }
  };

  const handleDownload = async () => {
    if (!file || Object.keys(stamps).length === 0) {
      setError('Please add at least one stamp before downloading.');
      return;
    }
    setError(null);
    setStatus('processing');

    try {
      const { PDFDocument } = window.PDFLib;
      const existingPdfBytes = await file.arrayBuffer();
      const pdfDocToModify = await PDFDocument.load(existingPdfBytes);
      
      const stampImageBytes = Uint8Array.from(atob(STAMP_IMAGE_BASE64), c => c.charCodeAt(0));
      const stampImage = await pdfDocToModify.embedPng(stampImageBytes);

      for (const pageStr in stamps) {
        const pageNum = parseInt(pageStr);
        const stampData = stamps[pageNum];
        const page = pdfDocToModify.getPages()[pageNum - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        const uiPage = await pdfDoc!.getPage(pageNum);
        const viewport = uiPage.getViewport({ scale: 1 });
        
        // This is a pre-existing issue. A more robust solution would pass the actual render scale from PdfEditor.
        const renderedPageWidth = viewport.width;

        const scale = renderedPageWidth / pageWidth;
        
        const stampWidthPoints = stampData.width / scale;
        const stampHeightPoints = stampData.height / scale;
        const xPoints = stampData.x / scale;
        const yPoints = pageHeight - (stampData.y / scale) - stampHeightPoints;

        page.drawImage(stampImage, {
          x: xPoints,
          y: yPoints,
          width: stampWidthPoints,
          height: stampHeightPoints,
          opacity: 0.85,
        });
      }

      const pdfBytes = await pdfDocToModify.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stamped_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (err) {
      console.error("Error creating stamped PDF:", err);
      setError('An error occurred while creating the stamped PDF.');
    } finally {
      setStatus('ready');
    }
  };

  const numPages = pdfDoc?.numPages || 0;

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return <div className="flex flex-col items-center justify-center h-full"><Spinner /> <p className="mt-4 text-gray-600">Loading your document...</p></div>;
      case 'processing':
        return <div className="flex flex-col items-center justify-center h-full"><Spinner /> <p className="mt-4 text-gray-600">Applying stamp and generating PDF...</p></div>;
      case 'ready':
        return pdfDoc && (
            <div className="flex flex-col items-center p-4 space-y-4">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNumber => (
                <PdfEditor
                  key={pageNumber}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNumber}
                  stamp={stamps[pageNumber]}
                  onStampChange={(s) => updateStamp(pageNumber, s)}
                  isActive={currentPage === pageNumber}
                  onSelectPage={() => setCurrentPage(pageNumber)}
                />
              ))}
            </div>
          );
      case 'idle':
      default:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-3/4 h-3/4 border-2 border-dashed border-gray-400 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-10 h-10 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                <p className="mb-2 text-sm text-gray-600"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-gray-500">PDF documents only</p>
              </div>
              <input id="file-upload" type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
            </label>
          </div>
        );
    }
  };


  return (
    <div className="flex flex-col h-screen font-sans">
      <header className="bg-white shadow-md p-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <svg role="img" viewBox="0 0 24 24" className="h-8 w-8 text-orange-600" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Bhutanese Stamp</title><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-12h2v4h-2v-4zm0 6h2v2h-2v-2z"/></svg>
          <h1 className="text-xl font-bold text-gray-800">Bhutanese Legal Stamp Applicator</h1>
        </div>
        {status === 'ready' && <button onClick={handleDownload} disabled={Object.keys(stamps).length === 0} className="px-4 py-2 bg-orange-600 text-white rounded-md font-semibold hover:bg-orange-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2">
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
           <span>Download Stamped PDF</span>
        </button>}
      </header>

      <div className="flex flex-grow overflow-hidden">
        <aside className="w-64 bg-white p-4 shadow-lg flex flex-col space-y-4 overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">Controls</h2>
          <div>
            <label htmlFor="file-upload-sidebar" className="w-full text-center px-4 py-2 bg-gray-700 text-white rounded-md font-semibold hover:bg-gray-800 transition-colors cursor-pointer text-sm">
              {file ? 'Change PDF' : 'Upload PDF'}
            </label>
            <input id="file-upload-sidebar" type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
          </div>
          
          {file && (
            <div className="text-sm text-gray-600 bg-gray-100 p-2 rounded-md">
              <p className="font-semibold truncate">{file.name}</p>
            </div>
          )}

          {pdfDoc && status === 'ready' && (
            <>
              <div className="flex items-center justify-between">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-sm font-medium text-gray-700">Page {currentPage} of {numPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage === numPages} className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              <button onClick={handleAddOrRemoveStamp} className={`w-full py-2 rounded-md font-semibold transition-colors text-white ${stamps[currentPage] ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {stamps[currentPage] ? 'Remove Stamp' : 'Add Stamp'}
              </button>
            </>
          )}

          {error && <div className="text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</div>}
        </aside>

        <main className="flex-grow bg-gray-200 p-4 overflow-auto">
           { status === 'ready' ? (
                renderContent()
            ) : (
                <div className="bg-white rounded-lg shadow-inner w-full h-full">
                    {renderContent()}
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;