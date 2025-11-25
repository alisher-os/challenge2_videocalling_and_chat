import React, { useState, useRef, useEffect } from 'react';
import './VoiceRecorder.css';

function VoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioURL, setAudioURL] = useState(null);
  const [error, setError] = useState(null);
  const [audioLevels, setAudioLevels] = useState(new Array(32).fill(0));
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const hasStartedRef = useRef(false);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    console.log('VoiceRecorder MOUNTED, hasStarted:', hasStartedRef.current);
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      console.log('Starting recording for the first time...');
      startRecording();
    } else {
      console.log('Recording already started, skipping...');
    }
    
    return () => {
      console.log('VoiceRecorder UNMOUNTING, cleaning up...');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log('Stopping MediaRecorder on unmount...');
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        console.log('Stopping audio tracks...');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visualize = (stream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;
    
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyserRef.current = analyser;
    
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      // Normalize and smooth the data
      const levels = [];
      const barsCount = 32;
      const step = Math.floor(bufferLength / barsCount);
      
      for (let i = 0; i < barsCount; i++) {
        const start = i * step;
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[start + j] || 0;
        }
        levels.push(sum / step / 255);
      }
      
      setAudioLevels(levels);
    };
    
    draw();
  };

  const startRecording = async () => {
    if (error || audioURL) {
      console.log('Not starting recording - error or audio already exists');
      return;
    }
    
    try {
      console.log('Starting voice recording...');
      console.log('Requesting microphone permission...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('Microphone access granted!', stream);
      
      // Start visualization
      visualize(stream);
      
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
      let selectedMimeType = '';
      
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log('Using MIME type:', mimeType);
          break;
        }
      }
      
      if (!selectedMimeType) {
        console.warn('No preferred MIME type supported, using default');
      }
      
      const mediaRecorder = selectedMimeType 
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, chunks:', audioChunksRef.current.length);
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log('Created blob:', audioBlob.size, 'bytes, type:', mimeType);
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        setIsRecording(false);
        
        // Stop visualization
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        setAudioLevels(new Array(32).fill(0));
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
      };

      console.log('Starting MediaRecorder...');
      mediaRecorder.start(1000);
      setIsRecording(true);

      const MAX_DURATION = 60;
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) {
            console.log('Max recording duration reached, stopping...');
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
            clearInterval(timerRef.current);
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Error accessing microphone:', err);
      
      let errorMessage = 'Could not access microphone: ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow access.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found on this device.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another app.';
      } else if (window.location.protocol !== 'https:') {
        errorMessage = 'Microphone requires a secure HTTPS connection.';
      } else {
        errorMessage = `${err.message || 'Unknown error occurred'}`;
      }
      
      setError(errorMessage);
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('Stopping MediaRecorder...');
      mediaRecorderRef.current.stop();
    }
  };

  const handleSend = () => {
    if (audioURL) {
      console.log('Preparing to send voice message...');
      fetch(audioURL)
        .then(res => res.blob())
        .then(blob => {
          console.log('Blob for sending:', blob.size, 'bytes, type:', blob.type);
          
          const mimeType = blob.type || 'audio/webm';
          let extension = 'webm';
          if (mimeType.includes('mp4')) extension = 'mp4';
          else if (mimeType.includes('ogg')) extension = 'ogg';
          
          const reader = new FileReader();
          reader.onloadend = () => {
            console.log('Base64 data ready, sending...');
            onSend({
              file_data: reader.result,
              file_name: `voice-${Date.now()}.${extension}`,
              file_type: mimeType,
              audio_duration: duration
            });
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          console.error('Error preparing voice message:', err);
          alert('Failed to prepare voice message');
        });
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    onCancel();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder-overlay">
      <div className="voice-recorder-modal">
        {/* Close button */}
        <button className="voice-close-btn" onClick={handleCancel} aria-label="Cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {error ? (
          <div className="voice-error-state">
            <div className="error-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="error-message">{error}</p>
            <button className="voice-retry-btn" onClick={() => { 
              setError(null); 
              hasStartedRef.current = false; 
              startRecording(); 
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              Try Again
            </button>
          </div>
        ) : isRecording ? (
          <div className="voice-recording-state">
            {/* Animated recording indicator */}
            <div className="recording-visual">
              <div className="recording-pulse-ring"></div>
              <div className="recording-pulse-ring delay-1"></div>
              <div className="recording-pulse-ring delay-2"></div>
              <div className="recording-mic-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
            </div>

            {/* Real-time waveform */}
            <div className="waveform-visualizer">
              {audioLevels.map((level, i) => (
                <div 
                  key={i} 
                  className="waveform-bar"
                  style={{ 
                    height: `${Math.max(4, level * 48)}px`,
                    opacity: 0.4 + level * 0.6
                  }}
                />
              ))}
            </div>

            {/* Timer */}
            <div className="recording-time">
              <span className="time-indicator"></span>
              {formatTime(duration)}
            </div>

            {/* Stop button */}
            <button className="voice-stop-btn" onClick={stopRecording}>
              <div className="stop-icon"></div>
              <span>Stop Recording</span>
            </button>
          </div>
        ) : audioURL ? (
          <div className="voice-preview-state">
            <div className="audio-preview-container">
              <div className="audio-icon-wrapper">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
              <div className="audio-info">
                <span className="audio-label">Voice Message</span>
                <span className="audio-duration">{formatTime(duration)}</span>
              </div>
              <audio src={audioURL} controls className="audio-player-element" />
            </div>

            <div className="voice-preview-actions">
              <button className="voice-delete-btn" onClick={handleCancel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </button>
              <button className="voice-send-btn" onClick={handleSend}>
                Send
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="voice-initializing-state">
            <div className="initializing-spinner">
              <div className="spinner-ring"></div>
              <svg viewBox="0 0 24 24" fill="currentColor" className="spinner-mic">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
            <p className="initializing-text">Accessing microphone...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceRecorder;
