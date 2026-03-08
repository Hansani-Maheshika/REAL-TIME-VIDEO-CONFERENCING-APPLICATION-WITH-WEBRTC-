// ================= SOCKET =================
const socket = io();

// ================= HTML ELEMENTS =================
// Screens & Panels
const homeScreen = document.getElementById("homeScreen");
const meetingScreen = document.getElementById("meetingScreen");
const chatPanel = document.getElementById("chatPanel");

// Modals
const newMeetingModal = document.getElementById("newMeetingModal");
const joinMeetingModal = document.getElementById("joinMeetingModal");
const copyModal = document.getElementById("copyModal");

// Home Screen Buttons
const showNewMeetingModalBtn = document.getElementById("showNewMeetingModal");
const showJoinModalBtn = document.getElementById("showJoinModal");
const clockTime = document.getElementById("clockTime");
const clockDate = document.getElementById("clockDate");

// Modal Inputs & Actions
const hostNameInput = document.getElementById("hostName");
const joinNameInput = document.getElementById("joinName");
const joinRoomIdInput = document.getElementById("joinRoomId");

// Meeting Controls
const localVideo = document.getElementById("localVideo");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const toggleChatBtn = document.getElementById("toggleChatBtn");
const closeChatBtn = document.getElementById("closeChatBtn");
const reactBtn = document.getElementById("reactBtn");
const reactionMenu = document.getElementById("reactionMenu");
const recordBtn = document.getElementById("recordBtn");
const leaveBtn = document.getElementById("leaveBtn");

// Chat Elements
const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const videoContainer = document.getElementById("videoContainer");

// App settings
const BASE_URL = "https://real-time-video-conferencing-application-18ln.onrender.com/";

let localStream;
let currentRoom = "";
let username = "";
let mediaRecorder = null;
let recordedChunks = [];
let recordingAnimation;
let recordingCanvas;

const peerConnections = {};
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ================= LIVE CLOCK LOGIC =================
function updateClock() {
    const now = new Date();
    clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    clockDate.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ================= MODAL LOGIC =================
// Open Modals
showNewMeetingModalBtn.onclick = () => newMeetingModal.style.display = "flex";
showJoinModalBtn.onclick = () => joinMeetingModal.style.display = "flex";

// Close Modals
document.getElementById("cancelNewBtn").onclick = () => newMeetingModal.style.display = "none";
document.getElementById("cancelJoinBtn").onclick = () => joinMeetingModal.style.display = "none";

// CREATE MEETING
document.getElementById("startNewMeetingBtn").onclick = () => {
    username = hostNameInput.value.trim();
    if (!username) return alert("Please enter your name!");

    newMeetingModal.style.display = "none";
    currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    document.getElementById("generatedLink").value = `${BASE_URL}?room=${currentRoom}`;
    document.getElementById("generatedId").value = currentRoom;
    copyModal.style.display = "flex";
};

// JOIN MEETING
document.getElementById("joinExistingBtn").onclick = () => {
    username = joinNameInput.value.trim();
    currentRoom = joinRoomIdInput.value.trim();

    if (!username || !currentRoom) return alert("Please enter name and ID!");
    
    joinMeetingModal.style.display = "none";
    enterMeeting();
};

// Enter Meeting from Copy Modal
document.getElementById("enterMeetingBtn").onclick = () => {
    copyModal.style.display = "none";
    enterMeeting();
};

// Copy Buttons
document.getElementById("copyLinkBtn").onclick = (e) => {
    navigator.clipboard.writeText(document.getElementById("generatedLink").value);
    e.target.textContent = "Copied!";
};
document.getElementById("copyIdBtn").onclick = (e) => {
    navigator.clipboard.writeText(document.getElementById("generatedId").value);
    e.target.textContent = "Copied!";
};

// ================= ENTER MEETING LOGIC =================
async function enterMeeting() {
    homeScreen.style.display = "none";
    meetingScreen.style.display = "block";

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    
    socket.emit("join-room", currentRoom);
}

// ================= PEER CONNECTION =================
function createPeerConnection(userId, createOffer = false) {
    const pc = new RTCPeerConnection(servers);
    peerConnections[userId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => {
        let remoteVideo = document.getElementById("video-" + userId);
        if (!remoteVideo) {
            remoteVideo = document.createElement("video");
            remoteVideo.id = "video-" + userId;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            videoContainer.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("ice-candidate", { candidate: event.candidate, to: userId });
        }
    };

    if (createOffer) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => socket.emit("offer", { offer: pc.localDescription, to: userId }));
    }
    return pc;
}

// Socket Events
socket.on("existing-users", users => users.forEach(id => createPeerConnection(id, true)));

