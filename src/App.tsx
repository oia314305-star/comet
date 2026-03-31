/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  Image as ImageIcon, 
  Wand2, 
  Download, 
  RefreshCcw, 
  X,
  Plus,
  Undo2,
  Redo2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Crop,
  Maximize,
  Edit2,
  Check,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Cropper, { Area, Point } from 'react-easy-crop';

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface ImageState {
  original: string | null;
  edited: string | null;
  loading: boolean;
  error: string | null;
}

export default function App() {
  const [image, setImage] = useState<ImageState>({
    original: null,
    edited: null,
    loading: false,
    error: null,
  });
  const [instruction, setInstruction] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [presets, setPresets] = useState<string[]>([
    "Remove background and make it transparent",
    "Place on a professional white background",
    "Add soft studio lighting and clean up shadows",
    "Place on a minimalist marble table",
    "Create a lifestyle shot in a bright kitchen"
  ]);
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null);
  const [tempPresetValue, setTempPresetValue] = useState('');
  const [newPreset, setNewPreset] = useState('');
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping State
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const statusMessages = [
    "Analyzing your product photo...",
    "Understanding your instructions...",
    "Applying AI magic...",
    "Refining details...",
    "Finalizing your shot...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (image.loading) {
      let i = 0;
      setStatusMessage(statusMessages[0]);
      interval = setInterval(() => {
        i = (i + 1) % statusMessages.length;
        setStatusMessage(statusMessages[i]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [image.loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setImage({
          original: dataUrl,
          edited: null,
          loading: false,
          error: null,
        });
        setHistory([dataUrl]);
        setHistoryIndex(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setImage({
          original: dataUrl,
          edited: null,
          loading: false,
          error: null,
        });
        setHistory([dataUrl]);
        setHistoryIndex(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const addToHistory = (imageUrl: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setImage(prev => ({ ...prev, edited: imageUrl, loading: false }));
  };

  const processImage = async (customInstruction?: string) => {
    const activeInstruction = customInstruction || instruction;
    if (!image.original || !activeInstruction.trim()) return;

    setImage(prev => ({ ...prev, loading: true, error: null }));

    try {
      const currentImage = image.edited || image.original;
      const base64Data = currentImage.split(',')[1];
      const mimeType = currentImage.split(';')[0].split(':')[1];

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: activeInstruction,
            },
          ],
        },
      });

      let editedImageUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          editedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (editedImageUrl) {
        addToHistory(editedImageUrl);
      } else {
        throw new Error("The model didn't return an edited image. Try a different instruction.");
      }
    } catch (err: any) {
      console.error("Error processing image:", err);
      setImage(prev => ({ 
        ...prev, 
        loading: false, 
        error: err.message || "Failed to process image. Please try again." 
      }));
    }
  };

  const smartExpand = async () => {
    await processImage("Intelligently expand the image content to fill the frame, maintaining the style and subject of the product photo.");
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const executeCrop = async () => {
    if (!croppedAreaPixels || !image.original) return;
    
    setImage(prev => ({ ...prev, loading: true }));
    
    try {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.src = image.edited || image.original;
      
      await new Promise((resolve) => { img.onload = resolve; });
      
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(
          img,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          croppedAreaPixels.width,
          croppedAreaPixels.height
        );
        
        const croppedUrl = canvas.toDataURL('image/png');
        addToHistory(croppedUrl);
        setIsCropping(false);
      }
    } catch (err) {
      console.error("Crop error:", err);
    } finally {
      setImage(prev => ({ ...prev, loading: false }));
    }
  };

  const downloadImage = () => {
    const currentImg = image.edited || image.original;
    if (!currentImg) return;
    const link = document.createElement('a');
    link.href = currentImg;
    link.download = 'cleaned-product-photo.png';
    link.click();
  };

  const reset = () => {
    setImage({
      original: null,
      edited: null,
      loading: false,
      error: null,
    });
    setInstruction('');
    setHistory([]);
    setHistoryIndex(-1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setImage(prev => ({ ...prev, edited: history[newIndex] }));
    } else if (historyIndex === 0) {
      // Keep redo history but show original
      setHistoryIndex(-1);
      setImage(prev => ({ ...prev, edited: null }));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setImage(prev => ({ ...prev, edited: history[newIndex] }));
    }
  };

  const goToHistory = (index: number) => {
    setHistoryIndex(index);
    setImage(prev => ({ ...prev, edited: history[index] }));
  };

  const addCustomPreset = () => {
    if (newPreset.trim() && !presets.includes(newPreset.trim())) {
      setPresets(prev => [...prev, newPreset.trim()]);
      setNewPreset('');
      setIsAddingPreset(false);
    }
  };

  const startEditingPreset = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetIndex(index);
    setTempPresetValue(presets[index]);
  };

  const savePreset = () => {
    if (editingPresetIndex !== null && tempPresetValue.trim()) {
      const newPresets = [...presets];
      newPresets[editingPresetIndex] = tempPresetValue.trim();
      setPresets(newPresets);
      setEditingPresetIndex(null);
    }
  };

  const removePreset = (presetToRemove: string) => {
    setPresets(prev => prev.filter(p => p !== presetToRemove));
  };

  return (
    <div className="min-h-screen bg-white text-[#111] font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">
              <Wand2 size={20} strokeWidth={1.5} />
            </div>
            <span className="font-serif text-2xl tracking-tight font-medium italic">comet</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-full border border-gray-100">
              <button 
                onClick={undo}
                disabled={historyIndex < 0}
                className="p-2 hover:bg-white hover:shadow-sm rounded-full text-gray-600 disabled:opacity-30 transition-all"
              >
                <Undo2 size={18} />
              </button>
              <button 
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="p-2 hover:bg-white hover:shadow-sm rounded-full text-gray-600 disabled:opacity-30 transition-all"
              >
                <Redo2 size={18} />
              </button>
            </div>
            
            {image.original && (
              <button 
                onClick={reset}
                className="text-sm font-medium text-gray-400 hover:text-black transition-colors"
              >
                Reset
              </button>
            )}
            
            <button 
              onClick={downloadImage}
              disabled={!image.original}
              className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-20 flex items-center gap-2"
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 max-w-[1400px] mx-auto px-8">
        <div className="grid lg:grid-cols-[1fr_420px] gap-16 items-start">
          
          {/* Left Column: Canvas & History */}
          <div className="space-y-12">
            <div className="flex flex-col gap-8">
              <div className="space-y-2">
                <h2 className="font-serif text-5xl tracking-tight font-medium leading-tight">
                  A personal <br />
                  AI <span className="italic">assistant</span>
                </h2>
                <p className="text-gray-400 text-lg">for professional product photography</p>
              </div>

              <div 
                className={`relative aspect-[4/3] rounded-[40px] transition-all duration-700 flex flex-col items-center justify-center overflow-hidden bg-[#F9F9F9] border border-gray-100
                  ${!image.original ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !image.original && fileInputRef.current?.click()}
              >
                <AnimatePresence mode="wait">
                  {!image.original ? (
                    <motion.div 
                      key="upload"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center p-12"
                    >
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
                        <Upload size={32} strokeWidth={1} className="text-gray-400" />
                      </div>
                      <h3 className="text-2xl font-medium mb-3">Drop your photo here</h3>
                      <p className="text-gray-400 max-w-xs mx-auto text-lg">
                        or click to browse your files
                      </p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        className="hidden" 
                        accept="image/*"
                      />
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="display"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="w-full h-full relative"
                    >
                      {isCropping ? (
                        <div className="w-full h-full relative bg-black">
                          <Cropper
                            image={image.edited || image.original}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                          />
                          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-10">
                            <button 
                              onClick={() => setIsCropping(false)}
                              className="bg-white/10 backdrop-blur-md text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-white/20 transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={executeCrop}
                              className="bg-white text-black px-8 py-2 rounded-full text-sm font-medium hover:bg-gray-100 transition-all"
                            >
                              Apply Crop
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <img 
                            src={image.edited || image.original} 
                            alt="Product" 
                            className="w-full h-full object-contain p-8"
                            referrerPolicy="no-referrer"
                          />
                          
                          {image.loading && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center">
                              <Loader2 className="w-16 h-16 text-black animate-spin mb-6" strokeWidth={1} />
                              <h4 className="text-2xl font-serif italic mb-2">{statusMessage}</h4>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* History Thumbnails */}
              {history.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Version History</h3>
                  <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {history.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => goToHistory(idx)}
                        className={`relative flex-shrink-0 w-24 h-24 rounded-2xl border-2 transition-all overflow-hidden bg-gray-50
                          ${historyIndex === idx ? 'border-black scale-105 shadow-lg' : 'border-transparent hover:border-gray-200'}`}
                      >
                        <img src={url} className="w-full h-full object-cover" alt={`History ${idx}`} />
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[8px] px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                          v{idx + 1}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Controls */}
          <div className="space-y-12 sticky top-32">
            {/* Tools */}
            <section className="space-y-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Quick Tools</h2>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setIsCropping(true)}
                  disabled={!image.original || image.loading}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] bg-gray-50 border border-gray-100 hover:bg-black hover:text-white transition-all group disabled:opacity-20"
                >
                  <Crop size={24} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Crop</span>
                </button>
                <button 
                  onClick={smartExpand}
                  disabled={!image.original || image.loading}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] bg-gray-50 border border-gray-100 hover:bg-black hover:text-white transition-all group disabled:opacity-20"
                >
                  <Maximize size={24} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Smart Expand</span>
                </button>
              </div>
            </section>

            {/* Instructions */}
            <section className="space-y-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Instructions</h2>
              <div className="relative group">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Describe your vision..."
                  className="w-full h-48 bg-[#F9F9F9] border border-transparent rounded-[32px] p-8 text-lg focus:bg-white focus:border-gray-200 outline-none transition-all resize-none"
                  disabled={!image.original || image.loading}
                />
                <button
                  onClick={() => processImage()}
                  disabled={!image.original || !instruction.trim() || image.loading}
                  className="absolute bottom-6 right-6 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center hover:scale-110 transition-all disabled:opacity-0"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            </section>

            {/* Presets */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Presets</h2>
                <button 
                  onClick={() => setIsAddingPreset(!isAddingPreset)}
                  className="text-black hover:opacity-50 transition-opacity"
                >
                  <Plus size={18} />
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                {presets.map((preset, index) => (
                  <div key={index} className="group relative">
                    {editingPresetIndex === index ? (
                      <div className="flex items-center gap-2 bg-white border border-black rounded-full px-4 py-2 shadow-sm">
                        <input 
                          autoFocus
                          value={tempPresetValue}
                          onChange={(e) => setTempPresetValue(e.target.value)}
                          onBlur={savePreset}
                          onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                          className="bg-transparent outline-none text-xs min-w-[100px]"
                        />
                        <button onClick={savePreset} className="text-black"><Check size={14} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => processImage(preset)}
                        disabled={!image.original || image.loading}
                        className="px-5 py-2.5 rounded-full border border-gray-100 bg-gray-50 text-xs font-medium hover:bg-black hover:text-white hover:border-black transition-all flex items-center gap-2 disabled:opacity-20"
                      >
                        {preset}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit2 
                            size={12} 
                            className="hover:text-orange-400" 
                            onClick={(e) => startEditingPreset(index, e)}
                          />
                          {index >= 5 && (
                            <X 
                              size={12} 
                              className="hover:text-red-400" 
                              onClick={(e) => { e.stopPropagation(); removePreset(preset); }}
                            />
                          )}
                        </div>
                      </button>
                    )}
                  </div>
                ))}
                
                {isAddingPreset && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-2 bg-white border border-black rounded-full px-4 py-2"
                  >
                    <input 
                      autoFocus
                      value={newPreset}
                      onChange={(e) => setNewPreset(e.target.value)}
                      placeholder="New preset..."
                      onKeyDown={(e) => e.key === 'Enter' && addCustomPreset()}
                      className="bg-transparent outline-none text-xs"
                    />
                    <button onClick={addCustomPreset} className="text-black"><Plus size={14} /></button>
                  </motion.div>
                )}
              </div>
            </section>

            {image.error && (
              <div className="p-6 bg-red-50 rounded-[32px] border border-red-100 flex gap-4 text-red-600">
                <AlertCircle className="shrink-0" size={24} strokeWidth={1.5} />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Processing error</p>
                  <p className="opacity-80">{image.error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
