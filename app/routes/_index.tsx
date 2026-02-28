/**
 * ALIA 2.0 - Main Training Interface
 * Complete chat-based training with 3D avatar
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { Avatar } from '~/components/Avatar';
import { ChatInput } from '~/components/ChatInput';
import { SessionHUD, type SessionMetrics } from '~/components/SessionHUD';

export const meta: MetaFunction = () => {
  return [
    { title: 'ALIA 2.0 - Medical Sales Training' },
    { name: 'description', content: 'AI-Powered Medical Sales Training with Real-time Coaching' },
  ];
};

// WebSocket connection
const WS_URL = 'ws://localhost:3001';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Index() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visemes, setVisemes] = useState<{ time: number; viseme: string }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [metrics, setMetrics] = useState<SessionMetrics>({
    accuracy: 0,
    compliance: 0,
    confidence: 0,
    clarity: 0,
  });
  const [sessionStatus, setSessionStatus] = useState<'active' | 'paused' | 'completed'>('active');
  
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  
  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('[WS] Connected to ALIA server');
      setIsConnected(true);
      
      // Start session
      ws.send(JSON.stringify({
        type: 'start_session',
        payload: {
          rep_id: 'demo-rep',
          session_id: sessionId,
        },
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'avatar_response':
            setIsSpeaking(true);
            setVisemes(data.payload.visemes || []);
            setMetrics(data.payload.metrics || metrics);
            
            // Add assistant message
            setMessages((prev) => [...prev, {
              id: data.payload.message_id,
              role: 'assistant',
              content: data.payload.content,
              timestamp: new Date(),
            }]);
            
            // Stop speaking after estimated duration
            setTimeout(() => setIsSpeaking(false), data.payload.content.length * 30);
            break;
            
          case 'message_received':
            setIsLoading(false);
            break;
            
          case 'metrics_updated':
            setMetrics(data.payload);
            break;
            
          case 'error':
            console.error('[WS] Error:', data.payload.message);
            setIsLoading(false);
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };
    
    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setIsConnected(false);
    };
    
    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
    
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end_session', payload: { session_id: sessionId } }));
        ws.close();
      }
    };
  }, [sessionId]);
  
  // Send message handler
  const handleSendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[WS] Not connected');
      return;
    }
    
    // Add user message immediately
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }]);
    
    setIsLoading(true);
    
    // Send to server
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      payload: {
        session_id: sessionId,
        message: content,
      },
    }));
  }, [sessionId]);
  
  // Session controls
  const handlePause = () => setSessionStatus('paused');
  const handleResume = () => setSessionStatus('active');
  const handleEnd = () => {
    setSessionStatus('completed');
    // Show summary
    alert(`Session Complete!\n\nMetrics:\n- Accuracy: ${metrics.accuracy.toFixed(0)}%\n- Compliance: ${metrics.compliance.toFixed(0)}%\n- Confidence: ${metrics.confidence.toFixed(0)}%\n- Clarity: ${metrics.clarity.toFixed(0)}%`);
  };
  
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
            <span style={{ color: '#5cb85c' }}>ALIA</span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}> 2.0</span>
          </h1>
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: isConnected ? 'rgba(92, 184, 92, 0.2)' : 'rgba(217, 83, 79, 0.2)',
            color: isConnected ? '#5cb85c' : '#d9534f',
            fontSize: '12px',
          }}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
            Medical Sales Training
          </span>
        </div>
      </header>
      
      {/* Main Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 360px',
        gap: '24px',
        padding: '24px',
        maxWidth: '1600px',
        margin: '0 auto',
      }}>
        {/* Left Panel - Session HUD */}
        <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
          <SessionHUD
            metrics={metrics}
            sessionId={sessionId}
            repName="Demo Rep"
            duration={0}
            status={sessionStatus}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
          />
          
          {/* Quick Stats */}
          <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              💡 Training Tips
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
              <li style={{ marginBottom: '8px' }}>Practice handling objections</li>
              <li style={{ marginBottom: '8px' }}>Review product contraindications</li>
              <li style={{ marginBottom: '8px' }}>Focus on compliance best practices</li>
              <li>Ask about drug interactions</li>
            </ul>
          </div>
        </div>
        
        {/* Center - Avatar & Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Avatar */}
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            minHeight: '400px',
          }}>
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>ALIA Assistant</span>
              <span style={{
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: isSpeaking ? 'rgba(92, 184, 92, 0.2)' : 'rgba(255,255,255,0.1)',
                color: isSpeaking ? '#5cb85c' : 'rgba(255,255,255,0.5)',
                fontSize: '12px',
              }}>
                {isSpeaking ? '● Speaking' : '○ Idle'}
              </span>
            </div>
            <div style={{ height: '400px' }}>
              <Avatar
                visemes={visemes}
                isSpeaking={isSpeaking}
                emotion={metrics.confidence > 70 ? 'happy' : metrics.confidence > 50 ? 'neutral' : 'thinking'}
              />
            </div>
          </div>
          
          {/* Chat Area */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(26, 26, 46, 0.95)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '16px',
              overflowY: 'auto',
              maxHeight: '300px',
              minHeight: '200px',
            }}>
              {messages.length === 0 ? (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '16px', marginBottom: '8px' }}>
                    👋 Welcome to ALIA 2.0!
                  </p>
                  <p style={{ fontSize: '14px', maxWidth: '300px' }}>
                    Start a conversation to begin your medical sales training session.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{
                        maxWidth: '80%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: msg.role === 'user'
                          ? 'linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%)'
                          : 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '14px',
                        lineHeight: '1.5',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '14px',
                      }}>
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Input */}
            <ChatInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              disabled={!isConnected || sessionStatus !== 'active'}
              placeholder={sessionStatus === 'active' 
                ? "Type your message or choose a quick action..." 
                : "Session paused"}
            />
          </div>
        </div>
        
        {/* Right Panel - Memory Context */}
        <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              🧠 Memory Context
            </h3>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              <p style={{ marginBottom: '12px' }}>
                Recent conversations will appear here to help ALIA provide personalized responses.
              </p>
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                marginTop: '12px',
              }}>
                <strong style={{ color: '#5cb85c' }}>Session Memory:</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                  {messages.length} messages in this session
                </p>
              </div>
            </div>
          </div>
          
          {/* Compliance Status */}
          <div style={{
            marginTop: '16px',
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              ✅ Compliance Status
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: metrics.compliance >= 80 ? '#5cb85c' : metrics.compliance >= 60 ? '#f0ad4e' : '#d9534f',
              fontSize: '14px',
            }}>
              <span style={{ fontSize: '20px' }}>
                {metrics.compliance >= 80 ? '✓' : metrics.compliance >= 60 ? '!' : '✗'}
              </span>
              <span>{metrics.compliance >= 80 ? 'All Clear' : metrics.compliance >= 60 ? 'Warnings' : 'Issues'}</span>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              FDA guidelines being monitored
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