socket.on("offer", async ({ offer, from }) => {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { answer, to: from });
});

socket.on("answer", async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async ({ candidate, from }) => {
    const pc = peerConnections[from];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("user-disconnected", userId => {
    if (peerConnections[userId]) { peerConnections[userId].close(); delete peerConnections[userId]; }
    const video = document.getElementById("video-" + userId);
    if (video) video.remove();
});

// ================= CHAT & REACTIONS =================
// Toggle Chat
toggleChatBtn.onclick = () => chatPanel.classList.toggle("hidden");
closeChatBtn.onclick = () => chatPanel.classList.add("hidden");

// Send Chat on Enter Key
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
});

sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage(username, message);
    // Send as normal chat message
    socket.emit("chat-message", { user: username, text: message, isReaction: false });
    chatInput.value = "";
};

// Toggle Reaction Menu
reactBtn.onclick = () => reactionMenu.classList.toggle("hidden");

// Send Reaction
document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.onclick = (e) => {
        const emoji = e.target.textContent;
        reactionMenu.classList.add("hidden");
        
        showFloatingReaction(username, emoji);
        // Send as a special reaction message
        socket.emit("chat-message", { user: username, text: emoji, isReaction: true });
    };
});

// Receive Chat/Reaction
socket.on("chat-message", data => {
    if (data.isReaction) {
        showFloatingReaction(data.user, data.text);
    } else {
        appendMessage(data.user, data.text);
        // Auto-open chat if a message is received
        chatPanel.classList.remove("hidden");
    }
});

function appendMessage(user, text) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${user}:</strong> ${text}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

function showFloatingReaction(user, emoji) {
    const reactionDiv = document.createElement("div");
    reactionDiv.className = "floating-reaction";
    reactionDiv.innerHTML = `${emoji} <span style="font-size:12px">${user}</span>`;
    
    // Slight random horizontal position
    reactionDiv.style.left = `${20 + Math.random() * 20}%`;
    videoContainer.appendChild(reactionDiv);
    
    setTimeout(() => reactionDiv.remove(), 3000);
}

// ================= BOTTOM CONTROLS =================
muteBtn.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    muteBtn.innerHTML = track.enabled ? '<span class="icon">🎤</span><br>Mute' : '<span class="icon" style="color:red">🔇</span><br>Unmute';
};

cameraBtn.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    cameraBtn.innerHTML = track.enabled ? '<span class="icon">📷</span><br>Stop Video' : '<span class="icon" style="color:red">🚫</span><br>Start Video';
};

leaveBtn.onclick = () => location.reload();

// ================= RECORDING =================
recordBtn.onclick = async () => {
    if (!mediaRecorder) {
        try {
            recordingCanvas = document.createElement("canvas");
            const ctx = recordingCanvas.getContext("2d");
            recordingCanvas.width = 1280; recordingCanvas.height = 720;

            function drawFrame() {
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
                const videos = document.querySelectorAll("video");
                const cols = Math.ceil(Math.sqrt(videos.length));
                const rows = Math.ceil(videos.length / cols);
                const w = recordingCanvas.width / cols, h = recordingCanvas.height / rows;

                Array.from(videos).forEach((video, i) => {
                    if (video.readyState >= 2) {
                        ctx.drawImage(video, (i % cols) * w, Math.floor(i / cols) * h, w, h);
                    }
                });
                recordingAnimation = requestAnimationFrame(drawFrame);
            }
            drawFrame();

            const canvasStream = recordingCanvas.captureStream(30);
            const audioContext = new AudioContext();
            const destination = audioContext.createMediaStreamDestination();
            audioContext.createMediaStreamSource(localStream).connect(destination);

            Object.values(peerConnections).forEach(pc => {
                pc.getReceivers().forEach(receiver => {
                    if (receiver.track && receiver.track.kind === "audio") {
                        audioContext.createMediaStreamSource(new MediaStream([receiver.track])).connect(destination);
                    }
                });
            });

            const finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
            mediaRecorder = new MediaRecorder(finalStream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                cancelAnimationFrame(recordingAnimation);
                const url = URL.createObjectURL(new Blob(recordedChunks, { type: "video/webm" }));
                const a = document.createElement("a");
                a.href = url; a.download = `Meeting_${Date.now()}.webm`; a.click();
            };
            mediaRecorder.start();
            recordBtn.innerHTML = '<span class="icon" style="color:red">⏹</span><br>Stop';
        } catch (err) { alert("Recording failed."); }
    } else {
        mediaRecorder.stop();
        mediaRecorder = null;
        recordBtn.innerHTML = '<span class="icon">⏺</span><br>Record';
    }
};