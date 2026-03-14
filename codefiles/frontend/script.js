// ================= SOCKET =================
const socket = io();

// ================= HTML ELEMENTS =================
const loginScreen = document.getElementById("loginScreen");
const meetingScreen = document.getElementById("meetingScreen");
const leaveBtn = document.getElementById("leaveBtn");

const localVideo = document.getElementById("localVideo");
const localTile = document.getElementById("tile-local");

const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const recordBtn = document.getElementById("recordBtn");
const screenShareBtn = document.getElementById("screenShareBtn");

// Landing Screen Elements
const openCreatePanelBtn = document.getElementById("openCreatePanelBtn");
const openJoinPanelBtn = document.getElementById("openJoinPanelBtn");
const closeCreatePanelBtn = document.getElementById("closeCreatePanelBtn");
const closeJoinPanelBtn = document.getElementById("closeJoinPanelBtn");
const createPanel = document.getElementById("createPanel");
const joinPanel = document.getElementById("joinPanel");

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

// Existing create/join elements
const createMeetingBtn = document.getElementById("createMeetingBtn");
const joinMeetingBtn = document.getElementById("joinMeetingBtn");
const joinAsHostBtn = document.getElementById("joinAsHostBtn");
const createFormSection = document.getElementById("create-form-section");
const shareInfoSection = document.getElementById("share-info-section");

let localStream;
let cameraStream;
let currentRoom = "";
let username = "";
let timerInterval;
let seconds = 0;

let generatedRoomId = "";
let isChatPanelOpen = true;
let isScreenSharing = false;
let pinnedTileId = null;

// Media Recorder (Preserved)
let mediaRecorder = null;
let recordedChunks = [];
let recordingAnimation;
let recordingCanvas;

const peerConnections = {};

const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ================= LANDING UI HELPERS =================
function openCreatePanel() {
    createPanel.classList.remove("hidden");
    joinPanel.classList.add("hidden");
    document.getElementById("createName").focus();
}

function openJoinPanel() {
    joinPanel.classList.remove("hidden");
    createPanel.classList.add("hidden");
    document.getElementById("joinId").focus();
}

function closePanels() {
    createPanel.classList.add("hidden");
    joinPanel.classList.add("hidden");
}

openCreatePanelBtn.onclick = openCreatePanel;
openJoinPanelBtn.onclick = openJoinPanel;
closeCreatePanelBtn.onclick = closePanels;
closeJoinPanelBtn.onclick = closePanels;

// ================= VIDEO TILE / PIN HELPERS =================
function setLocalLabel(extraText = "") {
    const label = localTile.querySelector(".video-label");
    if (!label) return;

    if (username) {
        label.textContent = `${username} (You)${extraText}`;
    } else {
        label.textContent = `You${extraText}`;
    }
}

function getParticipantLabel(userId) {
    return `Guest ${String(userId).slice(0, 5)}`;
}

function setupTileInteractions(tileElement) {
    if (!tileElement) return;

    const pinBtn = tileElement.querySelector(".pin-btn");

    if (pinBtn && !pinBtn.dataset.bound) {
        pinBtn.dataset.bound = "true";

        pinBtn.addEventListener("click", (e) => {
            e.stopPropagation();

            if (pinnedTileId === tileElement.id) {
                clearPinnedView();
            } else {
                pinTile(tileElement.id);
            }
        });
    }
}

function pinTile(tileId) {
    pinnedTileId = tileId;
    videoContainer.classList.add("pin-mode");

    document.querySelectorAll(".video-tile").forEach(tile => {
        const isPinned = tile.id === tileId;
        const pinBtn = tile.querySelector(".pin-btn");

        tile.classList.toggle("pinned", isPinned);
        tile.classList.toggle("hidden-by-pin", !isPinned);

        if (pinBtn) {
            pinBtn.textContent = isPinned ? "📍" : "📌";
            pinBtn.title = isPinned ? "Unpin" : "Pin this screen";
        }
    });
}

