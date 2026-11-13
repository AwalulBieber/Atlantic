import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X, Minus, Maximize2, Camera, FlipHorizontal, Settings2 } from 'lucide-react';

const getRtcConfig = async () => {
  const fallback = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
    iceCandidatePoolSize: 10
  };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sesi login habis. Silakan login ulang.');
  const response = await fetch('/api/turn-credentials', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Kredensial TURN belum tersedia.');
  }
  const result = await response.json();
  if (!Array.isArray(result.iceServers) || !result.iceServers.length) {
    throw new Error('Konfigurasi TURN dari server tidak valid.');
  }
  return { iceServers: result.iceServers, iceCandidatePoolSize: 10 };
};

export default function AtlanticCallManager({ user, intent, onIntentHandled }) {
  const [incoming, setIncoming] = useState(null);
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user');
  const [mirrorSelf, setMirrorSelf] = useState(true);
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const signalChannelRef = useRef(null);
  const callRef = useRef(null);
  const pendingIceRef = useRef([]);
  const endedRef = useRef(false);
  const startedIntentRef = useRef(null);

  const attachStream = useCallback((stream) => {
    setLocalStream(stream);
    localStreamRef.current = stream;
  }, []);

  const cleanup = useCallback(async () => {
    endedRef.current = true;
    if (signalChannelRef.current) {
      await supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCall(null);
    callRef.current = null;
    setIncoming(null);
    setMuted(false);
    setCameraOff(false);
    pendingIceRef.current = [];
    setElapsed(0);
    setMinimized(false);
    setCameraFacing('user');
    setMirrorSelf(true);
    setCameraSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const sendSignal = useCallback(async (activeCall, signalType, payload = {}) => {
    if (!activeCall?.id) return;
    const { error: signalError } = await supabase.from('atlantic_call_signals').insert({
      call_id: activeCall.id,
      sender_id: user.id,
      recipient_id: activeCall.peerId,
      signal_type: signalType,
      payload
    });
    if (signalError) throw signalError;
  }, [user?.id]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, []);

  const handleSignal = useCallback(async (signal) => {
    if (!signal || signal.sender_id === user.id) return;
    const pc = pcRef.current;
    if (signal.signal_type === 'answer' && pc && !pc.remoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      if (callRef.current) { callRef.current.status = 'accepted'; setCall({ ...callRef.current }); }
      await flushIce();
    } else if (signal.signal_type === 'ice' && pc) {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(signal.payload)); } catch {}
      } else {
        pendingIceRef.current.push(signal.payload);
      }
    } else if (signal.signal_type === 'hangup' || signal.signal_type === 'decline') {
      setPhase(signal.signal_type === 'decline' ? 'Panggilan ditolak' : 'Panggilan berakhir');
      await cleanup();
    }
  }, [cleanup, flushIce, user?.id]);

  const subscribeSignals = useCallback(async (callId) => {
    if (signalChannelRef.current) await supabase.removeChannel(signalChannelRef.current);
    const channel = supabase.channel('atl-call-signals-' + callId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'atlantic_call_signals',
        filter: 'call_id=eq.' + callId
      }, payload => { handleSignal(payload.new).catch(err => setError(err.message || 'Sinyal panggilan gagal diproses.')); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'atlantic_call_sessions',
        filter: 'id=eq.' + callId
      }, payload => {
        if (callRef.current?.id !== callId) return;
        if (payload.new.status === 'accepted') {
          callRef.current.status = 'accepted';
          setCall({ ...callRef.current });
          setPhase('Menghubungkan…');
          return;
        }
        if (['declined','cancelled','ended','missed'].includes(payload.new.status)) {
          if (payload.new.status === 'missed') setError('Panggilan tidak dijawab.');
          setPhase(payload.new.status === 'declined' ? 'Panggilan ditolak' : 'Panggilan berakhir');
          cleanup();
        }
      });
    signalChannelRef.current = channel;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Koneksi sinyal panggilan timeout.')); }
      }, 10000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true; clearTimeout(timeout); resolve();
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
          settled = true; clearTimeout(timeout); reject(new Error('Koneksi realtime panggilan gagal.'));
        }
      });
    });
  }, [cleanup, handleSignal]);

  const createPeer = useCallback(async (activeCall, stream) => {
    let config;
    try {
      config = await getRtcConfig();
    } catch (turnError) {
      config = {
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
        iceCandidatePoolSize: 10
      };
      setError('TURN belum aktif: ' + (turnError.message || 'kredensial belum tersedia') + ' Panggilan akan mencoba koneksi langsung.');
    }
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      const [streamFromPeer] = event.streams;
      setRemoteStream(streamFromPeer || new MediaStream([event.track]));
    };
    pc.onicecandidate = event => {
      if (event.candidate) {
        sendSignal(activeCall, 'ice', event.candidate.toJSON()).catch(err => setError(err.message || 'Kandidat jaringan gagal dikirim.'));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { setPhase('Terhubung'); setError(''); }
      if (pc.connectionState === 'disconnected') setPhase('Jaringan terputus, mencoba menyambungkan…');
      if (pc.connectionState === 'failed') {
        setPhase('Koneksi gagal');
        setError('Jalur media gagal tersambung. Coba ulangi panggilan atau ganti jaringan. Jika tetap gagal, periksa konfigurasi TURN Atlantic.');
      }
    };
    return pc;
  }, [sendSignal]);

  const startOutgoing = useCallback(async (request) => {
    if (!request?.target?.id || !request?.conversationId) return;
    setError('');
    setPhase('Meminta izin mikrofon/kamera…');
    endedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung akses mikrofon/kamera. Buka Atlantic melalui HTTPS dan browser terbaru.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: request.callType === 'video' ? { facingMode: { ideal: 'user' } } : false
      });
      attachStream(stream);
      const { data: session, error: insertError } = await supabase.from('atlantic_call_sessions')
        .insert({
          caller_id: user.id,
          callee_id: request.target.id,
          conversation_id: request.conversationId,
          call_type: request.callType,
          status: 'requested'
        })
        .select('id,caller_id,callee_id,call_type,status,started_at')
        .single();
      if (insertError) throw insertError;
      const activeCall = { ...session, peerId: request.target.id, peerName: request.target.display_name || request.target.username || 'Pengguna Atlantic', direction: 'outgoing' };
      callRef.current = activeCall;
      setCall(activeCall);
      setPhase('Memanggil…');
      await subscribeSignals(session.id);
      const pc = await createPeer(activeCall, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(activeCall, 'offer', pc.localDescription.toJSON());
    } catch (err) {
      setError(err.message || 'Panggilan gagal dimulai.');
      await cleanup();
    } finally {
      onIntentHandled?.();
    }
  }, [attachStream, cleanup, createPeer, onIntentHandled, sendSignal, subscribeSignals, user?.id]);

  useEffect(() => {
    if (intent?.id && startedIntentRef.current !== intent.id) {
      startedIntentRef.current = intent.id;
      startOutgoing(intent);
    }
  }, [intent?.id, startOutgoing]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || callRef.current) return;
    setError('');
    setPhase('Menyiapkan panggilan…');
    endedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung akses mikrofon/kamera. Buka Atlantic melalui HTTPS dan browser terbaru.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incoming.call_type === 'video' ? { facingMode: { ideal: 'user' } } : false
      });
      attachStream(stream);
      const activeCall = { ...incoming, peerId: incoming.caller_id, peerName: incoming.peerName || 'Pengguna Atlantic', direction: 'incoming' };
      callRef.current = activeCall;
      setCall(activeCall);
      setIncoming(null);
      await subscribeSignals(activeCall.id);
      const pc = await createPeer(activeCall, stream);
      let offerRow = null;
      for (let attempt = 0; attempt < 12 && !offerRow; attempt++) {
        const result = await supabase.from('atlantic_call_signals')
          .select('payload').eq('call_id', activeCall.id).eq('signal_type', 'offer')
          .order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (result.error) throw result.error;
        offerRow = result.data;
        if (!offerRow) await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (!offerRow?.payload) throw new Error('Penawaran panggilan tidak ditemukan. Coba panggil ulang.');
      await supabase.from('atlantic_call_sessions').update({ status: 'accepted' }).eq('id', activeCall.id);
      await pc.setRemoteDescription(new RTCSessionDescription(offerRow.payload));
      const { data: earlierIce, error: iceError } = await supabase.from('atlantic_call_signals')
        .select('payload').eq('call_id', activeCall.id).eq('signal_type', 'ice')
        .eq('sender_id', activeCall.peerId).order('created_at', { ascending: true });
      if (iceError) throw iceError;
      for (const row of earlierIce || []) {
        try { await pc.addIceCandidate(new RTCIceCandidate(row.payload)); } catch {}
      }
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(activeCall, 'answer', pc.localDescription.toJSON());
      setPhase('Menghubungkan…');
    } catch (err) {
      setError(err.message || 'Gagal menerima panggilan.');
      await cleanup();
    }
  }, [attachStream, cleanup, createPeer, flushIce, incoming, sendSignal, subscribeSignals]);

  const rejectIncoming = useCallback(async () => {
    if (!incoming) return;
    await supabase.from('atlantic_call_signals').insert({
      call_id: incoming.id, sender_id: user.id, recipient_id: incoming.caller_id,
      signal_type: 'decline', payload: {}
    });
    await supabase.from('atlantic_call_sessions').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', incoming.id);
    setIncoming(null);
  }, [incoming, user?.id]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (activeCall) {
      try { await sendSignal(activeCall, 'hangup', {}); } catch {}
      await supabase.from('atlantic_call_sessions').update({
        status: activeCall.direction === 'outgoing' && activeCall.status === 'requested' ? 'cancelled' : 'ended',
        ended_at: new Date().toISOString()
      }).eq('id', activeCall.id);
    }
    await cleanup();
  }, [cleanup, sendSignal]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; });
    setCameraOff(next);
  };

  const switchCamera = useCallback(async () => {
    const currentStream = localStreamRef.current;
    const peer = pcRef.current;
    if (!currentStream || !peer) {
      setError('Kamera belum siap. Tunggu sampai panggilan video tersambung, lalu coba lagi.');
      return;
    }
    const currentTrack = currentStream.getVideoTracks()[0];
    const videoSender = peer.getSenders().find(sender => sender.track?.kind === 'video');
    if (!currentTrack || !videoSender) {
      setError('Track kamera belum siap. Coba nyalakan kamera lagi.');
      return;
    }

    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    let replacementStream;
    try {
      // Prefer an explicitly different physical camera. On some Android
      // browsers, facingMode: ideal silently returns the front camera again.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const currentDeviceId = currentTrack.getSettings?.().deviceId;
      const currentLabel = (cameras.find(device => device.deviceId === currentDeviceId)?.label || '').toLowerCase();
      const wantsBack = nextFacing === 'environment';
      const labelMatches = device => {
        const label = (device.label || '').toLowerCase();
        return wantsBack
          ? /back|rear|environment|belakang|world/.test(label)
          : /front|user|fac(e)? ?(ing)?|depan/.test(label);
      };
      let target = cameras.find(device => device.deviceId !== currentDeviceId && labelMatches(device));
      if (!target) target = cameras.find(device => device.deviceId !== currentDeviceId);

      if (target?.deviceId) {
        try {
          replacementStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { deviceId: { exact: target.deviceId } }
          });
        } catch {
          // Fall through to facingMode constraints if the device ID is stale.
        }
      }
      if (!replacementStream) {
        try {
          replacementStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { exact: nextFacing } }
          });
        } catch {
          replacementStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: nextFacing } }
          });
        }
      }

      const replacementTrack = replacementStream.getVideoTracks()[0];
      if (!replacementTrack) throw new Error('Kamera yang dipilih tidak tersedia.');
      await videoSender.replaceTrack(replacementTrack);

      const nextStream = new MediaStream([...currentStream.getAudioTracks(), replacementTrack]);
      currentTrack.stop();
      attachStream(nextStream);
      const actualFacing = replacementTrack.getSettings?.().facingMode;
      setCameraFacing(actualFacing === 'environment' ? 'environment' : actualFacing === 'user' ? 'user' : nextFacing);
      setCameraOff(false);
      setError('');
    } catch (err) {
      replacementStream?.getTracks().forEach(track => track.stop());
      setError(err.message || 'Gagal mengganti kamera. Pastikan izin kamera diberikan ke browser.');
    }
  }, [attachStream, cameraFacing]);

  useEffect(() => {
    if (!call?.started_at) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call?.id, call?.started_at]);

  // End unanswered outgoing calls so both sides leave the ringing state.
  useEffect(() => {
    if (!call || call.direction !== 'outgoing' || call.status !== 'requested') return;
    const callId = call.id;
    const timer = setTimeout(async () => {
      if (callRef.current?.id !== callId || callRef.current.status !== 'requested') return;
      await supabase.from('atlantic_call_sessions').update({
        status: 'missed',
        ended_at: new Date().toISOString()
      }).eq('id', callId);
      if (callRef.current?.id === callId) {
        setError('Panggilan tidak dijawab.');
        await cleanup();
      }
    }, 45000);
    return () => clearTimeout(timer);
  }, [call?.id, call?.direction, call?.status, cleanup]);

  useEffect(() => () => {
    if (signalChannelRef.current) supabase.removeChannel(signalChannelRef.current);
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const loadPending = async () => {
      const { data } = await supabase.from('atlantic_call_sessions')
        .select('id,caller_id,callee_id,call_type,status,started_at')
        .eq('callee_id', user.id).eq('status', 'requested')
        .order('started_at', { ascending: false }).limit(1);
      if (alive && data?.[0]) showIncoming(data[0]);
    };
    const showIncoming = async session => {
      const { data: person } = await supabase.from('profiles').select('display_name,username,avatar_url').eq('id', session.caller_id).maybeSingle();
      if (alive) setIncoming({ ...session, peerName: person?.display_name || person?.username || 'Pengguna Atlantic' });
    };
    const channel = supabase.channel('atl-call-incoming-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'atlantic_call_sessions',
        filter: 'callee_id=eq.' + user.id
      }, payload => { if (payload.new.status === 'requested') showIncoming(payload.new); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'atlantic_call_sessions',
        filter: 'callee_id=eq.' + user.id
      }, payload => {
        if (['cancelled','declined','ended','missed'].includes(payload.new.status)) {
          setIncoming(current => current?.id === payload.new.id ? null : current);
        }
      })
      .subscribe();
    loadPending();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  if (!incoming && !call && !error) return null;
  const callClock = Math.floor(elapsed / 60).toString().padStart(2,'0') + ':' + (elapsed % 60).toString().padStart(2,'0');
  return <>
  {call && minimized && <div className="atl-call-mini-overlay" role="status" aria-label="Panggilan diminimalkan">
    <button className="atl-call-mini-main" type="button" onClick={() => setMinimized(false)} aria-label="Buka kembali panggilan">
      <span className="atl-call-mini-icon">{call.call_type === 'video' ? <Video size={18}/> : <Phone size={18}/>}</span>
      <span className="atl-call-mini-copy"><b>{call.peerName || 'Panggilan Atlantic'}</b><small>{phase || 'Menghubungkan…'}{phase === 'Terhubung' ? ' · ' + callClock : ''}</small></span>
      <Maximize2 size={17}/>
    </button>
    <button className="atl-call-mini-end" type="button" onClick={endCall} aria-label="Akhiri panggilan"><PhoneOff size={17}/></button>
  </div>}
  <div className={'atl-call-backdrop' + (minimized && call ? ' is-minimized' : '')}>
    <section className={'atl-call-modal ' + (call?.call_type === 'video' ? 'is-video' : '')}>
      <header><b>{incoming ? 'Panggilan masuk' : call?.direction === 'outgoing' ? 'Panggilan keluar' : 'Panggilan berlangsung'}</b><div className="atl-call-header-actions">{call && <button type="button" onClick={() => setMinimized(true)} aria-label="Minimalkan panggilan"><Minus size={19}/></button>}<button type="button" onClick={call ? endCall : incoming ? rejectIncoming : () => { setIncoming(null); setError(''); }} aria-label="Tutup"><X size={19}/></button></div></header>
      {incoming ? <>
        <div className="atl-call-incoming-icon">{incoming.call_type === 'video' ? <Video size={32}/> : <Phone size={32}/>}</div>
        <h2>{incoming.peerName || 'Pengguna Atlantic'}</h2>
        <p>Mengundang panggilan {incoming.call_type === 'video' ? 'video' : 'suara'}…</p>
        <div className="atl-call-actions">
          <button className="decline" type="button" onClick={rejectIncoming}><PhoneOff size={18}/> Tolak</button>
          <button className="accept" type="button" onClick={acceptIncoming}><Phone size={18}/> Terima</button>
        </div>
      </> : call ? <>
        <div className="atl-call-peer">{call.peerName}<small>{phase || 'Menghubungkan…'}{phase === 'Terhubung' ? ' · ' + Math.floor(elapsed / 60).toString().padStart(2,'0') + ':' + (elapsed % 60).toString().padStart(2,'0') : ''}</small></div>
        {call.call_type === 'video' && <div className="atl-call-video-grid">
          <video ref={remoteVideoRef} autoPlay playsInline className="atl-call-remote-video"/>
          <video ref={localVideoRef} autoPlay muted playsInline className="atl-call-local-video" style={{ transform: mirrorSelf && cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}/>
        </div>}
        {call.call_type === 'audio' && <><audio ref={remoteAudioRef} autoPlay/><div className="atl-call-audio-art"><Phone size={38}/></div></>}
        {error && <p className="atl-call-error">{error}</p>}
        <div className="atl-call-actions">
          <button className={muted ? 'muted' : ''} type="button" onClick={toggleMute}>{muted ? <MicOff size={18}/> : <Mic size={18}/>} {muted ? 'Mic mati' : 'Bisukan'}</button>
          {call.call_type === 'video' && <button className={cameraOff ? 'muted' : ''} type="button" onClick={toggleCamera}>{cameraOff ? <VideoOff size={18}/> : <Video size={18}/>} {cameraOff ? 'Kamera mati' : 'Kamera'}</button>}
          {call.call_type === 'video' && <button type="button" onClick={() => setCameraSettingsOpen(open => !open)}><Settings2 size={18}/> Pengaturan video</button>}
          <button className="decline" type="button" onClick={endCall}><PhoneOff size={18}/> Akhiri</button>
        </div>
        {call.call_type === 'video' && cameraSettingsOpen && <div className="atl-call-video-settings">
          <button type="button" onClick={switchCamera} disabled={cameraOff}><Camera size={17}/> Ganti ke kamera {cameraFacing === 'user' ? 'belakang' : 'depan'}</button>
          <button type="button" onClick={() => setMirrorSelf(value => !value)}><FlipHorizontal size={17}/> Mirror {mirrorSelf ? 'aktif' : 'nonaktif'}</button>
          <small>Mirror hanya mengubah tampilan kamera sendiri.</small>
        </div>}
      </> : <><h2>Panggilan gagal</h2><p className="atl-call-error">{error}</p><div className="atl-call-actions"><button type="button" onClick={() => setError('')}>Tutup</button></div></>}
    </section>
  </div></>;
}
