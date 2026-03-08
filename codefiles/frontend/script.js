// ================= SOCKET =================
const socket = io();

// ================= HTML ELEMENTS =================
const loginScreen = document.getElementById("loginScreen");
const meetingScreen = document.getElementById("meetingScreen");
const leaveBtn = document.getElementById("leaveBtn");

const localVideo = document.getElementById("localVideo");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const recordBtn = document.getElementById("recordBtn");

// Chat/Reactions Elements
const toggleChatBtn = document.getElementById("toggleChatBtn");
const closeChatBtn = document.getElementById("closeChatBtn");
const chatPanel = document.getElementById("chatPanel");
const chatNotificationBadge = document.getElementById("chatNotificationBadge");

const reactBtn = document.getElementById("reactBtn");
const reactionMenu = document.getElementById("reactionMenu");

const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");

const videoContainer = document.getElementById("videoContainer");
const callTimer = document.getElementById("callTimer");

let localStream;
let currentRoom = "";
let username = "";
let timerInterval;
let seconds = 0;

// Chat is now open by default!
let isChatPanelOpen = true;

// Media Recorder (Preserved)
let mediaRecorder = null;
let recordedChunks = [];
let recordingAnimation;
let recordingCanvas;

const peerConnections = {};

const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ================= NEW LOGIN LOGIC =================
const createMeetingBtn = document.getElementById("createMeetingBtn");
const joinMeetingBtn = document.getElementById("joinMeetingBtn");
const joinAsHostBtn = document.getElementById("joinAsHostBtn");
const createFormSection = document.getElementById("create-form-section");
const shareInfoSection = document.getElementById("share-info-section");

let generatedRoomId = "";

// Helper to transition into the meeting room
async function proceedToMeeting(userNameInput, roomIdInput) {
    username = userNameInput;
    currentRoom = roomIdInput;

    loginScreen.style.display = "none";
    meetingScreen.style.display = "block";

    startTimer();
    await startMedia();
    socket.emit("join-room", currentRoom);
}

// Helper to generate a random ID
function generateMeetingId() {
    return Math.random().toString(36).substring(2, 11);
}

// --- 1. CREATE MEETING FLOW ---
createMeetingBtn.onclick = () => {
    const name = document.getElementById("createName").value.trim();
    if (!name) { alert("Please enter your name to create a meeting."); return; }

    generatedRoomId = generateMeetingId();
    const link = `${window.location.origin}/?room=${generatedRoomId}`;

    document.getElementById("display-id").textContent = `ID: ${generatedRoomId}`;
    document.getElementById("display-link").textContent = `Link: ${link}`;

    createFormSection.classList.add("hidden");
    shareInfoSection.classList.remove("hidden");
};

// Copy Buttons
document.getElementById("copyIdBtn").onclick = () => {
    navigator.clipboard.writeText(generatedRoomId);
    alert("Meeting ID Copied!");
};

document.getElementById("copyLinkBtn").onclick = () => {
    const link = `${window.location.origin}/?room=${generatedRoomId}`;
    navigator.clipboard.writeText(link);
    alert("Meeting Link Copied!");
};

// Join after creating
joinAsHostBtn.onclick = () => {
    const name = document.getElementById("createName").value.trim();
    proceedToMeeting(name, generatedRoomId);
};

// --- 2. JOIN MEETING FLOW ---
joinMeetingBtn.onclick = () => {
    const name = document.getElementById("joinName").value.trim();
    const roomId = document.getElementById("joinId").value.trim();

    if (!name || !roomId) { alert("Please enter both Meeting ID and Your Name."); return; }
    proceedToMeeting(name, roomId);
};

// Auto-fill Room ID if joining via a shared link (e.g., ?room=xyz123)
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('room')) {
        document.getElementById("joinId").value = urlParams.get('room');
        document.getElementById("joinName").focus();
    }
};

// ================= CHAT UI LOGIC =================

// Send message if Enter is pressed
chatInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") { sendBtn.click(); }
});

// Toggle Chat Panel visibility
toggleChatBtn.onclick = () => {
    isChatPanelOpen = !isChatPanelOpen;

    if(isChatPanelOpen) {
        chatPanel.classList.remove("hidden");
        chatNotificationBadge.classList.add("hidden"); 
        chatInput.focus();

    } else {
        chatPanel.classList.add("hidden");
    }
};

// Close Chat Panel
closeChatBtn.onclick = () => {
    isChatPanelOpen = false;
    chatPanel.classList.add("hidden");
};

// ================= REACTIONS UI LOGIC =================
reactBtn.onclick = () => {
    reactionMenu.classList.toggle("hidden");
};

// Close reaction menu if clicking outside
document.addEventListener("click", function(event) {
    if (!reactBtn.contains(event.target) && !reactionMenu.contains(event.target)) {
        reactionMenu.classList.add("hidden");
    }
});

// Handle Emoji Clicks
document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.onclick = (e) => {
        const emoji = e.target.textContent;
        reactionMenu.classList.add("hidden");
        
        showFloatingEmoji(emoji);
        
        // Send to others via existing chat channel with a special flag
        socket.emit("chat-message", {
            user: username,
   
            text: emoji,
            isReaction: true 
        });
    };
});

