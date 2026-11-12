import React, { useEffect, useRef, useState } from 'react';
import { supabase, configReady } from './supabase';
import AtlanticAccountSettings from './components/AtlanticAccountSettings';
import AtlanticCommunity from './components/AtlanticCommunity';
import AtlanticCallManager from './components/AtlanticCallManager';
import AtlanticAdminDashboard from './components/AtlanticAdminDashboard';
import AtlanticContacts from './components/AtlanticContacts';
import AtlanticGroupInfo from './components/AtlanticGroupInfo';
import AtlanticGroupInvitations from './components/AtlanticGroupInvitations';
import {
  MessageCircle, Search, Plus, Send, LogOut, ArrowLeft, Waves, Archive, ArchiveRestore, Bookmark, BookmarkCheck, Users, Ban,  
  Sparkles, MessageSquarePlus, Settings, UserRound, X, Check, ShieldCheck,
  Clock3, Radio, Phone, Video, NotebookPen, ImagePlus, BadgeCheck, Trash2, Reply, CheckCheck
} from 'lucide-react';

function initials(name = 'A') {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}

function time(value) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit'
  });
}

const DEFAULT_SETTINGS = {
  theme: 'light', accent: 'yellow', font: 'ios',
  textSize: 'medium', fps: '60', animations: true
};