function clearPinnedView() {
    pinnedTileId = null;
    videoContainer.classList.remove("pin-mode");

    document.querySelectorAll(".video-tile").forEach(tile => {
        const pinBtn = tile.querySelector(".pin-btn");

        tile.classList.remove("pinned");
        tile.classList.remove("hidden-by-pin");

        if (pinBtn) {
            pinBtn.textContent = "📌";
            pinBtn.title = "Pin this screen";
        }
    });
}

function createRemoteVideoTile(userId) {
    let tile = document.getElementById("tile-" + userId);

    if (!tile) {
        tile = document.createElement("div");
        tile.className = "video-tile";
        tile.id = "tile-" + userId;

        tile.innerHTML = `
            <button class="pin-btn" title="Pin this screen">📌</button>
            <div class="video-label">${getParticipantLabel(userId)}</div>
            <video id="video-${userId}" autoplay playsinline></video>
        `;

        videoContainer.appendChild(tile);
        setupTileInteractions(tile);
    }

    return tile.querySelector("video");
}

setupTileInteractions(localTile);
setLocalLabel();

// ================= NEW LOGIN LOGIC =================
async function proceedToMeeting(userNameInput, roomIdInput) {
    username = userNameInput;
    currentRoom = roomIdInput;

    setLocalLabel();

    loginScreen.style.display = "none";
    meetingScreen.style.display = "block";

    startTimer();
    await startMedia();
    socket.emit("join-room", currentRoom);
}

function generateMeetingId() {
    return Math.random().toString(36).substring(2, 11);
}

// --- CREATE MEETING FLOW ---
createMeetingBtn.onclick = () => {
    const name = document.getElementById("createName").value.trim();
    if (!name) {
        alert("Please enter your name to create a meeting.");
        return;
    }

    generatedRoomId = generateMeetingId();
    const link = `${window.location.origin}/?room=${generatedRoomId}`;

    document.getElementById("display-id").textContent = `ID: ${generatedRoomId}`;
    document.getElementById("display-link").textContent = `Link: ${link}`;

    createFormSection.classList.add("hidden");
    shareInfoSection.classList.remove("hidden");
};

document.getElementById("copyIdBtn").onclick = () => {
    navigator.clipboard.writeText(generatedRoomId);
    alert("Meeting ID Copied!");
};

document.getElementById("copyLinkBtn").onclick = () => {
    const link = `${window.location.origin}/?room=${generatedRoomId}`;
    navigator.clipboard.writeText(link);
    alert("Meeting Link Copied!");
};

joinAsHostBtn.onclick = () => {
    const name = document.getElementById("createName").value.trim();
    proceedToMeeting(name, generatedRoomId);
};

// --- JOIN MEETING FLOW ---
joinMeetingBtn.onclick = () => {
    const name = document.getElementById("joinName").value.trim();
    const roomId = document.getElementById("joinId").value.trim();

    if (!name || !roomId) {
        alert("Please enter both Meeting ID and Your Name.");
        return;
    }

    proceedToMeeting(name, roomId);
};

// Auto-fill Room ID if joining via shared link
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.has("room")) {
        document.getElementById("joinId").value = urlParams.get("room");
        openJoinPanel();
        document.getElementById("joinName").focus();
    }
};

// ================= CHAT UI LOGIC =================
chatInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
        sendBtn.click();
    }
});

toggleChatBtn.onclick = () => {
    isChatPanelOpen = !isChatPanelOpen;

    if (isChatPanelOpen) {
        chatPanel.classList.remove("hidden");
        chatNotificationBadge.classList.add("hidden");
        chatInput.focus();
    } else {
        chatPanel.classList.add("hidden");
    }
};

closeChatBtn.onclick = () => {
    isChatPanelOpen = false;
    chatPanel.classList.add("hidden");
};

// ================= REACTIONS UI LOGIC =================
reactBtn.onclick = () => {
    reactionMenu.classList.toggle("hidden");
};

document.addEventListener("click", function (event) {
    if (!reactBtn.contains(event.target) && !reactionMenu.contains(event.target)) {
        reactionMenu.classList.add("hidden");
    }
});

