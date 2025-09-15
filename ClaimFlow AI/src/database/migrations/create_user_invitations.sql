-- Create user_invitations table for invitation system
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'provider', 'staff', 'readonly')),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  invitation_token UUID NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  accepted_at TIMESTAMP WITH TIME ZONE,
  user_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_practice ON user_invitations(practice_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires ON user_invitations(expires_at);

-- Add RLS policies
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see invitations for their practice
CREATE POLICY "Users can view invitations for their practice" ON user_invitations
  FOR SELECT
  USING (
    practice_id IN (
      SELECT practice_id FROM providers WHERE id = auth.uid()
    )
  );

-- Policy: Only admins can create invitations
CREATE POLICY "Admins can create invitations" ON user_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Policy: Only admins can update invitations
CREATE POLICY "Admins can update invitations" ON user_invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM providers 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_invitations_updated_at
  BEFORE UPDATE ON user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_invitations_updated_at();

-- Add comment
COMMENT ON TABLE user_invitations IS 'Stores user invitation tokens and status for secure user onboarding';