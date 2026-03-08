// ================= SOCKET =================
const socket = io();

// ================= HTML ELEMENTS =================
const loginScreen = document.getElementById("loginScreen");
const meetingScreen = document.getElementById("meetingScreen");
const leaveBtn = document.getElementById("leaveBtn");
const recordBtn = document.getElementById("recordBtn");

const localVideo = document.getElementById("localVideo");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const videoContainer = document.getElementById("videoContainer");
const callTimer = document.getElementById("callTimer");

// Login Elements
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

// Modal Elements
const copyModal = document.getElementById("copyModal");
const generatedLinkInput = document.getElementById("generatedLink");
const generatedIdInput = document.getElementById("generatedId");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const copyIdBtn = document.getElementById("copyIdBtn");
const startMeetingBtn = document.getElementById("startMeetingBtn");

// App settings
const BASE_URL = "https://real-time-video-conferencing-application-18ln.onrender.com/";

let localStream;
let currentRoom = "";
let username = "";
let timerInterval;
let seconds = 0;

let mediaRecorder = null;
let recordedChunks = [];
let recordingAnimation;
let recordingCanvas;

const peerConnections = {};

const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ================= LOGIN & MEETING LOGIC =================

// 1. CREATE MEETING (Opens the Copy Modal)
createBtn.onclick = () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter Your Name first!");
        return;
    }

    // Auto-generate a 6-character Meeting ID
    const generatedRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    currentRoom = generatedRoomId;
    
    // Set the link and ID in the modal inputs
    generatedLinkInput.value = `${BASE_URL}?room=${currentRoom}`;
    generatedIdInput.value = currentRoom;
    
    // Display the custom popup modal
    copyModal.style.display = "flex";
};

// Copy Link Logic
copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(generatedLinkInput.value);
    copyLinkBtn.textContent = "Copied!";
    copyLinkBtn.style.background = "#10b981"; // Turn green
    setTimeout(() => {
        copyLinkBtn.textContent = "Copy";
        copyLinkBtn.style.background = "#334155"; // Revert color
    }, 2000);
};

// Copy ID Logic
copyIdBtn.onclick = () => {
    navigator.clipboard.writeText(generatedIdInput.value);
    copyIdBtn.textContent = "Copied!";
    copyIdBtn.style.background = "#10b981"; // Turn green
    setTimeout(() => {
        copyIdBtn.textContent = "Copy";
        copyIdBtn.style.background = "#334155"; // Revert color
    }, 2000);
};

// Start Meeting from Modal
startMeetingBtn.onclick = async () => {
    copyModal.style.display = "none"; // Hide modal
    enterMeeting();
};

// 2. JOIN MEETING
joinBtn.onclick = async () => {
    username = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!username) {
        alert("Please enter Your Name!");
        return;
    }
    if (!roomId) {
        alert("Please enter the Meeting ID provided by the host!");
        return;
    }

    currentRoom = roomId;
    enterMeeting();
};

// 3. HELPER FUNCTION TO START THE CALL
async function enterMeeting() {
    loginScreen.style.display = "none";
    meetingScreen.style.display = "block";

    startTimer();
    await startMedia();
    socket.emit("join-room", currentRoom);
}

// ================= TIMER =================
function startTimer() {
    timerInterval = setInterval(() => {
        seconds++;
        let mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        let secs = String(seconds % 60).padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

// ================= START MEDIA =================
async function startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    localVideo.srcObject = localStream;
    enableVideoZoom(localVideo);
}

// ================= VIDEO ZOOM =================
function enableVideoZoom(videoElement) {
    videoElement.onclick = () => {
        videoElement.classList.toggle("fullscreen-video");
    };
}

// ================= PEER CONNECTION =================
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

            enableVideoZoom(remoteVideo);
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

// ================= CHAT =================
sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage(username, message);
    socket.emit("chat-message", {
        user: username,
        text: message
    });
    chatInput.value = "";
};

socket.on("chat-message", data => {
    appendMessage(data.user, data.text);
});

function appendMessage(user, text) {
    const li = document.createElement("li");
    li.textContent = `${user}: ${text}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

// ================= MUTE =================
muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.textContent = audioTrack.enabled ? "🎤 Mute" : "🔇 Unmute";
};

// ================= CAMERA =================
cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    cameraBtn.textContent = videoTrack.enabled ? "📷 Camera Off" : "📷 Camera On";
};

// ================= INTERNAL MEETING RECORD =================
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

            // local mic
            const localSource = audioContext.createMediaStreamSource(localStream);
            localSource.connect(destination);

            // remote audio
            Object.values(peerConnections).forEach(pc => {
                pc.getReceivers().forEach(receiver => {
                    if (receiver.track && receiver.track.kind === "audio") {
                        const remoteStream = new MediaStream([receiver.track]);
                        const remoteSource = audioContext.createMediaStreamSource(remoteStream);
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
                a.download = `Meeting_${Date.now()}.webm`;
                a.click();

                URL.revokeObjectURL(url);
            };

            mediaRecorder.start();
            recordBtn.textContent = "⏹ Stop Recording";

        } catch (err) {
            console.error(err);
            alert("Recording failed.");
        }

    } else {

        mediaRecorder.stop();
        mediaRecorder = null;
        recordBtn.textContent = "⏺ Record";
    }
};

// ================= LEAVE =================
leaveBtn.onclick = () => {
    clearInterval(timerInterval);
    location.reload();
};