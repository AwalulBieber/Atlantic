import React, { useEffect, useRef, useState } from 'react';
import { ensureE2EEIdentity, ensureConversationE2EE, encryptE2EEBytes, decryptE2EEBytes, encryptE2EEMessage, decryptE2EEMessage, getCurrentConversationE2EEKeyId, getConversationE2EEKeyById, getE2EEFingerprint } from './e2ee';
import { supabase, configReady } from './supabase';
import AtlanticAccountSettings from './components/AtlanticAccountSettings';
import AtlanticCommunity from './components/AtlanticCommunity';
import AtlanticCallManager from './components/AtlanticCallManager';
import AtlanticAdminDashboard from './components/AtlanticAdminDashboard';
import AtlanticContacts from './components/AtlanticContacts';
import AtlanticGroupInfo from './components/AtlanticGroupInfo';
import AtlanticGroupInvitations from './components/AtlanticGroupInvitations';
import AtlanticPolls from './components/AtlanticPolls';
import {
  MessageCircle, Search, Plus, Send, LogOut, ArrowLeft, Waves, Archive, ArchiveRestore, Bookmark, BookmarkCheck, Users, Ban,
  Sparkles, MessageSquarePlus, Settings, UserRound, X, Check, ShieldCheck,
  Clock3, Radio, Phone, Video, NotebookPen, ImagePlus, BarChart3, BadgeCheck, Trash2, Reply, CheckCheck, Lock,
  Image as ImageIcon, FileText, MapPin, Crosshair, WandSparkles, EyeOff, CalendarClock, Forward, MoreHorizontal, Languages, Pin, Copy, Info, Pencil
} from 'lucide-react';

function initials(name = 'A') {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}

function time(value) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit'
  });
}

function chatDayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDay = new Date(date);
  messageDay.setHours(0, 0, 0, 0);
  if (messageDay.getTime() === today.getTime()) return 'Hari ini';
  if (messageDay.getTime() === yesterday.getTime()) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function relativeTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return 'Baru saja';
  if (elapsed < 3_600_000) return Math.floor(elapsed / 60_000) + ' menit lalu';
  if (elapsed < 86_400_000) return Math.floor(elapsed / 3_600_000) + ' jam lalu';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function inboxDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time(value);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
  const [e2eeStatus, setE2eeStatus] = useState({ state: 'loading', error: '' });
  const e2eeKeyRef = useRef(null);
  const e2eeKeyIdRef = useRef(null);
  const e2eeObjectUrlsRef = useRef(new Set());
  const [e2eeFingerprints, setE2eeFingerprints] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [showChatPolls, setShowChatPolls] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [attachmentAccept, setAttachmentAccept] = useState('image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf');
  const attachmentInputRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [forwardingMessageId, setForwardingMessageId] = useState(null);
  const [messageReactions, setMessageReactions] = useState([]);
  const [messageActionTarget, setMessageActionTarget] = useState(null);
  const [messageInfoTarget, setMessageInfoTarget] = useState(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [unread, setUnread] = useState({});
  const [inboxSummaries, setInboxSummaries] = useState([]);
  const [latestMessages, setLatestMessages] = useState({});
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
  const handledInviteToken = useRef('');
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
    let cancelled = false;
    // A restored browser session has no password in memory; keep its existing
    // local identity usable, and run automatic backup/restore on explicit login.
    if (!session?.user?.id || !password) return;
    ensureE2EEIdentity(supabase, session.user.id, password).catch(error => {
      if (!cancelled) {
        const message = error?.message || 'Terjadi kesalahan yang tidak diketahui.';
        console.warn('Atlantic automatic E2EE setup:', message);
        setNotice('Penyiapan/pemulihan keamanan otomatis gagal: ' + message);
      }
    });
    return () => { cancelled = true; };
  }, [session?.user?.id, password]);

  useEffect(() => {
    if (!session?.user?.id || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('atlanticInvite');
    if (!token || handledInviteToken.current === token) return;
    handledInviteToken.current = token;

    (async () => {
      const clearInviteFromUrl = () => {
        params.delete('atlanticInvite');
        const query = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      };
      const { data: previews, error: previewError } = await supabase.rpc('get_atlantic_invite_preview', { p_token: token });
      const invite = previews?.[0];
      if (previewError || !invite) {
        setNotice('Link undangan Atlantic tidak valid, sudah kedaluwarsa, atau telah dinonaktifkan.');
        clearInviteFromUrl();
        return;
      }
      const accepted = await openAtlanticDialog({
        title: invite.invite_type === 'group' ? 'Gabung grup Atlantic?' : 'Ikuti saluran Atlantic?',
        message: (invite.invite_type === 'group' ? 'Kamu diundang bergabung ke grup ' : 'Kamu diundang mengikuti saluran ') + invite.title + '. Lanjutkan?',
        confirmLabel: invite.invite_type === 'group' ? 'Gabung grup' : 'Ikuti saluran'
      });
      if (accepted) {
        const { data: joined, error: joinError } = await supabase.rpc('accept_atlantic_invite', { p_token: token });
        if (joinError) {
          setNotice('Undangan gagal digunakan: ' + joinError.message);
        } else {
          const result = joined?.[0];
          setNotice(invite.invite_type === 'group' ? 'Berhasil bergabung ke grup ' + (result?.title || invite.title) + '.' : 'Berhasil mengikuti saluran ' + (result?.title || invite.title) + '. Buka tab Saluran untuk melihat pembaruannya.');
          if (invite.invite_type === 'group') {
            const refreshed = await loadProfiles();
            const group = refreshed?.find(item => item.conversation_id === invite.resource_id);
            if (group) await openGroupChat(group);
          } else {
            setActiveTab('channels');
          }
        }
      }
      clearInviteFromUrl();
    })();
  }, [session?.user?.id]);

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
  setInboxSummaries([]);
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
    const [{ data, error }, { data: isAdmin, error: badgeError }, { data: moderationRows, error: moderationError }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,bio,is_verified,read_receipts_enabled,show_online_status').eq('id', session.user.id).maybeSingle(),
      supabase.rpc('is_atlantic_admin', { target_user: session.user.id }),
      supabase.rpc('get_my_profile_moderation_state')
    ]);
    if (!error && data) {
      const moderation = !moderationError ? moderationRows?.[0] : null;
      const isPrimaryAdmin = session.user.email?.toLowerCase() === 'awalulhakim94@gmail.com';
      setMyProfile({ ...data, is_blocked: moderation?.is_blocked === true, blocked_reason: moderation?.blocked_reason || null, is_admin: isAdmin === true || (!badgeError && isAdmin === true) || isPrimaryAdmin });
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
  const { error: savedConversationError } = await supabase.rpc('get_or_create_saved_messages_conversation');
  if (savedConversationError) setNotice('Pesan Tersimpan gagal disiapkan: ' + savedConversationError.message);
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
      .select('id,title,is_group,is_saved_chat,created_by,description,avatar_url,is_verified,pinned_message_id,message_policy,add_member_policy')
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
  void supabase.rpc('record_atlantic_message_receipts', {
    p_conversation_ids: ids,
    p_message_ids: null,
    p_mark_read: false
  });

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
    if (conversation.is_saved_chat) {
      const savedPerson = { id: session.user.id, display_name: 'Pesan Tersimpan', username: 'Cloud Pribadi', is_saved_chat: true };
      return { conversation_id: conversation.id, person: savedPerson, is_group: false, is_saved_chat: true, title: 'Pesan Tersimpan' };
    }
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
  void refreshInboxSummaries();
  void loadLatestMessages(ids);
  return validChatRows;
  }

  async function refreshInboxSummaries() {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.rpc('get_atlantic_unread_summaries');
    if (error) {
      console.warn('Atlantic inbox summary:', error.message);
      return;
    }
    const summaries = data || [];
    setInboxSummaries(summaries);
    setUnread(Object.fromEntries(summaries.map(item => [item.conversation_id, Number(item.unread_count) || 0])));
  }

  async function loadLatestMessages(conversationIds) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    if (!ids.length) return;
    const { data, error } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,body,created_at,media_url,media_type')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) {
      console.warn('Atlantic latest messages:', error.message);
      return;
    }
    const latest = {};
    for (const message of data || []) {
      if (!latest[message.conversation_id]) latest[message.conversation_id] = message;
    }
    setLatestMessages(current => ({ ...current, ...latest }));
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
    await loadProfiles();
    setGroupBusy(false);
  }

  async function openSavedChat(chat) {
    setNotice('');
    setUnread(old => { const next = { ...old }; delete next[chat.conversation_id]; return next; });
    setIncomingNotice(null);
    setActive({ conversation_id: chat.conversation_id, person: chat.person, is_group: false, is_saved_chat: true, title: 'Pesan Tersimpan', members: [{ id: session.user.id }] });
    setShowSaved(false);
    setShowArchived(false);
    setReplyTarget(null);
    setDraft('');
    setAttachmentFile(null);
    setAttachmentPreview('');
    setMobileChat(true);
    // The active-chat effect loads messages after this conversation's E2EE key is ready.
  }

  async function openGroupChat(group) {
    setNotice('');
    setUnread(old => { const next = { ...old }; delete next[group.conversation_id]; return next; });
    setIncomingNotice(null);
    setActive({ conversation_id: group.conversation_id, person: group.person, is_group: true, title: group.title, pinned_message_id:group.pinned_message_id, members: group.members || [] });
    setReplyTarget(null);
    setMobileChat(true);
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


  async function toggleMessageReaction(message, emoji) {
    if (!message?.id || !session?.user?.id) return;
    const existing = messageReactions.find(row => row.message_id === message.id && row.user_id === session.user.id);
    if (existing?.emoji === emoji) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id).eq('user_id', session.user.id);
      if (error) { setNotice('Reaksi gagal dihapus: ' + error.message); return; }
      setMessageReactions(rows => rows.filter(row => row.id !== existing.id));
    } else {
      const { data, error } = await supabase.from('message_reactions').upsert({ message_id: message.id, user_id: session.user.id, emoji }, { onConflict: 'message_id,user_id' }).select('id,message_id,user_id,emoji,created_at').single();
      if (error) { setNotice('Reaksi gagal dikirim: ' + error.message); return; }
      setMessageReactions(rows => [...rows.filter(row => !(row.message_id === message.id && row.user_id === session.user.id)), data]);
    }
    setMessageActionTarget(null);
  }

  async function copyMessage(message) {
    try { await navigator.clipboard.writeText(message.body || ''); setNotice('Pesan berhasil disalin.'); }
    catch { setNotice('Clipboard tidak tersedia di browser ini.'); }
    setMessageActionTarget(null);
  }

  function translateMessage(message) {
    if (!message?.body) { setNotice('Tidak ada teks untuk diterjemahkan.'); return; }
    window.open('https://translate.google.com/?sl=auto&tl=id&text=' + encodeURIComponent(message.body) + '&op=translate', '_blank', 'noopener,noreferrer');
    setMessageActionTarget(null);
  }

  async function pinMessage(message) {
    if (!active?.is_group) { setNotice('Penyematan pesan saat ini tersedia untuk grup.'); return; }
    const nextId = active.pinned_message_id === message.id ? null : message.id;
    const { error } = await supabase.from('conversations').update({ pinned_message_id: nextId }).eq('id', active.conversation_id);
    if (error) { setNotice('Pesan gagal disematkan. Pastikan kamu admin grup. ' + error.message); return; }
    setActive(current => current ? { ...current, pinned_message_id: nextId } : current);
    setChats(rows => rows.map(chat => chat.conversation_id === active.conversation_id ? { ...chat, pinned_message_id: nextId } : chat));
    setNotice(nextId ? 'Pesan berhasil disematkan.' : 'Sematan pesan dilepas.');
    setMessageActionTarget(null);
  }

  function editMessage(message) {
    setMessageActionTarget(null);
    setNotice(message.sender_id === session.user.id
      ? 'Edit belum tersedia karena pesan Atlantic dibuat immutable untuk menjaga integritas E2EE. Kirim pesan koreksi baru ya.'
      : 'Kamu hanya bisa mengedit pesan milik sendiri.');
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
        delete next[conversationId];
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
    setShowAttachmentMenu(false);
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (!allowed.includes(file.type)) { setNotice('Format file tidak didukung.'); return; }
    if (file.size > 50 * 1024 * 1024) { setNotice('Ukuran lampiran maksimal 50 MB.'); return; }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachmentFile(file); setAttachmentPreview(URL.createObjectURL(file));
  }
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); }, [attachmentPreview]);

  useEffect(() => {
    let cancelled = false;
    e2eeKeyRef.current = null;
    e2eeKeyIdRef.current = null;
    if (!active || !session?.user?.id) { setE2eeStatus({ state: 'loading', error: '' }); return; }
    setE2eeStatus({ state: 'loading', error: '' });
    const memberIds = active.is_group ? (active.members || []).map(member => member.id).filter(Boolean) : [active.person?.id].filter(Boolean);
    ensureConversationE2EE(supabase, active.conversation_id, memberIds, session.user.id)
      .then(async key => {
        const keyId = await getCurrentConversationE2EEKeyId(supabase, active.conversation_id);
        if (!cancelled) { e2eeKeyRef.current = key; e2eeKeyIdRef.current = keyId; setE2eeStatus({ state: 'active', error: '' }); }
      })
      .catch(error => { if (!cancelled) { e2eeKeyRef.current = null; setE2eeStatus({ state: 'unavailable', error: error.message || 'Kunci E2EE belum siap.' }); } });
    return () => { cancelled = true; e2eeKeyRef.current = null; };
  }, [active?.conversation_id, session?.user?.id]);

  useEffect(() => () => {
    for (const url of e2eeObjectUrlsRef.current) URL.revokeObjectURL(url);
    e2eeObjectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadFingerprints() {
      if (!active || e2eeStatus.state !== 'active' || !session?.user?.id) { setE2eeFingerprints([]); return; }
      const { data: liveMembers } = await supabase.from('conversation_members')
        .select('user_id').eq('conversation_id', active.conversation_id);
      const memberIds = (liveMembers || []).map(member => member.user_id);
      const ids = [...new Set([session.user.id, ...memberIds, ...(active.is_group ? (active.members || []).map(member => member.id) : [active.person?.id])].filter(Boolean))];
      const { data, error } = await supabase.from('profiles')
        .select('id,username,display_name,e2ee_public_key').in('id', ids);
      if (error || cancelled) return;
      const results = await Promise.all((data || []).map(async profile => {
        try { return { id: profile.id, name: profile.id === session.user.id ? 'Perangkat kamu' : (profile.display_name || profile.username || 'Anggota'), fingerprint: await getE2EEFingerprint(profile.e2ee_public_key) }; }
        catch { return null; }
      }));
      if (!cancelled) setE2eeFingerprints(results.filter(Boolean));
    }
    loadFingerprints();
    return () => { cancelled = true; };
  }, [active?.conversation_id, e2eeStatus.state, session?.user?.id]);

  async function loadMessages(id) {
    // Persist read state per user, including when read receipts are disabled.
    const { error: markReadError } = await supabase.rpc('mark_atlantic_conversation_read', { p_conversation_id: id });
    if (markReadError) console.warn('Atlantic mark read:', markReadError.message);
    const { data, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,body,created_at,reply_to,delivered_at,read_at,media_url,media_type,media_name,e2ee_key_id')
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
      let next = message;
      let messageKey = e2eeKeyRef.current;
      if (e2eeKeyRef.current && typeof message.body === 'string' && message.body.startsWith('ATL-E2EE1:')) {
        try {
          messageKey = message.e2ee_key_id && message.e2ee_key_id !== e2eeKeyIdRef.current
            ? await getConversationE2EEKeyById(supabase, id, message.e2ee_key_id, session.user.id)
            : e2eeKeyRef.current;
          const payload = await decryptE2EEMessage(messageKey, message.body);
          next = { ...next, body: payload.text || '', e2eeAttachment: payload.attachment || null, is_e2ee: true };
        } catch { next = { ...next, body: '🔒 Tidak dapat membuka pesan ini di perangkat ini.', is_e2ee: true, decrypt_error: true }; }
      }
      if (!next.media_url) return next;
      const { data: signed } = await supabase.storage.from('atlantic-chat-media').createSignedUrl(next.media_url, 3600);
      if (!signed?.signedUrl) return { ...next, media_url: null };
      if (next.is_e2ee && next.e2eeAttachment?.iv) {
        try {
          const response = await fetch(signed.signedUrl);
          if (!response.ok) throw new Error('Lampiran terenkripsi gagal diunduh.');
          const encryptedBytes = new Uint8Array(await response.arrayBuffer());
          const plainBytes = await decryptE2EEBytes(messageKey, { iv: next.e2eeAttachment.iv, ciphertext: encryptedBytes });
          const blobUrl = URL.createObjectURL(new Blob([plainBytes], { type: next.e2eeAttachment.type || 'application/octet-stream' }));
          e2eeObjectUrlsRef.current.add(blobUrl);
          return { ...next, media_url: blobUrl, media_type: next.e2eeAttachment.type, media_name: next.e2eeAttachment.name };
        } catch { return { ...next, media_url: null, body: (next.body ? next.body + '\\n' : '') + '🔒 Lampiran tidak dapat dibuka.', decrypt_error: true }; }
      }
      return { ...next, media_url: signed.signedUrl };
    }));
    const senderIds = [...new Set((data || []).map(message => message.sender_id).filter(Boolean))];
    const { data: senderProfiles } = senderIds.length ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', senderIds) : { data: [] };
    const senderMap = Object.fromEntries((senderProfiles || []).map(profile => [profile.id, profile]));
    const replyIds = [...new Set(visibleMessages.map(m => m.reply_to).filter(Boolean))];
    let replyMap = {};
    if (replyIds.length) {
      const { data: originals } = await supabase.from('messages').select('id,body,sender_id,e2ee_key_id').in('id', replyIds);
      const decodedOriginals = await Promise.all((originals || []).map(async item => {
        if (e2eeKeyRef.current && typeof item.body === 'string' && item.body.startsWith('ATL-E2EE1:')) {
          try {
            const replyKey = item.e2ee_key_id && item.e2ee_key_id !== e2eeKeyIdRef.current
              ? await getConversationE2EEKeyById(supabase, active.conversation_id, item.e2ee_key_id, session.user.id)
              : e2eeKeyRef.current;
            const payload = await decryptE2EEMessage(replyKey, item.body);
            return { ...item, body: payload.text || '', is_e2ee: true };
          } catch { return { ...item, body: '🔒 Pesan terenkripsi tidak dapat dibuka.', is_e2ee: true, decrypt_error: true }; }
        }
        return item;
      }));
      replyMap = Object.fromEntries(decodedOriginals.map(item => [item.id, item]));
    }
    const incomingIds = visibleMessages.filter(m => m.sender_id !== session.user.id).map(m => m.id);
    if (incomingIds.length) {
      await supabase.rpc('record_atlantic_message_receipts', {
        p_conversation_ids: null,
        p_message_ids: incomingIds,
        p_mark_read: myProfile?.read_receipts_enabled !== false
      });
    }
    const { data: reactionRows, error: reactionError } = messageIds.length ? await supabase.from('message_reactions').select('id,message_id,user_id,emoji,created_at').in('message_id', messageIds) : { data: [], error: null };
    if (reactionError) console.warn('Atlantic message reactions:', reactionError.message);
    setMessageReactions(reactionRows || []);
    setMessages(messagesWithMedia.map(m => ({ ...m, senderProfile: senderMap[m.sender_id] || null, replyPreview: replyMap[m.reply_to] ? { ...replyMap[m.reply_to], body: hiddenIds.has(m.reply_to) ? 'Pesan dihapus untuk kamu' : replyMap[m.reply_to].body, senderProfile: senderMap[replyMap[m.reply_to].sender_id] || null } : null })));
    void refreshInboxSummaries();
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  useEffect(() => {
    if (active && e2eeStatus.state === 'active') loadMessages(active.conversation_id);
  }, [active?.conversation_id, e2eeStatus.state]);

  useEffect(() => {
    if (!active || !session) return;
    const channel = supabase
      .channel('chat-' + active.conversation_id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${active.conversation_id}`
      }, async payload => {
        const incoming = payload.new;
        let incomingMessageKey = e2eeKeyRef.current;
        if (e2eeKeyRef.current && typeof incoming.body === 'string' && incoming.body.startsWith('ATL-E2EE1:')) {
          try {
            incomingMessageKey = incoming.e2ee_key_id && incoming.e2ee_key_id !== e2eeKeyIdRef.current
              ? await getConversationE2EEKeyById(supabase, active.conversation_id, incoming.e2ee_key_id, session.user.id)
              : e2eeKeyRef.current;
            const payload = await decryptE2EEMessage(incomingMessageKey, incoming.body);
            incoming.body = payload.text || '';
            incoming.e2eeAttachment = payload.attachment || null;
            incoming.is_e2ee = true;
          } catch { incoming.body = '🔒 Tidak dapat membuka pesan ini di perangkat ini.'; incoming.decrypt_error = true; }
        }
        if (incoming.media_url && incoming.is_e2ee && incoming.e2eeAttachment?.iv) {
          try {
            const { data: signed } = await supabase.storage.from('atlantic-chat-media').createSignedUrl(incoming.media_url, 3600);
            const response = await fetch(signed.signedUrl);
            const encryptedBytes = new Uint8Array(await response.arrayBuffer());
            const plainBytes = await decryptE2EEBytes(incomingMessageKey, { iv: incoming.e2eeAttachment.iv, ciphertext: encryptedBytes });
            incoming.media_url = URL.createObjectURL(new Blob([plainBytes], { type: incoming.e2eeAttachment.type || 'application/octet-stream' }));
            e2eeObjectUrlsRef.current.add(incoming.media_url);
            incoming.media_type = incoming.e2eeAttachment.type;
            incoming.media_name = incoming.e2eeAttachment.name;
          } catch { incoming.media_url = null; incoming.body = (incoming.body ? incoming.body + '\\n' : '') + '🔒 Lampiran tidak dapat dibuka.'; }
        } else if (incoming.media_url) {
          const { data: signed } = await supabase.storage.from('atlantic-chat-media').createSignedUrl(incoming.media_url, 3600);
          incoming.media_url = signed?.signedUrl || null;
        }
        if (incoming.reply_to) {
          const { data: original } = await supabase.from('messages').select('id,body,sender_id,e2ee_key_id').eq('id', incoming.reply_to).maybeSingle();
          if (original?.body && e2eeKeyRef.current && original.body.startsWith('ATL-E2EE1:')) {
            try {
              const replyKey = original.e2ee_key_id && original.e2ee_key_id !== e2eeKeyIdRef.current
                ? await getConversationE2EEKeyById(supabase, active.conversation_id, original.e2ee_key_id, session.user.id)
                : e2eeKeyRef.current;
              const payload = await decryptE2EEMessage(replyKey, original.body);
              original.body = payload.text || ''; original.is_e2ee = true;
            }
            catch { original.body = '🔒 Pesan terenkripsi tidak dapat dibuka.'; original.decrypt_error = true; }
          }
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
          const { error: receiptError } = await supabase.rpc('record_atlantic_message_receipts', {
            p_conversation_ids: null,
            p_message_ids: [incoming.id],
            p_mark_read: myProfile?.read_receipts_enabled !== false
          });
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
        event: '*', schema: 'public', table: 'message_reactions'
      }, payload => {
        const row = payload.new?.id ? payload.new : payload.old;
        if (!row?.message_id) return;
        if (payload.eventType === 'DELETE') setMessageReactions(rows => rows.filter(item => item.id !== row.id));
        else setMessageReactions(rows => [...rows.filter(item => item.id !== row.id && !(item.message_id === row.message_id && item.user_id === row.user_id)), payload.new]);
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
        if (!message) return;
        void loadLatestMessages([message.conversation_id]);
        if (message.sender_id === session.user.id || seenMessages.current.has(message.id)) return;
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
        await supabase.rpc('record_atlantic_message_receipts', {
          p_conversation_ids: null,
          p_message_ids: [message.id],
          p_mark_read: false
        });
        void refreshInboxSummaries();
        const notificationBody = typeof message.body === 'string' && message.body.startsWith('ATL-E2EE1:')
          ? '🔒 Pesan terenkripsi baru'
          : (message.media_url ? 'Mengirim lampiran' : 'Mengirim pesan');
        setIncomingNotice({ person, body: notificationBody, conversationId: message.conversation_id, isGroup: Boolean(targetChat?.is_group), groupTitle: targetChat?.title });
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

  function pickChatAttachment(accept) {
    setAttachmentAccept(accept);
    setShowAttachmentMenu(false);
    window.setTimeout(() => attachmentInputRef.current?.click(), 0);
  }

  async function shareCurrentLocation(label = 'Lokasi') {
    if (!navigator.geolocation) { setNotice('Perangkat ini tidak mendukung berbagi lokasi.'); return; }
    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude } = position.coords;
      const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      let encryptedLocation;
      try {
        const freshKey = await ensureConversationE2EE(supabase, active.conversation_id, active.members?.map(member => member.id) || [active.person?.id], session.user.id);
        e2eeKeyRef.current = freshKey;
        e2eeKeyIdRef.current = await getCurrentConversationE2EEKeyId(supabase, active.conversation_id);
        encryptedLocation = await encryptE2EEMessage(freshKey, { text: `${label}: ${mapUrl}` });
      } catch (encryptionError) { setNotice(encryptionError.message); return; }
      const { error } = await supabase.from('messages').insert({ conversation_id:active.conversation_id, sender_id:session.user.id, body:encryptedLocation, e2ee_key_id:e2eeKeyIdRef.current });
      if (error) setNotice('Lokasi gagal dikirim: ' + error.message);
      else setShowAttachmentMenu(false);
    }, error => setNotice(error.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk Atlantic.' : 'Lokasi gagal didapatkan.'), { enableHighAccuracy:true, timeout:12000, maximumAge:10000 });
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && !attachmentFile) || !active || sending) return;
    if (e2eeStatus.state !== 'active' || !e2eeKeyRef.current) { setNotice(e2eeStatus.error || 'Menyiapkan kunci enkripsi. Coba lagi sebentar.'); return; }
    setSending(true); setDraft('');
    try {
      e2eeKeyRef.current = await ensureConversationE2EE(supabase, active.conversation_id, active.members?.map(member => member.id) || [active.person?.id], session.user.id);
      e2eeKeyIdRef.current = await getCurrentConversationE2EEKeyId(supabase, active.conversation_id);
    } catch (keyError) {
      setDraft(body); setNotice(keyError.message || 'Rotasi kunci E2EE belum selesai.'); setSending(false); return;
    }
    let mediaPath = null;
    let attachmentEnvelope = null;
    try {
      if (attachmentFile) {
        const encryptedFile = await encryptE2EEBytes(e2eeKeyRef.current, attachmentFile);
        attachmentEnvelope = { iv: encryptedFile.iv, name: attachmentFile.name, type: attachmentFile.type || 'application/octet-stream', size: attachmentFile.size };
        mediaPath = active.conversation_id + '/' + session.user.id + '/' + crypto.randomUUID() + '.atlenc';
        const encryptedBlob = new Blob([encryptedFile.ciphertext], { type: 'application/octet-stream' });
        const { error: uploadError } = await supabase.storage.from('atlantic-chat-media').upload(mediaPath, encryptedBlob, { upsert:false, contentType:'application/octet-stream' });
        if (uploadError) throw new Error('Lampiran gagal diunggah: ' + uploadError.message);
      }
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: false } });
      const encryptedBody = await encryptE2EEMessage(e2eeKeyRef.current, { text: body, attachment: attachmentEnvelope });
      const { error } = await supabase.from('messages').insert({ conversation_id:active.conversation_id, sender_id:session.user.id, body:encryptedBody, e2ee_key_id:e2eeKeyIdRef.current, media_url:mediaPath, media_type:mediaPath ? 'application/octet-stream' : null, media_name:null, reply_to:replyTarget?.id || null });
      if (error) throw new Error('Pesan gagal dikirim: ' + error.message);
      setReplyTarget(null); setAttachmentFile(null); setAttachmentPreview('');
    } catch (sendError) {
      if (mediaPath) await supabase.storage.from('atlantic-chat-media').remove([mediaPath]);
      setDraft(body);
      setNotice(sendError.message || 'Pesan gagal dienkripsi atau dikirim.');
    }
    setSending(false);
  }


  async function forwardToSavedMessages(message) {
    if (!message?.id || !active || active.is_saved_chat || forwardingMessageId) return;
    const savedChat = chats.find(chat => chat.is_saved_chat);
    if (!savedChat?.conversation_id) {
      setNotice('Ruang Pesan Tersimpan belum tersedia. Muat ulang daftar chat lalu coba lagi.');
      return;
    }
    if (message.decrypt_error) {
      setNotice('Pesan ini belum bisa dibuka di perangkat ini, jadi tidak dapat diteruskan.');
      return;
    }
    if (message.body?.startsWith('[[ATLANTIC_POLL:')) {
      setNotice('Polling belum bisa diteruskan sebagai polling aktif. Kamu bisa membagikan pertanyaannya sebagai teks.');
      return;
    }
    if (message.media_url && !message.media_type) {
      setNotice('Jenis lampiran tidak diketahui, jadi pesan ini belum bisa diteruskan.');
      return;
    }
    if (message.media_type && !message.media_url) {
      setNotice('Lampiran belum berhasil dibuka di perangkat ini. Coba lagi setelah lampiran tampil.');
      return;
    }

    setForwardingMessageId(message.id);
    let uploadedPath = null;
    try {
      const targetConversationId = savedChat.conversation_id;
      const targetKey = await ensureConversationE2EE(supabase, targetConversationId, [session.user.id], session.user.id);
      const targetKeyId = await getCurrentConversationE2EEKeyId(supabase, targetConversationId);
      let attachmentEnvelope = null;

      if (message.media_url) {
        const response = await fetch(message.media_url);
        if (!response.ok) throw new Error('Lampiran sumber gagal dibaca.');
        const sourceBlob = await response.blob();
        const sourceFile = new File(
          [sourceBlob],
          message.media_name || 'Lampiran',
          { type: message.media_type || sourceBlob.type || 'application/octet-stream' }
        );
        const encryptedFile = await encryptE2EEBytes(targetKey, sourceFile);
        attachmentEnvelope = {
          iv: encryptedFile.iv,
          name: sourceFile.name,
          type: sourceFile.type || 'application/octet-stream',
          size: sourceFile.size
        };
        uploadedPath = targetConversationId + '/' + session.user.id + '/' + crypto.randomUUID() + '.atlenc';
        const { error: uploadError } = await supabase.storage.from('atlantic-chat-media').upload(
          uploadedPath,
          new Blob([encryptedFile.ciphertext], { type: 'application/octet-stream' }),
          { upsert: false, contentType: 'application/octet-stream' }
        );
        if (uploadError) throw new Error('Lampiran gagal disimpan: ' + uploadError.message);
      }

      const sourceName = active.is_group
        ? (active.title || 'Grup Atlantic')
        : (active.person?.display_name || active.person?.username || 'Chat Atlantic');
      const forwardedText = '↪ Diteruskan dari ' + sourceName + (message.body ? '\n\n' + message.body : '');
      const encryptedBody = await encryptE2EEMessage(targetKey, {
        text: forwardedText,
        attachment: attachmentEnvelope
      });
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: targetConversationId,
        sender_id: session.user.id,
        body: encryptedBody,
        e2ee_key_id: targetKeyId,
        media_url: uploadedPath,
        media_type: uploadedPath ? 'application/octet-stream' : null,
        media_name: null
      });
      if (insertError) throw new Error('Pesan gagal diteruskan: ' + insertError.message);
      setNotice('Pesan berhasil diteruskan ke Pesan Tersimpan.');
      void loadLatestMessages([targetConversationId]);
    } catch (forwardError) {
      if (uploadedPath) await supabase.storage.from('atlantic-chat-media').remove([uploadedPath]);
      setNotice(forwardError.message || 'Pesan gagal diteruskan.');
    } finally {
      setForwardingMessageId(null);
    }
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
  const visibleInboxSummaries = inboxSummaries.filter(item => !archivedIds.includes(item.conversation_id));
  const filtered = visibleChats.filter(c =>
    (c.person.display_name || c.person.username || '')
      .toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    if (a.is_saved_chat) return -1;
    if (b.is_saved_chat) return 1;
    return new Date(latestMessages[b.conversation_id]?.created_at || 0).getTime() -
      new Date(latestMessages[a.conversation_id]?.created_at || 0).getTime();
  });

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

        <div className="chat-list-tabs"><button className={!showArchived && !showSaved ? 'active' : ''} onClick={() => { setShowArchived(false); setShowSaved(false); }}>Semua chat</button><button className={showArchived && !showSaved ? 'active' : ''} onClick={() => { setShowArchived(true); setShowSaved(false); }}><Archive size={14}/> Arsip {archivedIds.length ? `(${archivedIds.length})` : ''}</button><button className={showSaved ? 'active' : ''} onClick={() => { setShowSaved(true); loadSavedMessages(); }}><Bookmark size={14}/> Bookmark</button></div>
        <AtlanticGroupInvitations user={session.user} onNotice={setNotice} onAccepted={async conversationId=>{const updated=await loadProfiles();const joined=updated?.find(item=>item.conversation_id===conversationId);if(joined)openGroupChat(joined);}} />
        <div className="section-title"><span>{showSaved ? 'Pesan Ditandai' : showArchived ? 'Arsip Chat' : 'Chat'}</span><span className="count-tag">{showSaved ? savedMessages.length : filtered.length}</span></div>
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
        onClick={() => c.is_saved_chat ? openSavedChat(c) : c.is_group ? openGroupChat(c) : openChat(c.person)}
      >
        <div className={`avatar ${c.is_saved_chat ? 'saved-chat-avatar' : ''}`}>
          {c.is_saved_chat ? <Bookmark size={19}/> : c.person.avatar_url ? <img src={c.person.avatar_url} alt="" /> : c.is_group ? <Users size={19}/> : initials(c.person.display_name || c.person.username)}
        </div>
        <div className="person-info">
          <b>{c.is_saved_chat ? 'Pesan Tersimpan' : c.person.display_name || c.person.username}{c.is_group && c.is_verified ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={14}/></span> : c.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={14}/></span> : c.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={14}/></span>}</b>
          <small className="person-preview">{(() => {
            const latest = latestMessages[c.conversation_id];
            if (!latest) return 'Belum ada pesan';
            let preview = typeof latest.body === 'string' && latest.body.startsWith('ATL-E2EE1:') ? '🔒 Pesan terenkripsi' : latest.body;
            if (typeof preview === 'string' && preview.startsWith('[[ATLANTIC_POLL:')) preview = '📊 Polling';
            if (!preview) preview = latest.media_type?.startsWith('image/') ? '📷 Foto' : latest.media_type?.startsWith('video/') ? '🎥 Video' : latest.media_url ? '📎 Lampiran' : 'Pesan';
            const sender = c.is_group && latest.sender_id !== session.user.id ? c.members?.find(member => member.id === latest.sender_id) : null;
            return <>{latest.sender_id === session.user.id ? 'Kamu: ' : sender ? (sender.display_name || sender.username) + ': ' : ''}{preview}</>;
          })()}</small>
        </div>
        <div className="person-meta">
          <small>{inboxDate(latestMessages[c.conversation_id]?.created_at)}</small>
          {(unread[c.conversation_id] || 0) > 0 && <span className="atl-unread-badge" aria-label={(unread[c.conversation_id] || 0) + ' pesan belum dibaca'}>{(unread[c.conversation_id] || 0) > 99 ? '99+' : unread[c.conversation_id]}</span>}
        </div>
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
              <div className={`avatar ${active.is_saved_chat ? 'saved-chat-avatar' : ''}`}>{active.is_saved_chat ? <Bookmark size={21}/> : active.person.avatar_url ? <img src={active.person.avatar_url} alt="" /> : active.is_group ? <Users size={20}/> : initials(active.person.display_name || active.person.username)}</div>
              <div className="chat-person" onClick={() => active.is_group && setGroupInfoOpen(true)} role={active.is_group ? "button" : undefined} tabIndex={active.is_group ? 0 : undefined}>
                <b>{active.person.display_name || active.person.username}{active.is_group && active.is_verified ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={15}/></span> : active.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={15}/></span> : active.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={15}/></span>}</b>
                <small>{active.is_saved_chat ? 'Cloud Pribadi · Terenkripsi E2E' : otherTyping ? <span className="typing-indicator"><i/><i/><i/> sedang mengetik</span> : active.is_group ? `${active.members?.length || 0} anggota` : <>{onlineUsers.includes(active.person.id) && <span className="atl-online-dot" aria-label="Online"/>}{onlineUsers.includes(active.person.id) ? 'Online · ' : ''}@{active.person.username}</>}</small>
              </div>
              {!active.is_group && !active.is_saved_chat && <div className="chat-head-actions">
                <button type="button" className="icon-btn" onClick={() => requestCall('audio')} title="Undang panggilan suara" aria-label="Undang panggilan suara"><Phone size={18}/></button>
                <button type="button" className="icon-btn" onClick={() => requestCall('video')} title="Undang panggilan video" aria-label="Undang panggilan video"><Video size={18}/></button>
              </div>}
            </header>
            {active.is_group&&active.pinned_message_id&&messages.find(message=>message.id===active.pinned_message_id)&&<button type="button" className="atl-pinned-message" onClick={()=>document.getElementById('message-'+active.pinned_message_id)?.scrollIntoView({behavior:'smooth',block:'center'})}><span>📌 Pesan disematkan</span><b>{(messages.find(message=>message.id===active.pinned_message_id)?.body||'Lampiran').slice(0,110)}</b></button>}
            <div className={`atl-e2ee-banner ${e2eeStatus.state === 'active' ? 'is-secure' : 'is-pending'}`} role="status">
              <Lock size={15}/><span>{e2eeStatus.state === 'active' ? <><b>Pesan Anda Dilindungi Enkripsi Secara Privat</b><small className="atl-e2ee-scope">Perlindungan ini berlaku untuk pesan, lampiran, dan polling grup baru setelah status E2EE aktif. Pesan lama yang dikirim sebelum enkripsi aktif mungkin belum terenkripsi. Server masih dapat melihat metadata seperti anggota, waktu, dan aktivitas pesan.</small><small className="atl-e2ee-scope">Kunci privat hanya tersimpan di perangkat ini. Jangan hapus data browser atau pindah perangkat sebelum kunci dipulihkan.</small>{e2eeFingerprints.length > 0 && <small className="atl-e2ee-fingerprints">Kode verifikasi kunci (cocokkan langsung dengan anggota): {e2eeFingerprints.map(item => item.name + ' — ' + item.fingerprint).join(' · ')}</small>}</> : e2eeStatus.state === 'loading' ? 'Menyiapkan enkripsi end-to-end…' : 'Enkripsi end-to-end belum aktif: ' + e2eeStatus.error}</span>
            </div>
            <div className="messages">
              {messages.map((m, messageIndex) => (
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
                  {(messageIndex === 0 || new Date(m.created_at).toDateString() !== new Date(messages[messageIndex - 1].created_at).toDateString()) && <div className="atl-chat-day-separator">{chatDayLabel(m.created_at)}</div>}
                  <div className={`swipe-reply-indicator ${swipeState.id === m.id && swipeState.offset > 12 ? 'visible' : ''}`} style={swipeState.id === m.id ? { opacity: Math.min(swipeState.offset / 65, 1) } : undefined}><Reply size={15}/></div>
                  <div className="bubble">
                    {m.replyPreview && <button type="button" className="reply-quote" onClick={() => document.getElementById(`message-${m.reply_to}`)?.scrollIntoView({behavior:'smooth',block:'center'})}><b>{m.replyPreview.sender_id === session.user.id ? 'Kamu' : (active.is_group ? (m.replyPreview.senderProfile?.display_name || m.replyPreview.senderProfile?.username || 'Anggota grup') : (active.person.display_name || active.person.username))}</b><span>{m.replyPreview.body || 'Pesan'}</span></button>}
                    {active.is_group && <b className="group-sender-name">{m.senderProfile?.display_name || m.senderProfile?.username || (m.sender_id === session.user.id ? 'Kamu' : 'Anggota grup')}</b>}
                    {m.media_url && (m.media_type?.startsWith('image/') ? <img className="atl-message-media" src={m.media_url} alt={m.media_name || 'Foto'} loading="lazy"/> : m.media_type?.startsWith('video/') ? <video className="atl-message-media" src={m.media_url} controls playsInline preload="metadata"/> : <a className="atl-message-file" href={m.media_url} target="_blank" rel="noreferrer">📎 {m.media_name || 'Buka lampiran'}</a>)}
                    {m.body?.startsWith('[[ATLANTIC_POLL:') && active.is_group ? <AtlanticPolls targetType="group" targetId={active.conversation_id} pollId={m.body.match(/^\[\[ATLANTIC_POLL:([0-9a-f-]+)\]\]$/i)?.[1]} user={session.user} canCreate={false} inline e2eeKey={e2eeKeyRef.current} e2eeKeyId={e2eeKeyIdRef.current} onKeyReady={(key, keyId) => { e2eeKeyRef.current = key; e2eeKeyIdRef.current = keyId; }}/> : m.body && <div>{m.body}</div>}
                    {(() => {
                      const reactions = messageReactions.filter(row => row.message_id === m.id);
                      const grouped = Object.values(reactions.reduce((acc, row) => {
                        acc[row.emoji] = acc[row.emoji] || { emoji: row.emoji, count: 0, mine: false };
                        acc[row.emoji].count += 1;
                        if (row.user_id === session.user.id) acc[row.emoji].mine = true;
                        return acc;
                      }, {}));
                      return grouped.length ? <div className="atl-message-reactions">{grouped.map(item => <button type="button" key={item.emoji} className={item.mine ? 'is-mine' : ''} onClick={() => toggleMessageReaction(m, item.emoji)} title={item.count + ' reaksi'}><span>{item.emoji}</span><b>{item.count}</b></button>)}</div> : null;
                    })()}
                    {messageActionTarget === m.id && <div className="atl-message-action-menu" role="menu" aria-label="Aksi pesan">
                      <div className="atl-reaction-picker" aria-label="Pilih reaksi">{['👍','❤️','😂','😮','😢','🙏','🔥','👏'].map(emoji => <button type="button" key={emoji} onClick={() => toggleMessageReaction(m, emoji)} aria-label={'Reaksi ' + emoji}>{emoji}</button>)}</div>
                      <button type="button" role="menuitem" onClick={() => { setReplyTarget(m); setMessageActionTarget(null); }}><Reply/>Balas</button>
                      <button type="button" role="menuitem" onClick={() => pinMessage(m)}><Pin/>{active.pinned_message_id === m.id ? 'Lepas sematan' : 'Sematkan'}</button>
                      <button type="button" role="menuitem" onClick={() => { toggleSavedMessage(m); setMessageActionTarget(null); }}><Bookmark/>Beri bintang</button>
                      <button type="button" role="menuitem" onClick={() => { forwardToSavedMessages(m); setMessageActionTarget(null); }}><Forward/>Teruskan</button>
                      <button type="button" role="menuitem" onClick={() => copyMessage(m)}><Copy/>Salin</button>
                      <button type="button" role="menuitem" onClick={() => translateMessage(m)}><Languages/>Terjemahkan</button>
                      <button type="button" role="menuitem" onClick={() => editMessage(m)} disabled={m.sender_id !== session.user.id || Boolean(m.media_url)}><Pencil/>Edit</button>
                      <button type="button" role="menuitem" onClick={() => { setMessageInfoTarget(m); setMessageActionTarget(null); }}><Info/>Info</button>
                      <button type="button" role="menuitem" onClick={() => { setDeleteTarget(m); setMessageActionTarget(null); }}><Trash2/>Hapus</button>
                      <button type="button" role="menuitem" onClick={() => { forwardToSavedMessages(m); setMessageActionTarget(null); }}><BookmarkCheck/>Simpan ke Cloud</button>
                    </div>}
                    <div className="bubble-meta"><time>{time(m.created_at)}</time><button type="button" className={savedMessages.some(item => item.message_id === m.id) ? 'message-save-btn is-saved' : 'message-save-btn'} onClick={() => toggleSavedMessage(m)} aria-label={savedMessages.some(item => item.message_id === m.id) ? 'Hapus dari pesan tersimpan' : 'Simpan pesan'} title={savedMessages.some(item => item.message_id === m.id) ? 'Tersimpan' : 'Simpan pesan'}>{savedMessages.some(item => item.message_id === m.id) ? <BookmarkCheck size={13}/> : <Bookmark size={13}/>}</button>{m.sender_id === session.user.id && <span className={m.read_at ? 'message-status is-read' : 'message-status'} title={m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}>{m.delivered_at || m.read_at ? <CheckCheck size={13}/> : <Check size={13}/>}<small>{m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}</small></span>}<button type="button" className="message-menu-trigger" onClick={() => setMessageActionTarget(current => current === m.id ? null : m.id)} aria-label="Menu pesan" aria-expanded={messageActionTarget === m.id}><MoreHorizontal size={16}/></button></div>
                  </div>
                </div>
              ))}
              {!messages.length && (
                <div className="empty-chat">
                  {active.is_saved_chat ? <Bookmark size={34}/> : <MessageCircle size={34}/>}<b>{active.is_saved_chat ? 'Ruang pribadi kamu' : 'Mulai percakapan'}</b>
                  <span>{active.is_saved_chat ? 'Simpan catatan pribadi, foto, video, dan voice note di ruang khusus milik kamu.' : active.is_group ? `Kirim pesan pertama ke ${active.title}.` : `Kirim pesan pertama ke ${active.person.display_name || active.person.username}.`}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            {replyTarget && <div className="reply-composer-preview"><div><b>Membalas {replyTarget.sender_id === session.user.id ? 'pesan sendiri' : (active.person.display_name || active.person.username)}</b><span>{replyTarget.body || 'Pesan'}</span></div><button type="button" onClick={() => setReplyTarget(null)} aria-label="Batal membalas"><X size={17}/></button></div>}
            {attachmentPreview && <div className="atl-chat-attachment-preview"><span>{attachmentFile?.name}</span><button type="button" onClick={() => {setAttachmentFile(null);setAttachmentPreview('');}}>Hapus</button></div>}
            {showChatPolls && active.is_group && <div className="atl-chat-polls-panel"><AtlanticPolls targetType="group" targetId={active.conversation_id} user={session.user} canCreate createOnly e2eeKey={e2eeKeyRef.current} e2eeKeyId={e2eeKeyIdRef.current} onKeyReady={(key, keyId) => { e2eeKeyRef.current = key; e2eeKeyIdRef.current = keyId; }} onCreated={() => setShowChatPolls(false)} onNotice={setNotice}/></div>}
            {showAttachmentMenu && <div className="atl-attachment-menu" role="menu" aria-label="Menu lampiran">
              <button type="button" role="menuitem" onClick={() => pickChatAttachment('image/*')}><ImageIcon className="atl-menu-photo"/><b>Foto</b></button>
              <button type="button" role="menuitem" onClick={() => pickChatAttachment('video/*')}><Video className="atl-menu-video"/><b>Video</b></button>
              <button type="button" role="menuitem" onClick={() => pickChatAttachment('.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx')}><FileText className="atl-menu-document"/><b>Dokumen</b></button>
              <button type="button" role="menuitem" onClick={() => shareCurrentLocation('Lokasi')}><MapPin className="atl-menu-location"/><b>Lokasi</b></button>
              <button type="button" role="menuitem" onClick={() => setNotice('Live Share sedang disiapkan untuk pembaruan lokasi secara langsung.')}><Crosshair className="atl-menu-live"/><b>Live Share</b></button>
              {active.is_group && <button type="button" role="menuitem" onClick={() => { setShowChatPolls(true); setShowAttachmentMenu(false); }}><BarChart3 className="atl-menu-poll"/><b>Polling</b></button>}
              <button type="button" className="atl-attachment-tools" role="menuitem" onClick={() => setNotice('Efek Pesan, Spoiler, dan Jadwal sedang disiapkan.')}><WandSparkles/><b>Efek Pesan, Spoiler &amp; Jadwal</b></button>
            </div>}
            <form className="composer" onSubmit={sendMessage}>
              <input ref={attachmentInputRef} type="file" accept={attachmentAccept} onChange={chooseChatAttachment} hidden />
              <button type="button" className={`atl-chat-attach${showAttachmentMenu ? ' is-active' : ''}`} onClick={() => setShowAttachmentMenu(value => !value)} aria-label="Buka menu lampiran" aria-expanded={showAttachmentMenu}><Plus size={21}/></button>
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
      {messageInfoTarget && <div className="atl-message-info-backdrop" onClick={() => setMessageInfoTarget(null)}><section className="atl-message-info-card" role="dialog" aria-modal="true" aria-label="Info pesan" onClick={event => event.stopPropagation()}><header><b>Info pesan</b><button type="button" onClick={() => setMessageInfoTarget(null)} aria-label="Tutup">×</button></header><dl><dt>Pengirim</dt><dd>{messageInfoTarget.sender_id === session.user.id ? 'Kamu' : (messageInfoTarget.senderProfile?.display_name || messageInfoTarget.senderProfile?.username || 'Anggota')}</dd><dt>Dikirim</dt><dd>{new Date(messageInfoTarget.created_at).toLocaleString('id-ID')}</dd><dt>Status</dt><dd>{messageInfoTarget.read_at ? 'Dibaca' : messageInfoTarget.delivered_at ? 'Terkirim' : 'Dikirim'}</dd><dt>Enkripsi</dt><dd>{messageInfoTarget.is_e2ee ? 'End-to-end encrypted' : 'Pesan lama / belum terenkripsi'}</dd><dt>Lampiran</dt><dd>{messageInfoTarget.media_name || (messageInfoTarget.media_url ? 'Ada lampiran' : 'Tidak ada')}</dd></dl></section></div>}
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
      {groupInfoOpen && active?.is_group && <AtlanticGroupInfo conversationId={active.conversation_id} user={session.user} onClose={() => setGroupInfoOpen(false)} onNotice={setNotice} onUpdated={updated => { setActive(current => current ? {...current,title:updated.title,pinned_message_id:updated.pinned_message_id,person:{...current.person,display_name:updated.title,avatar_url:updated.avatar_signed_url||current.person.avatar_url,is_verified:current.is_verified}} : current); loadProfiles(); }} />}

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
          