document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.onclick = (e) => {
        const emoji = e.target.textContent;
        reactionMenu.classList.add("hidden");

        showFloatingEmoji(emoji);

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
        const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
        const secs = String(seconds % 60).padStart(2, "0");
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

// ================= MEDIA SETUP =================
async function startMedia() {
    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localStream = new MediaStream(cameraStream.getTracks());
    localVideo.srcObject = localStream;
    setLocalLabel();
}

// ================= SCREEN SHARE =================
function replaceOutgoingVideoTrack(newTrack) {
    Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender) {
            sender.replaceTrack(newTrack);
        }
    });
}

function updateScreenShareButton(active) {
    if (active) {
        screenShareBtn.classList.add("sharing");
        screenShareBtn.querySelector("span").textContent = "Stop Share";
    } else {
        screenShareBtn.classList.remove("sharing");
        screenShareBtn.querySelector("span").textContent = "Share Screen";
    }
}

async function startScreenShare() {
    try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
        });

        const screenTrack = displayStream.getVideoTracks()[0];
        const currentVideoTrack = localStream.getVideoTracks()[0];

        if (currentVideoTrack) {
            localStream.removeTrack(currentVideoTrack);
        }

        localStream.addTrack(screenTrack);
        localVideo.srcObject = localStream;
        replaceOutgoingVideoTrack(screenTrack);

        isScreenSharing = true;
        updateScreenShareButton(true);
        setLocalLabel(" • Sharing Screen");

        screenTrack.onended = () => {
            if (isScreenSharing) {
                stopScreenShare();
            }
        };
    } catch (err) {
        console.error(err);
        alert("Screen sharing was cancelled or failed.");
    }
}

function stopScreenShare() {
    if (!isScreenSharing) return;

    const currentVideoTrack = localStream.getVideoTracks()[0];

    if (currentVideoTrack) {
        localStream.removeTrack(currentVideoTrack);

        if (currentVideoTrack.readyState !== "ended") {
            currentVideoTrack.stop();
        }
    }

    const cameraTrack = cameraStream.getVideoTracks()[0];

    if (cameraTrack) {
        localStream.addTrack(cameraTrack);
        localVideo.srcObject = localStream;
        replaceOutgoingVideoTrack(cameraTrack);
    }

    isScreenSharing = false;
    updateScreenShareButton(false);
    setLocalLabel();
}

screenShareBtn.onclick = async () => {
    if (!isScreenSharing) {
        await startScreenShare();
    } else {
        stopScreenShare();
    }
};

// ================= WEBRTC PEER CONNECTION =================
function createPeerConnection(userId, createOffer = false) {
    const pc = new RTCPeerConnection(servers);
    peerConnections[userId] = pc;

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = event => {
        const remoteVideo = createRemoteVideoTile(userId);
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

    const tile = document.getElementById("tile-" + userId);
    if (tile) {
        if (pinnedTileId === tile.id) {
            clearPinnedView();
        }
        tile.remove();
    }
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
        muteBtn.classList.remove("inactive");
        muteBtn.classList.add("active");
        muteBtn.querySelector("span").textContent = "Mute";
    } else {
        muteBtn.classList.add("inactive");
        muteBtn.classList.remove("active");
        muteBtn.querySelector("span").textContent = "Unmute";
    }
};

cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;

    if (videoTrack.enabled) {
        cameraBtn.classList.remove("inactive");
        cameraBtn.classList.add("active");
        cameraBtn.querySelector("span").textContent = "Camera Off";
    } else {
        cameraBtn.classList.add("inactive");
        cameraBtn.classList.remove("active");
        cameraBtn.querySelector("span").textContent = "Camera On";
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
                a.download = `MeetingRecord_${Date.now()}.webm`;
                a.click();

                URL.revokeObjectURL(url);
            };

            mediaRecorder.start();
            recordBtn.querySelector("span").textContent = "⏹ Stop Record";
            recordBtn.classList.add("recording");

        } catch (err) {
            console.error(err);
            alert("Recording failed.");
        }

    } else {
        mediaRecorder.stop();
        mediaRecorder = null;

        recordBtn.querySelector("span").textContent = "⏺ Record";
        recordBtn.classList.remove("recording");
    }
};