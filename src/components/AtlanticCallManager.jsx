import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-react';

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const signalChannelRef = useRef(null);
  const callRef = useRef(null);
  const pendingIceRef = useRef([]);
  const endedRef = useRef(false);

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
      }, payload => { handleSignal(payload.new).catch(err => setError(err.message || 'Sinyal panggilan gagal diproses.')); });
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
  }, [handleSignal]);

  const createPeer = useCallback((activeCall, stream) => {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      const [streamFromPeer] = event.streams;
      if (streamFromPeer) setRemoteStream(streamFromPeer);
    };
    pc.onicecandidate = event => {
      if (event.candidate) {
        sendSignal(activeCall, 'ice', event.candidate.toJSON()).catch(err => setError(err.message || 'Kandidat jaringan gagal dikirim.'));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setPhase('Terhubung');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setPhase('Koneksi terputus');
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
        video: request.callType === 'video'
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
      const pc = createPeer(activeCall, stream);
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
    if (intent?.id) startOutgoing(intent);
  }, [intent?.id, startOutgoing]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || callRef.current) return;
    setError('');
    setPhase('Menyiapkan panggilan…');
    endedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incoming.call_type === 'video'
      });
      attachStream(stream);
      const activeCall = { ...incoming, peerId: incoming.caller_id, peerName: incoming.peerName || 'Pengguna Atlantic', direction: 'incoming' };
      callRef.current = activeCall;
      setCall(activeCall);
      setIncoming(null);
      await subscribeSignals(activeCall.id);
      const pc = createPeer(activeCall, stream);
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
    await supabase.from('atlantic_call_sessions').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', incoming.id);
    try {
      await supabase.from('atlantic_call_signals').insert({
        call_id: incoming.id, sender_id: user.id, recipient_id: incoming.caller_id,
        signal_type: 'decline', payload: {}
      });
    } catch {}
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

  useEffect(() => {
    if (!call?.started_at) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call?.id, call?.started_at]);

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
      .subscribe();
    loadPending();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  if (!incoming && !call && !error) return null;
  return <div className="atl-call-backdrop">
    <section className={'atl-call-modal ' + (call?.call_type === 'video' ? 'is-video' : '')}>
      <header><b>{incoming ? 'Panggilan masuk' : call?.direction === 'outgoing' ? 'Panggilan keluar' : 'Panggilan berlangsung'}</b><button type="button" onClick={call ? endCall : () => { setIncoming(null); setError(''); }} aria-label="Tutup"><X size={19}/></button></header>
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
          <video ref={localVideoRef} autoPlay muted playsInline className="atl-call-local-video"/>
        </div>}
        {call.call_type === 'audio' && <><audio ref={remoteAudioRef} autoPlay/><div className="atl-call-audio-art"><Phone size={38}/></div></>}
        {error && <p className="atl-call-error">{error}</p>}
        <div className="atl-call-actions">
          <button className={muted ? 'muted' : ''} type="button" onClick={toggleMute}>{muted ? <MicOff size={18}/> : <Mic size={18}/>} {muted ? 'Mic mati' : 'Bisukan'}</button>
          {call.call_type === 'video' && <button className={cameraOff ? 'muted' : ''} type="button" onClick={toggleCamera}>{cameraOff ? <VideoOff size={18}/> : <Video size={18}/>} {cameraOff ? 'Kamera mati' : 'Kamera'}</button>}
          <button className="decline" type="button" onClick={endCall}><PhoneOff size={18}/> Akhiri</button>
        </div>
      </> : <><h2>Panggilan gagal</h2><p className="atl-call-error">{error}</p><div className="atl-call-actions"><button type="button" onClick={() => setError('')}>Tutup</button></div></>}
    </section>
  </div>;
}
