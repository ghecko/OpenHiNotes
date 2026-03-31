import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TranscribeModal } from '@/components/TranscribeModal';
import { Transcription } from '@/types';
import {
  Upload as UploadIcon,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  FileAudio,
} from 'lucide-react';

const ACCEPTED_FORMATS = '.mp3,.wav,.m4a,.ogg,.flac,.hda,.webm';
const ACCEPTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Upload() {
  const navigate = useNavigate();

  // ── File Upload State ──
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Recording State ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(32).fill(0));

  // ── Audio Playback State ──
  const [isPlayingUpload, setIsPlayingUpload] = useState(false);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── MediaRecorder Refs ──
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── TranscribeModal State ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAudioFile, setModalAudioFile] = useState<Blob | null>(null);
  const [modalFileName, setModalFileName] = useState('');

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopRecording();
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File Upload Handlers ──
  const handleFileSelect = useCallback((file: File) => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|flac|hda|webm)$/i)) {
      return;
    }
    setUploadedFile(file);
    setUploadedBlob(file);
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    const url = URL.createObjectURL(file);
    setUploadedUrl(url);
    setIsPlayingUpload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedUrl]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const clearUploadedFile = useCallback(() => {
    setUploadedFile(null);
    setUploadedBlob(null);
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedUrl(null);
    setIsPlayingUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadedUrl]);

  // ── Recording Handlers ──
  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analysis
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start level visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray);
        const levels = Array.from(dataArray).map((v) => v / 255);
        setAudioLevels(levels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250); // collect data every 250ms

      // Start timer
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      setIsRecording(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setMicError('Microphone access was denied. Please allow microphone access in your browser settings.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setMicError('No microphone found. Please connect a microphone and try again.');
      } else {
        setMicError('Failed to access microphone. Please check your device settings.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setAudioLevels(new Array(32).fill(0));
  }, []);

  const clearRecording = useCallback(() => {
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordingDuration(0);
    setIsPlayingRecording(false);
  }, [recordedUrl]);

  // ── Audio Playback ──
  const togglePlayUpload = useCallback(() => {
    if (!uploadAudioRef.current) return;
    if (isPlayingUpload) {
      uploadAudioRef.current.pause();
    } else {
      uploadAudioRef.current.play();
    }
    setIsPlayingUpload(!isPlayingUpload);
  }, [isPlayingUpload]);

  const togglePlayRecording = useCallback(() => {
    if (!recordingAudioRef.current) return;
    if (isPlayingRecording) {
      recordingAudioRef.current.pause();
    } else {
      recordingAudioRef.current.play();
    }
    setIsPlayingRecording(!isPlayingRecording);
  }, [isPlayingRecording]);

  // ── TranscribeModal ──
  const openTranscribeForUpload = useCallback(() => {
    if (!uploadedBlob || !uploadedFile) return;
    setModalAudioFile(uploadedBlob);
    setModalFileName(uploadedFile.name);
    setIsModalOpen(true);
  }, [uploadedBlob, uploadedFile]);

  const openTranscribeForRecording = useCallback(() => {
    if (!recordedBlob) return;
    setModalAudioFile(recordedBlob);
    setModalFileName(`recording-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`);
    setIsModalOpen(true);
  }, [recordedBlob]);

  const handleTranscriptionComplete = useCallback((transcription: Transcription) => {
    navigate(`/transcriptions/${transcription.id}`);
  }, [navigate]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Upload & Record
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload an audio file or record from your microphone, then transcribe it.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Section 1: File Upload ── */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <UploadIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                File Upload
              </h2>
            </div>

            {!uploadedFile ? (
              /* Drop zone */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                  isDragOver
                    ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50/50 dark:hover:bg-gray-700/30'
                }`}
              >
                <UploadIcon className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drag & drop an audio file here
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  or click to browse
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  Supported: MP3, WAV, M4A, OGG, FLAC, HDA, WebM
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FORMATS}
                  onChange={handleInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              /* File preview */
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50/80 dark:bg-gray-700/40 rounded-xl">
                  <FileAudio className="w-8 h-8 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(uploadedFile.size)}
                    </p>
                  </div>
                  <button
                    onClick={clearUploadedFile}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600/50"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Audio player */}
                {uploadedUrl && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayUpload}
                      className="p-2 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors"
                    >
                      {isPlayingUpload ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <audio
                      ref={uploadAudioRef}
                      src={uploadedUrl}
                      onEnded={() => setIsPlayingUpload(false)}
                      className="flex-1 h-8"
                      controls
                    />
                  </div>
                )}

                {/* Transcribe button */}
                <button
                  onClick={openTranscribeForUpload}
                  className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors duration-200 shadow-sm hover:shadow-md"
                >
                  Transcribe
                </button>
              </div>
            )}
          </div>

          {/* ── Section 2: Microphone Recording ── */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Mic className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Microphone Recording
              </h2>
            </div>

            {/* Mic error message */}
            {micError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl text-sm text-red-700 dark:text-red-300">
                {micError}
              </div>
            )}

            {/* Recording controls */}
            <div className="flex flex-col items-center space-y-5">
              {/* Waveform visualization */}
              {isRecording && (
                <div className="flex items-end justify-center gap-[3px] h-16 w-full px-4">
                  {audioLevels.map((level, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-red-500 dark:bg-red-400 rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(4, level * 64)}px`,
                        opacity: 0.5 + level * 0.5,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Timer */}
              {(isRecording || (!recordedBlob && recordingDuration > 0)) && (
                <p className="text-2xl font-mono font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatDuration(recordingDuration)}
                </p>
              )}

              {/* Record / Stop button */}
              {!recordedBlob && (
                <div className="flex flex-col items-center gap-3">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="relative w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                      title="Start recording"
                    >
                      <Mic className="w-7 h-7" />
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="relative w-16 h-16 rounded-full bg-red-500 text-white shadow-lg transition-all duration-200 flex items-center justify-center animate-pulse"
                      title="Stop recording"
                    >
                      <Square className="w-6 h-6" />
                    </button>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isRecording ? 'Click to stop' : 'Click to start recording'}
                  </p>
                </div>
              )}

              {/* Recorded audio preview */}
              {recordedBlob && !isRecording && (
                <div className="w-full space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50/80 dark:bg-gray-700/40 rounded-xl">
                    <FileAudio className="w-8 h-8 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Recording
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDuration(recordingDuration)} · {formatFileSize(recordedBlob.size)}
                      </p>
                    </div>
                    <button
                      onClick={clearRecording}
                      className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600/50"
                      title="Delete recording"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Audio player */}
                  {recordedUrl && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlayRecording}
                        className="p-2 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors"
                      >
                        {isPlayingRecording ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <audio
                        ref={recordingAudioRef}
                        src={recordedUrl}
                        onEnded={() => setIsPlayingRecording(false)}
                        className="flex-1 h-8"
                        controls
                      />
                    </div>
                  )}

                  {/* Transcribe button */}
                  <button
                    onClick={openTranscribeForRecording}
                    className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors duration-200 shadow-sm hover:shadow-md"
                  >
                    Transcribe
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TranscribeModal */}
      <TranscribeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        audioFile={modalAudioFile}
        fileName={modalFileName}
        onComplete={handleTranscriptionComplete}
      />
    </Layout>
  );
}
