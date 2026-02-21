const socket = io();

const localVideo = document.getElementById("localVideo");
const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");

let localStream;
let currentRoom = "";
const peerConnections = {};

const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Join room
joinBtn.onclick = async () => {
    currentRoom = roomInput.value.trim();
    if (!currentRoom) return;

    await startMedia();
    socket.emit("join-room", currentRoom);
};

// Start camera/mic
async function startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

// Create connection
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
            remoteVideo.width = 300;
            document.body.appendChild(remoteVideo);
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

// Existing users (new user creates offers)
socket.on("existing-users", users => {
    users.forEach(userId => {
        createPeerConnection(userId, true);
    });
});

// When someone joins later (do nothing special)
socket.on("user-connected", userId => {
    console.log("New user joined:", userId);
});

// Receive offer
socket.on("offer", async ({ offer, from }) => {

    const pc = createPeerConnection(from, false);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
        answer: answer,
        to: from
    });
});

// Receive answer
socket.on("answer", async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

// Receive ICE
socket.on("ice-candidate", async ({ candidate, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE error:", err);
        }
    }
});

// Handle disconnect
socket.on("user-disconnected", userId => {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    const video = document.getElementById("video-" + userId);
    if (video) video.remove();
});

// Chat
sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage("Me: " + message);
    socket.emit("chat-message", message);
    chatInput.value = "";
};

socket.on("chat-message", message => {
    addMessage("Friend: " + message);
});

function addMessage(text) {
    const li = document.createElement("li");
    li.textContent = text;
    messages.appendChild(li);
}

// Mute
muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
};

// Camera toggle
cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    cameraBtn.textContent = videoTrack.enabled ? "Camera Off" : "Camera On";
};