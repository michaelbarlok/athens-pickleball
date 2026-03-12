-- ============================================================
-- Migration 007: Notifications
-- Unified in-app notification system with realtime support.
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES shootout_groups(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_recent
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (
    user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (
    user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
