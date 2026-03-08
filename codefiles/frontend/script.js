// ================= SOCKET =================
const socket = io();

// ================= HTML ELEMENTS (Refactored to match target) =================
// Screen containers
const loginScreen = document.getElementById("loginScreen");
const meetingScreen = document.getElementById("meetingScreen");
const dashboardMain = document.querySelector(".dashboard-main");

// Login/Dashboard Input
const usernameInput = document.getElementById("username");

// Action Buttons
const newMeetingBtn = document.getElementById("newMeetingBtn");
const joinMeetingBtn = document.getElementById("joinMeetingBtn");

// Modals
const modalContainer = document.getElementById("modalContainer");
const joinModal = document.getElementById("joinModal");
const copyModal = document.getElementById("copyModal");
const joinRoomIdInput = document.getElementById("joinRoomId");

// Copy details modal specific
const generatedLinkInput = document.getElementById("generatedLink");
const generatedIdInput = document.getElementById("generatedId");

// Local video area
const videoContainer = document.getElementById("videoContainer");
const localVideo = document.getElementById("localVideo");
const callTimer = document.getElementById("callTimer");

// Control Bar Buttons
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");
const recordBtn = document.getElementById("recordBtn");
const toggleChatBtn = document.getElementById("toggleChatBtn");

// Chat area
const chatPanel = document.querySelector(".chat-panel");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("sendBtn");

// Base URL for link generation (IMPORTANT: adapt to your server)
const BASE_URL = window.location.origin;

let localStream;
let currentRoom = "";
let username = "";
let timerInterval;
let seconds = 0;

// Media Recorder (Preserved)
let mediaRecorder = null;
let recordedChunks = [];
let recordingAnimation;
let recordingCanvas;

const peerConnections = {};
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ================= LOGIN & ACTION LOGIC (Refactored) =================

// Host: Automatic Link/ID generation flow
newMeetingBtn.onclick = () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter Your Name first!");
        usernameInput.focus();
        return;
    }

    // Auto-generate a 10-character Meeting ID
    const generatedRoomId = Math.random().toString(36).substring(2, 12).toUpperCase();
    currentRoom = generatedRoomId;
    
    // Set the link and ID in the modal inputs
    generatedLinkInput.value = `${BASE_URL}?room=${currentRoom}`;
    generatedIdInput.value = currentRoom;
    
    // Display the custom popup modal
    modalContainer.classList.remove("hidden");
    copyModal.classList.remove("hidden");
    joinModal.classList.add("hidden"); // Ensure other modal is closed
};

// Copy detail functionality (link)
document.getElementById("copyLinkBtn").onclick = () => {
    navigator.clipboard.writeText(generatedLinkInput.value);
    document.getElementById("copyLinkBtn").textContent = "Copied!";
    setTimeout(() => document.getElementById("copyLinkBtn").textContent = "Copy link", 2000);
};

// Copy detail functionality (ID)
document.getElementById("copyIdBtn").onclick = () => {
    navigator.clipboard.writeText(generatedIdInput.value);
    document.getElementById("copyIdBtn").textContent = "Copied!";
    setTimeout(() => document.getElementById("copyIdBtn").textContent = "Copy ID", 2000);
};

// Confirm Start (after copying)
document.getElementById("startMeetingBtn").onclick = () => {
    modalContainer.classList.add("hidden");
    copyModal.classList.add("hidden");
    proceedToMeeting();
};


// Participant: Manual Join flow
joinMeetingBtn.onclick = () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter Your Name first!");
        usernameInput.focus();
        return;
    }
    
    // Check if RoomID was automatically filled from URL param
    if (currentRoom === "") {
        // Open the join modal to ask for ID
        modalContainer.classList.remove("hidden");
        joinModal.classList.remove("hidden");
        copyModal.classList.add("hidden"); // Ensure other modal is closed
        joinRoomIdInput.focus();
    } else {
        // ID was already in URL, proceed immediately
        proceedToMeeting();
    }
};

// Confirm manual join
document.getElementById("confirmJoinBtn").onclick = () => {
    const roomIdInput = joinRoomIdInput.value.trim();
    if (!roomIdInput) {
        alert("Please enter the Meeting ID!");
        return;
    }
    currentRoom = roomIdInput;
    modalContainer.classList.add("hidden");
    joinModal.classList.add("hidden");
    proceedToMeeting();
};

// Cancel manual join
document.getElementById("cancelJoinBtn").onclick = () => {
    modalContainer.classList.add("hidden");
    joinModal.classList.add("hidden");
};


// HELPER: Proceed to meeting function (Starts audio/video and connects)
async function proceedToMeeting() {
    if (!username || !currentRoom) return;

    loginScreen.style.display = "none";
    meetingScreen.style.display = "block";

    startTimer();
    await startMedia();
    socket.emit("join-room", currentRoom);
}