function showFloatingEmoji(emoji) {
    const el = document.createElement("div");
    el.className = "floating-emoji";
    el.textContent = emoji;

    el.style.left = `${20 + Math.random() * 20}%`; 
    
    videoContainer.appendChild(el);
    setTimeout(() => el.remove(), 4000);

}

// ================= TIMER LOGIC =================
function startTimer() {
    timerInterval = setInterval(() => {
        seconds++;
        let mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        let secs = String(seconds % 60).padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);

}

// ================= MEDIA SETUP =================
async function startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

// ================= WEBRTC PEER CONNECTION =================
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
            socket.emit("ice-candidate", {
                candidate: event.candidate,
                to: userId
            });

        }
    };

    if (createOffer) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit("offer", {
                    offer: pc.localDescription,
                   
                    to: userId
                });
            });

    }

    return pc;
}

// ================= SOCKET EVENTS =================
socket.on("existing-users", users => {
    users.forEach(userId => {
        createPeerConnection(userId, true);
    });
});

socket.on("offer", async ({ offer, from }) => {

    const pc = createPeerConnection(from);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
        answer: answer,
        to: from
    });
});

socket.on("answer", async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on("ice-candidate", async ({ candidate, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on("user-disconnected", userId => {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    const video = document.getElementById("video-" + userId);
    if (video) video.remove();
});

// ================= CHAT SOCKET LOGIC =================
sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage(username, message);
    socket.emit("chat-message", {
        user: username,
        text: message,
        isReaction: false 
    });

    chatInput.value = "";
};

socket.on("chat-message", data => {
    if (data.isReaction) {
        showFloatingEmoji(data.text);
    } else {
        appendMessage(data.user, data.text);
        
        // Show notification badge if chat is closed
        if (!isChatPanelOpen) {
            chatNotificationBadge.classList.remove("hidden");
        }
    }
});

function appendMessage(user, text) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${user}:</strong> ${text}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;

}

// ================= BOTTOM CONTROLS =================
muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;

    if (audioTrack.enabled) {
        muteBtn.classList.remove("inactive"); muteBtn.classList.add("active");
        muteBtn.querySelector('span').textContent = "Mute";

    } else {
        muteBtn.classList.add("inactive"); muteBtn.classList.remove("active");
        muteBtn.querySelector('span').textContent = "Unmute";
    }
};

cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;

    if (videoTrack.enabled) {
        cameraBtn.classList.remove("inactive"); cameraBtn.classList.add("active");
        cameraBtn.querySelector('span').textContent = "Camera Off";

    } else {
        cameraBtn.classList.add("inactive"); cameraBtn.classList.remove("active");
        cameraBtn.querySelector('span').textContent = "Camera On";
    }
};

leaveBtn.onclick = () => {
    clearInterval(timerInterval);
    location.reload();
};

// ================= RECORDING LOGIC =================
recordBtn.onclick = async () => {

    if (!mediaRecorder) {

        try {

            recordingCanvas = document.createElement("canvas");

            const ctx = recordingCanvas.getContext("2d");

            recordingCanvas.width = 1280;
            recordingCanvas.height = 720;

            function drawFrame() {

                ctx.fillStyle = "black";

                ctx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);

                const videos = document.querySelectorAll("video");
                const videoArray = Array.from(videos);

                const cols = Math.ceil(Math.sqrt(videoArray.length));

                const rows = Math.ceil(videoArray.length / cols);

                const videoWidth = recordingCanvas.width / cols;
                const videoHeight = recordingCanvas.height / rows;

                videoArray.forEach((video, index) => {

                    if (video.readyState >= 2) {

                        const col = index % cols;
                        const row = Math.floor(index / cols);

               
                        ctx.drawImage(
                            video,
                            col * videoWidth,
                            row * videoHeight,
   
                            videoWidth,
                            videoHeight
                        );
                    }
   
                });

                recordingAnimation = requestAnimationFrame(drawFrame);

            }

            drawFrame();

            const canvasStream = recordingCanvas.captureStream(30);

            const audioContext = new AudioContext();
            const destination = audioContext.createMediaStreamDestination();

            const localSource = audioContext.createMediaStreamSource(localStream);
            localSource.connect(destination);

            Object.values(peerConnections).forEach(pc => {
                pc.getReceivers().forEach(receiver => {
                    if (receiver.track && receiver.track.kind === "audio") {
                        const remoteStream = new MediaStream([receiver.track]);
                        const remoteSource 
= audioContext.createMediaStreamSource(remoteStream);
                        remoteSource.connect(destination);
                    }
                });
            });

            const finalStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...destination.stream.getAudioTracks()
            ]);

            mediaRecorder = new MediaRecorder(finalStream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) recordedChunks.push(e.data);

            };

            mediaRecorder.onstop = () => {

                cancelAnimationFrame(recordingAnimation);

                const blob = new Blob(recordedChunks, { type: "video/webm" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;

                a.download = `MeetingRecord_${Date.now()}.webm`;
                a.click();

                URL.revokeObjectURL(url);
            };

            mediaRecorder.start();
            recordBtn.querySelector('span').textContent = "⏹ Stop Record";
            recordBtn.classList.add("recording");

        } catch (err) {
            console.error(err);
            alert("Recording failed.");

        }

    } else {

        mediaRecorder.stop();
        mediaRecorder = null;

        recordBtn.querySelector('span').textContent = "⏺ Record";
        recordBtn.classList.remove("recording");
    }
};