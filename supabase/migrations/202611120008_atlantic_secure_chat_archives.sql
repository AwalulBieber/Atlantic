ALTER TABLE public.archived_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own archived conversations" ON public.archived_conversations;
DROP POLICY IF EXISTS "Users archive own conversations" ON public.archived_conversations;
DROP POLICY IF EXISTS "Users unarchive own conversations" ON public.archived_conversations;
CREATE POLICY "Users read own archived conversations" ON public.archived_conversations
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users archive own conversations" ON public.archived_conversations
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = archived_conversations.conversation_id AND cm.user_id = auth.uid())
);
CREATE POLICY "Users unarchive own conversations" ON public.archived_conversations
FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = archived_conversations.conversation_id AND cm.user_id = auth.uid())
);