const FONT_OPTIONS = [
  { value: 'ios', label: 'iOS / SF Pro' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'nunito', label: 'Nunito' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'arial', label: 'Arial' },
  { value: 'system', label: 'System Default' }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [atlanticDialog, setAtlanticDialog] = useState(null);
  const [atlanticDialogValue, setAtlanticDialogValue] = useState('');
  const atlanticDialogResolver = useRef(null);
  function openAtlanticDialog(options) { setAtlanticDialogValue(options.defaultValue || ''); setAtlanticDialog(options); return new Promise(resolve => { atlanticDialogResolver.current = resolve; }); }
  function closeAtlanticDialog(result) { setAtlanticDialog(null); const resolve = atlanticDialogResolver.current; atlanticDialogResolver.current = null; resolve?.(result); }
  const [chats, setChats] = useState([]);
  const [archivedIds, setArchivedIds] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [savedMessages, setSavedMessages] = useState([]);
  const [savedBusy, setSavedBusy] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupUsers, setGroupUsers] = useState([]);
  const [groupSelected, setGroupSelected] = useState([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const attachmentInputRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [unread, setUnread] = useState({});
  const [incomingNotice, setIncomingNotice] = useState(null);
  const [callIntent, setCallIntent] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [communityCreateRequest, setCommunityCreateRequest] = useState(0);
  const [replyTarget, setReplyTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [swipeState, setSwipeState] = useState({ id: null, offset: 0 });
  const [swipeFeedbackId, setSwipeFeedbackId] = useState(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeTimer = useRef(null);
  const typingChannelRef = useRef(null);
  const typingStopTimer = useRef(null);
  const typingIndicatorTimer = useRef(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const seenMessages = useRef(new Set());
  const bottomRef = useRef(null);

  const [settings, setSettings] = useState(() => {
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem('atlantic-settings') || '{}')
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('atlantic-settings', JSON.stringify(settings));
    } catch {}
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.textSize = settings.textSize;
    root.dataset.fps = settings.fps;
    root.dataset.animations = settings.animations ? 'on' : 'off';
    const accents = {
      yellow: '#ffd84d', blue: '#7bd5ff', pink: '#ff9ec7',
      green: '#b8f36b', purple: '#c6a5ff'
    };
    root.style.setProperty('--accent', accents[settings.accent] || accents.yellow);
  }, [settings]);

  function updateSetting(key, value) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!configReady) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
  setChats([]);
  loadMyProfile();
  loadProfiles();
  loadSavedMessages();
} else {
  setMyProfile(null);
  setChats([]);
  setActive(null);
  setMessages([]);
  setUnread({});
  setIncomingNotice(null);
  setAccountSettingsOpen(false);
  seenMessages.current.clear();
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) {
      setOnlineUsers([]);
      return;
    }
    const channel = supabase.channel('atlantic-presence', {
      config: { presence: { key: session.user.id } }
    });
    const syncOnlineUsers = () => {
      const state = channel.presenceState();
      setOnlineUsers(Object.keys(state).filter(id => id !== session.user.id));
    };
    channel
      .on('presence', { event: 'sync' }, syncOnlineUsers)
      .on('presence', { event: 'join' }, syncOnlineUsers)
      .on('presence', { event: 'leave' }, syncOnlineUsers)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED' && myProfile?.show_online_status === true) {
          await channel.track({
            user_id: session.user.id,
            online_at: new Date().toISOString()
          });
        }
      });
    return () => {
      setOnlineUsers([]);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, myProfile?.show_online_status]);

  async function loadMyProfile() {
    if (!session?.user?.id) return;
    const [{ data, error }, { data: isAdmin, error: badgeError }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,bio,is_verified,is_blocked,blocked_reason,read_receipts_enabled,show_online_status').eq('id', session.user.id).maybeSingle(),
      supabase.rpc('is_atlantic_admin', { target_user: session.user.id })
    ]);
    if (!error && data) {
      const isPrimaryAdmin = session.user.email?.toLowerCase() === 'awalulhakim94@gmail.com';
      setMyProfile({ ...data, is_admin: isAdmin === true || (!badgeError && isAdmin === true) || isPrimaryAdmin });
    }
  }

  async function authenticate(e) {
    e.preventDefault();
    setNotice('');
    setAuthBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: displayName.trim() } }
        });
        if (error) throw error;
        setNotice(data.session
          ? 'Akun berhasil dibuat.'
          : 'Akun dibuat. Periksa email untuk konfirmasi, lalu login.');
        if (!data.session) setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setNotice(err.message || 'Terjadi kesalahan.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadProfiles() {
  const { data: mine, error } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', session.user.id);

  if (error) {
    setNotice(error.message);
    return;
  }

  if (!mine?.length) {
    setChats([]);
    setArchivedIds([]);
    return;
  }

  const ids = mine.map(c => c.conversation_id);

  // Fetch independent sidebar datasets together so the chat list does not wait
  // for several avoidable network round trips in sequence.
  const [archiveResult, memberResult, conversationResult] = await Promise.all([
    supabase.from('archived_conversations')
      .select('conversation_id')
      .eq('user_id', session.user.id),
    supabase.from('conversation_members')
      .select('conversation_id,user_id')
      .in('conversation_id', ids)
      .neq('user_id', session.user.id),
    supabase.from('conversations')
      .select('id,title,is_group,created_by,description,avatar_url,is_verified,pinned_message_id,message_policy,add_member_policy')
      .in('id', ids)
  ]);

  const { data: archived, error: archiveError } = archiveResult;
  if (archiveError) setNotice('Arsip chat: ' + archiveError.message);
  else setArchivedIds((archived || []).map(row => row.conversation_id));

  const { data: members, error: memberError } = memberResult;
  if (memberError) { setNotice(memberError.message); return; }

  const { data: conversations, error: conversationError } = conversationResult;
  if (conversationError) { setNotice('Daftar percakapan: ' + conversationError.message); return; }

  // Delivery receipts are useful but should not block rendering the sidebar.
  void supabase.from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('conversation_id', ids)
    .neq('sender_id', session.user.id)
    .is('delivered_at', null);

  const userIds = [...new Set((members || []).map(m => m.user_id))];
  const { data: people, error: profileError } = userIds.length ? await supabase
    .from('profiles')
    .select('id,username,display_name,avatar_url,is_verified')
    .in('id', userIds) : { data: [], error: null };

  if (profileError) {
    setNotice(profileError.message);
    return;
  }

  const peopleWithBadges = await Promise.all((people || []).map(async person => {
    const { data: isAdmin, error: badgeError } = await supabase.rpc('is_atlantic_admin', { target_user: person.id });
    return { ...person, is_admin: !badgeError && isAdmin === true };
  }));
  const membersByConversation = new Map();
  (members || []).forEach(member => {
    const list = membersByConversation.get(member.conversation_id) || [];
    list.push(member);
    membersByConversation.set(member.conversation_id, list);
  });
  const peopleById = new Map(peopleWithBadges.map(person => [person.id, person]));
  const chatRows = await Promise.all((conversations || []).map(async conversation => {
    const conversationMembers = membersByConversation.get(conversation.id) || [];
    if (conversation.is_group) {
      const groupProfiles = [{ ...(myProfile || {}), id: session.user.id }, ...conversationMembers.map(member => peopleById.get(member.user_id)).filter(Boolean)];
      const title = conversation.title || 'Grup Atlantic';
      let groupAvatarUrl=null;
      if(conversation.avatar_url){const {data:signed}=await supabase.storage.from('atlantic-chat-media').createSignedUrl(conversation.avatar_url,3600);groupAvatarUrl=signed?.signedUrl||null;}
      return { conversation_id: conversation.id, is_group: true, title, is_verified: conversation.is_verified, description: conversation.description, avatar_path:conversation.avatar_url, avatar_url:groupAvatarUrl, pinned_message_id:conversation.pinned_message_id, message_policy:conversation.message_policy, add_member_policy:conversation.add_member_policy, members: groupProfiles, person: { id: conversation.id, display_name: title, username: title, avatar_url:groupAvatarUrl, is_group: true, is_verified: conversation.is_verified } };
    }
    const other = conversationMembers.map(member => peopleById.get(member.user_id)).find(Boolean);
    return other ? { conversation_id: conversation.id, person: other, is_group: false } : null;
  }));
  const validChatRows=chatRows.filter(Boolean);
  setChats(validChatRows);
  return validChatRows;
  }

  async function loadGroupUsers() {
    const { data, error } = await supabase.from('profiles')
      .select('id,username,display_name,avatar_url,is_verified,is_private,group_invite_policy')
      .neq('id', session.user.id)
      .order('display_name', { ascending: true })
      .limit(300);
    if (error) { setNotice('Daftar anggota grup gagal dimuat: ' + error.message); return; }
    // Private profiles are not discoverable through the new-group member picker.
    setGroupUsers((data || []).filter(person => person.is_private !== true));
    setGroupSelected([]);
    setGroupTitle('');
    setGroupSearch('');
    setActiveTab('chat');
    setCreateMenuOpen(false);
    setGroupCreateOpen(true);
  }

  async function createGroup() {
    if (groupBusy || groupSelected.length < 2 || groupTitle.trim().length < 2) return;
    setGroupBusy(true);
    const { data: conversationId, error } = await supabase.rpc('create_group_conversation', {
      group_title: groupTitle.trim(), member_ids: groupSelected
    });
    if (error || !conversationId) {
      setNotice('Grup gagal dibuat: ' + (error?.message || 'ID grup tidak ditemukan.'));
      setGroupBusy(false);
      return;
    }
    const selectedProfiles = groupUsers.filter(person => groupSelected.includes(person.id) && person.group_invite_policy !== 'approval');
    const group = {
      conversation_id: conversationId,
      is_group: true,
      title: groupTitle.trim(),
      members: [{ id: session.user.id, display_name: myProfile?.display_name || session.user.user_metadata?.display_name || session.user.email }, ...selectedProfiles],
      person: { id: conversationId, display_name: groupTitle.trim(), username: groupTitle.trim(), is_group: true }
    };
    setChats(current => [group, ...current]);
    setActive({ conversation_id: conversationId, person: group.person, is_group: true, title: group.title, members: group.members });
    setMessages([]);
    setMobileChat(true);
    setGroupCreateOpen(false);
    setCreateMenuOpen(false);
    const {count:pendingInvites}=await supabase.from('atlantic_group_invitations').select('id',{count:'exact',head:true}).eq('conversation_id',conversationId).eq('status','pending');
    setNotice(pendingInvites ? `Grup dibuat. ${pendingInvites} undangan menunggu persetujuan.` : 'Grup berhasil dibuat. Mulai percakapan sekarang!');
    await loadMessages(conversationId);
    await loadProfiles();
    setGroupBusy(false);
  }

  async function openGroupChat(group) {
    setNotice('');
    setUnread(old => { const next = { ...old }; delete next[group.conversation_id]; return next; });
    setIncomingNotice(null);
    setActive({ conversation_id: group.conversation_id, person: group.person, is_group: true, title: group.title, pinned_message_id:group.pinned_message_id, members: group.members || [] });
    setReplyTarget(null);
    setMobileChat(true);
    await loadMessages(group.conversation_id);
  }

  async function loadSavedMessages() {
    if (!session?.user?.id) return;
    setSavedBusy(true);
    const { data, error } = await supabase.from('saved_messages')
      .select('id,message_id,saved_at,message:messages!saved_messages_message_id_fkey(id,conversation_id,sender_id,body,created_at)')
      .eq('user_id', session.user.id)
      .order('saved_at', { ascending: false });
    if (error) setNotice('Pesan tersimpan gagal dimuat: ' + error.message);
    else setSavedMessages((data || []).filter(item => item.message));
    setSavedBusy(false);
  }

  async function toggleSavedMessage(message) {
    const existing = savedMessages.find(item => item.message_id === message.id);
    if (existing) {
      const { error } = await supabase.from('saved_messages').delete().eq('id', existing.id).eq('user_id', session.user.id);
      if (error) { setNotice('Pesan gagal dihapus dari tersimpan: ' + error.message); return; }
      setSavedMessages(items => items.filter(item => item.id !== existing.id));
      setNotice('Pesan dihapus dari Pesan Tersimpan.');
    } else {
      const { data, error } = await supabase.from('saved_messages').insert({ user_id: session.user.id, message_id: message.id })
        .select('id,message_id,saved_at,message:messages!saved_messages_message_id_fkey(id,conversation_id,sender_id,body,created_at)').single();
      if (error) { setNotice('Pesan gagal disimpan: ' + error.message); return; }
      setSavedMessages(items => [data, ...items]);
      setNotice('Pesan berhasil disimpan.');
    }
  }

  async function openSavedMessage(item) {
    const message = item.message;
    const chat = chats.find(entry => entry.conversation_id === message.conversation_id);
    if (!chat?.person) { setNotice('Percakapan asal pesan tidak ditemukan.'); return; }
    setActive({ conversation_id: message.conversation_id, person: chat.person, is_group: Boolean(chat.is_group), title: chat.title, members: chat.members || [] });
    setMobileChat(true);
    setShowSaved(false);
    await loadMessages(message.conversation_id);
    setTimeout(() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
  }

  async function toggleArchive(conversationId) {
    const isArchived = archivedIds.includes(conversationId);
    const query = isArchived
      ? supabase.from('archived_conversations').delete().eq('conversation_id', conversationId).eq('user_id', session.user.id)
      : supabase.from('archived_conversations').upsert({ conversation_id: conversationId, user_id: session.user.id }, { onConflict: 'conversation_id,user_id' });
    const { error } = await query;
    if (error) { setNotice('Arsip chat gagal diperbarui: ' + error.message); return; }
    setArchivedIds(current => isArchived ? current.filter(id => id !== conversationId) : [...current, conversationId]);
    setNotice(isArchived ? 'Chat dipindahkan kembali ke daftar utama.' : 'Chat berhasil diarsipkan.');
  }

  async function openChat(person) {
    setNotice('');
    try {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');
      if (userId === person.id) throw new Error('Kamu tidak bisa membuka chat dengan akun sendiri.');

      // Reuse the conversation already loaded in the chat list; only ask the
      // database to create/find one when this user has no existing chat row.
      const existingChat = chats.find(chat => !chat.is_group && chat.person?.id === person.id);
      let conversationId = existingChat?.conversation_id;
      if (!conversationId) {
        const { data, error } = await supabase.rpc(
          'create_direct_conversation', { target_user: person.id }
        );
        if (error) throw error;
        conversationId = data;
      }
      if (!conversationId) throw new Error('Database tidak mengembalikan ID percakapan.');

      setUnread(old => {
        const next = { ...old };
        delete next[person.id];
        return next;
      });
      setIncomingNotice(null);
      setReplyTarget(null);
      setActive({ conversation_id: conversationId, person });
      setMobileChat(true);
      // The active-chat effect loads messages and subscribes to realtime.
      // Avoid loading the same history twice or refreshing every chat profile.
    } catch (err) {
      setNotice('Gagal membuka chat: ' + (err?.message || 'Terjadi kesalahan.'));
    }
  }

  function chooseChatAttachment(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'];
    if (!allowed.includes(file.type)) { setNotice('Format file tidak didukung.'); return; }
    if (file.size > 50 * 1024 * 1024) { setNotice('Ukuran lampiran maksimal 50 MB.'); return; }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachmentFile(file); setAttachmentPreview(URL.createObjectURL(file));
  }
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); }, [attachmentPreview]);

  async function loadMessages(id) {
    const { data, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,body,created_at,reply_to,delivered_at,read_at,media_url,media_type,media_name')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      setNotice(error.message);
      return;
    }
    const messageIds = (data || []).map(message => message.id);
    const { data: hiddenStates, error: hiddenError } = messageIds.length
      ? await supabase.from('message_user_states').select('message_id').eq('user_id', session.user.id).eq('is_deleted', true).in('message_id', messageIds)
      : { data: [], error: null };
    if (hiddenError) { setNotice('Status hapus pesan gagal dimuat: ' + hiddenError.message); return; }
    const hiddenIds = new Set((hiddenStates || []).map(row => row.message_id));
    const visibleMessages = (data || []).filter(message => !hiddenIds.has(message.id));
    const messagesWithMedia = await Promise.all(visibleMessages.map(async message => {
      if (!message.media_url) return message;
      const { data: signed } = await supabase.storage.from('atlantic-chat-media').createSignedUrl(message.media_url, 3600);
      return { ...message, media_url: signed?.signedUrl || null };
    }));
    const senderIds = [...new Set((data || []).map(message => message.sender_id).filter(Boolean))];
    const { data: senderProfiles } = senderIds.length ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', senderIds) : { data: [] };
    const senderMap = Object.fromEntries((senderProfiles || []).map(profile => [profile.id, profile]));
    const replyIds = [...new Set(visibleMessages.map(m => m.reply_to).filter(Boolean))];
    let replyMap = {};
    if (replyIds.length) {
      const { data: originals } = await supabase.from('messages').select('id,body,sender_id').in('id', replyIds);
      replyMap = Object.fromEntries((originals || []).map(item => [item.id, item]));
    }
    const incomingIds = visibleMessages.filter(m => m.sender_id !== session.user.id).map(m => m.id);
    if (incomingIds.length) {
      const now = new Date().toISOString();
      const receipt = { delivered_at: now };
      if (myProfile?.read_receipts_enabled !== false) receipt.read_at = now;
      await supabase.from('messages').update(receipt).in('id', incomingIds);
    }
    setMessages(messagesWithMedia.map(m => ({ ...m, senderProfile: senderMap[m.sender_id] || null, replyPreview: replyMap[m.reply_to] ? { ...replyMap[m.reply_to], body: hiddenIds.has(m.reply_to) ? 'Pesan dihapus untuk kamu' : replyMap[m.reply_to].body, senderProfile: senderMap[replyMap[m.reply_to].sender_id] || null } : null })));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  useEffect(() => {
    if (!active || !session) return;
    loadMessages(active.conversation_id);
    const channel = supabase
      .channel('chat-' + active.conversation_id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${active.conversation_id}`
      }, async payload => {
        const incoming = payload.new;
        if (incoming.reply_to) {
          const { data: original } = await supabase.from('messages').select('id,body,sender_id').eq('id', incoming.reply_to).maybeSingle();
          incoming.replyPreview = original || null;
        }
        if (active.is_group) {
          const { data: senderProfile } = await supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id', incoming.sender_id).maybeSingle();
          incoming.senderProfile = senderProfile || null;
          if (incoming.replyPreview) {
            const { data: replyProfile } = await supabase.from('profiles').select('id,username,display_name').eq('id', incoming.replyPreview.sender_id).maybeSingle();
            incoming.replyPreview.senderProfile = replyProfile || null;
          }
        }
        if (incoming.sender_id !== session.user.id) {
          const now = new Date().toISOString();
          const receipt = { delivered_at: now };
          if (myProfile?.read_receipts_enabled !== false) receipt.read_at = now;
          const { error: receiptError } = await supabase.from('messages').update(receipt).eq('id', incoming.id);
          if (!receiptError) {
            incoming.delivered_at = now;
            if (receipt.read_at) incoming.read_at = now;
          }
        }
        setMessages(old => old.some(m => m.id === incoming.id) ? old : [...old, incoming]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${active.conversation_id}` }, payload => {
        setMessages(old => old.map(m => m.id === payload.new.id ? { ...m, delivered_at: payload.new.delivered_at, read_at: payload.new.read_at } : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const deleted = payload.old;
        if (deleted?.id) setMessages(old => old.filter(m => m.id !== deleted.id).map(m => m.reply_to === deleted.id ? { ...m, reply_to: null, replyPreview: null } : m));
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_user_states',
        filter: 'user_id=eq.' + session.user.id
      }, payload => {
        if (payload.new?.is_deleted) {
          setMessages(old => old.filter(m => m.id !== payload.new.message_id));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [active?.conversation_id, session?.user?.id, myProfile?.read_receipts_enabled]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('atlantic-global-messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages'
      }, async payload => {
        const message = payload.new;
        if (!message || message.sender_id === session.user.id ||
            seenMessages.current.has(message.id)) return;
        seenMessages.current.add(message.id);
        if (active?.conversation_id === message.conversation_id) return;

        const { data: members, error: memberError } = await supabase
          .from('conversation_members').select('user_id')
          .eq('conversation_id', message.conversation_id);
        if (memberError || !members?.some(m => m.user_id === session.user.id)) return;

        const { data: person, error: profileError } = await supabase
          .from('profiles').select('id,username,display_name,avatar_url')
          .eq('id', message.sender_id).single();
        if (profileError || !person) return;

        const targetChat = chats.find(chat => chat.conversation_id === message.conversation_id);
        const unreadKey = targetChat?.is_group ? message.conversation_id : person.id;
        await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', message.id).is('delivered_at', null);
        setUnread(old => ({ ...old, [unreadKey]: (old[unreadKey] || 0) + 1 }));
        setIncomingNotice({ person, body: message.body || 'Mengirim pesan', conversationId: message.conversation_id, isGroup: Boolean(targetChat?.is_group), groupTitle: targetChat?.title });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id, active?.conversation_id, chats]);

  useEffect(() => {
    if (!active?.conversation_id || !session?.user?.id) return;
    const channel = supabase.channel('atlantic-typing-' + active.conversation_id);
    typingChannelRef.current = channel;
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.user_id !== session.user.id) {
        setOtherTyping(Boolean(payload?.is_typing));
        if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current);
        if (payload?.is_typing) typingIndicatorTimer.current = setTimeout(() => setOtherTyping(false), 2400);
      }
    }).subscribe();
    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current);
      typingChannelRef.current = null;
      setOtherTyping(false);
      supabase.removeChannel(channel);
    };
  }, [active?.conversation_id, session?.user?.id]);

  function updateDraft(value) {
    setDraft(value);
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: Boolean(value.trim()) } });
    if (value.trim()) typingStopTimer.current = setTimeout(() => {
      channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: false } });
    }, 1400);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && !attachmentFile) || !active || sending) return;
    setSending(true); setDraft('');
    let mediaPath = null;
    if (attachmentFile) {
      const extension = (attachmentFile.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'') || 'bin';
      mediaPath = active.conversation_id + '/' + session.user.id + '/' + crypto.randomUUID() + '.' + extension;
      const { error: uploadError } = await supabase.storage.from('atlantic-chat-media').upload(mediaPath, attachmentFile, { upsert:false, contentType:attachmentFile.type });
      if (uploadError) { setDraft(body); setNotice('Lampiran gagal diunggah: ' + uploadError.message); setSending(false); return; }
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: false } });
    const { error } = await supabase.from('messages').insert({ conversation_id:active.conversation_id, sender_id:session.user.id, body, media_url:mediaPath, media_type:attachmentFile?.type || null, media_name:attachmentFile?.name || null, reply_to:replyTarget?.id || null });
    if (error) { if (mediaPath) await supabase.storage.from('atlantic-chat-media').remove([mediaPath]); setDraft(body); setNotice('Pesan gagal dikirim: ' + error.message); }
    else { setReplyTarget(null); setAttachmentFile(null); setAttachmentPreview(''); }
    setSending(false);
  }

  function requestCall(callType) {
    if (!active?.person?.id || !active?.conversation_id || active.is_group || !session?.user?.id) return;
    setCallIntent({
      id: crypto.randomUUID(),
      callType,
      conversationId: active.conversation_id,
      target: active.person
    });
    setNotice('');
  }

  async function confirmDeleteMessage(scope) {
    const message = deleteTarget;
    if (!message) return;
    let error = null;
    if (scope === 'everyone') {
      if (message.sender_id !== session.user.id) return;
      ({ error } = await supabase.from('messages').delete().eq('id', message.id).eq('sender_id', session.user.id));
    } else {
      ({ error } = await supabase.from('message_user_states').upsert({
        message_id: message.id,
        user_id: session.user.id,
        is_deleted: true
      }, { onConflict: 'message_id,user_id' }));
    }
    if (error) setNotice('Pesan gagal dihapus: ' + error.message);
    else {
      setMessages(old => old.filter(m => m.id !== message.id).map(m => m.reply_to === message.id
        ? { ...m, reply_to: null, replyPreview: { ...(m.replyPreview || {}), body: 'Pesan dihapus' } }
        : m));
      if (replyTarget?.id === message.id) setReplyTarget(null);
    }
    setDeleteTarget(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessages([]);
    setActive(null);
    setMobileChat(false);
    setUnread({});
    setIncomingNotice(null);
    setAccountSettingsOpen(false);
    seenMessages.current.clear();
  }

  if (!configReady) {
    return (
      <div className="setup">
        <div className="brand"><Waves /> ATLANTIC</div>
        <h1>Hubungkan database dulu</h1>
        <p>Isi file <b>.env</b> dengan Project URL dan Publishable Key Supabase. Lihat README.txt di paket proyek.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="center"><span className="loader-orbit" /><b>Menyiapkan Atlantic…</b></div>;
  }

  if (!session) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand"><Waves size={28} /> ATLANTIC <Sparkles size={17} /></div>
          <p className="muted">Ruang obrolanmu, terhubung kapan saja.</p>
          <h1>{mode === 'login' ? 'Selamat datang kembali' : 'Buat akun Atlantic'}</h1>
          <form onSubmit={authenticate}>
            {mode === 'signup' && (
              <label>Nama tampilan
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} required placeholder="Nama kamu" />
              </label>
            )}
            <label>Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="nama@email.com" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength="6" required placeholder="Minimal 6 karakter" />
            </label>
            <button className="primary full" disabled={authBusy}>
              {authBusy ? <><span className="button-spinner" /> Memproses…</> : mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          </form>
          {notice && <p className="notice">{notice}</p>}
          <p className="switch">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setNotice(''); }}>
              {mode === 'login' ? 'Daftar' : 'Masuk'}
            </button>
          </p>
        </section>
      </main>
    );
  }

  if (myProfile?.is_blocked) {
    return <main className="auth-wrap"><section className="auth-card"><div className="brand"><Waves size={28}/> ATLANTIC</div><Ban size={42}/><h1>Akun diblokir</h1><p>Akun Atlantic ini sedang diblokir oleh admin sehingga fitur chat dan komunitas tidak dapat digunakan.</p>{myProfile.blocked_reason && <p className="notice">Alasan: {myProfile.blocked_reason}</p>}<button className="primary full" onClick={logout}>Keluar dari akun</button></section></main>;
  }

  const visibleChats = chats.filter(c => archivedIds.includes(c.conversation_id) === showArchived);
  const filtered = visibleChats.filter(c =>
  (c.person.display_name || c.person.username || '')
    .toLowerCase().includes(search.toLowerCase())
);

  return (
    <main className={`app-shell tab-${activeTab}`}>
      <aside className={`sidebar ${mobileChat ? 'hide-mobile' : ''}`}>
        <header className="topbar">
          <div className="brand"><Waves /> ATLANTIC</div>
          <div className="top-actions">
            {myProfile?.is_admin && <button className="icon-btn" onClick={() => setAdminDashboardOpen(true)} title="Dashboard Admin" aria-label="Dashboard Admin"><ShieldCheck size={19} /></button>}
            <button className="icon-btn" onClick={() => setAccountSettingsOpen(true)} title="Profil dan privasi" aria-label="Profil dan privasi">
              <UserRound size={19} />
            </button>
            <button className="icon-btn" onClick={() => { setSettingsTab('appearance'); setSettingsOpen(true); }} title="Pengaturan tampilan" aria-label="Pengaturan tampilan">
              <Settings size={19} />
            </button>
            <button className="icon-btn" onClick={logout} title="Keluar" aria-label="Keluar">
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <div className="me">
          <div className="avatar">{myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : initials(myProfile?.display_name || session.user.user_metadata?.display_name || session.user.email)}</div>
          <div>
            <b>{myProfile?.display_name || session.user.user_metadata?.display_name || session.user.email}{myProfile?.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={16}/></span> : myProfile?.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={16}/></span>}</b>
            <small><i className="online-dot" /> Online</small>
          </div>
        </div>

        <div className="search">
          <Search size={17} />
          <input placeholder="Cari Chat…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="chat-list-tabs"><button className={!showArchived && !showSaved ? 'active' : ''} onClick={() => { setShowArchived(false); setShowSaved(false); }}>Semua chat</button><button className={showArchived && !showSaved ? 'active' : ''} onClick={() => { setShowArchived(true); setShowSaved(false); }}><Archive size={14}/> Arsip {archivedIds.length ? `(${archivedIds.length})` : ''}</button><button className={showSaved ? 'active' : ''} onClick={() => { setShowSaved(true); loadSavedMessages(); }}><Bookmark size={14}/> Tersimpan</button></div>
        <AtlanticGroupInvitations user={session.user} onNotice={setNotice} onAccepted={async conversationId=>{const updated=await loadProfiles();const joined=updated?.find(item=>item.conversation_id===conversationId);if(joined)openGroupChat(joined);}} />
        <div className="section-title"><span>{showSaved ? 'Pesan Tersimpan' : showArchived ? 'Arsip Chat' : 'Chat'}</span><span className="count-tag">{showSaved ? savedMessages.length : filtered.length}</span></div>
        <div className="people">
  {showSaved ? (savedBusy ? <p className="empty">Memuat pesan tersimpan…</p> : savedMessages.map(item => {
    const message = item.message;
    const chat = chats.find(entry => entry.conversation_id === message.conversation_id);
    const savedSender = chat?.is_group ? chat.members?.find(person => person.id === message.sender_id) : chat?.person;
    const author = message.sender_id === session.user.id ? 'Kamu' : (savedSender?.display_name || savedSender?.username || 'Pengguna');
    return <div className="saved-message-row" key={item.id}><button type="button" className="saved-message-open" onClick={() => openSavedMessage(item)}><b>{author}</b><span>{message.body || 'Pesan'}</span><small>{time(message.created_at)} · Buka percakapan</small></button><button type="button" className="saved-message-remove" onClick={() => toggleSavedMessage(message)} aria-label="Hapus dari pesan tersimpan"><X size={15}/></button></div>;
  })) : filtered.map(c => (
    <div className="person-row" key={c.conversation_id}>
      <button
        className={`person ${active?.conversation_id === c.conversation_id ? 'selected' : ''}`}
        onClick={() => c.is_group ? openGroupChat(c) : openChat(c.person)}
      >
        <div className="avatar">
          {c.person.avatar_url ? <img src={c.person.avatar_url} alt="" /> : c.is_group ? <Users size={19}/> : initials(c.person.display_name || c.person.username)}
        </div>
        <div className="person-info">
          <b>{c.person.display_name || c.person.username}{c.is_group && c.is_verified ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={14}/></span> : c.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={14}/></span> : c.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={14}/></span>}</b>
          <small>Ketuk untuk membuka chat</small>
        </div>
        {(unread[c.is_group ? c.conversation_id : c.person.id] || 0) > 0 && <span className="atl-unread-badge" aria-label={(unread[c.is_group ? c.conversation_id : c.person.id] || 0) + ' pesan belum dibaca'}>{(unread[c.is_group ? c.conversation_id : c.person.id] || 0) > 99 ? '99+' : unread[c.is_group ? c.conversation_id : c.person.id]}</span>}
        <MessageCircle size={17} />
      </button>
      <button type="button" className="archive-chat-btn" title={showArchived ? 'Keluarkan dari arsip' : 'Arsipkan chat'} aria-label={showArchived ? 'Keluarkan dari arsip' : 'Arsipkan chat'} onClick={() => toggleArchive(c.conversation_id)}>{showArchived ? <ArchiveRestore size={16}/> : <Archive size={16}/>}</button>
    </div>
  ))}

  {(showSaved ? !savedBusy && !savedMessages.length : !filtered.length) && (
    <p className="empty">{showSaved ? 'Belum ada pesan tersimpan' : showArchived ? 'Belum ada chat yang diarsipkan' : 'Belum ada percakapan'}</p>
  )}
</div>
        <footer className="side-foot">ATLANTIC WEB <span>•</span> V1.1</footer>
      </aside>

      <section className={`chat-panel ${mobileChat ? 'show-mobile' : ''}`}>
        {active ? (
          <>
            <header className="chat-head">
              <button className="back icon-btn" onClick={() => setMobileChat(false)} aria-label="Kembali"><ArrowLeft /></button>
              <div className="avatar">{active.person.avatar_url ? <img src={active.person.avatar_url} alt="" /> : active.is_group ? <Users size={20}/> : initials(active.person.display_name || active.person.username)}</div>
              <div className="chat-person" onClick={() => active.is_group && setGroupInfoOpen(true)} role={active.is_group ? "button" : undefined} tabIndex={active.is_group ? 0 : undefined}>
                <b>{active.person.display_name || active.person.username}{active.is_group && active.is_verified ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={15}/></span> : active.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={15}/></span> : active.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={15}/></span>}</b>
                <small>{otherTyping ? <span className="typing-indicator"><i/><i/><i/> sedang mengetik</span> : active.is_group ? `${active.members?.length || 0} anggota` : <>{onlineUsers.includes(active.person.id) && <span className="atl-online-dot" aria-label="Online"/>}{onlineUsers.includes(active.person.id) ? 'Online · ' : ''}@{active.person.username}</>}</small>
              </div>
              {!active.is_group && <div className="chat-head-actions">
                <button type="button" className="icon-btn" onClick={() => requestCall('audio')} title="Undang panggilan suara" aria-label="Undang panggilan suara"><Phone size={18}/></button>
                <button type="button" className="icon-btn" onClick={() => requestCall('video')} title="Undang panggilan video" aria-label="Undang panggilan video"><Video size={18}/></button>
              </div>}
            </header>
            {active.is_group&&active.pinned_message_id&&messages.find(message=>message.id===active.pinned_message_id)&&<button type="button" className="atl-pinned-message" onClick={()=>document.getElementById('message-'+active.pinned_message_id)?.scrollIntoView({behavior:'smooth',block:'center'})}><span>📌 Pesan disematkan</span><b>{(messages.find(message=>message.id===active.pinned_message_id)?.body||'Lampiran').slice(0,110)}</b></button>}
            <div className="messages">
              {messages.map(m => (
                <div
                  className={`bubble-row ${m.sender_id === session.user.id ? 'mine' : ''} ${swipeState.id === m.id && swipeState.offset > 0 ? 'reply-swiping' : ''} ${swipeFeedbackId === m.id ? 'reply-swipe-confirmed' : ''}`}
                  key={m.id}
                  id={`message-${m.id}`}
                  style={swipeState.id === m.id ? { transform: `translateX(${swipeState.offset}px)` } : undefined}
                  onTouchStart={e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; }}
                  onTouchMove={e => {
                    const dx = e.touches[0].clientX - touchStartX.current;
                    const dy = e.touches[0].clientY - touchStartY.current;
                    if (dx > 6 && dx > Math.abs(dy)) setSwipeState({ id: m.id, offset: Math.min(dx, 92) });
                  }}
                  onTouchEnd={e => {
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    const dy = e.changedTouches[0].clientY - touchStartY.current;
                    if (dx > 65 && dx > Math.abs(dy)) {
                      setReplyTarget(m);
                      setSwipeFeedbackId(m.id);
                      if (swipeTimer.current) clearTimeout(swipeTimer.current);
                      swipeTimer.current = setTimeout(() => setSwipeFeedbackId(null), 650);
                    }
                    setSwipeState({ id: null, offset: 0 });
                  }}
                >
                  <div className={`swipe-reply-indicator ${swipeState.id === m.id && swipeState.offset > 12 ? 'visible' : ''}`} style={swipeState.id === m.id ? { opacity: Math.min(swipeState.offset / 65, 1) } : undefined}><Reply size={15}/></div>
                  <div className="bubble">
                    {m.replyPreview && <button type="button" className="reply-quote" onClick={() => document.getElementById(`message-${m.reply_to}`)?.scrollIntoView({behavior:'smooth',block:'center'})}><b>{m.replyPreview.sender_id === session.user.id ? 'Kamu' : (active.is_group ? (m.replyPreview.senderProfile?.display_name || m.replyPreview.senderProfile?.username || 'Anggota grup') : (active.person.display_name || active.person.username))}</b><span>{m.replyPreview.body || 'Pesan'}</span></button>}
                    {active.is_group && <b className="group-sender-name">{m.senderProfile?.display_name || m.senderProfile?.username || (m.sender_id === session.user.id ? 'Kamu' : 'Anggota grup')}</b>}
                    {m.media_url && (m.media_type?.startsWith('image/') ? <img className="atl-message-media" src={m.media_url} alt={m.media_name || 'Foto'} loading="lazy"/> : m.media_type?.startsWith('video/') ? <video className="atl-message-media" src={m.media_url} controls playsInline preload="metadata"/> : <a className="atl-message-file" href={m.media_url} target="_blank" rel="noreferrer">📎 {m.media_name || 'Buka lampiran'}</a>)}
                    {m.body && <div>{m.body}</div>}
                    <div className="bubble-meta"><time>{time(m.created_at)}</time><button type="button" className={`message-save-btn ${savedMessages.some(item => item.message_id === m.id) ? 'is-saved' : ''}`} onClick={() => toggleSavedMessage(m)} aria-label={savedMessages.some(item => item.message_id === m.id) ? 'Hapus dari pesan tersimpan' : 'Simpan pesan'} title={savedMessages.some(item => item.message_id === m.id) ? 'Tersimpan' : 'Simpan pesan'}>{savedMessages.some(item => item.message_id === m.id) ? <BookmarkCheck size={13}/> : <Bookmark size={13}/>}</button>{m.sender_id === session.user.id && <span className={`message-status ${m.read_at ? 'is-read' : ''}`} title={m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}>{m.delivered_at || m.read_at ? <CheckCheck size={13}/> : <Check size={13}/>}<small>{m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}</small></span>}<button type="button" className="message-reply-btn" onClick={() => setReplyTarget(m)} aria-label="Balas pesan"><Reply size={13}/></button><button type="button" className="message-delete-btn" onClick={() => setDeleteTarget(m)} aria-label="Hapus pesan"><Trash2 size={13}/></button></div>
                  </div>
                </div>
              ))}
              {!messages.length && (
                <div className="empty-chat">
                  <MessageCircle size={34} /><b>Mulai percakapan</b>
                  <span>{active.is_group ? `Kirim pesan pertama ke ${active.title}.` : `Kirim pesan pertama ke ${active.person.display_name || active.person.username}.`}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            {replyTarget && <div className="reply-composer-preview"><div><b>Membalas {replyTarget.sender_id === session.user.id ? 'pesan sendiri' : (active.person.display_name || active.person.username)}</b><span>{replyTarget.body || 'Pesan'}</span></div><button type="button" onClick={() => setReplyTarget(null)} aria-label="Batal membalas"><X size={17}/></button></div>}
            {attachmentPreview && <div className="atl-chat-attachment-preview"><span>{attachmentFile?.name}</span><button type="button" onClick={() => {setAttachmentFile(null);setAttachmentPreview('');}}>Hapus</button></div>}
            <form className="composer" onSubmit={sendMessage}>
              <input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf" onChange={chooseChatAttachment} hidden />
              <button type="button" className="atl-chat-attach" onClick={() => attachmentInputRef.current?.click()} aria-label="Lampirkan foto, video, atau file"><ImagePlus size={19}/></button>
              <input value={draft} onChange={e => updateDraft(e.target.value)} placeholder={active.is_group ? 'Pesan ke ' + active.title + '…' : 'Tulis pesan…'} autoComplete="off" />
              <button className="send" disabled={(!draft.trim() && !attachmentFile) || sending} aria-label="Kirim pesan">{sending ? <span className="button-spinner" /> : <Send size={19} />}</button>
            </form>
          </>
        ) : (
          <div className="welcome">
            <div className="welcome-icon"><MessageSquarePlus size={42} /></div>
            <h2>Selamat datang di Atlantic</h2>
            <p>Pilih chat di samping atau tekan + untuk memulai percakapan.</p>
          </div>
        )}
      </section>

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}　×</button>}
      {atlanticDialog && <div className="atl-dialog-backdrop" onMouseDown={event => { if(event.target===event.currentTarget) closeAtlanticDialog(atlanticDialog.type==='prompt'?null:false); }}><section className="atl-dialog-card" role="dialog" aria-modal="true" aria-labelledby="atl-dialog-title"><span className="atl-dialog-eyebrow">ATLANTIC / CONFIRMATION</span><h2 id="atl-dialog-title">{atlanticDialog.title || 'Konfirmasi'}</h2><p>{atlanticDialog.message}</p>{atlanticDialog.type==='prompt' && <textarea autoFocus value={atlanticDialogValue} onChange={event=>setAtlanticDialogValue(event.target.value)} placeholder={atlanticDialog.placeholder || 'Tulis di sini…'} maxLength={atlanticDialog.maxLength || 1000}/>}<footer><button type="button" className="atl-dialog-cancel" onClick={()=>closeAtlanticDialog(atlanticDialog.type==='prompt'?null:false)}>{atlanticDialog.cancelLabel || 'Batal'}</button><button type="button" className="atl-dialog-confirm" onClick={()=>closeAtlanticDialog(atlanticDialog.type==='prompt'?atlanticDialogValue:true)}>{atlanticDialog.confirmLabel || 'Lanjutkan'}</button></footer></section></div>}
      {deleteTarget && <div className="neo-delete-backdrop" onClick={() => setDeleteTarget(null)}><section className="neo-delete-modal" role="dialog" aria-modal="true" aria-label="Pilihan hapus pesan" onClick={e => e.stopPropagation()}><span className="neo-delete-tag">ATLANTIC / MESSAGE</span><h2>HAPUS PESAN?</h2><p>Pilih apakah pesan hanya dihapus dari chat kamu atau untuk semua orang.</p><div className="neo-delete-actions"><button type="button" onClick={() => setDeleteTarget(null)}>BATAL</button><button type="button" onClick={() => confirmDeleteMessage('me')}>UNTUK SAYA</button>{deleteTarget.sender_id === session.user.id && <button type="button" onClick={() => confirmDeleteMessage('everyone')}>UNTUK SEMUA</button>}</div></section></div>}
      {incomingNotice && (
        <button className="toast incoming-message-toast" onClick={() => {
          const notice = incomingNotice;
          setIncomingNotice(null);
          if (notice.isGroup) {
            const group = chats.find(chat => chat.conversation_id === notice.conversationId);
            if (group) openGroupChat(group);
          } else openChat(notice.person);
        }}>
          <b>{incomingNotice.person.display_name || incomingNotice.person.username}</b>
          {incomingNotice.isGroup && <small> di {incomingNotice.groupTitle || 'Grup Atlantic'}</small>}
          <span className="incoming-toast-body">{incomingNotice.body}</span>
          <span className="incoming-toast-close">×</span>
        </button>
      )}

      {settingsOpen && (
        <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pengaturan Atlantic">
            <header className="settings-header">
              <div><span className="eyebrow">ATLANTIC CONTROL</span><h2>Pengaturan</h2></div>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Tutup"><X size={19} /></button>
            </header>

            <nav className="settings-tabs">
              <button className={settingsTab === 'appearance' ? 'active' : ''} onClick={() => setSettingsTab('appearance')}>Tampilan</button>
              <button className={settingsTab === 'performance' ? 'active' : ''} onClick={() => setSettingsTab('performance')}>Performa</button>
              <button className={settingsTab === 'about' ? 'active' : ''} onClick={() => setSettingsTab('about')}>Tentang</button>
            </nav>

            <div className="settings-content">
              {settingsTab === 'appearance' && <>
                <div className="setting-group">
                  <h3>Tema</h3><p>Pilih suasana tampilan Atlantic.</p>
                  <div className="choice-row">
                    {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([v, l]) => (
                      <button key={v} className={settings.theme === v ? 'choice selected' : 'choice'} onClick={() => updateSetting('theme', v)}>
                        {settings.theme === v && <Check size={15} />} {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Warna aksen</h3>
                  <div className="swatches">
                    {['yellow', 'blue', 'pink', 'green', 'purple'].map(c => (
                      <button key={c} aria-label={c} title={c} className={`swatch ${c} ${settings.accent === c ? 'chosen' : ''}`} onClick={() => updateSetting('accent', c)}>
                        {settings.accent === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Font website</h3><p>Emoji menggunakan fallback emoji bawaan perangkat.</p>
                  <div className="font-list">
                    {FONT_OPTIONS.map(f => (
                      <button key={f.value} className={`font-choice font-${f.value} ${settings.font === f.value ? 'selected' : ''}`} onClick={() => updateSetting('font', f.value)}>
                        <span><b>{f.label}</b><small>Halo dunia 👋 😀</small></span>
                        {settings.font === f.value && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Ukuran teks</h3>
                  <div className="choice-row">
                    {[['small', 'Kecil'], ['medium', 'Sedang'], ['large', 'Besar']].map(([v, l]) => (
                      <button key={v} className={settings.textSize === v ? 'choice selected' : 'choice'} onClick={() => updateSetting('textSize', v)}>
                        {settings.textSize === v && <Check size={15} />} {l}
                      </button>
                    ))}
                  </div>
                </div>
              </>}

              {settingsTab === 'performance' && <>
                <div className="setting-group">
                  <h3>Target animasi</h3>
                  <p>Pilih preset kelancaran animasi. FPS aktual tetap mengikuti browser, layar, dan kemampuan perangkat.</p>
                  <div className="fps-grid">
                    {[
                      ['30', 'Hemat baterai'], ['60', 'Seimbang'], ['90', 'Lebih mulus'],
                      ['120', 'Paling mulus'], ['auto', 'Otomatis']
                   ].map(([v, l]) => (
                      <button key={v} className={settings.fps === v ? 'fps-choice selected' : 'fps-choice'} onClick={() => updateSetting('fps', v)}>
                        <b>{v === 'auto' ? 'AUTO' : `${v} FPS`}</b><small>{l}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group setting-toggle">
                  <div><h3>Animasi UI</h3><p>Efek transisi, bubble, dan Liquid Glass.</p></div>
                  <button className={`toggle ${settings.animations ? 'on' : ''}`} onClick={() => updateSetting('animations', !settings.animations)} aria-pressed={settings.animations}><span /></button>
                </div>
              </>}

              {settingsTab === 'about' && (
                <div className="about-card">
                  <div className="about-logo"><Waves size={34} /></div>
                  <h2>ATLANTIC</h2><p>Ruang obrolanmu, terhubung kapan saja.</p>
                  <div className="about-meta">
                    <span>Versi</span><b>1.2.0</b><span>Platform</span><b>Atlantic Web</b><span>UI</span><b>Neobrutalism + Liquid Glass</b>
                  </div>
                  <a href="https://github.com/AwalulBieber/Atlantic" target="_blank" rel="noreferrer">Lihat repository GitHub ↗</a>
                  <small className="about-note">Dibuat untuk percakapan yang lebih nyaman. Pengaturan tampilan tersimpan di perangkat ini.</small>
                </div>
              )}
            </div>

            <footer className="settings-footer">
              <span>Perubahan tersimpan otomatis</span>
              <button className="primary" onClick={() => setSettingsOpen(false)}>Selesai</button>
            </footer>
          </section>
        </div>
      )}

      {groupCreateOpen && (
        <div className="group-create-backdrop" onClick={() => setGroupCreateOpen(false)}>
          <section className="group-create-modal" role="dialog" aria-modal="true" aria-label="Buat grup Atlantic" onClick={e => e.stopPropagation()}>
            <header><div><small>ATLANTIC GROUP</small><h2>Buat grup baru</h2></div><button type="button" className="icon-btn" onClick={() => setGroupCreateOpen(false)} aria-label="Tutup"><X size={18}/></button></header>
            <label>Nama grup<input value={groupTitle} onChange={e => setGroupTitle(e.target.value)} maxLength={60} placeholder="Contoh: Teman Kelas" /></label>
            <label>Cari anggota<input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Cari nama atau username…" /></label>
            <div className="group-selected-count">{groupSelected.length} anggota dipilih · minimal 2 orang selain kamu</div><p className="group-invite-hint">Jika pengguna mengatur undangan grup perlu persetujuan, mereka baru masuk setelah menerima undangan.</p>
            <div className="group-user-list">{groupUsers.filter(person => `${person.display_name || ''} ${person.username || ''}`.toLowerCase().includes(groupSearch.toLowerCase())).map(person => <label className="group-user-option" key={person.id}><input type="checkbox" checked={groupSelected.includes(person.id)} onChange={e => setGroupSelected(current => e.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))}/><span className="group-user-avatar">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : initials(person.display_name || person.username)}</span><span><b>{person.display_name || person.username}</b><small>@{person.username}{person.group_invite_policy === 'approval' ? ' · Perlu persetujuan' : ''}</small></span></label>)}</div>
            <footer><button type="button" onClick={() => setGroupCreateOpen(false)}>Batal</button><button type="button" className="primary" disabled={groupBusy || groupTitle.trim().length < 2 || groupSelected.length < 2} onClick={createGroup}>{groupBusy ? 'Membuat…' : `Buat Grup (${groupSelected.length + 1})`}</button></footer>
          </section>
        </div>
      )}

      {createMenuOpen && (
        <div className="create-menu-backdrop" onClick={() => setCreateMenuOpen(false)}>
          <section className="create-menu" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Buat baru">
            <header><div><small>ATLANTIC CREATE</small><b>Buat sesuatu</b></div><button className="icon-btn" onClick={() => setCreateMenuOpen(false)} aria-label="Tutup"><X size={18}/></button></header>
            <button onClick={() => { setActiveTab('chat'); setCreateMenuOpen(false); setNotice('Pilih pengguna dari daftar chat untuk membuka percakapan.'); }}><MessageSquarePlus/><span><b>Chat baru</b><small>Mulai percakapan</small></span></button>
            <button onClick={loadGroupUsers}><Users/><span><b>Grup baru</b><small>Buat grup dan pilih anggota</small></span></button>
            <button onClick={() => { setContactsOpen(true); setCreateMenuOpen(false); }}><UserRound/><span><b>Tambah kontak</b><small>Cari dan tambahkan teman Atlantic</small></span></button>
            <button onClick={() => { setActiveTab('updates'); setCommunityCreateRequest(v => v + 1); setCreateMenuOpen(false); setNotice(''); }}><ImagePlus/><span><b>Story</b><small>Bagikan momen singkat</small></span></button>
            <button onClick={() => { setActiveTab('updates'); setCommunityCreateRequest(v => v + 1); setCreateMenuOpen(false); setNotice(''); }}><NotebookPen/><span><b>Catatan</b><small>Tulis sesuatu untuk dibagikan</small></span></button>
          </section>
        </div>
      )}

      {adminDashboardOpen && <AtlanticAdminDashboard user={session.user} onClose={() => setAdminDashboardOpen(false)} onNotice={setNotice} onDialog={openAtlanticDialog} />}
      {contactsOpen && <AtlanticContacts user={session.user} onClose={() => setContactsOpen(false)} onOpenChat={person => { setContactsOpen(false); if(person) openChat(person); }} onDialog={openAtlanticDialog} />}
      {groupInfoOpen && active?.is_group && <AtlanticGroupInfo conversationId={active.conversation_id} user={session.user} onClose={() => setGroupInfoOpen(false)} onUpdated={updated => { setActive(current => current ? {...current,title:updated.title,pinned_message_id:updated.pinned_message_id,person:{...current.person,display_name:updated.title,avatar_url:updated.avatar_signed_url||current.person.avatar_url,is_verified:current.is_verified}} : current); loadProfiles(); }} />}

      {activeTab !== 'chat' && (
        <AtlanticCommunity
          tab={activeTab}
          user={session.user}
          profile={myProfile}
          createRequest={communityCreateRequest}
          onProfileRefresh={loadMyProfile}
          onNotice={setNotice}
          onDialog={openAtlanticDialog}
        />
      )}

      <nav className="bottom-nav" aria-label="Navigasi utama">
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}><MessageCircle/><span>Chat</span></button>
        <button className={activeTab === 'updates' ? 'active' : ''} onClick={() => setActiveTab('updates')}><Clock3/><span>Pembaruan</span></button>
        <button className="nav-create" onClick={() => setCreateMenuOpen(true)} aria-label="Buat baru"><Plus/></button>
        <button className={activeTab === 'channels' ? 'active' : ''} onClick={() => setActiveTab('channels')}><Radio/><span>Saluran</span></button>
        <button className={activeTab === 'calls' ? 'active' : ''} onClick={() => setActiveTab('calls')}><Phone/><span>Panggilan</span></button>
      </nav>

      <AtlanticCallManager
        user={session.user}
        intent={callIntent}
        onIntentHandled={() => setCallIntent(null)}
      />

      {accountSettingsOpen && (
        <AtlanticAccountSettings
          user={session.user}
          onClose={() => setAccountSettingsOpen(false)}
          onSaved={profile => { setMyProfile(profile); loadMyProfile(); }}
        />
      )}
    </main>
  );
                                            }
          
