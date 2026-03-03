# ALIA 2.0 - Audio Debugging Guide

## 🎯 Audio Issue: Resolved

The ALIA 2.0 system was triggering lip-sync animation but audio wasn't playing. This has been fixed with comprehensive debugging and autoplay handling.

---

## ✅ What Was Added

### 1. **AudioContext Unlock (Critical Fix)**
- **Problem**: Chrome/Edge block audio until user interacts with the page
- **Solution**: AudioContext is now created and resumed on ANY user interaction (click/keydown)
- **Location**: `unlockAudioContext()` function in [_index.tsx](alia-medical-training/app/routes/_index.tsx#L70-L92)

```typescript
const unlockAudioContext = useCallback(() => {
  if (!audioContextRef.current) {
    audioContextRef.current = new (window.AudioContext || 
      (window as any).webkitAudioContext)();
  }
  
  if (audioContextRef.current.state === 'suspended') {
    audioContextRef.current.resume();
  }
}, []);
```

### 2. **Comprehensive Audio Logging**
Enhanced `playAudio()` function with detailed debugging:
- ✅ Base64 audio length
- ✅ Decoded byte count
- ✅ Blob size verification
- ✅ Audio element state (paused, currentTime, duration, volume, muted, readyState)
- ✅ Detailed error messages with solutions

**Console Output Example:**
```
🔊 [Audio Debug] Starting playback flow...
   ├─ Audio base64 length: 123456
   ├─ Expected duration: 3.2 seconds
   ├─ Decoded audio bytes: 92340
   ├─ Blob created, size: 92340 bytes
   ├─ Object URL created: blob:http://localhost:5174/...
   └─ Audio element state: {
       paused: false,
       currentTime: 0,
       duration: 3.24,
       volume: 0.85,
       muted: false,
       readyState: 4
     }
✅ Audio playing successfully!
```

### 3. **TTS Response Debugging**
Added detailed logging in the WebSocket handler:
```
✅ TTS [450ms]: 3.20s audio
   └─ TTS Response details: {
       isMock: false,
       duration: 3.2,
       audioSize: 123456,
       audioPreview: "UklGRiQAAABXQVZFZm10IBAAAAABAAE..."
     }
```

### 4. **🔊 Test Audio Button**
- **Location**: Top-right header of ALIA interface
- **Function**: Verifies basic audio works independent of TTS pipeline
- **Tests**: 
  - Generates a 440Hz beep (0.5 seconds)
  - Tests audio element with minimal WAV file
  - Logs AudioContext state

### 5. **Automatic Audio Unlock**
The page now listens for ANY user interaction to unlock audio:
```typescript
useEffect(() => {
  const handleInteraction = () => unlockAudioContext();
  
  document.body.addEventListener('click', handleInteraction);
  document.body.addEventListener('keydown', handleInteraction);
  
  return () => {
    // Cleanup listeners
  };
}, [unlockAudioContext]);
```

---

## 🧪 How to Debug Audio Issues

### Step 1: Check Browser Console
Open DevTools (F12) and look for these logs:

**✅ Good:**
```
✅ AudioContext unlocked and resumed
🔊 [Audio Debug] Starting playback flow...
✅ Audio playing successfully!
```

**❌ Bad (Autoplay Blocked):**
```
❌ Audio autoplay blocked or failed: NotAllowedError
   ├─ Error name: NotAllowedError
   ├─ Error message: play() failed...
   └─ AudioContext state: suspended
💡 Solution: Click anywhere on the page first
```

### Step 2: Use the Test Audio Button
1. Click **🔊 Test Audio** in the top-right header
2. You should hear a brief beep
3. Check console for:
   ```
   🧪 Testing basic audio playback...
   ✅ Test beep should play now (440Hz, 0.5s)
   ✅ Audio element test passed
   ```

### Step 3: Verify Browser Settings
- **Tab not muted**: Right-click tab → Unmute site
- **System volume**: Check OS volume mixer
- **Output device**: Verify headphones/speakers connected
- **Browser**: Use Chrome/Edge (best support)

### Step 4: Check TTS Response
When you send a message, look for:
```
✅ TTS [450ms]: 3.20s audio
   └─ TTS Response details: {
       isMock: false,        // Should be false for real audio
       audioSize: 123456,    // Should be > 0
     }
```

If `isMock: true`, the system falls back to browser TTS (speechSynthesis API).

---

## 🔧 Common Issues & Solutions

### Issue 1: "Audio autoplay blocked"
**Cause**: Browser security policy  
**Fix**: Click anywhere on page before starting (now auto-handled)

### Issue 2: "Audio element test failed"
**Cause**: Browser doesn't support audio element  
**Fix**: Update to latest Chrome/Edge

### Issue 3: TTS returns mock audio
**Cause**: NVIDIA API key not configured or API down  
**Fix**: 
1. Check `.env` has `NVIDIA_API_KEY=...`
2. Verify WebSocket server is running: `ws://localhost:3001`
3. Falls back to browser TTS (still works, just different voice)

### Issue 4: Lip-sync works but no sound
**Cause**: Audio pipeline not initialized  
**Fix**: 
1. Click **🔊 Test Audio** button
2. Check console for AudioContext state
3. Ensure audio data is being received (check `audioSize` in logs)

---

## 📊 Audio Pipeline Flow

```
User sends message
      ↓
WebSocket → LLM generates text
      ↓
TTS generates audio (NVIDIA or Browser)
      ↓
Audio2Face generates blendshapes
      ↓
[AUDIO SYSTEM]
      ↓
1. Unlock AudioContext (if suspended)
2. Decode base64 → Uint8Array
3. Create Blob (audio/wav)
4. Create Object URL
5. Set audio.src = URL
6. audio.play()
      ↓
[PARALLEL] Avatar lip-sync animation
```

---

## 🎯 Quick Checklist

Before reporting audio issues:
- [ ] Clicked **🔊 Test Audio** button
- [ ] Checked browser console for errors
- [ ] Verified tab is not muted
- [ ] Confirmed system volume is up
- [ ] Using Chrome or Edge browser
- [ ] WebSocket connected (green indicator)
- [ ] TTS response has `audioSize > 0`

---

## 📝 Code Locations

| Feature | File | Lines |
|---------|------|-------|
| Audio Context Unlock | `app/routes/_index.tsx` | 70-92 |
| Enhanced playAudio() | `app/routes/_index.tsx` | 94-188 |
| TTS Debug Logging | `app/routes/_index.tsx` | 80-97 |
| Test Audio Button | `app/routes/_index.tsx` | 406-425 |
| Auto-unlock Listener | `app/routes/_index.tsx` | 340-357 |

---

## ✨ What's Working Now

1. ✅ Audio unlocks automatically on first user interaction
2. ✅ Comprehensive error messages guide you to fix issues
3. ✅ Test button verifies audio independently
4. ✅ Detailed console logs show every step of audio playback
5. ✅ Automatic fallback to browser TTS if NVIDIA fails
6. ✅ Visual indicators show speaking state
7. ✅ Lip-sync synchronized with audio playback

---

## 🚀 Next Steps

If audio still doesn't work after these fixes:
1. Check DevTools Console for specific error
2. Try the Test Audio button
3. Verify WebSocket connection (green "Connected" indicator)
4. Check `.env` file has correct `NVIDIA_API_KEY`
5. Restart WebSocket server: `node server-websocket.js`

---

**Last Updated**: March 2, 2026  
**Status**: ✅ Audio Debugging Complete
