import React, { useEffect, useRef, useState } from 'react';
import './VideoCall.css';

function VideoCall({ 
  currentUser, 
  otherUser, 
  ws, 
  callState, 
  onEndCall,
  incomingOffer 
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);
  const [isRemoteAudioMuted, setIsRemoteAudioMuted] = useState(false);

  useEffect(() => {
    initializeCall();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to handle remote video stream assignment
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('🎬 Remote stream changed/set, updating video element');
      const videoElement = remoteVideoRef.current;
      
      // Only reset srcObject if it's different
      if (videoElement.srcObject !== remoteStream) {
        videoElement.srcObject = remoteStream;
      }
      
      // Mobile Safari attributes
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('autoplay', 'true');
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      videoElement.muted = false; // Remote video should not be muted

      const attemptPlay = async () => {
        if (videoElement.paused && videoElement.readyState >= 2) {
             try {
                await videoElement.play();
                console.log('✅ Remote video playing successfully');
             } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('❌ Play failed:', err.message);
                } else {
                    console.log('ℹ️ Play request interrupted (normal during setup)');
                }
             }
        }
      };
      
      // Try to play when metadata loads
      videoElement.onloadedmetadata = () => {
          console.log('📹 Metadata loaded, attempting play');
          attemptPlay();
      };

      // Also try immediately in case metadata is already loaded
      attemptPlay();

      // Handle stream mute/unmute events (critical for black screen fix and UI updates)
      const videoTracks = remoteStream.getVideoTracks();
      const audioTracks = remoteStream.getAudioTracks();

      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        setIsRemoteVideoOff(!videoTrack.enabled || videoTrack.muted);

        videoTrack.onunmute = () => {
          console.log('🎥 Video track UNMUTED (data receiving), trying to play');
          setIsRemoteVideoOff(false);
          attemptPlay();
        };
        
        videoTrack.onmute = () => {
            console.log('🎥 Video track MUTED (no data)');
            setIsRemoteVideoOff(true);
        };

        videoTrack.onended = () => console.log('🎥 Video track ENDED');
      }

      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        setIsRemoteAudioMuted(!audioTrack.enabled); // audioTrack.muted usually means no data, not user mute

        // We can't reliably detect user mute via WebRTC track events across all browsers without signaling
        // But we can detect if the track is disabled/enabled if the sender does it that way
      }
    }
  }, [remoteStream]);

  // Handle incoming WebRTC messages
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'CallAnswer' && message.from_user_id === otherUser.id) {
          console.log('Received call answer');
          handleCallAnswer(message.answer);
        } else if (message.type === 'IceCandidate' && message.from_user_id === otherUser.id) {
          console.log('Received ICE candidate');
          handleIceCandidate(message.candidate);
        }
      } catch (error) {
        console.error('Error handling WebRTC message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, otherUser.id]);

  const initializeCall = async () => {
    try {
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;
        localVideoRef.current.muted = true; // Mute local video to avoid feedback
        console.log('Local video stream set with', stream.getTracks().length, 'tracks');
      }

      // Create peer connection with better ICE configuration
      const configuration = {
        iceServers: [
          { 
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302'
            ]
          },
          // Public TURN servers for relay (backup)
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle', // Optimize connection
        rtcpMuxPolicy: 'require'
      };
      
      const peerConnection = new RTCPeerConnection(configuration);
      peerConnectionRef.current = peerConnection;

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind, 'enabled:', track.enabled);
        peerConnection.addTrack(track, stream);
      });

      // Handle incoming tracks - simplified
      peerConnection.ontrack = (event) => {
        console.log('🎥 ONTRACK EVENT FIRED!', event.streams.length, 'streams');
        console.log('Track kind:', event.track.kind);
        
        if (event.streams && event.streams[0]) {
          const incomingStream = event.streams[0];
          
          // Only update state if we don't have a stream yet or it's a new stream
          setRemoteStream(currentStream => {
            if (currentStream && currentStream.id === incomingStream.id) {
              console.log('ℹ️ Stream already set, ignoring duplicate update');
              return currentStream;
            }
            console.log('Setting new remote stream state:', incomingStream.id);
            return incomingStream;
          });
        } else {
          // If no stream is provided in the event, create one (legacy/fallback)
          console.log('Creating new inbound stream from track');
          setRemoteStream(currentStream => {
             if (currentStream) {
                 currentStream.addTrack(event.track);
                 return currentStream; // Return existing stream with new track
             }
             const newStream = new MediaStream();
             newStream.addTrack(event.track);
             return newStream;
          });
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'IceCandidate',
              to_user_id: otherUser.id,
              candidate: JSON.stringify(event.candidate)
            }));
          }
        }
      };

      // Monitor connection state
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            // Attempt to restart ICE on failure
            console.log('Connection failed, restarting ICE...');
            peerConnection.restartIce();
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
         console.log('ICE Connection state:', peerConnection.iceConnectionState);
      };

      // If we have an incoming offer, create answer
      if (incomingOffer) {
        console.log('Answering call - setting up as answerer');
        const offer = JSON.parse(incomingOffer);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
          type: 'CallAnswer',
          to_user_id: otherUser.id,
          answer: JSON.stringify(answer)
        }));
      } else {
        // If caller, create offer
        console.log('Initiating call - setting up as caller');
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
          type: 'CallOffer',
          to_user_id: otherUser.id,
          offer: JSON.stringify(offer)
        }));
      }
    } catch (error) {
      console.error('Error initializing call:', error);
      alert(`Error starting call: ${error.message}`);
      onEndCall();
    }
  };

  const cleanup = () => {
    console.log('Cleaning up video call resources');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setRemoteStream(null);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log('Video toggled:', videoTrack.enabled ? 'ON' : 'OFF');
      }
    }
  };

  const handleCallAnswer = async (answerJson) => {
    try {
      if (peerConnectionRef.current) {
        const answer = JSON.parse(answerJson);
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling call answer:', error);
    }
  };

  const handleIceCandidate = async (candidateJson) => {
    try {
      if (peerConnectionRef.current) {
        const candidate = JSON.parse(candidateJson);
        // Add candidate regardless of remote description state
        // Modern browsers handle queueing internally or we can catch the exception
        try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.log('Error adding ICE candidate (might need to wait for remote desc):', e);
            // If remote description isn't set, we might need to queue (simple retry logic)
            if (!peerConnectionRef.current.remoteDescription) {
                 setTimeout(() => handleIceCandidate(candidateJson), 500);
            }
        }
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const handleEndCall = () => {
    cleanup();
    onEndCall();
  };

  return (
    <div className="video-call-container">
      <div className="video-wrapper">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          webkit-playsinline="true"
          className="remote-video"
          style={{ 
            backgroundColor: '#1a1a1a',
            display: isRemoteVideoOff ? 'none' : 'block' 
          }}
          onLoadedMetadata={(e) => {
            console.log('📹 Remote video metadata loaded', e.target.videoWidth, 'x', e.target.videoHeight);
          }}
          onPlay={() => console.log('▶️ Remote video started playing')}
          onWaiting={() => console.log('⏳ Remote video waiting for data')}
        />
        
        {isRemoteVideoOff && (
          <div className="remote-video-placeholder">
            <div className="placeholder-icon">📷</div>
            <p>Camera Off</p>
          </div>
        )}

        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="local-video"
        />
        <div className="call-info">
          <div className="caller-name">{otherUser.username}</div>
          <div className="call-status">{callState}</div>
        </div>
      </div>
      
      <div className="call-controls">
        <button 
          className={`control-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        
        <button 
          className="control-btn end-call"
          onClick={handleEndCall}
          title="End Call"
        >
          📞
        </button>
        
        <button 
          className={`control-btn ${isVideoOff ? 'active' : ''}`}
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn On Video' : 'Turn Off Video'}
        >
          {isVideoOff ? '📹' : '📷'}
        </button>
      </div>
    </div>
  );
}

export default VideoCall;
