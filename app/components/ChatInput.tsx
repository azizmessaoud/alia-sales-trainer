/**
 * ALIA 2.0 - Chat Input Component
 * Handles user message input with WebSocket connection
 */

import { useState, useRef, useEffect, type FormEvent } from 'react';

export interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

// Quick response suggestions
const SUGGESTIONS = [
  "Let's practice a pitch",
  "I want to handle objections",
  "Help me with product knowledge",
  "Start a compliance scenario",
];

export function ChatInput({
  onSendMessage,
  isLoading = false,
  disabled = false,
  placeholder = "Type your message or choose a quick action...",
  maxLength = 1000,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [message]);
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    const trimmed = message.trim();
    if (!trimmed || isLoading || disabled) return;
    
    onSendMessage(trimmed);
    setMessage('');
    setShowSuggestions(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  return (
    <div className="chat-input-container" style={{
      backgroundColor: 'rgba(26, 26, 46, 0.95)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      {/* Quick suggestions */}
      {showSuggestions && !message && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px'
        }}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setMessage(suggestion);
                setShowSuggestions(false);
              }}
              disabled={disabled}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: '1px solid rgba(92, 184, 92, 0.5)',
                backgroundColor: 'rgba(92, 184, 92, 0.1)',
                color: '#5cb85c',
                fontSize: '13px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                if (!disabled) {
                  e.currentTarget.style.backgroundColor = 'rgba(92, 184, 92, 0.2)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(92, 184, 92, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '15px',
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            minHeight: '44px',
            maxHeight: '150px',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(92, 184, 92, 0.5)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        />
        
        <button
          type="submit"
          disabled={!message.trim() || isLoading || disabled}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: message.trim() && !isLoading && !disabled 
              ? 'linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%)'
              : 'rgba(255, 255, 255, 0.1)',
            background: message.trim() && !isLoading && !disabled 
              ? 'linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%)'
              : undefined,
            color: message.trim() && !isLoading && !disabled ? '#fff' : 'rgba(255, 255, 255, 0.3)',
            fontSize: '15px',
            fontWeight: '600',
            cursor: message.trim() && !isLoading && !disabled ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          onMouseOver={(e) => {
            if (message.trim() && !isLoading && !disabled) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(92, 184, 92, 0.3)';
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {isLoading ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
              Sending
            </>
          ) : (
            <>
              Send
              <span>→</span>
            </>
          )}
        </button>
      </form>
      
      {/* Character count */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '8px',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.4)'
      }}>
        <span>Press Enter to send, Shift+Enter for new line</span>
        <span>{message.length}/{maxLength}</span>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default ChatInput;
