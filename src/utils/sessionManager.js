/**
 * Session Manager
 * Tracks multi-step conversations for split bill flow
 * Stores temporary data before confirmation
 */

class SessionManager {
  constructor() {
    this.sessions = new Map(); // userId -> session data
    this.sessionTimeout = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Create a new session for a user
   */
  createSession(userId, initialData = {}) {
    const session = {
      userId,
      state: initialData.state || 'WAITING_DESCRIPTION',
      createdAt: Date.now(),
      expiresAt: Date.now() + this.sessionTimeout,
      ...initialData
    };

    this.sessions.set(userId, session);
    console.log(`📝 Session created for user ${userId} (state: ${session.state})`);

    // Auto-cleanup after timeout
    setTimeout(() => {
      if (this.sessions.has(userId)) {
        console.log(`⏰ Session timeout for user ${userId}`);
        
        // Clear grace timer if exists
        const session = this.sessions.get(userId);
        if (session?.graceTimerId) {
          clearTimeout(session.graceTimerId);
        }
        
        this.sessions.delete(userId);
      }
    }, this.sessionTimeout);

    return session;
  }

  /**
   * Get active session for a user
   */
  getSession(userId) {
    const session = this.sessions.get(userId);
    
    if (!session) return null;

    // Check expiration
    if (Date.now() > session.expiresAt) {
      console.log(`⏰ Session expired for user ${userId}`);
      this.sessions.delete(userId);
      return null;
    }

    return session;
  }

  /**
   * Update session data
   */
  updateSession(userId, updates) {
    const session = this.getSession(userId);
    if (!session) {
      console.warn(`⚠️  No active session for user ${userId}`);
      return null;
    }

    Object.assign(session, updates);
    console.log(`📝 Session updated for user ${userId}:`, Object.keys(updates));
    return session;
  }

  /**
   * Change session state
   */
  setState(userId, newState) {
    return this.updateSession(userId, { state: newState });
  }

  /**
   * Check if user has active session
   */
  hasSession(userId) {
    return this.getSession(userId) !== null;
  }

  /**
   * Delete session (on completion or cancel)
   */
  deleteSession(userId) {
    const session = this.sessions.get(userId);
    
    // Clear any timers before deleting
    if (session?.graceTimerId) {
      clearTimeout(session.graceTimerId);
    }
    
    const deleted = this.sessions.delete(userId);
    if (deleted) {
      console.log(`🗑️  Session deleted for user ${userId}`);
    }
    return deleted;
  }

  /**
   * Get session by message ID (for reaction/button handling)
   */
  getSessionByMessageId(messageId) {
    for (const [userId, session] of this.sessions.entries()) {
      if (session.confirmationMessageId === messageId || session.pollMessageId === messageId) {
        return { userId, session };
      }
    }
    return null;
  }

  /**
   * Cleanup expired sessions (called periodically)
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }

    return cleaned;
  }

  /**
   * Get session count (for debugging)
   */
  getSessionCount() {
    return this.sessions.size;
  }
}

// Export singleton
export default new SessionManager();