// ================= LIVE CLOCK LOGIC =================
function updateClock() {
    const now = new Date();
    document.getElementById("clockTime").textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("clockDate").textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
// Start the loop
setInterval(updateClock, 1000);
updateClock(); // Run once immediately

// ================= TIMER LOGIC (Preserved) =================
function startTimer() {
    timerInterval = setInterval(() => {
        seconds++;
        let mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        let secs = String(seconds % 60).padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

// ================= MEDIA SETUP (Preserved) =================
async function startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    localVideo.srcObject = localStream;
}

// ================= WEBRTC PEER CONNECTION (Preserved Logic, style adapt) =================
function createPeerConnection(userId, createOffer = false) {
    const pc = new RTCPeerConnection(servers);
    peerConnections[userId] = pc;

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

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
            .then(() => {
                socket.emit("offer", { offer: pc.localDescription, to: userId });
            });
    }
    return pc;
}

// ================= SOCKET EVENTS (Preserved) =================
socket.on("existing-users", users => users.forEach(id => createPeerConnection(id, true)));

socket.on("offer", async ({ offer, from }) => {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { answer: answer, to: from });
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

// ================= CHAT LOGIC (Preserved, Updated toggle) =================
toggleChatBtn.onclick = () => {
    chatPanel.classList.toggle("hidden");
    toggleChatBtn.classList.toggle("active");
};

// Cause enter to send chat
chatInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") sendBtn.click();
});

sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (!message) return;
    appendMessage(username, message);
    socket.emit("chat-message", { user: username, text: message });
    chatInput.value = "";
};

socket.on("chat-message", data => appendMessage(data.user, data.text));

function appendMessage(user, text) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${user}:</strong> ${text}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

// ================= BOTTOM CONTROLS (Preserved, updated style triggers) =================
muteBtn.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    if (track.enabled) {
        muteBtn.classList.remove("inactive"); muteBtn.classList.add("active");
        muteBtn.querySelector('span').innerHTML = '🎤<br>Mute';
    } else {
        muteBtn.classList.add("inactive"); muteBtn.classList.remove("active");
        muteBtn.querySelector('span').innerHTML = '🔇<br>Unmute';
    }
};

cameraBtn.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    if (track.enabled) {
        cameraBtn.classList.remove("inactive"); cameraBtn.classList.add("active");
        cameraBtn.querySelector('span').innerHTML = '📷<br>Camera Off';
    } else {
        cameraBtn.classList.add("inactive"); cameraBtn.classList.remove("active");
        cameraBtn.querySelector('span').innerHTML = '🚫<br>Camera On';
    }
};

leaveBtn.onclick = () => { clearInterval(timerInterval); location.reload(); };

// ================= RECORDING LOGIC (Preserved) =================
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
                const cols = Math.ceil(Math.sqrt(videos.length)), rows = Math.ceil(videos.length / cols);
                const w = recordingCanvas.width / cols, h = recordingCanvas.height / rows;

                Array.from(videos).forEach((video, i) => {
                    if (video.readyState >= 2) ctx.drawImage(video, (i % cols) * w, Math.floor(i / cols) * h, w, h);
                });
                recordingAnimation = requestAnimationFrame(drawFrame);
            }
            drawFrame();

            const canvasStream = recordingCanvas.captureStream(30);
            const audioContext = new AudioContext(), destination = audioContext.createMediaStreamDestination();
            audioContext.createMediaStreamSource(localStream).connect(destination);
            Object.values(peerConnections).forEach(pc => pc.getReceivers().forEach(r => {
                if (r.track && r.track.kind === "audio") audioContext.createMediaStreamSource(new MediaStream([r.track])).connect(destination);
            }));

            const finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
            mediaRecorder = new MediaRecorder(finalStream); recordedChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                cancelAnimationFrame(recordingAnimation);
                const url = URL.createObjectURL(new Blob(recordedChunks, { type: "video/webm" }));
                const a = document.createElement("a"); a.href = url; a.download = `MeetingRecord_${Date.now()}.webm`; a.click();
            };
            mediaRecorder.start();
            recordBtn.querySelector('span').innerHTML = '⏹<br>Stop Record'; recordBtn.classList.add("recording");
        } catch (err) { alert("Recording failed."); }
    } else {
        mediaRecorder.stop(); mediaRecorder = null;
        recordBtn.querySelector('span').innerHTML = '⏺<br>Record'; recordBtn.classList.remove("recording");
    }
};

// Check for existing room parameter on load (Preserved Feature)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) {
    currentRoom = urlParams.get('room');
    // We don't need a roomInput anymore, we'll store it in the currentRoom variable.
}